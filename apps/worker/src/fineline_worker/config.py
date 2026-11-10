"""Configuration from the environment, validated once at startup (SR-020)."""

import logging
from collections.abc import Mapping
from dataclasses import dataclass

# The value in .env.example; it must never work as a real token.
PLACEHOLDER_TOKEN = "replace-with-32+-random-chars"  # noqa: S105 - refused, not a secret
MIN_TOKEN_LENGTH = 32

# Accepts the API's (pino) level names as well as Python's, so one LOG_LEVEL serves both.
_LOG_LEVELS = {
    "fatal": logging.CRITICAL,
    "critical": logging.CRITICAL,
    "error": logging.ERROR,
    "warn": logging.WARNING,
    "warning": logging.WARNING,
    "info": logging.INFO,
    "debug": logging.DEBUG,
}


class ConfigError(Exception):
    """Invalid configuration; the message names the variable and never echoes a secret."""


@dataclass(frozen=True)
class Settings:
    worker_token: str
    port: int = 8000
    log_level: int = logging.INFO
    max_concurrent_conversions: int = 2


def load_settings(environ: Mapping[str, str]) -> Settings:
    return Settings(
        worker_token=_worker_token(environ.get("WORKER_TOKEN")),
        port=_integer(environ, "PORT", default=8000, lowest=1, highest=65535),
        log_level=_log_level(environ.get("LOG_LEVEL")),
        max_concurrent_conversions=_integer(
            environ, "MAX_CONCURRENT_CONVERSIONS", default=2, lowest=1, highest=16
        ),
    )


def _worker_token(value: str | None) -> str:
    if value is None or value.strip() == "":
        raise ConfigError("WORKER_TOKEN is required (at least 32 random characters)")
    if value == PLACEHOLDER_TOKEN or value.startswith("replace-with"):
        raise ConfigError("WORKER_TOKEN is still the .env.example placeholder; generate a real one")
    if len(value) < MIN_TOKEN_LENGTH:
        raise ConfigError(f"WORKER_TOKEN must be at least {MIN_TOKEN_LENGTH} characters long")
    return value


def _integer(
    environ: Mapping[str, str], name: str, *, default: int, lowest: int, highest: int
) -> int:
    raw = environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw.strip())
    except ValueError as error:
        raise ConfigError(f"{name} must be a whole number") from error
    if not lowest <= value <= highest:
        raise ConfigError(f"{name} must be between {lowest} and {highest}")
    return value


def _log_level(raw: str | None) -> int:
    if raw is None or raw.strip() == "":
        return logging.INFO
    level = _LOG_LEVELS.get(raw.strip().lower())
    if level is None:
        raise ConfigError(f"LOG_LEVEL must be one of: {', '.join(_LOG_LEVELS)}")
    return level
