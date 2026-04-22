export const metadata = { title: "Política de Privacidade – Wayne Automations" };

const APP = "Wayne Automations";
const URL = "https://saas-insta.vercel.app";
const EMAIL = "goncalvescristian0508@gmail.com";

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#060810 0%,#0a0e1a 100%)", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", padding: "0 1rem" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "4rem 0" }}>

        <a href={URL} style={{ color: "#c9a227", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 }}>← {APP}</a>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, marginTop: "1.5rem", marginBottom: ".5rem", color: "#fff" }}>Política de Privacidade</h1>
        <p style={{ color: "#64748b", fontSize: ".9rem", marginBottom: "3rem" }}>Última atualização: 21 de abril de 2025</p>

        {[
          ["1. Quem somos", `${APP} (${URL}) é uma plataforma SaaS que permite automatizar e agendar publicações no Instagram via API oficial da Meta. Ao usar o serviço, você concorda com esta Política de Privacidade.`],
          ["2. Dados que coletamos", "• Conta: endereço de e-mail e senha (armazenada com hash seguro pelo Supabase Auth).\n• Conta do Instagram (OAuth): nome de usuário (@), ID de usuário do Instagram e token de acesso (criptografado em repouso). Não armazenamos senha do Instagram.\n• Conteúdo: vídeos que você faz upload na Biblioteca, legendas e configurações de agendamento.\n• Logs de uso: status de postagens (sucesso/falha), mensagens de erro da API do Instagram."],
          ["3. Como usamos seus dados", "• Publicar conteúdo no Instagram em seu nome, conforme você configurar.\n• Gerenciar sua sessão autenticada e proteger sua conta.\n• Exibir histórico de postagens e status no painel.\n\nNão vendemos, alugamos nem compartilhamos seus dados com terceiros para fins comerciais."],
          ["4. Permissões do Instagram", "Solicitamos as seguintes permissões via Meta / Instagram:\n• instagram_basic — ler informações básicas do perfil (nome de usuário, ID).\n• instagram_content_publish — publicar Reels e fotos em seu perfil.\n\nEssas permissões são usadas exclusivamente para as funções descritas nesta política. Você pode revogar o acesso a qualquer momento em Configurações > Aplicativos e Sites no Instagram."],
          ["5. Armazenamento e segurança", "• Dados armazenados em servidores Supabase (PostgreSQL + Storage) com criptografia em trânsito (TLS) e em repouso.\n• Tokens de acesso do Instagram são criptografados com AES-256 antes de serem salvos.\n• Vídeos da Biblioteca ficam em bucket do Supabase Storage acessível apenas por você."],
          ["6. Retenção de dados", "Seus dados são mantidos enquanto sua conta estiver ativa. Ao excluir sua conta, removemos seus dados pessoais e conteúdo dentro de 30 dias, salvo obrigação legal em contrário."],
          ["7. Exclusão de dados", `Para solicitar a exclusão dos seus dados (conforme exigido pela Meta), envie um e-mail para ${EMAIL} com o assunto "Exclusão de dados". Também disponibilizamos um endpoint automático de exclusão em conformidade com a política da Meta.`],
          ["8. Cookies", "Utilizamos apenas cookies estritamente necessários para manter sua sessão autenticada. Não usamos cookies de rastreamento ou publicidade."],
          ["9. Seus direitos", `Você tem direito a acessar, corrigir ou excluir seus dados a qualquer momento. Entre em contato via ${EMAIL}.`],
          ["10. Contato", `Dúvidas sobre esta política: ${EMAIL}`],
        ].map(([title, body]) => (
          <div key={title} style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#c9a227", borderBottom: "1px solid rgba(201,162,39,.15)", paddingBottom: ".4rem", marginBottom: ".75rem" }}>{title}</h2>
            <p style={{ lineHeight: 1.8, fontSize: ".95rem", whiteSpace: "pre-line" }}>{body}</p>
          </div>
        ))}

        <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: ".8rem", color: "#475569", display: "flex", gap: "1.5rem" }}>
          <a href="/terms" style={{ color: "#c9a227", textDecoration: "none" }}>Termos de Serviço</a>
          <a href={URL} style={{ color: "#c9a227", textDecoration: "none" }}>{APP}</a>
        </div>
      </div>
    </div>
  );
}
