/**
 * Strict allowlist check of a drawing SVG (SR-006, BR-002, BR-003, BR-004).
 *
 * Runs on the exact bytes that will be stored and shown. A tiny hand-written tokenizer accepts only
 * the grammar the worker emits: an optional XML declaration, one `<svg>` root, `<g>` groups and
 * `<path>` elements with allowlisted attributes. No DOCTYPE, entities, comments, CDATA, processing
 * instructions or text. The metrics (stroke count, total length, bounds) are recomputed from `d`;
 * the worker's reported metrics are never trusted.
 */

export interface DrawingLimits {
  areaWidthMm: number;
  areaHeightMm: number;
  maxStrokes: number;
  maxTotalLengthMm: number;
}

export interface DrawingMetrics {
  widthMm: number;
  heightMm: number;
  strokeCount: number;
  totalLengthMm: number;
}

export type DrawingCheck = { ok: true; metrics: DrawingMetrics } | { ok: false; rule: string };

export const MAX_SVG_BYTES = 2 * 1024 * 1024;
const EPSILON = 1e-6;
const CURVE_SEGMENTS = 16;
const MAX_STROKE_WIDTH = 5;
const SVG_NS = "http://www.w3.org/2000/svg";

class Reject extends Error {
  constructor(public readonly rule: string) {
    super(rule);
  }
}

const XML_DECLARATION =
  /^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(["'])1\.[01]\1([ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(["'])(UTF-8|utf-8)\3)?([ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(["'])(yes|no)\6)?[ \t\r\n]*\?>/;
const NAME = /[A-Za-z_:][A-Za-z0-9_:.-]*/y;
const WHITESPACE = /[ \t\r\n]*/y;
const ATTR_VALUE = /(?:"([^"<&]*)"|'([^'<&]*)')/y;
const MM_LENGTH = /^(\d+(?:\.\d+)?)mm$/;
const PLAIN_NUMBER = /^\d+(?:\.\d+)?$/;
const NUMBER_SOURCE = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;

const COMMON_STYLE_ATTRS = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"];
const ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  svg: new Set(["xmlns", "width", "height", "viewBox", "version"]),
  g: new Set(COMMON_STYLE_ATTRS),
  path: new Set([...COMMON_STYLE_ATTRS, "d"]),
};

interface Style {
  fill?: string;
  stroke?: string;
}

interface Frame {
  name: string;
  style: Style;
}

interface Canvas {
  width: number;
  height: number;
}

interface Totals {
  strokes: number;
  length: number;
}

export function checkDrawingSvg(bytes: Uint8Array, limits: DrawingLimits): DrawingCheck {
  try {
    return { ok: true, metrics: check(bytes, limits) };
  } catch (err) {
    if (err instanceof Reject) return { ok: false, rule: err.rule };
    throw err;
  }
}

