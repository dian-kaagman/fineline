import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { orderDetail, orderSummary } from "../test/fixtures";
import { apiError, json, mockApi, networkFailure, svgResponse } from "../test/http";
import { currentLocation, expectNoAxeViolations, renderApp } from "../test/render";

const FL42 = orderSummary();
const FL40 = orderSummary({
  id: "aaaaaaaa-0040-4000-8000-000000000040",
  orderNumber: "FL-2026-0040",
  status: "drawn",
  orderDate: "2026-11-04",
  estimatedDeliveryDate: "2026-11-13",
  customerName: "Tim Jansen",
});
const FL39 = orderSummary({
  id: "aaaaaaaa-0039-4000-8000-000000000039",
  orderNumber: "FL-2026-0039",
  status: "shipped",
  estimatedDeliveryDate: "2026-11-12",
});
const FL41 = orderSummary({
  id: "aaaaaaaa-0041-4000-8000-000000000041",
  orderNumber: "FL-2026-0041",
  status: "cancelled",
});

function admin() {
  return mockApi().on("GET", "/api/v1/admin/session", json(200, { username: "owner" }));
}

function rows() {
  const table = screen.getByRole("table");
  return within(table).getAllByRole("row").slice(1);
}

describe("A2 Orders", () => {
  it("AC-029 UX-019 lists open orders by default, earliest delivery date first, in a captioned table", async () => {
    const api = admin().on(
      "GET",
      "/api/v1/admin/orders?status=open",
      json(200, { orders: [FL40, FL42] }),
    );
    renderApp("/admin/orders");
    const table = await screen.findByRole("table", {
      name: /Open orders, earliest delivery date first - 2 orders/,
    });
    expect(document.title).toBe("Orders - Fineline admin");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      "Order number",
      "Status",
      "Delivery date",
      "Order date",
      "Customer",
      "Frame",
      "Next step",
    ]);
    expect(within(table).getAllByRole("columnheader")[0]).toHaveAttribute("scope", "col");
    const [first, second] = rows();
    expect(within(first!).getByRole("link", { name: "FL-2026-0040" })).toBeInTheDocument();
    expect(first).toHaveTextContent("Drawn");
    expect(first).toHaveTextContent("Fri 13 Nov 2026");
    expect(first).toHaveTextContent("Wed 4 Nov 2026");
    expect(within(second!).getByRole("link", { name: "FL-2026-0042" })).toHaveAttribute(
      "href",
      `/admin/orders/${FL42.id}`,
    );
    expect(second).toHaveTextContent("Received");
    expect(second).toHaveTextContent("Tue 17 Nov 2026");
    expect(second).toHaveTextContent("Fri 6 Nov 2026");
    expect(screen.queryByText("FL-2026-0039")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Open orders/ })).toHaveAttribute("tabindex", "0");
    expect(api.callsTo("GET", /\/admin\/orders\?/).map((call) => call.path)).toEqual([
      "/api/v1/admin/orders?status=open",
    ]);
    await expectNoAxeViolations();
  });

  it("AC-029 filters on received and all through links in the URL", async () => {
    admin()
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [FL40, FL42] }))
      .on("GET", "/api/v1/admin/orders?status=received", json(200, { orders: [FL42] }))
      .on(
        "GET",
        "/api/v1/admin/orders?status=all",
        json(200, { orders: [FL39, FL40, FL42, FL41] }),
      );
    const { user } = renderApp("/admin/orders");
    await screen.findByRole("table");
    const filters = screen.getByRole("navigation", { name: "Filter orders by status" });
    expect(within(filters).getByRole("link", { name: "Open" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(within(filters).getByRole("link", { name: "Received" }));
    await screen.findByRole("table", { name: /Received orders, .* - 1 order$/ });
    expect(currentLocation.value?.search).toBe("?status=received");
    expect(document.title).toBe("Received orders - Fineline admin");
    expect(rows()).toHaveLength(1);
    expect(within(filters).getByRole("link", { name: "Received" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(within(filters).getByRole("link", { name: "All" }));
    await screen.findByRole("table", { name: /All orders, .* - 4 orders$/ });
    expect(rows()).toHaveLength(4);
  });

  it("UX-019 shows the empty states", async () => {
    admin()
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [] }))
      .on("GET", "/api/v1/admin/orders?status=shipped", json(200, { orders: [] }));
    renderApp("/admin/orders");
    expect(await screen.findByText(/No open orders/)).toBeInTheDocument();
  });

  it("UX-019 shows the filtered empty state with a link to all orders", async () => {
    admin().on("GET", "/api/v1/admin/orders?status=shipped", json(200, { orders: [] }));
    renderApp("/admin/orders?status=shipped");
    expect(await screen.findByText("No orders with status Shipped.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show all orders" })).toHaveAttribute(
      "href",
      "/admin/orders?status=all",
    );
  });

  it("shows the load error with Try again", async () => {
    admin().on(
      "GET",
      "/api/v1/admin/orders?status=open",
      networkFailure(),
      json(200, { orders: [FL42] }),
    );
    const { user } = renderApp("/admin/orders");
    expect(await screen.findByText(/We couldn't load the orders/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "FL-2026-0042" })).toBeInTheDocument();
  });

  it("AC-031 UX-020 UX-021 UX-027 Download SVG saves FL-2026-0042.svg, moves the row to Drawing in place and keeps focus", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    const api = admin()
      .on("GET", "/api/v1/admin/orders?status=received", json(200, { orders: [FL42] }))
      .on(
        "POST",
        `/api/v1/admin/orders/${FL42.id}/drawing-download`,
        svgResponse(svg, "FL-2026-0042.svg"),
      )
      .on("GET", `/api/v1/admin/orders/${FL42.id}`, json(200, orderDetail({ status: "drawing" })));
    const clicks: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    const { user } = renderApp("/admin/orders?status=received");
    const button = await screen.findByRole("button", { name: "Download SVG for FL-2026-0042" });
    button.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(rows()[0]).toHaveTextContent("Drawing"));
    expect(clicks).toEqual(["FL-2026-0042.svg"]);
    expect(api.callsTo("POST", /drawing-download$/)).toHaveLength(1);
    expect(api.callsTo("POST", /drawing-download$/)[0]!.headers.get("X-Requested-With")).toBe(
      "fineline",
    );
    const updated = screen.getByRole("button", { name: "Mark drawn for FL-2026-0042" });
    expect(updated).toBe(button);
    expect(updated).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "FL-2026-0042 downloaded. Status: Drawing.",
    );
    // The row stays although it no longer matches the Received filter.
    expect(rows()).toHaveLength(1);
    click.mockRestore();
  });

  it("AC-031 AC-036 after a download the row shows the status the API reports, not a guess", async () => {
    // The order was cancelled in another tab; the SVG still downloads (allowed in any status).
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    admin()
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [FL42] }))
      .on("POST", /drawing-download$/, svgResponse("<svg/>"))
      .on(
        "GET",
        `/api/v1/admin/orders/${FL42.id}`,
        json(200, orderDetail({ status: "cancelled" })),
      );
    const { user } = renderApp("/admin/orders");
    await user.click(await screen.findByRole("button", { name: "Download SVG for FL-2026-0042" }));
    await waitFor(() => expect(rows()[0]).toHaveTextContent("Cancelled"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "FL-2026-0042 downloaded again. Status unchanged: Cancelled.",
    );
    click.mockRestore();
  });

  it("AC-031 a failed download leaves the status and says so", async () => {
    admin()
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [FL42] }))
      .on("POST", /drawing-download$/, networkFailure());
    const { user } = renderApp("/admin/orders");
    await user.click(await screen.findByRole("button", { name: "Download SVG for FL-2026-0042" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The SVG for FL-2026-0042 couldn't be downloaded, so its status hasn't changed. Try again.",
    );
    expect(rows()[0]).toHaveTextContent("Received");
  });

  it("AC-033 UX-021 Mark drawn and Mark ready to ship act at once and are announced", async () => {
    const drawing = orderSummary({ status: "drawing" });
    const api = admin()
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [drawing] }))
      .on(
        "POST",
        `/api/v1/admin/orders/${drawing.id}/status`,
        json(200, orderDetail({ status: "drawn" })),
        json(200, orderDetail({ status: "ready_to_ship" })),
      );
    const { user } = renderApp("/admin/orders");
    await user.click(await screen.findByRole("button", { name: "Mark drawn for FL-2026-0042" }));
    expect(
      await screen.findByRole("button", { name: "Mark ready to ship for FL-2026-0042" }),
    ).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("FL-2026-0042 is now Drawn.");
    await user.click(screen.getByRole("button", { name: "Mark ready to ship for FL-2026-0042" }));
    expect(
      await screen.findByRole("button", { name: "Mark shipped for FL-2026-0042" }),
    ).toBeInTheDocument();
    expect(api.callsTo("POST", /\/status$/).map((call) => call.body)).toEqual([
      { status: "drawn" },
      { status: "ready_to_ship" },
    ]);
  });

  it("AC-033 UX-032 UX-024 Mark shipped asks first; Not yet sends nothing", async () => {
    const ready = orderSummary({ status: "ready_to_ship" });
    const api = admin()
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [ready] }))
      .on(
        "POST",
        `/api/v1/admin/orders/${ready.id}/status`,
        json(200, orderDetail({ status: "shipped" })),
      );
    const { user } = renderApp("/admin/orders");
    const button = await screen.findByRole("button", { name: "Mark shipped for FL-2026-0042" });
    await user.click(button);
    const dialog = screen.getByRole("dialog", { name: "Mark FL-2026-0042 as shipped?" });
    expect(dialog).toHaveAccessibleDescription(
      "Only do this after handing it to the carrier. Shipped orders can't change any more.",
    );
    expect(within(dialog).getByRole("button", { name: "Not yet" })).toHaveFocus();
    await expectNoAxeViolations();
    await user.click(within(dialog).getByRole("button", { name: "Not yet" }));
    expect(api.callsTo("POST", /\/status$/)).toHaveLength(0);
    expect(button).toHaveFocus();

    await user.click(button);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Mark shipped" }),
    );
    await waitFor(() => expect(rows()[0]).toHaveTextContent("Shipped"));
    expect(api.callsTo("POST", /\/status$/)[0]!.body).toEqual({ status: "shipped" });
    expect(within(rows()[0]!).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "FL-2026-0042" })).toHaveFocus();
  });

  it("AC-034 a refused Mark shipped closes the dialog, names the current status and reloads the list", async () => {
    const ready = orderSummary({ status: "ready_to_ship" });
    const api = admin()
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [ready] }))
      .on("POST", /\/status$/, apiError(409, "invalid_transition"))
      .on(
        "GET",
        `/api/v1/admin/orders/${ready.id}`,
        json(200, orderDetail({ status: "cancelled" })),
      );
    const { user } = renderApp("/admin/orders");
    await user.click(await screen.findByRole("button", { name: "Mark shipped for FL-2026-0042" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Mark shipped" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "FL-2026-0042 is Cancelled now, so it can't be marked shipped. The order has been reloaded.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(api.callsTo("GET", "/api/v1/admin/orders?status=open")).toHaveLength(2),
    );
  });

  it("AC-034 a refused move names the current status and reloads the list", async () => {
    const stale = orderSummary({ status: "drawing" });
    const api = admin()
      .on("GET", "/api/v1/admin/orders?status=open", json(200, { orders: [stale] }))
      .on("POST", /\/status$/, apiError(409, "invalid_transition", "Not allowed"))
      .on(
        "GET",
        `/api/v1/admin/orders/${stale.id}`,
        json(200, orderDetail({ status: "cancelled" })),
      );
    const { user } = renderApp("/admin/orders");
    await user.click(await screen.findByRole("button", { name: "Mark drawn for FL-2026-0042" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(
      "FL-2026-0042 is Cancelled now, so it can't be marked drawn. The order has been reloaded.",
    );
    await waitFor(() =>
      expect(api.callsTo("GET", "/api/v1/admin/orders?status=open")).toHaveLength(2),
    );
  });

  it("UX-023 a 401 from the list sends the admin to the login page", async () => {
    // The session ends between the session check and the list call.
    const api = mockApi()
      .on(
        "GET",
        "/api/v1/admin/session",
        json(200, { username: "owner" }),
        apiError(401, "unauthenticated"),
      )
      .on("GET", "/api/v1/admin/orders?status=received", apiError(401, "unauthenticated"));
    renderApp("/admin/orders?status=received");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Log in to Fineline admin" }),
    ).toBeInTheDocument();
    expect(currentLocation.value?.search).toBe("?next=%2Fadmin%2Forders%3Fstatus%3Dreceived");
    expect(api.calls.length).toBeGreaterThan(0);
  });
});
