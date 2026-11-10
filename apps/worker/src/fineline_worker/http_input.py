"""Parsing and validating the multipart body of POST /v1/convert."""

from dataclasses import dataclass
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.datastructures import UploadFile
from starlette.exceptions import HTTPException
from starlette.requests import Request

from fineline_worker import params
from fineline_worker.errors import ValidationFailed
from fineline_worker.pipeline import ConversionRequest, StrokeBudget
from fineline_worker.svg import DrawingArea

PHOTO_FIELD = "photo"
MAX_FIELD_BYTES = 1024
MAX_AREA_SIDE_MM = 5000.0

PositiveMm = Annotated[float, Field(gt=0, le=MAX_AREA_SIDE_MM, allow_inf_nan=False)]


class ConvertFields(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    area_width_mm: PositiveMm = Field(alias="areaWidthMm")
    area_height_mm: PositiveMm = Field(alias="areaHeightMm")
    max_strokes: int = Field(alias="maxStrokes", ge=1, le=100_000)
    max_total_length_mm: float = Field(
        alias="maxTotalLengthMm", gt=0, le=10_000_000, allow_inf_nan=False
    )
    min_short_side_px: int = Field(
        alias="minShortSidePx", default=params.DEFAULT_MIN_SHORT_SIDE_PX, ge=1, le=20_000
    )


@dataclass(frozen=True)
class ConvertInput:
    photo: bytes
    request: ConversionRequest


async def read_convert_input(request: Request) -> ConvertInput:
    try:
        form = await request.form(max_files=1, max_fields=10, max_part_size=MAX_FIELD_BYTES)
    except HTTPException as error:
        # Starlette turns malformed multipart bodies and exceeded part limits into a 400.
        raise ValidationFailed("The request body is not a valid multipart form") from error
    try:
        photos: list[UploadFile] = []
        fields: dict[str, str] = {}
        for name, value in form.multi_items():
            if name == PHOTO_FIELD and isinstance(value, UploadFile):
                photos.append(value)
            elif name == PHOTO_FIELD or isinstance(value, UploadFile):
                raise ValidationFailed(f"Field {name!r} has the wrong type")
            elif name in fields:
                raise ValidationFailed(f"Field {name!r} is given more than once")
            else:
                fields[name] = value
        if len(photos) != 1:
            raise ValidationFailed("Exactly one photo file is required")
        parsed = _parse_fields(fields)
        photo = await photos[0].read()
    finally:
        await form.close()

    return ConvertInput(
        photo=photo,
        request=ConversionRequest(
            area=DrawingArea(parsed.area_width_mm, parsed.area_height_mm),
            budget=StrokeBudget(parsed.max_strokes, parsed.max_total_length_mm),
            min_short_side_px=parsed.min_short_side_px,
        ),
    )


def _parse_fields(fields: dict[str, str]) -> ConvertFields:
    try:
        return ConvertFields.model_validate(fields)
    except ValidationError as error:
        # Name the fields and rules, never the submitted values.
        problems = "; ".join(
            f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}"
            for issue in error.errors(include_input=False, include_url=False)
        )
        raise ValidationFailed(f"Invalid parameters: {problems}") from error
