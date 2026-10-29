# Vídeo: Limite em dobro (MAIS Card)

## v2 (atual): horizontal 16:9, voz feminina, 47 s

| Arquivo | Uso |
|---|---|
| `mais-card-limite-em-dobro-16x9.mp4` | H.264 + AAC, 1920x1080, 30 fps, 47 s. |
| `mais-card-limite-em-dobro-16x9.webm` | VP9 + Opus, mais leve. Use como primeira `<source>`. |
| `poster-16x9.png` | Frame final para o atributo `poster`. |
| `contact-sheet-16x9.png` | Um frame a cada 2,35 s, para revisão. |
| `roteiro-v2.md` | Roteiro aprovado, com tempos e narração. |

Diferenças para a v1: formato horizontal, voz feminina com sotaque brasileiro (voz
masculina pt-BR do Piper convertida para feminina com o "Change gender" do Praat,
ver `src/fem.py`; a voz Kokoro "Dora" foi descartada por soar portuguesa), "MAIS Card" falado "Mais Cárdi", sem a palavra "bônus", ritmo mais rápido
(cortes a cada 1,5 a 2 s, zoom nos toques, telas deslizando), e o fluxo completo:
cadastro em 3 telas, conta em análise, notificação de aprovação, investimento de
R$ 500 via Pix, 7 dias, limite em dobro e resgate do saldo investido.

Fontes da v2 em `src/`: `comp16.html` (animação), `render16.js`, `encode16.sh`,
`synth2.js` (trilha a 122 BPM e efeitos), `capture3.js` (telas de documento, selfie e
"cadastro enviado"), `narracao-v2.json`, `make_lexicon.py` (gera o léxico pt-BR com
espeak para o Kokoro) e `kokoro_tts.py` (síntese; precisa do modelo
`kokoro-multi-lang-v1_0` do sherpa-onnx, voz id 42).

## v1: vertical 9:16, voz masculina, 32,5 s

Vídeo para a landing page da promoção "limite em dobro": guarde até R$ 500 na
Caixinha Garantia, deixe 7 dias e libere R$ 1.000 de limite. Resgate antes dos
7 dias cancela o bônus.

## Arquivos

| Arquivo | Uso |
|---|---|
| `mais-card-limite-em-dobro-9x16.mp4` | H.264 + AAC, 1080x1920, 30 fps, 32,5 s. Compatível com qualquer navegador. |
| `mais-card-limite-em-dobro-9x16.webm` | VP9 + Opus, mais leve. Use como primeira `<source>`. |
| `poster.png` | Frame final, para o atributo `poster` do `<video>`. |
| `contact-sheet.png` | Um frame a cada 2,5 s, para revisão rápida. |

Exemplo de uso na landing page:

```html
<video autoplay muted loop playsinline poster="poster.png">
  <source src="mais-card-limite-em-dobro-9x16.webm" type="video/webm">
  <source src="mais-card-limite-em-dobro-9x16.mp4" type="video/mp4">
</video>
```

O vídeo tem narração. Com `autoplay`, o navegador exige `muted`; mostre um botão
de "ativar som" se a narração for importante no contexto da página.

## Roteiro e narração

| Tempo | Cena | Narração |
|---|---|---|
| 0,0–3,2 s | Gancho "Seu limite em dobro." | Seu limite em dobro, no MAIS Card. |
| 3,2–7,6 s | Passo 1, tela real de cadastro sendo preenchida | Funciona assim: você cria a sua conta em poucos minutos. |
| 7,6–12,6 s | Passo 2, Caixinha Garantia, toque em R$ 500 e em "Guardar via Pix" | Depois, guarda até quinhentos reais na Caixinha Garantia, via Pix. |
| 12,6–17,2 s | Passo 3, contador de 7 dias com a tela do cartão (Dia 0, Dia 3, Limite ativo) | Deixa o dinheiro lá por sete dias, rendendo cem por cento do CDI. |
| 17,2–22,4 s | Payoff em amarelo: R$ 500 → R$ 1.000, selo "Liberado" | Completou os sete dias? Seu limite é liberado em dobro: mil reais de limite. |
| 22,4–26,8 s | Regra: dias 1 a 4 e X no dia 5, "O bônus não vale." | Mas atenção: se resgatar antes dos sete dias, o bônus não vale. |
| 26,8–32,5 s | CTA: "Guardou. Esperou. Dobrou.", cartão, botão "Ativar meu limite" | Guardou, esperou, dobrou. Baixe o MAIS Card e ative o seu limite. |

## Como foi feito (reproduzível)

Tudo em `src/`:

1. `capture.js` e `capture2.js` abrem o protótipo do app no Chromium (Playwright)
   com a fonte Nunito local, preenchem o cadastro, escolhem R$ 500 na Caixinha e
   fotografam os estados do cartão (Dia 0, Dia 3 e Limite ativo). Os PNGs estão em
   `src/shots/`.
2. `comp.html` é a animação. Cada frame é função pura do tempo (`seek(t)`), sem
   `setTimeout` ou transições CSS, então o render é determinístico.
3. `render.js` captura os 975 frames a 30 fps. `encode.sh` monta MP4 e WebM.
4. `narracao.json` e `tts.py` geram a voz com Piper (voz pt-BR `faber-medium`,
   roda offline). `synth.js` gera a trilha e os efeitos (toques, swoosh, sino,
   alerta) por síntese, sem músicas de terceiros, então não há risco de direitos
   autorais na trilha. O mix final está normalizado em -16 LUFS (é a faixa de áudio do MP4).

Para trocar um texto ou um tempo, edite `comp.html`, rode `node render.js` e
`./encode.sh`. Para trocar a narração, edite `narracao.json`, rode `tts.py` e
refaça o mix (comando no histórico do `encode.sh`).

## Atenção: texto do app

O protótipo do app diz que o limite é **igual** ao valor guardado ("Seu limite
será R$ 500,00 · igual ao valor guardado"), enquanto a promoção promete o
**dobro**. Essa frase aparece de relance na cena do Passo 2. Vale atualizar o
copy do app antes de publicar, ou pedir uma versão do vídeo sem esse trecho.
