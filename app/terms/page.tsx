export const metadata = { title: "Termos de Serviço – AutoPost" };

const APP = "AutoPost";
const URL = "https://saas-insta.vercel.app";
const EMAIL = "goncalvescristian0508@gmail.com";

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#060810 0%,#0a0e1a 100%)", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", padding: "0 1rem" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "4rem 0" }}>

        <a href={URL} style={{ color: "#c9a227", textDecoration: "none", fontSize: ".9rem", fontWeight: 600 }}>← {APP}</a>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, marginTop: "1.5rem", marginBottom: ".5rem", color: "#fff" }}>Termos de Serviço</h1>
        <p style={{ color: "#64748b", fontSize: ".9rem", marginBottom: "3rem" }}>Última atualização: 21 de abril de 2025</p>

        {[
          ["1. Aceitação dos Termos", `Ao criar uma conta ou usar o ${APP} (${URL}), você concorda com estes Termos de Serviço e com nossa Política de Privacidade (${URL}/privacy). Se não concordar, não utilize o serviço.`],
          ["2. Descrição do Serviço", `${APP} é uma plataforma que permite automatizar e agendar publicações no Instagram utilizando a API oficial da Meta. O serviço inclui:\n• Conexão de contas do Instagram via OAuth oficial da Meta.\n• Upload e gerenciamento de vídeos em biblioteca privada.\n• Agendamento e postagem em massa de Reels.`],
          ["3. Uso Permitido", "Você concorda em usar o serviço apenas para fins legítimos e em conformidade com estes Termos, os Termos de Plataforma da Meta, as Diretrizes da Comunidade do Instagram e toda legislação aplicável."],
          ["4. Uso Proibido", "É expressamente proibido usar o serviço para:\n• Publicar conteúdo que viole direitos autorais, seja ilegal, difamatório ou que incite violência.\n• Spam, manipulação de engajamento ou qualquer prática que viole as políticas do Instagram.\n• Acessar contas de terceiros sem autorização.\n• Tentar burlar os sistemas de segurança da plataforma."],
          ["5. Conta do Usuário", "Você é responsável por manter a confidencialidade de suas credenciais de acesso. Notifique-nos imediatamente em caso de uso não autorizado da sua conta. Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos."],
          ["6. Conteúdo do Usuário", "Você mantém todos os direitos sobre o conteúdo (vídeos, textos) que faz upload na plataforma. Ao usar o serviço, você nos concede uma licença limitada, não exclusiva, para armazenar e transmitir esse conteúdo exclusivamente para operação do serviço."],
          ["7. Disponibilidade do Serviço", "Nos esforçamos para manter o serviço disponível 24/7, mas não garantimos disponibilidade ininterrupta. O serviço pode ficar temporariamente indisponível por manutenção, falhas técnicas ou fatores fora do nosso controle (como mudanças na API da Meta)."],
          ["8. Limitação de Responsabilidade", `O ${APP} não se responsabiliza por:\n• Suspensão ou banimento de contas do Instagram por políticas da Meta.\n• Falhas na API do Instagram ou mudanças nas políticas da Meta.\n• Perda de dados decorrente de falhas técnicas.\n• Danos indiretos, incidentais ou consequenciais.`],
          ["9. Alterações nos Termos", "Podemos atualizar estes Termos periodicamente. Notificaremos sobre mudanças significativas por e-mail ou aviso na plataforma. O uso continuado após as alterações implica aceitação dos novos termos."],
          ["10. Rescisão", "Você pode encerrar sua conta a qualquer momento. Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos, sem aviso prévio em casos graves."],
          ["11. Lei Aplicável", "Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de domicílio do usuário para resolução de disputas."],
          ["12. Contato", `Dúvidas: ${EMAIL}`],
        ].map(([title, body]) => (
          <div key={title} style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#c9a227", borderBottom: "1px solid rgba(201,162,39,.15)", paddingBottom: ".4rem", marginBottom: ".75rem" }}>{title}</h2>
            <p style={{ lineHeight: 1.8, fontSize: ".95rem", whiteSpace: "pre-line" }}>{body}</p>
          </div>
        ))}

        <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: ".8rem", color: "#475569", display: "flex", gap: "1.5rem" }}>
          <a href="/privacy" style={{ color: "#c9a227", textDecoration: "none" }}>Política de Privacidade</a>
          <a href={URL} style={{ color: "#c9a227", textDecoration: "none" }}>{APP}</a>
        </div>
      </div>
    </div>
  );
}
