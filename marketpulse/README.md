# MarketPulse

Plataforma pessoal de inteligência para trading (Forex, ouro/XAUUSD e índices americanos): painel de mercado, calendário econômico em horário de Brasília, análises com IA baseadas em dados reais, seção dedicada ao GOLD e **notificações Web Push no iPhone** com o app fechado.

> Documentação de arquitetura, provedores, custos e direitos de uso: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack
Next.js 16 (App Router, TypeScript) · React 19 · Tailwind CSS 4 · Lucide · Lightweight Charts · PWA (manifest + service worker) · Web Push (VAPID) · Anthropic Claude · Twelve Data · Forex Factory / Trading Economics / FMP · RSS · FRED · Upstash Redis · Vercel.

## Páginas
| Rota | Conteúdo |
|---|---|
| `/` | Dashboard: panorama dos ativos, Market Intelligence, eventos de hoje, últimos alertas |
| `/calendar` | Calendário econômico com filtros (hoje, amanhã, semana, 7 dias, moeda, impacto, ativo) e detalhes do evento |
| `/markets` e `/markets/[símbolo]` | Lista de ativos (adicionar/remover) e análise detalhada por ativo (gráfico M5–D1, níveis, viés, eventos, notícias) |
| `/gold` | Seção XAUUSD: cotação, gráfico, dólar e juros, cenários por sessão (Ásia/Londres/NY), rompimento/rejeição |
| `/news` | Central de notícias (RSS) por tema |
| `/notifications` | Histórico de alertas, marcar como lido, filtro por tipo e ativo |
| `/settings` | Push para iPhone (ativar, testar, guia), alertas, favoritos, moedas, impacto, antecedência, fuso, tema, frequência, status do sistema |

## Configuração

### 1. Dependências
```bash
cd marketpulse
npm install --legacy-peer-deps   # ou npm install
```

### 2. Variáveis de ambiente
Copie `.env.example` para `.env.local` e preencha. Mínimo para rodar: `APP_PASSWORD`, `AUTH_SECRET` (≥32 caracteres), `CRON_SECRET`.

| Variável | Para quê | Onde obter |
|---|---|---|
| `TWELVEDATA_API_KEY` | cotações e candles | https://twelvedata.com (gratuito: 800 créditos/dia) |
| `CALENDAR_PROVIDER` | `forexfactory` (padrão, sem chave) / `tradingeconomics` / `fmp` | — |
| `TRADINGECONOMICS_API_KEY`, `FMP_API_KEY` | calendário com resultados divulgados | sites dos provedores (pagos para EUA) |
| `FRED_API_KEY` | juros americanos (diário) | https://fred.stlouisfed.org (gratuito) |
| `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_EFFORT` | análises | https://console.anthropic.com |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push | `npm run vapid` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (ou `KV_REST_API_*`) | persistência | Vercel Marketplace → Upstash |
| `NEWS_FEEDS` | feeds RSS personalizados (`Nome\|URL,Nome\|URL`) | opcional |
| `NEXT_PUBLIC_APP_URL`, `APP_TIMEZONE` | URL pública e fuso de exibição | — |

Gerar segredos:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # AUTH_SECRET / CRON_SECRET
npm run vapid                                                                     # chaves VAPID
```

### 3. Rodar
```bash
npm run dev          # http://localhost:3100
npm run test         # testes das regras de alerta, calendário, técnicos e fuso
npm run lint && npm run typecheck && npm run build
```
Para testar push localmente use HTTPS (`next dev --experimental-https`) ou um túnel (ngrok). No iPhone o push só funciona com o app instalado na Tela de Início (iOS 16.4+).

Sem Redis configurado, o app usa memória volátil (só para desenvolvimento). Sem chaves de provedores, cada painel mostra claramente "indisponível/não configurado" — nunca dados fictícios.

## Deploy na Vercel
1. Importe o repositório e defina **Root Directory = `marketpulse`**.
2. Adicione a integração **Upstash Redis** (Marketplace) — as variáveis `KV_REST_API_*`/`UPSTASH_*` são injetadas automaticamente.
3. Cadastre as variáveis do `.env.example` em *Settings → Environment Variables* (`NEXT_PUBLIC_APP_URL` = URL do projeto).
4. **Cron:** `vercel.json` agenda `/api/cron/tick` a cada minuto (plano Pro). No plano Hobby (1 execução/dia) use um agendador externo gratuito, ex. cron-job.org: `GET https://SEU-APP.vercel.app/api/cron/tick?secret=CRON_SECRET` a cada 1–2 minutos.
5. Deploy. Abra no Safari do iPhone → Compartilhar → **Adicionar à Tela de Início** → abra pelo ícone → login → Configurações → **Ativar neste dispositivo** → **Enviar notificação de teste**.

## Como funcionam os alertas
- **Antes da notícia** (1 h / 30 / 15 / 5 min): para eventos das moedas e impactos escolhidos; cada combinação evento+antecedência é enviada uma única vez.
- **Resultado divulgado / surpresa / revisão:** exige provedor de calendário que publique resultados (Forex Factory inclui `actual` quando disponível; TE/FMP sempre). Surpresa = desvio ≥10 % da previsão ou inversão de sinal; o texto explica a leitura típica para dólar/ouro.
- **Mudança de viés:** apenas quando uma nova análise com dados completos/parciais muda o viés do ativo.
- **Volatilidade extrema:** ATR H1 ≥ 1,8× a média recente (1 alerta por ativo a cada 4 h).
- O job registra tentativas, remove inscrições expiradas (404/410/403) e evita duplicidade com chaves no Redis. A entrega depende do iOS/APNs e pode atrasar alguns segundos.

## Limitações conhecidas (sem fingir que funciona)
- **Índices (NAS100/US30/SPX500/DXY):** se o plano do Twelve Data não incluir o índice à vista, o app usa o ETF equivalente (QQQ/DIA/SPY/UUP) rotulado como *proxy*. Preços diferem dos CFDs da corretora.
- **Resultados do calendário:** dependem do provedor; sem eles o status fica "indisponível" e os alertas de resultado não disparam.
- **Juros intraday:** FRED é diário; yields intraday exigem provedor pago.
- **Notícias:** só manchetes/links de feeds RSS públicos; sem Reuters/Bloomberg.
- **IA:** nunca gera probabilidades numéricas nem promete movimentos; o viés é leitura condicional, não sinal de compra/venda.
- **Formatos de API:** os parsers foram escritos a partir da documentação pública dos provedores e são defensivos; na primeira execução confira `/settings` → *Status do sistema* e os logs da Vercel.

## Estrutura
```
app/            páginas (App Router) e rotas /api
components/     UI (shell, cards, gráfico, calendário, push)
lib/market      Twelve Data, FRED, indicadores técnicos
lib/calendar    provedores, normalização, glossário, serviço
lib/news        RSS
lib/analysis    retrato de dados, prompt, esquema, motor
lib/notifications regras (puras), push, histórico, serviço
lib/jobs        tick (cron)
lib/prefs       preferências
public/sw.js    service worker (push, offline)
docs/           arquitetura e custos
```
