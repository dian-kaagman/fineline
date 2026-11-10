import type { MouseEvent } from "react";

/** The first focusable element: moves focus to <main id="main"> (UX-016). */
export function SkipLink({ label }: { label: string }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // Focus directly instead of changing the URL hash, which the router would treat as navigation.
    const main = document.getElementById("main");
    if (!main) return;
    event.preventDefault();
    main.focus();
  }
  return (
    <a className="skip-link" href="#main" onClick={handleClick}>
      {label}
    </a>
  );
}
