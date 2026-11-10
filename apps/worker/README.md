# Fineline conversion worker

Internal service that turns a customer's photo into a pen-plottable SVG drawing: black
unfilled strokes in millimetres, inside the drawing area and within the stroke budget
(BR-002 to BR-004). Only the API calls it, over the private network, with a shared bearer
token. Browsers never reach it, and it stores nothing (SR-005).

Contract: [`docs/api/worker-openapi.yaml`](../../docs/api/worker-openapi.yaml). Approach:
[ADR 0002](../../docs/decisions/0002-python-worker-edge-contour-line-drawing.md) and the
"Conversion approach" section of `openspec/changes/archive/2026-11-10-kickstart/design.md`.

## Quick start

Needs [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 from `.python-version` if needed).

```sh
cd apps/worker
uv sync                                   # installs the locked dependencies, dev tools included
cp .env.example .env                      # then set WORKER_TOKEN (see below)
set -a && . ./.env && set +a              # load .env into the shell
uv run fineline-worker                    # serves on http://localhost:8000
curl -s localhost:8000/health             # {"status":"ok"}
```

Convert a photo by hand (the API sends exactly these fields):

```sh
curl -s -H "Authorization: Bearer $WORKER_TOKEN" \
  -F photo=@photo.jpg -F areaWidthMm=180 -F areaHeightMm=267 \
  -F maxStrokes=1500 -F maxTotalLengthMm=25000 \
  localhost:8000/v1/convert
```

## Commands

| What | Command |
|---|---|
| Install (exactly the lockfile) | `uv sync --frozen` |
| Run | `uv run fineline-worker` (or `uv run python -m fineline_worker`) |
| Lint | `uv run ruff check .` |
| Format check / format | `uv run ruff format --check .` / `uv run ruff format .` |
| Typecheck (mypy strict) | `uv run mypy` |
| Tests (all, includes the performance test) | `uv run pytest` |
| Tests without the performance test | `uv run pytest -m "not perf"` |
| Performance and memory numbers | `uv run pytest -m perf -s` |
| Preview drawings of your own photos | `uv run python scripts/preview.py out/ photo1.jpg photo2.heic` (`out/` is git-ignored) |
| Add a dependency | `uv add <package>` (dev tools: `uv add --dev <package>`) |

## Configuration

Only from the environment, validated at startup; the worker refuses to start and names the
variable when one is wrong (SR-020). See `.env.example`.

| Variable | Default | Meaning |
|---|---|---|
| `WORKER_TOKEN` | (required) | Shared secret with the API, at least 32 characters; the `.env.example` placeholder is refused. Generate with `openssl rand -base64 32`. |
| `PORT` | `8000` | HTTP port. |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info` or `debug` (Python names also work). |
| `MAX_CONCURRENT_CONVERSIONS` | `2` | Conversions at the same time; a request that gets no slot within about 1 s is answered 503 `busy` with `Retry-After: 5` (SR-004). |

The drawing area and stroke budget are not worker configuration: the API sends them with every
request, so the API's configuration is the one place that owns them.

## Layout

```
src/fineline_worker/
  params.py       every tuning constant (see "Tuning the drawing")
  decode.py       Pillow-only decoding: JPEG/PNG/HEIF, pixel limit before decoding, EXIF orientation
  extract.py      brightness stretch, CLAHE, bilateral smoothing, Canny edge map, edge preview, tone masks
  trace.py        edge map -> open polylines (each pixel once); tone contours without border/edge parts
  strokes.py      simplification (RDP), joining near ends, short-stroke filter, pen-travel order
  svg.py          fit and centre in the drawing area, SVG writer (one black path per stroke)
  pipeline.py     convert_photo(): decode -> budget loop over detail levels -> final guarantee -> SVG
  http_input.py   multipart parsing and parameter validation for POST /v1/convert
  app.py          FastAPI app: bearer check, body cap, conversion slots, routes, error shape, request log
  config.py       environment validation
  logs.py         JSON log lines
  __main__.py     entry point (uvicorn)
