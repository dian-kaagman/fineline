"""Independent check of the drawing guarantees (BR-002..BR-004) by parsing the SVG output."""

import itertools
import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass

SVG_NS = "{http://www.w3.org/2000/svg}"
PATH_ATTRIBUTES = {
    "d": None,
    "fill": "none",
    "stroke": "#000",
    "stroke-width": "0.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
}
NUMBER = r"\d+(?:\.\d{1,2})?"
PATH_DATA = re.compile(rf"M{NUMBER} {NUMBER}(?: L{NUMBER} {NUMBER})+")
FORBIDDEN_TEXT = ("<!--", "<!DOCTYPE", "<!ENTITY", "<?", "CDATA", "style", "script", "href")


@dataclass(frozen=True)
class Measured:
    stroke_count: int
    total_length_mm: float


def check_drawing(
    svg: str,
    *,
    width_mm: float,
    height_mm: float,
    max_strokes: int,
    max_total_length_mm: float,
) -> Measured:
    """Assert every output guarantee and return the metrics measured from the paths."""
    for forbidden in FORBIDDEN_TEXT:
        assert forbidden not in svg, f"SVG contains {forbidden!r}"

    root = ET.fromstring(svg)  # noqa: S314 - our own output, already checked for DOCTYPE/entities
    assert root.tag == f"{SVG_NS}svg"
    assert set(root.attrib) == {"width", "height", "viewBox", "version"}
    assert root.attrib["width"] == f"{_plain(width_mm)}mm"
    assert root.attrib["height"] == f"{_plain(height_mm)}mm"
    assert root.attrib["viewBox"] == f"0 0 {_plain(width_mm)} {_plain(height_mm)}"
    assert (root.text or "").strip() == ""

    total = 0.0
    paths = list(root)
    for path in paths:
        assert path.tag == f"{SVG_NS}path", f"unexpected element {path.tag}"
        assert len(path) == 0
        assert set(path.attrib) == set(PATH_ATTRIBUTES)
        for name, value in PATH_ATTRIBUTES.items():
            if value is not None:
                assert path.attrib[name] == value
        data = path.attrib["d"]
        assert PATH_DATA.fullmatch(data), f"path data outside the allowed grammar: {data[:80]}"
        numbers = [float(n) for n in re.findall(NUMBER, data)]
        points = list(zip(numbers[0::2], numbers[1::2], strict=True))
        for x, y in points:
            assert 0 <= x <= width_mm, f"x {x} outside the area"
            assert 0 <= y <= height_mm, f"y {y} outside the area"
        total += sum(math.dist(a, b) for a, b in itertools.pairwise(points))

    assert len(paths) <= max_strokes
    assert total <= max_total_length_mm
    return Measured(stroke_count=len(paths), total_length_mm=total)


def _plain(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")
