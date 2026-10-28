# MarketPulse — Arquitetura, provedores e custos

## 1. Visão geral

```
iPhone (PWA instalada) ──HTTPS──▶ Next.js 16 (App Router, Vercel)
   │  Service Worker (push)            │
   │                                   ├─ proxy.ts ........ sessão assinada (JWT HS256, cookie httpOnly)
   ▼                                   ├─ app/api/* ....... rotas protegidas
 APNs/Web Push ◀── web-push (VAPID) ◀──┤
                                       ├─ lib/market ...... Twelve Data (cotações, candles) + FRED (juros)
                                       ├─ lib/calendar .... Forex Factory JSON | Trading Economics | FMP
                                       ├─ lib/news ........ RSS/Atom (Fed, BLS, FXStreet, ForexLive, CNBC, Investing)
                                       ├─ lib/analysis .... Anthropic (Claude) com saída estruturada (Zod)
                                       ├─ lib/notifications regras puras + envio + histórico
                                       ├─ lib/jobs/tick ... job a cada minuto (Vercel Cron ou externo)
                                       └─ lib/kv .......... Upstash Redis (REST) — cache, dedup, inscrições, prefs
```

Módulos independentes (cada um com cache próprio e fallback "stale"):

| Módulo | Pasta | Responsabilidade |
|---|---|---|
| Market Data Service | `lib/market/` | cotações, candles, orçamento de créditos, proxy ETF, indicadores técnicos |
| Economic Calendar Service | `lib/calendar/` | sync, normalização, ids estáveis, status, detecção de resultados/revisões, glossário |
| News Service | `lib/news/` | agregação RSS, classificação por tema/ativo |
| Analysis Engine | `lib/analysis/` | retrato de dados → IA → validação → persistência; guardas de dados incompletos |
| Notification Service | `lib/notifications/` | regras (puras, testadas), envio Web Push, dedup, histórico |
| Preferences Service | `lib/prefs/` | sanitização; LocalStorage no cliente + cópia no servidor para os jobs |
| Scheduled Jobs | `lib/jobs/tick.ts` | orquestração com lock, idempotente |

## 2. Provedores de dados (verificados quanto a custo e direitos de uso)

### Cotações e candles — Twelve Data (padrão)
- **Custo:** plano Basic gratuito: 800 créditos/dia, 8 créditos/minuto. Planos pagos a partir de ~US$ 29/mês ampliam limites e incluem índices à vista.
- **Cobertura no gratuito:** Forex (EUR/USD etc.), metais (XAU/USD, XAG/USD), ações/ETFs dos EUA (SPY, QQQ, DIA, UUP). Índices à vista (SPX, NDX, DJI, DXY) podem exigir plano pago; o app tenta o índice e **cai automaticamente para o ETF equivalente, rotulado como "proxy"**.
- **Atualização:** forex/metais em tempo quase real; ETFs com atraso de bolsa conforme plano.
- **Direitos:** uso pessoal permitido; sem redistribuição. Chave fica apenas no servidor.
- **Orçamento no app:** `MARKET_CREDITS_PER_MINUTE` (padrão 8) limita as chamadas por minuto (contador no Redis). Cotações cacheadas por 120 s, candles intraday por 15 min e diários por 1 h. Estimativa com 11 ativos e uso ativo de ~2 h/dia: ~400–600 créditos/dia.
- **Limitação honesta:** NAS100/US30/SPX500 "de corretora" são CFDs; o índice à vista/ETF difere em alguns pontos e não negocia 24 h. A UI avisa.

### Juros americanos — FRED (opcional)
- Gratuito com chave; séries DGS10, DGS2, DFII10 (diárias, defasagem de ~1 dia útil). Para yields intraday seria necessário provedor pago (ex.: Twelve Data Pro, Polygon). Sem a chave, a análise registra "juros indisponíveis".

### Calendário econômico
| Provedor | Custo | Cobertura | Resultados divulgados | Observação |
|---|---|---|---|---|
| **Forex Factory (feed JSON `ff_calendar_thisweek/nextweek`)** — padrão | gratuito, sem chave | semana atual + próxima, todas as moedas G10 | anterior/previsão sempre; campo `actual` é detectado automaticamente se presente | horários em ISO com offset (DST dos EUA já aplicado) |
| Trading Economics | pago para EUA/Europa (conta gratuita cobre poucos países) | global, 2 semanas à frente ou mais | sim, com revisões (`Revised`) | datas em UTC |
| Financial Modeling Prep | depende do plano | global | sim | verifique se o seu plano inclui `economic-calendar` |

