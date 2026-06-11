export type CaptionTheme = "mundo" | "tops" | "complexas";

const CURIOSIDADES_MUNDO: string[] = [
  "🌍 O mel nunca estraga. Arqueólogos encontraram mel de 3.000 anos em tumbas egípcias — ainda comestível. #curiosidades #mundo",
  "🌊 O oceano Pacífico é maior do que toda a área terrestre do planeta Terra combinada. #fatos #mundofascinante",
  "🦈 Os tubarões existem há mais tempo do que as árvores. Tubarões: 450 milhões de anos. Árvores: 350 milhões de anos. #natureza #curiosidades",
  "🐘 Os elefantes são os únicos animais que não conseguem pular. Eles nunca tiram as 4 patas do chão ao mesmo tempo. #animais #fatos",
  "💧 Apenas 3% da água do planeta é doce — e 2% está congelada nas calotas polares. Só 1% é acessível para nós. #agua #meioambiente",
  "🌙 A Lua está se afastando da Terra cerca de 3,8 cm por ano. Daqui a bilhões de anos, os eclipses solares totais não existirão mais. #espaco #lua",
  "🐜 As formigas nunca dormem e não têm pulmões. Respiram através de minúsculos buracos no corpo chamados espiráculos. #formigas #biologia",
  "🔥 A temperatura do relâmpago é 5 vezes mais quente que a superfície do Sol. Cerca de 30.000°C em microsegundos. #ciencia #tempestade",
  "🌺 A flor mais fétida do mundo, a Rafflesia, cheira a carne podre para atrair moscas polinizadoras. Pode pesar até 11 kg. #flores #natureza",
  "🦋 As borboletas têm gosto com as patas. Elas possuem receptores gustativos nos pés para identificar plantas. #borboleta #biologia",
  "🌋 Há mais vulcões ativos no fundo do oceano do que em toda a superfície terrestre. #vulcoes #oceano",
  "🦜 Os papagaios podem viver por mais de 80 anos. Alguns superam a expectativa de vida de muitos humanos. #papagaio #animais",
  "🌿 As plantas se comunicam entre si através de sinais químicos liberados pelo ar e pelo solo. #plantas #natureza",
  "🐬 Os golfinhos têm nomes uns para os outros. Eles usam assobios únicos para chamar membros específicos do grupo. #golfinhos #inteligencia",
  "❄️ A neve nunca é branca — ela é transparente. A luz que reflete em cada cristal cria a ilusão de brancura. #neve #optica",
  "🌍 A Islândia não tem mosquitos. É um dos poucos países do mundo completamente livre desses insetos. #islandia #curiosidade",
  "🦁 Os leões dormem até 20 horas por dia. São os mamíferos mais preguiçosos entre os grandes predadores. #leao #africa",
  "🐙 Os polvos têm 3 corações, 9 cérebros (1 central + 1 por tentáculo) e sangue azul. #polvo #biologia",
  "🌞 A luz do Sol leva 8 minutos para chegar à Terra, mas leva 100.000 anos para sair do núcleo solar até a superfície. #sol #fisica",
  "🍌 As bananas são ligeiramente radioativas devido ao potássio-40 que contêm. Mas a dose é completamente inofensiva. #banana #ciencia",
  "🐧 Os pinguins têm um recurso de dessalinização acima do bico que filtra o sal da água do mar. #pinguins #evolucao",
  "🌎 A Costa Rica gera mais de 99% da sua energia de fontes renováveis. #costarica #sustentabilidade",
  "🦒 As girafas dormem apenas 30 minutos por dia, em cochilos de 5 minutos. São os mamíferos que menos dormem. #girafa #sono",
  "🐢 As tartarugas existem há 220 milhões de anos e sobreviveram à extinção dos dinossauros sem mudar muito. #tartaruga #evolucao",
  "🌊 O ponto mais profundo do oceano (Fossa das Marianas) tem 11 km de profundidade. O Everest caberia dentro com sobra. #oceano #marianas",
  "🔭 Existem mais estrelas no universo do que grãos de areia em todas as praias da Terra. #universo #astronomia",
  "🌱 Uma única árvore pode absorver até 22 kg de CO₂ por ano e liberar oxigênio suficiente para 2 pessoas. #arvore #natureza",
  "🐝 As abelhas batem as asas 200 vezes por segundo. O som do zumbido vem exatamente desse movimento. #abelhas #insetos",
  "🌍 A Austrália tem mais espécies venenosas de animais do que qualquer outro país do mundo. #australia #animais",
  "🧲 A Terra tem um núcleo de ferro líquido que cria o campo magnético protetor que nos defende da radiação solar. #terra #geofisica",
  "🦅 A águia-careca pode mergulhar a 160 km/h para capturar peixes. É o símbolo dos EUA há mais de 200 anos. #aguia #aves",
  "🌵 O cacto pode sobreviver até 2 anos sem água. Armazena umidade no interior esponjoso do caule. #cacto #sobrevivencia",
  "🐠 O peixe-palhaço pode mudar de sexo. Todos nascem machos, e o dominante do grupo se torna fêmea. #peixes #biologia",
  "🌍 O Japão tem mais de 5 milhões de máquinas de venda automática — 1 para cada 23 pessoas. #japao #curiosidade",
  "🏔️ O Everest cresce cerca de 4 mm por ano por causa da pressão tectônica que continua elevando o Himalaia. #everest #geologia",
  "🦠 O corpo humano tem mais bactérias do que células humanas. Temos cerca de 38 trilhões de bactérias. #microbioma #saude",
  "🌊 O som viaja 4 vezes mais rápido na água do que no ar. Por isso baleias conseguem se comunicar por milhares de km. #som #fisica",
  "🌙 Na Lua, você pesaria apenas 16% do seu peso na Terra. Em Júpiter, 2,5 vezes mais. #gravidade #espaco",
  "🐦 Os corvos são considerados tão inteligentes quanto um chimpanzé de 7 anos. Usam ferramentas e resolvem enigmas. #corvo #inteligencia",
  "🌍 A Noruega tem mais carros elétricos per capita do que qualquer outro país do mundo. #noruega #eletrificacao",
];

