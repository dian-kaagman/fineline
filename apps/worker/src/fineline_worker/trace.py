"""Tracing pixel maps into polylines (in working-image pixels, float64 x/y)."""

import math

import cv2
import numpy as np
import numpy.typing as npt

from fineline_worker import params

Polyline = npt.NDArray[np.float64]


def trace_edges(edges: npt.NDArray[np.uint8]) -> list[Polyline]:
    """Trace a 1-pixel edge map into open polylines, each edge pixel drawn once.

    findContours walks around a 1-pixel line out and back, so every edge would be drawn twice.
    Walking all contours in order, only the first visit of each pixel is kept; each run of
    newly visited pixels becomes a polyline, starting at the already-drawn pixel it branches
    from so branches stay connected.
    """
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return []
    points = np.concatenate([c.reshape(-1, 2) for c in contours]).astype(np.int64)
    contour_ids = np.repeat(np.arange(len(contours)), [len(c) for c in contours])

    width = edges.shape[1]
    pixel_ids = points[:, 1] * width + points[:, 0]
    _, first_visits = np.unique(pixel_ids, return_index=True)
    new = np.zeros(len(points), dtype=bool)
    new[first_visits] = True

    same_contour_as_previous = np.zeros(len(points), dtype=bool)
    same_contour_as_previous[1:] = contour_ids[1:] == contour_ids[:-1]
    previous_new = np.zeros(len(points), dtype=bool)
    previous_new[1:] = new[:-1]
    run_starts = np.flatnonzero(new & ~(previous_new & same_contour_as_previous))
    run_ends = np.flatnonzero(new & ~np.append(new[1:] & same_contour_as_previous[1:], False))

    first_points = np.where(
        (run_starts > 0) & same_contour_as_previous[run_starts], run_starts - 1, run_starts
    )
    # Run lengths in one pass, so the many tiny runs of a busy photo never reach Python.
    steps = np.zeros(len(points))
    steps[1:] = np.hypot(*np.diff(points, axis=0).T)
    walked = np.cumsum(steps)
    lengths = walked[run_ends] - walked[first_points]
    keep = np.flatnonzero(lengths >= params.MIN_FRAGMENT_PX)
    as_float = points.astype(np.float64)
    return [as_float[first_points[i] : run_ends[i] + 1] for i in keep]


def tone_exclusion(edges: npt.NDArray[np.uint8]) -> npt.NDArray[np.bool_]:
    """Where tone contours are not drawn: along the image border and right next to an edge.

    The border strip stops a dark background from drawing a frame around the picture; the
    clearance around edges stops an outline from being drawn twice (edge and tone contour).
    """
    excluded = np.zeros(edges.shape, dtype=bool)
    clearance = params.TONE_EDGE_CLEARANCE_PX
    if clearance > 0:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (2 * clearance + 1, 2 * clearance + 1)
        )
        excluded = cv2.dilate(edges, kernel) > 0
    border = params.TONE_BORDER_PX
    excluded[:border, :] = True
    excluded[-border:, :] = True
    excluded[:, :border] = True
    excluded[:, -border:] = True
    return excluded


def trace_tone(
    mask: npt.NDArray[np.uint8], excluded: npt.NDArray[np.bool_], min_length: float
) -> list[Polyline]:
    """Trace the outlines of a tone mask, leaving out the points in `excluded`.

    Outlines with too few points to ever reach `min_length` (small blobs) are skipped unseen.
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    min_points = max(2, int(min_length / math.sqrt(2)))
    polylines: list[Polyline] = []
    for contour in contours:
        if len(contour) < min_points:
            continue
        points = contour.reshape(-1, 2).astype(np.int64)
        inside = ~excluded[points[:, 1], points[:, 0]]
        if inside.all():
            polylines.append(np.vstack([points, points[:1]]).astype(np.float64))
            continue
        if not inside.any():
            continue
        # Rotate so the contour starts outside; the inside parts are then the odd segments.
        shift = int(np.argmin(inside))
        points = np.roll(points, -shift, axis=0)
        inside = np.roll(inside, -shift)
        cuts = np.flatnonzero(np.diff(inside.astype(np.int8))) + 1
        for segment in np.split(points, cuts)[1::2]:
            if len(segment) >= 2:
                polylines.append(segment.astype(np.float64))
    return polylines
