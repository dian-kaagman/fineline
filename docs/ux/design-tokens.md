# Design tokens - first slice

`tokens.css` (next to this file) holds the same values as CSS custom properties; copy it into `apps/web` unchanged. Component CSS uses only these tokens: no hard-coded colours, font sizes, spacing or radii (UX-012). Token names below use dots (`color.text`); in CSS they are `--color-text`.

Look and feel: a quiet "paper and ink" shop. Warm off-white page, near-black ink text, one deep teal for actions, so the black line drawing is the most striking thing on the page. Light theme only in this slice; the drawing preview is always shown on white paper (`color.surface`) whatever the theme (later: dark theme).

## Colour

| Token | Value | Use |
|---|---|---|
| color.bg | #faf8f5 | Page background |
| color.surface | #ffffff | Cards, inputs, tables, dialogs, the drawing "paper" |
| color.surface-sunken | #f1eee9 | Table header, skeleton placeholders, sunken panels |
| color.text | #1a1a1a | Body text, headings |
| color.text-muted | #5c5955 | Hints, captions, secondary facts |
| color.border-strong | #85807a | Borders of inputs, checkboxes, radios, frame cards (the visible boundary of a control) |
| color.border-subtle | #e3ded8 | Decorative dividers only; never the only boundary of a control |
| color.primary | #0f5c63 | Primary button, selected frame card border, checked checkbox/radio |
| color.primary-hover | #0b464c | Hover/active of primary; secondary button hover text |
| color.on-primary | #ffffff | Text/icons on primary |
| color.primary-subtle | #e3f0f1 | Background of the selected frame card |
| color.link | #0f5c63 | Links (always underlined) |
| color.focus | #2b59c3 | Focus ring (3 px, 2 px offset) on every focusable element |
| color.danger | #b42318 | Error text and icon, invalid input border, destructive button |
| color.danger-hover | #8f1c13 | Destructive button hover |
| color.on-danger | #ffffff | Text on destructive button |
| color.danger-subtle | #fdeceb | Error summary and error banner background |
| color.success / success-subtle | #1e6b3a / #e8f4ec | Success banner (saved, status changed) |
| color.warning / warning-subtle | #7a4f00 / #fff4d6 | "Preview no longer available" and "frame just sold out" notices |
| color.info / info-subtle | #1d4f91 / #e8f0fb | Withdrawal notice, neutral notices |
| color.disabled-text / disabled-bg | #625e59 / #ebe7e1 | Disabled controls (exempt from contrast rules, kept readable anyway) |

### Order status badges

Always the text label plus colour, never colour alone (UX-011). Labels from the glossary.

| Status (code) | Label | Background token | Text token |
|---|---|---|---|
| received | Received | color.status-received-bg #e8f0fb | color.status-received-text #1d4f91 |
| drawing | Drawing | color.status-drawing-bg #f1eafb | color.status-drawing-text #5b2a96 |
| drawn | Drawn | color.status-drawn-bg #e3f0f1 | color.status-drawn-text #0b464c |
| ready_to_ship | Ready to ship | color.status-ready-to-ship-bg #fff4d6 | color.status-ready-to-ship-text #7a4f00 |
| shipped | Shipped | color.status-shipped-bg #e8f4ec | color.status-shipped-text #1e6b3a |
| cancelled | Cancelled | color.status-cancelled-bg #ebe7e1 | color.status-cancelled-text #4a4743 |

Badges have no border: a badge is text, so only its text contrast matters; its shape and fill carry no meaning of their own.

## Typography

