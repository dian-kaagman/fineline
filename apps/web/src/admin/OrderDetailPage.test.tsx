import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DRAWING_SVG, orderDetail } from "../test/fixtures";
import { apiError, json, mockApi, networkFailure, svgResponse } from "../test/http";
import { expectNoAxeViolations, renderApp } from "../test/render";

const ID = orderDetail().id;
const ORDER_URL = `/api/v1/admin/orders/${ID}`;

function admin(order = orderDetail()) {
  return mockApi()
    .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
    .on("GET", ORDER_URL, json(200, order))
    .on("GET", `${ORDER_URL}/drawing.svg`, svgResponse(DRAWING_SVG));
}

async function openOrder() {
  return screen.findByRole("heading", { level: 1, name: "Order FL-2026-0042" });
}

function section(name: string) {
  return screen.getByRole("heading", { level: 2, name }).closest("section")!;
}

describe("A3 Order detail", () => {
  it("AC-030 UX-009 shows everything about the order without changing its status", async () => {
    const api = admin();
    renderApp(`/admin/orders/${ID}`);
    await openOrder();
    expect(document.title).toBe("Order FL-2026-0042 - Fineline admin");
    expect(screen.getAllByText("Received").length).toBeGreaterThan(0);
    expect(within(section("Order")).getByText("Friday 6 November 2026")).toBeInTheDocument();
    expect(
      within(section("Delivery date")).getByText("Tuesday 17 November 2026"),
    ).toBeInTheDocument();
    const customer = section("Customer");
    expect(customer).toHaveTextContent("Anna de Vries");
    expect(customer).toHaveTextContent("anna@example.nl");
    expect(customer).toHaveTextContent("Lindelaan 12");
    expect(customer).toHaveTextContent("3512 AB Utrecht");
    expect(customer).toHaveTextContent("Netherlands");
    // SR-016: no href built from customer data.
    expect(within(customer).queryByRole("link")).not.toBeInTheDocument();
    expect(within(section("Order")).getByRole("link", { name: "Oak A4" })).toBeInTheDocument();
    expect(within(section("Order")).getByText("€49.95")).toBeInTheDocument();

    const drawing = await screen.findByRole("img", { name: "Drawing for order FL-2026-0042" });
    expect(drawing.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(document.querySelector('path[d="M10 10 L170 257"]')).toBeNull();
    expect(section("Drawing")).toHaveTextContent("180 x 267 mm");
    expect(section("Drawing")).toHaveTextContent("812 strokes");
    expect(section("Drawing")).toHaveTextContent("14.3 m");
    expect(
      screen.getByRole("img", { name: "Customer's photo for order FL-2026-0042" }),
    ).toHaveAttribute("src", `${ORDER_URL}/photo`);

    // Viewing used only side-effect-free GETs.
    expect(api.calls.filter((call) => call.method !== "GET")).toHaveLength(0);
    expect(api.callsTo("GET", `${ORDER_URL}/drawing.svg`)).toHaveLength(1);
    await expectNoAxeViolations();
  });

  it("AC-031 Received: Download SVG starts the drawing; the page re-renders as Drawing", async () => {
    const api = admin().on(
      "POST",
      `${ORDER_URL}/drawing-download`,
      svgResponse(DRAWING_SVG, "FL-2026-0042.svg"),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user } = renderApp(`/admin/orders/${ID}`);
    await openOrder();
    expect(
      screen.getByText("Downloading starts the drawing: the status changes to Drawing."),
    ).toBeInTheDocument();
    expect(
      within(section("Next step")).queryByRole("button", { name: "Mark drawn" }),
    ).not.toBeInTheDocument();

    api.on("GET", ORDER_URL, json(200, orderDetail({ status: "drawing" })));
    await user.click(screen.getByRole("button", { name: "Download SVG" }));
    expect(await screen.findByRole("button", { name: "Mark drawn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download SVG again" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "FL-2026-0042 downloaded. Status: Drawing.",
    );
    expect(screen.getByRole("heading", { level: 2, name: "Next step" })).toHaveFocus();
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("AC-032 Drawn: Download SVG again doesn't change the status", async () => {
    const api = admin(orderDetail({ status: "drawn" })).on(
      "POST",
      `${ORDER_URL}/drawing-download`,
      svgResponse(DRAWING_SVG),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user } = renderApp(`/admin/orders/${ID}`);
    await openOrder();
    await user.click(screen.getByRole("button", { name: "Download SVG again" }));
    expect(
      await screen.findByText("FL-2026-0042 downloaded again. Status unchanged: Drawn."),
    ).toBeInTheDocument();
    expect(api.callsTo("POST", /\/status$/)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Mark ready to ship" })).toBeInTheDocument();
    click.mockRestore();
  });

  it("AC-035 UX-032 UX-024 Cancel order asks first, then cancels and says the frame is back in stock", async () => {
    const api = admin().on(
      "POST",
      `${ORDER_URL}/status`,
      json(200, orderDetail({ status: "cancelled" })),
    );
    const { user } = renderApp(`/admin/orders/${ID}`);
    await openOrder();
    const cancel = screen.getByRole("button", { name: "Cancel order" });
    await user.click(cancel);
    const dialog = screen.getByRole("dialog", { name: "Cancel order FL-2026-0042?" });
    expect(dialog).toHaveAccessibleDescription(
      "The frame (Oak A4) goes back to stock. A cancelled order can't be reopened.",
    );
    expect(within(dialog).getByRole("button", { name: "Keep order" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cancel).toHaveFocus();
    expect(api.callsTo("POST", /\/status$/)).toHaveLength(0);

    await user.click(cancel);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel order" }),
    );
    expect(
      await screen.findByText("FL-2026-0042 is cancelled. Oak A4 is back in stock."),
    ).toBeInTheDocument();
    expect(api.callsTo("POST", `${ORDER_URL}/status`)[0]!.body).toEqual({ status: "cancelled" });
    expect(screen.getByRole("heading", { level: 2, name: "Next step" })).toHaveFocus();
  });

  it("AC-036 shipped and cancelled orders offer no status actions and no date change", async () => {
    admin(orderDetail({ status: "shipped" }));
    renderApp(`/admin/orders/${ID}`);
    await openOrder();
    const nextStep = section("Next step");
    expect(
      within(nextStep)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Download SVG"]);
    expect(nextStep).toHaveTextContent("Shipped and cancelled orders don't change any more.");
    expect(screen.queryByRole("button", { name: "Change delivery date" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });

  it("AC-033 Mark drawn, then the next step follows from the returned order", async () => {
    admin(orderDetail({ status: "drawing" })).on(
      "POST",
      `${ORDER_URL}/status`,
      json(200, orderDetail({ status: "drawn" })),
    );
    const { user } = renderApp(`/admin/orders/${ID}`);
    await openOrder();
    await user.click(screen.getByRole("button", { name: "Mark drawn" }));
    expect(await screen.findByRole("button", { name: "Mark ready to ship" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("FL-2026-0042 is now Drawn.");
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });

  it("AC-034 a refused cancel names the current status and reloads the order", async () => {
    const api = admin(orderDetail({ status: "drawing" })).on(
      "POST",
      `${ORDER_URL}/status`,
      apiError(409, "invalid_transition"),
    );
    const { user } = renderApp(`/admin/orders/${ID}`);
    await openOrder();
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    // Meanwhile the order was marked drawn in another tab.
    api.on("GET", ORDER_URL, json(200, orderDetail({ status: "drawn" })));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel order" }),
    );
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(
      "FL-2026-0042 is Drawn now, so it can't be cancelled. The order has been reloaded.",
    );
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });

  it("AC-037 changes the delivery date of this order", async () => {
    const api = admin().on(
      "PATCH",
      ORDER_URL,
      json(200, orderDetail({ estimatedDeliveryDate: "2026-11-20" })),
    );
    const { user } = renderApp(`/admin/orders/${ID}`);
    await openOrder();
    await user.click(screen.getByRole("button", { name: "Change delivery date" }));
    const field = screen.getByLabelText("New delivery date");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("type", "date");
    expect(field).toHaveAttribute("min", "2026-11-06");
    expect(field).toHaveAccessibleDescription("Not before the order date, Friday 6 November 2026.");
    fireEvent.change(field, { target: { value: "2026-11-20" } });
    await user.click(screen.getByRole("button", { name: "Save delivery date" }));
    expect(
      await screen.findByText("Delivery date changed to Friday 20 November 2026."),
    ).toBeInTheDocument();
    expect(
      within(section("Delivery date")).getByText("Friday 20 November 2026"),
    ).toBeInTheDocument();
    expect(api.callsTo("PATCH", ORDER_URL)[0]!.body).toEqual({
      estimatedDeliveryDate: "2026-11-20",
    });
    expect(screen.getByRole("button", { name: "Change delivery date" })).toHaveFocus();
  });

  it("AC-038 UX-006 refuses a date before the order date and keeps the entered date", async () => {
    const api = admin().on(
      "PATCH",
      ORDER_URL,
      apiError(
        400,
        "delivery_date_before_order_date",
        "The delivery date can't be before the order date.",
      ),
    );
    const { user } = renderApp(`/admin/orders/${ID}`);
    await openOrder();
    await user.click(screen.getByRole("button", { name: "Change delivery date" }));
    const field = screen.getByLabelText("New delivery date");
    fireEvent.change(field, { target: { value: "2026-11-05" } });
    await user.click(screen.getByRole("button", { name: "Save delivery date" }));
    expect(
      screen.getByText(
        "The delivery date can't be before the order date (Friday 6 November 2026).",
      ),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();
    expect(field).toHaveValue("2026-11-05");
    expect(
      within(section("Delivery date")).getByText("Tuesday 17 November 2026"),
    ).toBeInTheDocument();
    // The browser check caught it; the API answer maps to the same text.
    expect(api.callsTo("PATCH", ORDER_URL)).toHaveLength(0);
  });

  it("AC-038 maps the API's delivery_date_before_order_date to the same message", async () => {
    admin().on("PATCH", ORDER_URL, apiError(400, "delivery_date_before_order_date"));
    const { user } = renderApp(`/admin/orders/${ID}`);
    await openOrder();
    await user.click(screen.getByRole("button", { name: "Change delivery date" }));
    // A date the browser accepts, refused by the API (e.g. the order date moved in between).
    fireEvent.change(screen.getByLabelText("New delivery date"), {
      target: { value: "2026-11-09" },
    });
    await user.click(screen.getByRole("button", { name: "Save delivery date" }));
    expect(
      await screen.findByText(/The delivery date can't be before the order date/),
    ).toBeInTheDocument();
  });

  it("AC-012 shows that the photo was deleted while the drawing stays", async () => {
    admin(orderDetail({ status: "shipped", photoAvailable: false }));
    renderApp(`/admin/orders/${ID}`);
    await openOrder();
    expect(
      screen.getByText(
        "The customer's photo was deleted 30 days after the order was closed. The drawing is kept.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Customer's photo/ })).not.toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: "Drawing for order FL-2026-0042" }),
    ).toBeInTheDocument();
  });

  it("AC-012 a 410 for the photo shows the deleted state too", async () => {
    admin().on("GET", `${ORDER_URL}/photo`, apiError(410, "photo_deleted"));
    renderApp(`/admin/orders/${ID}`);
    await openOrder();
    fireEvent.error(screen.getByRole("img", { name: "Customer's photo for order FL-2026-0042" }));
    expect(await screen.findByText(/The customer's photo was deleted/)).toBeInTheDocument();
  });

  it("G-4 offers a download when the browser can't show the photo (HEIC)", async () => {
    admin().on(
      "GET",
      `${ORDER_URL}/photo`,
      new Response("heic", { status: 200, headers: { "Content-Type": "image/heic" } }),
    );
    renderApp(`/admin/orders/${ID}`);
    await openOrder();
    fireEvent.error(screen.getByRole("img", { name: "Customer's photo for order FL-2026-0042" }));
    expect(
      await screen.findByText("This photo can't be shown in this browser."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download photo" })).toHaveAttribute(
      "href",
      `${ORDER_URL}/photo`,
    );
  });

  it("shows Order not found for a 404", async () => {
    mockApi()
      .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("GET", ORDER_URL, apiError(404, "not_found"))
      .on("GET", `${ORDER_URL}/drawing.svg`, apiError(404, "not_found"));
    renderApp(`/admin/orders/${ID}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Order not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All orders" })).toHaveAttribute(
      "href",
      "/admin/orders",
    );
  });

  it("offers Try again when the drawing doesn't load, while the rest of the page works", async () => {
    admin().on("GET", `${ORDER_URL}/drawing.svg`, networkFailure(), svgResponse(DRAWING_SVG));
    const { user } = renderApp(`/admin/orders/${ID}`);
    await openOrder();
    expect(await screen.findByText("The drawing couldn't be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download SVG" })).toBeInTheDocument();
    await user.click(within(section("Drawing")).getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("img", { name: "Drawing for order FL-2026-0042" }),
    ).toBeInTheDocument();
  });

  it("returns to the list with the previous filter", async () => {
    admin();
    renderApp(`/admin/orders/${ID}`, { fromFilter: "received" });
    await openOrder();
    expect(screen.getByRole("link", { name: "All orders" })).toHaveAttribute(
      "href",
      "/admin/orders?status=received",
    );
  });
});
