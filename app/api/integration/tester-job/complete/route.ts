import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authOk(req: Request): boolean {
  const secret = (process.env.INTEGRATION_SECRET || "").trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// POST /api/integration/tester-job/complete — Electron marca job como concluído
export async function POST(req: Request) {
  if (!authOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json() as {
    jobId: string;
    status: "DONE" | "FAILED" | "PAUSED";
    errorMsg?: string;
    results?: Record<string, { ok: boolean; error?: string }>;
  };

  if (!["DONE", "FAILED", "PAUSED"].includes(body.status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    status: body.status,
    doneAt: new Date(),
    ...(body.errorMsg ? { errorMsg: body.errorMsg } : {}),
  };

  // Se o Electron enviou resultados finais junto com complete, merge
  if (body.results && Object.keys(body.results).length > 0) {
    const job = await prisma.testerJob.findUnique({
      where: { id: body.jobId },
      select: { results: true },
    });
    let existing: Record<string, { ok: boolean; error?: string }> = {};
    if (job?.results) {
      try { existing = JSON.parse(job.results); } catch { /* ignore */ }
    }
    const merged = { ...existing, ...body.results };
    updateData.results = JSON.stringify(merged);
  }

  await prisma.testerJob.update({ where: { id: body.jobId }, data: updateData });

  return NextResponse.json({ ok: true });
}
