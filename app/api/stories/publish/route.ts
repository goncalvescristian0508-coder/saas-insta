import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { publishStoryFromUrl } from "@/lib/instagramGraphPublish";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { userId: user.id, accountStatus: "ACTIVE" },
    orderBy: { username: "asc" },
    select: { id: true, username: true, profilePictureUrl: true },
  });

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json() as {
    storyIds?: string[];
    accountIds?: string[];
    distribute?: boolean;
  };

  const { storyIds = [], accountIds = [], distribute = true } = body;

  if (storyIds.length === 0)
    return NextResponse.json({ error: "Selecione ao menos 1 story" }, { status: 400 });
  if (accountIds.length === 0)
    return NextResponse.json({ error: "Selecione ao menos 1 conta" }, { status: 400 });

  const stories = await prisma.libraryVideo.findMany({
    where: { id: { in: storyIds }, userId: user.id },
    select: { id: true, publicUrl: true, mimeType: true },
  });
  if (stories.length === 0)
    return NextResponse.json({ error: "Stories não encontrados" }, { status: 404 });

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { id: { in: accountIds }, userId: user.id, accountStatus: "ACTIVE" },
    select: { id: true, username: true, instagramUserId: true, accessTokenEnc: true },
  });
  if (accounts.length === 0)
    return NextResponse.json({ error: "Nenhuma conta ativa encontrada" }, { status: 404 });

  // Map each account to a story
  const pairs = accounts.map((account, idx) => ({
    account,
    story: distribute
      ? stories[idx % stories.length]  // each account gets a different story (round-robin)
      : stories[0],                     // all accounts get the same story
  }));

  // Post all in parallel (each handles its own polling timeout)
  const results = await Promise.all(
    pairs.map(async ({ account, story }) => {
      try {
        const accessToken = decryptAccountPassword(account.accessTokenEnc);
        const result = await publishStoryFromUrl({
          igUserId: account.instagramUserId,
          accessToken,
          mediaUrl: story.publicUrl,
          isVideo: story.mimeType === "video/mp4",
        });
        return {
          accountId: account.id,
          username: account.username,
          status: result.ok ? "ok" : "error",
          error: result.ok ? undefined : result.error,
        };
      } catch (err) {
        return {
          accountId: account.id,
          username: account.username,
          status: "error",
          error: err instanceof Error ? err.message : "Erro desconhecido",
        };
      }
    })
  );

  const ok = results.filter(r => r.status === "ok").length;
  const errors = results.filter(r => r.status === "error").length;

  return NextResponse.json({ results, ok, errors });
}
