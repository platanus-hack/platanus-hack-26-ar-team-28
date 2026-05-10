"""Layer 2 prompt-injection detection (PRD §15, demo subset).

The wedge: we don't try to detect malicious *intent* from text, we just look for
markers that strongly correlate with attempted instruction injection. When we
see them, we **drop the source's trust level** so the action chain has a tighter
ceiling. The block decision still comes from Layer 1 (provenance) — Layer 2 is
fuel for it.

This is intentionally noisy / aggressive. False positives only mean a slightly
lower trust, and the trust hierarchy already gates risky tools.
"""
from __future__ import annotations
import re
import unicodedata
from dataclasses import dataclass


# Pattern set covers four classes of injection signal:
#  - direct override ("ignore previous instructions" and variants),
#  - fake role/system tags impersonating the chat protocol,
#  - imperative-execute framings ("first run this:"),
#  - high-signal substrings (cat .env / printenv / rm -rf).
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Direct instruction-override
    (re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?", re.I),
     "instruction-override"),
    (re.compile(r"disregard\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?", re.I),
     "instruction-override"),
    (re.compile(r"forget\s+everything\s+(?:above|before)", re.I), "instruction-override"),
    (re.compile(r"you\s+are\s+now\s+(?:a\s+)?(?:different|new)", re.I), "role-override"),

    # Fake system tags
    (re.compile(r"<\s*/?\s*(?:system|user|assistant)\s*>", re.I), "fake-tag"),
    (re.compile(r"\|\s*(?:system|user|assistant)\s*\|", re.I), "fake-tag"),
    (re.compile(r"\bSYSTEM\s*:\s*", re.I), "fake-tag"),

    # Imperative "execute" / "run" near content the LLM would treat as
    # untrusted text (file content, web pages, etc.).
    (re.compile(r"\b(?:please\s+)?execute\s+(?:this|the\s+following)\s*(?:command|code)?\s*[:.]?", re.I),
     "imperative-execute"),
    (re.compile(r"\bfirst[,]?\s+(?:run|execute)\b", re.I), "imperative-execute"),
    (re.compile(r"\b(?:make sure to|don'?t forget to)\s+(?:run|execute|cat|print)\b", re.I),
     "imperative-execute"),

    # Specific dangerous shell patterns inside untrusted content
    (re.compile(r"`?cat\s+\.env`?", re.I), "cat-env"),
    (re.compile(r"\bprintenv\b", re.I), "printenv"),
    (re.compile(r"\brm\s+-rf\b", re.I), "rm-rf"),

    # HTML-comment injections / hidden CSS (cheap regex, decent recall)
    (re.compile(r"<!--\s*(?:ignore|system|hidden|do\s+not\s+show)", re.I), "hidden-comment"),
    (re.compile(r"display\s*:\s*none", re.I), "hidden-css"),
]


# Unicode tag-block (U+E0000..U+E007F) — invisible-prompt-injection vector.
_TAG_BLOCK_RE = re.compile(r"[\U000E0000-\U000E007F]")
_ZERO_WIDTH_RE = re.compile(r"[​-‏‪-‮⁠-⁯﻿]")


@dataclass
class InjectionFinding:
    marker: str
    excerpt: str          # short snippet around the match for the dashboard
    span: tuple[int, int]


def scrub_unicode(text: str) -> tuple[str, list[InjectionFinding]]:
    """Strip Unicode tag-block + zero-width chars. Returns (clean, findings)."""
    findings: list[InjectionFinding] = []

    # Tag-block: each codepoint maps to an ASCII letter when masked with 0x7F.
    if _TAG_BLOCK_RE.search(text):
        decoded = "".join(chr(ord(c) & 0x7F) for c in _TAG_BLOCK_RE.findall(text))
        m = _TAG_BLOCK_RE.search(text)
        findings.append(InjectionFinding(
            marker="unicode-tag-block",
            excerpt=f"hidden text (decoded): {decoded[:120]!r}",
            span=(m.start() if m else 0, (m.end() if m else 0)),
        ))
        text = _TAG_BLOCK_RE.sub("", text)

    if _ZERO_WIDTH_RE.search(text):
        m = _ZERO_WIDTH_RE.search(text)
        findings.append(InjectionFinding(
            marker="zero-width",
            excerpt="zero-width characters detected",
            span=(m.start() if m else 0, (m.end() if m else 0)),
        ))
        text = _ZERO_WIDTH_RE.sub("", text)

    # NFKC normalize to fold any other look-alike tricks.
    text = unicodedata.normalize("NFKC", text)
    return text, findings


def detect(text: str) -> list[InjectionFinding]:
    """Return the list of injection markers found in `text`."""
    if not text:
        return []
    cleaned, unicode_findings = scrub_unicode(text)

    # Decode any tag-block hidden text and append it to the haystack so the
    # standard pattern set still runs against the visible-once-decoded content.
    decoded_tagblock = "".join(chr(ord(c) & 0x7F) for c in _TAG_BLOCK_RE.findall(text))
    haystack = f"{cleaned}\n{decoded_tagblock}" if decoded_tagblock else cleaned

    out: list[InjectionFinding] = list(unicode_findings)
    for pattern, label in _PATTERNS:
        m = pattern.search(haystack)
        if not m:
            continue
        start, end = m.span()
        excerpt_start = max(0, start - 40)
        excerpt_end = min(len(haystack), end + 60)
        snippet = haystack[excerpt_start:excerpt_end].replace("\n", " ")
        out.append(InjectionFinding(marker=label, excerpt=snippet, span=(start, end)))
    return out
