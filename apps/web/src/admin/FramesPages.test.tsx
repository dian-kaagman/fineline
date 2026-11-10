import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SETTINGS, adminFrame, jpeg } from "../test/fixtures";
import { apiError, deferred, json, mockApi } from "../test/http";
import { expectNoAxeViolations, renderApp } from "../test/render";

const OAK = adminFrame();
const BLACK = adminFrame({
  id: "33333333-3333-4333-8333-333333333333",
  name: "Black A4",
  priceCents: 3995,
  stock: 0,
  photoUrl: "/api/v1/frames/33333333-3333-4333-8333-333333333333/photo",
});
const FRAME_URL = `/api/v1/admin/frames/${OAK.id}`;

function admin() {
  return mockApi()
    .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
    .on("GET", "/api/v1/admin/settings", json(200, SETTINGS));
}

describe("A4 Frames", () => {
  it("UX-019 lists all frames by name with size, price and stock, marking sold-out frames", async () => {
    admin().on("GET", "/api/v1/admin/frames", json(200, { frames: [BLACK, OAK] }));
    renderApp("/admin/frames");
    await screen.findByRole("link", { name: "Oak A4" });
    const table = screen.getByRole("table", { name: "All frames, by name" });
    expect(document.title).toBe("Frames - Fineline admin");
    const [black, oak] = within(table).getAllByRole("row").slice(1);
    expect(black).toHaveTextContent("Black A4");
    expect(black).toHaveTextContent("€39.95");
    expect(black).toHaveTextContent("Sold out - not offered to customers");
    expect(oak).toHaveTextContent("210 x 297 mm");
    expect(within(oak!).getByRole("link", { name: "Oak A4" })).toHaveAttribute(
      "href",
      `/admin/frames/${OAK.id}`,
    );
    expect(screen.getByRole("link", { name: "Add frame" })).toHaveAttribute(
      "href",
      "/admin/frames/new",
    );
    await expectNoAxeViolations();
  });

  it("shows the empty state", async () => {
    admin().on("GET", "/api/v1/admin/frames", json(200, { frames: [] }));
    renderApp("/admin/frames");
    expect(
      await screen.findByText("No frames yet. Add a frame so customers can order."),
    ).toBeInTheDocument();
  });
});

