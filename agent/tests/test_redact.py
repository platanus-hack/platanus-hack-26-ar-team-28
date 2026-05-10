"""Tests for redaction patterns. Run: `pytest agent/tests/`."""
from vibefence.lib.redact import (
    looks_unredacted,
    redact_headers,
    redact_obj,
    redact_text,
)


def test_jwt_redacted():
    raw = "header eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dummy_signature_xx body"
    assert "eyJ" not in redact_text(raw)


def test_authorization_header_redacted():
    # The whole authorization value is masked (Bearer + token).
    raw = "Authorization: Bearer eyJabc.def.ghi"
    out = redact_text(raw)
    assert "[REDACTED]" in out
    assert "eyJabc" not in out


def test_aws_key_redacted():
    raw = "key=AKIAIOSFODNN7EXAMPLE other"
    assert "AKIA" not in redact_text(raw)


def test_openai_key_redacted():
    raw = 'OPENAI_API_KEY="sk-proj-abc12345678901234567"'
    assert "sk-proj" not in redact_text(raw)


def test_anthropic_key_redacted():
    raw = "ANTHROPIC=sk-ant-abc1234567890123456789"
    assert "sk-ant" not in redact_text(raw)


def test_postgres_url_redacted():
    raw = "DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require"
    assert "postgres://" not in redact_text(raw)


def test_pem_redacted():
    raw = (
        "-----BEGIN RSA PRIVATE KEY-----\n"
        "MIIEowIBAAKCAQEA1234567890abcdef\n"
        "-----END RSA PRIVATE KEY-----"
    )
    assert "PRIVATE KEY" not in redact_text(raw)


def test_env_pattern_redacted():
    raw = "API_KEY=hunter2\nNORMAL=hello\n"
    out = redact_text(raw)
    assert "hunter2" not in out
    assert "hello" in out  # non-secret-looking key preserved


def test_headers_dict_redacted():
    headers = {
        "Authorization": "Bearer abc",
        "Cookie": "session=xyz",
        "Content-Type": "application/json",
    }
    out = redact_headers(headers)
    assert out["Authorization"] == "[REDACTED]"
    assert out["Cookie"] == "[REDACTED]"
    assert out["Content-Type"] == "application/json"


def test_redact_obj_nested():
    obj = {
        "request": {"headers": {"Authorization": "Bearer abc"}, "body": "API_KEY=secret"},
        "list": ["sk-ant-abcdef0123456789012345"],
    }
    out = redact_obj(obj)
    assert "abc" not in out["request"]["headers"]["Authorization"]
    assert "secret" not in out["request"]["body"]
    assert "sk-ant" not in out["list"][0]


def test_looks_unredacted_positive():
    # Real JWT-shape token: each segment ≥ 10 chars
    assert looks_unredacted(
        "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGhpc2lzYWZha2VzaWdmb3J0ZXN0aW5n"
    )
    assert looks_unredacted("API_KEY=hunter2")
    assert looks_unredacted("AKIAIOSFODNN7EXAMPLE")


def test_looks_unredacted_negative():
    assert not looks_unredacted("normal log message about a request")
    assert not looks_unredacted("Authorization: [REDACTED]")
