/**
 * The login return path (`?next=`), followed only when it is a same-origin path under
 * `/admin/` (no open redirect, UX-023). Returns null for anything else.
 */
export function safeAdminNext(next: string | null, origin = window.location.origin): string | null {
  if (!next || !next.startsWith("/admin/") || next.startsWith("//") || /[\\\s]/.test(next)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || !url.pathname.startsWith("/admin/")) return null;
  if (url.pathname === "/admin/login") return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/admin/login?next=<path>` for the page the admin was on. */
export function loginPathFor(currentPath: string): string {
  return `/admin/login?next=${encodeURIComponent(currentPath)}`;
}