describe("A5 New frame", () => {
  async function fill(
    user: ReturnType<typeof renderApp>["user"],
    values: Record<string, string>,
    photo?: File,
  ) {
    for (const [label, value] of Object.entries(values)) {
      if (value) await user.type(screen.getByLabelText(label), value);
    }
    if (photo) await user.upload(screen.getByLabelText("Photo"), photo);
  }

  it("AC-039 UX-031 adds Oak A4 with a JPEG photo, price typed as 49,95", async () => {
    const api = admin()
      .on("POST", "/api/v1/admin/frames", json(201, adminFrame({ stock: 5 })))
      .on("GET", "/api/v1/admin/frames", json(200, { frames: [adminFrame({ stock: 5 })] }));
    const { user } = renderApp("/admin/frames/new");
    await screen.findByText(/At least 180 x 267 mm so the drawing fits/);
    expect(document.title).toBe("Add a frame - Fineline admin");
    expect(screen.getByLabelText("Inner width (mm)")).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText("Inner width (mm)")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Price (€, including VAT)")).toHaveAttribute(
      "inputmode",
      "decimal",
    );
    await expectNoAxeViolations();

    await fill(
      user,
      {
        Name: "Oak A4",
        "Inner width (mm)": "210",
        "Inner height (mm)": "297",
        "Price (€, including VAT)": "49,95",
        "Starting stock": " 5 ",
      },
      jpeg("oak.jpg"),
    );
    expect(screen.getByRole("img", { name: "Photo you chose" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add frame" }));

    const notice = await screen.findByText("Oak A4 added. Customers can order it now.");
    await waitFor(() => expect(notice.closest(".notice")).toHaveFocus());
    const form = api.callsTo("POST", "/api/v1/admin/frames")[0]!.body as FormData;
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== "photo"))).toEqual({
      name: "Oak A4",
      widthMm: "210",
      heightMm: "297",
      priceCents: "4995",
      stock: "5",
    });
    expect((form.get("photo") as File).name).toBe("oak.jpg");
  });

  it("AC-040 refuses a frame smaller than the drawing area on both size fields", async () => {
    const api = admin();
    const { user } = renderApp("/admin/frames/new");
    await screen.findByText(/At least 180 x 267 mm/);
    await fill(
      user,
      {
        Name: "Mini 13x18",
        "Inner width (mm)": "130",
        "Inner height (mm)": "180",
        "Price (€, including VAT)": "19.95",
        "Starting stock": "3",
      },
      jpeg(),
    );
    await user.click(screen.getByRole("button", { name: "Add frame" }));
    const message = "The frame must be at least 180 x 267 mm inside, so the drawing fits.";
    const summary = screen.getByRole("heading", { name: "There is a problem" }).parentElement!;
    await waitFor(() => expect(summary).toHaveFocus());
    expect(
      within(summary)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([message]);
    expect(screen.getByLabelText("Inner width (mm)")).toHaveAccessibleDescription(
      `Error: ${message} The visible inside of the frame, portrait. At least 180 x 267 mm so the drawing fits.`,
    );
    expect(screen.getByLabelText("Inner height (mm)")).toHaveAttribute("aria-invalid", "true");
    expect(api.callsTo("POST", "/api/v1/admin/frames")).toHaveLength(0);
  });

  it("AC-041 UX-006 names the price, the stock and the missing photo together", async () => {
    admin();
    const { user } = renderApp("/admin/frames/new");
    await screen.findByText(/At least 180 x 267 mm/);
    await fill(user, {
      Name: "Walnut 30x40",
      "Inner width (mm)": "300",
      "Inner height (mm)": "400",
      "Price (€, including VAT)": "0",
      "Starting stock": "-1",
    });
    await user.click(screen.getByRole("button", { name: "Add frame" }));
    const summary = screen.getByRole("heading", { name: "There is a problem" }).parentElement!;
    expect(
      within(summary)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Enter a price in euros above 0, like 49.95.",
      "Enter a starting stock of 0 or more, as a whole number.",
      "Choose a photo of the frame.",
    ]);
    expect(screen.getByLabelText("Price (€, including VAT)")).toHaveValue("0");
    await expectNoAxeViolations();
  });

  it("AC-041 shows the API's validation details on their fields", async () => {
    admin().on(
      "POST",
      "/api/v1/admin/frames",
      apiError(400, "validation_failed", "Invalid", [
        { field: "priceCents", message: "Must be at least 1" },
        { field: "stock", message: "Must be at least 0" },
        { field: "photo", message: "Unsupported type" },
      ]),
    );
    const { user } = renderApp("/admin/frames/new");
    await screen.findByText(/At least 180 x 267 mm/);
    await fill(
      user,
      {
        Name: "Walnut 30x40",
        "Inner width (mm)": "300",
        "Inner height (mm)": "400",
        "Price (€, including VAT)": "69.95",
        "Starting stock": "4",
      },
      jpeg("walnut.png", 1000, "image/png"),
    );
    await user.click(screen.getByRole("button", { name: "Add frame" }));
    expect(await screen.findAllByText("Use a JPEG, PNG or WebP photo.")).toHaveLength(2);
    expect(screen.getByLabelText("Price (€, including VAT)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Starting stock")).toHaveAttribute("aria-invalid", "true");
  });

  it("maps any 413 to the 5 MB photo message", async () => {
    admin().on("POST", "/api/v1/admin/frames", new Response("too large", { status: 413 }));
    const { user } = renderApp("/admin/frames/new");
    await screen.findByText(/At least 180 x 267 mm/);
    await fill(
      user,
      {
        Name: "Oak A4",
        "Inner width (mm)": "210",
        "Inner height (mm)": "297",
        "Price (€, including VAT)": "49.95",
        "Starting stock": "0",
      },
      jpeg(),
    );
    await user.click(screen.getByRole("button", { name: "Add frame" }));
    expect(await screen.findAllByText("The photo must be at most 5 MB.")).toHaveLength(2);
  });
});

