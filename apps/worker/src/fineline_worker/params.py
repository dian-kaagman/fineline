"""Every tuning constant of the conversion in one place.

Pixel values refer to the working image (longest side WORKING_LONG_SIDE_PX), not to the
uploaded photo. See README.md "Tuning the drawing" for what each constant does.
"""

from dataclasses import dataclass

# --- Photo checks (BR-001, SR-003) ---
ALLOWED_FORMATS = ("JPEG", "PNG", "HEIF")
MAX_PIXELS = 50_000_000
DEFAULT_MIN_SHORT_SIDE_PX = 800

# --- Working image ---
# The photo is downscaled so its longest side is this many pixels before line extraction.
# More pixels give finer detail (and more strokes) but slower conversions.
WORKING_LONG_SIDE_PX = 1000

# --- Contrast and smoothing ---
# CLAHE evens out lighting so faces in shadow still give lines.
CLAHE_CLIP_LIMIT = 2.0
CLAHE_TILE_GRID = 8
# Bilateral filter: removes skin texture and noise while keeping outlines sharp.
BILATERAL_DIAMETER_PX = 9
BILATERAL_SIGMA_COLOR = 60.0
BILATERAL_SIGMA_SPACE = 60.0

# --- Edges (outlines and features) ---
# Canny thresholds are derived from the median brightness: (1 -/+ CANNY_SIGMA) * median,
# kept between the floors and ceilings, then times the detail level's multiplier. The floors
# keep noise in flat or very dark photos from becoming lines; the ceilings keep soft features
# (nose, lips) in bright photos. Lower values give more lines.
CANNY_SIGMA = 0.33
CANNY_MIN_LOW = 30.0
CANNY_MIN_HIGH = 70.0
CANNY_MAX_LOW = 90.0
CANNY_MAX_HIGH = 180.0

# --- Tone contours (shading of hair and shadows, drawn as lines, never fills) ---
# The image is strongly blurred and traced at the detail level's brightness levels (0-255).
TONE_BLUR_SIGMA_PX = 5.0
# Contour points this close to the image border are removed, so a dark background does not
# draw a frame around the picture.
TONE_BORDER_PX = 2
# Tone contour points this close to an edge line are removed, so an outline that is both an
# edge and a tone boundary is drawn once. 0 keeps every tone contour.
TONE_EDGE_CLEARANCE_PX = 3

# --- Stroke clean-up ---
# Fragments shorter than this are dropped before joining (tracing noise at junctions).
MIN_FRAGMENT_PX = 2.0
# Stroke ends closer than this are joined into one stroke (fewer pen lifts).
JOIN_GAP_PX = 4.0

# --- No drawable content (AC-008) ---
# Measured at the finest detail level after filtering.
NO_CONTENT_MIN_STROKES = 20
NO_CONTENT_MIN_LENGTH_MM = 500.0

# --- SVG output (BR-002) ---
STROKE_WIDTH_MM = 0.5
COORDINATE_DECIMALS = 2
# Kept free below the total length budget so another implementation summing the same rounded
# coordinates in a different order can never land above the budget.
LENGTH_SAFETY_MARGIN_MM = 0.05


@dataclass(frozen=True)
class DetailLevel:
    """One step of the budget loop, from finest to coarsest."""

    canny_multiplier: float
    tone_levels: tuple[int, ...]
    simplify_epsilon_px: float
    min_stroke_length_px: float


# The budget loop (BR-004) starts at the first level and moves to the next while the drawing
# is over budget; the number of levels is the loop's iteration cap.
DETAIL_LEVELS: tuple[DetailLevel, ...] = (
    DetailLevel(0.6, (60, 105), 0.8, 8.0),
    DetailLevel(0.8, (60, 105), 1.0, 12.0),
    DetailLevel(1.1, (60,), 1.3, 18.0),
    DetailLevel(1.5, (60,), 1.7, 26.0),
    DetailLevel(2.1, (), 2.2, 38.0),
    DetailLevel(3.0, (), 3.0, 56.0),
)
