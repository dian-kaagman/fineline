import { useLayoutEffect } from "react";

/**
 * Sets the page title from content.md for each screen and state (UX-015). A layout effect, so the
 * title changes in the same commit as the screen it names.
 */
export function useDocumentTitle(title: string): void {
  useLayoutEffect(() => {
    document.title = title;
  }, [title]);
}
