# Gotham Automações

SaaS de automação de postagens em massa no Instagram. Permite que usuários conectem múltiplas contas do Instagram e postem vídeos em massa ou de forma agendada.

## 🚀 Funcionalidades

- **Inspirações:** busca reels de contas públicas do Instagram pelo @ usando Apify, e permite download dos vídeos sem metadados
- **Biblioteca:** armazena os vídeos baixados para uso nas postagens
- **Contas:** conecta contas do Instagram via OAuth oficial da Meta
- **Postagem em massa:** seleciona vídeos da biblioteca e posta em múltiplas contas simultaneamente
- **Agendamento:** agenda postagens com delay configurável e modo humanizado

## 🛠️ Stack Tecnológico

- **Next.js 16** com TypeScript
- **Prisma** com PostgreSQL (Neon)
- **Apify** para scraping de reels
- **FFmpeg** para remoção de metadados
- **Meta Graph API / Instagram OAuth** para postagem
- **Vercel** para deploy

## ⚙️ Configuração do Ambiente

Para rodar este projeto localmente, crie um arquivo `.env.local` na raiz do projeto e configure as seguintes variáveis de ambiente:

```env
APIFY_TOKENS=seu_token_apify
META_APP_ID=seu_instagram_app_id
META_APP_SECRET=seu_instagram_app_secret
META_REDIRECT_URI=sua_url_de_callback_oauth
INSTAGRAM_ACCOUNTS_SECRET=chave_secreta_para_criptografar_tokens
DATABASE_URL=sua_connection_string_do_banco_postgresql
NEXT_PUBLIC_APP_URL=sua_url_base_da_aplicacao
```
