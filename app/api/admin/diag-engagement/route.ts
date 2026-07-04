/**
 * Admin diagnostic: testa Graph API + Apify para uma conta específica.
 * GET /api/admin/diag-engagement?username=xxx  (ou sem username — usa primeira conta ativa)
 * Autenticação: CRON_SECRET header ou sessão admin Supabase.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { getAllApifyTokens, loadExhaustedTokens } from "@/lib/apifyRotation";

export const runtime = "nodejs";
export const maxDuration = 60;

const GRAPH = "https://graph.instagram.com/v21.0";
const APIFY_BASE = "https://api.apify.com/v2";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";

async function authCheck(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) return true;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === ADMIN_EMAIL;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function GET(request: Request) {
  if (!await authCheck(request)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const targetUsername = searchParams.get("username");
  const log: string[] = [];
  const push = (msg: string) => { log.push(msg); console.log("[diag-engagement]", msg); };

  push("=== DIAGNÓSTICO ENGAJAMENTO ===");

  // ── Tokens ────────────────────────────────────────────────────────────────
  const allTokens = await getAllApifyTokens();
  const exhausted = await loadExhaustedTokens();
  const available = allTokens.filter(t => !exhausted.has(t));
  push(`Tokens: total=${allTokens.length} disponíveis=${available.length} esgotados=${exhausted.size}`);

  if (available.length === 0) {
    return NextResponse.json({ log, error: "Nenhum token Apify disponível" });
  }

  // ── Escolhe conta ─────────────────────────────────────────────────────────
  let account: { id: string; username: string; instagramUserId: string; accessTokenEnc: string } | null = null;

  if (targetUsername) {
    account = await prisma.instagramOAuthAccount.findFirst({
      where: { username: targetUsername, accountStatus: "ACTIVE" },
      select: { id: true, username: true, instagramUserId: true, accessTokenEnc: true },
    });
    push(`Conta alvo: @${targetUsername} — ${account ? "encontrada" : "NÃO ENCONTRADA"}`);
  } else {
    account = await prisma.instagramOAuthAccount.findFirst({
      where: { accountStatus: "ACTIVE" },
      select: { id: true, username: true, instagramUserId: true, accessTokenEnc: true },
      orderBy: { createdAt: "asc" },
    });
    push(`Usando primeira conta ativa: @${account?.username ?? "(nenhuma)"}`);
  }

  if (!account) {
    return NextResponse.json({ log, error: "Nenhuma conta ativa encontrada" });
  }

  // ── Graph API ─────────────────────────────────────────────────────────────
  push(`\n--- Graph API para @${account.username} ---`);
  let graphResult: Record<string, unknown> = {};
  try {
    const token = decryptAccountPassword(account.accessTokenEnc);
    const mediaRes = await fetch(
      `${GRAPH}/${account.instagramUserId}/media?fields=id,like_count,comments_count,play_count,video_views,timestamp,media_type,media_product_type&limit=20&access_token=${token}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (mediaRes.ok) {
      const data = await mediaRes.json() as { data?: Array<Record<string, unknown>> };
      const posts = data.data ?? [];
      const reels = posts.filter(p => p.media_type === "VIDEO" || p.media_product_type === "REELS");
      const totalPlayCount = reels.reduce((s, p) => s + Number(p.play_count ?? 0), 0);
      const totalVideoViews = reels.reduce((s, p) => s + Number(p.video_views ?? 0), 0);
      push(`  Posts: ${posts.length}, Reels: ${reels.length}`);
      push(`  Total play_count: ${totalPlayCount}`);
      push(`  Total video_views: ${totalVideoViews}`);
      if (reels.length > 0) {
        const r = reels[0];
        push(`  Primeiro reel: media_type=${r.media_type} media_product_type=${r.media_product_type} play_count=${r.play_count} video_views=${r.video_views}`);
      } else {
        push(`  Nenhum reel encontrado nos últimos ${posts.length} posts`);
        if (posts.length > 0) {
          const types = [...new Set(posts.map(p => `${p.media_type}/${p.media_product_type}`))];
          push(`  Tipos encontrados: ${types.join(", ")}`);
        }
      }
      graphResult = { posts: posts.length, reels: reels.length, totalPlayCount, totalVideoViews };
    } else {
      const err = await mediaRes.json().catch(() => ({})) as { error?: { message?: string } };
      push(`  ERRO Graph API: ${err.error?.message ?? mediaRes.status}`);
    }
  } catch (e) {
    push(`  EXCEÇÃO Graph API: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Apify ─────────────────────────────────────────────────────────────────
  push(`\n--- Apify para @${account.username} ---`);
  const apifyToken = available[0];
  let apifyResult: Record<string, unknown> = {};

  try {
    // Inicia run
    const startRes = await fetch(
      `${APIFY_BASE}/acts/apify~instagram-reel-scraper/runs?token=${apifyToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: [account.username], resultsLimit: 5 }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    const startJson = await startRes.json() as { data?: { id?: string }; error?: { message?: string } };

    if (!startRes.ok) {
      push(`  ERRO ao iniciar run: ${startJson.error?.message ?? startRes.status}`);
      return NextResponse.json({ log, graph: graphResult, apify: { error: startJson.error?.message } });
    }

    const runId = startJson.data?.id;
    push(`  Run iniciado: ${runId}`);

    // Poll por até 45s
    const deadline = Date.now() + 45_000;
    let datasetId = "";
    let finalStatus = "";

    while (Date.now() < deadline) {
      await sleep(4000);
      const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apifyToken}`, { signal: AbortSignal.timeout(8_000) });
      const statusJson = await statusRes.json() as { data?: { status?: string; defaultDatasetId?: string } };
      finalStatus = statusJson.data?.status ?? "UNKNOWN";
      push(`  status: ${finalStatus}`);

      if (finalStatus === "SUCCEEDED") { datasetId = statusJson.data?.defaultDatasetId ?? ""; break; }
      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(finalStatus)) break;
    }

    if (!datasetId) {
      push(`  Run não concluiu no tempo. Último status: ${finalStatus}`);
      apifyResult = { runId, finalStatus, timedOut: true };
    } else {
      // Baixa dataset
      const dataRes = await fetch(
        `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyToken}&format=json`,
        { signal: AbortSignal.timeout(15_000) }
      );
      const items = await dataRes.json() as Record<string, unknown>[];
      push(`  Dataset: ${items.length} items`);

      if (items.length > 0) {
        const first = items[0];
        const fields = Object.keys(first);
        push(`  Campos: ${fields.join(", ")}`);

        const viewFields = ["viewsCount", "videoViewCount", "view_count", "video_view_count", "ig_play_count", "play_count", "plays", "playCount", "videoViews", "video_views"];
        const viewData: Record<string, unknown> = {};
        for (const f of viewFields) {
          if (f in first) viewData[f] = first[f];
        }
        push(`  Campos de views: ${JSON.stringify(viewData)}`);

        const totalViews = items.reduce((s, i) => s + Number(
          i.viewsCount ?? i.videoViewCount ?? i.view_count ?? i.video_view_count ?? i.ig_play_count ?? i.play_count ?? 0
        ), 0);
        push(`  Total views calculado: ${totalViews}`);

        apifyResult = {
          runId,
          finalStatus,
          itemCount: items.length,
          firstItemFields: fields,
          viewFieldsFound: viewData,
          totalViewsCalculated: totalViews,
        };
      } else {
        push(`  Dataset vazio — nenhum reel encontrado pelo Apify`);
        apifyResult = { runId, finalStatus, itemCount: 0 };
      }
    }
  } catch (e) {
    push(`  EXCEÇÃO Apify: ${e instanceof Error ? e.message : String(e)}`);
    apifyResult = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({ log, graph: graphResult, apify: apifyResult });
}
