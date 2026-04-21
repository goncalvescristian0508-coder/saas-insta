import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT = "wayne-ig-accounts-v1";

/**
 * Senhas precisam ser recuperáveis para o login na API não oficial.
 * Por isso usamos AES-256-GCM (criptografia simétrica), não bcrypt.
 */
function getKey(): Buffer {
  const secret = process.env.INSTAGRAM_ACCOUNTS_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "Defina INSTAGRAM_ACCOUNTS_SECRET no .env (mínimo 16 caracteres).",
    );
  }
  return scryptSync(secret, SALT, 32);
}

export function encryptAccountPassword(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptAccountPassword(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}
