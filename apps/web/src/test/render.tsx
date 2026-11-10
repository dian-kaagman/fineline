import { render } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { userEvent } from "@testing-library/user-event";
import type { Location } from "react-router";
import { MemoryRouter, useLocation } from "react-router";
import { axe } from "vitest-axe";
import { expect } from "vitest";
import { App } from "../App";

export const currentLocation: { value: Location | null } = { value: null };

function LocationProbe() {
  const location = useLocation();
  // Layout effect: updated in the same commit as the DOM, before any findBy* resolves.
  useLayoutEffect(() => {
    currentLocation.value = location;
  }, [location]);
  return null;
}

/** Renders the whole app at a URL, as the browser would. */
export function renderApp(url = "/", state?: unknown) {
  const user = userEvent.setup({ applyAccept: false });
  const parsed = new URL(url, "http://localhost");
  const result = render(
    <MemoryRouter initialEntries={[{ pathname: parsed.pathname, search: parsed.search, state }]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { user, ...result };
}

/** Structural axe rules in jsdom (names, roles, labels, landmarks, alt). Contrast needs a browser. */
export async function expectNoAxeViolations(container: Element = document.body) {
  const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`,
  );
  expect(summary).toEqual([]);
}

/** Pretends the browser can read the photo's size (the C1 shortest-side pre-check). */
export function mockImageSize(width: number, height: number) {
  class FakeImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
}

export function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
