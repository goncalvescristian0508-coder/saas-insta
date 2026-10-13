/** Esquemas (Zod) da saída estruturada do motor de análise. */
import { z } from 'zod';

export const BiasEnum = z.enum(['altista', 'baixista', 'neutro', 'indefinido']);
export type Bias = z.infer<typeof BiasEnum>;

export const AssetAnalysisSchema = z.object({
  symbol: z.string(),
  bias: BiasEnum,
  horizon: z.string().describe('Horizonte temporal da análise, ex.: "intraday (sessão de NY)" ou "1-3 dias"'),
  summary: z.string().describe('Resumo em 1-2 frases, em português'),
  reasons: z.array(z.string()).describe('Motivos que sustentam o cenário'),
  counterpoints: z.array(z.string()).describe('Fatores contrários'),
  catalysts: z.array(z.string()).describe('Eventos/dados que podem mudar a direção'),
  bullishConfirmation: z.array(z.string()).describe('Condições que confirmariam alta'),
  bearishConfirmation: z.array(z.string()).describe('Condições que confirmariam baixa'),
  keyLevelsNote: z.string().describe('Como usar os níveis técnicos fornecidos (sem inventar níveis)'),
  dataQuality: z.enum(['completa', 'parcial', 'insuficiente']),
});
export type AssetAnalysis = z.infer<typeof AssetAnalysisSchema>;

export const GoldSessionsSchema = z.object({
  asia: z.string(),
  london: z.string(),
  newyork: z.string(),
  breakoutConditions: z.array(z.string()),
  rejectionConditions: z.array(z.string()),
  dollarAndRates: z.string().describe('Leitura de força do dólar e juros para o ouro'),
});
export type GoldSessions = z.infer<typeof GoldSessionsSchema>;

export const MarketIntelligenceSchema = z.object({
  marketToday: z.string().describe('Como está o mercado hoje?'),
  importantNews: z.array(z.string()).describe('Notícias/eventos importantes previstos'),
  eventsImpactingAssets: z.array(z.string()).describe('Eventos que podem impactar os ativos monitorados, com horários em Brasília'),
  dollar: z.object({ reading: z.enum(['força', 'fraqueza', 'misto', 'indefinido']), rationale: z.string() }),
  risks: z.array(z.string()).describe('Principais riscos do dia'),
  regime: z.object({ label: z.enum(['compradores', 'vendedores', 'indefinido']), rationale: z.string() }),
});
export type MarketIntelligence = z.infer<typeof MarketIntelligenceSchema>;

export const AnalysisOutputSchema = z.object({
  intelligence: MarketIntelligenceSchema,
  assets: z.array(AssetAnalysisSchema),
  gold: GoldSessionsSchema.nullable(),
  disclaimer: z.string(),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

/** Resultado persistido (saída da IA + metadados de dados e fontes). */
export interface StoredAnalysis {
  id: string;
  generatedAt: string;
  model: string;
  trigger: 'scheduled' | 'manual' | 'event';
  output: AnalysisOutput;
  sources: { name: string; asOf: string; note?: string }[];
  dataWarnings: string[];
  technicals: Record<string, import('../market/technicals').TechnicalSnapshot>;
  usage?: { input: number; output: number; cacheRead?: number };
}
