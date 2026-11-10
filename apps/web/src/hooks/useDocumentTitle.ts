import { useEffect } from "react";

/** Sets the page title from content.md for each screen and state (UX-015). */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
