import logging
from pathlib import Path

import pytest

from fineline_worker.config import PLACEHOLDER_TOKEN, ConfigError, load_settings

GOOD_TOKEN = "x" * 32


def test_defaults_with_only_a_token() -> None:
    settings = load_settings({"WORKER_TOKEN": GOOD_TOKEN})
    assert settings.port == 8000
    assert settings.log_level == logging.INFO
    assert settings.max_concurrent_conversions == 2


def test_reads_every_variable() -> None:
    settings = load_settings(
        {
            "WORKER_TOKEN": GOOD_TOKEN,
            "PORT": "9001",
            "LOG_LEVEL": "warn",
            "MAX_CONCURRENT_CONVERSIONS": "3",
        }
    )
    assert (settings.port, settings.log_level, settings.max_concurrent_conversions) == (
        9001,
        logging.WARNING,
        3,
    )


@pytest.mark.parametrize(
    ("environ", "variable"),
    [
        ({}, "WORKER_TOKEN"),
        ({"WORKER_TOKEN": ""}, "WORKER_TOKEN"),
        ({"WORKER_TOKEN": "x" * 31}, "WORKER_TOKEN"),
        ({"WORKER_TOKEN": PLACEHOLDER_TOKEN}, "WORKER_TOKEN"),
        ({"WORKER_TOKEN": "replace-with-a-long-random-token-of-40-chars"}, "WORKER_TOKEN"),
        ({"WORKER_TOKEN": GOOD_TOKEN, "PORT": "eighty"}, "PORT"),
        ({"WORKER_TOKEN": GOOD_TOKEN, "PORT": "70000"}, "PORT"),
        ({"WORKER_TOKEN": GOOD_TOKEN, "LOG_LEVEL": "loud"}, "LOG_LEVEL"),
        (
            {"WORKER_TOKEN": GOOD_TOKEN, "MAX_CONCURRENT_CONVERSIONS": "0"},
            "MAX_CONCURRENT_CONVERSIONS",
        ),
    ],
)
def test_invalid_configuration_fails_naming_the_variable(
    environ: dict[str, str], variable: str
) -> None:
    with pytest.raises(ConfigError, match=variable) as raised:
        load_settings(environ)
    token = environ.get("WORKER_TOKEN")
    if token:
        assert token not in str(raised.value)


def test_env_example_placeholder_fails_validation() -> None:
    example = Path(__file__).parent.parent / ".env.example"
    values = dict(
        line.split("=", 1)
        for line in example.read_text().splitlines()
        if line and not line.startswith("#")
    )
    with pytest.raises(ConfigError, match="WORKER_TOKEN"):
        load_settings(values)
    values["WORKER_TOKEN"] = GOOD_TOKEN
    load_settings(values)
