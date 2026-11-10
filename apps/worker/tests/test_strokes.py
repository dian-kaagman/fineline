"""Stroke clean-up (design step 4)."""

import numpy as np
import pytest

from fineline_worker.strokes import (
    drop_shorter_than,
    join_near_ends,
    order_for_pen,
    polyline_length,
    simplify,
)


def line(*points: tuple[float, float]) -> np.ndarray:
    return np.array(points, dtype=np.float64)


def test_simplify_removes_points_on_a_straight_line() -> None:
    straight = line(*[(x, 2.0) for x in range(50)])
    simplified = simplify(straight, 1.0)
    assert simplified.tolist() == [[0.0, 2.0], [49.0, 2.0]]


def test_short_strokes_are_dropped() -> None:
    strokes = [line((0, 0), (3, 0)), line((0, 0), (30, 0))]
    assert [polyline_length(s) for s in drop_shorter_than(strokes, 10)] == [30]


def test_strokes_with_ends_close_together_are_joined_in_either_direction() -> None:
    a = line((0, 0), (10, 0))
    b = line((22, 0), (12, 0))  # reversed, its end 2 px from a's end
    c = line((40, 40), (60, 40))  # far away
    joined = join_near_ends([a, b, c], max_gap=3)
    assert len(joined) == 2
    assert sorted(len(s) for s in joined) == [2, 4]
    four = next(s for s in joined if len(s) == 4)
    assert polyline_length(four) == pytest.approx(22)


def test_pen_order_starts_near_the_origin_and_reverses_strokes_to_travel_less() -> None:
    far = line((100, 100), (110, 100))
    near = line((5, 0), (1, 0))
    middle = line((50, 50), (12, 2))
    ordered = order_for_pen([far, near, middle])
    assert ordered[0].tolist() == [[1, 0], [5, 0]]
    assert ordered[1].tolist() == [[12, 2], [50, 50]]
    assert ordered[2].tolist() == [[100, 100], [110, 100]]