| Token | Value | Use |
|---|---|---|
| font.family-base | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | Everything. No web fonts (no third-party requests, fast on phones) |
| font.family-mono | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` | Order numbers (`FL-2026-0042`) so digits line up in the admin list |
| font.size-xs | 0.875rem (14 px) | Captions, table meta. Never for inputs or body text |
| font.size-sm | 1rem (16 px) | Body text, labels, inputs, buttons (16 px stops iOS from zooming on focus) |
| font.size-md | 1.125rem (18 px) | Lead paragraph, frame names |
| font.size-lg | 1.25rem (20 px) | h3, card titles |
| font.size-xl | 1.5rem (24 px) | h2; h1 on phones |
| font.size-2xl | 2rem (32 px) | h1 from `bp.md`; order number on the confirmation |
| font.size-3xl | 2.5rem (40 px) | Shop heading on step 1 from `bp.md` |
| font.weight-regular / semibold / bold | 400 / 600 / 700 | Body / labels, buttons, table headers / headings |
| line-height.body / heading | 1.5 / 1.2 | |
| measure | 38rem | Max width of running text |

All sizes in `rem` so they follow the browser's text size (UX-013). Line heights are unitless.

## Spacing, radii, sizes

| Token | Value | Use |
|---|---|---|
| space.1 - space.8 | 4, 8, 12, 16, 24, 32, 48, 64 px (as rem) | Spacing scale. Form field gap `space.5`; section gap `space.7` |
| radius.sm / md / lg / pill | 4 / 8 / 12 / 999 px | Inputs, badges / buttons, cards / dialogs, frame cards / pill tags |
| border-width / border-width-strong | 1 / 2 px | Default / selected frame card and invalid input |
| focus-ring | 3 px solid `color.focus`, offset 2 px | `:focus-visible` on everything (UX-002) |
| shadow.paper | `0 1px 2px rgb(0 0 0 / .08), 0 4px 16px rgb(0 0 0 / .08)` | The drawing preview "sheet" |
| shadow.dialog | `0 8px 32px rgb(0 0 0 / .24)` | Dialogs |
| target-min | 44 px | Min height and width of every customer control (UX-004) |
| target-min-dense | 32 px | Min height of admin table row buttons (UX-004) |
| content-max-shop | 40rem (640 px) | Customer column |
| content-max-admin | 75rem (1200 px) | Admin content |
| header-height | 3.5rem | Sticky header; also `scroll-padding-top` so focus is never hidden (UX-002) |

## Breakpoints (min-width, mobile first)

| Token | Value | What changes |
|---|---|---|
| bp.sm | 30em (480 px) | Frame cards 2 per row |
| bp.md | 48em (768 px) | h1 32 px; admin form fields in 2 columns |
| bp.lg | 64em (1024 px) | Order detail in 2 columns (drawing left, facts and actions right); customer preview next to its actions. Below it, admin tables scroll inside their own region (UX-013) |
| bp.xl | 80em (1280 px) | Wider admin margins only |

Media queries can't read custom properties; use the literal `em` values (listed in `tokens.css`). The design must work from 320 CSS px wide (UX-013).

## Motion

| Token | Value | Use |
|---|---|---|
| motion.duration-fast / base | 150 / 250 ms | Hover, focus, step transitions (fade only, no sliding) |
| motion.easing | `cubic-bezier(0.2, 0, 0, 1)` | |
| pen-animation-duration | 2.4 s, looping | The pen line drawing itself while a drawing is made (C2) |

Under `prefers-reduced-motion: reduce` all durations are 0 and the pen animation is replaced by a static illustration (UX-010); `tokens.css` already does the token part.

## Contrast check

Computed with `python3 docs/ux/check-contrast.py` (WCAG relative-luminance formula, reads `tokens.css`). Text needs 4.5:1; UI components, focus rings and state indicators 3:1. Re-run after changing any colour; the script exits 1 on a failure, so CI can run it.

| Foreground | Background | Ratio | Needs | Result | Use |
|---|---|---|---|---|---|
| `color.text` #1a1a1a | `color.bg` #faf8f5 | 16.42:1 | 4.5:1 | pass | Body text on page |
| `color.text` #1a1a1a | `color.surface` #ffffff | 17.40:1 | 4.5:1 | pass | Body text on cards, inputs, tables |
| `color.text` #1a1a1a | `color.surface-sunken` #f1eee9 | 15.04:1 | 4.5:1 | pass | Table header text |
| `color.text-muted` #5c5955 | `color.bg` #faf8f5 | 6.57:1 | 4.5:1 | pass | Hints and captions on page |
| `color.text-muted` #5c5955 | `color.surface` #ffffff | 6.96:1 | 4.5:1 | pass | Hints and captions on cards |
| `color.text-muted` #5c5955 | `color.surface-sunken` #f1eee9 | 6.02:1 | 4.5:1 | pass | Muted text in table header / sunken panel |
| `color.text-muted` #5c5955 | `color.primary-subtle` #e3f0f1 | 5.97:1 | 4.5:1 | pass | Frame size/price hint in selected frame card |
| `color.text` #1a1a1a | `color.primary-subtle` #e3f0f1 | 14.92:1 | 4.5:1 | pass | Frame name in selected frame card |
| `color.link` #0f5c63 | `color.bg` #faf8f5 | 7.25:1 | 4.5:1 | pass | Links on page |
| `color.link` #0f5c63 | `color.surface` #ffffff | 7.69:1 | 4.5:1 | pass | Links on cards and tables |
| `color.on-primary` #ffffff | `color.primary` #0f5c63 | 7.69:1 | 4.5:1 | pass | Primary button label |
| `color.on-primary` #ffffff | `color.primary-hover` #0b464c | 10.53:1 | 4.5:1 | pass | Primary button label, hover/active |
| `color.primary` #0f5c63 | `color.surface` #ffffff | 7.69:1 | 4.5:1 | pass | Secondary button label and border (outline button) |
| `color.primary` #0f5c63 | `color.bg` #faf8f5 | 7.25:1 | 3.0:1 | pass | Selected frame card border / checked radio on page |
| `color.primary` #0f5c63 | `color.surface` #ffffff | 7.69:1 | 3.0:1 | pass | Checked checkbox / radio fill on input |
| `color.border-strong` #85807a | `color.surface` #ffffff | 3.91:1 | 3.0:1 | pass | Input, checkbox, radio, card borders on surface |
| `color.border-strong` #85807a | `color.bg` #faf8f5 | 3.69:1 | 3.0:1 | pass | Input borders on page background |
| `color.focus` #2b59c3 | `color.bg` #faf8f5 | 5.97:1 | 3.0:1 | pass | Focus ring on page background |
| `color.focus` #2b59c3 | `color.surface` #ffffff | 6.33:1 | 3.0:1 | pass | Focus ring on cards |
| `color.focus` #2b59c3 | `color.primary-subtle` #e3f0f1 | 5.42:1 | 3.0:1 | pass | Focus ring on selected frame card |
| `color.focus` #2b59c3 | `color.surface-sunken` #f1eee9 | 5.47:1 | 3.0:1 | pass | Focus ring in table header / sunken panel |
| `color.danger` #b42318 | `color.bg` #faf8f5 | 6.20:1 | 4.5:1 | pass | Inline error text on page |
| `color.danger` #b42318 | `color.surface` #ffffff | 6.57:1 | 4.5:1 | pass | Inline error text on cards; invalid input border |
| `color.danger` #b42318 | `color.danger-subtle` #fdeceb | 5.75:1 | 4.5:1 | pass | Error summary / banner text |
| `color.text` #1a1a1a | `color.danger-subtle` #fdeceb | 15.23:1 | 4.5:1 | pass | Body text inside error summary |
| `color.on-danger` #ffffff | `color.danger` #b42318 | 6.57:1 | 4.5:1 | pass | Destructive button label (Cancel order) |
| `color.on-danger` #ffffff | `color.danger-hover` #8f1c13 | 8.96:1 | 4.5:1 | pass | Destructive button label, hover |
| `color.success` #1e6b3a | `color.success-subtle` #e8f4ec | 5.77:1 | 4.5:1 | pass | Success banner text |
| `color.success` #1e6b3a | `color.bg` #faf8f5 | 6.15:1 | 4.5:1 | pass | Success text on page |
| `color.text` #1a1a1a | `color.success-subtle` #e8f4ec | 15.40:1 | 4.5:1 | pass | Body text inside success banner |
| `color.warning` #7a4f00 | `color.warning-subtle` #fff4d6 | 6.51:1 | 4.5:1 | pass | Warning notice text (preview no longer available, sold out) |
| `color.warning` #7a4f00 | `color.surface` #ffffff | 7.13:1 | 4.5:1 | pass | Warning text on cards and tables |
| `color.info` #1d4f91 | `color.info-subtle` #e8f0fb | 7.09:1 | 4.5:1 | pass | Info notice text (withdrawal notice) |
| `color.text` #1a1a1a | `color.info-subtle` #e8f0fb | 15.16:1 | 4.5:1 | pass | Body text in info notice |
| `color.disabled-text` #625e59 | `color.disabled-bg` #ebe7e1 | 5.22:1 | 4.5:1 | pass | Disabled control label (exempt, kept readable) |
| `color.disabled-text` #625e59 | `color.surface` #ffffff | 6.43:1 | 4.5:1 | pass | Disabled input text |
| `color.status-received-text` #1d4f91 | `color.status-received-bg` #e8f0fb | 7.09:1 | 4.5:1 | pass | Badge: Received |
| `color.status-drawing-text` #5b2a96 | `color.status-drawing-bg` #f1eafb | 8.08:1 | 4.5:1 | pass | Badge: Drawing |
| `color.status-drawn-text` #0b464c | `color.status-drawn-bg` #e3f0f1 | 9.02:1 | 4.5:1 | pass | Badge: Drawn |
| `color.status-ready-to-ship-text` #7a4f00 | `color.status-ready-to-ship-bg` #fff4d6 | 6.51:1 | 4.5:1 | pass | Badge: Ready to ship |
| `color.status-shipped-text` #1e6b3a | `color.status-shipped-bg` #e8f4ec | 5.77:1 | 4.5:1 | pass | Badge: Shipped |
| `color.status-cancelled-text` #4a4743 | `color.status-cancelled-bg` #ebe7e1 | 7.50:1 | 4.5:1 | pass | Badge: Cancelled |
| `color.primary-hover` #0b464c | `color.surface` #ffffff | 10.53:1 | 4.5:1 | pass | Secondary button label, hover |
| `color.danger` #b42318 | `color.bg` #faf8f5 | 6.20:1 | 3.0:1 | pass | Invalid input border / error icon on page |
| `color.warning` #7a4f00 | `color.bg` #faf8f5 | 6.72:1 | 4.5:1 | pass | Warning text on page |

45/45 pairs pass.

The focus ring sits 2 px outside the element (offset), so it is always measured against the background behind the element (`color.bg`, `color.surface`, `color.surface-sunken` or `color.primary-subtle`), never against a button's fill.

## Component patterns (built from the tokens)

| Component | Spec |
|---|---|
| Primary button | bg `color.primary`, text `color.on-primary`, `font.size-sm` semibold, min height `target-min`, padding `space.3` x `space.5`, `radius.md`; full width on phones below `bp.sm` in the customer flow. One primary button per step/screen |
| Secondary button | bg `color.surface`, 2 px border and text `color.primary`, same size as primary |
| Text button / link | `color.link`, underlined, min target `target-min` (customer) by padding |
| Destructive button | bg `color.danger`, text `color.on-danger`; only inside the cancel-order confirmation dialog |
| Busy button | keeps its width, shows a 16 px spinner (static under reduced motion) and the busy label (e.g. "Placing order..."); `aria-disabled="true"`, ignores further clicks (UX-022) |
| Text input | bg `color.surface`, 1 px `color.border-strong`, `radius.sm`, min height `target-min`, `font.size-sm`; invalid: 2 px `color.danger` border + error text (UX-006) |
| Checkbox / radio | native inputs, 24 x 24 px drawn size, whole label row clickable to at least `target-min` high |
| Frame card | native radio inside a label; 1 px `color.border-strong`, `radius.lg`; selected: 2 px `color.primary` border, `color.primary-subtle` bg and a check icon (UX-011) |
| Notice | bg `*-subtle`, 4 px left border in the matching strong colour, icon + text; `radius.md` |
| Error summary | Notice in danger colours with heading "There is a problem" and a list of links to fields (UX-006) |
| Status badge | `radius.pill`, `font.size-xs` semibold, padding `space.1` x `space.3`, colours from the status table |
| Skeleton | `color.surface-sunken` blocks; no shimmer animation |
| Drawing sheet | `color.surface` with `shadow.paper`, aspect ratio of the drawing (`widthMm / heightMm`), drawing as `<img>` at 100 % width, padding proportional to the paper margin (8 %) |
