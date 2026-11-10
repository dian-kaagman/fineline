import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import eslintConfig from "../eslint.config.js";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")
      ? [path]
      : [];
  });
}

describe("SR-007 SR-016 SR-019 safe rendering", () => {
  const files = sourceFiles(__dirname).map((path) => ({ path, text: readFileSync(path, "utf8") }));

  it("SR-007 never renders markup from strings or embeds SVG in frames", () => {
    const offenders = files
      .filter(({ text }) =>
        /dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML|<iframe|<object|<embed|insertAdjacentHTML/.test(
          text,
        ),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("SR-007 ESLint treats react/no-danger as an error", () => {
    const rules = (eslintConfig as { rules?: Record<string, unknown> }[]).reduce<
      Record<string, unknown>
    >((all, entry) => ({ ...all, ...(entry.rules ?? {}) }), {});
    expect(rules["react/no-danger"]).toBe("error");
  });

  it("SR-019 uses no inline style attributes (the CSP allows only style-src 'self')", () => {
    const offenders = files.filter(({ text }) => /\sstyle=\{/.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("AC-065 SR-019 index.html loads nothing from another site and has no inline script or style", () => {
    const html = readFileSync(join(__dirname, "../index.html"), "utf8");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<style/);
    expect(html.match(/<script[^>]*>/g)).toEqual(['<script type="module" src="/src/main.tsx">']);
    // UX-013 / UX-014: language and a viewport that never blocks zoom.
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    );
  });

  it("AC-065 SR-019 the app's code and styles reference no other site (no CDN, fonts or analytics)", () => {
    const styles = readdirSync(join(__dirname, "styles")).map((name) =>
      readFileSync(join(__dirname, "styles", name), "utf8"),
    );
    const offenders = [
      ...files.map(({ path, text }) => ({ path, text })),
      ...styles.map((text, i) => ({ path: `styles#${i}`, text })),
    ]
      .filter(({ text }) =>
        /(https?:)?\/\/[a-z0-9-]+\.[a-z]/i.test(
          text.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, ""),
        ),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("UX-012 component CSS uses tokens only: no colours, px font sizes or outline: none outside tokens.css", () => {
    const stylesDir = join(__dirname, "styles");
    const offenders = readdirSync(stylesDir)
      .filter((name) => name.endsWith(".css") && name !== "tokens.css")
      .flatMap((name) => {
        const text = readFileSync(join(stylesDir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        return [
          ...[...text.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g)].map(
            (m) => `${name}: colour ${m[0]}`,
          ),
          ...[...text.matchAll(/font-size:\s*[\d.]+px/g)].map((m) => `${name}: ${m[0]}`),
          ...[...text.matchAll(/outline:\s*(none|0)\b/g)].map((m) => `${name}: ${m[0]}`),
        ];
      });
    expect(offenders).toEqual([]);
  });

  it("UX-012 tokens.css is the unchanged copy of docs/ux/tokens.css", () => {
    const copy = readFileSync(join(__dirname, "styles/tokens.css"), "utf8");
    const source = readFileSync(join(__dirname, "../../../docs/ux/tokens.css"), "utf8");
    expect(copy).toBe(source);
  });
});
