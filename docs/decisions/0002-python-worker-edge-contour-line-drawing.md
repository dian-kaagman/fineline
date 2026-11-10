# 0002 Photo-to-drawing conversion in a Python worker, with edge-and-contour line art

- Status: accepted
- Date: 2026-01 (kickstart)

## Context

The riskiest must-have: turn a customer's photo into a portrait made of black pen strokes that a Rotrics arm can draw in reasonable time (BR-002 to BR-004), in seconds, on our own server, with no third-party image or AI services (BR-010, constraints). The brief allows a separate Python worker if that gives a clearly better drawing, and asks which line-drawing approach to use and how to keep drawing time reasonable.

## Decision

1. **Python worker.** The conversion runs in `apps/worker`, a stateless FastAPI service using OpenCV, NumPy, Pillow and pillow-heif, reachable only by the API over the private network with a shared bearer token. The TypeScript image ecosystem has no equivalent of OpenCV's edge detection, contour tracing, CLAHE and bilateral filtering, and HEIC decoding (BR-001) is mature in pillow-heif. This is a clearly better drawing for little cost: one more small container.
2. **Approach: edge-and-contour line art.** Canny edges (thresholds from the image median) for outlines and features, plus a few iso-luminance contour lines of a blurred image for shading - all as open strokes, never fills. Polylines are simplified (Ramer-Douglas-Peucker), very short strokes dropped, near-touching ends joined, and strokes ordered by greedy nearest-neighbour to keep pen-up travel short. Output is scaled to fit and centred in the drawing area in millimetres.
3. **Drawing time.** A hard stroke budget (BR-004, default 25 m total length and 1,500 strokes, configurable) enforced by a coarsening loop (raise thresholds, fewer contour levels, longer minimum stroke, stronger simplification) with a final guarantee that drops the shortest strokes. The API re-validates every result (elements, colours, bounds, budget) before storing it.
4. **Synchronous call.** The API calls the worker per upload and waits (timeout 30 s by default); the web app shows progress. At a handful of orders a day, a job queue is not worth it yet.

## Consequences

- Recognisable portraits with a sketch look; quality on real photos must be tuned by the owner with real photos on the arm (parameters are kept in one module).
- Deterministic output for the same input, which makes tests and BR-005 ("the preview is the order") straightforward: the API stores the exact SVG it showed.
- Python joins the stack (uv, Ruff, mypy, pytest in CI).

## Alternatives considered

- **Continuous single line (TSP art / stippling + tour):** striking and one stroke only, but slow to compute well for a phone user's wait, and long drawing times; candidate for a later "style" option.
- **Hatching by tone:** good shading but many strokes; blows the budget for detailed faces.
- **Raster tracing with potrace:** traces outlines of filled regions, so strokes double around every shape and look like outlines of blobs rather than pen lines.
- **TypeScript only (sharp + hand-written edge detection):** one language less, but clearly weaker results and no HEIC support without native add-ons.
- **Third-party AI line-art services:** excluded by the brief (personal data processed on our own server).
