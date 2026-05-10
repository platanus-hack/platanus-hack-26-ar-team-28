"""Trust + provenance (PRD §15.2).

Walks the recent transcript to identify which sources contributed to the
current tool-call plan and assigns each a trust score. The chain's effective
trust is the **lowest** value in it (a chain is only as trustworthy as its
weakest link).
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from pathlib import Path

import re

from vibefence.lib.schemas.enums import TRUST_SCORE, SourceType
from vibefence.policy import injection


# Match fenced code blocks tagged bash/sh/console/shell, AND inline backtick
# commands that look like shell calls (start with a known cmd verb). Allow
# indented fences (list items in markdown commonly have 3+ space indent on
# both the opening AND closing fence lines).
_FENCED_BASH_RE = re.compile(
    r"^[ \t]*```(?:bash|sh|shell|console|powershell|ps|cmd)?[ \t]*\n"
    r"(.*?)"
    r"^[ \t]*```",
    re.IGNORECASE | re.DOTALL | re.MULTILINE,
)
_INLINE_CMD_RE = re.compile(r"`([^`]{2,200})`")
_CMD_VERB_RE = re.compile(
    r"^\s*(?:sudo\s+)?(?:cat|ls|ll|cd|cp|mv|rm|cat|grep|find|chmod|chown|"
    r"echo|printenv|env|psql|npm|npx|yarn|pnpm|bun|node|python|pip|go|git|"
    r"docker|kubectl|terraform|curl|wget|tar|zip|unzip|sed|awk|head|tail|"
    r"diff|whoami|id|hostname|uname|df|du|ps|kill|tsx|deno|make|"
    r"vercel|gh|aws|gcloud|az|supabase|prisma|drizzle-kit)\b",
    re.IGNORECASE,
)


def extract_bash_commands(content: str) -> list[str]:
    """Pull individual shell commands out of a markdown doc.

    Looks at fenced ```bash``` blocks AND inline backtick spans that start
    with a known command verb. Each line of a fenced block is treated as a
    separate command (stripped of leading `$ ` / `> ` prompts and comments).
    """
    out: list[str] = []
    if not content:
        return out

    for block in _FENCED_BASH_RE.findall(content):
        for raw in block.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            # Drop leading "$ " / "> " shell prompt markers
            line = re.sub(r"^[\$>]\s+", "", line)
            if line:
                out.append(line)

    for span in _INLINE_CMD_RE.findall(content):
        line = span.strip()
        if _CMD_VERB_RE.match(line):
            out.append(line)

    # Deduplicate while keeping order
    seen: set[str] = set()
    deduped: list[str] = []
    for c in out:
        if c not in seen:
            seen.add(c)
            deduped.append(c)
    return deduped


@dataclass
class ProvenanceNode:
    source_type: SourceType
    source_path: str | None
    trust_level: int
    excerpt: str | None = None
    suspicious_markers: tuple[str, ...] = ()
    # Shell commands extracted from this source's content (when it's a doc).
    # Used by the policy engine to detect "command authored by a README".
    bash_blocks: tuple[str, ...] = ()


def _classify_path(path: str | None) -> SourceType:
    """Best-effort guess of source_type from a file path."""
    if not path:
        return SourceType.MODEL_PLAN
    p = path.lower().replace("\\", "/")
    if "/.vibefence" in p or p.endswith(".vibefence.yml"):
        return SourceType.PROJECT_POLICY
    if p.endswith((".md", ".markdown", ".mdx", ".rst", ".txt")) or "readme" in p:
        return SourceType.DOCUMENTATION
    if "/test" in p or p.endswith((".test.ts", ".spec.ts", "_test.py")):
        return SourceType.TEST_FILE
    if p.endswith((".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go")):
        return SourceType.REPO_CODE
    return SourceType.REPO_CODE


def _walk_transcript_jsonl(path: Path, max_lines: int = 200) -> list[dict]:
    """Read the last N entries of a Claude Code transcript file."""
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return []
    out: list[dict] = []
    for raw in lines[-max_lines:]:
        try:
            out.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return out


_READ_LINE_PREFIX_RE = re.compile(r"^\s*\d+\t", re.MULTILINE)


def _strip_read_line_prefix(text: str) -> str:
    """Strip cat -n-style line-number prefixes that Claude's Read tool adds.

    Each line of Read tool output is `<line_number>\\t<actual_content>`. The
    leading digits + tab break our fenced-code-block regex (which expects
    `^[ \\t]*\\`\\`\\``). Stripping the prefix lets `extract_bash_commands`
    work the same way it would on the raw file — which is the whole point
    of the doc-authored-shell rule.
    """
    if not text:
        return text
    return _READ_LINE_PREFIX_RE.sub("", text)


def _extract_file_reads(entries: list[dict]) -> list[tuple[str, str]]:
    """Return (path, content) tuples for recent Read tool calls."""
    out: list[tuple[str, str]] = []
    for e in entries:
        # Claude Code transcript: tool_use messages have type=tool_use with name + input
        msg = e.get("message", e)
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use" and block.get("name") in ("Read", "view_file"):
                tool_input = block.get("input", {})
                file_path = tool_input.get("file_path") or tool_input.get("path")
                if file_path:
                    out.append((file_path, ""))  # content filled below
            if block.get("type") == "tool_result":
                # Pair with most recent Read whose content was empty
                if out and not out[-1][1]:
                    text = block.get("content")
                    if isinstance(text, list):
                        text = " ".join(
                            t.get("text", "") if isinstance(t, dict) else str(t) for t in text
                        )
                    elif not isinstance(text, str):
                        text = str(text)
                    out[-1] = (out[-1][0], _strip_read_line_prefix(text or ""))
    return out


def _last_user_message(entries: list[dict]) -> str | None:
    for e in reversed(entries):
        msg = e.get("message", e)
        if msg.get("role") == "user":
            content = msg.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                parts = [b.get("text", "") for b in content if isinstance(b, dict)]
                return " ".join(p for p in parts if p)
    return None


def build_chain(
    transcript_path: str | None = None,
    extra_sources: list[tuple[SourceType, str | None, str]] | None = None,
) -> list[ProvenanceNode]:
    """Construct the provenance chain for the current decision.

    Always starts with the user's most recent direct instruction (USER, 85),
    then any file reads / tool outputs we can find in the transcript. The
    `extra_sources` parameter lets the scripted demo inject a specific file
    without needing a real Claude transcript.

    Each markdown / documentation source has Layer 2 injection patterns
    applied; if any markers are found, we drop that node's trust to 10
    (model-plan level) and tag it.
    """
    chain: list[ProvenanceNode] = []

    entries: list[dict] = []
    if transcript_path:
        entries = _walk_transcript_jsonl(Path(transcript_path))

    # 1. user instruction at the top of the chain
    user_msg = _last_user_message(entries)
    chain.append(ProvenanceNode(
        source_type=SourceType.USER_INSTRUCTION,
        source_path=None,
        trust_level=TRUST_SCORE[SourceType.USER_INSTRUCTION],
        excerpt=(user_msg[:200] if user_msg else None),
    ))

    # 2. file reads from the transcript
    seen_paths: set[str] = set()
    for path, content in _extract_file_reads(entries):
        if path in seen_paths:
            continue
        seen_paths.add(path)
        st = _classify_path(path)
        markers: list[str] = []
        bash_blocks: tuple[str, ...] = ()
        if st in (SourceType.DOCUMENTATION, SourceType.WEB_CONTENT):
            markers = [f.marker for f in injection.detect(content)]
            bash_blocks = tuple(extract_bash_commands(content))
        base_trust = TRUST_SCORE[st]
        # Layer 2 trust drop: suspicious doc → 10
        effective = 10 if markers else base_trust
        chain.append(ProvenanceNode(
            source_type=st,
            source_path=path,
            trust_level=effective,
            excerpt=(content[:200] if content else None),
            suspicious_markers=tuple(markers),
            bash_blocks=bash_blocks,
        ))

    # 3. extras (used by scripted demo to inject README content directly)
    for st, path, content in extra_sources or []:
        markers = []
        bash_blocks = ()
        if st in (SourceType.DOCUMENTATION, SourceType.WEB_CONTENT):
            markers = [f.marker for f in injection.detect(content)]
            bash_blocks = tuple(extract_bash_commands(content))
        base_trust = TRUST_SCORE[st]
        effective = 10 if markers else base_trust
        chain.append(ProvenanceNode(
            source_type=st,
            source_path=path,
            trust_level=effective,
            excerpt=(content[:200] if content else None),
            suspicious_markers=tuple(markers),
            bash_blocks=bash_blocks,
        ))

    # 4. model plan node — always present at the bottom of the chain.
    chain.append(ProvenanceNode(
        source_type=SourceType.MODEL_PLAN,
        source_path=None,
        trust_level=TRUST_SCORE[SourceType.MODEL_PLAN],
        excerpt=None,
    ))
    return chain


def effective_trust(chain: list[ProvenanceNode]) -> int:
    """The chain is only as trustworthy as its weakest link, but we exclude
    the always-present MODEL_PLAN floor of 10 — otherwise nothing would ever
    pass. The model is the *consumer*, not a contributing source."""
    contributing = [n for n in chain if n.source_type != SourceType.MODEL_PLAN]
    if not contributing:
        return TRUST_SCORE[SourceType.MODEL_PLAN]
    return min(n.trust_level for n in contributing)


def _normalize_cmd(s: str) -> str:
    """Normalize a shell command for verbatim comparison: collapse whitespace,
    strip surrounding quotes, lower-case the first word only (preserving args)."""
    return " ".join(s.split()).strip()


def find_doc_authored_match(
    command: str, chain: list[ProvenanceNode]
) -> ProvenanceNode | None:
    """If the current Bash command appears in any DOCUMENTATION/WEB_CONTENT
    node's `bash_blocks`, return that node. Used by the engine to enforce
    the rule "documentation cannot author shell execution."
    """
    if not command:
        return None
    needle = _normalize_cmd(command)
    if not needle:
        return None
    for n in chain:
        if n.source_type not in (SourceType.DOCUMENTATION, SourceType.WEB_CONTENT):
            continue
        for block in n.bash_blocks:
            haystack = _normalize_cmd(block)
            if not haystack:
                continue
            # Match if either is a prefix/substring of the other (Claude
            # may strip or add args slightly).
            if needle == haystack or needle in haystack or haystack in needle:
                return n
    return None
