import "reflect-metadata";
import { readFile } from "fs/promises";
import {
  IgApiClient,
  IgCheckpointError,
  IgInactiveUserError,
  IgLoginBadPasswordError,
  IgLoginInvalidUserError,
  IgLoginTwoFactorRequiredError,
  IgRequestsLimitError,
  IgResponseError,
  IgSentryBlockError,
} from "instagram-private-api";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { extractVideoCoverJpeg } from "@/lib/videoCover";
import { getMetaOAuthConfig } from "@/lib/metaInstagramEnv";
import { publishReelFromBuffer, publishReelFromVideoUrl } from "@/lib/instagramGraphPublish";
import type { PrismaClient } from "@prisma/client";

export function mapInstagramError(err: unknown): string {
  if (err instanceof IgCheckpointError) {
    return "O Instagram pediu verificação de segurança (checkpoint). Confirme no app oficial no celular e tente novamente.";
  }
  if (err instanceof IgLoginTwoFactorRequiredError) {
    return "Esta conta tem 2FA. O login automatizado não conclui o segundo fator — use sessão já autenticada ou desative 2FA temporariamente.";
  }
  if (err instanceof IgLoginBadPasswordError) {
    return "Usuário ou senha incorretos.";
  }
  if (err instanceof IgLoginInvalidUserError) {
    return "Usuário inválido ou conta não encontrada.";
  }
  if (err instanceof IgInactiveUserError) {
    return "Conta inativa, desativada ou banida.";
  }
  if (err instanceof IgRequestsLimitError) {
    return "Limite de requisições do Instagram. Aguarde e tente mais tarde.";
  }
  if (err instanceof IgSentryBlockError) {
    return "Ação bloqueada pelo Instagram. Reduza o volume de postagens ou aguarde.";
  }
  if (err instanceof IgResponseError) {
    const m = err.message || "Erro da API do Instagram.";
    if (/feedback_required|login_required/i.test(m)) {
      return "Sessão expirada ou conta com restrição. Faça login de novo nas configurações da conta.";
    }
    if (/challenge_required/i.test(m)) {
      return "Instagram pediu verificação de segurança. Abra o app no celular, confirme o login suspeito e tente novamente.";
    }
    return `Erro Instagram: ${m}`;
  }
  if (err instanceof Error) return `Erro: ${err.message}`;
  return "Erro desconhecido ao falar com o Instagram.";
}

async function persistSession(
  prisma: PrismaClient,
  id: string,
  ig: IgApiClient,
): Promise<void> {
  const serialized = await ig.state.serialize();
  await prisma.privateInstagramAccount.update({
    where: { id },
    data: {
      sessionJson: JSON.stringify(serialized),
      lastError: null,
    },
  });
}

export async function createIgClientFromRow(
  prisma: PrismaClient,
  id: string,
): Promise<IgApiClient> {
  const row = await prisma.privateInstagramAccount.findUnique({
    where: { id },
  });
  if (!row) throw new Error("Conta não encontrada.");

  const ig = new IgApiClient();
  ig.state.generateDevice(row.username);

  if (row.sessionJson) {
    try {
      await ig.state.deserialize(JSON.parse(row.sessionJson));
      await ig.account.currentUser();
      return ig;
    } catch {
      /* sessão inválida — novo login */
    }
  }

  const password = decryptAccountPassword(row.passwordEnc);
  await ig.simulate.preLoginFlow();
  await ig.account.login(row.username, password);
  await ig.simulate.postLoginFlow();
  await persistSession(prisma, id, ig);
  return ig;
}

export async function validateLoginAndSerialize(
  username: string,
  password: string,
): Promise<string> {
  const ig = new IgApiClient();
  ig.state.generateDevice(username);
  try {
    await ig.account.login(username, password);
  } catch (err) {
    // retry with simulation flow if direct login fails
    ig.state.generateDevice(username + "_retry");
    await ig.simulate.preLoginFlow();
    await ig.account.login(username, password);
    await ig.simulate.postLoginFlow();
  }
  const serialized = await ig.state.serialize();
  return JSON.stringify(serialized);
}

export async function postarReel(
  username: string,
  password: string,
  videoPath: string,
  caption: string,
  sessionJson?: string | null,
): Promise<{ success: boolean; username: string; error?: string }> {
  try {
    const ig = new IgApiClient();
    ig.state.generateDevice(username);
    if (sessionJson) {
      await ig.state.deserialize(JSON.parse(sessionJson));
      try {
        await ig.account.currentUser();
      } catch {
        await ig.simulate.preLoginFlow();
        await ig.account.login(username, password);
        await ig.simulate.postLoginFlow();
      }
    } else {
      await ig.simulate.preLoginFlow();
      await ig.account.login(username, password);
      await ig.simulate.postLoginFlow();
    }

    const videoBuffer = await readFile(videoPath);
    const coverImage = await extractVideoCoverJpeg(videoBuffer);

    await ig.publish.video({
      video: videoBuffer,
      coverImage,
      caption: caption || "",
    });

    return { success: true, username };
  } catch (error: unknown) {
    return {
      success: false,
      username,
      error: mapInstagramError(error),
    };
  }
}

