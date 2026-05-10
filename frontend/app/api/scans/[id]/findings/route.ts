// Insert a verified finding (+ its evidence row) for a scan.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateRunner } from "@/lib/runner-auth";
import { looksUnredacted } from "@/lib/redact-check";

const Body = z.object({
  title: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low", "info"]).default("medium"),
  category: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: z.enum(["open", "verified", "fixed", "ignored", "false_positive"]).default("verified"),
  affected_route: z.string().nullable().optional(),
  affected_file: z.string().nullable().optional(),
  affected_line: z.number().int().nullable().optional(),
  impact: z.string().nullable().optional(),
  expected_behavior: z.string().nullable().optional(),
  observed_behavior: z.string().nullable().optional(),
  evidence_summary: z.string().nullable().optional(),
  remediation_summary: z.string().nullable().optional(),
  patch_available: z.boolean().optional(),
  regression_test_available: z.boolean().optional(),
  redacted_request: z.string().nullable().optional(),
  redacted_response: z.string().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authenticateRunner(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_payload", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    );
  }

  // Defense in depth — bounce the upload if the agent's redaction missed something.
  const concat = `${body.redacted_request ?? ""}\n${body.redacted_response ?? ""}\n${body.evidence_summary ?? ""}`;
  if (looksUnredacted(concat)) {
    return NextResponse.json(
      { error: "looks_unredacted", detail: "Cloud rejected payload that may contain secrets." },
      { status: 422 },
    );
  }

  const svc = createServiceClient();
  const { data: scan } = await svc
    .from("scans")
    .select("id, owner_id, project_id")
    .eq("id", id)
    .single();
  if (!scan || scan.owner_id !== auth.payload.owner_id) {
    return NextResponse.json({ error: "scan_not_found" }, { status: 404 });
  }

  const { data: finding, error } = await svc
    .from("findings")
    .insert({
      owner_id: auth.payload.owner_id,
      project_id: scan.project_id,
      scan_id: scan.id,
      title: body.title,
      severity: body.severity,
      category: body.category ?? null,
      confidence: body.confidence ?? null,
      status: body.status,
      affected_route: body.affected_route ?? null,
      affected_file: body.affected_file ?? null,
      affected_line: body.affected_line ?? null,
      impact: body.impact ?? null,
      expected_behavior: body.expected_behavior ?? null,
      observed_behavior: body.observed_behavior ?? null,
      evidence_summary: body.evidence_summary ?? null,
      remediation_summary: body.remediation_summary ?? null,
      patch_available: body.patch_available ?? false,
      regression_test_available: body.regression_test_available ?? false,
    })
    .select("id")
    .single();

  if (error || !finding) {
    return NextResponse.json(
      { error: "finding_create_failed", detail: error?.message },
      { status: 500 },
    );
  }

  // Stash the redacted req/resp as an evidence row.
  if (body.redacted_request || body.redacted_response) {
    await svc.from("evidence").insert({
      finding_id: finding.id,
      type: "http",
      redacted_request: body.redacted_request ?? null,
      redacted_response: body.redacted_response ?? null,
    });
  }

  return NextResponse.json({ id: finding.id });
}
