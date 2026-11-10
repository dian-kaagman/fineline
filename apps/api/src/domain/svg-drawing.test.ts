import { describe, expect, it } from "vitest";
import { checkDrawingSvg, MAX_SVG_BYTES, type DrawingLimits } from "./svg-drawing.js";

const limits: DrawingLimits = {
  areaWidthMm: 180,
  areaHeightMm: 267,
  maxStrokes: 1500,
  maxTotalLengthMm: 25_000,
};
const PATH_ATTRS =
  'fill="none" stroke="#000" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"';

function svg(body: string, root = 'width="180mm" height="267mm" viewBox="0 0 180 267"'): Buffer {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${root} version="1.1">\n${body}\n</svg>\n`,
  );
}

const path = (d: string, attrs = PATH_ATTRS) => `<path d="${d}" ${attrs}/>`;

function rule(bytes: Buffer, l = limits): string {
  const result = checkDrawingSvg(bytes, l);
  return result.ok ? "ok" : result.rule;
}

describe("drawing SVG check (SR-006)", () => {
  it("AC-005 accepts black unfilled strokes in mm inside the area and measures them itself", () => {
    const body = `<g fill="none" stroke="#000000">${path("M10 10 L110 10", 'stroke-width="0.5"')}<path d="M0 20 h50 v30 z"/></g>`;
    const result = checkDrawingSvg(svg(body), limits);
    expect(result).toEqual({
      ok: true,
      metrics: {
        widthMm: 180,
        heightMm: 267,
        strokeCount: 2,
        totalLengthMm: Math.round((100 + 50 + 30 + Math.hypot(50, 30)) * 10) / 10,
      },
    });
  });

  it("measures curves, relative commands, implicit linetos and several strokes in one path", () => {
    const result = checkDrawingSvg(
      svg(path("M0 0 L10 0 10 10 M20 20 l10 0 Q35 20 40 20 C45 20 50 20 55 20")),
      limits,
    );
    expect(result.ok && result.metrics).toMatchObject({ strokeCount: 2, totalLengthMm: 55 });
  });

  it.each([
    ["script element", svg(`${path("M0 0 L1 1")}<script>alert(1)</script>`), "element_not_allowed"],
    [
      "event handler",
      svg(path("M0 0 L1 1", `${PATH_ATTRS} onload="alert(1)"`)),
      "attribute_not_allowed",
    ],
    [
      "foreignObject",
      svg(`<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>`),
      "element_not_allowed",
    ],
    ["embedded image", svg(`<image href="data:image/png;base64,AAAA"/>`), "element_not_allowed"],
    [
      "xlink:href",
      svg(path("M0 0 L1 1", `${PATH_ATTRS} xlink:href="#x"`)),
      "attribute_not_allowed",
    ],
    [
      "style attribute",
      svg(path("M0 0 L1 1", `${PATH_ATTRS} style="fill:red"`)),
      "attribute_not_allowed",
    ],
    ["use element", svg(`<use href="#a"/>`), "element_not_allowed"],
    ["text", svg(`<text>hi</text>`), "element_not_allowed"],
    ["gradient", svg(`<linearGradient id="g"/>`), "element_not_allowed"],
    [
      "transform",
      svg(path("M0 0 L1 1", `${PATH_ATTRS} transform="scale(10)"`)),
      "attribute_not_allowed",
    ],
    ["url() in d", svg(path("M0 0 L1 1 url(#x)")), "bad_path_data"],
    ["arc command", svg(path("M0 0 A5 5 0 0 1 10 10")), "bad_path_data"],
    ["a fill", svg(path("M0 0 L1 1", 'fill="#000" stroke="#000"')), "fill_not_none"],
    [
      "no fill attribute (SVG default fill is black)",
      svg(path("M0 0 L1 1", 'stroke="#000"')),
      "fill_not_none",
    ],
    ["a grey stroke", svg(path("M0 0 L1 1", 'fill="none" stroke="#333"')), "stroke_not_black"],
    ["no stroke", svg(path("M0 0 L1 1", 'fill="none"')), "stroke_missing"],
    ["a coordinate outside the area", svg(path("M0 0 L181 10")), "outside_area"],
    ["a negative coordinate", svg(path("M0 0 l-1 0")), "outside_area"],
    ["a control point outside the area", svg(path("M0 0 Q90 400 179 0")), "outside_area"],
    ["text content", svg(`hello ${path("M0 0 L1 1")}`), "text_content"],
    [
      "an entity reference",
      svg(path("M0 0 L1 1", 'fill="none" stroke="&#x23;000"')),
      "malformed_attribute_value",
    ],
    ["a comment", svg(`<!-- hi -->${path("M0 0 L1 1")}`), "markup_declaration"],
    ["CDATA", svg(`<![CDATA[x]]>${path("M0 0 L1 1")}`), "markup_declaration"],
    [
      "a processing instruction",
      svg(`<?xml-stylesheet href="x.css"?>${path("M0 0 L1 1")}`),
      "processing_instruction",
    ],
    ["no strokes", svg(""), "no_strokes"],
    [
      "size in px",
      svg(path("M0 0 L1 1"), 'width="180" height="267" viewBox="0 0 180 267"'),
      "size_not_mm",
    ],
    [
      "larger than the area",
      svg(path("M0 0 L1 1"), 'width="200mm" height="267mm" viewBox="0 0 200 267"'),
      "larger_than_area",
    ],
    [
      "a viewBox in other units",
      svg(path("M0 0 L1 1"), 'width="180mm" height="267mm" viewBox="0 0 1800 2670"'),
      "viewbox_not_mm",
    ],
    [
      "a second root",
      Buffer.concat([svg(path("M0 0 L1 1")), Buffer.from("<svg/>")]),
      "content_after_root",
    ],
    [
      "unbalanced tags",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1mm" height="1mm" viewBox="0 0 1 1"><g>',
      ),
      "unbalanced_tags",
    ],
    [
      "a duplicate attribute",
      svg(path("M0 0 L1 1", `${PATH_ATTRS} fill="none"`)),
      "duplicate_attribute",
    ],
    ["invalid UTF-8", Buffer.from([0x3c, 0x73, 0x76, 0x67, 0xff, 0x3e]), "not_utf8"],
    [
      "a wrong namespace",
      Buffer.from(
        `<svg xmlns="http://evil.example/ns" width="1mm" height="1mm" viewBox="0 0 1 1">${path("M0 0 L1 1")}</svg>`,
      ),
      "bad_namespace",
    ],
  ])("rejects %s", (_label, bytes, expected) => {
    expect(rule(bytes)).toBe(expected);
  });

  it("AC-055 rejects a DOCTYPE with an entity (XXE / billion laughs)", () => {
    const bytes = Buffer.from(
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY lol "lol">]><svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10">${path("M0 0 L1 1")}</svg>`,
    );
    expect(rule(bytes)).toBe("markup_declaration");
  });

  it("AC-006 recomputes the budget: rejects 1501 strokes and more than 25 m of line", () => {
    const strokes = (n: number, len: number) =>
      Array.from({ length: n }, (_, i) => path(`M0 ${i % 260} L${len} ${i % 260}`)).join("");
    expect(rule(svg(strokes(1500, 10)))).toBe("ok");
    expect(rule(svg(strokes(1501, 10)))).toBe("too_many_strokes");
    expect(rule(svg(strokes(150, 167)))).toBe("too_long"); // 25,050 mm
  });

  it("follows the configured area and budget", () => {
    const small: DrawingLimits = {
      areaWidthMm: 100,
      areaHeightMm: 100,
      maxStrokes: 1,
      maxTotalLengthMm: 50,
    };
    expect(rule(svg(path("M0 0 L1 1")), small)).toBe("larger_than_area");
    const fits = svg(path("M0 0 L10 0"), 'width="100mm" height="100mm" viewBox="0 0 100 100"');
    expect(rule(fits, small)).toBe("ok");
  });

  it("rejects files over the size cap", () => {
    expect(rule(Buffer.alloc(MAX_SVG_BYTES + 1, 0x20))).toBe("too_large");
  });
});
