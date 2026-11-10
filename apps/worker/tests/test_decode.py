"""Decoding and photo checks (BR-001, SR-003)."""

import io
import re
import time
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageFile

from fineline_worker import params
from fineline_worker.decode import decode_photo
from fineline_worker.errors import PhotoTooManyPixels, PhotoTooSmall, PhotoUnreadable
from tests import images

SOURCE = Path(__file__).parent.parent / "src"


def test_ac001_heic_phone_photo_is_decoded() -> None:
    heic = images.heic(images.synthetic_portrait(4032, 3024))
    gray = decode_photo(heic, 800)
    assert gray.dtype == np.uint8
    assert max(gray.shape) == params.WORKING_LONG_SIDE_PX
    assert gray.shape == (750, 1000)


@pytest.mark.parametrize("encode", [images.jpeg, images.png], ids=["jpeg", "png"])
def test_jpeg_and_png_are_decoded_to_the_working_size(encode: images.Encoder) -> None:
    gray = decode_photo(encode(images.synthetic_portrait(900, 1200)), 800)
    assert gray.shape == (1000, 750)


def test_ac004_short_side_under_800_pixels_is_refused() -> None:
    with pytest.raises(PhotoTooSmall, match="800 pixels"):
        decode_photo(images.jpeg(images.synthetic_portrait(1200, 700)), 800)


def test_ac004_minimum_short_side_comes_from_the_request() -> None:
    photo = images.jpeg(images.synthetic_portrait(1200, 900))
    decode_photo(photo, 900)
    with pytest.raises(PhotoTooSmall, match="901 pixels"):
        decode_photo(photo, 901)


def test_exif_orientation_is_applied() -> None:
    landscape = images.synthetic_portrait(1200, 900)
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise when shown
    gray = decode_photo(images.jpeg(landscape, exif=exif.tobytes()), 800)
    assert gray.shape[0] > gray.shape[1]


def test_transparent_png_is_drawn_on_white() -> None:
    rgba = np.zeros((900, 900, 4), dtype=np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(rgba).save(buffer, format="PNG")
    gray = decode_photo(buffer.getvalue(), 800)
    assert int(gray.min()) == 255


@pytest.mark.parametrize(
    ("photo", "description"),
    [
        (images.jpeg_header_declaring(10_000, 6_000), "60 MP JPEG header"),
        (images.jpeg_header_declaring(30_000, 30_000), "900 MP JPEG header"),
        (images.png_header_only(10_000, 6_000), "60 MP PNG header"),
        (images.png_header_only(30_000, 30_000), "900 MP PNG header"),
    ],
)
def test_ac051_ac053_pixel_limit_is_checked_before_decoding(photo: bytes, description: str) -> None:
    assert len(photo) < 1024, description
    started = time.perf_counter()
    with pytest.raises(PhotoTooManyPixels, match="50 megapixels"):
        decode_photo(photo, 800)
    assert time.perf_counter() - started < 0.5


@pytest.mark.parametrize(
    "encode", [images.jpeg, images.png, images.heic], ids=["jpeg", "png", "heic"]
)
def test_pixel_limit_applies_to_every_format(
    encode: images.Encoder, monkeypatch: pytest.MonkeyPatch
) -> None:
    photo = encode(images.flat(1000, 1000, 128))
    monkeypatch.setattr(params, "MAX_PIXELS", 999_999)
    with pytest.raises(PhotoTooManyPixels):
        decode_photo(photo, 800)
    monkeypatch.setattr(params, "MAX_PIXELS", 1_000_000)
    decode_photo(photo, 800)


@pytest.mark.parametrize(
    "fmt",
    ["TIFF", "GIF", "BMP", "WEBP"],
)
def test_other_image_formats_are_unreadable(fmt: str) -> None:
    with pytest.raises(PhotoUnreadable):
        decode_photo(images.encode(images.flat(1000, 1000, 128), fmt), 800)


@pytest.mark.parametrize(
    "data",
    [
        images.psd_header(),
        b"",
        b"<svg xmlns='http://www.w3.org/2000/svg'/>",
        b"%PDF-1.7\n",
        images.jpeg(images.synthetic_portrait(900, 1200))[:5000],
    ],
    ids=["psd", "empty", "svg", "pdf", "truncated-jpeg"],
)
def test_unreadable_bytes_are_refused(data: bytes) -> None:
    with pytest.raises(PhotoUnreadable):
        decode_photo(data, 800)


def test_truncated_images_are_never_half_decoded() -> None:
    assert ImageFile.LOAD_TRUNCATED_IMAGES is False


def test_opencv_decoders_are_never_used() -> None:
    banned = re.compile(r"\b(imdecode|imread|imreadmulti|VideoCapture)\b")
    for source in SOURCE.rglob("*.py"):
        assert not banned.search(source.read_text()), f"{source} uses an OpenCV decoder"