const CURIOSIDADES_TOPS: string[] = [
  "🏆 O recorde de tempo sem dormir é de 11 dias e 25 minutos, por Randy Gardner em 1964. Médicos monitoraram tudo. #recordemundial #insonia",
  "⚡ O ser humano mais veloz do mundo, Usain Bolt, atingiu 44,72 km/h. Um guepardo faz 120 km/h com facilidade. #usainbolt #velocidade",
  "💎 O diamante mais caro do mundo foi vendido por R$ 500 milhões. Tinha apenas 59 quilates e era cor de rosa. #diamante #luxo",
  "🧠 O cérebro humano gera cerca de 70.000 pensamentos por dia e processa 11 milhões de bits de informação por segundo. #cerebro #mente",
  "🎵 A música mais ouvida da história no Spotify tem mais de 3 bilhões de plays. A indústria musical nunca foi tão grande. #musica #spotify",
  "🏗️ A Grande Muralha da China não é visível do espaço a olho nu — esse é um dos maiores mitos da história. #grandmuralha #mitos",
  "🚀 A Apollo 11 foi ao espaço com menos poder computacional do que um smartphone atual de entrada. #apollo #tecnologia",
  "💪 O músculo mais forte do corpo humano em proporção ao seu tamanho é o músculo masseter — responsável por mastigar. #musculo #anatomia",
  "🌡️ A temperatura mais alta registrada na Terra foi de 56,7°C no Vale da Morte, Califórnia, em 1913. #calor #recordes",
  "❄️ A temperatura mais baixa registrada foi -89,2°C na Antártida, em 1983, na estação Vostok. #frio #antartica",
  "🎯 Uma pessoa média toma cerca de 35.000 decisões por dia. A maioria delas de forma inconsciente. #decisoes #psicologia",
  "💰 Se você tem mais de R$ 35 por dia para gastar, você está entre os 20% mais ricos do mundo. #economia #perspectiva",
  "🏊 Michael Phelps tem mais medalhas olímpicas do que 161 países inteiros. É o maior atleta olímpico de todos os tempos. #michaelphelps #olimpiadas",
  "📱 O iPhone original de 2007 tinha menos poder de processamento do que um microondas moderno. #iphone #tecnologia",
  "🌍 A língua mais falada no mundo não é o inglês — é o mandarim, com 1,1 bilhão de falantes nativos. #idiomas #cultura",
  "🧬 Se você esticasse o DNA de uma única célula humana, ele mediria 2 metros de comprimento. No corpo inteiro: 160 bilhões de km. #dna #biologia",
  "🎬 O filme mais lucrativo de todos os tempos (ajustado pela inflação) é 'E o Vento Levou', de 1939. #cinema #recordes",
  "🏋️ O recorde de levantamento de peso é de 501 kg — mais do que um cavalo médio. Feito por Hafthor Björnsson. #halterofilia #forcahumana",
  "🦷 O esmalte dos dentes é o material mais duro produzido pelo corpo humano — mais duro que qualquer osso. #dentes #anatomia",
  "🌊 O tsunami mais alto da história atingiu 524 metros no Alasca em 1958 — mais alto que o Empire State Building. #tsunami #desastres",
  "🔬 Um gramo de DNA pode armazenar 215 petabytes de informação — mais do que todos os data centers do mundo juntos. #dna #armazenamento",
  "🎯 O arco mais antigo do mundo foi encontrado na Dinamarca e tem 11.000 anos. Ainda estava funcional. #arqueologia #historia",
  "🌿 A maior floresta do mundo não é a Amazônia. É a floresta boreal da Sibéria, com 12 milhões de km². #floresta #russia",
  "🏆 O país com mais títulos mundiais de futebol é o Brasil, com 5 conquistas. Uma geração inteira cresceu vendo isso. #brasil #futebol",
  "🔥 O material mais caro do mundo é o antimatter (antimatéria): R$ 500 bilhões por grama. #antimateria #fisica",
  "🧪 A substância mais tóxica conhecida é a toxina botulínica. 1 grama poderia matar 1 milhão de pessoas. #toxina #ciencia",
  "🚢 O maior navio do mundo é tão grande que tem parques, teatros e shopping centers dentro. #navio #engenharia",
  "🌍 A nação mais jovem do mundo é o Sudão do Sul, independente desde 2011. Tem menos de 15 anos de existência. #historia #geopolitica",
  "📚 A maior biblioteca do mundo, a Biblioteca do Congresso dos EUA, tem mais de 170 milhões de itens. #biblioteca #cultura",
  "🔭 O buraco negro mais próximo da Terra está a 1.000 anos-luz — ainda assim, pode afetar nossa galáxia. #buraconegro #astronomia",
  "💻 A primeira mensagem enviada pela internet foi 'lo' — o sistema travou antes de terminar 'login'. #internet #historia",
  "🚗 O carro mais rápido do mundo atinge 490 km/h — mais rápido que muitos aviões de hélice. #carro #velocidade",
  "🎪 O ser humano adulto tem 206 ossos. Bebês nascem com cerca de 270 — muitos se fundem ao longo do crescimento. #ossos #anatomia",
  "🌟 A estrela mais brilhante visível a olho nu, Sírius, é 25 vezes mais luminosa que o Sol. #estrelas #astronomia",
  "🐋 A baleia-azul tem um coração do tamanho de um carro pequeno, pesando cerca de 180 kg. #baleia #natureza",
  "🏙️ Tóquio é a cidade mais populosa do mundo, com mais de 37 milhões de pessoas na região metropolitana. #toquio #urbanizacao",
  "✈️ O avião mais rápido já construído, o SR-71 Blackbird, voava a 3.529 km/h — 3x a velocidade do som. #aviacao #tecnologia",
  "🎨 A obra de arte mais cara já vendida foi 'Salvator Mundi' de Da Vinci: R$ 2,3 bilhões em 2017. #arte #dinheiro",
  "🧲 O ímã mais poderoso do mundo está no Laboratório de Campo Magnético em Tallahassee e tem 45 Tesla — 900.000 vezes mais forte que a Terra. #magnet #fisica",
  "🌏 A Rússia é tão grande que tem 11 fusos horários diferentes. Quando é manhã em Moscou, já é noite no Pacífico russo. #russia #geografia",
];

