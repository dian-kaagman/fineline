import logging
from collections.abc import Iterator
from functools import cache

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from fineline_worker.app import Converter, create_app
from fineline_worker.config import Settings
from fineline_worker.pipeline import convert_photo
from tests import images

TOKEN = "test-token-0123456789abcdefghijklmnopqrstuv"
DEFAULT_FIELDS = {
    "areaWidthMm": "180",
    "areaHeightMm": "267",
    "maxStrokes": "1500",
    "maxTotalLengthMm": "25000",
}


@cache
def portrait_jpeg() -> bytes:
    return images.jpeg(images.synthetic_portrait(1200, 1600))


def make_client(converter: Converter = convert_photo, max_concurrent: int = 2) -> TestClient:
    settings = Settings(worker_token=TOKEN, max_concurrent_conversions=max_concurrent)
    return TestClient(create_app(settings, converter), raise_server_exceptions=False)


@pytest.fixture
def client() -> TestClient:
    return make_client()


def post_convert(
    client: TestClient,
    photo: bytes,
    *,
    token: str | None = TOKEN,
    filename: str = "photo",
    **overrides: str,
) -> Response:
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    return client.post(
        "/v1/convert",
        headers=headers,
        files={"photo": (filename, photo, "application/octet-stream")},
        data={**DEFAULT_FIELDS, **overrides},
    )


def error_code(response: Response) -> str:
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message"}
    code: str = body["error"]["code"]
    return code


@pytest.fixture
def restore_logging() -> Iterator[None]:
    root = logging.getLogger()
    handlers, level = list(root.handlers), root.level
    yield
    root.handlers, root.level = handlers, level
