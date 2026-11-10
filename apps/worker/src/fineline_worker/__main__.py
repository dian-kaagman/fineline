"""Entry point: `python -m fineline_worker` validates the environment and serves HTTP."""

import os
import sys

import cv2
import uvicorn

from fineline_worker.app import create_app
from fineline_worker.config import ConfigError, load_settings
from fineline_worker.logs import configure_logging


def main() -> None:
    try:
        settings = load_settings(os.environ)
    except ConfigError as error:
        print(f"fineline-worker: invalid configuration: {error}", file=sys.stderr)
        sys.exit(2)
    configure_logging(settings.log_level)
    # One OpenCV thread per conversion: parallelism comes from the conversion slots.
    cv2.setNumThreads(1)
    uvicorn.run(
        create_app(settings),
        # Inside the container the worker must listen on the private network; it is never
        # published (SR-005) and every conversion needs the bearer token.
        host="0.0.0.0",  # noqa: S104
        port=settings.port,
        log_config=None,
        access_log=False,
        server_header=False,
        proxy_headers=False,
        timeout_graceful_shutdown=10,
    )


if __name__ == "__main__":
    main()
