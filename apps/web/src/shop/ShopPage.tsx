import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { ApiError, isAbortError } from "../api/client";
import {
  createDrawing,
  listFrames,
  placeOrder,
  type DrawingPreview,
  type OrderConfirmation,
} from "../api/shop";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { t } from "../i18n/t";
import { formatWait } from "../lib/format";
import { EMPTY_DETAILS, problemsFromApi, toOrderRequest, type CustomerDetails } from "./details";
import { precheckPhoto } from "./photoCheck";
import { photoErrorFor, type PhotoError } from "./photoErrors";
import { ShopLayout } from "./ShopLayout";
import { StepIndicator, type StepName } from "./StepIndicator";
import { ConfirmationStep } from "./steps/ConfirmationStep";
import { DetailsStep, type PlaceOrderOutcome } from "./steps/DetailsStep";
import { FrameStep, type FramesState } from "./steps/FrameStep";
import { MakingStep } from "./steps/MakingStep";
import { PHOTO_INPUT_ID, PhotoStep, STEP_NOTICE_ID, type PhotoStatus } from "./steps/PhotoStep";
import { PreviewStep } from "./steps/PreviewStep";

type Step = "photo" | "preview" | "frame" | "details" | "confirmation";
type View = Step | "making";

const STEPS: readonly Step[] = ["photo", "preview", "frame", "details", "confirmation"];
const HEADING_ID = "step-heading";

/** The step asked for by the history entry (`history.state`, P-5); anything else is step 1. */
function requestedStep(state: unknown): Step {
  const step = (state as { step?: unknown } | null)?.step;
  return STEPS.includes(step as Step) ? (step as Step) : "photo";
}

const TITLES: Record<View, string> = {
  photo: t("shop.title", { step: t("c1.title") }),
  making: t("shop.title", { step: t("c2.title") }),
  preview: t("shop.title", { step: t("c3.title") }),
  frame: t("shop.title", { step: t("c4.title") }),
  details: t("shop.title", { step: t("c5.title") }),
  confirmation: t("c6.title"),
};

function hasExpired(drawing: DrawingPreview): boolean {
  return Date.now() >= Date.parse(drawing.expiresAt);
}

/**
 * The customer shop at `/`: one page with four steps and a confirmation (docs/ux/flows.md F1-F9).
 * Everything lives in memory; each step change is a history entry so the phone's Back button works.
 */
