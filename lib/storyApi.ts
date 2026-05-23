const STORY_API_URL = process.env.STORY_API_URL ?? "";
const STORY_API_SECRET = process.env.STORY_API_SECRET ?? "";

export interface StoryApiResult {
  ok: boolean;
  session?: Record<string, unknown>;
  error?: string;
}

export async function loginViaApi(params: {
  username: string;
  password: string;
  proxyUrl?: string;
  session?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; session?: Record<string, unknown>; error?: string }> {
  if (!STORY_API_URL) {
    return { ok: false, error: "STORY_API_URL não configurado." };
  }

  let res: Response;
  try {
    res = await fetch(`${STORY_API_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secret": STORY_API_SECRET,
      },
      body: JSON.stringify({
        username: params.username,
        password: params.password,
        proxy_url: params.proxyUrl ?? null,
        session: params.session ?? null,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    return { ok: false, error: `Falha ao conectar ao story-api: ${err instanceof Error ? err.message : err}` };
  }

  const json = await res.json().catch(() => ({})) as Record<string, unknown>;

  if (!res.ok) {
    return { ok: false, error: (json.detail as string) ?? `Erro ${res.status}` };
  }

  return { ok: true, session: json.session as Record<string, unknown> };
}

export async function postStoryViaApi(params: {
  username: string;
  password: string;
  mediaUrl: string;
  isVideo: boolean;
  linkUrl?: string;
  proxyUrl?: string;
  session?: Record<string, unknown> | null;
}): Promise<StoryApiResult> {
  if (!STORY_API_URL) {
    return { ok: false, error: "STORY_API_URL não configurado." };
  }

  const body = {
    username: params.username,
    password: params.password,
    media_url: params.mediaUrl,
    is_video: params.isVideo,
    link_url: params.linkUrl ?? null,
    proxy_url: params.proxyUrl ?? null,
    session: params.session ?? null,
  };

  let res: Response;
  try {
    res = await fetch(`${STORY_API_URL}/story`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secret": STORY_API_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (err) {
    return { ok: false, error: `Falha ao conectar ao story-api: ${err instanceof Error ? err.message : err}` };
  }

  const json = await res.json().catch(() => ({})) as Record<string, unknown>;

  if (!res.ok) {
    return { ok: false, error: (json.detail as string) ?? `Erro ${res.status}` };
  }

  return { ok: true, session: json.session as Record<string, unknown> };
}