Escolha com `CALENDAR_PROVIDER`. Se o provedor não publicar resultados, o app marca os eventos passados como **"indisponível"** em vez de fingir que foram divulgados, e os alertas de resultado/surpresa não disparam (a UI explica).

### Notícias — RSS (gratuito)
Fontes oficiais (Federal Reserve, BLS) e de mercado (FXStreet, ForexLive, CNBC, Investing.com). Apenas manchete, link, fonte e horário — uso compatível com os termos dos feeds públicos. Configurável em `NEWS_FEEDS`. Sem provedor pago de notícias (Reuters/Bloomberg exigem licença).

### Inteligência artificial — Anthropic Claude
- Modelo padrão `claude-opus-5-5` (US$ 4 / US$ 20 por milhão de tokens de entrada/saída; leitura de cache US$ 0,20). Alternativa mais barata: `claude-sonnet-5-5` (US$ 2 / US$ 10).
- Uma rodada analisa todos os ativos + Market Intelligence + sessões do ouro em **uma única chamada** (~6–9 k tokens de entrada, ~4–6 k de saída). Custo por rodada ≈ US$ 0,10–0,15 (Opus) ou ≈ US$ 0,05–0,08 (Sonnet). O prompt de sistema usa cache.
- Frequência padrão: a cada 120 min com mercado aberto (~12/dia ≈ US$ 1,5/dia no Opus) + 1 rodada ~10 min após divulgações de alto impacto + atualizações manuais (mín. 5 min entre elas). Ajustável em Configurações.
- O modelo recebe **apenas dados reais** do retrato e é instruído a não inventar níveis, probabilidades ou previsões. A saída é validada com Zod; ativos sem cotação/técnico são forçados a "indefinido".
- Fallback automático de recusa (`fallbacks: "default"`) está habilitado.

### Armazenamento — Upstash Redis (Vercel Marketplace)
Plano gratuito (10 k comandos/dia) é suficiente para uso pessoal com cron a cada minuto? Estimativa: ~15–25 comandos por tick × 1440 ≈ 20–35 k/dia → **use o plano Pay-as-you-go (~US$ 0,2/100 k comandos)** ou cron a cada 2–5 minutos para ficar dentro do gratuito. Sem Redis, o app roda em memória (somente dev).

### Web Push
Gratuito (APNs via Safari/WebKit). Requer iOS 16.4+, app adicionado à Tela de Início e HTTPS. O iOS pode atrasar/agrupar entregas; o app não promete entrega no segundo exato.

### Hospedagem — Vercel
- **Hobby:** Cron Jobs limitados a 1 execução/dia → use um agendador externo gratuito (cron-job.org, Upstash QStash) chamando `GET /api/cron/tick?secret=CRON_SECRET` a cada minuto.
- **Pro:** `vercel.json` já agenda `* * * * *`. `maxDuration` das rotas de análise/cron = 300 s.

## 3. Fluxo do job automático (`/api/cron/tick`)
1. Lock no Redis (evita execuções sobrepostas).
2. Sincroniza o calendário (TTL 10 min; 90 s quando há evento importante em ±2 h) e detecta resultados novos e revisões.
3. Alertas pré-evento: janela `[lead−4, lead]` minutos, dedup por `evento+antecedência`.
4. Resultados/surpresas/revisões: dedup por evento (+valor na revisão). Surpresa = desvio ≥10 % da previsão ou inversão de sinal.
5. Aquece cotações/candles dentro do orçamento de créditos (só com mercado aberto).
6. Análise agendada ou pós-evento; mudança de viés notificada apenas quando confirmada por nova análise com dados completos/parciais.
7. Volatilidade extrema (ATR H1 ≥ 1,8× média) — 1 alerta por ativo a cada 4 h.

## 4. Segurança
- Login único com senha (`APP_PASSWORD`), comparação em tempo constante, limite de 8 tentativas/15 min por IP.
- Cookie `mp_session` httpOnly/secure/sameSite=lax, JWT HS256 (`AUTH_SECRET`), 30 dias.
- `proxy.ts` bloqueia todas as páginas e APIs sem sessão (exceto login, cron com `CRON_SECRET`, manifest, SW, ícones).
- Nenhuma chave de API chega ao cliente; cabeçalhos de segurança em `next.config.ts`.

## 5. Fusos e horário de verão
Eventos são guardados em ISO UTC a partir do offset informado pelo provedor (que já aplica o DST americano). A exibição usa `Intl` com `America/Sao_Paulo` (sem horário de verão desde 2019) ou o fuso escolhido nas Configurações. Testes cobrem a conversão EDT/EST → BRT.
