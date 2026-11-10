"""AC-007: a photo at the upload limits converts well within the time limit on one CPU.

Runs in the normal test run and in CI (marker `perf`, deselect with -m "not perf").
"""

import time
from collections.abc import Callable, Iterator

import cv2
import pytest

from fineline_worker.pipeline import ConversionRequest, StrokeBudget, convert_photo
from fineline_worker.svg import DrawingArea
from tests import images
from tests.svg_check import check_drawing

# The customer must see the preview within 30 s of the upload (AC-007); the conversion gets a
# third of that so upload, API checks and a slow CI machine still fit.
CONVERSION_LIMIT_SECONDS = 10.0
REQUEST = ConversionRequest(DrawingArea(180, 267), StrokeBudget(1500, 25_000))
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

pytestmark = pytest.mark.perf


@pytest.fixture(autouse=True)
def one_cpu() -> Iterator[None]:
    threads = cv2.getNumThreads()
    cv2.setNumThreads(1)
    yield
    cv2.setNumThreads(threads)


def jpeg_12mp() -> bytes:
    return images.jpeg(images.synthetic_portrait(4000, 3000, noise=20.0), quality=98)


def jpeg_48mp() -> bytes:
    small = images.synthetic_portrait(4032, 3024, noise=14.0)
    return images.jpeg(images.upscale(small, 8064, 6048))


def png_48mp() -> bytes:
    small = images.synthetic_portrait(2016, 1512, noise=0.0)
    return images.png(images.upscale(small, 8064, 6048))


def heic_12mp() -> bytes:
    return images.heic(images.synthetic_portrait(4032, 3024))


def heic_48mp() -> bytes:
    small = images.synthetic_portrait(4032, 3024, noise=8.0)
    return images.heic(images.upscale(small, 8064, 6048))


def crowd_12mp() -> bytes:
    return images.jpeg(images.busy_texture(4032, 3024))


@pytest.mark.parametrize(
    "make_photo",
    [jpeg_12mp, jpeg_48mp, png_48mp, heic_12mp, heic_48mp, crowd_12mp],
    ids=[
        "jpeg-4000x3000",
        "jpeg-8064x6048",
        "png-8064x6048",
        "heic-4032x3024",
        "heic-8064x6048",
        "crowd-jpeg-4032x3024",
    ],
)
def test_ac007_photo_at_the_upload_limits_converts_quickly_on_one_cpu(
    make_photo: Callable[[], bytes],
) -> None:
    photo = make_photo()
    assert len(photo) <= MAX_UPLOAD_BYTES

    started = time.perf_counter()
    result = convert_photo(photo, REQUEST)
    elapsed = time.perf_counter() - started

    print(  # shown with `pytest -s`: the numbers the owner tunes against
        f"\n{make_photo.__name__}: {len(photo) / 1e6:.1f} MB, {elapsed:.2f} s "
        f"(decode {result.stats.decode_ms} ms), {result.drawing.stroke_count} strokes, "
        f"{result.drawing.total_length_mm / 1000:.1f} m, detail level {result.stats.detail_level}"
    )
    assert elapsed < CONVERSION_LIMIT_SECONDS
    check_drawing(
        result.drawing.svg,
        width_mm=180,
        height_mm=267,
        max_strokes=1500,
        max_total_length_mm=25_000,
    )
