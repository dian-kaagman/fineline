// Fetch mocked at the API-client boundary: tests declare answers per method and path and read
// back exactly what the web app sent.
import { vi } from "vitest";

export interface RecordedCall {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
  signal: AbortSignal | undefined;
}

type Answer = Response | ((call: RecordedCall) => Response | Promise<Response>);

interface Route {
  method: string;
  path: string | RegExp;
  answers: Answer[];
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function apiError(
  status: number,
  code: string,
  message = "Error",
  details?: { field: string; message: string }[],
  headers: Record<string, string> = {},
): Response {
  return json(status, { error: { code, message, ...(details ? { details } : {}) } }, headers);
}

export function svgResponse(svg: string, filename = "FL-2026-0042.svg"): Response {
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Rejects like fetch does when there is no response at all. */
export function networkFailure(): Answer {
  return () => Promise.reject(new TypeError("Failed to fetch"));
}

/**
 * `honourAbort: false` makes the fake server answer even after the request was aborted, like an
 * answer already on its way, to prove the app ignores late answers itself.
 */
export function mockApi({ honourAbort = true }: { honourAbort?: boolean } = {}) {
  const routes: Route[] = [];
  const calls: RecordedCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    const path = `${url.pathname}${url.search}`;
    let body: unknown = init.body;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    const call: RecordedCall = {
      method,
      path,
      headers: new Headers(init.headers),
      body,
      signal: init.signal ?? undefined,
    };
    calls.push(call);

    if (honourAbort && init.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const route = [...routes]
      .reverse()
      .find(
        (candidate) =>
          candidate.method === method &&
          (typeof candidate.path === "string"
            ? candidate.path === path
            : candidate.path.test(path)),
      );
    if (!route) throw new Error(`Unexpected request in test: ${method} ${path}`);
    const answer = route.answers.length > 1 ? route.answers.shift()! : route.answers[0]!;
    const response = typeof answer === "function" ? answer(call) : answer.clone();

    // Honour aborts while the answer is pending (Cancel on C2).
    if (honourAbort && init.signal) {
      const signal = init.signal;
      return Promise.race([
        Promise.resolve(response),
        new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
        ),
      ]);
    }
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    calls,
    /** Answers in order; the last one repeats. */
    on(method: string, path: string | RegExp, ...answers: Answer[]) {
      routes.push({ method, path, answers });
      return this;
    },
    callsTo(method: string, path: string | RegExp) {
      return calls.filter(
        (call) =>
          call.method === method &&
          (typeof path === "string" ? call.path === path : path.test(call.path)),
      );
    },
  };
}

/** A promise you resolve from the test, to hold a request open. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
