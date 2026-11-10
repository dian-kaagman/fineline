"""Generated test photos. No real photos of people are committed (SR-018, BR-010)."""

import io
import struct
import zlib
from collections.abc import Callable

import cv2
import numpy as np
import numpy.typing as npt
from PIL import Image
from pillow_heif import register_heif_opener

register_heif_opener()

RGBImage = npt.NDArray[np.uint8]
Encoder = Callable[[RGBImage], bytes]


def synthetic_portrait(width: int, height: int, *, noise: float = 6.0, seed: int = 1) -> RGBImage:
    """A portrait-like picture: graded background, hair, face, eyes, nose, mouth, shoulders."""
    rng = np.random.default_rng(seed)
    ramp = np.linspace(170, 220, width, dtype=np.float32)
    image = np.repeat(np.repeat(ramp[None, :, None], height, axis=0), 3, axis=2)
    s = min(width, height) / 1000.0
    cx, cy = width // 2, int(height * 0.45)

    def pt(dx: float, dy: float) -> tuple[int, int]:
        return (int(cx + dx * s), int(cy + dy * s))

    def ax(rx: float, ry: float) -> tuple[int, int]:
        return (int(rx * s), int(ry * s))

    cv2.ellipse(image, pt(0, 520), ax(420, 260), 0, 180, 360, (70, 80, 110), -1)  # shoulders
    cv2.rectangle(image, pt(-90, 220), pt(90, 400), (175, 150, 135), -1)  # neck
    cv2.ellipse(image, pt(0, -40), ax(300, 360), 0, 0, 360, (45, 35, 30), -1)  # hair
    for strand in range(-260, 261, 40):  # hair strands
        cv2.ellipse(image, pt(strand, -60), ax(40, 300), 0, 200, 340, (90, 75, 65), int(5 * s))
    cv2.ellipse(image, pt(0, 20), ax(230, 300), 0, 0, 360, (205, 175, 160), -1)  # face
    cv2.ellipse(image, pt(0, -200), ax(240, 130), 0, 180, 360, (45, 35, 30), -1)  # fringe
    for side in (-1, 1):
        cv2.ellipse(image, pt(side * 95, -40), ax(55, 26), 0, 0, 360, (250, 250, 250), -1)
        cv2.circle(image, pt(side * 95, -40), int(20 * s), (60, 45, 35), -1)
        cv2.ellipse(image, pt(side * 95, -95), ax(70, 18), 0, 200, 340, (60, 45, 40), int(9 * s))
        cv2.ellipse(image, pt(side * 225, 20), ax(30, 60), 0, 0, 360, (190, 160, 145), -1)  # ear
    cv2.line(image, pt(0, -20), pt(-25, 90), (150, 120, 110), int(7 * s))  # nose
    cv2.ellipse(image, pt(0, 100), ax(40, 18), 0, 0, 180, (140, 110, 100), int(6 * s))
    cv2.ellipse(image, pt(0, 175), ax(85, 30), 0, 0, 180, (150, 70, 70), int(10 * s))  # mouth
    cv2.ellipse(image, pt(130, 60), ax(60, 160), 15, 270, 450, (175, 145, 130), int(25 * s))
    for button in range(4):  # shirt buttons and a collar
        cv2.circle(image, pt(0, 460 + button * 70), int(14 * s), (230, 230, 235), -1)
    cv2.line(image, pt(-90, 400), pt(0, 470), (230, 230, 235), int(12 * s))
    cv2.line(image, pt(90, 400), pt(0, 470), (230, 230, 235), int(12 * s))
    for frame in range(3):  # picture frames on the wall behind
        x = -470 + frame * 330
        cv2.rectangle(image, pt(x, -480), pt(x + 120, -380), (120, 110, 100), int(8 * s))
    image += rng.normal(0.0, noise, image.shape).astype(np.float32)
    return np.clip(image, 0, 255).astype(np.uint8)


def upscale(image: RGBImage, width: int, height: int) -> RGBImage:
    resized = cv2.resize(image, (width, height), interpolation=cv2.INTER_LINEAR)
    return np.asarray(resized, dtype=np.uint8)


def busy_texture(width: int, height: int, *, seed: int = 2) -> RGBImage:
    """A crowd-like texture with thousands of small high-contrast shapes (busts the budget)."""
    rng = np.random.default_rng(seed)
    image = np.full((height, width, 3), 128, dtype=np.uint8)
    scale = min(width, height) / 1000.0
    for _ in range(int(9000 * scale * scale * (width / height if width > height else 1))):
        centre = (int(rng.integers(0, width)), int(rng.integers(0, height)))
        radius = max(2, int(rng.integers(4, 18) * scale))
        shade = int(rng.choice([15, 60, 200, 245]))
        cv2.circle(image, centre, radius, (shade, shade, shade), -1)
    return image


def flat(width: int, height: int, value: int) -> RGBImage:
    return np.full((height, width, 3), value, dtype=np.uint8)


def encode(image: RGBImage, fmt: str, **save_options: object) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(image).save(buffer, format=fmt, **save_options)
    return buffer.getvalue()


def jpeg(image: RGBImage, quality: int = 90, **save_options: object) -> bytes:
    return encode(image, "JPEG", quality=quality, **save_options)


def png(image: RGBImage) -> bytes:
    return encode(image, "PNG", compress_level=1)


def heic(image: RGBImage) -> bytes:
    # The x265 "ultrafast" preset keeps a 12 MP encode under a second (the default takes ~14 s).
    return encode(image, "HEIF", quality=60, enc_params={"preset": "ultrafast"})


def png_header_only(width: int, height: int) -> bytes:
    """A valid tiny PNG whose header declares width x height pixels (an image bomb)."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    # One compressed row of zeros; a decoder would need width x height bytes for the rest.
    data = zlib.compress(b"\x00" * (width + 1), 9)
    return (
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", data) + chunk(b"IEND", b"")
    )


def jpeg_header_declaring(width: int, height: int) -> bytes:
    """A small real JPEG whose frame header (SOF0) is patched to declare width x height."""
    data = bytearray(jpeg(flat(16, 16, 128)))
    sof = data.find(b"\xff\xc0")
    # SOF0: marker(2) length(2) precision(1) height(2) width(2)
    struct.pack_into(">HH", data, sof + 5, height, width)
    return bytes(data)


def psd_header() -> bytes:
    """The start of a Photoshop file (a format Pillow could read but we must refuse)."""
    return b"8BPS" + struct.pack(">H6xHIIHH", 1, 3, 1000, 1000, 8, 3) + b"\x00" * 64