describe("A6 Edit frame", () => {
  it("AC-042 saves only the changed price and notes that existing orders keep theirs", async () => {
    const api = admin()
      .on("GET", FRAME_URL, json(200, OAK))
      .on("PATCH", FRAME_URL, json(200, adminFrame({ priceCents: 5495 })));
    const { user } = renderApp(`/admin/frames/${OAK.id}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Oak A4" })).toBeInTheDocument();
    expect(document.title).toBe("Oak A4 - Fineline admin");
    const price = screen.getByLabelText("Price (€, including VAT)");
    expect(price).toHaveValue("49.95");
    expect(price).toHaveAccessibleDescription(
      "Price changes apply to new orders only. Existing orders keep their price.",
    );
    await expectNoAxeViolations();

    await user.clear(price);
    await user.type(price, "54.95");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
    expect(api.callsTo("PATCH", FRAME_URL)[0]!.body).toEqual({ priceCents: 5495 });
  });

  it("says Nothing changed without sending a request", async () => {
    const api = admin().on("GET", FRAME_URL, json(200, OAK));
    const { user } = renderApp(`/admin/frames/${OAK.id}`);
    await screen.findByRole("heading", { level: 1, name: "Oak A4" });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Nothing changed.")).toBeInTheDocument();
    expect(api.callsTo("PATCH", FRAME_URL)).toHaveLength(0);
  });

  it("AC-043 adds 5 to the stock of a sold-out frame and says it is offered again", async () => {
    const black = adminFrame({ ...BLACK });
    const url = `/api/v1/admin/frames/${black.id}`;
    const api = admin()
      .on("GET", url, json(200, black))
      .on("POST", `${url}/stock-adjustments`, json(200, { ...black, stock: 5 }));
    const { user } = renderApp(`/admin/frames/${black.id}`);
    expect(
      await screen.findByText("In stock: 0 - sold out, not offered to customers"),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Number of frames"), "5");
    await user.click(screen.getByRole("button", { name: "Add to stock" }));
    expect(await screen.findByText("In stock: 5")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Stock is now 5. Black A4 is offered to customers again.",
    );
    expect(api.callsTo("POST", /stock-adjustments$/)[0]!.body).toEqual({ delta: 5 });
  });

  it("AC-044 refuses removing more than is in stock and keeps the stock", async () => {
    const two = adminFrame({ stock: 2 });
    const api = admin()
      .on("GET", FRAME_URL, json(200, two))
      .on(
        "POST",
        `${FRAME_URL}/stock-adjustments`,
        apiError(409, "stock_negative", "Stock can't go below zero."),
      );
    const { user } = renderApp(`/admin/frames/${OAK.id}`);
    await screen.findByText("In stock: 2");
    const amount = screen.getByLabelText("Number of frames");
    await user.type(amount, "3");
    await user.click(screen.getByRole("button", { name: "Remove from stock" }));
    expect(
      await screen.findByText(
        "Stock can't go below zero. There are 2 in stock, so you can remove at most 2.",
      ),
    ).toBeInTheDocument();
    expect(amount).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(amount).toHaveFocus());
    expect(screen.getByText("In stock: 2")).toBeInTheDocument();
    expect(api.callsTo("POST", /stock-adjustments$/)[0]!.body).toEqual({ delta: -3 });
  });

  it("AC-044 says 'There is 1 in stock' for a single frame", async () => {
    const one = adminFrame({ stock: 1 });
    admin()
      .on("GET", FRAME_URL, json(200, one))
      .on("POST", `${FRAME_URL}/stock-adjustments`, apiError(409, "stock_negative"));
    const { user } = renderApp(`/admin/frames/${OAK.id}`);
    await screen.findByText("In stock: 1");
    await user.type(screen.getByLabelText("Number of frames"), "2");
    await user.click(screen.getByRole("button", { name: "Remove from stock" }));
    expect(
      await screen.findByText(
        "Stock can't go below zero. There is 1 in stock, so you can remove at most 1.",
      ),
    ).toBeInTheDocument();
  });

  it("UX-003 focus stays on the h1 when the frame loads after arriving from the list", async () => {
    const pending = deferred<Response>();
    admin()
      .on("GET", "/api/v1/admin/frames", json(200, { frames: [OAK] }))
      .on("GET", FRAME_URL, () => pending.promise);
    const { user } = renderApp("/admin/frames");
    await user.click(await screen.findByRole("link", { name: "Oak A4" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Frame" });
    expect(heading).toHaveFocus();
    await act(async () => pending.resolve(json(200, OAK)));
    expect(await screen.findByRole("heading", { level: 1, name: "Oak A4" })).toBe(heading);
    expect(heading).toHaveFocus();
  });

  it("UX-031 refuses a stock amount that isn't a whole number from 1 to 10000", async () => {
    const api = admin().on("GET", FRAME_URL, json(200, OAK));
    const { user } = renderApp(`/admin/frames/${OAK.id}`);
    await screen.findByText("In stock: 3");
    await user.type(screen.getByLabelText("Number of frames"), "1.5");
    await user.click(screen.getByRole("button", { name: "Add to stock" }));
    expect(screen.getByText("Enter a whole number from 1 to 10000.")).toBeInTheDocument();
    expect(api.callsTo("POST", /stock-adjustments$/)).toHaveLength(0);
  });

  it("UX-028 replaces the photo through a native file input and asks for a file first", async () => {
    const api = admin()
      .on("GET", FRAME_URL, json(200, OAK))
      .on(
        "PUT",
        `${FRAME_URL}/photo`,
        json(200, adminFrame({ updatedAt: "2026-11-10T10:00:00Z" })),
      );
    const { user } = renderApp(`/admin/frames/${OAK.id}`);
    expect(await screen.findByRole("img", { name: "Current photo of Oak A4" })).toHaveAttribute(
      "src",
      OAK.photoUrl,
    );
    await user.click(screen.getByRole("button", { name: "Replace photo" }));
    expect(screen.getByText("Choose a photo first.")).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Choose a new photo"), jpeg("new.jpg"));
    await user.click(screen.getByRole("button", { name: "Replace photo" }));
    expect(await screen.findByText("Photo replaced.")).toBeInTheDocument();
    expect(api.callsTo("PUT", `${FRAME_URL}/photo`)).toHaveLength(1);
  });

  it("shows Frame not found for a 404", async () => {
    admin().on("GET", FRAME_URL, apiError(404, "not_found"));
    renderApp(`/admin/frames/${OAK.id}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Frame not found" }),
    ).toBeInTheDocument();
  });
});