export async function postarReelBuffer(
  prisma: PrismaClient,
  accountId: string,
  videoBuffer: Buffer,
  caption: string,
  videoUrl?: string,
): Promise<{ success: boolean; username: string; error?: string }> {
  const oauthRow = await prisma.instagramOAuthAccount.findUnique({
    where: { id: accountId },
  });
  if (oauthRow) {
    try {
      const accessToken = decryptAccountPassword(oauthRow.accessTokenEnc);

      // Use the public URL directly (Supabase Storage) — no disk write needed
      if (videoUrl) {
        const result = await publishReelFromVideoUrl({
          igUserId: oauthRow.instagramUserId,
          accessToken,
          videoUrl,
          caption,
        });
        if (!result.ok) {
          await prisma.instagramOAuthAccount.update({
            where: { id: accountId },
            data: { lastError: result.error ?? null },
          });
          return { success: false, username: oauthRow.username, error: result.error };
        }
        await prisma.instagramOAuthAccount.update({
          where: { id: accountId },
          data: { lastError: null },
        });
        return { success: true, username: oauthRow.username };
      }

      const { publicBaseUrl } = getMetaOAuthConfig();
      const base =
        publicBaseUrl ||
        (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
      const r = await publishReelFromBuffer({
        igUserId: oauthRow.instagramUserId,
        accessToken,
        videoBuffer,
        caption,
        publicBaseUrl: base,
        username: oauthRow.username,
      });
      if (!r.success) {
        await prisma.instagramOAuthAccount.update({
          where: { id: accountId },
          data: { lastError: r.error ?? null },
        });
      } else {
        await prisma.instagramOAuthAccount.update({
          where: { id: accountId },
          data: { lastError: null },
        });
      }
      return {
        success: r.success,
        username: oauthRow.username,
        error: r.error,
      };
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Erro na API do Instagram.";
      await prisma.instagramOAuthAccount.update({
        where: { id: accountId },
        data: { lastError: msg },
      });
      return { success: false, username: oauthRow.username, error: msg };
    }
  }

  const row = await prisma.privateInstagramAccount.findUnique({
    where: { id: accountId },
  });
  if (!row) {
    return { success: false, username: "", error: "Conta não encontrada." };
  }

  try {
    const ig = await createIgClientFromRow(prisma, accountId);
    const coverImage = await extractVideoCoverJpeg(videoBuffer);

    await ig.publish.video({
      video: videoBuffer,
      coverImage,
      caption: caption || "",
    });

    await persistSession(prisma, accountId, ig);
    return { success: true, username: row.username };
  } catch (error: unknown) {
    const msg = mapInstagramError(error);
    await prisma.privateInstagramAccount.update({
      where: { id: accountId },
      data: { lastError: msg },
    });
    return { success: false, username: row.username, error: msg };
  }
}

export async function postarEmMassa(
  prisma: PrismaClient,
  contas: { id: string }[],
  videoBuffer: Buffer,
  caption: string,
): Promise<
  Array<{ success: boolean; username: string; accountId: string; error?: string }>
> {
  const resultados = await Promise.all(
    contas.map(async (conta) => {
      const r = await postarReelBuffer(prisma, conta.id, videoBuffer, caption);
      return {
        accountId: conta.id,
        username: r.username,
        success: r.success,
        error: r.error,
      };
    }),
  );
  return resultados;
}

export async function publishStoryPrivate(params: {
  prisma: PrismaClient;
  accountId: string;
  mediaUrl: string;
  isVideo: boolean;
  link?: string;
}): Promise<{ ok: boolean; username: string; error?: string }> {
  const row = await params.prisma.privateInstagramAccount.findUnique({ where: { id: params.accountId } });
  if (!row) return { ok: false, username: "", error: "Conta não encontrada." };

  try {
    const ig = await createIgClientFromRow(params.prisma, params.accountId);

    const mediaRes = await fetch(params.mediaUrl);
    if (!mediaRes.ok) throw new Error("Falha ao baixar mídia para story.");
    const mediaBuffer = Buffer.from(await mediaRes.arrayBuffer());

    if (params.isVideo) {
      const coverImage = await extractVideoCoverJpeg(mediaBuffer);
      await ig.publish.story({ video: mediaBuffer, coverImage, link: params.link });
    } else {
      await ig.publish.story({ file: mediaBuffer, link: params.link });
    }

    await persistSession(params.prisma, params.accountId, ig);
    return { ok: true, username: row.username };
  } catch (err: unknown) {
    const msg = mapInstagramError(err);
    await params.prisma.privateInstagramAccount.update({ where: { id: params.accountId }, data: { lastError: msg } });
    return { ok: false, username: row.username, error: msg };
  }
}
