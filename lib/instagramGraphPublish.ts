import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { getMetaOAuthConfig } from "@/lib/metaInstagramEnv";

const GRAPH = "https://graph.instagram.com/v21.0";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type GraphPublishResult = {
  success: boolean;
  username: string;
  error?: string;
};

export async function exchangeCodeForShortLivedToken(
  code: string,
): Promise<{ access_token: string; user_id: string }> {
  const { appId, appSecret } = getMetaOAuthConfig();
  const redirectUri = "https://saas-insta.vercel.app/api/instagram/oauth/callback";
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID ou META_APP_SECRET ausentes.");
  }

  const body = new URLSearchParams();
  body.append("client_id", appId);
  body.append("client_secret", appSecret);
  body.append("grant_type", "authorization_code");
  body.append("redirect_uri", redirectUri);
  body.append("code", code);

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  });

  const data = (await res.json()) as Record<string, unknown>;
  console.log("Status:", res.status);
  console.log("Response:", JSON.stringify(data));
  const errMsg =
    (data.error_message as string) ||
    (typeof data.error === "string"
      ? data.error
      : (data.error as { message?: string } | undefined)?.message);
  if (!res.ok || errMsg) {
    throw new Error(`${errMsg || JSON.stringify(data)} | URI usada: "${redirectUri}"`);
  }

  const access_token = data.access_token as string;
  const rawId = data.user_id;
  const user_id =
    typeof rawId === "number" ? String(rawId) : String(rawId ?? "");

  if (!access_token || !user_id) {
    throw new Error("Resposta OAuth inválida (token ou user_id ausente).");
  }

  return { access_token, user_id };
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const { appSecret } = getMetaOAuthConfig();
  if (!appSecret) {
    throw new Error("META_APP_SECRET ausente.");
  }

  const u = new URL("https://graph.instagram.com/access_token");
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(u.toString());
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (data.error as { message?: string } | string) ||
      JSON.stringify(data);
    throw new Error(
      typeof msg === "object" && msg && "message" in msg
        ? String((msg as { message: string }).message)
        : String(msg),
    );
  }

  const access_token = data.access_token as string;
  const expires_in = Number(data.expires_in ?? 0);
  if (!access_token) {
    throw new Error("Long-lived token ausente na resposta.");
  }
  return { access_token, expires_in };
}

export async function fetchInstagramProfile(accessToken: string, userId?: string): Promise<{
  id: string;
  username: string;
  profile_picture_url?: string;
}> {
  async function tryNode(node: string) {
    const u = new URL(`${GRAPH}/${node}`);
    u.searchParams.set("fields", "id,username,profile_picture_url");
    u.searchParams.set("access_token", accessToken);
    const res = await fetch(u.toString());
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const err = data.error as { message?: string; code?: number } | undefined;
      throw new Error(err?.message || JSON.stringify(data));
    }
    return { id: String(data.id ?? ""), username: String(data.username ?? ""), profile_picture_url: data.profile_picture_url as string | undefined };
  }

  // Try user_id first; if it fails for any object/permission reason, fall back to /me
  if (userId) {
    try {
      return await tryNode(userId);
    } catch {
      // Always fall back to /me — if the token itself is invalid, /me will also fail and surface the real error
    }
  }

  return tryNode("me");
}

async function pollContainerReady(
  containerId: string,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  for (let i = 0; i < 90; i++) {
    const u = new URL(`${GRAPH}/${containerId}`);
    u.searchParams.set("fields", "status_code");
    u.searchParams.set("access_token", accessToken);

    const res = await fetch(u.toString());
    const data = (await res.json()) as {
      status_code?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      return { ok: false, error: data.error?.message || JSON.stringify(data) };
    }

    const code = data.status_code;
    if (code === "FINISHED") return { ok: true };
    if (code === "ERROR" || code === "EXPIRED") {
      return { ok: false, error: `Container status: ${code}` };
    }
    await sleep(1000);
  }
  return { ok: false, error: "Timeout aguardando processamento do vídeo." };
}

/**
 * Publica um Reel via Graph API. O vídeo precisa estar em uma URL HTTPS pública
 * (ex.: mesmo host com ngrok + arquivo em /public/uploads/...).
 */
export async function publishReelFromVideoUrl(params: {
  igUserId: string;
  accessToken: string;
  videoUrl: string;
  caption: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { igUserId, accessToken, videoUrl, caption } = params;

  const createUrl = new URL(`${GRAPH}/${igUserId}/media`);
  createUrl.searchParams.set("media_type", "REELS");
  createUrl.searchParams.set("video_url", videoUrl);
  createUrl.searchParams.set("caption", caption);
  createUrl.searchParams.set("access_token", accessToken);

  const createRes = await fetch(createUrl.toString(), { method: "POST" });
  const createData = (await createRes.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!createRes.ok || !createData.id) {
    return {
      ok: false,
      error:
        createData.error?.message ||
        (typeof createData === "object"
          ? JSON.stringify(createData)
          : "Falha ao criar container de mídia."),
    };
  }

  const containerId = createData.id;
  const polled = await pollContainerReady(containerId, accessToken);
  if (!polled.ok) {
    return { ok: false, error: polled.error || "Falha no processamento." };
  }

  const publishUrl = new URL(`${GRAPH}/${igUserId}/media_publish`);
  publishUrl.searchParams.set("creation_id", containerId);
  publishUrl.searchParams.set("access_token", accessToken);

  const pubRes = await fetch(publishUrl.toString(), { method: "POST" });
  const pubData = (await pubRes.json()) as { error?: { message?: string } };

  if (!pubRes.ok) {
    return {
      ok: false,
      error: pubData.error?.message || JSON.stringify(pubData),
    };
  }

  return { ok: true };
}

export async function publishReelFromBuffer(params: {
  igUserId: string;
  accessToken: string;
  videoBuffer: Buffer;
  caption: string;
  publicBaseUrl: string;
  username: string;
}): Promise<GraphPublishResult> {
  const { igUserId, accessToken, videoBuffer, caption, publicBaseUrl, username } =
    params;

  if (!publicBaseUrl || !publicBaseUrl.startsWith("https://")) {
    return {
      success: false,
      username,
      error:
        "NEXT_PUBLIC_APP_URL deve ser HTTPS público (ex.: ngrok) para a Meta baixar o vídeo.",
    };
  }

  const dir = join(process.cwd(), "public", "uploads", "oauth-reels");
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}.mp4`;
  const diskPath = join(dir, fileName);

  try {
    await writeFile(diskPath, videoBuffer);
    const videoUrl = `${publicBaseUrl.replace(/\/$/, "")}/uploads/oauth-reels/${fileName}`;
    const result = await publishReelFromVideoUrl({
      igUserId,
      accessToken,
      videoUrl,
      caption,
    });
    if (!result.ok) {
      return { success: false, username, error: result.error };
    }
    return { success: true, username };
  } catch (e: unknown) {
    return {
      success: false,
      username,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    try {
      await unlink(diskPath);
    } catch {
      /* arquivo já removido ou inexistente */
    }
  }
}