tests/            pytest; generated test images only (tests/images.py), no real photos
scripts/preview.py  convert photos on disk to SVG + PNG for tuning
```

Business logic (`pipeline.py` and below) has no HTTP in it and is tested directly; the HTTP layer
is tested through FastAPI's test client.

## How it works

1. **Decode safely** (SR-003): Pillow with only JPEG, PNG and HEIF (pillow-heif) enabled. The
   pixel count is checked right after `open()`, which reads only the header, so a 30,000 x
   30,000 px image bomb is refused before any pixel is decoded (`photo_too_many_pixels`, over
   50 MP). The shortest side must be at least `minShortSidePx` (default 800,
   `photo_too_small`). OpenCV never sees raw bytes (a Ruff rule bans `cv2.imdecode`/`imread`).
   Any decoder failure (damaged file, mismatched HEIF header) is `photo_unreadable`; damaged
   EXIF only means no orientation fix. The photo is reduced to a 1000 px 8-bit grayscale working
   image: JPEGs are decoded at reduced size (draft mode); PNG and HEIF are decoded at full size,
   one large one at a time, and converted in strips (16-bit samples scaled by bit depth,
   transparency drawn on white), so a 50 MP PNG costs about one byte array of the photo, not
   several. EXIF orientation is applied and only the pixels go on, so no metadata survives.
2. **Prepare**: stretch the photo's own brightness range (1st to 99th percentile, gain at most
   8x) so faded, hazy or dark photos are drawn like normal ones; CLAHE; bilateral filter; a
   strongly blurred copy for tone contours.
3. **Lines**: Canny edges traced as open polylines (each edge pixel drawn once, not out and
   back), plus iso-brightness contours of the blurred image for hair and shadows at the photo's
   own darkness percentiles, without the parts along the image border (no frame around dark
   backgrounds) or right next to an edge (no double outlines).
4. **Clean up**: simplify, drop tiny fragments, join ends closer than `JOIN_GAP_PX`, drop
   strokes shorter than the level's minimum. Fewer than 20 strokes or under 0.5 m at the finest
   level is `no_drawable_content` (422).
5. **Fit**: scale uniformly and centre in the area (an area with more than two decimals is
   rounded down, never up); coordinates rounded to 0.01 mm.
6. **Budget loop** (BR-004): try the detail levels from fine to coarse until the drawing fits
   `maxStrokes` and `maxTotalLengthMm`; the number of levels caps the loop. Levels whose cheap
   edge preview is far over budget are skipped without tracing, and a level with more than
   `MAX_FRAGMENTS_PER_LEVEL` pieces is never cleaned up piece by piece, so busy photos (noise,
   gravel, crowds) take about a second. If the coarsest level is still over budget, or a coarser
   level comes out empty, the last level with lines is kept and its shortest strokes are dropped
   until it fits. Never over budget.
7. **Order and write**: greedy nearest-neighbour order (strokes reversed when that is shorter)
   and one `<path d="M x y L x y ..." fill="none" stroke="#000" stroke-width="0.5"
   stroke-linecap="round" stroke-linejoin="round"/>` per stroke. The root `<svg>` is always the
   full drawing area (`width`/`height` in mm and a matching `viewBox`).

The same photo always gives the same drawing with the same library versions.

## Tuning the drawing

All knobs are in `src/fineline_worker/params.py`. Tune with real photos using
`scripts/preview.py`, which writes the SVG and a PNG preview and prints strokes, length,
detail level and time. Keep customer photos out of git. After a change, run `uv run pytest`:
the tests check the drawing rules, the budget and the no-content rule.

| Constant | Effect | Turn up for | Turn down for |
|---|---|---|---|
| `DETAIL_LEVELS[0].canny_multiplier` | Edge sensitivity at the finest level (lower = more lines) | cleaner, sparser drawings | more facial detail (eyes, hair strands) |
| `CANNY_MIN_LOW` / `CANNY_MIN_HIGH` | Floors of the edge thresholds; stop noise in flat or dark photos becoming lines | noisy phone photos in low light | very soft, low-contrast photos |
| `CANNY_MAX_LOW` / `CANNY_MAX_HIGH` | Ceilings of the edge thresholds; keep soft features in bright photos | | bright photos losing the nose or lips |
| `CLAHE_CLIP_LIMIT` | Local contrast boost; brings out faces in shadow | backlit or shadowed faces | blotchy skin lines |
| `BILATERAL_*` | Smoothing that keeps outlines: removes skin texture and noise | fewer small wiggles | sharper fine detail |
| `STRETCH_*` | Brightness stretch before everything else; `STRETCH_MAX_GAIN` limits how much a faded photo is boosted | faded or hazy photos | grainy near-blank photos turning into lines |
| `tone_percentiles` per level | Darkness percentiles traced as shading contours (12 = outline of the darkest 12 %); fewer = less shading | more hair and shadow shapes | a cleaner, outline-only look |
| `TONE_MIN_CONTRAST` | A shading level is only used when it is this much darker than the median | fewer shading loops in flat photos | shading in low-contrast photos |
| `TONE_BLUR_SIGMA_PX` | How smooth the shading contours are | rounder, calmer shading lines | shading that follows detail |
| `TONE_EDGE_CLEARANCE_PX` | Removes shading lines that run next to an edge | fewer doubled outlines | more shading kept (0 keeps all) |
| `simplify_epsilon_px` per level | Allowed deviation when straightening lines | smaller SVGs, faster drawing | smoother curves |
| `min_stroke_length_px` per level | Shortest stroke kept | fewer specks and pen lifts | small details such as eye highlights |
| `JOIN_GAP_PX` | Joins stroke ends this close (fewer pen lifts) | fewer pen lifts | no unwanted connections |
| `WORKING_LONG_SIDE_PX` | Working image size: finer detail but slower and more strokes | detail | speed |
| `NO_CONTENT_MIN_STROKES` / `NO_CONTENT_MIN_LENGTH_MM` | When a photo counts as having no drawable content | refusing more near-blank photos | accepting sparse drawings |
| `SKIP_LEVEL_OVER_BUDGET_FACTOR` / `MAX_FRAGMENTS_PER_LEVEL` | Speed guards for busy photos (not about looks) | | |
| `LARGE_DECODE_PIXELS` | PNG/HEIF photos above this are decoded one at a time (memory) | | less memory, more waiting |

Pixel values refer to the 1000 px working image; at the default A4 area one working pixel is
about 0.18 to 0.24 mm on paper. The first detail level is what most portraits get; the later
levels only apply when a busy photo is over budget, so keep them progressively coarser.
`STROKE_WIDTH_MM` (0.5) only affects how the preview looks; the pen decides the real width.

## Security notes

- Bearer token compared in constant time (`hmac.compare_digest`); `/health` is the only open
  route. `/docs`, `/redoc` and `/openapi.json` are disabled.
- Request bodies over 16 MiB are refused with 413 `payload_too_large`, by `Content-Length` or
  while streaming.
- Logs are JSON lines with sizes, timings and error codes only: no file names, EXIF, image data,
  SVG or tokens (SR-018). Pillow's debug logging, which prints EXIF values, is kept at warning.
- Stateless: nothing is written to disk except the framework's spooling of uploads over 1 MB to
  `/tmp`. In Docker give `/tmp` a tmpfs of at least 64 MB (two conversions in flight, plus
  requests waiting for a slot, each up to 16 MB).
- Memory (SR-004), measured by `tests/test_memory.py` (`uv run pytest -m perf -s`): two
  conversions at once of the largest accepted photos peak at about 300 MB of process memory
  for 49-50 MP RGBA/LA/palette PNGs and about 470 MB for 48 MP HEICs (one large PNG/HEIF decode
  at a time; the second waits for it). A 1 GiB container limit leaves ample room.
- Thread pools are bounded: OpenCV runs one thread per conversion, and `OMP_NUM_THREADS` /
  `OPENBLAS_NUM_THREADS` default to 1 (set in the package and the Dockerfile).

## Docker

```sh
docker build -t fineline-worker apps/worker
docker run --rm -p 127.0.0.1:8000:8000 -e WORKER_TOKEN="$(openssl rand -base64 32)" \
  --read-only --tmpfs /tmp:size=64m --cap-drop ALL --security-opt no-new-privileges \
  fineline-worker
```

Multi-stage build with uv on `python:3.12-slim-trixie`; the runtime image holds only the
virtual environment (no uv, no sources, no dev tools), runs as user `worker` (uid 10001), works
with a read-only root filesystem and has a `HEALTHCHECK` on `GET /health`. In compose the worker
publishes no port (the `-p` above is for trying it alone).
