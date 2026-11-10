"""Errors the worker answers with; the HTTP layer maps them to `{ "error": { code, message } }`."""


class WorkerError(Exception):
    """A refused request with a stable code and HTTP status. Messages never echo input."""

    code = "internal_error"
    status = 500

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class PhotoTooSmall(WorkerError):
    code = "photo_too_small"
    status = 400


class PhotoTooManyPixels(WorkerError):
    code = "photo_too_many_pixels"
    status = 400


class PhotoUnreadable(WorkerError):
    code = "photo_unreadable"
    status = 400


class ValidationFailed(WorkerError):
    code = "validation_failed"
    status = 400


class Unauthenticated(WorkerError):
    code = "unauthenticated"
    status = 401


class PayloadTooLarge(WorkerError):
    code = "payload_too_large"
    status = 413


class NoDrawableContent(WorkerError):
    code = "no_drawable_content"
    status = 422


class Busy(WorkerError):
    code = "busy"
    status = 503