function check(bytes: Uint8Array, limits: DrawingLimits): DrawingMetrics {
  if (bytes.length === 0) throw new Reject("empty");
  if (bytes.length > MAX_SVG_BYTES) throw new Reject("too_large");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Reject("not_utf8");
  }

  let pos = 0;
  const decl = XML_DECLARATION.exec(text);
  if (decl) pos = decl[0].length;

  const stack: Frame[] = [];
  let canvas: Canvas | undefined;
  let rootClosed = false;
  const totals: Totals = { strokes: 0, length: 0 };

  const skipWhitespace = () => {
    WHITESPACE.lastIndex = pos;
    WHITESPACE.exec(text);
    pos = WHITESPACE.lastIndex;
  };
  const readName = (): string => {
    NAME.lastIndex = pos;
    const m = NAME.exec(text);
    if (!m) throw new Reject("malformed_tag");
    pos = NAME.lastIndex;
    return m[0];
  };

  for (;;) {
    skipWhitespace();
    if (pos >= text.length) break;
    if (text[pos] !== "<") throw new Reject("text_content");
    if (text.startsWith("<!", pos)) throw new Reject("markup_declaration");
    if (text.startsWith("<?", pos)) throw new Reject("processing_instruction");
    if (rootClosed) throw new Reject("content_after_root");

    if (text.startsWith("</", pos)) {
      pos += 2;
      const name = readName();
      skipWhitespace();
      if (text[pos] !== ">") throw new Reject("malformed_tag");
      pos += 1;
      const open = stack.pop();
      if (!open || open.name !== name) throw new Reject("unbalanced_tags");
      if (stack.length === 0) rootClosed = true;
      continue;
    }

    pos += 1;
    const name = readName();
    const attrs = new Map<string, string>();
    for (;;) {
      const before = pos;
      skipWhitespace();
      if (text.startsWith("/>", pos) || text[pos] === ">") break;
      if (pos === before) throw new Reject("malformed_tag");
      const attrName = readName();
      skipWhitespace();
      if (text[pos] !== "=") throw new Reject("malformed_attribute");
      pos += 1;
      skipWhitespace();
      ATTR_VALUE.lastIndex = pos;
      const v = ATTR_VALUE.exec(text);
      if (!v) throw new Reject("malformed_attribute_value");
      pos = ATTR_VALUE.lastIndex;
      if (attrs.has(attrName)) throw new Reject("duplicate_attribute");
      attrs.set(attrName, v[1] ?? v[2] ?? "");
    }
    const selfClosing = text.startsWith("/>", pos);
    pos += selfClosing ? 2 : 1;

    const allowed = ALLOWED_ATTRS[name];
    if (!allowed) throw new Reject(`element_not_allowed`);
    for (const attrName of attrs.keys()) {
      if (!allowed.has(attrName)) throw new Reject("attribute_not_allowed");
    }

    const parent = stack[stack.length - 1];
    if (name === "svg") {
      if (stack.length !== 0 || canvas) throw new Reject("nested_svg");
      canvas = readCanvas(attrs, limits);
    } else {
      if (!parent || !canvas) throw new Reject("root_not_svg");
      if (parent.name === "path") throw new Reject("path_has_children");
    }

    const style = inheritStyle(parent?.style ?? {}, attrs);
    if (name === "path") {
      if (style.fill !== "none") throw new Reject("fill_not_none");
      if (style.stroke === undefined) throw new Reject("stroke_missing");
      const d = attrs.get("d");
      if (d === undefined) throw new Reject("path_without_d");
      measurePath(d, canvas, totals);
    }

    if (!selfClosing) {
      stack.push({ name, style });
    } else if (name === "svg") {
      rootClosed = true;
    }
  }

  if (!canvas || stack.length !== 0 || !rootClosed) throw new Reject("unbalanced_tags");
  if (totals.strokes === 0) throw new Reject("no_strokes");
  if (totals.strokes > limits.maxStrokes) throw new Reject("too_many_strokes");
  if (totals.length > limits.maxTotalLengthMm + EPSILON) throw new Reject("too_long");

  return {
    widthMm: canvas.width,
    heightMm: canvas.height,
    strokeCount: totals.strokes,
    totalLengthMm: Math.round(totals.length * 10) / 10,
  };
}

function readCanvas(attrs: Map<string, string>, limits: DrawingLimits): Canvas {
  if (attrs.get("xmlns") !== SVG_NS) throw new Reject("bad_namespace");
  const version = attrs.get("version");
  if (version !== undefined && version !== "1.1" && version !== "1.0")
    throw new Reject("bad_version");
  const w = MM_LENGTH.exec(attrs.get("width") ?? "");
  const h = MM_LENGTH.exec(attrs.get("height") ?? "");
  if (!w || !h) throw new Reject("size_not_mm");
  const width = Number(w[1]);
  const height = Number(h[1]);
  if (width <= 0 || height <= 0) throw new Reject("size_not_mm");
  if (width > limits.areaWidthMm + EPSILON || height > limits.areaHeightMm + EPSILON) {
    throw new Reject("larger_than_area");
  }
  const viewBox = (attrs.get("viewBox") ?? "")
    .replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "")
    .split(/[ \t\r\n,]+/);
  const numbers = viewBox.map(Number);
  if (
    viewBox.length !== 4 ||
    !viewBox.every((v) => new RegExp(`^${NUMBER_SOURCE}$`).test(v)) ||
    numbers[0] !== 0 ||
    numbers[1] !== 0 ||
    Math.abs((numbers[2] ?? 0) - width) > EPSILON ||
    Math.abs((numbers[3] ?? 0) - height) > EPSILON
  ) {
    throw new Reject("viewbox_not_mm");
  }
  return { width, height };
}

function inheritStyle(parent: Style, attrs: Map<string, string>): Style {
  const style: Style = { ...parent };
  const fill = attrs.get("fill");
  if (fill !== undefined) {
    if (fill !== "none") throw new Reject("fill_not_none");
    style.fill = fill;
  }
  const stroke = attrs.get("stroke");
  if (stroke !== undefined) {
    if (stroke !== "#000" && stroke !== "#000000") throw new Reject("stroke_not_black");
    style.stroke = stroke;
  }
  const width = attrs.get("stroke-width");
  if (
    width !== undefined &&
    (!PLAIN_NUMBER.test(width) || Number(width) <= 0 || Number(width) > MAX_STROKE_WIDTH)
  ) {
    throw new Reject("bad_stroke_width");
  }
  const cap = attrs.get("stroke-linecap");
  if (cap !== undefined && !["round", "butt", "square"].includes(cap))
    throw new Reject("bad_linecap");
  const join = attrs.get("stroke-linejoin");
  if (join !== undefined && !["round", "miter", "bevel"].includes(join))
    throw new Reject("bad_linejoin");
  return style;
}

