import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username") ?? "francyellytavaress";
  const actorId = searchParams.get("actor") ?? "clockworks/tiktok-scraper";

  const userTokenRecords = await prisma.userApifyToken.findMany({
    where: { userId: user.id, isActive: true },
    select: { token: true },
  });
  const tokens = [
    ...userTokenRecords.map((r) => r.token),
    ...(process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "").split(",").map((t) => t.trim()).filter(Boolean),
  ];

  if (tokens.length === 0) return NextResponse.json({ error: "Sem token Apify" });

  const token = tokens[0];

  // Try multiple input formats
  const inputs = [
    { profiles: [username], resultsPerPage: 5 },
    { profiles: [`@${username}`], resultsPerPage: 5 },
    { startUrls: [{ url: `https://www.tiktok.com/@${username}` }], resultsPerPage: 5 },
    { usernames: [username], maxItems: 5 },
  ];

  const results: Record<string, unknown>[] = [];

  for (const input of inputs) {
    try {
      const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=50&memory=1024`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(55_000),
      });
      const data = await res.json() as unknown[];
      results.push({ input, status: res.status, count: data.length, sample: data.slice(0, 1) });
      if (data.length > 0) break;
    } catch (err) {
      results.push({ input, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ actor: actorId, username, token: token.slice(0, 8) + "...", results });
}
