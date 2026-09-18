from app.services.leetcode_client import parse_runtime_ms


def test_parses_plain_milliseconds():
    assert parse_runtime_ms("167 ms") == 167


def test_zero_is_a_valid_runtime():
    assert parse_runtime_ms("0 ms") == 0


def test_parses_without_space():
    assert parse_runtime_ms("42ms") == 42


def test_parses_float_runtime():
    assert parse_runtime_ms("12.5 ms") == 12


def test_none_returns_none():
    assert parse_runtime_ms(None) is None


def test_empty_returns_none():
    assert parse_runtime_ms("") is None


def test_not_available_returns_none():
    assert parse_runtime_ms("N/A") is None


def test_garbage_returns_none():
    assert parse_runtime_ms("fast") is None
