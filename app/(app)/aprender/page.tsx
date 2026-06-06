"use client";

import { GraduationCap, Users, Send, CalendarClock, Clapperboard, Camera, Search, Copy, Flame, BarChart2, Plug, ChevronDown, ChevronUp, CheckCircle2, Info, Zap } from "lucide-react";
import { useState } from "react";

interface Lesson {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  badge?: string;
  summary: string;
  steps: { title: string; description: string }[];
  tips?: string[];
}

const lessons: Lesson[] = [
  {
    id: "contas",
    title: "Conectar Contas Instagram",
    icon: Users,
    color: "#818cf8",
    badge: "Essencial",
    summary: "O primeiro passo é conectar suas contas do Instagram via OAuth para que o sistema possa postar em seu nome.",
    steps: [
      { title: "Acesse 'Contas' no menu lateral", description: "Na sidebar, clique em 'Contas' para ir à página de gerenciamento de contas." },
      { title: "Clique em 'Conectar com Instagram'", description: "Um pop-up do Instagram será aberto. Faça login com a conta que deseja conectar e autorize o aplicativo." },
      { title: "Aguarde a conexão", description: "Após autorizar, a conta aparecerá na lista com status 'Ativa'. O token tem validade de 60 dias e você receberá alertas para renovar." },
      { title: "Repita para cada conta", description: "Você pode conectar múltiplas contas. Cada conta pode ser usada para postar, agendar e rastrear vendas de forma independente." },
    ],
    tips: [
      "Contas com token expirado aparecem em vermelho — clique em 'Reconectar' para renovar.",
      "Contas com status 'Quarentena' estão temporariamente desativadas para proteger sua conta de possíveis punições do Instagram.",
      "Use contas diferentes para cada nicho para organizar melhor seus resultados.",
    ],
  },
  {
    id: "postagem-massa",
    title: "Postagem em Massa",
    icon: Send,
    color: "#34d399",
    badge: "Principal",
    summary: "Publique o mesmo vídeo em várias contas ao mesmo tempo, com legenda personalizada e intervalo entre postagens para parecer mais natural.",
    steps: [
      { title: "Vá para 'Postagem em massa'", description: "Clique em 'Postagem em massa' no menu lateral na seção Automação." },
      { title: "Selecione o vídeo", description: "Cole uma URL de vídeo (Reels do Instagram, TikTok, etc.) ou selecione um da sua Biblioteca. O sistema fará o download automaticamente." },
      { title: "Escreva a legenda", description: "Escreva a legenda do post. Use hashtags para maior alcance. O contador no canto mostra quantos caracteres você usou (máximo 2.200)." },
      { title: "Escolha as contas", description: "Marque as contas onde deseja postar. Apenas contas ativas e com token válido são exibidas." },
      { title: "Configure o intervalo", description: "Use o slider 'Intervalo entre posts' para definir um tempo de espera entre cada postagem. Isso torna a atividade mais natural para o Instagram." },
      { title: "Clique em 'Publicar'", description: "O sistema postará nas contas selecionadas em sequência. Você verá o status de cada postagem em tempo real." },
    ],
    tips: [
      "O intervalo máximo é ajustado automaticamente para não ultrapassar o limite de tempo do servidor.",
      "Você vê uma estimativa do tempo total antes de confirmar a postagem.",
      "Se uma conta falhar, as outras continuam sendo postadas normalmente.",
    ],
  },
  {
    id: "agendamento",
    title: "Agendamento de Posts",
    icon: CalendarClock,
    color: "#60a5fa",
    badge: "Principal",
    summary: "Programe posts para serem publicados automaticamente em datas e horários específicos, sem precisar estar online.",
    steps: [
      { title: "Acesse 'Agendamento'", description: "Clique em 'Agendamento' no menu lateral." },
      { title: "Clique em 'Novo agendamento'", description: "Abre o formulário de criação de post agendado." },
      { title: "Preencha o conteúdo", description: "Cole a URL do vídeo ou selecione da biblioteca, escreva a legenda e escolha a conta." },
      { title: "Defina data e horário", description: "Escolha quando o post deve ser publicado. O horário é interpretado no fuso horário de Brasília (UTC-3)." },
      { title: "Confirme o agendamento", description: "O post aparecerá na lista com status 'Pendente'. No horário programado, o sistema publicará automaticamente." },
      { title: "Acompanhe o status", description: "Use os filtros (Todos / Pendentes / Publicados / Falhos) para acompanhar seus posts. A página se atualiza a cada 30 segundos quando há posts pendentes." },
    ],
    tips: [
      "Posts com status 'Falho' podem ter falhado por token expirado ou restrições do Instagram — renove o token e reagende.",
      "Agende seus posts nos melhores horários de engajamento do seu nicho (geralmente 18h–21h no Brasil).",
      "Você pode excluir um agendamento pendente antes do horário programado.",
    ],
  },
  {
    id: "biblioteca",
    title: "Biblioteca de Vídeos",
    icon: Clapperboard,
    color: "#f472b6",
    summary: "Armazene seus vídeos no sistema para reutilizá-los rapidamente em postagens e agendamentos sem precisar baixar novamente.",
    steps: [
      { title: "Acesse 'Biblioteca'", description: "Clique em 'Biblioteca' no menu lateral na seção Conteúdo." },
      { title: "Faça upload de vídeos", description: "Arraste e solte vídeos ou clique para selecionar do seu computador. Formatos aceitos: MP4, MOV." },
      { title: "Use na postagem", description: "Na tela de Postagem em Massa ou Agendamento, clique em 'Biblioteca' para selecionar um vídeo salvo." },
      { title: "Gerencie seus vídeos", description: "Exclua vídeos que não usa mais para liberar espaço de armazenamento." },
    ],
    tips: [
      "Vídeos da biblioteca ficam disponíveis instantaneamente para qualquer postagem.",
      "Use nomes descritivos nos arquivos para encontrá-los mais facilmente.",
    ],
  },
  {
    id: "clonar",
    title: "Clonar Perfil Instagram",
    icon: Copy,
    color: "#a78bfa",
    badge: "Avançado",
    summary: "Copie automaticamente os vídeos mais recentes de um perfil público do Instagram e publique nas suas contas.",
    steps: [
      { title: "Acesse 'Clonar Perfil'", description: "Clique em 'Clonar Perfil' no menu lateral na seção Ferramentas." },
      { title: "Digite o perfil de origem", description: "Informe o @usuário do perfil que deseja clonar (ex: @fitness.brasil). O perfil deve ser público." },
      { title: "Escolha quantos posts clonar", description: "Define o número de vídeos a buscar do perfil de origem (ex: 10 últimos posts)." },
      { title: "Selecione as contas de destino", description: "Escolha em quais das suas contas os posts clonados serão publicados." },
      { title: "Inicie a clonagem", description: "O sistema buscará os vídeos e publicará sequencialmente. Você acompanha o progresso na mesma página." },
    ],
    tips: [
      "Só clone conteúdo que você tem direito de usar ou que é de domínio público.",
      "Use esta função para repostar conteúdo do seu próprio nicho ou de parceiros.",
      "O sistema ignora posts que não são vídeos (fotos e carrosséis).",
    ],
  },
  {
    id: "clonar-ttk",
    title: "Clonar do TikTok",
    icon: Copy,
    color: "#2dd4bf",
    badge: "Avançado",
    summary: "Importe vídeos diretamente de perfis do TikTok e publique no Instagram, aproveitando os melhores conteúdos virais.",
    steps: [
      { title: "Acesse 'Clonar TikTok'", description: "Clique em 'Clonar TikTok' no menu lateral." },
      { title: "Cole o link do perfil ou vídeo TikTok", description: "Você pode colar o link de um vídeo específico ou de um perfil para buscar os últimos posts." },
      { title: "Selecione os vídeos", description: "Marque quais vídeos do TikTok deseja importar." },
      { title: "Escolha as contas destino", description: "Selecione em quais contas do Instagram os vídeos serão publicados." },
      { title: "Publique", description: "O sistema baixa os vídeos sem marca d'água e posta no Instagram automaticamente." },
    ],
    tips: [
      "Vídeos do TikTok têm a marca d'água removida automaticamente.",
      "Respeite os direitos autorais dos criadores de conteúdo.",
      "Esta função é ideal para nichos como humor, fitness e motivação onde o conteúdo se repete entre plataformas.",
    ],
  },
  {
    id: "inspiracoes",
    title: "Inspirações de Conteúdo",
    icon: Search,
    color: "#fb923c",
    summary: "Encontre vídeos virais e tendências do Instagram para usar como referência ou repostar nas suas contas.",
    steps: [
      { title: "Acesse 'Inspirações'", description: "Clique em 'Inspirações' no menu lateral." },
      { title: "Busque por hashtag ou palavra-chave", description: "Digite uma hashtag ou tema (ex: #fitness, #motivação) e o sistema busca os posts mais populares recentes." },
      { title: "Selecione o conteúdo", description: "Visualize os vídeos encontrados e clique em 'Usar' no que deseja repostar." },
      { title: "Edite e publique", description: "O sistema redireciona para Postagem em Massa com o vídeo já carregado. Complete a legenda e escolha as contas." },
    ],
    tips: [
      "Busque inspirações do seu nicho para manter a consistência do perfil.",
      "Conteúdo com alto engajamento tende a performar melhor quando repostado.",
    ],
  },
  {
    id: "aquecimento",
    title: "Aquecimento de Contas",
    icon: Flame,
    color: "#f87171",
    badge: "Avançado",
    summary: "Realize ações orgânicas automáticas (curtir, comentar, seguir) para deixar a conta mais ativa antes de começar a postar em massa.",
    steps: [
      { title: "Acesse 'Aquecimento'", description: "Clique em 'Aquecimento' no menu lateral." },
      { title: "Selecione a conta para aquecer", description: "Escolha qual das suas contas precisa de aquecimento (contas novas ou reativadas)." },
      { title: "Configure as ações", description: "Defina quantas curtidas, comentários ou follows por dia o sistema deve realizar." },
      { title: "Inicie o aquecimento", description: "O sistema realizará as ações de forma gradual ao longo do dia, simulando comportamento humano." },
    ],
    tips: [
      "Nunca comece a postar em massa em uma conta nova sem aquecer antes.",
      "O aquecimento deve durar pelo menos 7 dias em contas novas.",
      "Não exagere nas ações — o Instagram pode suspender contas por comportamento anormal.",
    ],
  },
  {
    id: "vendas",
    title: "Rastreio de Vendas",
    icon: BarChart2,
    color: "#4ade80",
    badge: "Analytics",
    summary: "Veja quantas vendas cada conta do Instagram gerou usando o rastreamento por UTM. Conecte qualquer plataforma de pagamento via webhook.",
    steps: [
      { title: "Configure o webhook primeiro", description: "Vá em 'Integrações' e copie o webhook universal. Cole na sua plataforma de vendas (ApexVips, Kirvano, Hotmart, etc.)." },
      { title: "Configure o link de oferta com UTM", description: "No passo 2 das Integrações, cole o link da sua oferta. O sistema gera automaticamente um link com utm_source para cada conta." },
      { title: "Cada conta divulga seu próprio link", description: "Na bio do Instagram, use o link específico daquela conta (com ?utm_source=@conta). Assim cada venda é atribuída corretamente." },
      { title: "Acesse 'Vendas'", description: "Veja o total de vendas, valor aprovado, e o ranking de contas que mais vendem no período selecionado." },
    ],
    tips: [
      "O painel de Vendas mostra o histórico de todos os meses — mude o período no filtro para comparar.",
      "Você pode corrigir atribuições incorretas clicando em 'Corrigir todas as UTMs' nas Integrações.",
      "Configure o Bot do Telegram para receber notificações instantâneas de novas vendas.",
    ],
  },
  {
    id: "integracoes",
    title: "Configurar Integrações",
    icon: Plug,
    color: "#f97316",
    badge: "Config",
    summary: "Configure webhooks de venda, notificações push e o bot do Telegram para rastrear suas vendas de forma automática.",
    steps: [
      { title: "Acesse 'Integrações'", description: "Clique em 'Integrações' no menu lateral." },
      { title: "Copie o Webhook Universal", description: "No Passo 1, copie a URL do webhook e cole na configuração de webhook da sua plataforma (ApexVips, Kirvano, Hotmart, Eduzz, etc.)." },
      { title: "Cole o link da oferta", description: "No Passo 2, cole o link base da sua oferta. O sistema gera links únicos por conta com o utm_source correto." },
      { title: "Distribua os links por conta", description: "Cada conta usa seu próprio link (Passo 3). Use este link na bio do Instagram de cada conta." },
      { title: "Configure o Telegram (opcional)", description: "Adicione seu Bot Token e Chat ID para receber notificações de venda diretamente no Telegram." },
      { title: "Configure as notificações Push (opcional)", description: "Personalize o nome que aparece nas notificações de venda no celular." },
    ],
    tips: [
      "O webhook funciona com ApexVips, Kirvano, Hotmart, Eduzz e PushinPay automaticamente.",
      "Ative os eventos de 'pagamento criado' e 'pagamento aprovado' na plataforma de vendas.",
      "Use o botão 'Corrigir todas as UTMs' se perceber que vendas estão sendo atribuídas à conta errada.",
    ],
  },
];

