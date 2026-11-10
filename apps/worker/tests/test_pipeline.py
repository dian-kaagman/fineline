"""The conversion without HTTP: drawing format, area, budget and no-content rule."""

import re
import socket
from collections.abc import Callable
from functools import cache
from typing import Any

import cv2
import numpy as np
import pytest

from fineline_worker import params
from fineline_worker.decode import decode_photo
from fineline_worker.errors import NoDrawableContent
from fineline_worker.extract import prepare
from fineline_worker.pipeline import (
    ConversionRequest,
    StrokeBudget,
    convert_photo,
    extract_strokes,
)
from fineline_worker.strokes import polyline_lengths
from fineline_worker.svg import DrawingArea, Fit
from tests import images
from tests.conftest import portrait_jpeg
from tests.svg_check import check_drawing

DEFAULT = ConversionRequest(DrawingArea(180, 267), StrokeBudget(1500, 25_000))


@cache
def crowd_jpeg() -> bytes:
    return images.jpeg(images.busy_texture(2400, 1800))


def check(request: ConversionRequest, photo: bytes) -> None:
    drawing = convert_photo(photo, request).drawing
    measured = check_drawing(
        drawing.svg,
        width_mm=request.area.width_mm,
        height_mm=request.area.height_mm,
        max_strokes=request.budget.max_strokes,
        max_total_length_mm=request.budget.max_total_length_mm,
    )
    assert (drawing.width_mm, drawing.height_mm) == (request.area.width_mm, request.area.height_mm)
    assert drawing.stroke_count == measured.stroke_count
    assert drawing.total_length_mm == pytest.approx(measured.total_length_mm, abs=0.01)


def test_ac005_portrait_becomes_a_plottable_drawing_in_the_default_area() -> None:
    check(DEFAULT, portrait_jpeg())


def test_ac005_landscape_photo_is_a_band_across_the_middle_of_the_area() -> None:
    fit = Fit.centred(1000, 750, DrawingArea(180, 267))
    assert fit.scale == pytest.approx(0.18)
    assert (fit.offset_x, fit.offset_y) == pytest.approx((0.0, (267 - 135) / 2))


@pytest.mark.parametrize(
    ("width", "height"),
    [(100.0, 100.0), (300.5, 120.25), (180.0, 267.0)],
)
def test_ac005_landscape_photo_fits_any_configured_area(width: float, height: float) -> None:
    landscape = images.jpeg(images.synthetic_portrait(1600, 1000))
    check(ConversionRequest(DrawingArea(width, height), StrokeBudget(1500, 25_000)), landscape)


def test_ac006_crowd_photo_is_simplified_to_fit_the_default_budget() -> None:
    first_trace = extract_strokes(prepare(decode_photo(crowd_jpeg(), 800)), params.DETAIL_LEVELS[0])
    assert first_trace is not None
    assert len(first_trace) > 1500, "fixture must bust the budget on its first trace"
    check(DEFAULT, crowd_jpeg())


def test_ac006_budget_is_met_by_coarsening_not_by_dropping_strokes() -> None:
    stats = convert_photo(crowd_jpeg(), DEFAULT).stats
    assert stats.detail_level > 0
    assert stats.strokes_dropped_by_guarantee == 0


def test_ac006_strokes_shorter_than_the_level_minimum_are_dropped() -> None:
    result = convert_photo(portrait_jpeg(), DEFAULT)
    level = params.DETAIL_LEVELS[result.stats.detail_level]
    scale = Fit.centred(result.stats.working_width_px, result.stats.working_height_px, DEFAULT.area)
    shortest_mm = level.min_stroke_length_px * scale.scale
    lengths = svg_stroke_lengths(result.drawing.svg)
    # Rounding to 0.01 mm may shorten a stroke by a hair, never by much.
    assert min(lengths) >= shortest_mm - 0.05


def test_ac006_empty_coarser_level_falls_back_to_trimming_a_finer_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Worker review finding 7: a coarser level with no lines used to answer 422.
    finest = params.DETAIL_LEVELS[0]
    no_lines = params.DetailLevel(1000.0, (), 3.0, 56.0)
    monkeypatch.setattr(params, "DETAIL_LEVELS", (finest, no_lines, no_lines))
    request = ConversionRequest(DrawingArea(180, 267), StrokeBudget(3, 25_000))
    result = convert_photo(portrait_jpeg(), request)
    assert result.drawing.stroke_count == 3
    assert result.stats.detail_level == 0


def test_ac005_area_with_more_decimals_is_rounded_down_never_up() -> None:
    request = ConversionRequest(DrawingArea(180.555, 267.449), StrokeBudget(1500, 25_000))
    drawing = convert_photo(portrait_jpeg(), request).drawing
    assert (drawing.width_mm, drawing.height_mm) == (180.55, 267.44)
    check_drawing(
        drawing.svg, width_mm=180.55, height_mm=267.44, max_strokes=1500, max_total_length_mm=25_000
    )


def test_near_stroke_ends_are_joined_into_one_stroke() -> None:
    dashed = images.flat(1600, 1200, 235)
    for x in range(100, 1500, 28):  # dashes with gaps of a few working pixels
        cv2.line(dashed, (x, 600), (x + 24, 600), (20, 20, 20), 3)
    strokes = extract_strokes(
        prepare(decode_photo(images.png(dashed), 800)), params.DETAIL_LEVELS[0]
    )
    assert strokes is not None
    lengths = sorted(polyline_lengths(strokes), reverse=True)
    # Without joining, the longest stroke is about 75 working pixels (one dash outline or two).
    assert lengths[0] > 150


