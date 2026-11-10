"""Fitting strokes into the drawing area and writing the SVG (BR-002, BR-003)."""

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from fineline_worker import params

Polyline = npt.NDArray[np.float64]


@dataclass(frozen=True)
class DrawingArea:
    width_mm: float
    height_mm: float


@dataclass(frozen=True)
class Fit:
    """Uniform scale and offset from working-image pixels to millimetres in the area."""

    scale: float
    offset_x: float
    offset_y: float

    @classmethod
    def centred(cls, image_width: int, image_height: int, area: DrawingArea) -> "Fit":
        scale = min(area.width_mm / image_width, area.height_mm / image_height)
        return cls(
            scale=scale,
            offset_x=(area.width_mm - image_width * scale) / 2,
            offset_y=(area.height_mm - image_height * scale) / 2,
        )


def to_area(polylines: list[Polyline], fit: Fit, area: DrawingArea) -> list[Polyline]:
    """Map pixel polylines to millimetres, rounded to the output precision and clamped to the area.

    Pixel centres are used (x + 0.5), so the drawing stays half a pixel inside the area edge.
    Repeated points after rounding are removed; strokes left with one point are dropped.
    """
    result: list[Polyline] = []
    upper = np.array([area.width_mm, area.height_mm])
    offset = np.array([fit.offset_x, fit.offset_y])
    for polyline in polylines:
        mm = np.round((polyline + 0.5) * fit.scale + offset, params.COORDINATE_DECIMALS)
        mm = np.clip(mm, 0.0, upper)
        moved = np.ones(len(mm), dtype=bool)
        moved[1:] = np.any(np.diff(mm, axis=0) != 0, axis=1)
        mm = mm[moved]
        if len(mm) >= 2:
            result.append(mm)
    return result


def format_number(value: float) -> str:
    text = f"{value:.{params.COORDINATE_DECIMALS}f}".rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


def path_data(polyline: Polyline) -> str:
    commands = [f"M{format_number(polyline[0][0])} {format_number(polyline[0][1])}"]
    commands.extend(f"L{format_number(x)} {format_number(y)}" for x, y in polyline[1:])
    return " ".join(commands)


def write_svg(polylines: list[Polyline], area: DrawingArea) -> str:
    """One unfilled black path per stroke; the root is exactly the drawing area in mm."""
    width, height = format_number(area.width_mm), format_number(area.height_mm)
    stroke_attributes = (
        f'fill="none" stroke="#000" stroke-width="{format_number(params.STROKE_WIDTH_MM)}" '
        'stroke-linecap="round" stroke-linejoin="round"'
    )
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'width="{width}mm" height="{height}mm" viewBox="0 0 {width} {height}">'
    ]
    lines.extend(f'<path d="{path_data(p)}" {stroke_attributes}/>' for p in polylines)
    lines.append("</svg>")
    return "\n".join(lines) + "\n"