export default function AprenderPage() {
  const [openId, setOpenId] = useState<string | null>("contas");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
        <GraduationCap size={22} color="var(--accent-gold)" />
        <h1 className="page-title" style={{ marginBottom: 0 }}>Central de Aprendizado</h1>
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Aprenda a usar cada funcionalidade da plataforma com guias passo a passo.
      </p>

      {/* Quick nav */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "2rem" }}>
        {lessons.map((l) => (
          <button
            key={l.id}
            onClick={() => setOpenId(l.id)}
            style={{
              display: "flex", alignItems: "center", gap: "0.35rem",
              padding: "0.3rem 0.75rem", borderRadius: "999px",
              background: openId === l.id ? `${l.color}22` : "rgba(255,255,255,0.04)",
              border: `1px solid ${openId === l.id ? `${l.color}55` : "rgba(255,255,255,0.08)"}`,
              color: openId === l.id ? l.color : "var(--text-secondary)",
              fontSize: "0.78rem", fontWeight: openId === l.id ? 700 : 400,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <l.icon size={12} />
            {l.title}
          </button>
        ))}
      </div>

      {/* Lessons */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {lessons.map((lesson) => {
          const isOpen = openId === lesson.id;
          return (
            <div
              key={lesson.id}
              style={{
                borderRadius: "12px",
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${isOpen ? `${lesson.color}33` : "var(--border-color)"}`,
                transition: "border-color 0.2s",
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <button
                onClick={() => setOpenId(isOpen ? null : lesson.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "0.75rem",
                  padding: "1rem 1.25rem", background: "none", border: "none",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: `${lesson.color}18`, border: `1px solid ${lesson.color}33`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <lesson.icon size={16} color={lesson.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#fff" }}>{lesson.title}</span>
                    {lesson.badge && (
                      <span style={{
                        fontSize: "0.65rem", padding: "1px 7px", borderRadius: "999px",
                        background: `${lesson.color}22`, color: lesson.color, fontWeight: 600,
                      }}>{lesson.badge}</span>
                    )}
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
                    {lesson.summary}
                  </p>
                </div>
                <div style={{ flexShrink: 0, color: "var(--text-muted)" }}>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {/* Body */}
              {isOpen && (
                <div style={{ padding: "0 1.25rem 1.25rem" }}>
                  {/* Steps */}
                  <div style={{ marginBottom: "1rem" }}>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
                      Passo a passo
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {lesson.steps.map((step, i) => (
                        <div key={i} style={{ display: "flex", gap: "0.75rem" }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: `${lesson.color}22`, border: `1px solid ${lesson.color}44`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.7rem", fontWeight: 700, color: lesson.color, marginTop: "0.1rem",
                          }}>
                            {i + 1}
                          </div>
                          <div>
                            <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff", margin: "0 0 0.15rem" }}>{step.title}</p>
                            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{step.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tips */}
                  {lesson.tips && lesson.tips.length > 0 && (
                    <div style={{ padding: "0.75rem", borderRadius: "8px", background: "rgba(255,184,0,0.05)", border: "1px solid rgba(255,184,0,0.15)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
                        <Zap size={12} color="#FFB800" />
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#FFB800", textTransform: "uppercase", letterSpacing: "0.08em" }}>Dicas</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        {lesson.tips.map((tip, i) => (
                          <div key={i} style={{ display: "flex", gap: "0.5rem" }}>
                            <CheckCircle2 size={13} color="#4ade80" style={{ flexShrink: 0, marginTop: "0.15rem" }} />
                            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: "2rem", display: "flex", gap: "0.5rem", padding: "0.75rem", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <Info size={14} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
          Tem dúvidas ou encontrou algum problema? Entre em contato com o suporte. Novos tutoriais são adicionados com cada atualização da plataforma.
        </p>
      </div>
    </div>
  );
}
