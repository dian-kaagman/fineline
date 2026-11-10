import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DRAWING_SVG, OAK, WALNUT, confirmation, drawingPreview, jpeg } from "../test/fixtures";
import { apiError, deferred, json, mockApi, networkFailure } from "../test/http";
import { expectNoAxeViolations, mockImageSize, mockReducedMotion, renderApp } from "../test/render";

type Api = ReturnType<typeof mockApi>;

const OAK_NAME = "Oak A4, 210 x 297 mm, €49.95";
const WALNUT_NAME = "Walnut 30x40, 300 x 400 mm, €69.95";

function shopApi(): Api {
  return mockApi().on("GET", "/api/v1/frames", json(200, { frames: [OAK, WALNUT] }));
}

function h1() {
  return screen.getByRole("heading", { level: 1 });
}

async function choosePhoto(user: UserEvent, file: File = jpeg()) {
  await user.upload(screen.getByLabelText(/^Choose (a|another) photo$/), file);
}

async function reachPreview(user: UserEvent, api: Api, preview = drawingPreview()) {
  api.on("POST", "/api/v1/drawings", json(201, preview));
  await choosePhoto(user);
  await screen.findByRole("heading", { level: 1, name: "Your drawing is ready" });
}

async function reachFrames(user: UserEvent, api: Api) {
  await reachPreview(user, api);
  await user.click(screen.getByRole("button", { name: "Choose a frame" }));
  await screen.findByRole("radio", { name: OAK_NAME });
}

async function reachDetails(user: UserEvent, api: Api, frameName = OAK_NAME) {
  await reachFrames(user, api);
  await user.click(screen.getByRole("radio", { name: frameName }));
  await user.click(screen.getByRole("button", { name: "Continue to your details" }));
  await screen.findByRole("heading", { level: 1, name: "Your details" });
}

async function fillDetails(user: UserEvent) {
  await user.type(screen.getByLabelText("Name"), "Anna de Vries");
  await user.type(screen.getByLabelText("Email"), "anna@example.nl");
  await user.click(screen.getByRole("radio", { name: "Netherlands" }));
  await user.type(screen.getByLabelText("Street"), "Lindelaan");
  await user.type(screen.getByLabelText("House number"), "12");
  await user.type(screen.getByLabelText("Postal code"), "3512ab");
  await user.type(screen.getByLabelText("City"), "Utrecht");
  await user.click(
    screen.getByRole("checkbox", { name: "I agree that my photo is used only to make my drawing" }),
  );
}

function placeOrderButton() {
  return screen.getByRole("button", { name: /Place order|Placing order/ });
}

