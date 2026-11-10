import { en, type MessageKey } from "./en";

export type { MessageKey };
export type MessageParams = Record<string, string | number>;

/** Looks up a catalogue text and fills its {placeholders} by simple replacement (UX-014). */
export function t(key: MessageKey, params?: MessageParams): string {
  const text: string = en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

type PluralBase = {
  [K in MessageKey]: K extends `${infer B}.one`
    ? `${B}.other` extends MessageKey
      ? B
      : never
    : never;
}[MessageKey];

/** Picks the `.one` or `.other` variant by count and fills placeholders, `count` included. */
export function tPlural(base: PluralBase, count: number, params?: MessageParams): string {
  const key = (count === 1 ? `${base}.one` : `${base}.other`) as MessageKey;
  return t(key, { count, ...params });
}
