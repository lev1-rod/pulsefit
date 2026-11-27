/* =========================================================
   PULSEFIT COACH — mecanismo local de respostas
   Não usa API, servidor, chave ou conexão externa.
   ========================================================= */
(() => {
  "use strict";

  const PF = window.PFCoach;
  const HISTORY_KEY = "pulsefit:coach-chat:v1";
  const STORE_KEY = "pulsefit:v2";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const els = {
    launcher: $("#coachLauncher"), panel: $("#coachPanel"), close: $("#coachClose"),
    clear: $("#coachClear"), messages: $("#coachMessages"), form: $("#coachForm"),
    input: $("#coachInput"), quick: $("#coachQuickPrompts")
  };

  if (!PF || !Array.isArray(PF.EXERCISES) || !els.launcher || !els.panel) {
    console.error("PulseFit Coach: biblioteca ou interface não encontrada.");
    return;
  }

  const normalize = (value) => String(value || "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ").trim();

  const escapeText = (value) => String(value ?? "");

  function storedState() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function dateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function weekDateKeys(reference = new Date()) {
    const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return dateKey(day);
    });
  }

  const DAY_CODES = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const DAY_NAMES = {
    dom: "domingo", seg: "segunda-feira", ter: "terça-feira", qua: "quarta-feira",
    qui: "quinta-feira", sex: "sexta-feira", sab: "sábado"
  };

  function todayCode() { return DAY_CODES[new Date().getDay()]; }

  function cardExercises(card) {
    return $$(".ex__text, .ex-list li", card)
      .map((node) => node.textContent.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function cardGroups(card) {
    return $$(".workout-group", card).map((group) => {
      const title = $(".workout-group__title strong", group)?.textContent.trim() || "Grupo muscular";
      const exercises = $$(".ex__text, .ex-list li", group)
        .map((node) => node.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
      return { title, exercises };
    });
  }

  function workoutCards() { return $$(".workout-card"); }

  function getTodayWorkout() {
    const card = workoutCards().find((item) => item.dataset.day === todayCode());
    return card || null;
  }

  function summarizeCard(card, includeDetails = true) {
    if (!card) return "Não há um treino cadastrado para esse dia no HTML do painel. Você pode adicionar um card na seção Treino.";
    const title = $("h3", card)?.textContent.trim() || "Treino sem título";
    const groups = cardGroups(card);
    const intro = `${DAY_NAMES[card.dataset.day] || "Dia selecionado"}: **${title}**`;
    if (!includeDetails) {
      const names = groups.map((group) => group.title).join(" e ");
      return `${intro}\nGrupos: ${names || "não especificados"}. ${cardExercises(card).length} exercícios cadastrados.`;
    }
    const body = groups.map((group) => `\n**${group.title}**\n${group.exercises.map((name) => `• ${name}`).join("\n")}`).join("\n");
    return `${intro}${body}\n\nUse as cargas que consegue controlar com boa técnica. Se algum movimento causar dor, pare e peça orientação.`;
  }

  function getStats() {
    const data = storedState();
    const dates = Array.isArray(data.workoutDates) ? data.workoutDates : [];
    const set = new Set(dates);
    const weekKeys = weekDateKeys();
    const weekDates = weekKeys.filter((key) => set.has(key));
    const month = dateKey().slice(0, 7);
    const monthDates = dates.filter((key) => key.startsWith(month));
    return {
      week: weekDates.length,
      weekDates,
      goal: Math.min(7, Math.max(1, Number(data.weeklyGoal) || 4)),
      month: monthDates.length,
      total: dates.length,
      checklist: data.checklist && typeof data.checklist === "object" ? data.checklist : {}
    };
  }

  function formatKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
      .format(new Date(year, month - 1, day, 12));
  }

  function findExercise(message) {
    const text = normalize(message);
    const candidates = [];
    for (const exercise of PF.EXERCISES) {
      const names = [exercise.name, ...(exercise.aliases || [])];
      for (const name of names) {
        const term = normalize(name);
        if (term.length >= 4 && text.includes(term)) candidates.push({ exercise, term });
      }
    }
    candidates.sort((a, b) => b.term.length - a.term.length);
    return candidates[0]?.exercise || null;
  }

  function exerciseAnswer(exercise) {
    const lines = [`**${exercise.name}**`, `Grupo: ${exercise.group}. Equipamento: ${exercise.equip}.`, "", "**Como fazer**"];
    (exercise.how || []).forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    if (exercise.tips?.length) lines.push("", "**Dicas**", ...exercise.tips.map((tip) => `• ${tip}`));
    if (exercise.mistakes?.length) lines.push("", "**Erros comuns para evitar**", ...exercise.mistakes.map((mistake) => `• ${mistake}`));
    lines.push("", "Comece com uma carga confortável e peça a um instrutor para conferir sua execução, especialmente enquanto aprende o movimento.");
    return lines.join("\n");
  }

  function findGroup(message) {
    const text = normalize(message);
    const matches = [];
    for (const [group, aliases] of Object.entries(PF.GROUPS || {})) {
      for (const alias of aliases) {
        const term = normalize(alias);
        if (term.length >= 4 && text.includes(term)) matches.push({ group, term });
      }
    }
    matches.sort((a, b) => b.term.length - a.term.length);
    return matches[0]?.group || null;
  }

  function groupAnswer(group) {
    const names = PF.EXERCISES.filter((exercise) => exercise.group === group).map((exercise) => exercise.name);
    const label = group.charAt(0).toUpperCase() + group.slice(1);
    if (!names.length) return `Não encontrei exercícios cadastrados para ${label}.`;
    return `**Exercícios de ${label} na biblioteca:**\n${names.map((name) => `• ${name}`).join("\n")}\n\nPosso explicar a execução de qualquer um deles. Basta escrever o nome do exercício.`;
  }

  function safeFaq(message) {
    const text = normalize(message);
    if (/aquec|aquecer|warm up/.test(text)) return "**Aquecimento**\nFaça alguns minutos de movimento leve e mobilidade relacionada ao treino. Depois, comece o primeiro exercício com séries leves e aumente gradualmente até a carga de trabalho. O aquecimento deve preparar, não cansar.";
    if (/along|mobilidade/.test(text)) return "**Alongamento e mobilidade**\nA mobilidade dinâmica pode entrar no aquecimento. Alongamentos estáticos podem ser feitos depois do treino ou em outro momento, sem forçar e sem provocar dor. Não precisa transformar cada sessão numa competição de flexibilidade.";
    if (/descanso|intervalo entre serie|quanto descansar/.test(text)) return "**Descanso entre séries**\nUse tempo suficiente para recuperar a respiração e manter a técnica. Movimentos compostos costumam exigir mais descanso do que exercícios isolados. Se a próxima série começa com a execução piorando, descanse mais.";
    if (/dor muscular|dolorido|febre muscular/.test(text)) return "Uma sensibilidade muscular leve pode aparecer depois de um treino novo. Movimento leve e descanso podem ajudar. Dor aguda, forte, em articulação, que piora ou que altera seus movimentos não deve ser ignorada: pare o exercício e fale com um responsável e um profissional de saúde.";
    if (/cardio|aerob|corrida|esteira/.test(text)) return "O cardio pode melhorar o condicionamento e a saúde do coração. Escolha uma atividade de que goste e aumente a duração aos poucos. Ele deve complementar sua rotina, não ser uma punição por comer ou uma forma de compensar refeições.";
    if (/sono|dormir|descansar/.test(text)) return "O sono faz parte do treino: ajuda na recuperação, na concentração e na disposição. Tente manter horários regulares e uma rotina tranquila antes de dormir. Para adolescentes, a recomendação geral costuma ser de 8 a 10 horas por noite.";
    if (/motiv|sem vontade|preguic|desanima/.test(text)) return "Em um dia sem motivação, reduza a meta para algo simples: chegar ao treino, aquecer e avaliar como está se sentindo. Um treino leve ou um dia de descanso também podem ser escolhas válidas. Consistência não significa ignorar cansaço ou dor.";
    if (/iniciante|comecar|primeiro treino|nunca treinei/.test(text)) return "Para começar, priorize aprender os movimentos, usar cargas que consiga controlar e manter dias de descanso. Um instrutor pode montar uma rotina adequada à sua experiência e conferir a técnica. Não precisa começar com treinos longos ou intensos.";
    if (/postura|lombar|joelho|ombro|lesao|lesao/.test(text)) return "Posso dar informações gerais sobre técnica, mas não avaliar lesões. Se há dor aguda, persistente ou que limita o movimento, pare esse exercício e converse com um responsável e um profissional de saúde ou fisioterapeuta.";
    if (/agua|hidrat/.test(text)) return "Mantenha água por perto e beba regularmente ao longo do dia, especialmente quando estiver calor ou suando. A necessidade varia com a pessoa e as condições, então não existe um número único que sirva para todo mundo.";
    if (/quantos dias|frequencia|vezes por semana/.test(text)) return "A frequência depende da experiência, dos outros esportes, do sono e da recuperação. Para muita gente que está começando, 2 a 3 sessões bem organizadas já são um ponto de partida. Um treinador pode ajustar o volume à sua rotina.";
    return null;
  }

  function nutritionBoundary(message) {
    const text = normalize(message);
    return /caloria|calorias|deficit|superavit|emagrec|perder peso|secar|cutting|bulking|dieta restritiv|jejum|macros|imc|peso ideal|quanto devo pesar|creatina|whey|suplement|pre treino|cafeina/.test(text);
  }

  function nutritionAnswer() {
    return "Posso ajudar com informações gerais sobre alimentação, mas não vou definir metas de peso, calorias, macros, dietas restritivas ou doses de suplementos. Isso precisa considerar crescimento, saúde e contexto individual, com orientação de um responsável e de um nutricionista.\n\nComo princípio geral, procure refeições variadas e regulares, com fontes de energia, proteína, frutas ou vegetais e água. Comer bem é parte de cuidar do corpo, não uma prova de disciplina.";
  }

  function painBoundary(message) {
    return /dor forte|dor aguda|dor no peito|desma|tontura|falta de ar|lesao|machuquei|machucado/.test(normalize(message));
  }

  function painAnswer() {
    return "Não tente resolver isso aumentando ou forçando o treino. Pare a atividade e conte a um responsável. Dor no peito, desmaio, falta de ar intensa ou sintomas importantes precisam de avaliação médica imediata. Para dor persistente ou lesão, procure um profissional de saúde.";
  }

  function generatePlan(message) {
    const text = normalize(message);
    const found = text.match(/\b([2-6])\s*(?:dias|vezes|treinos)\b/);
    let days = found ? Number(found[1]) : 3;
    if (days > 4) {
      return "Para uma rotina geral, não vou sugerir automaticamente 5 ou 6 dias de musculação. Mais sessões não significam melhores resultados, especialmente quando recuperação, escola, sono e outros esportes também contam. Posso montar um modelo de 2, 3 ou 4 dias para você revisar com um instrutor.";
    }
    const split = PF.SPLITS?.[days];
    if (!split) return "Consigo montar um modelo de 2, 3 ou 4 dias. Escreva, por exemplo: **montar treino de 3 dias**.";
    const output = [`**Modelo geral de ${days} dias**`, "Use isto como ponto de partida para conversar com um instrutor. Ajuste exercícios, séries e cargas à sua experiência e à técnica."];
    split.forEach(([title, groups], index) => {
      output.push("", `**Dia ${index + 1} — ${title}**`);
      const chosen = [];
      for (const group of groups) {
        const exercise = PF.EXERCISES.find((item) => item.group === group);
        if (exercise && !chosen.some((item) => item.name === exercise.name)) chosen.push(exercise);
      }
      chosen.slice(0, 5).forEach((exercise) => output.push(`• ${exercise.name}`));
    });
    output.push("", "Comece com volume moderado, aprenda a execução antes de aumentar cargas e mantenha dias de recuperação. Se sentir dor, pare o movimento.");
    return output.join("\n");
  }

  function timerCommand(message) {
    const text = normalize(message);
    const timerButton = $("#timerToggle");
    const resetButton = $("#timerReset");
    if (!timerButton || !resetButton) return null;

    if (/\b(pausar|pause|parar|pausa)\b/.test(text) && /timer|cronometro|descanso/.test(text)) {
      if (timerButton.textContent.trim().toLowerCase() === "pausar") {
        timerButton.click();
        return "Timer pausado.";
      }
      return "O timer não está em andamento neste momento.";
    }
    if (/\b(zerar|resetar|reiniciar)\b/.test(text) && /timer|cronometro|descanso/.test(text)) {
      resetButton.click();
      return "Timer zerado.";
    }

    const wantsStart = /\b(iniciar|inicia|comecar|comeca|start|acionar|disparar)\b/.test(text)
      || /timer de|descanso de|cronometro de|timer.*\d+|descanso.*\d+|cronometro.*\d+/.test(text);
    if (!wantsStart || !/timer|cronometro|descanso/.test(text)) return null;

    let seconds = null;
    const secMatch = text.match(/(\d+)\s*(s|seg|segundo|segundos)\b/);
    const minMatch = text.match(/(\d+)\s*(m|min|minuto|minutos)\b/);
    if (secMatch) seconds = Number(secMatch[1]);
    else if (minMatch) seconds = Number(minMatch[1]) * 60;
    else if (/dois minutos|2 min/.test(text)) seconds = 120;
    else if (/um minuto|1 min/.test(text)) seconds = 60;

    if (![30, 60, 90, 120].includes(seconds)) {
      return "Posso iniciar os tempos disponíveis no painel: 30, 60, 90 ou 120 segundos. Escreva, por exemplo, **iniciar descanso de 90 segundos**.";
    }
    const preset = $(`[data-seconds="${seconds}"]`);
    if (!preset) return "Não encontrei esse atalho de tempo na seção Treino.";
    preset.click();
    timerButton.click();
    return `**Descanso de ${seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`} iniciado.** O timer está na seção Treino.`;
  }

  function checklistCommand(message) {
    const text = normalize(message);
    const aliases = [
      ["aquecimento", ["aquecimento", "aquecer"]],
      ["treino-principal", ["treino principal", "musculacao", "musculação"]],
      ["cardio", ["cardio", "aerobico", "aeróbico"]],
      ["alongamento", ["alongamento", "alongar"]],
      ["agua", ["agua", "água", "hidratacao"]]
    ];
    const target = aliases.find(([, words]) => words.some((word) => text.includes(normalize(word))));
    const wantsChange = /\b(marcar|marca|concluir|conclui|fazer|feito|fiz|desmarcar|desmarca)\b/.test(text);
    if (!wantsChange || !target) return null;
    const input = $(`[data-task="${target[0]}"]`);
    if (!input) return "Não encontrei essa tarefa no checklist.";
    const unchecked = /\b(desmarcar|desmarca)\b/.test(text);
    input.checked = !unchecked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return `${unchecked ? "Desmarquei" : "Marquei"} **${target[0].replace("-", " ")}** no checklist.`;
  }

  function navigateCommand(message) {
    const text = normalize(message);
    if (!/\b(abrir|abre|ir para|vai para|mostrar|mostra)\b/.test(text)) return null;
    const sections = [
      ["treino", /treino|exercicio/], ["dashboard", /resumo|painel|estatistica/],
      ["checklist", /checklist|tarefas/], ["plano", /plano|rotina/],
      ["dieta", /dieta|alimentacao/], ["progresso", /progresso|grafico|peso/],
      ["notas", /notas|lembretes/]
    ];
    const match = sections.find(([, pattern]) => pattern.test(text));
    if (!match) return null;
    document.getElementById(match[0])?.scrollIntoView({ behavior: "smooth", block: "start" });
    return `Levei você até a seção **${match[0]}**.`;
  }

  let lastExercise = null;
  let lastGroup = null;

  function answer(message) {
    const text = normalize(message);
    if (!text) return "Escreva uma pergunta para começarmos.";

    const timer = timerCommand(message);
    if (timer) return timer;

    const checklist = checklistCommand(message);
    if (checklist) return checklist;

    const navigation = navigateCommand(message);
    if (navigation) return navigation;

    if (painBoundary(message)) return painAnswer();
    if (nutritionBoundary(message)) return nutritionAnswer();

    if (/^(oi|ola|e ai|opa|bom dia|boa tarde|boa noite|salve)$/.test(text)) {
      return "Olá! Sou o PulseFit Coach local. Posso consultar seu treino, explicar exercícios da biblioteca, acompanhar os registros, mexer no timer e ajudar com o checklist. O que vamos ver?";
    }

    if (/ajuda|o que voce faz|como funciona|comandos|quem e voce/.test(text)) {
      return "**O que consigo fazer**\n• Mostrar o treino de hoje ou de outro dia cadastrado\n• Explicar exercícios, técnica, dicas e erros comuns\n• Listar exercícios por grupo muscular\n• Consultar treinos da semana, do mês e o total registrado\n• Conferir ou marcar tarefas do checklist\n• Iniciar, pausar ou zerar o timer (30, 60, 90 ou 120s)\n• Montar um modelo geral de treino de 2 a 4 dias\n• Dar orientações gerais sobre aquecimento, descanso, sono e recuperação\n\nSou um sistema local baseado em regras e numa biblioteca, não um modelo de IA generativa. Não acesso a internet.";
    }

    if (/treino de hoje|o que treino hoje|qual treino hoje|meu treino hoje/.test(text)) {
      return summarizeCard(getTodayWorkout(), true);
    }

    const dayMap = [
      ["seg", /segunda|\bseg\b/], ["ter", /terca|\bter\b/], ["qua", /quarta|\bqua\b/],
      ["qui", /quinta|\bqui\b/], ["sex", /sexta|\bsex\b/], ["sab", /sabado|\bsab\b/], ["dom", /domingo|\bdom\b/]
    ];
    if (/treino|exercicio|rotina/.test(text)) {
      const dayMatch = dayMap.find(([, pattern]) => pattern.test(text));
      if (dayMatch) {
        const card = workoutCards().find((item) => item.dataset.day === dayMatch[0]);
        return summarizeCard(card, true);
      }
    }

    if (/quantos treinos|treinos fiz|treinos registrados|meu progresso|progresso da semana|estatistica|meta semanal|quantos faltam|faltam quantos/.test(text)) {
      const stats = getStats();
      const dates = stats.weekDates.length ? stats.weekDates.map(formatKey).join(", ") : "nenhum registrado ainda";
      const remaining = Math.max(0, stats.goal - stats.week);
      return `**Seu progresso no PulseFit**\n• Esta semana: **${stats.week}/${stats.goal}** treinos\n• Para atingir a meta semanal: **${remaining}** treino(s)\n• Dias registrados: ${dates}\n• Este mês: **${stats.month}** treinos\n• Total histórico: **${stats.total}** treinos\n\nOs números vêm dos registros salvos neste navegador.`;
    }

    if (/checklist|tarefas de hoje|progresso diario/.test(text)) {
      const stats = getStats();
      const entries = [
        ["aquecimento", "Aquecimento"], ["treino-principal", "Treino principal"],
        ["cardio", "Cardio"], ["alongamento", "Alongamento"], ["agua", "Água"]
      ];
      const done = entries.filter(([key]) => Boolean(stats.checklist[key]));
      return `**Checklist de hoje: ${done.length}/${entries.length}**\n${entries.map(([key, label]) => `${stats.checklist[key] ? "✓" : "○"} ${label}`).join("\n")}`;
    }

    if (/registrar treino|marcar treino de hoje|fiz meu treino/.test(text)) {
      const button = $(".js-register");
      if (button) {
        if (button.getAttribute("aria-pressed") !== "true") button.click();
        return "Registro do treino de hoje atualizado no painel.";
      }
    }

    if (/montar treino|gerar treino|criar treino|fazer um treino|monta um treino/.test(text)) {
      return generatePlan(message);
    }

    const exercise = findExercise(message);
    if (exercise) {
      lastExercise = exercise;
      return exerciseAnswer(exercise);
    }

    if (lastExercise && /(mais dicas|outras dicas|erros comuns|quais erros|e os erros|como executo|como faz ele|como faco ele|me explica melhor|detalha|tecnica|execucao)/.test(text)) {
      if (/erro/.test(text)) {
        return `**Erros comuns no ${lastExercise.name}**\n${(lastExercise.mistakes || []).map((item) => `• ${item}`).join("\n") || "Não há erros catalogados para este exercício."}\n\nFaça o movimento sem pressa e peça para um instrutor observar sua técnica.`;
      }
      if (/dica/.test(text)) {
        return `**Dicas para ${lastExercise.name}**\n${(lastExercise.tips || []).map((item) => `• ${item}`).join("\n") || "Priorize controle e amplitude confortável."}`;
      }
      return exerciseAnswer(lastExercise);
    }

    const group = findGroup(message);
    if (group && /exercicio|treino|musculo|fortalec|trabalha|para/.test(text)) {
      lastGroup = group;
      return groupAnswer(group);
    }
    if (lastGroup && /mais exercicios|outros exercicios|quais exercicios|me da exemplos/.test(text)) return groupAnswer(lastGroup);

    const faq = safeFaq(message);
    if (faq) return faq;

    if (/o que comer|alimentacao|refeicao|lanche|comida/.test(text)) {
      return "Posso ajudar com ideias gerais, sem montar uma dieta rígida: uma refeição variada pode combinar uma fonte de energia (como arroz, pão ou batata), uma fonte de proteína (como ovos, feijão, iogurte, peixe ou frango) e frutas ou vegetais. Considere preferências, alergias e orientação familiar/profissional.";
    }

    return "Ainda não encontrei uma resposta específica para isso na minha biblioteca. Tente perguntar de outro jeito ou use um destes exemplos: **como fazer supino reto**, **o que treino hoje**, **exercícios para costas**, **quantos treinos fiz esta semana** ou **iniciar descanso de 90 segundos**.";
  }

  function appendFormattedText(container, text) {
    const parts = escapeText(text).split(/(\*\*[^*]+\*\*)/g);
    parts.forEach((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        container.appendChild(strong);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    });
  }

  function saveHistory(history) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40))); }
    catch { /* O chat continua funcionando mesmo se o armazenamento estiver bloqueado. */ }
  }

  let history = [];
  function appendMessage(role, text, persist = true) {
    const message = { role, text: String(text), time: Date.now() };
    history.push(message);
    const item = document.createElement("article");
    item.className = `coach-message coach-message--${role}`;
    const label = document.createElement("span");
    label.className = "coach-message__label";
    label.textContent = role === "user" ? "Você" : "PulseFit Coach";
    const bubble = document.createElement("div");
    bubble.className = "coach-message__bubble";
    appendFormattedText(bubble, message.text);
    item.append(label, bubble);
    els.messages.appendChild(item);
    els.messages.scrollTop = els.messages.scrollHeight;
    if (persist) saveHistory(history);
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(saved)) {
        history = saved.filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.text === "string").slice(-40);
      }
    } catch { history = []; }
    if (history.length) history.forEach((item) => appendMessage(item.role, item.text, false));
    else appendMessage("assistant", "Oi! Sou o Coach local do PulseFit. Pergunte sobre seu treino, exercícios, progresso ou timer. Use os atalhos abaixo para começar.", false);
  }

  function setOpen(open) {
    els.panel.hidden = !open;
    els.launcher.setAttribute("aria-expanded", String(open));
    if (open) {
      window.setTimeout(() => els.input.focus(), 50);
      els.messages.scrollTop = els.messages.scrollHeight;
    } else {
      els.launcher.focus();
    }
  }

  function submitMessage(value) {
    const message = String(value || "").trim();
    if (!message) return;
    appendMessage("user", message);
    els.input.value = "";
    els.input.style.height = "auto";
    const response = answer(message);
    appendMessage("assistant", response);
  }

  els.launcher.addEventListener("click", () => setOpen(els.panel.hidden));
  els.close.addEventListener("click", () => setOpen(false));
  els.clear.addEventListener("click", () => {
    history = [];
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* Sem armazenamento, limpa a tela mesmo assim. */ }
    els.messages.replaceChildren();
    appendMessage("assistant", "Conversa limpa. Podemos começar de novo.");
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessage(els.input.value);
  });

  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      els.form.requestSubmit();
    }
  });

  els.input.addEventListener("input", () => {
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(els.input.scrollHeight, 112)}px`;
  });

  els.quick.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prompt]");
    if (button) submitMessage(button.dataset.prompt);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.panel.hidden) setOpen(false);
  });

  loadHistory();
})();
