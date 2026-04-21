import { prisma } from "@/lib/prisma";
import { mapInstagramError, postarReelBuffer } from "@/lib/instagramService";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
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

  // Fetch video record from library
  const libraryVideo = await prisma.libraryVideo.findUnique({ where: { id: videoId } });
  if (!libraryVideo) {
    return new Response(
      JSON.stringify({ error: "Vídeo não encontrado na biblioteca." }) + "\n",
      { status: 404, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

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
        await Promise.all(
          accountIds.map(async (id) => {
            try {
              const r = await postarReelBuffer(prisma, id, videoBuffer, caption, libraryVideo.publicUrl);
              push({ accountId: id, username: r.username, success: r.success, error: r.error });
            } catch (err: unknown) {
              push({ accountId: id, username: "", success: false, error: mapInstagramError(err) });
            }
          }),
        );
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
