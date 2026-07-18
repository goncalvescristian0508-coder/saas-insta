import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listMetaAppsFromDB } from "@/lib/metaInstagramEnv";

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

const BATCH_SIZE = 20;

async function callAddTester(
  baseUrl: string, cronSecret: string, appKey: string, batch: string[]
): Promise<{ resultsMap: Record<string, { ok: boolean; error?: string }>; error?: string }> {
  const res = await fetch(`${baseUrl}/api/admin/add-instagram-tester`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cronSecret}` },
    body: JSON.stringify({ igUsernames: batch, appKey }),
    signal: AbortSignal.timeout(250_000),
  });
  const rawText = await res.text();
  let data: { results?: TesterResult[]; ok?: number; errors?: number; error?: string } = {};
  try { data = JSON.parse(rawText); } catch {
    return { resultsMap: {}, error: `HTTP ${res.status}: ${rawText.slice(0, 200)}` };
  }
  if (!res.ok || data.error) return { resultsMap: {}, error: data.error ?? `HTTP ${res.status}` };
  const map: Record<string, { ok: boolean; error?: string }> = {};
  for (const r of (data.results ?? [])) map[r.username] = { ok: r.ok, ...(r.error ? { error: r.error } : {}) };
  return { resultsMap: map };
}

async function processJobNow(jobId: string, appKey: string, usernames: string[]): Promise<void> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://saas-insta.vercel.app").replace(/\/$/, "");
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  if (!cronSecret) return;

  await prisma.testerJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: new Date() } });

  const allResults: Record<string, { ok: boolean; error?: string }> = {};
  let lastError: string | undefined;

  // Process in batches to avoid Lambda timeout
  for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
    const batch = usernames.slice(i, i + BATCH_SIZE);
    try {
      const { resultsMap, error } = await callAddTester(baseUrl, cronSecret, appKey, batch);
      if (error) { lastError = error; Object.assign(allResults, Object.fromEntries(batch.map(u => [u, { ok: false, error }]))); }
      else Object.assign(allResults, resultsMap);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      lastError = msg;
      Object.assign(allResults, Object.fromEntries(batch.map(u => [u, { ok: false, error: msg }])));
    }
    // Save progress after each batch
    await prisma.testerJob.update({ where: { id: jobId }, data: { results: JSON.stringify(allResults) } });
  }

  const okCount = Object.values(allResults).filter(r => r.ok).length;
  await prisma.testerJob.update({
    where: { id: jobId },
    data: {
      status: okCount > 0 ? "DONE" : "FAILED",
      results: JSON.stringify(allResults),
      errorMsg: okCount === 0 ? (lastError ?? "Todos falharam") : undefined,
      doneAt: new Date(),
    },
  });
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
  const apps = await listMetaAppsFromDB();
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

  return NextResponse.json({ jobId: job.id, status: "PENDING", usernames: usernames.length });
}

// DELETE /api/tester-invites?jobId=xxx — cancela job PENDING/RUNNING
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  // Se jobId não informado, cancela TODOS os jobs ativos do usuário
  if (!jobId) {
    const result = await prisma.testerJob.updateMany({
      where: { userId: user.id, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "FAILED", errorMsg: "Cancelado pelo usuário", doneAt: new Date() },
    });
    return NextResponse.json({ cancelled: result.count });
  }

  const job = await prisma.testerJob.findFirst({ where: { id: jobId, userId: user.id }, select: { id: true, status: true } });
  if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });

  await prisma.testerJob.update({
    where: { id: jobId },
    data: { status: "FAILED", errorMsg: "Cancelado pelo usuário", doneAt: new Date() },
  });
  return NextResponse.json({ ok: true });
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

  const apps = await listMetaAppsFromDB();
  const planName = await getUserPlan(user.id);

  return NextResponse.json({ jobs, apps: apps.map(a => ({ key: a.key, name: a.name, appId: a.appId })), plan: { name: planName, limit: 10_000 } });
}
