import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listMetaApps } from "@/lib/metaInstagramEnv";

export const runtime = "nodejs";

const PLAN_LIMITS: Record<string, number> = {
  basic: 50,
  pro: 200,
  premium: 1000,
};

function getPlanLimit(planName: string | null | undefined): number {
  if (!planName) return 50;
  const lower = planName.toLowerCase();
  if (lower.includes("premium")) return PLAN_LIMITS.premium;
  if (lower.includes("pro")) return PLAN_LIMITS.pro;
  return PLAN_LIMITS.basic;
}

async function getUserPlan(userId: string): Promise<string | null> {
  const sale = await prisma.sale.findFirst({
    where: { userId, status: "APPROVED", planName: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { planName: true },
  });
  return sale?.planName ?? null;
}

// POST /api/tester-invites — usuário cria um job de convite
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json() as { usernames?: string[]; appKey?: string };

  const raw: string[] = Array.isArray(body.usernames) ? body.usernames : [];
  const usernames = raw.map(u => u.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);

  if (usernames.length === 0) {
    return NextResponse.json({ error: "Nenhum username fornecido" }, { status: 400 });
  }

  // Plan limit check
  const planName = await getUserPlan(user.id);
  const limit = getPlanLimit(planName);
  if (usernames.length > limit) {
    return NextResponse.json({
      error: `Seu plano (${planName ?? "basic"}) permite até ${limit} usuários por job. Você enviou ${usernames.length}.`,
      limit,
    }, { status: 400 });
  }

  // Validate appKey
  const apps = listMetaApps();
  const appKey = body.appKey ?? apps[0]?.key;
  const app = apps.find(a => a.key === appKey);
  if (!app) {
    return NextResponse.json({ error: "App Meta não encontrado. Contate o suporte." }, { status: 400 });
  }

  // Check if there's already a PENDING/RUNNING job for this user
  const activeJob = await prisma.testerJob.findFirst({
    where: { userId: user.id, status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true, status: true },
  });
  if (activeJob) {
    return NextResponse.json({ error: "Você já tem um job em andamento. Aguarde ele terminar.", jobId: activeJob.id }, { status: 409 });
  }

  const job = await prisma.testerJob.create({
    data: {
      userId: user.id,
      appKey,
      appId: app.appId,
      usernames,
      status: "PENDING",
    },
  });

  return NextResponse.json({ jobId: job.id, usernames: usernames.length, appKey, status: "PENDING" });
}

// GET /api/tester-invites — lista jobs do usuário
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (jobId) {
    const job = await prisma.testerJob.findFirst({
      where: { id: jobId, userId: user.id },
    });
    if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
    return NextResponse.json(job);
  }

  const jobs = await prisma.testerJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, appKey: true, status: true,
      usernames: true, results: true, errorMsg: true,
      createdAt: true, startedAt: true, doneAt: true,
    },
  });

  // Get available apps and plan info
  const apps = listMetaApps();
  const planName = await getUserPlan(user.id);
  const limit = getPlanLimit(planName);

  return NextResponse.json({ jobs, apps: apps.map(a => ({ key: a.key, name: a.name, appId: a.appId })), plan: { name: planName, limit } });
}
