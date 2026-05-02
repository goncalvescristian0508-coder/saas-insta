import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { publishStoryFromUrl } from "@/lib/instagramGraphPublish";
import { publishStoryPrivate } from "@/lib/instagramService";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [oauthRows, privateRows] = await Promise.all([
    prisma.instagramOAuthAccount.findMany({
      where: { userId: user.id, accountStatus: "ACTIVE" },
      orderBy: { username: "asc" },
      select: { id: true, username: true, profilePictureUrl: true },
    }),
    prisma.privateInstagramAccount.findMany({
      where: { userId: user.id },
      orderBy: { username: "asc" },
      select: { id: true, username: true },
    }),
  ]);

  const accounts = [
    ...oauthRows.map(a => ({ ...a, source: "oauth" as const, supportsLinkSticker: false })),
    ...privateRows.map(a => ({ id: a.id, username: a.username, profilePictureUrl: null, source: "private" as const, supportsLinkSticker: true })),
  ].sort((a, b) => a.username.localeCompare(b.username));

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
    links?: Record<string, string>;
  };

  const { storyIds = [], accountIds = [], distribute = true, links = {} } = body;

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

  const [oauthAccounts, privateAccounts] = await Promise.all([
    prisma.instagramOAuthAccount.findMany({
      where: { id: { in: accountIds }, userId: user.id, accountStatus: "ACTIVE" },
      select: { id: true, username: true, instagramUserId: true, accessTokenEnc: true },
    }),
    prisma.privateInstagramAccount.findMany({
      where: { id: { in: accountIds }, userId: user.id },
      select: { id: true, username: true },
    }),
  ]);

  const allAccounts = [
    ...oauthAccounts.map(a => ({ ...a, source: "oauth" as const })),
    ...privateAccounts.map(a => ({ ...a, source: "private" as const, instagramUserId: "", accessTokenEnc: "" })),
  ];

  if (allAccounts.length === 0)
    return NextResponse.json({ error: "Nenhuma conta ativa encontrada" }, { status: 404 });

  const pairs = allAccounts.map((account, idx) => ({
    account,
    story: distribute ? stories[idx % stories.length] : stories[0],
  }));

  const results = await Promise.all(
    pairs.map(async ({ account, story }) => {
      try {
        const storyUrl = links[account.id]?.trim() || undefined;

        if (account.source === "private") {
          const result = await publishStoryPrivate({
            prisma,
            accountId: account.id,
            mediaUrl: story.publicUrl,
            isVideo: story.mimeType === "video/mp4",
            link: storyUrl,
          });
          return {
            accountId: account.id,
            username: account.username,
            status: result.ok ? "ok" : "error",
            error: result.ok ? undefined : result.error,
          };
        }

        const accessToken = decryptAccountPassword(account.accessTokenEnc);
        const result = await publishStoryFromUrl({
          igUserId: account.instagramUserId,
          accessToken,
          mediaUrl: story.publicUrl,
          isVideo: story.mimeType === "video/mp4",
          storyUrl,
        });
        return {
          accountId: account.id,
          username: account.username,
          status: result.ok ? "ok" : "error",
          error: result.ok ? undefined : result.error,
          debug: result.ok ? result.debug : undefined,
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