// XML/SVG whitespace only (space, tab, CR, LF): JS `\s` would also accept U+00A0, U+2028 and
// others that browsers and plotter software don't treat as separators.
const PATH_TOKEN = new RegExp(
  `[ \\t\\r\\n]*,?[ \\t\\r\\n]*(?:([MmLlHhVvCcQqZz])|(${NUMBER_SOURCE}))`,
  "y",
);
const ARG_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };

type PathToken = { cmd: string } | { num: number };

function tokenizePath(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  let pos = 0;
  const trimmed = d.replace(/[ \t\r\n]+$/, "");
  while (pos < trimmed.length) {
    PATH_TOKEN.lastIndex = pos;
    const m = PATH_TOKEN.exec(trimmed);
    if (!m || PATH_TOKEN.lastIndex === pos) throw new Reject("bad_path_data");
    pos = PATH_TOKEN.lastIndex;
    if (m[1]) tokens.push({ cmd: m[1] });
    else {
      const num = Number(m[2]);
      if (!Number.isFinite(num)) throw new Reject("bad_path_data");
      tokens.push({ num });
    }
  }
  return tokens;
}

/** Parses `d` with a strict numeric grammar, adds its strokes and length, and checks bounds. */
function measurePath(d: string, canvas: Canvas, totals: Totals): void {
  const tokens = tokenizePath(d);
  const first = tokens[0];
  if (!first || !("cmd" in first) || (first.cmd !== "M" && first.cmd !== "m")) {
    throw new Reject("bad_path_data");
  }

  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;
  let cmd = "";

  const point = (px: number, py: number) => {
    if (
      px < -EPSILON ||
      py < -EPSILON ||
      px > canvas.width + EPSILON ||
      py > canvas.height + EPSILON
    ) {
      throw new Reject("outside_area");
    }
  };
  const takeNumbers = (n: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const t = tokens[i++];
      if (!t || !("num" in t)) throw new Reject("bad_path_data");
      out.push(t.num);
    }
    return out;
  };
  const lineTo = (nx: number, ny: number) => {
    point(nx, ny);
    totals.length += Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
  };

  while (i < tokens.length) {
    const t = tokens[i] as PathToken;
    if ("cmd" in t) {
      cmd = t.cmd;
      i++;
    } else if (cmd === "" || cmd === "Z" || cmd === "z") {
      throw new Reject("bad_path_data");
    }
    // After a moveto's first pair, further pairs are implicit linetos.
    const upper = cmd.toUpperCase();
    const relative = cmd !== upper;
    const argc = ARG_COUNT[upper] as number;
    const args = takeNumbers(argc);
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;

    switch (upper) {
      case "M": {
        x = ox + (args[0] as number);
        y = oy + (args[1] as number);
        point(x, y);
        startX = x;
        startY = y;
        totals.strokes += 1;
        cmd = relative ? "l" : "L";
        break;
      }
      case "L":
        lineTo(ox + (args[0] as number), oy + (args[1] as number));
        break;
      case "H":
        lineTo(ox + (args[0] as number), y);
        break;
      case "V":
        lineTo(x, oy + (args[0] as number));
        break;
      case "C": {
        const [x1, y1, x2, y2, ex, ey] = args.map((v, k) => v + (k % 2 === 0 ? ox : oy)) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        // Control points inside the area keep the whole curve inside (convex hull property).
        point(x1, y1);
        point(x2, y2);
        point(ex, ey);
        totals.length += curveLength(
          (t) => cubic(x, x1, x2, ex, t),
          (t) => cubic(y, y1, y2, ey, t),
        );
        x = ex;
        y = ey;
        break;
      }
      case "Q": {
        const [x1, y1, ex, ey] = args.map((v, k) => v + (k % 2 === 0 ? ox : oy)) as [
          number,
          number,
          number,
          number,
        ];
        point(x1, y1);
        point(ex, ey);
        totals.length += curveLength(
          (t) => quad(x, x1, ex, t),
          (t) => quad(y, y1, ey, t),
        );
        x = ex;
        y = ey;
        break;
      }
      case "Z":
        totals.length += Math.hypot(startX - x, startY - y);
        x = startX;
        y = startY;
        break;
      default:
        throw new Reject("bad_path_data");
    }
  }
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function quad(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

function curveLength(fx: (t: number) => number, fy: (t: number) => number): number {
  let length = 0;
  let px = fx(0);
  let py = fy(0);
  for (let k = 1; k <= CURVE_SEGMENTS; k++) {
    const t = k / CURVE_SEGMENTS;
    const nx = fx(t);
    const ny = fy(t);
    length += Math.hypot(nx - px, ny - py);
    px = nx;
    py = ny;
  }
  return length;
}
