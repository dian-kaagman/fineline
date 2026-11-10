"""Safe photo decoding (SR-003, BR-001).

Only Pillow decodes, restricted to JPEG, PNG and HEIF. The pixel count is checked right after
open(), which reads only the header, so an image bomb is refused before any pixel is decoded.
OpenCV only ever sees the decoded NumPy array.
"""

import io

import numpy as np
import numpy.typing as npt
from PIL import Image, ImageFile, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from fineline_worker import params
from fineline_worker.errors import PhotoTooManyPixels, PhotoTooSmall, PhotoUnreadable

register_heif_opener()
# Truncated files are refused, never half-decoded.
ImageFile.LOAD_TRUNCATED_IMAGES = False

_ALPHA_MODES = ("RGBA", "LA", "PA", "RGBa", "La")
_WIDE_MODES = ("I", "I;16", "I;16B", "I;16L", "I;16N", "F")


def decode_photo(data: bytes, min_short_side_px: int) -> npt.NDArray[np.uint8]:
    """Decode a photo into a grayscale working image (longest side WORKING_LONG_SIDE_PX).

    EXIF orientation is applied; all metadata is dropped because only pixels are returned.
    """
    try:
        image = Image.open(io.BytesIO(data), formats=params.ALLOWED_FORMATS)
    except Image.DecompressionBombError as error:
        raise PhotoTooManyPixels(_too_many_pixels_message()) from error
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as error:
        raise PhotoUnreadable("The photo is not a readable JPEG, PNG or HEIC image") from error

    with image:
        width, height = image.size
        if width * height > params.MAX_PIXELS:
            raise PhotoTooManyPixels(_too_many_pixels_message())
        # Rotation does not change the shortest side, so this can run before decoding too.
        if min(width, height) < min_short_side_px:
            raise PhotoTooSmall(
                f"The photo's shortest side must be at least {min_short_side_px} pixels"
            )
        try:
            return _to_working_gray(image)
        except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as error:
            raise PhotoUnreadable("The photo could not be decoded") from error


def _too_many_pixels_message() -> str:
    return f"The photo may have at most {params.MAX_PIXELS // 1_000_000} megapixels"


def _to_working_gray(image: Image.Image) -> npt.NDArray[np.uint8]:
    box = (params.WORKING_LONG_SIDE_PX, params.WORKING_LONG_SIDE_PX)
    # thumbnail() uses JPEG draft mode (DCT scaling) and reduce(), so a 48 MP JPEG is never
    # held at full size; it keeps the EXIF data needed by exif_transpose() below.
    image.thumbnail(box, Image.Resampling.LANCZOS, reducing_gap=3.0)
    oriented = ImageOps.exif_transpose(image)

    if oriented.mode in _WIDE_MODES:
        return _wide_to_gray(oriented)
    if oriented.mode in _ALPHA_MODES or "transparency" in oriented.info:
        rgba = oriented.convert("RGBA")
        white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        oriented = Image.alpha_composite(white, rgba)
    gray = oriented.convert("L")
    return np.array(gray, dtype=np.uint8)


def _wide_to_gray(image: Image.Image) -> npt.NDArray[np.uint8]:
    values = np.asarray(image, dtype=np.float32)
    top = float(values.max()) if values.size else 0.0
    if top > 255.0:
        values = values * (255.0 / (65535.0 if top > 4095.0 else top))
    return np.clip(values, 0, 255).astype(np.uint8)
