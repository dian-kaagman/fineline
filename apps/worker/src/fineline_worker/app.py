"""HTTP layer: authentication, limits, routes and the error shape. No conversion logic here."""

import hmac
import logging
import threading
import time
from collections.abc import Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from fineline_worker.config import Settings
from fineline_worker.errors import Busy, PayloadTooLarge, Unauthenticated, WorkerError
from fineline_worker.http_input import read_convert_input
from fineline_worker.pipeline import ConversionRequest, ConversionResult, convert_photo

# The API sends at most 15 MiB of photo plus a few small fields (SR-005).
MAX_BODY_BYTES = 16 * 1024 * 1024
# How long a request waits for a free conversion slot before it is answered `busy` (SR-004).
SLOT_WAIT_SECONDS = 1.0
# Suggested wait sent with 503 busy: about one typical conversion.
BUSY_RETRY_AFTER_SECONDS = 5

Converter = Callable[[bytes, ConversionRequest], ConversionResult]

logger = logging.getLogger("fineline_worker")


class ConversionSlots:
    """At most `size` conversions at a time, independent of the server's thread pool."""

    def __init__(self, size: int) -> None:
        self._semaphore = threading.BoundedSemaphore(size)

    def acquire(self, timeout: float) -> bool:
        return self._semaphore.acquire(timeout=timeout)

    def release(self) -> None:
        self._semaphore.release()


def create_app(settings: Settings, converter: Converter = convert_photo) -> FastAPI:
    app = FastAPI(
        title="Fineline conversion worker",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    slots = ConversionSlots(settings.max_concurrent_conversions)
    expected_token = settings.worker_token.encode()

    def require_token(request: Request) -> None:
        scheme, _, token = request.headers.get("authorization", "").partition(" ")
        # compare_digest runs in constant time, so the token can't be guessed byte by byte.
        valid = hmac.compare_digest(token.strip().encode(), expected_token)
        if scheme.lower() != "bearer" or not valid:
            raise Unauthenticated("A valid bearer token is required")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/convert")
    async def convert(request: Request) -> dict[str, object]:
        require_token(request)
        convert_input = await read_convert_input(request)
        if not await run_in_threadpool(slots.acquire, SLOT_WAIT_SECONDS):
            raise Busy("The maximum number of conversions is running; try again later")
        try:
            result = await run_in_threadpool(converter, convert_input.photo, convert_input.request)
        finally:
            slots.release()
        drawing, stats = result.drawing, result.stats
        logger.info(
            "conversion finished",
            extra={
                "photo_bytes": len(convert_input.photo),
                "working_px": f"{stats.working_width_px}x{stats.working_height_px}",
                "stroke_count": drawing.stroke_count,
                "total_length_mm": drawing.total_length_mm,
                "detail_level": stats.detail_level,
                "dropped_by_guarantee": stats.strokes_dropped_by_guarantee,
                "decode_ms": stats.decode_ms,
                "duration_ms": stats.total_ms,
            },
        )
        return {
            "svg": drawing.svg,
            "widthMm": drawing.width_mm,
            "heightMm": drawing.height_mm,
            "strokeCount": drawing.stroke_count,
            "totalLengthMm": drawing.total_length_mm,
        }

    @app.exception_handler(WorkerError)
    async def worker_error(_: Request, error: Exception) -> JSONResponse:
        assert isinstance(error, WorkerError)
        level = logging.WARNING if isinstance(error, Unauthenticated) else logging.INFO
        logger.log(level, "request refused", extra={"code": error.code})
        response = error_response(error.status, error.code, error.message)
        if isinstance(error, Busy):
            response.headers["Retry-After"] = str(BUSY_RETRY_AFTER_SECONDS)
        return response

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, error: Exception) -> JSONResponse:
        assert isinstance(error, HTTPException)
        codes = {404: "not_found", 405: "method_not_allowed"}
        code = codes.get(error.status_code, "http_error")
        return error_response(error.status_code, code, code.replace("_", " ").capitalize())

    @app.exception_handler(Exception)
    async def unexpected_error(_: Request, error: Exception) -> JSONResponse:
        logger.error("unexpected error", exc_info=error)
        return error_response(500, "internal_error", "Something went wrong")

    app.add_middleware(BodySizeLimit, max_bytes=MAX_BODY_BYTES)
    app.add_middleware(RequestLog)
    return app


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


class BodySizeLimit:
    """Refuses bodies over `max_bytes`, by Content-Length or while streaming without one."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > self.max_bytes):
            too_large = PayloadTooLarge("The request body is too large")
            response = error_response(too_large.status, too_large.code, too_large.message)
            await response(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # Raised inside the route while it reads the body; mapped to 413 there.
                    raise PayloadTooLarge("The request body is too large")
            return message

        await self.app(scope, limited_receive, send)


class RequestLog:
    """One log line per request: method, path, status and duration. No headers or bodies."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = 500

        async def send_and_capture(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_and_capture)
        finally:
            path = scope["path"]
            logger.log(
                logging.DEBUG if path == "/health" else logging.INFO,
                "request",
                extra={
                    "method": scope["method"],
                    "path": path if path in ("/health", "/v1/convert") else "(other)",
                    "status": status,
                    "duration_ms": round((time.perf_counter() - started) * 1000),
                },
            )
