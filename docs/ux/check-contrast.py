#!/usr/bin/env python3
"""Check WCAG 2.x contrast of every token pair Fineline uses.

Reads the colours from docs/ux/tokens.css (next to this script), so the check
stays in sync with the tokens. Prints a markdown table and exits 1 if a pair
fails. Run: python3 docs/ux/check-contrast.py
"""
import re
import sys
from pathlib import Path

TOKENS = Path(__file__).with_name("tokens.css")

# (foreground, background, kind, where it is used)
# kind: "text" needs 4.5:1, "large" (>= 24px, or >= 18.66px bold) and "ui" (component
# boundaries, icons, focus rings, state indicators) need 3:1.
PAIRS = [
    ("text", "bg", "text", "Body text on page"),
    ("text", "surface", "text", "Body text on cards, inputs, tables"),
    ("text", "surface-sunken", "text", "Table header text"),
    ("text-muted", "bg", "text", "Hints and captions on page"),
    ("text-muted", "surface", "text", "Hints and captions on cards"),
    ("text-muted", "surface-sunken", "text", "Muted text in table header / sunken panel"),
    ("text-muted", "primary-subtle", "text", "Frame size/price hint in selected frame card"),
    ("text", "primary-subtle", "text", "Frame name in selected frame card"),
    ("link", "bg", "text", "Links on page"),
    ("link", "surface", "text", "Links on cards and tables"),
    ("on-primary", "primary", "text", "Primary button label"),
    ("on-primary", "primary-hover", "text", "Primary button label, hover/active"),
    ("primary", "surface", "text", "Secondary button label and border (outline button)"),
    ("primary", "bg", "ui", "Selected frame card border / checked radio on page"),
    ("primary", "surface", "ui", "Checked checkbox / radio fill on input"),
    ("border-strong", "surface", "ui", "Input, checkbox, radio, card borders on surface"),
    ("border-strong", "bg", "ui", "Input borders on page background"),
    ("focus", "bg", "ui", "Focus ring on page background"),
    ("focus", "surface", "ui", "Focus ring on cards"),
    ("focus", "primary-subtle", "ui", "Focus ring on selected frame card"),
    ("focus", "surface-sunken", "ui", "Focus ring in table header / sunken panel"),
    ("danger", "bg", "text", "Inline error text on page"),
    ("danger", "surface", "text", "Inline error text on cards; invalid input border"),
    ("danger", "danger-subtle", "text", "Error summary / banner text"),
    ("text", "danger-subtle", "text", "Body text inside error summary"),
    ("on-danger", "danger", "text", "Destructive button label (Cancel order)"),
    ("on-danger", "danger-hover", "text", "Destructive button label, hover"),
    ("success", "success-subtle", "text", "Success banner text"),
    ("success", "bg", "text", "Success text on page"),
    ("text", "success-subtle", "text", "Body text inside success banner"),
    ("warning", "warning-subtle", "text", "Warning banner text (preview expiry, Late tag)"),
    ("warning", "surface", "text", "Late tag text on table rows"),
    ("info", "info-subtle", "text", "Info notice text (withdrawal notice)"),
    ("text", "info-subtle", "text", "Body text in info notice"),
    ("disabled-text", "disabled-bg", "text", "Disabled control label (exempt, kept readable)"),
    ("disabled-text", "surface", "text", "Disabled input text"),
    ("status-received-text", "status-received-bg", "text", "Badge: Received"),
    ("status-drawing-text", "status-drawing-bg", "text", "Badge: Drawing"),
    ("status-drawn-text", "status-drawn-bg", "text", "Badge: Drawn"),
    ("status-ready-to-ship-text", "status-ready-to-ship-bg", "text", "Badge: Ready to ship"),
    ("status-shipped-text", "status-shipped-bg", "text", "Badge: Shipped"),
    ("status-cancelled-text", "status-cancelled-bg", "text", "Badge: Cancelled"),
    ("primary-hover", "surface", "text", "Secondary button label, hover"),
    ("danger", "bg", "ui", "Invalid input border / error icon on page"),
    ("warning", "bg", "text", "Warning text on page (Late tag outside table)"),
]

MIN = {"text": 4.5, "large": 3.0, "ui": 3.0}


def load_colours() -> dict[str, str]:
    css = TOKENS.read_text(encoding="utf-8")
    return {m[0]: m[1] for m in re.findall(r"--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})", css)}


def luminance(hex_colour: str) -> float:
    rgb = [int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def ratio(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def main() -> int:
    colours = load_colours()
    failed = 0
    print("| Foreground | Background | Ratio | Needs | Result | Use |")
    print("|---|---|---|---|---|---|")
    for fg, bg, kind, use in PAIRS:
        r = ratio(colours[fg], colours[bg])
        ok = r >= MIN[kind]
        failed += not ok
        print(
            f"| `color.{fg}` {colours[fg]} | `color.{bg}` {colours[bg]} | {r:.2f}:1 | "
            f"{MIN[kind]}:1 | {'pass' if ok else 'FAIL'} | {use} |"
        )
    print(f"\n{len(PAIRS) - failed}/{len(PAIRS)} pairs pass.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
