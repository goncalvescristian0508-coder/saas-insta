import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authOk(req: Request): boolean {
  const secret = (process.env.INTEGRATION_SECRET || "").trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// GET /api/integration/tester-job/pending — Electron busca próximo job PENDING
export async function GET(req: Request) {
  if (!authOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

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