describe("C1 Photo", () => {
  it("UX-015 UX-016 UX-017 UX-029 shows step 1 with landmarks, skip link, step indicator and contact help", async () => {
    shopApi();
    const { user } = renderApp("/");
    expect(h1()).toHaveTextContent("Turn your photo into a fineline drawing");
    expect(document.title).toBe("Step 1 of 4: Your photo - Fineline");
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Questions? Email us at hello@example.com",
    );
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", { name: "hello@example.com" }),
    ).toHaveAttribute("href", "mailto:hello@example.com");
    expect(screen.getByText("Step 1 of 4: Photo")).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Progress" });
    expect(within(steps).getByText("Photo").closest("li")).toHaveAttribute("aria-current", "step");
    // UX-003: no focus move on the first page load; the skip link is the first Tab stop.
    expect(document.body).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("main")).toHaveFocus();
    await expectNoAxeViolations();
  });

  it("UX-028 offers a native, labelled file input linked to the requirements", () => {
    shopApi();
    renderApp("/");
    const input = screen.getByLabelText("Choose a photo");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif",
    );
    expect(input).toHaveAccessibleDescription(
      "JPEG, PNG or HEIC, up to 15 MB, at least 800 pixels on the shortest side.",
    );
    expect(input).not.toHaveStyle({ display: "none" });
  });

  it("AC-002 rejects a GIF in the browser with the API's message and sends nothing", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await choosePhoto(user, jpeg("party.gif", 2 * 1024 * 1024, "image/gif"));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Use a JPEG, PNG or HEIC photo.");
    expect(notice).toHaveFocus();
    expect(api.callsTo("POST", "/api/v1/drawings")).toHaveLength(0);
    expect(screen.getByLabelText("Choose a photo")).toBeInTheDocument();
  });

  it("AC-003 rejects a 16.2 MB photo before sending it", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await choosePhoto(user, jpeg("big.png", 16.2 * 1024 * 1024, "image/png"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The photo must be at most 15 MB. Choose a smaller photo.",
    );
    expect(api.callsTo("POST", "/api/v1/drawings")).toHaveLength(0);
  });

  it("AC-003 treats any HTTP 413, also nginx's own HTML one, as too large", async () => {
    shopApi().on(
      "POST",
      "/api/v1/drawings",
      new Response("<html>413</html>", { status: 413, headers: { "Content-Type": "text/html" } }),
    );
    const { user } = renderApp("/");
    await choosePhoto(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("The photo must be at most 15 MB.");
  });

  it("AC-004 rejects a 1200 x 700 photo in the browser when it can read the size", async () => {
    mockImageSize(1200, 700);
    const api = shopApi();
    const { user } = renderApp("/");
    await choosePhoto(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The photo's shortest side must be at least 800 pixels. Choose a larger photo.",
    );
    expect(api.callsTo("POST", "/api/v1/drawings")).toHaveLength(0);
  });

  it.each([
    ["AC-004", "photo_too_small", "The photo's shortest side must be at least 800 pixels."],
    ["AC-050", "photo_unsupported_type", "Use a JPEG, PNG or HEIC photo."],
    [
      "AC-051",
      "photo_too_many_pixels",
      "The photo may have at most 50 megapixels. Choose a smaller photo.",
    ],
    ["AC-052", "validation_failed", "Choose one photo and try again."],
    ["AC-053", "photo_too_many_pixels", "The photo may have at most 50 megapixels."],
    [
      "F3",
      "photo_unreadable",
      "We couldn't open this photo. It may be damaged. Please try another photo.",
    ],
    ["F3", "photo_missing", "Choose a photo to make your drawing."],
  ])("%s shows the message for the API's %s", async (_id, code, message) => {
    shopApi().on("POST", "/api/v1/drawings", apiError(400, code));
    const { user } = renderApp("/");
    await choosePhoto(user);
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(message);
    expect(notice).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("AC-008 asks for another photo when no drawing can be made, with a way to choose one", async () => {
    shopApi().on("POST", "/api/v1/drawings", apiError(400, "photo_no_drawable_content"));
    const { user } = renderApp("/");
    await choosePhoto(user, jpeg("black.jpg"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't make a drawing from this photo. Please try another photo.",
    );
    expect(screen.queryByRole("img", { name: /Preview/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Choose a photo")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("AC-054 AC-055 says drawings can't be made now and Try again resends the same photo", async () => {
    const api = shopApi().on(
      "POST",
      "/api/v1/drawings",
      apiError(503, "conversion_unavailable", "Busy", undefined, { "Retry-After": "30" }),
      json(201, drawingPreview()),
    );
    const { user } = renderApp("/");
    const photo = jpeg("me.jpg");
    await choosePhoto(user, photo);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We can't make drawings right now. Please try again in a few minutes.",
    );
    expect(screen.getByLabelText("Choose another photo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { level: 1, name: "Your drawing is ready" });
    const sent = api
      .callsTo("POST", "/api/v1/drawings")
      .map((call) => (call.body as FormData).get("photo"));
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(sent[0]);
  });

  it("F3b maps proxy 502/504 to the same message", async () => {
    shopApi().on("POST", "/api/v1/drawings", new Response("Bad gateway", { status: 502 }));
    const { user } = renderApp("/");
    await choosePhoto(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("We can't make drawings right now.");
  });

  it("AC-057 names the wait from Retry-After when too many drawings were made", async () => {
    shopApi().on(
      "POST",
      "/api/v1/drawings",
      apiError(429, "rate_limited", "Too many", undefined, { "Retry-After": "900" }),
    );
    const { user } = renderApp("/");
    await choosePhoto(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You've made a lot of drawings in a short time. Please wait 15 minutes and try again.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("F3b reports a lost connection", async () => {
    shopApi().on("POST", "/api/v1/drawings", networkFailure());
    const { user } = renderApp("/");
    await choosePhoto(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't send your photo. Check your internet connection and try again.",
    );
  });
});

describe("C2 Making your drawing", () => {
  it("AC-001 AC-007 UX-008 accepts a HEIC photo and shows one announced, indeterminate progress state until the preview", async () => {
    const pending = deferred<Response>();
    const api = shopApi().on("POST", "/api/v1/drawings", () => pending.promise);
    const { user } = renderApp("/");
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    await choosePhoto(user, jpeg("IMG_0001.HEIC", 3.1 * 1024 * 1024, "image/heic"));
    await screen.findByRole("heading", { level: 1, name: "Making your drawing" });
    expect(api.callsTo("POST", "/api/v1/drawings")).toHaveLength(1);
    expect(status).toHaveTextContent("Making your drawing. This usually takes a few seconds.");
    expect(status.textContent?.match(/Making your drawing\./g)).toHaveLength(1);
    const progress = screen.getByRole("progressbar", { name: "Progress of your drawing" });
    expect(progress).not.toHaveAttribute("value");
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(h1()).toHaveFocus();
    expect(document.title).toBe("Step 1 of 4: Making your drawing - Fineline");
    await expectNoAxeViolations();

    await act(async () => pending.resolve(json(201, drawingPreview())));
    const heading = await screen.findByRole("heading", { level: 1, name: "Your drawing is ready" });
    // UX-003: success is announced by the focus move to the new step's heading.
    expect(heading).toHaveFocus();
    expect(document.title).toBe("Step 2 of 4: Your drawing - Fineline");
    expect(screen.getByRole("main")).not.toHaveAttribute("aria-busy");
    expect(status).toBeEmptyDOMElement();
  });

  it("UX-008 Cancel aborts the request, ignores a late answer and shows the stopped notice", async () => {
    // The fake server still answers after the abort, as if the answer was already on its way.
    const late = deferred<Response>();
    const api = mockApi({ honourAbort: false })
      .on("GET", "/api/v1/frames", json(200, { frames: [OAK] }))
      .on("POST", "/api/v1/drawings", () => late.promise);
    const { user } = renderApp("/");
    await choosePhoto(user);
    await screen.findByRole("heading", { level: 1, name: "Making your drawing" });
    const signal = api.callsTo("POST", "/api/v1/drawings")[0]!.signal!;
    expect(signal.aborted).toBe(false);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signal.aborted).toBe(true);
    await act(async () => late.resolve(json(201, drawingPreview())));
    expect(h1()).toHaveTextContent("Turn your photo into a fineline drawing");
    expect(screen.queryByRole("img", { name: /Preview/ })).not.toBeInTheDocument();
    expect(
      await screen.findByText("Stopped. Choose a photo when you're ready."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Stopped. Choose a photo when you're ready.").closest(".notice"),
    ).toHaveFocus();
    expect(screen.getByLabelText("Choose a photo")).toBeInTheDocument();
  });

  it("AC-009 a second photo chosen during the pre-check wins; the first is never sent", async () => {
    // The browser takes a while to read the first photo's size.
    let release: (() => void) | null = null;
    class SlowImage {
      naturalWidth = 1600;
      naturalHeight = 1200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        release = () => this.onload?.();
      }
    }
    globalThis.Image = SlowImage as unknown as typeof Image;
    const api = shopApi().on(
      "POST",
      "/api/v1/drawings",
      json(201, drawingPreview({ svg: DRAWING_SVG.replace("M10 10", "M99 99") })),
    );
    const { user } = renderApp("/");
    await choosePhoto(user, jpeg("first.jpg"));
    const releaseFirst = release!;
    await choosePhoto(user, jpeg("second.jpg"));
    await act(async () => release!());
    await screen.findByRole("heading", { level: 1, name: "Your drawing is ready" });
    await act(async () => releaseFirst());
    const sent = api
      .callsTo("POST", "/api/v1/drawings")
      .map((call) => (call.body as FormData).get("photo") as File);
    expect(sent.map((file) => file.name)).toEqual(["second.jpg"]);
    expect(
      decodeURIComponent(screen.getByRole("img", { name: /Preview/ }).getAttribute("src")!),
    ).toContain("M99 99");
  });

  it("UX-010 shows the static pen illustration instead of the animation under reduced motion", async () => {
    mockReducedMotion(true);
    shopApi().on("POST", "/api/v1/drawings", () => new Promise<Response>(() => {}));
    const { user } = renderApp("/");
    await choosePhoto(user);
    await screen.findByRole("heading", { level: 1, name: "Making your drawing" });
    expect(screen.getByTestId("pen-static")).toBeInTheDocument();
    expect(screen.queryByTestId("pen-animated")).not.toBeInTheDocument();
    // The native indeterminate bar animates itself, so a static bar replaces it.
    const progress = screen.getByRole("progressbar", { name: "Progress of your drawing" });
    expect(progress.tagName).not.toBe("PROGRESS");
  });

  it("UX-010 animates the pen when motion is fine", async () => {
    shopApi().on("POST", "/api/v1/drawings", () => new Promise<Response>(() => {}));
    const { user } = renderApp("/");
    await choosePhoto(user);
    await screen.findByRole("heading", { level: 1, name: "Making your drawing" });
    expect(screen.getByTestId("pen-animated")).toBeInTheDocument();
  });
});

describe("C3 Preview", () => {
  it("AC-056 AC-005 UX-009 SR-007 shows the returned SVG only as a data-URL image, never as markup", async () => {
    const api = shopApi();
    const { user, container } = renderApp("/");
    await reachPreview(user, api);
    const image = screen.getByRole("img", {
      name: "Preview of your line drawing, made from your photo",
    });
    const src = image.getAttribute("src")!;
    expect(src.startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(src.slice(src.indexOf(",") + 1))).toBe(DRAWING_SVG);
    expect(image).toHaveAttribute("width", "180");
    expect(image).toHaveAttribute("height", "267");
    expect(container.querySelector('path[d="M10 10 L170 257"]')).toBeNull();
    expect(container.innerHTML).not.toContain("M10 10 L170 257");
    expect(screen.getByText("What you see is exactly what we'll draw.")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4: Preview")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("UX-025 tells when the preview can no longer be ordered", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachPreview(user, api);
    expect(
      screen.getByText(/^You can order this drawing until \d\d:\d\d on \w+day \d+ \w+\.$/),
    ).toBeInTheDocument();
  });

  it("AC-009 Try another photo gives a new preview, and the order uses the second one; no detail or crop controls", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachPreview(user, api);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try another photo" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Choose another photo" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Choose a photo")).toHaveFocus());

    const second = drawingPreview({
      drawingId: "7f2d7d1f-2b3c-4d4e-9fa0-1b2c3d4e5f60",
      previewToken: "token-second-0123456789abcdefghijklmnopqrstuvwxy",
      svg: DRAWING_SVG.replace("M10 10", "M20 20"),
    });
    api.on("POST", "/api/v1/drawings", json(201, second));
    await choosePhoto(user, jpeg("second.jpg"));
    await screen.findByRole("heading", { level: 1, name: "Your drawing is ready" });
    const src = screen.getByRole("img", { name: /Preview/ }).getAttribute("src")!;
    expect(decodeURIComponent(src)).toContain("M20 20");

    await user.click(screen.getByRole("button", { name: "Choose a frame" }));
    await user.click(await screen.findByRole("radio", { name: OAK_NAME }));
    await user.click(screen.getByRole("button", { name: "Continue to your details" }));
    await fillDetails(user);
    api.on("POST", "/api/v1/orders", json(201, confirmation()));
    await user.click(placeOrderButton());
    await screen.findByRole("heading", { level: 1, name: "Thank you, your order is placed" });
    expect(api.callsTo("POST", "/api/v1/orders")[0]!.body).toMatchObject({
      drawingId: second.drawingId,
      previewToken: second.previewToken,
    });
  });

  it("AC-011 UX-025 shows the expired state when the 24 hours have passed", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    api.on(
      "POST",
      "/api/v1/drawings",
      json(201, drawingPreview({ expiresAt: "2020-01-01T00:00:00Z" })),
    );
    await choosePhoto(user);
    await screen.findByRole("heading", { level: 1, name: "Your drawing is ready" });
    await user.click(screen.getByRole("button", { name: "Choose a frame" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(
      "This preview is no longer available. Please upload your photo again.",
    );
    expect(notice).toHaveFocus();
    expect(screen.getByLabelText("Upload your photo again")).toHaveAttribute("type", "file");
    expect(screen.queryByRole("img", { name: /Preview/ })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

describe("C4 Frame", () => {
  it("AC-013 UX-018 offers the in-stock frames from the API as native radios with name, size and price", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachFrames(user, api);
    expect(h1()).toHaveTextContent("Choose a frame");
    expect(h1()).toHaveFocus();
    expect(document.title).toBe("Step 3 of 4: Choose a frame - Fineline");
    const group = screen.getByRole("group", { name: "Frame" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
      OAK_NAME,
      WALNUT_NAME,
    ]);
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(screen.queryByText(/Black A4/)).not.toBeInTheDocument();
    expect(screen.getByText("€49.95")).toBeInTheDocument();
    expect(screen.getByText("210 x 297 mm")).toBeInTheDocument();
    const photo = group.querySelector(`img[src="${OAK.photoUrl}"]`);
    expect(photo).toHaveAttribute("alt", "");
    await expectNoAxeViolations();
  });

  it("UX-018 arrow keys move between frames and the selection shows a check icon (UX-011)", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachFrames(user, api);
    await user.click(screen.getByRole("radio", { name: OAK_NAME }));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: WALNUT_NAME })).toBeChecked();
    expect(
      screen
        .getByRole("radio", { name: WALNUT_NAME })
        .closest("label")
        ?.querySelector(".icon--check"),
    ).not.toBeNull();
  });

  it("UX-018 asks to choose a frame and focuses the first radio", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachFrames(user, api);
    await user.click(screen.getByRole("button", { name: "Continue to your details" }));
    expect(screen.getByText("Choose a frame to continue.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Frame" })).toHaveAccessibleDescription(
      "Error: Choose a frame to continue.",
    );
    expect(screen.getByRole("radio", { name: OAK_NAME })).toHaveFocus();
  });

  it("shows the sold-out-everywhere state without Continue", async () => {
    const api = mockApi().on("GET", "/api/v1/frames", json(200, { frames: [] }));
    const { user } = renderApp("/");
    await reachPreview(user, api);
    await user.click(screen.getByRole("button", { name: "Choose a frame" }));
    expect(await screen.findByText(/All our frames are sold out right now/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue to your details" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to your drawing" })).toBeInTheDocument();
  });

  it("offers Try again when the frames didn't load", async () => {
    // The first load starts in the background while the drawing is made, the second on entering step 3.
    const api = mockApi().on(
      "GET",
      "/api/v1/frames",
      networkFailure(),
      networkFailure(),
      json(200, { frames: [OAK] }),
    );
    const { user } = renderApp("/");
    await reachPreview(user, api);
    await user.click(screen.getByRole("button", { name: "Choose a frame" }));
    expect(await screen.findByText(/We couldn't load the frames/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("radio", { name: OAK_NAME })).toBeInTheDocument();
  });
});

describe("C5 Details", () => {
  it("AC-017 UX-007 shows the form with autocomplete, the photo terms and the withdrawal notice above Place order", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachDetails(user, api);
    expect(document.title).toBe("Step 4 of 4: Your details - Fineline");
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "name");
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAttribute("inputmode", "email");
    expect(screen.getByLabelText("Street")).toHaveAttribute("autocomplete", "address-line1");
    expect(screen.getByLabelText("Postal code")).toHaveAttribute("autocomplete", "postal-code");
    expect(screen.getByLabelText("City")).toHaveAttribute("autocomplete", "address-level2");
    expect(screen.getByRole("radio", { name: "Netherlands" })).toHaveAttribute(
      "autocomplete",
      "country",
    );
    // AC-015: only the Netherlands and Belgium can be chosen.
    expect(
      within(screen.getByRole("group", { name: "Country" })).getAllByRole("radio"),
    ).toHaveLength(2);

    const withdrawal = screen.getByText(
      "This drawing is made just for you, so the 14-day right of withdrawal does not apply.",
    );
    expect(
      withdrawal.compareDocumentPosition(placeOrderButton()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Total: €49.95 (including VAT)")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Your drawing" }).getAttribute("src")).toMatch(
      /^data:image\/svg\+xml/,
    );
    expect(placeOrderButton()).toBeEnabled();
    await expectNoAxeViolations();
  });

  it("AC-014 UX-006 rejects invalid details per field, keeps them, and links the summary to the fields", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await user.type(screen.getByLabelText("Name"), "Anna de Vries");
    await user.type(screen.getByLabelText("Email"), "anna@example");
    await user.click(screen.getByRole("radio", { name: "Netherlands" }));
    await user.type(screen.getByLabelText("Street"), "Lindelaan");
    await user.type(screen.getByLabelText("House number"), "12");
    await user.type(screen.getByLabelText("Postal code"), "12345");
    await user.click(screen.getByRole("checkbox", { name: /I agree/ }));
    await user.click(placeOrderButton());

    const summary = screen.getByRole("heading", { name: "There is a problem" }).parentElement!;
    await waitFor(() => expect(summary).toHaveFocus());
    const links = within(summary)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links).toEqual([
      "Enter a valid email address, like name@example.com.",
      "Enter a Dutch postal code, like 1234 AB.",
      "Enter your city.",
    ]);
    expect(api.callsTo("POST", "/api/v1/orders")).toHaveLength(0);

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email.getAttribute("aria-describedby")).toBe("details-email-error details-email-hint");
    expect(email).toHaveAccessibleDescription(
      "Error: Enter a valid email address, like name@example.com. We only use it to contact you about this order.",
    );
    expect(screen.getByLabelText("City")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Postal code")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Name")).toHaveValue("Anna de Vries");
    expect(email).toHaveValue("anna@example");
    expect(screen.getByLabelText("Postal code")).toHaveValue("12345");

    await user.click(within(summary).getByRole("link", { name: "Enter your city." }));
    expect(screen.getByLabelText("City")).toHaveFocus();
    await expectNoAxeViolations();
  });

  it("UX-006 errors and the summary stay until the next submit, so one tap on Place order after fixing them sends", async () => {
    const api = shopApi().on("POST", "/api/v1/orders", json(201, confirmation()));
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.clear(screen.getByLabelText("City"));
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "anna@example");
    await user.click(placeOrderButton());
    const summary = screen.getByRole("heading", { name: "There is a problem" }).parentElement!;
    const before = summary.innerHTML;

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "anna@example.nl");
    await user.type(screen.getByLabelText("City"), "Utrecht");
    fireEvent.blur(screen.getByLabelText("City"));
    // Nothing above the button moved: the summary and inline errors are as they were.
    expect(summary).toBeInTheDocument();
    expect(summary.innerHTML).toBe(before);
    expect(screen.getByLabelText("City")).toHaveAttribute("aria-invalid", "true");

    await user.click(placeOrderButton());
    await screen.findByRole("heading", { level: 1, name: "Thank you, your order is placed" });
    expect(api.callsTo("POST", "/api/v1/orders")).toHaveLength(1);
  });

  it("AC-016 asks to agree to the photo terms and sends nothing", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(screen.getByRole("checkbox", { name: /I agree/ }));
    await user.click(placeOrderButton());
    expect(
      screen.getAllByText(
        "Tick the box to agree to the photo terms. We can only make your drawing with your agreement.",
      ),
    ).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: /I agree/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(api.callsTo("POST", "/api/v1/orders")).toHaveLength(0);
  });

  it("AC-015 shows the API's country refusal on the country field", async () => {
    const api = shopApi().on(
      "POST",
      "/api/v1/orders",
      apiError(400, "country_not_supported", "We deliver to the Netherlands and Belgium only", [
        { field: "address.country", message: "Not supported" },
      ]),
    );
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(placeOrderButton());
    expect(
      await screen.findAllByText("We deliver to the Netherlands and Belgium only."),
    ).toHaveLength(2);
  });

  it("AC-059 shows unexpected-field details from the API without a field to link", async () => {
    const api = shopApi().on(
      "POST",
      "/api/v1/orders",
      apiError(400, "validation_failed", "Invalid", [
        { field: "priceCents", message: "Unexpected field." },
      ]),
    );
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(placeOrderButton());
    expect(await screen.findByText("Check this field. Unexpected field.")).toBeInTheDocument();
  });

  it("AC-018 UX-003 places the order and shows number, delivery date and price from the response", async () => {
    const api = shopApi().on("POST", "/api/v1/orders", json(201, confirmation()));
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(placeOrderButton());

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Thank you, your order is placed",
    });
    expect(heading).toHaveFocus();
    expect(document.title).toBe("Order placed - Fineline");
    expect(screen.getByText("FL-2026-0042")).toBeInTheDocument();
    expect(screen.getByText("Tuesday 17 November 2026")).toBeInTheDocument();
    expect(screen.getByText("€49.95 (including VAT)")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Progress" })).not.toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Questions? Email us at");
    expect(api.callsTo("POST", "/api/v1/orders")[0]!.body).toEqual({
      drawingId: drawingPreview().drawingId,
      previewToken: drawingPreview().previewToken,
      frameId: OAK.id,
      customer: { name: "Anna de Vries", email: "anna@example.nl" },
      address: {
        street: "Lindelaan",
        houseNumber: "12",
        postalCode: "3512 AB",
        city: "Utrecht",
        country: "NL",
      },
      acceptedPhotoTerms: true,
    });
    await expectNoAxeViolations();
  });

  it("AC-058 a 200 replay shows the original order's values, not the form's", async () => {
    const original = confirmation({
      customerName: "Anna de Vries",
      address: {
        street: "Oudegracht",
        houseNumber: "1",
        postalCode: "3511 AA",
        city: "Utrecht",
        country: "NL",
      },
    });
    const api = shopApi().on("POST", "/api/v1/orders", networkFailure(), json(200, original));
    const { user } = renderApp("/");
    await reachDetails(user, api, WALNUT_NAME);
    await fillDetails(user);
    await user.click(placeOrderButton());
    const notice = await screen.findByText(
      "We couldn't reach our shop. Check your internet connection and try again.",
    );
    await waitFor(() => expect(notice.closest(".notice")).toHaveFocus());
    expect(screen.getByLabelText("Name")).toHaveValue("Anna de Vries");

    await user.click(placeOrderButton());
    await screen.findByRole("heading", { level: 1, name: "Thank you, your order is placed" });
    expect(screen.getByText("FL-2026-0042")).toBeInTheDocument();
    expect(screen.getByText("Oak A4")).toBeInTheDocument();
    expect(screen.getByText("€49.95 (including VAT)")).toBeInTheDocument();
    expect(screen.getByText("Tuesday 17 November 2026")).toBeInTheDocument();
    expect(screen.getByText("Oudegracht 1")).toBeInTheDocument();
    expect(screen.queryByText("Walnut 30x40")).not.toBeInTheDocument();
  });

  it("AC-020 UX-026 a sold-out frame sends the customer back to the frames with details and preview kept", async () => {
    const api = shopApi().on(
      "POST",
      "/api/v1/orders",
      apiError(409, "frame_sold_out", "This frame just sold out."),
    );
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    api.on("GET", "/api/v1/frames", json(200, { frames: [WALNUT] }));
    await user.click(placeOrderButton());

    const notice = await screen.findByText(
      "This frame just sold out: Oak A4. Please choose another frame - your details and drawing are kept.",
    );
    await waitFor(() => expect(notice.closest(".notice")).toHaveFocus());
    expect(h1()).toHaveTextContent("Choose a frame");
    expect(await screen.findByRole("radio", { name: WALNUT_NAME })).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: OAK_NAME })).not.toBeInTheDocument();
    await expectNoAxeViolations();

    await user.click(screen.getByRole("radio", { name: WALNUT_NAME }));
    await user.click(screen.getByRole("button", { name: "Continue to your details" }));
    await screen.findByRole("heading", { level: 1, name: "Your details" });
    expect(screen.getByLabelText("Name")).toHaveValue("Anna de Vries");
    expect(screen.getByLabelText("Postal code")).toHaveValue("3512ab");
    expect(screen.getByRole("checkbox", { name: /I agree/ })).toBeChecked();

    api.on(
      "POST",
      "/api/v1/orders",
      json(201, confirmation({ frameName: "Walnut 30x40", priceCents: 6995 })),
    );
    await user.click(placeOrderButton());
    await screen.findByRole("heading", { level: 1, name: "Thank you, your order is placed" });
    expect(api.callsTo("POST", "/api/v1/orders").at(-1)!.body).toMatchObject({
      frameId: WALNUT.id,
    });
  });

  it("AC-020 treats 422 frame_not_found like a sold-out frame", async () => {
    const api = shopApi().on("POST", "/api/v1/orders", apiError(422, "frame_not_found"));
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    api.on("GET", "/api/v1/frames", json(200, { frames: [WALNUT] }));
    await user.click(placeOrderButton());
    expect(await screen.findByText(/This frame just sold out: Oak A4\./)).toBeInTheDocument();
    expect(h1()).toHaveTextContent("Choose a frame");
  });

  it("AC-020 UX-026 a sold-out answer that arrives after the customer went back still lands on the frames", async () => {
    const pending = deferred<Response>();
    const api = shopApi().on("POST", "/api/v1/orders", () => pending.promise);
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(placeOrderButton());
    await user.click(screen.getByRole("button", { name: "Back to frames" }));
    await screen.findByRole("heading", { level: 1, name: "Choose a frame" });
    api.on("GET", "/api/v1/frames", json(200, { frames: [WALNUT] }));
    await act(async () => pending.resolve(apiError(409, "frame_sold_out")));
    expect(await screen.findByText(/This frame just sold out: Oak A4\./)).toBeInTheDocument();
    expect(h1()).toHaveTextContent("Choose a frame");
    expect(await screen.findByRole("radio", { name: WALNUT_NAME })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: WALNUT_NAME }));
    await user.click(screen.getByRole("button", { name: "Continue to your details" }));
    expect(await screen.findByLabelText("Name")).toHaveValue("Anna de Vries");
  });

  it("AC-058 BR-018 a retry after expiresAt is still sent, so the API can answer the original order", async () => {
    const api = shopApi().on("POST", "/api/v1/orders", networkFailure(), json(200, confirmation()));
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(placeOrderButton());
    await screen.findByText(/We couldn't reach our shop/);
    // The 24 hours pass before the customer tries again.
    const later = Date.parse(drawingPreview().expiresAt) + 2 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    await user.click(placeOrderButton());
    await screen.findByRole("heading", { level: 1, name: "Thank you, your order is placed" });
    expect(api.callsTo("POST", "/api/v1/orders")).toHaveLength(2);
  });

  it("BR-012 reloads the frames on entering step 3, so the price shown is the current one", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachPreview(user, api);
    api.on("GET", "/api/v1/frames", json(200, { frames: [{ ...OAK, priceCents: 5495 }] }));
    await user.click(screen.getByRole("button", { name: "Choose a frame" }));
    expect(
      await screen.findByRole("radio", { name: "Oak A4, 210 x 297 mm, €54.95" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Oak A4, 210 x 297 mm, €54.95" }));
    await user.click(screen.getByRole("button", { name: "Continue to your details" }));
    expect(await screen.findByText("Total: €54.95 (including VAT)")).toBeInTheDocument();
  });

  it("AC-022 AC-010 a preview the API no longer has shows the expired state, and the details stay", async () => {
    const api = shopApi().on(
      "POST",
      "/api/v1/orders",
      apiError(
        404,
        "drawing_not_found",
        "This preview is no longer available. Please upload your photo again.",
      ),
    );
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(placeOrderButton());
    const notice = await screen.findByText(
      "This preview is no longer available. Please upload your photo again.",
    );
    await waitFor(() => expect(notice.closest(".notice")).toHaveFocus());
    expect(screen.getByText("Your frame choice and details are kept.")).toBeInTheDocument();

    api.on(
      "POST",
      "/api/v1/drawings",
      json(201, drawingPreview({ drawingId: "8a3e8e20-3c4d-4e5f-8a0b-2c3d4e5f6071" })),
    );
    await user.upload(screen.getByLabelText("Upload your photo again"), jpeg());
    await screen.findByRole("heading", { level: 1, name: "Your drawing is ready" });
    await user.click(screen.getByRole("button", { name: "Choose a frame" }));
    expect(await screen.findByRole("radio", { name: OAK_NAME })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Continue to your details" }));
    expect(await screen.findByLabelText("Name")).toHaveValue("Anna de Vries");
  });

  it("AC-060 names the wait when too many orders were sent, keeping the input", async () => {
    const api = shopApi().on(
      "POST",
      "/api/v1/orders",
      apiError(429, "rate_limited", "Too many", undefined, { "Retry-After": "1200" }),
    );
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(placeOrderButton());
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(
      "Too many tries in a short time. Please wait 20 minutes and try again.",
    );
    await waitFor(() => expect(notice).toHaveFocus());
    expect(screen.getByLabelText("City")).toHaveValue("Utrecht");
  });

  it("UX-022 a second press while placing sends nothing and the button says Placing order...", async () => {
    const pending = deferred<Response>();
    const api = shopApi().on("POST", "/api/v1/orders", () => pending.promise);
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(placeOrderButton());
    const busy = screen.getByRole("button", { name: "Placing order..." });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    await user.click(busy);
    await user.keyboard("{Enter}");
    expect(api.callsTo("POST", "/api/v1/orders")).toHaveLength(1);
    await act(async () => pending.resolve(json(201, confirmation())));
    await screen.findByRole("heading", { level: 1, name: "Thank you, your order is placed" });
  });

  it("UX-026 going back to the frames and forward again keeps everything", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await user.type(screen.getByLabelText("Name"), "Anna de Vries");
    await user.click(screen.getByRole("button", { name: "Back to frames" }));
    expect(await screen.findByRole("radio", { name: OAK_NAME })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Continue to your details" }));
    expect(await screen.findByLabelText("Name")).toHaveValue("Anna de Vries");
  });
});

describe("C6 and starting again", () => {
  it("Make another drawing starts again with an empty form", async () => {
    const api = shopApi().on("POST", "/api/v1/orders", json(201, confirmation()));
    const { user } = renderApp("/");
    await reachDetails(user, api);
    await fillDetails(user);
    await user.click(placeOrderButton());
    await screen.findByRole("heading", { level: 1, name: "Thank you, your order is placed" });
    await user.click(screen.getByRole("button", { name: "Make another drawing" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Turn your photo into a fineline drawing",
      }),
    ).toHaveFocus();
  });

  it("UX-024 the wordmark asks before clearing a preview; Escape keeps going and focus returns", async () => {
    const api = shopApi();
    const { user } = renderApp("/");
    await reachPreview(user, api);
    const wordmark = screen.getByRole("link", { name: "Fineline" });
    await user.click(wordmark);
    const dialog = screen.getByRole("dialog", { name: "Start again?" });
    expect(dialog).toHaveAccessibleDescription(
      "Your drawing and the details you entered will be cleared.",
    );
    expect(within(dialog).getByRole("button", { name: "Keep going" })).toHaveFocus();
    await expectNoAxeViolations();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(wordmark).toHaveFocus();
    expect(h1()).toHaveTextContent("Your drawing is ready");

    await user.click(wordmark);
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Turn your photo into a fineline drawing",
      }),
    ).toBeInTheDocument();
  });
});

describe("X3 Page not found", () => {
  it("UX-029 shows the shop layout with the contact help and a way back", async () => {
    mockApi();
    renderApp("/no-such-page");
    expect(h1()).toHaveTextContent("Page not found");
    expect(document.title).toBe("Page not found - Fineline");
    expect(screen.getByRole("link", { name: "Go to the shop" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Questions? Email us at hello@example.com",
    );
    await expectNoAxeViolations();
  });
});
