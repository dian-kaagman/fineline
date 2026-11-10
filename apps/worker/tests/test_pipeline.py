"""The conversion without HTTP: drawing format, area, budget and no-content rule."""

import socket
from functools import cache

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
    assert len(first_trace) > 1500, "fixture must bust the budget on its first trace"
    check(DEFAULT, crowd_jpeg())


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
