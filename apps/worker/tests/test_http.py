"""POST /v1/convert and GET /health through HTTP, against the contract in docs/api."""

import json
import time

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from fineline_worker.app import MAX_BODY_BYTES
from fineline_worker.logs import configure_logging
from tests import images
from tests.conftest import DEFAULT_FIELDS, TOKEN, error_code, portrait_jpeg, post_convert
from tests.svg_check import check_drawing


def test_health_needs_no_token(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"])
def test_docs_routes_are_disabled(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 404
    assert error_code(response) == "not_found"


@pytest.mark.parametrize(
    "authorization",
    [None, "Bearer wrong-token-0123456789abcdefghijkl", f"Basic {TOKEN}", TOKEN, "Bearer "],
)
def test_convert_without_the_right_token_is_unauthenticated(
    client: TestClient, authorization: str | None
) -> None:
    headers = {"Authorization": authorization} if authorization is not None else {}
    response = client.post(
        "/v1/convert",
        headers=headers,
        files={"photo": ("photo", portrait_jpeg(), "image/jpeg")},
        data=DEFAULT_FIELDS,
    )
    assert response.status_code == 401
    assert error_code(response) == "unauthenticated"


def test_ac005_convert_answers_with_a_plottable_drawing_and_its_metrics(
    client: TestClient,
) -> None:
    response = post_convert(client, portrait_jpeg())
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"svg", "widthMm", "heightMm", "strokeCount", "totalLengthMm"}
    assert (body["widthMm"], body["heightMm"]) == (180, 267)
    measured = check_drawing(
        body["svg"], width_mm=180, height_mm=267, max_strokes=1500, max_total_length_mm=25_000
    )
    assert body["strokeCount"] == measured.stroke_count
    assert body["totalLengthMm"] == pytest.approx(measured.total_length_mm, abs=0.01)


def test_ac001_heic_photo_is_converted(client: TestClient) -> None:
    response = post_convert(client, images.heic(images.synthetic_portrait(4032, 3024)))
    assert response.status_code == 200
    check_drawing(
        response.json()["svg"],
        width_mm=180,
        height_mm=267,
        max_strokes=1500,
        max_total_length_mm=25_000,
    )


def test_ac006_budget_from_the_request_is_respected(client: TestClient) -> None:
    response = post_convert(client, portrait_jpeg(), maxStrokes="25", maxTotalLengthMm="1200.5")
    assert response.status_code == 200
    body = response.json()
    assert body["strokeCount"] <= 25
    assert body["totalLengthMm"] <= 1200.5
    check_drawing(
        body["svg"], width_mm=180, height_mm=267, max_strokes=25, max_total_length_mm=1200.5
    )


def test_ac004_photo_with_a_short_side_under_800_pixels(client: TestClient) -> None:
    response = post_convert(client, images.jpeg(images.synthetic_portrait(1200, 700)))
    assert response.status_code == 400
    assert error_code(response) == "photo_too_small"


def test_ac004_minimum_short_side_is_taken_from_the_request(client: TestClient) -> None:
    response = post_convert(client, portrait_jpeg(), minShortSidePx="1300")
    assert response.status_code == 400
    assert error_code(response) == "photo_too_small"


def test_ac051_photo_over_50_megapixels_is_refused(client: TestClient) -> None:
    response = post_convert(client, images.jpeg_header_declaring(10_000, 6_000))
    assert response.status_code == 400
    assert error_code(response) == "photo_too_many_pixels"


@pytest.mark.parametrize(
    "bomb",
    [images.png_header_only(30_000, 30_000), images.jpeg_header_declaring(30_000, 30_000)],
    ids=["png", "jpeg"],
)
def test_ac053_image_bomb_is_refused_quickly_and_the_next_photo_converts(
    client: TestClient, bomb: bytes
) -> None:
    assert len(bomb) < 1024
    started = time.perf_counter()
    response = post_convert(client, bomb)
    assert time.perf_counter() - started < 2
    assert response.status_code == 400
    assert error_code(response) == "photo_too_many_pixels"
    assert post_convert(client, portrait_jpeg()).status_code == 200


@pytest.mark.parametrize(
    "photo",
    [
        images.encode(images.flat(1000, 1000, 128), "TIFF"),
        images.encode(images.flat(1000, 1000, 128), "GIF"),
        images.psd_header(),
        b"<html><script>alert(1)</script></html>",
    ],
    ids=["tiff", "gif", "psd", "html"],
)
def test_other_files_are_unreadable(client: TestClient, photo: bytes) -> None:
    response = post_convert(client, photo)
    assert response.status_code == 400
    assert error_code(response) == "photo_unreadable"


def test_ac008_entirely_black_photo_has_no_drawable_content(client: TestClient) -> None:
    response = post_convert(client, images.jpeg(images.flat(1600, 1200, 0)))
    assert response.status_code == 422
    assert error_code(response) == "no_drawable_content"


@pytest.mark.parametrize(
    "overrides",
    [
        {"areaWidthMm": "0"},
        {"areaWidthMm": "-180"},
        {"areaHeightMm": "nan"},
        {"areaHeightMm": "inf"},
        {"areaWidthMm": "wide"},
        {"maxStrokes": "1.5"},
        {"maxStrokes": "0"},
        {"maxTotalLengthMm": "-1"},
        {"minShortSidePx": "0"},
        {"colour": "red"},
    ],
)
def test_invalid_parameters_fail_validation(client: TestClient, overrides: dict[str, str]) -> None:
    response = post_convert(client, portrait_jpeg(), **overrides)
    assert response.status_code == 400
    assert error_code(response) == "validation_failed"
    message = response.json()["error"]["message"]
    for name, value in overrides.items():
        assert name in message
        if value.isalpha():
            assert value not in message, "the submitted value must not be echoed"


def test_missing_field_fails_validation(client: TestClient) -> None:
    fields = {k: v for k, v in DEFAULT_FIELDS.items() if k != "maxStrokes"}
    response = client.post(
        "/v1/convert",
        headers={"Authorization": f"Bearer {TOKEN}"},
        files={"photo": ("photo", portrait_jpeg(), "image/jpeg")},
        data=fields,
    )
    assert response.status_code == 400
    assert error_code(response) == "validation_failed"
    assert "maxStrokes" in response.json()["error"]["message"]


def test_missing_photo_fails_validation(client: TestClient) -> None:
    response = client.post(
        "/v1/convert",
        headers={"Authorization": f"Bearer {TOKEN}"},
        data=DEFAULT_FIELDS,
    )
    assert response.status_code == 400
    assert error_code(response) == "validation_failed"


def test_two_photos_fail_validation(client: TestClient) -> None:
    response = client.post(
        "/v1/convert",
        headers={"Authorization": f"Bearer {TOKEN}"},
        files=[
            ("photo", ("photo", portrait_jpeg(), "image/jpeg")),
            ("photo", ("photo", portrait_jpeg(), "image/jpeg")),
        ],
        data=DEFAULT_FIELDS,
    )
    assert response.status_code == 400
    assert error_code(response) == "validation_failed"


def test_body_over_16_mb_is_refused(client: TestClient) -> None:
    response = post_convert(client, b"\xff\xd8" + b"\x00" * MAX_BODY_BYTES)
    assert response.status_code == 413
    assert error_code(response) == "payload_too_large"


def test_body_over_16_mb_without_content_length_is_refused(client: TestClient) -> None:
    def chunks() -> object:
        yield b"--x\r\nContent-Disposition: form-data; name=photo; filename=photo\r\n\r\n"
        for _ in range(17):
            yield b"\x00" * (1024 * 1024)

    response = client.post(
        "/v1/convert",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "multipart/form-data; boundary=x",
        },
        content=chunks(),  # type: ignore[arg-type]
    )
    assert response.status_code == 413
    assert error_code(response) == "payload_too_large"


@pytest.mark.usefixtures("restore_logging")
def test_logs_hold_no_file_names_metadata_or_image_data(
    client: TestClient, capsys: pytest.CaptureFixture[str]
) -> None:
    configure_logging(10)  # debug: the most talkative level
    exif = Image.Exif()
    exif[0x010E] = "Jane Doe at Keizersgracht 123"  # ImageDescription
    exif[0x013B] = "Jane Doe"  # Artist
    photo = images.jpeg(images.synthetic_portrait(1200, 1600), exif=exif.tobytes())
    response = post_convert(client, photo, filename="jane-doe-selfie.jpg")
    assert response.status_code == 200
    refused = post_convert(client, images.jpeg(images.flat(1600, 1200, 0)), filename="jane.jpg")
    assert refused.status_code == 422

    output = capsys.readouterr().out
    lines = [json.loads(line) for line in output.splitlines()]
    assert any(line["msg"] == "conversion finished" for line in lines)
    assert any(line.get("code") == "no_drawable_content" for line in lines)
    for forbidden in ("Jane", "jane", "Keizersgracht", "selfie", "<svg", "<path", TOKEN):
        assert forbidden not in output
