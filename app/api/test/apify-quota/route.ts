import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getApifyTokensFromEnv } from "@/lib/apifyRotation";

export const runtime = "nodejs";
export const maxDuration = 30;

const APIFY_BASE = "https://api.apify.com/v2";

interface ApifyUserInfo {
  data?: {
    username?: string;
    email?: string;
    plan?: {
      monthlyUsageCreditsUsd?: number;
      maxMonthlyUsageUsd?: number;
    };
    monthlyUsage?: {
      totalUsd?: number;
    };
  };
  error?: { message?: string };
}

async function checkToken(token: string, index: number) {
  try {
    const res = await fetch(`${APIFY_BASE}/users/me?token=${token}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json() as ApifyUserInfo;

    if (!res.ok) {
      return { index, prefix: token.slice(0, 10) + "...", ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    }

    const d = json.data ?? {};
    const used = d.monthlyUsage?.totalUsd ?? 0;
    const limit = d.plan?.maxMonthlyUsageUsd ?? null;
    const credits = d.plan?.monthlyUsageCreditsUsd ?? 0;
    const remaining = limit != null ? Math.max(0, limit + credits - used) : null;
    const hasQuota = remaining == null || remaining > 0;

    return {
      index,
      prefix: token.slice(0, 10) + "...",
      ok: hasQuota,
      username: d.username ?? "?",
      email: d.email ?? "?",
      usedUsd: used.toFixed(4),
      limitUsd: limit != null ? limit.toFixed(2) : "ilimitado",
      creditsUsd: credits.toFixed(2),
      remainingUsd: remaining != null ? remaining.toFixed(4) : "ilimitado",
      status: hasQuota ? "✅ com cota" : "❌ esgotado",
    };
  } catch (e) {
    return { index, prefix: token.slice(0, 10) + "...", ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tokens = getApifyTokensFromEnv();
  if (tokens.length === 0) {
    return NextResponse.json({ error: "APIFY_TOKENS não configurado", tokens: [] });
  }

  const results = await Promise.all(tokens.map((t, i) => checkToken(t, i)));
  const withQuota = results.filter(r => r.ok).length;

  return NextResponse.json({
    totalTokens: tokens.length,
    tokensWithQuota: withQuota,
    tokensExhausted: tokens.length - withQuota,
    tokens: results,
  });
}
