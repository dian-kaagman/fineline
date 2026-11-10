import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SETTINGS } from "../test/fixtures";
import { apiError, json, mockApi, networkFailure } from "../test/http";
import { expectNoAxeViolations, renderApp } from "../test/render";

function admin() {
  return mockApi()
    .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
    .on("GET", "/api/v1/admin/settings", json(200, SETTINGS));
}

describe("A7 Settings", () => {
  it("AC-045 UX-021 saves a lead time of 10 working days and says it applies to new orders", async () => {
    const api = admin().on(
      "PUT",
      "/api/v1/admin/settings",
      json(200, { ...SETTINGS, leadTimeWorkingDays: 10 }),
    );
    const { user } = renderApp("/admin/settings");
    const field = await screen.findByLabelText("Standard lead time (working days)");
    expect(document.title).toBe("Settings - Fineline admin");
    expect(field).toHaveValue("7");
    expect(field).toHaveAttribute("inputmode", "numeric");
    // AC-040: the drawing area is shown read-only.
    expect(
      screen.getByText("Drawing area: 180 x 267 mm (set in the deployment configuration)"),
    ).toBeInTheDocument();
    await expectNoAxeViolations();

    await user.clear(field);
    await user.type(field, "10");
    await user.click(screen.getByRole("button", { name: "Save lead time" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Lead time saved: 10 working days. It applies to orders placed from now on.",
      ),
    );
    const put = api.callsTo("PUT", "/api/v1/admin/settings")[0]!;
    expect(put.body).toEqual({ leadTimeWorkingDays: 10 });
    expect(put.headers.get("X-Requested-With")).toBe("fineline");
  });

  it.each(["0", "2.5", "61"])("AC-046 refuses %j and keeps the saved value", async (value) => {
    const api = admin();
    const { user } = renderApp("/admin/settings");
    const field = await screen.findByLabelText("Standard lead time (working days)");
    await user.clear(field);
    await user.type(field, value);
    await user.click(screen.getByRole("button", { name: "Save lead time" }));
    expect(
      screen.getByText("The lead time must be a whole number from 1 to 60."),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue(value);
    expect(api.callsTo("PUT", "/api/v1/admin/settings")).toHaveLength(0);
  });

  it("AC-046 maps the API's validation_failed to the same message", async () => {
    admin().on("PUT", "/api/v1/admin/settings", apiError(400, "validation_failed", "Invalid"));
    const { user } = renderApp("/admin/settings");
    await user.click(await screen.findByRole("button", { name: "Save lead time" }));
    expect(
      await screen.findByText("The lead time must be a whole number from 1 to 60."),
    ).toBeInTheDocument();
  });

  it("UX-022 a second press while saving sends nothing", async () => {
    const api = admin().on("PUT", "/api/v1/admin/settings", () => new Promise<Response>(() => {}));
    const { user } = renderApp("/admin/settings");
    await user.click(await screen.findByRole("button", { name: "Save lead time" }));
    const busy = screen.getByRole("button", { name: "Saving..." });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    await user.click(busy);
    expect(api.callsTo("PUT", "/api/v1/admin/settings")).toHaveLength(1);
  });

  it("shows the load error with Try again", async () => {
    mockApi()
      .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("GET", "/api/v1/admin/settings", networkFailure(), json(200, SETTINGS));
    const { user } = renderApp("/admin/settings");
    expect(
      await screen.findByText("We couldn't load the settings. Check the connection and try again."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Standard lead time (working days)")).toHaveValue("7");
  });
});
