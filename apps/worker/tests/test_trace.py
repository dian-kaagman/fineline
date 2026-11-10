"""Tracing pixel maps into strokes (design step 3)."""

import cv2
import numpy as np
import pytest

from fineline_worker import params
from fineline_worker.strokes import join_near_ends, polyline_length
from fineline_worker.trace import tone_exclusion, trace_edges, trace_tone


def blank(size: int = 200) -> np.ndarray:
    return np.zeros((size, size), dtype=np.uint8)


@pytest.mark.parametrize("length", [10, 57, 150])
def test_straight_one_pixel_line_traces_to_one_stroke_of_its_length(length: int) -> None:
    edges = blank()
    edges[100, 20 : 20 + length] = 255
    strokes = trace_edges(edges)
    assert len(strokes) == 1
    assert polyline_length(strokes[0]) == pytest.approx(length - 1)


def test_diagonal_and_curved_edges_are_drawn_once() -> None:
    edges = blank()
    cv2.line(edges, (10, 10), (150, 90), 255, 1)
    cv2.ellipse(edges, (100, 140), (60, 30), 0, 0, 180, 255, 1)
    edge_pixels = int(np.count_nonzero(edges))
    traced = sum(polyline_length(s) for s in trace_edges(edges))
    # Each pixel is visited once: the traced length is at most about the number of pixels
    # (diagonal steps count 1.41), never the ~2x of an out-and-back contour.
    assert traced < edge_pixels * 1.3


def test_branching_edges_stay_connected_and_join_into_few_strokes() -> None:
    edges = blank()
    cv2.line(edges, (20, 100), (180, 100), 255, 1)
    cv2.line(edges, (100, 100), (100, 20), 255, 1)
    strokes = trace_edges(edges)
    total = sum(polyline_length(s) for s in strokes)
    assert total == pytest.approx(160 + 80, rel=0.03)
    assert len(join_near_ends(strokes, params.JOIN_GAP_PX)) <= 2


def test_closed_edge_loop_is_traced_once() -> None:
    edges = blank()
    cv2.circle(edges, (100, 100), 50, 255, 1)
    strokes = join_near_ends(trace_edges(edges), params.JOIN_GAP_PX)
    assert len(strokes) == 1
    assert polyline_length(strokes[0]) == pytest.approx(2 * np.pi * 50, rel=0.1)


def test_tone_contour_of_an_all_dark_image_draws_no_frame() -> None:
    mask = np.full((200, 300), 255, dtype=np.uint8)
    assert trace_tone(mask, tone_exclusion(np.zeros_like(mask))) == []


def test_tone_contour_keeps_inner_shapes_and_drops_border_segments() -> None:
    mask = np.zeros((200, 300), dtype=np.uint8)
    mask[:, :150] = 255  # dark left half touches three borders
    cv2.circle(mask, (230, 100), 30, 255, -1)  # dark spot in the middle of the right half
    strokes = trace_tone(mask, tone_exclusion(np.zeros_like(mask)))
    border = params.TONE_BORDER_PX
    for stroke in strokes:
        assert stroke[:, 0].min() >= border
        assert stroke[:, 0].max() < 300 - border
        assert stroke[:, 1].min() >= border
        assert stroke[:, 1].max() < 200 - border
    lengths = sorted(polyline_length(s) for s in strokes)
    assert len(strokes) == 2
    assert lengths[0] == pytest.approx(200 - 2 * border, abs=3)  # the vertical boundary
    assert lengths[1] == pytest.approx(2 * np.pi * 30, rel=0.15)  # the spot, closed


def test_tone_contour_next_to_an_edge_is_not_drawn_twice() -> None:
    mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.circle(mask, (100, 100), 50, 255, -1)
    edges = np.zeros_like(mask)
    cv2.circle(edges, (100, 100), 51, 255, 1)
    assert trace_tone(mask, tone_exclusion(edges)) == []
