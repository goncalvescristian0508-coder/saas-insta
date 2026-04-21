export const metadata = { title: "Termos de Serviço – Wayne Automations" };

const APP_NAME = "Wayne Automations";
const APP_URL = "https://saas-insta.vercel.app";
const CONTACT_EMAIL = "goncalvescristian0508@gmail.com";
const UPDATED = "21 de abril de 2025";

export default function TermsPage() {
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
            Termos de Serviço
          </h1>
          <p style={{ color: "#64748b", fontSize: ".9rem" }}>Última atualização: {UPDATED}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2rem", lineHeight: 1.8, fontSize: ".95rem" }}>

          <section>
            <h2 style={h2}>1. Aceitação dos Termos</h2>
            <p>Ao criar uma conta ou usar o {APP_NAME} (<a href={APP_URL} style={link}>{APP_URL}</a>), você concorda com estes Termos de Serviço e com nossa <a href="/privacy" style={link}>Política de Privacidade</a>. Se não concordar, não utilize o serviço.</p>
          </section>

          <section>
            <h2 style={h2}>2. Descrição do Serviço</h2>
            <p>{APP_NAME} é uma plataforma que permite automatizar e agendar publicações no Instagram utilizando a API oficial da Meta. O serviço inclui:</p>
            <ul style={ul}>
              <li>Conexão de contas do Instagram via OAuth oficial da Meta.</li>
              <li>Upload e gerenciamento de vídeos em biblioteca privada.</li>
              <li>Agendamento e postagem em massa de Reels.</li>
            </ul>
          </section>

          <section>
            <h2 style={h2}>3. Uso Permitido</h2>
            <p>Você concorda em usar o serviço apenas para fins legítimos e em conformidade com:</p>
            <ul style={ul}>
              <li>Estes Termos de Serviço.</li>
              <li>Os <a href="https://developers.facebook.com/terms/" style={link} target="_blank" rel="noopener">Termos de Plataforma da Meta</a>.</li>
              <li>As <a href="https://help.instagram.com/581066165581870" style={link} target="_blank" rel="noopener">Diretrizes da Comunidade do Instagram</a>.</li>
              <li>Toda legislação aplicável.</li>
            </ul>
          </section>

          <section>
            <h2 style={h2}>4. Uso Proibido</h2>
            <p>É expressamente proibido usar o serviço para:</p>
            <ul style={ul}>
              <li>Publicar conteúdo que viole direitos autorais, seja ilegal, difamatório, pornográfico ou que incite violência.</li>
              <li>Spam, manipulação de engajamento, compra de seguidores ou qualquer prática que viole as políticas do Instagram.</li>
              <li>Acessar contas de terceiros sem autorização.</li>
              <li>Tentar burlar os sistemas de segurança da plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 style={h2}>5. Conta do Usuário</h2>
            <p>Você é responsável por manter a confidencialidade de suas credenciais de acesso. Notifique-nos imediatamente em caso de uso não autorizado da sua conta. Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos.</p>
          </section>

          <section>
            <h2 style={h2}>6. Conteúdo do Usuário</h2>
            <p>Você mantém todos os direitos sobre o conteúdo (vídeos, textos) que faz upload na plataforma. Ao usar o serviço, você nos concede uma licença limitada, não exclusiva, para armazenar e transmitir esse conteúdo exclusivamente para operação do serviço (ex.: publicar no Instagram em seu nome).</p>
          </section>

          <section>
            <h2 style={h2}>7. Disponibilidade do Serviço</h2>
            <p>Nos esforçamos para manter o serviço disponível 24/7, mas não garantimos disponibilidade ininterrupta. O serviço pode ficar temporariamente indisponível por manutenção, falhas técnicas ou fatores fora do nosso controle (como mudanças na API da Meta).</p>
          </section>

          <section>
            <h2 style={h2}>8. Limitação de Responsabilidade</h2>
            <p>O {APP_NAME} não se responsabiliza por:</p>
            <ul style={ul}>
              <li>Suspensão ou banimento de contas do Instagram por políticas da Meta.</li>
              <li>Falhas na API do Instagram ou mudanças nas políticas da Meta que afetem o funcionamento do serviço.</li>
              <li>Perda de dados decorrente de falhas técnicas.</li>
              <li>Danos indiretos, incidentais ou consequenciais.</li>
            </ul>
          </section>

          <section>
            <h2 style={h2}>9. Alterações nos Termos</h2>
            <p>Podemos atualizar estes Termos periodicamente. Notificaremos sobre mudanças significativas por e-mail ou aviso na plataforma. O uso continuado após as alterações implica aceitação dos novos termos.</p>
          </section>

          <section>
            <h2 style={h2}>10. Rescisão</h2>
            <p>Você pode encerrar sua conta a qualquer momento. Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos, sem aviso prévio em casos graves.</p>
          </section>

          <section>
            <h2 style={h2}>11. Lei Aplicável</h2>
            <p>Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de domicílio do usuário para resolução de disputas.</p>
          </section>

          <section>
            <h2 style={h2}>12. Contato</h2>
            <p>Dúvidas: <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a></p>
          </section>

        </div>

        <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: ".8rem", color: "#475569", display: "flex", gap: "1.5rem" }}>
          <a href="/privacy" style={link}>Política de Privacidade</a>
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
