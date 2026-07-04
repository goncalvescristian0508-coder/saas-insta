/**
 * Insere tokens Apify do sistema no banco como userId='system'.
 * Uso: vercel env pull .env.seed && npx dotenv -e .env.seed -- npx tsx scripts/seed-apify-tokens.ts
 *
 * O script lê as chaves de um arquivo .apify-keys.txt (uma chave por linha)
 * OU do transcript da conversa Claude se a variável TRANSCRIPT_PATH for definida.
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SYSTEM_USER_ID = "system";

function extractTokensFromTranscript(transcriptPath: string): string[] {
  const content = fs.readFileSync(transcriptPath, "utf-8");
  const matches = content.match(/apify_api_[a-zA-Z0-9]{35,}/g) ?? [];
  const tokenSet = new Set(matches);
  // Remove tokens that are prefix of another (partial matches from grep output)
  return [...tokenSet].filter((t) => ![...tokenSet].some((o) => o !== t && o.startsWith(t)));
}

function extractTokensFromFile(filePath: string): string[] {
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  return lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("apify_api_") && l.length >= 20);
}

async function main() {
  let tokens: string[] = [];

  const transcriptPath = process.env.TRANSCRIPT_PATH;
  const keysFile = path.join(process.cwd(), ".apify-keys.txt");

  if (transcriptPath && fs.existsSync(transcriptPath)) {
    tokens = extractTokensFromTranscript(transcriptPath);
    console.log(`Extraídas ${tokens.length} chaves do transcript`);
  } else if (fs.existsSync(keysFile)) {
    tokens = extractTokensFromFile(keysFile);
    console.log(`Lidas ${tokens.length} chaves de .apify-keys.txt`);
  } else {
    console.error(
      "Nenhuma fonte de tokens encontrada.\n" +
      "Crie um arquivo .apify-keys.txt com uma chave Apify por linha, ou\n" +
      "defina TRANSCRIPT_PATH apontando para o arquivo .jsonl da conversa."
    );
    process.exit(1);
  }

  if (tokens.length === 0) {
    console.error("Nenhum token encontrado.");
    process.exit(1);
  }

  // Remove tokens existentes do sistema
  const deleted = await prisma.userApifyToken.deleteMany({ where: { userId: SYSTEM_USER_ID } });
  if (deleted.count > 0) console.log(`Removidos ${deleted.count} tokens antigos`);

  // Insere novos
  let inserted = 0;
  for (const token of tokens) {
    await prisma.userApifyToken.create({
      data: { userId: SYSTEM_USER_ID, token, label: "system-auto", isActive: true },
    });
    inserted++;
  }

  console.log(`✓ Inseridos ${inserted} tokens Apify de sistema no banco`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
