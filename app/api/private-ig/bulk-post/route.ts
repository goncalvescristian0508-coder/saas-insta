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
      JSON.stringify({ error: "Corpo inválido (use multipart/form-data)." }) +
        "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const file = formData.get("video");
  const caption = String(formData.get("caption") ?? "");
  const idsRaw = formData.get("accountIds");

  if (!idsRaw || typeof idsRaw !== "string") {
    return new Response(
      JSON.stringify({
        error: "Campo accountIds obrigatório (JSON array de ids).",
      }) + "\n",
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

  if (!file || typeof file === "string") {
    return new Response(
      JSON.stringify({ error: "Arquivo de vídeo obrigatório." }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const ab = await (file as Blob).arrayBuffer();
  const videoBuffer = Buffer.from(ab);

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
              const r = await postarReelBuffer(prisma, id, videoBuffer, caption);
              push({
                accountId: id,
                username: r.username,
                success: r.success,
                error: r.error,
              });
            } catch (err: unknown) {
              push({
                accountId: id,
                username: "",
                success: false,
                error: mapInstagramError(err),
              });
            }
          }),
        );
      } catch (err: unknown) {
        push({
          type: "fatal",
          success: false,
          error: mapInstagramError(err),
        });
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
