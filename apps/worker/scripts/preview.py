"""Convert photos on disk and write the SVG plus a PNG preview, for tuning `params.py`.

Usage: uv run python scripts/preview.py OUTPUT_DIR PHOTO [PHOTO ...]
         [--area 180x267] [--max-strokes 1500] [--max-length-mm 25000]

Runs the same pipeline as POST /v1/convert. Keep real customer photos out of git.
"""

import argparse
import re
import time
from pathlib import Path

import cv2
import numpy as np

from fineline_worker.errors import WorkerError
from fineline_worker.pipeline import ConversionRequest, StrokeBudget, convert_photo
from fineline_worker.svg import DrawingArea

PREVIEW_PX_PER_MM = 4.0
NUMBER = re.compile(r"\d+(?:\.\d+)?")


def render(svg: str, area: DrawingArea) -> np.ndarray:
    """Rasterise our own SVG output (one polyline per path) on white paper."""
    k = PREVIEW_PX_PER_MM
    paper = np.full((round(area.height_mm * k), round(area.width_mm * k)), 255, np.uint8)
    for data in re.findall(r' d="([^"]+)"', svg):
        numbers = np.array([float(n) for n in NUMBER.findall(data)]).reshape(-1, 2)
        points = np.round(numbers * k).astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(paper, [points], False, 0, 1, cv2.LINE_AA)
    return paper


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("photos", type=Path, nargs="+")
    parser.add_argument("--area", default="180x267", help="drawing area in mm, WIDTHxHEIGHT")
    parser.add_argument("--max-strokes", type=int, default=1500)
    parser.add_argument("--max-length-mm", type=float, default=25_000.0)
    args = parser.parse_args()

    width, height = (float(v) for v in args.area.split("x"))
    area = DrawingArea(width, height)
    request = ConversionRequest(area, StrokeBudget(args.max_strokes, args.max_length_mm))
    args.output_dir.mkdir(parents=True, exist_ok=True)

    for photo in args.photos:
        started = time.perf_counter()
        try:
            result = convert_photo(photo.read_bytes(), request)
        except WorkerError as error:
            print(f"{photo.name}: refused with {error.code} ({error.message})")
            continue
        elapsed = time.perf_counter() - started
        drawing = result.drawing
        (args.output_dir / f"{photo.stem}.svg").write_text(drawing.svg)
        cv2.imwrite(str(args.output_dir / f"{photo.stem}.png"), render(drawing.svg, area))
        print(
            f"{photo.name}: {drawing.stroke_count} strokes, "
            f"{drawing.total_length_mm / 1000:.1f} m, detail level {result.stats.detail_level}, "
            f"{result.stats.strokes_dropped_by_guarantee} dropped by the guarantee, {elapsed:.2f} s"
        )


if __name__ == "__main__":
    main()
