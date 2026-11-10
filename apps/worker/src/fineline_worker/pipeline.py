"""Photo to drawing: the budget loop around extraction, tracing, clean-up and SVG writing."""

import math
import time
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from fineline_worker import params
from fineline_worker.decode import decode_photo
from fineline_worker.errors import NoDrawableContent
from fineline_worker.extract import (
    GrayImage,
    PreparedImage,
    edge_map,
    estimate_edges,
    prepare,
    tone_mask,
    tone_thresholds,
)
from fineline_worker.strokes import (
    Polyline,
    drop_shorter_than,
    join_near_ends,
    order_for_pen,
    polyline_lengths,
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
    area = DrawingArea(_floor_mm(request.area.width_mm), _floor_mm(request.area.height_mm))
    fit = Fit.centred(gray.shape[1], gray.shape[0], area)
    budget = request.budget
    length_limit = budget.max_total_length_mm - params.LENGTH_SAFETY_MARGIN_MM
    prepared = prepare(gray)
    levels = params.DETAIL_LEVELS
    last = len(levels) - 1
    traced: dict[int, list[Polyline] | None] = {}

    def strokes_at(index: int) -> list[Polyline] | None:
        """The level's strokes in mm; None for a middle level with too many pieces to clean up.

        The finest and the coarsest level always give strokes (their longest pieces at most).
        """
        pixels = extract_strokes(prepared, levels[index], force=index in (0, last))
        traced[index] = None if pixels is None else to_area(pixels, fit, area)
        return traced[index]

    def fits(strokes: list[Polyline]) -> bool:
        return len(strokes) <= budget.max_strokes and (
            float(polyline_lengths(strokes).sum()) <= length_limit
        )

    # The finest level is always traced: the no-content rule (AC-008) is judged on it.
    finest = strokes_at(0) or []
    if _no_drawable_content(polyline_lengths(finest)):
        raise NoDrawableContent("The photo yields no usable lines")

    # Budget loop: coarser levels until the drawing fits. A level that comes out empty ends the
    # loop; the last level that had strokes is then trimmed by the final guarantee instead.
    chosen = 0
    if not fits(finest):
        for index in range(_first_coarser_level(prepared, fit, budget, length_limit), len(levels)):
            strokes = strokes_at(index)
            if strokes is None:
                continue
            if not strokes:
                break
            chosen = index
            if fits(strokes):
                break
    strokes = traced[chosen] or []
    kept = _within_budget(strokes, budget.max_strokes, length_limit)
    if not kept:
        raise NoDrawableContent("No line of the photo fits the stroke budget")
    ordered = order_for_pen(kept)
    total = float(polyline_lengths(ordered).sum())
    drawing = Drawing(
        svg=write_svg(ordered, area),
        width_mm=area.width_mm,
        height_mm=area.height_mm,
        stroke_count=len(ordered),
        total_length_mm=round(total, 2),
    )
    return _DrawResult(drawing=drawing, detail_level=chosen, dropped=len(strokes) - len(kept))


def _floor_mm(value: float) -> float:
    """Round down to 0.01 mm, so the drawing is never larger than the requested area."""
    return math.floor(round(value * 100, 6)) / 100


def _first_coarser_level(
    prepared: PreparedImage, fit: Fit, budget: StrokeBudget, length_limit: float
) -> int:
    """The first coarser level worth tracing: skips levels whose edge preview is far over budget.

    Tracing and cleaning up a level costs far more than previewing it, so busy photos (noise,
    gravel, crowds) jump straight to a level near the budget instead of tracing every level.
    """
    factor = params.SKIP_LEVEL_OVER_BUDGET_FACTOR
    levels = params.DETAIL_LEVELS
    for index in range(1, len(levels) - 1):
        level = levels[index]
        estimate = estimate_edges(
            edge_map(prepared, level.canny_multiplier), level.min_stroke_length_px
        )
        length_mm = estimate.length_px * fit.scale
        if estimate.strokes <= factor * budget.max_strokes and length_mm <= factor * length_limit:
            return index
    return len(levels) - 1


def extract_strokes(
    prepared: PreparedImage, level: params.DetailLevel, *, force: bool = False
) -> list[Polyline] | None:
    """All strokes of one detail level, in working-image pixels.

    Returns None when the level has more than MAX_FRAGMENTS_PER_LEVEL pieces, unless `force`,
    in which case only the longest pieces are cleaned up.
    """
    edges = edge_map(prepared, level.canny_multiplier)
    raw = trace_edges(edges)
    thresholds = tone_thresholds(prepared, level.tone_percentiles)
    if thresholds:
        excluded = tone_exclusion(edges)
        for threshold in thresholds:
            raw.extend(
                trace_tone(tone_mask(prepared, threshold), excluded, level.min_stroke_length_px)
            )
    if len(raw) > params.MAX_FRAGMENTS_PER_LEVEL:
        if not force:
            return None
        by_length = np.argsort(-polyline_lengths(raw), kind="stable")
        raw = [raw[i] for i in sorted(by_length[: params.MAX_FRAGMENTS_PER_LEVEL].tolist())]
    simplified = [simplify(p, level.simplify_epsilon_px) for p in raw]
    fragments = drop_shorter_than(simplified, params.MIN_FRAGMENT_PX)
    joined = join_near_ends(fragments, params.JOIN_GAP_PX)
    return drop_shorter_than(joined, level.min_stroke_length_px)


def _no_drawable_content(lengths: npt.NDArray[np.float64]) -> bool:
    return len(lengths) < params.NO_CONTENT_MIN_STROKES or (
        float(lengths.sum()) < params.NO_CONTENT_MIN_LENGTH_MM
    )


def _within_budget(
    strokes: list[Polyline], max_strokes: int, length_limit: float
) -> list[Polyline]:
    """Final guarantee: keep the longest strokes that fit, dropping the shortest ones."""
    lengths = polyline_lengths(strokes)
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
