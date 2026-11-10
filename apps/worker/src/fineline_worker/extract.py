"""Line extraction: brightness range, contrast equalisation, smoothing, edge map and tone masks."""

from dataclasses import dataclass

import cv2
import numpy as np
import numpy.typing as npt

from fineline_worker import params

GrayImage = npt.NDArray[np.uint8]


@dataclass(frozen=True)
class PreparedImage:
    """The working image after the steps that do not depend on the detail level."""

    smooth: GrayImage
    tone: GrayImage
    median: float


@dataclass(frozen=True)
class EdgeEstimate:
    """A cheap preview of a detail level: edge pieces long enough to become strokes."""

    strokes: int
    length_px: float


def stretch_brightness(gray: GrayImage) -> GrayImage:
    """Spread the photo's own brightness range over 0-255 (faded or dark photos get contrast).

    The gain is capped so the noise of a nearly uniform photo is not blown up into lines.
    """
    low, high = np.percentile(gray, [params.STRETCH_LOW_PERCENTILE, params.STRETCH_HIGH_PERCENTILE])
    spread = float(high - low)
    if spread <= 0:
        return gray
    gain = min(params.STRETCH_MAX_GAIN, 255.0 / spread)
    middle = (float(low) + float(high)) / 2
    table = np.clip((np.arange(256) - middle) * gain + 127.5, 0, 255).astype(np.uint8)
    return np.asarray(cv2.LUT(gray, table), dtype=np.uint8)


def prepare(gray: GrayImage) -> PreparedImage:
    clahe = cv2.createCLAHE(
        clipLimit=params.CLAHE_CLIP_LIMIT,
        tileGridSize=(params.CLAHE_TILE_GRID, params.CLAHE_TILE_GRID),
    )
    equalised = clahe.apply(stretch_brightness(gray))
    smooth = cv2.bilateralFilter(
        equalised,
        params.BILATERAL_DIAMETER_PX,
        params.BILATERAL_SIGMA_COLOR,
        params.BILATERAL_SIGMA_SPACE,
    )
    tone = cv2.GaussianBlur(equalised, (0, 0), params.TONE_BLUR_SIGMA_PX)
    return PreparedImage(
        smooth=np.asarray(smooth, dtype=np.uint8),
        tone=np.asarray(tone, dtype=np.uint8),
        median=float(np.median(smooth)),
    )


def edge_map(prepared: PreparedImage, canny_multiplier: float) -> GrayImage:
    low = _clamp(
        (1.0 - params.CANNY_SIGMA) * prepared.median, params.CANNY_MIN_LOW, params.CANNY_MAX_LOW
    )
    high = _clamp(
        (1.0 + params.CANNY_SIGMA) * prepared.median, params.CANNY_MIN_HIGH, params.CANNY_MAX_HIGH
    )
    edges = cv2.Canny(
        prepared.smooth, low * canny_multiplier, high * canny_multiplier, L2gradient=True
    )
    return np.asarray(edges, dtype=np.uint8)


def estimate_edges(edges: GrayImage, min_stroke_length_px: float) -> EdgeEstimate:
    """Count connected edge pieces of at least the minimum stroke length (pixels ~ length)."""
    _, _, stats, _ = cv2.connectedComponentsWithStats(edges, connectivity=8)
    areas = stats[1:, cv2.CC_STAT_AREA]
    long_enough = areas >= min_stroke_length_px
    return EdgeEstimate(strokes=int(long_enough.sum()), length_px=float(areas[long_enough].sum()))


def tone_thresholds(prepared: PreparedImage, percentiles: tuple[int, ...]) -> list[int]:
    """Brightness levels at the photo's own darkness percentiles.

    A level is skipped unless it is clearly darker than the median, so nearly uniform photos
    (and noise) don't get shading loops.
    """
    if not percentiles:
        return []
    values = np.percentile(prepared.tone, [*percentiles, 50])
    median = float(values[-1])
    return [
        round(float(value))
        for value in values[:-1]
        if median - float(value) >= params.TONE_MIN_CONTRAST
    ]


def tone_mask(prepared: PreparedImage, level: int) -> GrayImage:
    """Pixels darker than `level` in the blurred image (255 inside, 0 outside)."""
    return np.where(prepared.tone < level, 255, 0).astype(np.uint8)


def _clamp(value: float, lowest: float, highest: float) -> float:
    return min(max(value, lowest), highest)
