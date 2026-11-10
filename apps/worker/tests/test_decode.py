"""Decoding and photo checks (BR-001, SR-003)."""

import contextlib
import io
import random
import re
import time
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageFile, ImageOps

from fineline_worker import params
from fineline_worker.decode import decode_photo
from fineline_worker.errors import (
    PhotoTooManyPixels,
    PhotoTooSmall,
    PhotoUnreadable,
    WorkerError,
)
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


@pytest.mark.parametrize("orientation", range(1, 9))
def test_exif_orientation_is_applied_like_the_exif_spec(orientation: int) -> None:
    exif = Image.Exif()
    exif[0x0112] = orientation
    photo = images.encode(images.synthetic_portrait(1200, 900), "PNG", exif=exif.tobytes())
    reference = ImageOps.exif_transpose(Image.open(io.BytesIO(photo))).convert("L")
    expected = np.asarray(reference.resize((750, 1000) if orientation >= 5 else (1000, 750)))
    gray = decode_photo(photo, 800)
    assert gray.shape == expected.shape
    assert np.abs(gray.astype(int) - expected).mean() < 1


@pytest.mark.parametrize("encode", [images.jpeg, images.heic], ids=["jpeg", "heic"])
def test_ac001_photo_turned_by_exif_is_upright_once(encode: images.Encoder) -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # stored landscape, shown rotated 90 degrees clockwise
    photo = images.encode_with(encode, images.synthetic_portrait(1200, 900), exif=exif.tobytes())
    assert decode_photo(photo, 800).shape == (1000, 750)


def test_damaged_exif_keeps_the_photo_and_its_orientation() -> None:
    # YResolution stored as text: Pillow's exif_transpose() raises TypeError rewriting it
    # (worker review finding 2); the pixels and the orientation tag are fine.
    photo = images.jpeg(images.synthetic_portrait(1200, 900), exif=images.exif_text_resolution(6))
    with pytest.raises(TypeError):
        ImageOps.exif_transpose(Image.open(io.BytesIO(photo)))
    assert decode_photo(photo, 800).shape == (1000, 750)


@pytest.mark.filterwarnings("ignore::UserWarning")  # Pillow warns about the corrupt EXIF
def test_unparseable_exif_is_ignored() -> None:
    photo = images.jpeg(images.synthetic_portrait(1200, 900), exif=b"Exif\x00\x00MM\x00*garbage")
    assert decode_photo(photo, 800).shape == (750, 1000)


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


@pytest.mark.parametrize(
    ("photo", "raw_error"),
    [
        (images.heic_corrupt_stream(), EOFError),
        (images.heic_declaring_smaller_size(), RuntimeError),
    ],
    ids=["heic-eof", "heic-size-mismatch"],
)
def test_decoder_errors_of_any_type_are_unreadable(
    photo: bytes, raw_error: type[Exception]
) -> None:
    # Reproducers of worker review finding 2: Pillow/pillow-heif raise these types, which
    # used to escape as 500 internal_error.
    with pytest.raises(raw_error):
        Image.open(io.BytesIO(photo)).load()
    with pytest.raises(PhotoUnreadable):
        decode_photo(photo, 800)


@pytest.mark.filterwarnings("ignore::UserWarning")  # Pillow warns about the corrupt EXIF
@pytest.mark.parametrize(
    "encode", [images.jpeg, images.png, images.heic], ids=["jpeg", "png", "heic"]
)
def test_damaged_files_only_ever_give_a_photo_error(encode: images.Encoder) -> None:
    """A small seeded fuzz of header bytes: the answer is a drawing or a photo error, never 500."""
    exif = Image.Exif()
    exif[0x0112] = 6
    base = images.encode_with(encode, images.synthetic_portrait(900, 1200), exif=exif.tobytes())
    rng = random.Random(7)  # noqa: S311 - reproducible test data, not security
    for _ in range(150):
        damaged = bytearray(base)
        for _ in range(rng.randint(1, 4)):
            damaged[rng.randrange(min(len(damaged), 1024))] = rng.randrange(256)
        with contextlib.suppress(WorkerError):
            decode_photo(bytes(damaged), 800)


def test_large_16_bit_grayscale_png_is_decoded_by_bit_depth() -> None:
    portrait = images.upscale(images.synthetic_portrait(1500, 1125, noise=0.0), 6000, 4500)
    gray8 = np.asarray(Image.fromarray(portrait).convert("L"))
    photo = images.png16_gray(gray8.astype(np.uint16) * 257)
    decoded = decode_photo(photo, 800)
    expected = np.asarray(Image.fromarray(gray8).resize((1000, 750), Image.Resampling.LANCZOS))
    assert decoded.shape == (750, 1000)
    assert np.abs(decoded.astype(int) - expected).mean() < 2


def test_dark_16_bit_png_stays_dark() -> None:
    dark = np.full((1200, 1600), 63, dtype=np.uint16)  # 63 of 65535: nearly black
    assert int(decode_photo(images.png16_gray(dark), 800).max()) == 0


def test_16_bit_rgb_png_is_decoded() -> None:
    portrait = images.synthetic_portrait(1600, 1200)
    decoded = decode_photo(images.png16_rgb(portrait), 800)
    expected = decode_photo(images.png(portrait), 800)
    assert np.abs(decoded.astype(int) - expected).mean() < 2


def test_truncated_images_are_never_half_decoded() -> None:
    assert ImageFile.LOAD_TRUNCATED_IMAGES is False


def test_opencv_decoders_are_never_used() -> None:
    banned = re.compile(r"\b(imdecode|imread|imreadmulti|VideoCapture)\b")
    for source in SOURCE.rglob("*.py"):
        assert not banned.search(source.read_text()), f"{source} uses an OpenCV decoder"
