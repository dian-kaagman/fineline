import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SETTINGS, orderSummary } from "../test/fixtures";
import { apiError, json, mockApi, networkFailure } from "../test/http";
import { currentLocation, expectNoAxeViolations, renderApp } from "../test/render";

function noSession() {
  return mockApi().on("GET", "/api/v1/admin/session", apiError(401, "unauthenticated"));
}

async function logIn(
  user: ReturnType<typeof renderApp>["user"],
  username = "owner",
  password = "pen-and-paper-2026",
) {
  await user.type(screen.getByLabelText("Username"), username);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

describe("A1 Log in", () => {
  it("AC-024 logs in with the configured credentials and shows the order list", async () => {
    const api = noSession()
      .on("POST", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [orderSummary()] }));
    const { user } = renderApp("/admin/login");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Log in to Fineline admin");
    expect(document.title).toBe("Log in - Fineline admin");
    await expectNoAxeViolations();

    api.on("GET", "/api/v1/admin/session", json(200, { username: "owner" }));
    await logIn(user);
    expect(await screen.findByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument();
    expect(currentLocation.value?.pathname).toBe("/admin/orders");
    const loginCall = api.callsTo("POST", "/api/v1/admin/session")[0]!;
    expect(loginCall.body).toEqual({ username: "owner", password: "pen-and-paper-2026" });
    expect(loginCall.headers.get("X-Requested-With")).toBe("fineline");
  });

  it("AC-025 refuses wrong credentials with one message, keeps the username and clears the password", async () => {
    noSession().on(
      "POST",
      "/api/v1/admin/session",
      apiError(401, "invalid_credentials", "Wrong username or password."),
    );
    const { user } = renderApp("/admin/login");
    await logIn(user, "owner", "pen-and-paper-2025");
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Wrong username or password.");
    await waitFor(() => expect(notice).toHaveFocus());
    expect(screen.getByLabelText("Username")).toHaveValue("owner");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(currentLocation.value?.pathname).toBe("/admin/login");
    await expectNoAxeViolations();
  });

  it("AC-061 tells the admin how long to wait after too many attempts", async () => {
    noSession().on(
      "POST",
      "/api/v1/admin/session",
      apiError(429, "rate_limited", "Too many", undefined, { "Retry-After": "600" }),
    );
    const { user } = renderApp("/admin/login");
    await logIn(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many login attempts. Please wait 10 minutes and try again.",
    );
    expect(currentLocation.value?.pathname).toBe("/admin/login");
  });

  it("reports a missing connection", async () => {
    noSession().on("POST", "/api/v1/admin/session", networkFailure());
    const { user } = renderApp("/admin/login");
    await logIn(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't reach the server.");
  });

  it("UX-006 asks for empty fields without sending anything", async () => {
    const api = noSession();
    const { user } = renderApp("/admin/login");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByText("Enter your username.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveFocus();
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(api.callsTo("POST", "/api/v1/admin/session")).toHaveLength(0);
  });

  it("UX-007 supports password managers, paste and Show password", async () => {
    noSession();
    const { user } = renderApp("/admin/login");
    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    expect(username).toHaveAttribute("autocomplete", "username");
    expect(username).toHaveAttribute("autocapitalize", "none");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toHaveAttribute("type", "password");
    await user.click(password);
    await user.paste("pen-and-paper-2026");
    expect(password).toHaveValue("pen-and-paper-2026");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(password).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("skips the form when a session is still valid", async () => {
    mockApi()
      .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [] }));
    renderApp("/admin/login");
    expect(await screen.findByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument();
  });
});

describe("route guard and session end", () => {
  it("AC-026 opening the order list without a session redirects to the login page with next", async () => {
    const api = noSession();
    renderApp("/admin/orders");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Log in to Fineline admin" }),
    ).toBeInTheDocument();
    expect(currentLocation.value?.pathname).toBe("/admin/login");
    expect(currentLocation.value?.search).toBe("?next=%2Fadmin%2Forders");
    expect(
      screen.getByText("Your session has ended. Log in again to continue."),
    ).toBeInTheDocument();
    // No order data was asked for or shown.
    expect(api.callsTo("GET", /\/admin\/orders/)).toHaveLength(0);
  });

  it("UX-023 a failed session check (network, 5xx) is a load error with Try again, not an ended session", async () => {
    const api = mockApi()
      .on(
        "GET",
        "/api/v1/admin/session",
        networkFailure(),
        apiError(502, "http_502"),
        json(200, { username: "owner" }),
      )
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [] }));
    const { user } = renderApp("/admin/orders");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't reach the server. Check the connection and try again.",
    );
    expect(currentLocation.value?.pathname).toBe("/admin/orders");
    expect(screen.queryByText(/Your session has ended/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on the server.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument();
    expect(api.callsTo("GET", "/api/v1/admin/session")).toHaveLength(3);
  });

  it("UX-023 a 401 on Save lead time goes to the login page and back to the same page after logging in", async () => {
    const api = mockApi()
      .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("GET", "/api/v1/admin/settings", json(200, SETTINGS))
      .on("PUT", "/api/v1/admin/settings", apiError(401, "unauthenticated"));
    const { user } = renderApp("/admin/settings");
    const field = await screen.findByLabelText("Standard lead time (working days)");
    await user.clear(field);
    await user.type(field, "10");
    api.on("GET", "/api/v1/admin/session", apiError(401, "unauthenticated"));
    await user.click(screen.getByRole("button", { name: "Save lead time" }));

    expect(
      await screen.findByText("Your session has ended. Log in again to continue."),
    ).toBeInTheDocument();
    expect(`${currentLocation.value?.pathname}${currentLocation.value?.search}`).toBe(
      "/admin/login?next=%2Fadmin%2Fsettings",
    );

    api.on("POST", "/api/v1/admin/session", json(200, { username: "owner" }));
    api.on("GET", "/api/v1/admin/session", json(200, { username: "owner" }));
    await logIn(user);
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(currentLocation.value?.pathname).toBe("/admin/settings");
  });

  it("UX-023 ignores a next that leaves the admin tool", async () => {
    const api = noSession()
      .on("POST", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [] }));
    const { user } = renderApp("/admin/login?next=https://evil.example/admin/orders");
    api.on("GET", "/api/v1/admin/session", json(200, { username: "owner" }));
    await logIn(user);
    await screen.findByRole("heading", { level: 1, name: "Orders" });
    expect(currentLocation.value?.pathname).toBe("/admin/orders");
  });

  it("AC-028 logs out with the CSRF header and shows the logged-out notice", async () => {
    const api = mockApi()
      .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [] }))
      .on("DELETE", "/api/v1/admin/session", new Response(null, { status: 204 }));
    const { user } = renderApp("/admin/orders");
    await screen.findByRole("heading", { level: 1, name: "Orders" });
    api.on("GET", "/api/v1/admin/session", apiError(401, "unauthenticated"));
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByText("You're logged out.")).toBeInTheDocument();
    expect(currentLocation.value?.pathname).toBe("/admin/login");
    expect(api.callsTo("DELETE", "/api/v1/admin/session")[0]!.headers.get("X-Requested-With")).toBe(
      "fineline",
    );
  });

  it("UX-016 X2 the admin layout has landmarks, a labelled nav with the current page and a skip link", async () => {
    mockApi()
      .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [] }));
    renderApp("/admin/orders");
    await screen.findByRole("heading", { level: 1, name: "Orders" });
    const nav = screen.getByRole("navigation", { name: "Admin" });
    expect(within(nav).getByRole("link", { name: "Orders" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Frames" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("X3 shows Page not found inside the admin layout", async () => {
    mockApi().on("GET", "/api/v1/admin/session", json(200, { username: "owner" }));
    renderApp("/admin/nothing-here");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to orders" })).toHaveAttribute(
      "href",
      "/admin/orders",
    );
    await expectNoAxeViolations();
  });

  it("P-1 /admin goes to the orders", async () => {
    mockApi()
      .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [] }));
    renderApp("/admin");
    expect(await screen.findByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument();
  });
});
