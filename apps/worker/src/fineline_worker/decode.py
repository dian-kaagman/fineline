"""Safe photo decoding (SR-003, BR-001).

Only Pillow decodes, restricted to JPEG, PNG and HEIF. The pixel count is checked right after
open(), which reads only the header, so an image bomb is refused before any pixel is decoded.
OpenCV only ever sees the decoded NumPy array.

Memory (SR-004): JPEGs are decoded at reduced size (DCT scaling). PNG and HEIF can only be
decoded at full size, so at most one large full-size decode runs at a time in the process,
and the full-size image is turned into a small 8-bit grayscale image strip by strip and freed
before the drawing pipeline runs.
"""

import ctypes
import ctypes.util
import io
import math
import threading
from collections.abc import Callable
from contextlib import nullcontext

import numpy as np
import numpy.typing as npt
from PIL import Image, ImageFile
from pillow_heif import register_heif_opener

from fineline_worker import params
from fineline_worker.errors import PhotoTooManyPixels, PhotoTooSmall, PhotoUnreadable

# Embedded HEIF thumbnails and depth/auxiliary images are never used: the drawing is always
# made from the primary image, and less of the file is parsed.
register_heif_opener(thumbnails=False, depth_images=False, aux_images=False)
# Truncated files are refused, never half-decoded.
ImageFile.LOAD_TRUNCATED_IMAGES = False

_DRAFT_FORMATS = ("JPEG", "MPO")
_ALPHA_MODES = ("RGBA", "LA", "PA", "RGBa", "La")
_SIXTEEN_BIT_MODES = ("I;16", "I;16B", "I;16L", "I;16N")
# Rows of reduced output per strip: keeps each strip and its conversions to a few MB.
_STRIP_ROWS = 32
_ORIENTATION_TAG = 0x0112
_TRANSPOSES = {
    2: Image.Transpose.FLIP_LEFT_RIGHT,
    3: Image.Transpose.ROTATE_180,
    4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE,
    6: Image.Transpose.ROTATE_270,
    7: Image.Transpose.TRANSVERSE,
    8: Image.Transpose.ROTATE_90,
}

_large_decode = threading.Lock()


def _load_malloc_trim() -> Callable[[int], int] | None:
    try:
        libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6")
        trim: Callable[[int], int] = libc.malloc_trim
    except (OSError, AttributeError):  # not glibc (macOS, musl): nothing to trim
        return None
    return trim


_malloc_trim = _load_malloc_trim()


def _return_freed_memory() -> None:
    """Give the freed full-size buffers back to the OS (glibc otherwise keeps them as heap)."""
    if _malloc_trim is not None:
        _malloc_trim(0)


def decode_photo(data: bytes, min_short_side_px: int) -> npt.NDArray[np.uint8]:
    """Decode a photo into a grayscale working image (longest side WORKING_LONG_SIDE_PX).

    EXIF orientation is applied; all metadata is dropped because only pixels are returned.
    Every failure of the decoders on these untrusted bytes is `photo_unreadable`.
    """
    try:
        return _decode(data, min_short_side_px)
    except (PhotoTooManyPixels, PhotoTooSmall, PhotoUnreadable, MemoryError):
        raise
    except Image.DecompressionBombError as error:
        raise PhotoTooManyPixels(_too_many_pixels_message()) from error
    except Exception as error:  # any decoder failure on untrusted bytes: unreadable photo
        raise PhotoUnreadable("The photo is not a readable JPEG, PNG or HEIC image") from error


def _decode(data: bytes, min_short_side_px: int) -> npt.NDArray[np.uint8]:
    with Image.open(io.BytesIO(data), formats=params.ALLOWED_FORMATS) as image:
        _check_size(image.size, min_short_side_px)
        target = _working_size(image.size)
        if image.format in _DRAFT_FORMATS:
            # Decode at 1/2, 1/4 or 1/8 scale, still at least twice the working size.
            image.draft("L", (target[0] * 2, target[1] * 2))
        # Checked after draft(): a JPEG decoded at reduced size is not a large decode.
        large = image.width * image.height > params.LARGE_DECODE_PIXELS
        with _large_decode if large else nullcontext():
            image.load()
            # The decoded size must match the header we checked (a HEIF can disagree).
            if image.width * image.height > params.MAX_PIXELS:
                raise PhotoTooManyPixels(_too_many_pixels_message())
            gray = _reduce_to_gray(image, target)
            orientation = _orientation(image)
            # Free the full-size pixels before another large decode may start.
            image.close()
            if large:
                _return_freed_memory()

    transpose = _TRANSPOSES.get(orientation)
    if transpose is not None:
        gray = gray.transpose(transpose)
    working = _working_size(gray.size)
    if gray.size != working:
        gray = gray.resize(working, Image.Resampling.LANCZOS)
    return np.array(gray, dtype=np.uint8)


def _check_size(size: tuple[int, int], min_short_side_px: int) -> None:
    width, height = size
    if width * height > params.MAX_PIXELS:
        raise PhotoTooManyPixels(_too_many_pixels_message())
    # Rotation does not change the shortest side, so this runs before decoding.
    if min(width, height) < min_short_side_px:
        raise PhotoTooSmall(
            f"The photo's shortest side must be at least {min_short_side_px} pixels"
        )


def _too_many_pixels_message() -> str:
    return f"The photo may have at most {params.MAX_PIXELS // 1_000_000} megapixels"


def _working_size(size: tuple[int, int]) -> tuple[int, int]:
    width, height = size
    scale = min(1.0, params.WORKING_LONG_SIDE_PX / max(width, height))
    return max(1, round(width * scale)), max(1, round(height * scale))


def _reduce_to_gray(image: Image.Image, target: tuple[int, int]) -> Image.Image:
    """8-bit grayscale at an integer reduction that keeps at least twice the working size.

    Works in strips so no second full-size copy (16-bit to 8-bit, alpha, colour) is made.
    """
    width, height = image.size
    factor = max(1, min(width // (2 * target[0]), height // (2 * target[1])))
    has_alpha = image.mode in _ALPHA_MODES or "transparency" in image.info
    reduced = Image.new("L", (math.ceil(width / factor), math.ceil(height / factor)))
    rows = _STRIP_ROWS * factor
    for top in range(0, height, rows):
        strip = image.crop((0, top, width, min(height, top + rows)))
        gray = _strip_to_gray(strip, has_alpha)
        reduced.paste(gray.reduce(factor) if factor > 1 else gray, (0, top // factor))
    return reduced


def _strip_to_gray(strip: Image.Image, has_alpha: bool) -> Image.Image:
    if strip.mode in _SIXTEEN_BIT_MODES or strip.mode == "I":
        # 16-bit samples scale by the bit depth: 65535 is white, so a dark 16-bit photo stays dark.
        values = np.asarray(strip).astype(np.uint32)
        return Image.fromarray((np.minimum(values, 65535) // 257).astype(np.uint8), "L")
    if strip.mode == "F":
        return Image.fromarray(np.clip(np.asarray(strip), 0, 255).astype(np.uint8), "L")
    if has_alpha:
        rgba = strip.convert("RGBA")
        white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        return Image.alpha_composite(white, rgba).convert("L")
    return strip.convert("L")


def _orientation(image: Image.Image) -> int:
    """The EXIF orientation, or 1 when the EXIF data is missing or can't be parsed."""
    try:
        value = image.getexif().get(_ORIENTATION_TAG, 1)
    except Exception:  # noqa: BLE001 - damaged EXIF only costs the orientation fix
        return 1
    return value if isinstance(value, int) and value in _TRANSPOSES else 1