export function ShopPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>({ kind: "idle" });
  const [converting, setConverting] = useState<{ thumbnailUrl: string | null } | null>(null);
  const [retryHeading, setRetryHeading] = useState(false);
  const [drawing, setDrawing] = useState<DrawingPreview | null>(null);
  const [expired, setExpired] = useState(false);
  const [frames, setFrames] = useState<FramesState>({ status: "loading" });
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [soldOutFrameName, setSoldOutFrameName] = useState<string | null>(null);
  const [details, setDetails] = useState<CustomerDetails>(EMPTY_DETAILS);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [startAgainOpen, setStartAgainOpen] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  const lastPhotoRef = useRef<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const framesRequestRef = useRef(0);
  const pendingFocusRef = useRef<string | null>(null);
  const previousViewRef = useRef<View | null>(null);
  const chooserRef = useRef<HTMLInputElement>(null);

  const selectedFrame =
    frames.status === "loaded"
      ? (frames.frames.find((frame) => frame.id === selectedFrameId) ?? null)
      : null;

  let step = requestedStep(location.state);
  if (step === "confirmation" && !confirmation) step = "photo";
  if ((step === "frame" || step === "details") && !drawing) step = expired ? "preview" : "photo";
  if (step === "preview" && !drawing && !expired) step = "photo";
  if (step === "details" && !selectedFrame) step = "frame";
  const view: View = converting ? "making" : step;

  useDocumentTitle(TITLES[view]);

  // Focus: a requested target (an error notice, the file chooser) wins; otherwise the new step's h1
  // after every step change, but not on the first page load (UX-003).
  useEffect(() => {
    const viewChanged = previousViewRef.current !== null && previousViewRef.current !== view;
    previousViewRef.current = view;
    const pending = pendingFocusRef.current;
    if (pending) {
      const target = document.getElementById(pending);
      if (target) {
        pendingFocusRef.current = null;
        target.focus();
        return;
      }
      if (viewChanged) pendingFocusRef.current = null;
    }
    if (viewChanged) document.getElementById(HEADING_ID)?.focus();
  }, [view, focusTick]);

  // Abort a running conversion when the page goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  function requestFocus(targetId: string) {
    pendingFocusRef.current = targetId;
    setFocusTick((tick) => tick + 1);
  }

  function loadFrames() {
    const request = ++framesRequestRef.current;
    setFrames({ status: "loading" });
    listFrames()
      .then((list) => {
        if (request !== framesRequestRef.current) return;
        setFrames({ status: "loaded", frames: list });
        setSelectedFrameId((current) =>
          list.some((frame) => frame.id === current) ? current : null,
        );
      })
      .catch(() => {
        if (request === framesRequestRef.current) setFrames({ status: "error" });
      });
  }

  function showPhotoError(error: PhotoError) {
    setPhotoStatus({ kind: "error", ...error });
    requestFocus(STEP_NOTICE_ID);
  }

  async function makeDrawing(photo: File) {
    if (step !== "photo") navigate("/", { state: { step: "photo" } });
    const problem = await precheckPhoto(photo);
    if (problem) {
      showPhotoError({ message: t(problem), retryable: false });
      return;
    }

    lastPhotoRef.current = photo;
    const thumbnailUrl =
      typeof URL.createObjectURL === "function" ? URL.createObjectURL(photo) : null;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhotoStatus({ kind: "idle" });
    setConverting({ thumbnailUrl });
    setAnnouncement(t("c2.working"));
    if (frames.status !== "loaded") loadFrames(); // so step 3 is instant

    try {
      const preview = await createDrawing(photo, controller.signal);
      setDrawing(preview);
      setExpired(false);
      setConverting(null);
      navigate("/", { state: { step: "preview" } });
    } catch (error) {
      if (isAbortError(error)) return;
      setConverting(null);
      showPhotoError(photoErrorFor(error));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
      setAnnouncement("");
    }
  }

  function cancelDrawing() {
    abortRef.current?.abort();
    abortRef.current = null;
    setConverting(null);
    setPhotoStatus({ kind: "cancelled" });
    requestFocus(STEP_NOTICE_ID);
  }

  function retryDrawing() {
    if (lastPhotoRef.current) void makeDrawing(lastPhotoRef.current);
  }

  function markExpired() {
    setDrawing(null);
    setExpired(true);
    requestFocus(STEP_NOTICE_ID);
  }

  function tryAnotherPhoto() {
    // The preview is forgotten, so it can no longer be ordered from this page (F2, AC-009).
    setDrawing(null);
    setExpired(false);
    setRetryHeading(true);
    setPhotoStatus({ kind: "idle" });
    requestFocus(PHOTO_INPUT_ID);
    navigate(-1);
  }

  function chooseFrame() {
    if (drawing && hasExpired(drawing)) return markExpired();
    if (frames.status === "error") loadFrames();
    navigate("/", { state: { step: "frame" } });
  }

  function continueToDetails() {
    if (drawing && hasExpired(drawing)) return markExpired();
    setSoldOutFrameName(null);
    navigate("/", { state: { step: "details" } });
  }

  async function submitOrder(): Promise<PlaceOrderOutcome> {
    if (!drawing || !selectedFrame) return { kind: "left" };
    if (hasExpired(drawing)) {
      markExpired();
      return { kind: "left" };
    }
    try {
      const result = await placeOrder(toOrderRequest(details, drawing, selectedFrame.id));
      // 201 or a 200 replay: show exactly what the API returned (AC-018, AC-058).
      setConfirmation(result);
      setDrawing(null);
      setDetails(EMPTY_DETAILS);
      setSelectedFrameId(null);
      setRetryHeading(false);
      navigate("/", { replace: true, state: { step: "confirmation" } });
      return { kind: "left" };
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "frame_sold_out" || error.code === "frame_not_found") {
          setSoldOutFrameName(selectedFrame.name);
          setSelectedFrameId(null);
          loadFrames();
          requestFocus(STEP_NOTICE_ID);
          navigate(-1);
          return { kind: "left" };
        }
        if (error.code === "drawing_not_found") {
          markExpired();
          return { kind: "left" };
        }
        if (error.status === 429) {
          return {
            kind: "notice",
            message: t("c5.error.rateLimited", { wait: formatWait(error.retryAfterSeconds) }),
          };
        }
        if (error.status === 400) {
          const problems = problemsFromApi(error, details);
          if (Object.keys(problems.fields).length > 0 || problems.other.length > 0) {
            return { kind: "fields", ...problems };
          }
        }
        if (error.status < 500 && error.apiMessage)
          return { kind: "notice", message: error.apiMessage };
      }
      return { kind: "notice", message: t("c5.error.network") };
    }
  }

  function resetAll() {
    abortRef.current?.abort();
    abortRef.current = null;
    setConverting(null);
    setPhotoStatus({ kind: "idle" });
    setRetryHeading(false);
    setDrawing(null);
    setExpired(false);
    setSelectedFrameId(null);
    setSoldOutFrameName(null);
    setDetails(EMPTY_DETAILS);
    setConfirmation(null);
  }

  function handleWordmark(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (view === "preview" || view === "frame" || view === "details") {
      setStartAgainOpen(true);
      return;
    }
    resetAll();
    navigate("/", { state: { step: "photo" } });
  }

  function startAgain() {
    setStartAgainOpen(false);
    resetAll();
    navigate("/", { state: { step: "photo" } });
  }

  function makeAnother() {
    resetAll();
    navigate("/", { replace: true, state: { step: "photo" } });
  }

  const indicatorStep: StepName | null =
    view === "making" ? "photo" : view === "confirmation" ? null : view;

  return (
    <ShopLayout
      steps={indicatorStep ? <StepIndicator current={indicatorStep} /> : undefined}
      announcement={announcement}
      busy={view === "making"}
      onWordmarkClick={handleWordmark}
    >
      {view === "making" && (
        <MakingStep thumbnailUrl={converting?.thumbnailUrl ?? null} onCancel={cancelDrawing} />
      )}
      {view === "photo" && (
        <PhotoStep
          status={photoStatus}
          retry={retryHeading}
          onPhoto={(file) => void makeDrawing(file)}
          onRetry={retryDrawing}
          chooserRef={chooserRef}
        />
      )}
      {view === "preview" && (
        <PreviewStep
          drawing={drawing}
          onContinue={chooseFrame}
          onTryAnother={tryAnotherPhoto}
          onPhoto={(file) => void makeDrawing(file)}
        />
      )}
      {view === "frame" && (
        <FrameStep
          frames={frames}
          selectedFrameId={selectedFrameId}
          soldOutFrameName={soldOutFrameName}
          onSelect={setSelectedFrameId}
          onContinue={continueToDetails}
          onBack={() => navigate(-1)}
          onRetryLoad={loadFrames}
        />
      )}
      {view === "details" && drawing && selectedFrame && (
        <DetailsStep
          drawing={drawing}
          frame={selectedFrame}
          details={details}
          onChange={setDetails}
          onBack={() => navigate(-1)}
          onPlaceOrder={submitOrder}
        />
      )}
      {view === "confirmation" && confirmation && (
        <ConfirmationStep confirmation={confirmation} onAgain={makeAnother} />
      )}

      <ConfirmDialog
        open={startAgainOpen}
        heading={t("shop.startAgain.heading")}
        body={t("shop.startAgain.body")}
        cancelLabel={t("shop.startAgain.cancel")}
        confirmLabel={t("shop.startAgain.confirm")}
        onConfirm={startAgain}
        onCancel={() => setStartAgainOpen(false)}
      />
    </ShopLayout>
  );
}
