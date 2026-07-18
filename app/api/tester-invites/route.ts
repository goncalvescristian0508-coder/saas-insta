import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listMetaApps } from "@/lib/metaInstagramEnv";

export const runtime = "nodejs";
export const maxDuration = 300;

async function getUserPlan(userId: string): Promise<string | null> {
  const sale = await prisma.sale.findFirst({
    where: { userId, status: "APPROVED", planName: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { planName: true },
  });
  return sale?.planName ?? null;
}

type TesterResult = { username: string; ok: boolean; error?: string };

async function processJobNow(jobId: string, appKey: string, usernames: string[]): Promise<void> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://saas-insta.vercel.app").replace(/\/$/, "");
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  if (!cronSecret) return;

  await prisma.testerJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const res = await fetch(`${baseUrl}/api/admin/add-instagram-tester`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ igUsernames: usernames, appKey }),
      signal: AbortSignal.timeout(270_000),
    });

    const data = await res.json() as {
      results?: TesterResult[];
      ok?: number;
      errors?: number;
      error?: string;
    };

    if (!res.ok || data.error) {
      await prisma.testerJob.update({
        where: { id: jobId },
        data: { status: "FAILED", errorMsg: data.error ?? `HTTP ${res.status}`, doneAt: new Date() },
      });
      return;
    }

    // Build per-username results map
    const resultsMap: Record<string, { ok: boolean; error?: string }> = {};
    for (const r of (data.results ?? [])) {
      resultsMap[r.username] = { ok: r.ok, ...(r.error ? { error: r.error } : {}) };
    }

    const allOk = (data.results ?? []).every(r => r.ok);
    await prisma.testerJob.update({
      where: { id: jobId },
      data: {
        status: allOk ? "DONE" : (data.ok ?? 0) > 0 ? "DONE" : "FAILED",
        results: JSON.stringify(resultsMap),
        doneAt: new Date(),
      },
    });
  } catch (e) {
    await prisma.testerJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMsg: e instanceof Error ? e.message : "Erro desconhecido", doneAt: new Date() },
    });
  }
}

// POST /api/tester-invites — usuário cria e processa um job de convite
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json() as { usernames?: string[]; appKey?: string };

  const raw: string[] = Array.isArray(body.usernames) ? body.usernames : [];
  const usernames = [...new Set(raw.map(u => u.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))];

  if (usernames.length === 0) {
    return NextResponse.json({ error: "Nenhum username fornecido" }, { status: 400 });
  }

  // Validate appKey
  const apps = listMetaApps();
  const appKey = body.appKey ?? apps[0]?.key;
  const app = apps.find(a => a.key === appKey);
  if (!app) {
    return NextResponse.json({ error: "App Meta não encontrado. Contate o suporte." }, { status: 400 });
  }

  // Block if there's already an active job for this user
  const activeJob = await prisma.testerJob.findFirst({
    where: { userId: user.id, status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true, status: true },
  });
  if (activeJob) {
    return NextResponse.json({ error: "Você já tem um job em andamento. Aguarde ele terminar.", jobId: activeJob.id }, { status: 409 });
  }

  const job = await prisma.testerJob.create({
    data: { userId: user.id, appKey, appId: app.appId, usernames, status: "PENDING" },
  });

  // Processa imediatamente (síncrono, aguarda resposta)
  await processJobNow(job.id, appKey, usernames);

  // Retorna o job atualizado
  const updated = await prisma.testerJob.findUnique({ where: { id: job.id } });
  return NextResponse.json({ jobId: job.id, status: updated?.status ?? "PENDING", results: updated?.results ?? null });
}

// GET /api/tester-invites — lista jobs do usuário
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (jobId) {
    const job = await prisma.testerJob.findFirst({ where: { id: jobId, userId: user.id } });
    if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
    return NextResponse.json(job);
  }

  const jobs = await prisma.testerJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, appKey: true, status: true, usernames: true, results: true, errorMsg: true, createdAt: true, startedAt: true, doneAt: true },
  });

  const apps = listMetaApps();
  const planName = await getUserPlan(user.id);

  return NextResponse.json({ jobs, apps: apps.map(a => ({ key: a.key, name: a.name, appId: a.appId })), plan: { name: planName, limit: 10_000 } });
}
