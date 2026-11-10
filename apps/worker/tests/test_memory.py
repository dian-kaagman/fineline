"""SR-004: peak memory of concurrent conversions of the largest accepted photos.

Each case runs in a fresh Python process so the peak (VmHWM) belongs to that case alone.
Linux only (reads /proc). Marked `perf`: runs in CI, `pytest -m perf -s` prints the numbers.
"""

import io
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

import pytest
from PIL import Image

from tests import images

pytestmark = [
    pytest.mark.perf,
    pytest.mark.skipif(not Path("/proc/self/status").exists(), reason="needs Linux /proc"),
]

WORKER_DIR = Path(__file__).parent.parent
# The compose worker gets 1 GiB; two conversions at once must stay well below it.
PEAK_LIMIT_MB = 600

CHILD = """
import sys, threading
from fineline_worker.pipeline import ConversionRequest, StrokeBudget, convert_photo
from fineline_worker.svg import DrawingArea

def hwm_mb():
    for line in open("/proc/self/status"):
        if line.startswith("VmHWM:"):
            return int(line.split()[1]) / 1024

photos = [open(path, "rb").read() for path in sys.argv[1:]]
request = ConversionRequest(DrawingArea(180, 267), StrokeBudget(1500, 25000))
before = hwm_mb()
threads = [threading.Thread(target=convert_photo, args=(p, request)) for p in photos]
for t in threads: t.start()
for t in threads: t.join()
print(f"{before:.0f} {hwm_mb():.0f}")
"""


def rgba_png_50mp() -> bytes:
    portrait = images.upscale(images.synthetic_portrait(2040, 1530, noise=0.0), 8160, 6120)
    return images.png_rgba(portrait)


def rgba_png_zeros_49mp() -> bytes:
    """The security review's case (finding #4): 7000 x 7000 transparent black, about 190 KB."""
    buffer = io.BytesIO()
    Image.new("RGBA", (7000, 7000)).save(buffer, format="PNG")
    return buffer.getvalue()


def la_png_49mp() -> bytes:
    buffer = io.BytesIO()
    Image.new("LA", (7000, 7000), (90, 200)).save(buffer, format="PNG")
    return buffer.getvalue()


def palette_png_49mp() -> bytes:
    """A palette PNG with a transparent colour (expands to RGBA while converting)."""
    image = Image.new("P", (7000, 7000), 1)
    image.putpalette([255, 255, 255, 30, 30, 30] + [0] * 762)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", transparency=0)
    return buffer.getvalue()


def heic_48mp() -> bytes:
    portrait = images.synthetic_portrait(4032, 3024, noise=8.0)
    return images.heic(images.upscale(portrait, 8064, 6048))


def peak_mb(photo: bytes, copies: int, tmp_path: Path) -> tuple[float, float]:
    path = tmp_path / "photo"
    path.write_bytes(photo)
    result = subprocess.run(  # noqa: S603 - our own interpreter and script
        [sys.executable, "-c", CHILD, *[str(path)] * copies],
        cwd=WORKER_DIR,
        capture_output=True,
        text=True,
        check=True,
        timeout=120,
    )
    before, after = result.stdout.split()
    return float(before), float(after)


@pytest.mark.parametrize(
    "make_photo",
    [rgba_png_50mp, rgba_png_zeros_49mp, la_png_49mp, palette_png_49mp, heic_48mp],
    ids=["png-rgba-50mp", "png-rgba-zeros-49mp", "png-la-49mp", "png-palette-49mp", "heic-48mp"],
)
def test_two_concurrent_largest_photos_stay_well_under_the_memory_limit(
    make_photo: Callable[[], bytes], tmp_path: Path
) -> None:
    photo = make_photo()
    before, peak = peak_mb(photo, 2, tmp_path)
    name = make_photo.__name__
    print(f"\n{name} x2: process peak {peak:.0f} MB (before conversions {before:.0f} MB)")
    assert peak < PEAK_LIMIT_MB
