// Mirror of `agent/vibefence/lib/redact.py looks_unredacted` in TS.
// Cheap heuristic the cloud uses to defensively reject obviously-leaky payloads.
const SUSPICIOUS = [
  /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/,
  /\bsk-(?:ant-)?[A-Za-z0-9_\-]{20,}/,
  /\bAKIA[0-9A-Z]{16}/,
  /-----BEGIN [^-]*PRIVATE KEY-----/,
  /^\s*(?:API_KEY|SECRET|PASSWORD|TOKEN)\s*=\s*\S+/im,
];

export function looksUnredacted(text: string): boolean {
  if (!text) return false;
  return SUSPICIOUS.some((p) => p.test(text));
}
