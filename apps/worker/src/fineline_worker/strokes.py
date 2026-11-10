"""Stroke clean-up: simplification, joining near ends, filtering and pen-travel ordering."""

import math

import cv2
import numpy as np
import numpy.typing as npt

Polyline = npt.NDArray[np.float64]


def polyline_length(polyline: Polyline) -> float:
    if len(polyline) < 2:
        return 0.0
    return float(np.sum(np.hypot(*np.diff(polyline, axis=0).T)))


def polyline_lengths(polylines: list[Polyline]) -> npt.NDArray[np.float64]:
    """Lengths of many polylines in one vectorised pass (no Python loop per point)."""
    if not polylines:
        return np.zeros(0)
    sizes = np.fromiter((len(p) for p in polylines), dtype=np.int64, count=len(polylines))
    points = np.concatenate(polylines)
    steps = np.zeros(len(points))
    steps[1:] = np.hypot(*np.diff(points, axis=0).T)
    starts = np.cumsum(sizes) - sizes
    steps[starts] = 0.0  # the step into the first point of a polyline belongs to no polyline
    totals = np.cumsum(steps)
    return np.asarray(totals[starts + sizes - 1] - totals[starts], dtype=np.float64)


def simplify(polyline: Polyline, epsilon: float) -> Polyline:
    """Ramer-Douglas-Peucker simplification of an open polyline."""
    if len(polyline) < 3:
        return polyline
    curve = polyline.astype(np.float32).reshape(-1, 1, 2)
    simplified = cv2.approxPolyDP(curve, epsilon, False)
    return np.asarray(simplified, dtype=np.float64).reshape(-1, 2)


def drop_shorter_than(polylines: list[Polyline], min_length: float) -> list[Polyline]:
    lengths = polyline_lengths(polylines)
    return [p for p, length in zip(polylines, lengths, strict=True) if length >= min_length]


def join_near_ends(polylines: list[Polyline], max_gap: float) -> list[Polyline]:
    """Chain strokes whose ends are at most `max_gap` apart into one stroke.

    Greedy and deterministic: the longest strokes are extended first, at the tail and then at
    the head, always with the nearest free end. A chain whose own ends meet is closed.
    """
    if not polylines:
        return []
    cell = max(max_gap, 1e-6)
    grid: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for index, polyline in enumerate(polylines):
        for end in (0, 1):
            x, y = polyline[-end]
            grid.setdefault((math.floor(x / cell), math.floor(y / cell)), []).append((index, end))

    used = [False] * len(polylines)

    def take_nearest(point: npt.NDArray[np.float64]) -> tuple[int, int] | None:
        cx, cy = math.floor(point[0] / cell), math.floor(point[1] / cell)
        best: tuple[int, int] | None = None
        best_distance = max_gap
        for gx in (cx - 1, cx, cx + 1):
            for gy in (cy - 1, cy, cy + 1):
                for index, end in grid.get((gx, gy), ()):
                    if used[index]:
                        continue
                    other = polylines[index][-end]
                    distance = math.hypot(other[0] - point[0], other[1] - point[1])
                    if distance <= best_distance and (best is None or distance < best_distance):
                        best, best_distance = (index, end), distance
        if best is not None:
            used[best[0]] = True
        return best

    order = np.argsort(-polyline_lengths(polylines), kind="stable").tolist()
    joined: list[Polyline] = []
    for index in order:
        if used[index]:
            continue
        used[index] = True
        parts = [polylines[index]]
        while (found := take_nearest(parts[-1][-1])) is not None:
            other, end = found
            # end 0: the other stroke's start is near our tail, so it continues forwards.
            parts.append(polylines[other] if end == 0 else polylines[other][::-1])
        while (found := take_nearest(parts[0][0])) is not None:
            other, end = found
            # end 1: the other stroke's end is near our head, so it comes before us as is.
            parts.insert(0, polylines[other] if end == 1 else polylines[other][::-1])
        chain = np.concatenate(parts)
        head, tail = chain[0], chain[-1]
        if len(chain) > 2 and 0 < math.hypot(*(tail - head)) <= max_gap:
            chain = np.vstack([chain, chain[:1]])
        joined.append(chain)
    return joined


def order_for_pen(polylines: list[Polyline]) -> list[Polyline]:
    """Greedy nearest-neighbour order from the top-left corner, reversing strokes as needed."""
    if not polylines:
        return []
    starts = np.array([p[0] for p in polylines])
    ends = np.array([p[-1] for p in polylines])
    remaining = np.ones(len(polylines), dtype=bool)
    position = np.zeros(2)
    ordered: list[Polyline] = []
    for _ in range(len(polylines)):
        to_start = np.hypot(*(starts - position).T)
        to_end = np.hypot(*(ends - position).T)
        to_start[~remaining] = np.inf
        to_end[~remaining] = np.inf
        nearest_start = int(np.argmin(to_start))
        nearest_end = int(np.argmin(to_end))
        if to_start[nearest_start] <= to_end[nearest_end]:
            chosen, polyline = nearest_start, polylines[nearest_start]
        else:
            chosen, polyline = nearest_end, polylines[nearest_end][::-1]
        remaining[chosen] = False
        ordered.append(polyline)
        position = polyline[-1]
    return ordered
