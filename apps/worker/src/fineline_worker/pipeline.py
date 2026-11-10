"""Photo to drawing: the budget loop around extraction, tracing, clean-up and SVG writing."""

import time
from dataclasses import dataclass

import numpy as np

from fineline_worker import params
from fineline_worker.decode import decode_photo
from fineline_worker.errors import NoDrawableContent
from fineline_worker.extract import GrayImage, PreparedImage, edge_map, prepare, tone_mask
from fineline_worker.strokes import (
    Polyline,
    drop_shorter_than,
    join_near_ends,
    order_for_pen,
    polyline_length,
    simplify,
)
from fineline_worker.svg import DrawingArea, Fit, to_area, write_svg
from fineline_worker.trace import tone_exclusion, trace_edges, trace_tone


@dataclass(frozen=True)
class StrokeBudget:
    max_strokes: int
    max_total_length_mm: float


@dataclass(frozen=True)
class ConversionRequest:
    area: DrawingArea
    budget: StrokeBudget
    min_short_side_px: int = params.DEFAULT_MIN_SHORT_SIDE_PX


@dataclass(frozen=True)
class Drawing:
    svg: str
    width_mm: float
    height_mm: float
    stroke_count: int
    total_length_mm: float


@dataclass(frozen=True)
class ConversionStats:
    """Sizes and timings only: safe to log (SR-018)."""

    working_width_px: int
    working_height_px: int
    detail_level: int
    strokes_dropped_by_guarantee: int
    decode_ms: int
    total_ms: int


@dataclass(frozen=True)
class ConversionResult:
    drawing: Drawing
    stats: ConversionStats


def convert_photo(data: bytes, request: ConversionRequest) -> ConversionResult:
    started = time.perf_counter()
    gray = decode_photo(data, request.min_short_side_px)
    decoded = time.perf_counter()
    result = draw(gray, request)
    finished = time.perf_counter()
    stats = ConversionStats(
        working_width_px=gray.shape[1],
        working_height_px=gray.shape[0],
        detail_level=result.detail_level,
        strokes_dropped_by_guarantee=result.dropped,
        decode_ms=round((decoded - started) * 1000),
        total_ms=round((finished - started) * 1000),
    )
    return ConversionResult(drawing=result.drawing, stats=stats)


@dataclass(frozen=True)
class _DrawResult:
    drawing: Drawing
    detail_level: int
    dropped: int


def draw(gray: GrayImage, request: ConversionRequest) -> _DrawResult:
    """Turn a grayscale working image into a drawing within the area and budget (BR-002..004)."""
    area = DrawingArea(round(request.area.width_mm, 2), round(request.area.height_mm, 2))
    fit = Fit.centred(gray.shape[1], gray.shape[0], area)
    length_limit = request.budget.max_total_length_mm - params.LENGTH_SAFETY_MARGIN_MM
    prepared = prepare(gray)

    strokes: list[Polyline] = []
    level_index = 0
    for level_index, level in enumerate(params.DETAIL_LEVELS):
        strokes = to_area(extract_strokes(prepared, level), fit, area)
        lengths = [polyline_length(s) for s in strokes]
        if level_index == 0 and _no_drawable_content(lengths):
            raise NoDrawableContent("The photo yields no usable lines")
        if len(strokes) <= request.budget.max_strokes and sum(lengths) <= length_limit:
            break

    kept = _within_budget(strokes, request.budget.max_strokes, length_limit)
    if not kept:
        raise NoDrawableContent("No line of the photo fits the stroke budget")
    ordered = order_for_pen(kept)
    total = sum(polyline_length(s) for s in ordered)
    drawing = Drawing(
        svg=write_svg(ordered, area),
        width_mm=area.width_mm,
        height_mm=area.height_mm,
        stroke_count=len(ordered),
        total_length_mm=round(total, 2),
    )
    return _DrawResult(drawing=drawing, detail_level=level_index, dropped=len(strokes) - len(kept))


def extract_strokes(prepared: PreparedImage, level: params.DetailLevel) -> list[Polyline]:
    """All strokes of one detail level, in working-image pixels."""
    edges = edge_map(prepared, level.canny_multiplier)
    raw = trace_edges(edges)
    if level.tone_levels:
        excluded = tone_exclusion(edges)
        for tone_level in level.tone_levels:
            raw.extend(trace_tone(tone_mask(prepared, tone_level), excluded))
    simplified = [simplify(p, level.simplify_epsilon_px) for p in raw]
    fragments = drop_shorter_than(simplified, params.MIN_FRAGMENT_PX)
    joined = join_near_ends(fragments, params.JOIN_GAP_PX)
    return drop_shorter_than(joined, level.min_stroke_length_px)


def _no_drawable_content(lengths: list[float]) -> bool:
    return len(lengths) < params.NO_CONTENT_MIN_STROKES or (
        sum(lengths) < params.NO_CONTENT_MIN_LENGTH_MM
    )


def _within_budget(
    strokes: list[Polyline], max_strokes: int, length_limit: float
) -> list[Polyline]:
    """Final guarantee: keep the longest strokes that fit, dropping the shortest ones."""
    lengths = np.array([polyline_length(s) for s in strokes])
    kept_indices: list[int] = []
    total = 0.0
    for index in np.argsort(-lengths, kind="stable"):
        if len(kept_indices) == max_strokes:
            break
        if total + lengths[index] <= length_limit:
            kept_indices.append(int(index))
            total += float(lengths[index])
    # Keep the original order so the pen order below starts from the same input every time.
    return [strokes[i] for i in sorted(kept_indices)]
