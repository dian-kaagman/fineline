import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { t, tPlural } from "./t";

const CONTENT_MD = join(__dirname, "../../../../docs/ux/content.md");

interface Row {
  key: string;
  text: string | null;
}

/** Reads the key -> text rows of every table in docs/ux/content.md. */
function contentRows(): Row[] {
  const rows: Row[] = [];
  let keyColumn = -1;
  let textColumn = -1;
  for (const line of readFileSync(CONTENT_MD, "utf8").split("\n")) {
    if (!line.startsWith("|")) {
      keyColumn = -1;
      continue;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (keyColumn === -1) {
      keyColumn = cells.indexOf("Key");
      textColumn = cells.findIndex(
        (cell) => cell === "Text" || cell === "Text / behaviour" || cell === "Label",
      );
      continue;
    }
    if (cells[0]?.startsWith("---")) continue;
    const rawKey = cells[keyColumn] ?? "";
    // "a2.col.orderNumber / status / ..." names several keys with one text each.
    const keyParts = rawKey.split(" / ");
    const first = keyParts[0] ?? "";
    if (!/^[a-z0-9]+(\.[A-Za-z0-9_]+)+$/.test(first)) continue;
    const prefix = first.slice(0, first.lastIndexOf(".") + 1);
    // Later parts are a last segment ("status"), a sibling suffix (".other") or a full key.
    const keys = [
      first,
      ...keyParts
        .slice(1)
        .map((part) =>
          part.startsWith(".")
            ? `${prefix.slice(0, -1)}${part}`
            : part.includes(".")
              ? part
              : `${prefix}${part}`,
        ),
    ];
    const texts = textColumn >= 0 ? (cells[textColumn] ?? "").split(" / ") : [];
    keys.forEach((key, index) => {
      const text =
        keys.length === texts.length
          ? texts[index]
          : keys.length === 1
            ? texts.join(" / ")
            : undefined;
      // "(a2.done.downloaded)" means "the same text as that key".
      const alias = /^\(([a-z0-9.]+)\)$/.exec(text ?? "")?.[1];
      rows.push({
        key,
        text: text === undefined ? null : alias ? (en[alias as keyof typeof en] ?? text) : text,
      });
    });
  }
  return rows;
}

/** content.md notes such as "(AC-002)" or "**(owner to confirm)**" are not part of the text. */
function cleanText(text: string): string {
  return text
    .replace(/\s*\*\*\(owner to confirm[^)]*\)\*\*/g, "")
    .replace(/\s*\(followed by [^)]*\)$/, "")
    .replace(/\s*\((AC|UX|BR)-\d+(, (AC|UX|BR)-\d+)*\)$/g, "")
    .trim();
}

/**
 * Texts changed in the web app ahead of docs/ux/content.md, with the reason. Remove an entry once
 * content.md has the same text (the test then checks it again).
 */

describe("UX-014 message catalogue", () => {
  const rows = contentRows();

  it("reads the keys of docs/ux/content.md", () => {
    expect(rows.length).toBeGreaterThan(300);
  });

  it("has every key of content.md", () => {
    const missing = rows.map((row) => row.key).filter((key) => !(key in en));
    expect(missing).toEqual([]);
  });

  it("has content.md's text for each key, word for word", () => {
    const different = rows
      .filter((row) => row.text !== null && row.key in en)
      .filter((row) => en[row.key as keyof typeof en] !== cleanText(row.text!))
      .map((row) => `${row.key}: "${en[row.key as keyof typeof en]}" vs "${cleanText(row.text!)}"`);
    expect(different).toEqual([]);
  });

  it("fills placeholders and picks .one/.other by count", () => {
    expect(t("c4.soldOut", { frameName: "Oak A4" })).toBe(
      "This frame just sold out: Oak A4. Please choose another frame - your details and drawing are kept.",
    );
    expect(tPlural("a2.caption", 1, { filterName: "Open" })).toBe(
      "Open orders, earliest delivery date first - 1 order",
    );
    expect(tPlural("a2.caption", 2, { filterName: "Open" })).toBe(
      "Open orders, earliest delivery date first - 2 orders",
    );
  });

  it("is the only source of UI text: every key used in the code exists", () => {
    const sourceDir = join(__dirname, "..");
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          for (const match of readFileSync(path, "utf8").matchAll(
            /\bt(?:Plural|Nodes)?\("([a-z0-9_.A-Z]+)"/g,
          )) {
            used.add(match[1]!);
          }
        }
      }
    };
    walk(sourceDir);
    const plurals = [...used]
      .filter((key) => !(key in en))
      .filter((key) => !(`${key}.one` in en && `${key}.other` in en));
    expect(plurals).toEqual([]);
  });
});
