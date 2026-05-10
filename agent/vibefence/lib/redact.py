"""PRD §24.2 redaction.

Purpose: make sure no `.env`, API key, JWT, cookie, Authorization header,
or DB connection string ever leaves the local machine. The cloud will
defensively reject payloads that look unredacted (defense in depth).
"""
from __future__ import annotations
import re
from typing import Any

PLACEHOLDER = "[REDACTED]"

# Patterns are intentionally broad — false positives are acceptable, false
# negatives are not.
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Authorization headers, cookies (match the full header value, not just
    # the first token — `Bearer xyz` should be entirely masked).
    (re.compile(r"(?i)(authorization\s*:\s*)([^\r\n]+)"), r"\1" + PLACEHOLDER),
    (re.compile(r"(?i)(cookie\s*:\s*)([^\r\n]+)"), r"\1" + PLACEHOLDER),
    (re.compile(r"(?i)(set-cookie\s*:\s*)([^\r\n]+)"), r"\1" + PLACEHOLDER),
    # Bearer tokens / JWTs
    (re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-+/=]+"), f"Bearer {PLACEHOLDER}"),
    (re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"), PLACEHOLDER),
    # Common API key prefixes
    (re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"), PLACEHOLDER),
    (re.compile(r"\bsk-live-[A-Za-z0-9_\-]{16,}"), PLACEHOLDER),
    (re.compile(r"\bsk-test-[A-Za-z0-9_\-]{16,}"), PLACEHOLDER),
    (re.compile(r"\brk_(?:live|test)_[A-Za-z0-9]{16,}"), PLACEHOLDER),
    (re.compile(r"\bxoxb-[A-Za-z0-9-]{20,}"), PLACEHOLDER),  # Slack
    (re.compile(r"\bghp_[A-Za-z0-9]{30,}"), PLACEHOLDER),  # GitHub PAT
    (re.compile(r"\bghs_[A-Za-z0-9]{30,}"), PLACEHOLDER),  # GitHub server
    (re.compile(r"\bgho_[A-Za-z0-9]{30,}"), PLACEHOLDER),  # GitHub OAuth
    (re.compile(r"\bAKIA[0-9A-Z]{16}"), PLACEHOLDER),  # AWS access key
    (re.compile(r"\bASIA[0-9A-Z]{16}"), PLACEHOLDER),  # AWS session
    # AWS secret access keys (40 base64-ish chars). Safer to redact when paired
    # with a clear "secret" marker than to over-match random data.
    (re.compile(r"(?i)(aws_secret_access_key\s*[:=]\s*)['\"]?[A-Za-z0-9/+=]{40}['\"]?"),
     r"\1" + PLACEHOLDER),
    # Anthropic / OpenAI style
    (re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{20,}"), PLACEHOLDER),
    # Connection strings (postgres, mysql, mongo, redis)
    (re.compile(r"(?i)(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s'\"]+"), PLACEHOLDER),
    # `.env` style: KEY=value where the key looks secret-ish
    (re.compile(
        r"(?im)^\s*((?:[A-Z][A-Z0-9_]*_)?(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY))\s*=\s*['\"]?[^'\"\s]+['\"]?"
    ), r"\1=" + PLACEHOLDER),
    # PEM private keys
    (re.compile(
        r"-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP |ENCRYPTED |)PRIVATE KEY-----[\s\S]+?-----END[^-]+PRIVATE KEY-----"
    ), PLACEHOLDER),
]

_HEADER_DENYLIST = {"authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"}


def redact_text(text: str) -> str:
    if not text:
        return text
    out = text
    for pattern, repl in _PATTERNS:
        out = pattern.sub(repl, out)
    return out


def redact_headers(headers: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in headers.items():
        if k.lower() in _HEADER_DENYLIST:
            out[k] = PLACEHOLDER
        else:
            out[k] = redact_text(v)
    return out


def redact_obj(obj: Any) -> Any:
    """Recursively redact strings inside dicts/lists/scalars."""
    if isinstance(obj, str):
        return redact_text(obj)
    if isinstance(obj, list):
        return [redact_obj(x) for x in obj]
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            if isinstance(k, str) and k.lower() in _HEADER_DENYLIST:
                out[k] = PLACEHOLDER
                continue
            out[k] = redact_obj(v)
        return out
    return obj


def looks_unredacted(text: str) -> bool:
    """Cheap heuristic the cloud uses to defensively reject obviously-leaky payloads."""
    if not text:
        return False
    suspicious = [
        re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"),
        re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_\-]{20,}"),
        re.compile(r"\bAKIA[0-9A-Z]{16}"),
        re.compile(r"-----BEGIN [^-]*PRIVATE KEY-----"),
        re.compile(r"(?im)^\s*(?:API_KEY|SECRET|PASSWORD|TOKEN)\s*=\s*\S+"),
    ]
    return any(p.search(text) for p in suspicious)