const FATOS_COMPLEXOS: string[] = [
  "🌀 O tempo passa mais lento perto de objetos massivos como a Terra. Seus pés envelhecem ligeiramente mais devagar que sua cabeça. #relatividade #einstein",
  "🔬 Cada átomo do seu corpo foi forjado dentro de uma estrela que explodiu bilhões de anos atrás. Você é literalmente poeira de estrelas. #atomos #cosmos",
  "🧠 Sua consciência experimenta o presente com 80ms de atraso. Você nunca vive o 'agora' — apenas uma memória recente dele. #neurociencia #percepcao",
  "♾️ Existem infinitos maiores e menores que outros. O infinito dos números reais é matematicamente maior que o infinito dos inteiros. #matematica #infinito",
  "🌊 O Universo pode ser um holograma — informações do espaço 3D podem estar encodadas em uma superfície 2D ao redor dele. #holografia #fisica",
  "⚛️ Se você remover todo o espaço vazio dos átomos do corpo humano, o que sobra cabe numa partícula de poeira. Mas essa poeira tem 70 kg. #atomos #materia",
  "🔮 O princípio da incerteza de Heisenberg diz que é impossível saber ao mesmo tempo a posição e a velocidade exata de uma partícula. A realidade é fundamentalmente indeterminada. #quantica #heisenberg",
  "🌌 O universo observável tem 93 bilhões de anos-luz de diâmetro — mas o universo real pode ser infinitamente maior além do que podemos ver. #universo #cosmologia",
  "🐛 O processo de metamorfose da borboleta não é gradual. A lagarta se dissolve completamente em uma sopa celular antes de se reorganizar em borboleta. #metamorfose #biologia",
  "💡 Cada fóton de luz que atinge seus olhos saiu do Sol há 8 minutos — mas ficou preso no núcleo solar por 100.000 anos antes disso. #luz #sol",
  "🧬 Você compartilha 50% do seu DNA com uma banana e 99,9% com qualquer outro humano do planeta. A diferença entre as pessoas é ínfima. #dna #evolucao",
  "🔭 Quando você olha para as estrelas, está olhando para o passado. Algumas das estrelas que vemos já podem não existir mais. #tempo #astronomia",
  "🌍 A Terra está viajando pelo espaço a 828.000 km/h em torno do centro da Via Láctea. Você está sempre em movimento, mesmo parado. #terra #espaco",
  "🧪 A entropia — a tendência de tudo se tornar desordenado — pode ser a razão pela qual o tempo só flui para frente e nunca volta. #entropia #termodinamica",
  "🤖 O paradoxo de Fermi: se o universo é tão vasto e antigo, onde estão todos os alienígenas? O silêncio cósmico é perturbador. #fermi #extraterrestre",
  "⚡ O efeito fotoelétrico — que Einstein explicou em 1905 — prova que a luz se comporta tanto como onda quanto como partícula simultaneamente. #dualidade #quantica",
  "🌀 O emaranhamento quântico permite que partículas a bilhões de anos-luz de distância se influenciem instantaneamente — mais rápido que a luz. #entanheamento #quantica",
  "🧠 Você tem dois hemisférios cerebrais que percebem a realidade de formas diferentes. Pacientes com o corpo caloso cortado mostram dois centros de consciência separados. #cerebro #consciencia",
  "💫 A matéria escura compõe 27% do universo, a energia escura 68%, e toda a matéria visível — estrelas, planetas, você — é apenas 5%. #materiaescura #cosmologia",
  "🔄 O paradoxo do barco de Teseu: se você substituir cada peça de um navio uma a uma, no final é o mesmo navio? A identidade é uma ilusão? #filosofia #identidade",
  "🌊 O efeito borboleta sugere que o bater de asas de uma borboleta no Brasil pode causar um tornado no Texas. Sistemas complexos são imprevisíveis. #caos #borboleta",
  "🧬 As mitocôndrias das suas células têm seu próprio DNA — elas foram bactérias independentes que se fundiram com células ancestrais há 2 bilhões de anos. #mitocondria #evolucao",
  "📡 O Big Bang não foi uma explosão no espaço — foi uma expansão DO espaço. Não há um centro de onde tudo veio. #bigbang #cosmologia",
  "🔬 Em mecânica quântica, um elétron pode estar em dois lugares ao mesmo tempo — até ser observado. A observação colapsa as possibilidades. #superposicao #quantica",
  "🌀 A teoria das supercordas propõe que a realidade tem 10 ou 11 dimensões. As dimensões extras estão enroladas em escalas subatômicas. #supercordas #dimensoes",
  "🧠 Neurônios disparam em padrões que refletem sua experiência de forma mais abstrata do que você imagina. Memórias são reconstituídas, não reproduzidas. #memoria #neurociencia",
  "💡 A luz não envelhece. Do ponto de vista de um fóton, ele é emitido e absorvido no mesmo instante — não importa o quanto viaje. #relatividade #luz",
  "🌍 O número de átomos no universo observável é aproximadamente 10^80 — menor que o número de possíveis jogos de xadrez (10^120). #matematica #xadrez",
  "⚗️ A diferença entre ouro e chumbo é apenas o número de prótons no núcleo. Alquimistas estavam certos em teoria — mas eravam na escala de energia. #quimica #alquimia",
  "🔮 O paradoxo EPR questiona se a realidade existe independentemente da observação. Experimentos sugerem que o universo não é 'localmente realista'. #epr #quantica",
  "🦠 Vírus não são tecnicamente seres vivos — não têm metabolismo próprio. São pacotes de informação genética que sequestram máquinas vivas. #virus #biologia",
  "🌌 Toda a informação que cai em um buraco negro pode ser preservada na sua superfície bidimensional — o paradoxo da informação de Hawking. #hawking #buraconegro",
  "⏳ O tempo não flui da mesma forma em todo lugar. GPS satellites corrigem constantemente o desajuste temporal causado pela velocidade e pela altitude. #gps #relatividade",
  "🔗 O livre-arbítrio pode ser uma ilusão: experimentos mostram que o cérebro decide 350ms antes de você 'escolher' conscientemente. #liberdarede #neurociencia",
  "🌐 A internet tem mais dados do que toda a escrita humana da história combinada — e duplica em tamanho a cada 2 anos. #internet #dados",
  "🧬 A vida pode ter chegado à Terra em meteoritos — a panspermia sugere que moléculas orgânicas viajam pelo espaço entre planetas e estrelas. #panspermia #origendavida",
  "♾️ A hipótese do universo matemático propõe que o universo não só é descrito pela matemática — ele É matemática pura. #tegmark #matematica",
  "🌊 O mar está cheio de partículas de DNA de todos os organismos que já viveram nele. Um litro de água do oceano contém bilhões de fragmentos genéticos. #oceano #dna",
  "🔭 Existe um ponto no universo chamado 'Horizonte de Hubble' além do qual nada pode nos alcançar nunca mais — o universo se expande rápido demais. #expansao #cosmologia",
  "🧠 Quando você sonha, seu corpo paralisa os músculos para que você não encene fisicamente os sonhos. Pessoas com esse mecanismo defeituoso podem se machucar durante o sono. #sonhos #neurociencia",
];

const THEMES: Record<CaptionTheme, string[]> = {
  mundo: CURIOSIDADES_MUNDO,
  tops: CURIOSIDADES_TOPS,
  complexas: FATOS_COMPLEXOS,
};

export function getAutoCaption(theme: CaptionTheme, index: number): string {
  const pool = THEMES[theme];
  return pool[index % pool.length];
}

export function shufflePool(theme: CaptionTheme, seed: number): string[] {
  const pool = [...THEMES[theme]];
  // Deterministic shuffle based on seed (Fisher-Yates)
  let s = seed;
  for (let i = pool.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
