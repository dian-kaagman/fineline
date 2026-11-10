# Fineline web app (`apps/web`)

One single-page app for both audiences:

- **Customer shop** at `/` (mobile first): photo -> preview -> frame -> details -> confirmation.
- **Admin tool** at `/admin/*` (laptop): log in, work through orders, download SVGs for the robot arm, frames and stock, lead time.

It talks only to the Fineline API on the same origin (`/api/v1`, contract in [`docs/api/openapi.yaml`](../../docs/api/openapi.yaml)). Screens, states, copy and accessibility come from [`docs/ux/`](../../docs/ux/); behaviour from the OpenSpec specs in [`openspec/`](../../openspec/).

Stack: React 19, Vite, TypeScript (strict), React Router, plain CSS with the design tokens, Vitest + Testing Library + jsdom + vitest-axe, ESLint + Prettier. npm with its own lockfile (no workspaces).

## Run it

Needs Node 22.12 or later (`.nvmrc` at the repository root) and the API running (see `apps/api/README.md`; default `http://localhost:3000`).

```sh
cd apps/web
npm ci
npm run dev            # http://localhost:5173, proxies /api to API_PROXY_TARGET (default http://localhost:3000)
```

Shop: <http://localhost:5173/>. Admin: <http://localhost:5173/admin> (credentials from the API's configuration).

## Commands

| Command                           | What it does                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server with the `/api` proxy                                                   |
| `npm run build`                   | Type-check (`tsc -b`) and build into `dist/`; needs `VITE_CONTACT_EMAIL`                |
| `npm run preview`                 | Serve the built `dist/` locally (no API proxy)                                          |
| `npm run lint`                    | ESLint (typescript-eslint, react, react-hooks, jsx-a11y; `react/no-danger` is an error) |
| `npm run format` / `format:check` | Prettier write / check                                                                  |
| `npm run typecheck`               | `tsc -b` for app, tests and config                                                      |
| `npm test`                        | Vitest once (jsdom, runs in `America/New_York` so date shifts would show)               |
| `npm run generate:api`            | Regenerate `src/api/schema.d.ts` from `docs/api/openapi.yaml` (commit the result)       |
| `npm run check:api`               | Fail if `src/api/schema.d.ts` is out of date with the contract (CI)                     |

## Configuration

| Variable             | When                                     | Meaning                                                                                                                                    |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_CONTACT_EMAIL` | build time, required for `npm run build` | The shop's contact address in the footer. Inlined into the bundle: never a secret. Dev server and tests use `hello@example.com` when unset |
| `API_PROXY_TARGET`   | `npm run dev` only                       | Where the dev server proxies `/api` (default `http://localhost:3000`)                                                                      |

Copy `.env.example` to `.env` to set them locally.

## Layout

```
src/
  main.tsx, App.tsx        entry and routes (screens.md "Routes")
  api/                     the only HTTP code: client.ts (errors, CSRF header), shop.ts, admin.ts,
                           schema.d.ts (generated from the contract - don't edit)
  i18n/en.ts               flat message catalogue (keys from docs/ux/content.md); t(), tPlural(), tNodes()
  lib/                     formatting (money, dates, waits), parsing (prices, whole numbers), safe ?next=, SVG data URLs
  components/ui/           base components: Button, Notice, TextField, ErrorSummary, ConfirmDialog, StatusBadge ...
  shop/                    ShopPage (step state in history.state) and the C1-C6 step components
  admin/                   AdminLayout (session guard, status region), A1-A7 pages
  styles/                  tokens.css (copied unchanged from docs/ux), base, components, shop, admin
  test/                    fetch mock at the API boundary, fixtures, render helpers
```

To add a screen: add a route in `App.tsx`, call the API through `src/api/*`, take every string from `i18n/en.ts`, set the title with `useDocumentTitle`, focus the `h1` with `useFocusHeadingOnNavigation`, handle loading / empty / error / success, and add a page test with an axe check.

## Conventions

- **Drawings are images only** (SR-007): a drawing is shown as `<img src="data:image/svg+xml,...">` (`lib/svg.ts`), never as markup. No `dangerouslySetInnerHTML`, `innerHTML`, `iframe`, `object` or `embed` (ESLint and `src/security.test.ts` enforce it).
- **No inline styles or third-party content** (SR-019 CSP `style-src 'self'`): styles live in `src/styles/*.css`, use only the tokens from `tokens.css` (UX-012), and the app loads nothing from other sites (system fonts).
- **No `href`/`src` from customer data** (SR-016): e.g. the customer's email on the order page is text, not a `mailto:` link.
- **Admin calls**: every unsafe call sends `X-Requested-With: fineline` (SR-013, set in `api/client.ts`); any 401 sends the admin to `/admin/login?next=<path>` (UX-023). `next` is followed only for same-origin `/admin/` paths.
- **Errors**: the web app shows its own text per API error `code` (content.md), the API's `message` for unknown codes, and treats any HTTP 413 as "too large".
- **Tests name the IDs they cover**: `AC-xxx` scenarios, `UX-xxx` and `SR-xxx` requirements.

## Docker

`Dockerfile` builds the app with `node:22.22-slim` and serves it with `nginxinc/nginx-unprivileged:1.28-alpine` on port 8080, using `nginx.conf`:

- SPA with history fallback to `index.html` (`no-cache`); hashed `/assets/` cached for a year, missing assets 404.
- `/api/` proxied to `http://api:3000` with `X-Forwarded-For` **overwritten** by the client address (SR-017) and a 60 s read timeout (above the API's 30 s worker timeout).
- Body limits (SR-001): 16 MB for `POST /api/v1/drawings`, 6 MB for the admin frame photo routes, 1 MB elsewhere; nginx's own 413 is answered as JSON in the API's error shape.
- SR-019 headers on every response (`always`): CSP, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `X-Frame-Options: DENY`; `server_tokens off`.

```sh
docker build --build-arg VITE_CONTACT_EMAIL=hello@example.com -t fineline-web apps/web
```

The container runs as a non-root user and can run with a read-only root filesystem if `/tmp` is a tmpfs (nginx keeps its pid and temp files there). It needs a host named `api` reachable on port 3000 when it starts (docker compose).

## Decisions

- **TypeScript 5.9, ESLint 9.** The Vite template now ships TypeScript 7 and ESLint 10, but `openapi-typescript` needs TypeScript 5 and `eslint-plugin-react` / `eslint-plugin-jsx-a11y` support ESLint up to 9. Move up when they do.
- **No draft in `sessionStorage`** (cut in the plan review): a reload starts again at step 1; the preview token lives in memory only.
- **Login page skip**: with a valid session `/admin/login` goes straight to the orders, but not when it was reached through `?next=` after a 401, so a disagreement between the session check and another call can't bounce between pages.

## Not covered here

UX-004 target sizes, rendered contrast, real focus rings, zoom/reflow and reduced motion in a real browser are checked in the post-build UX review (jsdom has no layout). There is no Playwright end-to-end test in this part; the end-to-end smoke test is `scripts/smoke.mjs` at the repository root.
