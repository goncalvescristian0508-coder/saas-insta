import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authOk(req: Request): boolean {
  const secret = (process.env.INTEGRATION_SECRET || "").trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// GET /api/integration/tester-job/pending — Electron busca próximo job PENDING
// Jobs RUNNING há mais de 10 min são considerados travados e recolocados em PENDING
export async function GET(req: Request) {
  if (!authOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.testerJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: staleThreshold } },
    data: { status: "PENDING", startedAt: null },
  });

  const job = await prisma.testerJob.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, appKey: true, appId: true, usernames: true, userId: true },
  });

  if (!job) return NextResponse.json({ job: null });

  await prisma.testerJob.update({
    where: { id: job.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  return NextResponse.json({ job });
}

// POST /api/integration/tester-job/pending — reseta job RUNNING para PENDING
export async function POST(req: Request) {
  if (!authOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  const where = jobId
    ? { id: jobId, status: "RUNNING" }
    : { status: "RUNNING" };

  const result = await prisma.testerJob.updateMany({
    where,
    data: { status: "PENDING", startedAt: null },
  });

  return NextResponse.json({ reset: result.count });
}
