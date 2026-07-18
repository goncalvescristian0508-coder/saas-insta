import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authOk(req: Request): boolean {
  const secret = (process.env.INTEGRATION_SECRET || "").trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// POST /api/integration/tester-job/progress — Electron reporta resultado por username
export async function POST(req: Request) {
  if (!authOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json() as { jobId: string; username: string; ok: boolean; error?: string };

  const job = await prisma.testerJob.findUnique({
    where: { id: body.jobId },
    select: { results: true },
  });

  if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });

  let results: Record<string, { ok: boolean; error?: string }> = {};
  if (job.results) {
    try { results = JSON.parse(job.results); } catch { /* ignore */ }
  }

  results[body.username] = { ok: body.ok, ...(body.error ? { error: body.error } : {}) };

  await prisma.testerJob.update({
    where: { id: body.jobId },
    data: { results: JSON.stringify(results) },
  });

  return NextResponse.json({ ok: true });
}
