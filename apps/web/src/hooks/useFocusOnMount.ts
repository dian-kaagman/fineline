import { useEffect, type RefObject } from "react";
import { useLocation } from "react-router";

/**
 * Moves focus to the screen's h1 after a route change (UX-003). On the first page of a visit
 * (React Router's initial location key "default") focus stays where the browser put it, so the
 * skip link remains the first thing reached by Tab.
 */
export function useFocusHeadingOnNavigation(ref: RefObject<HTMLElement | null>): void {
  const { key } = useLocation();
  useEffect(() => {
    if (key !== "default") ref.current?.focus();
  }, [key, ref]);
}
