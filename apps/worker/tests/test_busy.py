"""SR-004 / AC-054: at most N conversions at a time; the next one is refused quickly."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor

from fineline_worker.pipeline import (
    ConversionRequest,
    ConversionResult,
    ConversionStats,
    Drawing,
)
from tests.conftest import error_code, make_client, portrait_jpeg, post_convert

SVG = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="180mm" height="267mm" viewBox="0 0 180 267">\n</svg>\n'  # noqa: E501


class SlowConverter:
    """Stands in for the pipeline: blocks until released, counting conversions in progress."""

    def __init__(self) -> None:
        self.release = threading.Event()
        self.running = 0
        self.peak = 0
        self._lock = threading.Lock()

    def __call__(self, _photo: bytes, request: ConversionRequest) -> ConversionResult:
        with self._lock:
            self.running += 1
            self.peak = max(self.peak, self.running)
        try:
            assert self.release.wait(timeout=10)
        finally:
            with self._lock:
                self.running -= 1
        drawing = Drawing(SVG, request.area.width_mm, request.area.height_mm, 0, 0.0)
        return ConversionResult(drawing, ConversionStats(1, 1, 0, 0, 0, 0))

    def wait_until_running(self, count: int) -> None:
        deadline = time.monotonic() + 5
        while self.running < count:
            assert time.monotonic() < deadline, "conversions did not start"
            time.sleep(0.01)


def test_ac054_third_conversion_is_refused_quickly_while_two_are_running() -> None:
    converter = SlowConverter()
    client = make_client(converter, max_concurrent=2)
    photo = portrait_jpeg()
    with ThreadPoolExecutor(max_workers=2) as pool:
        running = [pool.submit(post_convert, client, photo) for _ in range(2)]
        converter.wait_until_running(2)

        started = time.perf_counter()
        refused = post_convert(client, photo)
        waited = time.perf_counter() - started
        assert refused.status_code == 503
        assert error_code(refused) == "busy"
        assert refused.headers["Retry-After"] == "5"
        assert waited < 2

        converter.release.set()
        assert [future.result().status_code for future in running] == [200, 200]

    assert converter.peak == 2
    assert post_convert(client, photo).status_code == 200


def test_a_waiting_conversion_gets_the_slot_freed_within_a_second() -> None:
    converter = SlowConverter()
    client = make_client(converter, max_concurrent=1)
    photo = portrait_jpeg()
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(post_convert, client, photo)
        converter.wait_until_running(1)
        second = pool.submit(post_convert, client, photo)
        time.sleep(0.3)
        converter.release.set()
        assert first.result().status_code == 200
        assert second.result().status_code == 200
    assert converter.peak == 1
