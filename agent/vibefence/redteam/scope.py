"""Scope agent — validates a target is allowed (PRD §13.2.1).

In demo mode we only allow localhost / 127.0.0.1 / [::1] targets. The agent
hard-rejects anything else so the demo stays safe to run on the judges' wifi.
"""
from __future__ import annotations
from dataclasses import dataclass
from urllib.parse import urlparse


class ScopeViolation(RuntimeError):
    """Raised when the proposed target is not allowed."""


_ALLOWED_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}


@dataclass
class Scope:
    target_url: str
    environment: str = "local"
    allowed: tuple[str, ...] = ("crawl", "authz", "evidence")
    forbidden: tuple[str, ...] = ("destructive_tests", "external_targets")


def validate_target(url: str) -> Scope:
    """Validate `url` is a localhost target. Raise `ScopeViolation` otherwise."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").strip("[]")
    if not host:
        raise ScopeViolation(f"could not parse host from {url!r}")
    if host not in _ALLOWED_HOSTS:
        raise ScopeViolation(
            f"target host {host!r} is not in the demo allowlist (localhost / 127.0.0.1 / ::1)"
        )
    if parsed.scheme not in {"http", "https"}:
        raise ScopeViolation(f"target scheme must be http(s), got {parsed.scheme!r}")
    return Scope(target_url=url)
