import { prisma } from "@/lib/prisma";
import { mapInstagramError, postarReelBuffer } from "@/lib/instagramService";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Não autorizado" }) + "\n",
      { status: 401, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(
      JSON.stringify({ error: "Corpo inválido (use multipart/form-data)." }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const videoId = String(formData.get("videoId") ?? "").trim();
  const caption = String(formData.get("caption") ?? "");
  const idsRaw = formData.get("accountIds");
  const rawInterval = Math.max(0, Math.min(120, Number(formData.get("intervalSeconds") ?? "0")));

  if (!videoId) {
    return new Response(
      JSON.stringify({ error: "Campo videoId obrigatório." }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  if (!idsRaw || typeof idsRaw !== "string") {
    return new Response(
      JSON.stringify({ error: "Campo accountIds obrigatório (JSON array de ids)." }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  let accountIds: string[];
  try {
    accountIds = JSON.parse(idsRaw) as string[];
  } catch {
    return new Response(
      JSON.stringify({ error: "accountIds deve ser JSON válido." }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return new Response(
      JSON.stringify({ error: "Selecione ao menos uma conta." }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  // Verify video belongs to this user
  const libraryVideo = await prisma.libraryVideo.findFirst({
    where: { id: videoId, userId: user.id },
  });
  if (!libraryVideo) {
    return new Response(
      JSON.stringify({ error: "Vídeo não encontrado na biblioteca." }) + "\n",
      { status: 404, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  // Verify all requested accounts belong to this user and are active
  const ownedAccounts = await prisma.instagramOAuthAccount.findMany({
    where: { id: { in: accountIds }, userId: user.id, accountStatus: { not: "SUSPENDED" } },
    select: { id: true },
  });
  const safeAccountIds = ownedAccounts.map(a => a.id);

  if (safeAccountIds.length === 0) {
    return new Response(
      JSON.stringify({ error: "Nenhuma conta válida selecionada." }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  // Enforce a minimum of 10s between accounts to avoid Instagram rate-limiting ("too many actions")
  const n = safeAccountIds.length;
  const intervalSeconds = n <= 1 ? 0 : Math.max(10, rawInterval);

  // Download video buffer from Supabase Storage (server-to-server, no Vercel limit)
  let videoBuffer: Buffer;
  try {
    const videoRes = await fetch(libraryVideo.publicUrl);
    if (!videoRes.ok) throw new Error(`HTTP ${videoRes.status}`);
    videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: `Falha ao baixar vídeo: ${err instanceof Error ? err.message : "erro"}` }) + "\n",
      { status: 502, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        for (let i = 0; i < safeAccountIds.length; i++) {
          const id = safeAccountIds[i];
          try {
            const r = await postarReelBuffer(prisma, id, videoBuffer, caption, libraryVideo.publicUrl);
            push({ accountId: id, username: r.username, success: r.success, error: r.error });
          } catch (err: unknown) {
            push({ accountId: id, username: "", success: false, error: mapInstagramError(err) });
          }
          if (intervalSeconds > 0 && i < safeAccountIds.length - 1) {
            // Add ±25% jitter so the pattern looks less robotic to Instagram
            const jitter = intervalSeconds * 0.25;
            const delay = intervalSeconds + (Math.random() * jitter * 2 - jitter);
            await new Promise((resolve) => setTimeout(resolve, delay * 1000));
          }
        }
      } catch (err: unknown) {
        push({ type: "fatal", success: false, error: mapInstagramError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