@pytest.mark.parametrize(
    ("max_strokes", "max_length"),
    [(1500, 2000.0), (40, 25_000.0), (5, 300.0), (1, 50.0)],
)
def test_ac006_final_guarantee_never_exceeds_a_tight_budget(
    max_strokes: int, max_length: float
) -> None:
    check(
        ConversionRequest(DrawingArea(180, 267), StrokeBudget(max_strokes, max_length)),
        crowd_jpeg(),
    )


def test_ac008_entirely_black_photo_has_no_drawable_content() -> None:
    with pytest.raises(NoDrawableContent):
        convert_photo(images.jpeg(images.flat(1600, 1200, 0)), DEFAULT)


@pytest.mark.parametrize("value", [255, 128])
def test_ac008_white_and_flat_grey_photos_have_no_drawable_content(value: int) -> None:
    with pytest.raises(NoDrawableContent):
        convert_photo(images.jpeg(images.flat(1600, 1200, value)), DEFAULT)


def discs(count: int, radius: int) -> bytes:
    """`count` dark discs in a row-by-row grid on grey: a few strokes per disc outline."""
    image = images.flat(1600, 1200, 200)
    per_row = max(1, 1600 // (2 * radius + 40))
    for i in range(count):
        centre = (
            radius + 20 + (i % per_row) * (2 * radius + 40),
            radius + 20 + (i // per_row) * (2 * radius + 40),
        )
        cv2.circle(image, centre, radius, (40, 40, 40), -1)
    return images.png(image)


@pytest.mark.parametrize(
    ("count", "radius", "strokes_ok", "length_ok"),
    [
        (3, 250, False, True),  # long outlines, but fewer than 20 strokes
        (24, 6, True, False),  # 20+ strokes, but under half a metre in total
        (24, 45, True, True),  # both: a (sparse) drawing
    ],
)
def test_ac008_no_drawable_content_below_20_strokes_or_half_a_metre(
    count: int, radius: int, strokes_ok: bool, length_ok: bool
) -> None:
    photo = discs(count, radius)
    gray = decode_photo(photo, 800)
    finest = extract_strokes(prepare(gray), params.DETAIL_LEVELS[0])
    assert finest is not None
    scale = Fit.centred(gray.shape[1], gray.shape[0], DEFAULT.area).scale
    length_mm = float(polyline_lengths(finest).sum()) * scale
    # The fixture really is on the intended side of each threshold.
    assert (len(finest) >= params.NO_CONTENT_MIN_STROKES) == strokes_ok
    assert (length_mm >= params.NO_CONTENT_MIN_LENGTH_MM) == length_ok

    if strokes_ok and length_ok:
        assert convert_photo(photo, DEFAULT).drawing.stroke_count >= 20
    else:
        with pytest.raises(NoDrawableContent):
            convert_photo(photo, DEFAULT)


def test_ac008_grain_of_a_dark_photo_does_not_become_lines() -> None:
    # Without the edge-threshold floors the grain of this dark photo gives ~1000 strokes.
    rng = np.random.default_rng(5)
    grain = cv2.GaussianBlur(rng.normal(0, 2, (1200, 1600)).astype(np.float32), (0, 0), 1.5)
    dark = np.clip(15 + grain / grain.std() * 2, 0, 255)
    dark[100:300, 100:400] = 230  # a small bright patch: a few strokes, not a drawing
    with pytest.raises(NoDrawableContent):
        convert_photo(images.png(np.repeat(dark.astype(np.uint8)[:, :, None], 3, 2)), DEFAULT)


def test_ac008_nearly_uniform_noisy_photo_has_no_drawable_content() -> None:
    noisy = images.synthetic_portrait(1600, 1200, noise=4.0)
    noisy[:] = images.flat(1600, 1200, 90) + (noisy % 3)
    with pytest.raises(NoDrawableContent):
        convert_photo(images.jpeg(noisy), DEFAULT)


def test_ac007_conversion_makes_no_network_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_: object, **__: object) -> None:
        raise AssertionError("the conversion tried to open a network connection")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    check(DEFAULT, portrait_jpeg())


def test_same_photo_gives_the_same_drawing() -> None:
    first = convert_photo(portrait_jpeg(), DEFAULT).drawing
    second = convert_photo(portrait_jpeg(), DEFAULT).drawing
    assert first == second


def svg_stroke_lengths(svg: str) -> list[float]:
    lengths = []
    for data in re.findall(r' d="([^"]+)"', svg):
        numbers = np.array([float(n) for n in re.findall(r"\d+(?:\.\d+)?", data)])
        lengths.append(float(polyline_lengths([numbers.reshape(-1, 2)])[0]))
    return lengths


@pytest.mark.parametrize(
    "change",
    [
        lambda x: 255 - (255 - x) * 0.3,  # lifted blacks: faded print, hazy light
        lambda x: 128 + (x - 128) * 0.2,  # very low contrast
        lambda x: x * 0.3,  # dark
    ],
    ids=["lifted-blacks", "low-contrast", "dark"],
)
def test_faded_or_dark_photo_keeps_most_of_the_drawing(change: Callable[[Any], Any]) -> None:
    # Worker review finding 6: the face used to disappear in washed-out photos.
    portrait = images.synthetic_portrait(1200, 1600)
    changed = np.clip(change(portrait.astype(np.float32)), 0, 255).astype(np.uint8)
    normal = convert_photo(images.png(portrait), DEFAULT).drawing.total_length_mm
    faded = convert_photo(images.png(changed), DEFAULT).drawing.total_length_mm
    assert faded >= 0.6 * normal
