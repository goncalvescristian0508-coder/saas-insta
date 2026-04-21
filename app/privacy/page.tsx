export const metadata = { title: "Política de Privacidade – Wayne Automations" };

const APP_NAME = "Wayne Automations";
const APP_URL = "https://saas-insta.vercel.app";
const CONTACT_EMAIL = "goncalvescristian0508@gmail.com";
const UPDATED = "21 de abril de 2025";

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #060810 0%, #0a0e1a 100%)",
      color: "#e2e8f0",
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: "0 1rem",
    }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "4rem 0" }}>
        {/* Header */}
        <div style={{ marginBottom: "3rem" }}>
          <a href={APP_URL} style={{ color: "#c9a227", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 }}>
            ← {APP_NAME}
          </a>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 800, marginTop: "1.5rem", marginBottom: ".5rem", color: "#fff" }}>
            Política de Privacidade
          </h1>
          <p style={{ color: "#64748b", fontSize: ".9rem" }}>Última atualização: {UPDATED}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2rem", lineHeight: 1.8, fontSize: ".95rem" }}>

          <section>
            <h2 style={h2}>1. Quem somos</h2>
            <p>{APP_NAME} (<a href={APP_URL} style={link}>{APP_URL}</a>) é uma plataforma SaaS que permite automatizar e agendar publicações no Instagram via API oficial da Meta. Ao usar o serviço, você concorda com esta Política de Privacidade.</p>
          </section>

          <section>
            <h2 style={h2}>2. Dados que coletamos</h2>
            <ul style={ul}>
              <li><strong>Conta:</strong> endereço de e-mail e senha (armazenada com hash seguro pelo Supabase Auth).</li>
              <li><strong>Conta do Instagram (OAuth):</strong> nome de usuário (@), ID de usuário do Instagram e token de acesso (criptografado em repouso). Não armazenamos senha do Instagram.</li>
              <li><strong>Conteúdo:</strong> vídeos que você faz upload na Biblioteca, legendas e configurações de agendamento.</li>
              <li><strong>Logs de uso:</strong> status de postagens (sucesso/falha), mensagens de erro da API do Instagram.</li>
            </ul>
          </section>

          <section>
            <h2 style={h2}>3. Como usamos seus dados</h2>
            <ul style={ul}>
              <li>Publicar conteúdo no Instagram em seu nome, conforme você configurar.</li>
              <li>Gerenciar sua sessão autenticada e proteger sua conta.</li>
              <li>Exibir histórico de postagens e status no painel.</li>
              <li>Enviar notificações de erro ou expiração de token (somente por e-mail, se habilitado).</li>
            </ul>
            <p style={{ marginTop: ".75rem" }}>Não vendemos, alugamos nem compartilhamos seus dados com terceiros para fins comerciais.</p>
          </section>

          <section>
            <h2 style={h2}>4. Permissões do Instagram</h2>
            <p>Solicitamos as seguintes permissões via Meta / Instagram:</p>
            <ul style={ul}>
              <li><strong>instagram_basic</strong> — ler informações básicas do perfil (nome de usuário, ID).</li>
              <li><strong>instagram_content_publish</strong> — publicar Reels e fotos em seu perfil.</li>
            </ul>
            <p style={{ marginTop: ".75rem" }}>Essas permissões são usadas exclusivamente para as funções descritas nesta política. Você pode revogar o acesso a qualquer momento em <strong>Configurações &gt; Aplicativos e Sites</strong> no Instagram.</p>
          </section>

          <section>
            <h2 style={h2}>5. Armazenamento e segurança</h2>
            <ul style={ul}>
              <li>Dados armazenados em servidores Supabase (PostgreSQL + Storage) com criptografia em trânsito (TLS) e em repouso.</li>
              <li>Tokens de acesso do Instagram são criptografados com AES-256 antes de serem salvos.</li>
              <li>Vídeos da Biblioteca ficam em bucket privado do Supabase Storage e são acessíveis apenas por você.</li>
            </ul>
          </section>

          <section>
            <h2 style={h2}>6. Retenção de dados</h2>
            <p>Seus dados são mantidos enquanto sua conta estiver ativa. Ao excluir sua conta, removemos seus dados pessoais e conteúdo dentro de 30 dias, salvo obrigação legal em contrário.</p>
          </section>

          <section>
            <h2 style={h2}>7. Exclusão de dados</h2>
            <p>Para solicitar a exclusão dos seus dados (conforme exigido pela Meta), acesse as configurações da plataforma ou envie um e-mail para <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a> com o assunto <em>"Exclusão de dados"</em>. Também disponibilizamos um endpoint automático de exclusão em conformidade com a política da Meta.</p>
          </section>

          <section>
            <h2 style={h2}>8. Cookies</h2>
            <p>Utilizamos apenas cookies estritamente necessários para manter sua sessão autenticada. Não usamos cookies de rastreamento ou publicidade.</p>
          </section>

          <section>
            <h2 style={h2}>9. Seus direitos</h2>
            <p>Você tem direito a acessar, corrigir ou excluir seus dados a qualquer momento. Entre em contato via <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a>.</p>
          </section>

          <section>
            <h2 style={h2}>10. Contato</h2>
            <p>Dúvidas sobre esta política: <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a></p>
          </section>
        </div>

        <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: ".8rem", color: "#475569", display: "flex", gap: "1.5rem" }}>
          <a href="/terms" style={link}>Termos de Serviço</a>
          <a href={APP_URL} style={link}>{APP_NAME}</a>
        </div>
      </div>
    </div>
  );
}

const h2: React.CSSProperties = {
  fontSize: "1.1rem", fontWeight: 700, color: "#c9a227",
  marginBottom: ".75rem", borderBottom: "1px solid rgba(201,162,39,0.15)",
  paddingBottom: ".4rem",
};
const ul: React.CSSProperties = {
  paddingLeft: "1.4rem", display: "flex", flexDirection: "column", gap: ".4rem",
};
const link: React.CSSProperties = {
  color: "#c9a227", textDecoration: "none",
};
