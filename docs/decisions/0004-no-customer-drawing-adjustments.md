# 0004 No customer adjustments of the drawing in the kickstart

- Status: accepted
- Date: 2026-01 (kickstart)

## Context

Open question in the brief and the domain pack: may customers adjust the drawing (detail level, crop) before ordering? BR-005 says the order stores exactly the previewed drawing.

## Decision

Not in the first slice. The customer sees the generated preview and either orders it or discards it and uploads another photo (processes.md: "they need a way to try another photo"). The conversion has no customer-facing parameters.

## Consequences

- Smaller, safer slice; the riskiest part (a good automatic drawing within budget) gets the attention.
- Customers with a busy background or a small face in the photo must crop before uploading; the upload screen says to use a close, well-lit portrait.
- Adding a detail slider or crop later is a contained change: extra parameters to `POST /api/v1/drawings` and the worker, each producing a new preview (BR-005 still holds because the chosen preview is what gets ordered).

## Alternatives considered

- Detail level (low / medium / high): cheap in the worker, but every option must stay within the stroke budget and needs UX work; first candidate for a follow-up change.
- In-browser crop before upload: good UX on phones but adds a sizeable UI component; follow-up.
