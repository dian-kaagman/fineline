"""Line extraction: contrast equalisation, smoothing, edge map and tone masks."""

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


def prepare(gray: GrayImage) -> PreparedImage:
    clahe = cv2.createCLAHE(
        clipLimit=params.CLAHE_CLIP_LIMIT,
        tileGridSize=(params.CLAHE_TILE_GRID, params.CLAHE_TILE_GRID),
    )
    equalised = clahe.apply(gray)
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


def tone_mask(prepared: PreparedImage, level: int) -> GrayImage:
    """Pixels darker than `level` in the blurred image (255 inside, 0 outside)."""
    return np.where(prepared.tone < level, 255, 0).astype(np.uint8)


def _clamp(value: float, lowest: float, highest: float) -> float:
    return min(max(value, lowest), highest)
