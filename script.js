/* =========================================================
   PULSEFIT — SCRIPT.JS
   - Tudo salvo no navegador (localStorage), em uma única chave
   - Checklist e exercícios reiniciam sozinhos a cada dia
   - Treinos da semana / mês calculados por data
   - Timer de descanso, gráfico de peso em canvas
   - Backup (exportar / importar) e reset geral
   ========================================================= */

(() => {
  "use strict";

  /* ---------- Constantes ---------- */
  const STORE_KEY = "pulsefit:v2";
  const LEGACY_KEYS = [
    "pulsefit_theme", "pulsefit_checklist", "pulsefit_diet", "pulsefit_notes",
    "pulsefit_progress", "pulsefit_workouts", "pulsefit_motivation_index",
    "pulsefit_graph_points", "pulsefit_last_record"
  ];
  const MAX_POINTS = 30;
  const DAY_CODES = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // semana começa na segunda
  const WEEK_LABELS = { 0: "DOM", 1: "SEG", 2: "TER", 3: "QUA", 4: "QUI", 5: "SEX", 6: "SÁB" };

  const QUOTES = [
    "A disciplina de hoje constrói a versão de amanhã.",
    "Não espere motivação perfeita. Construa consistência.",
    "Treinar bem é repetir o básico com intenção.",
    "Seu corpo responde ao que você faz com regularidade.",
    "O resultado nasce da soma de pequenos acertos.",
    "O treino de hoje é a confiança de amanhã.",
    "Foco no processo. O resultado vem como consequência.",
    "A versão forte de você começa agora."
  ];

  /* ---------- Atalhos ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const byId = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const pad = (n) => String(n).padStart(2, "0");

  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDateTime = (d) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
  const fmtShort = (d) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);

  function weekKeys(ref = new Date()) {
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return dayKey(d);
    });
  }

  /* ---------- Elementos ---------- */
  const els = {
    themeToggle: byId("themeToggle"), themeLabel: byId("themeLabel"),
    resetAll: byId("resetAll"), exportBtn: byId("exportBtn"), importBtn: byId("importBtn"), importFile: byId("importFile"),
    todayLabel: byId("todayLabel"), todayWorkout: byId("todayWorkout"),
    heroQuote: byId("heroQuote"), weekWorkouts: byId("weekWorkouts"), monthProgressText: byId("monthProgressText"),
    statWeek: byId("statWeek"), statMonth: byId("statMonth"), statChecklist: byId("statChecklist"), statTotal: byId("statTotal"),
    trendWeek: byId("trendWeek"), trendMonth: byId("trendMonth"), trendChecklist: byId("trendChecklist"), trendTotal: byId("trendTotal"),
    weeklyGoal: byId("weeklyGoal"), weekStrip: byId("weekStrip"),
    monthBar: byId("monthBar"), monthBarWrap: byId("monthBarWrap"), monthPct: byId("monthPct"), monthHint: byId("monthHint"),
    checklistText: byId("checklistText"), resetChecklist: byId("resetChecklist"),
    timerDisplay: byId("timerDisplay"), timerToggle: byId("timerToggle"), timerReset: byId("timerReset"),
    dietBreakfast: byId("dietBreakfast"), dietLunch: byId("dietLunch"), dietDinner: byId("dietDinner"), dietSnacks: byId("dietSnacks"),
    motivationQuote: byId("motivationQuote"), nextMotivation: byId("nextMotivation"),
    weightInput: byId("weightInput"), heightInput: byId("heightInput"), ageInput: byId("ageInput"), recordInput: byId("recordInput"),
    saveBody: byId("saveBody"), bmiLabel: byId("bmiLabel"), deltaLabel: byId("deltaLabel"),
    chart: byId("chart"), chartWrap: byId("chartWrap"), chartTip: byId("chartTip"), chartEmpty: byId("chartEmpty"), chartSummary: byId("chartSummary"),
    notesField: byId("notesField"), notesCounter: byId("notesCounter"),
    toast: byId("toast")
  };

  /* ---------- Estado ---------- */
  const defaults = () => ({
    theme: null,
    day: dayKey(),
    checklist: {},
    exercises: {},
    workoutDates: [],
    weeklyGoal: 4,
    diet: { breakfast: "", lunch: "", dinner: "", snacks: "" },
    notes: "",
    body: { weight: "", height: "", age: "" },
    points: [],
    lastRecord: "",
    quoteIndex: 0
  });

  function cleanPoint(p) {
    if (!p || typeof p !== "object") return null;
    const weight = Number(p.weight);
    const height = Number(p.height);
    const date = new Date(p.date);
    if (!(weight > 0) || !(height > 0) || Number.isNaN(date.getTime())) return null;
    return { weight, height, date: date.toISOString() };
  }

  function normalize(raw) {
    const d = defaults();
    const r = raw && typeof raw === "object" ? raw : {};
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    return {
      theme: r.theme === "light" || r.theme === "dark" ? r.theme : null,
      day: typeof r.day === "string" ? r.day : d.day,
      checklist: isObj(r.checklist) ? r.checklist : {},
      exercises: isObj(r.exercises) ? r.exercises : {},
      workoutDates: Array.isArray(r.workoutDates)
        ? [...new Set(r.workoutDates.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)))].sort()
        : [],
      weeklyGoal: clamp(parseInt(r.weeklyGoal, 10) || d.weeklyGoal, 1, 7),
      diet: { ...d.diet, ...(isObj(r.diet) ? r.diet : {}) },
      notes: typeof r.notes === "string" ? r.notes : "",
      body: { ...d.body, ...(isObj(r.body) ? r.body : {}) },
      points: Array.isArray(r.points) ? r.points.map(cleanPoint).filter(Boolean).slice(-MAX_POINTS) : [],
      lastRecord: typeof r.lastRecord === "string" ? r.lastRecord : "",
      quoteIndex: Number.isInteger(r.quoteIndex) ? Math.abs(r.quoteIndex) % QUOTES.length : 0
    };
  }

  /* Traz dados da versão antiga do painel, se existirem */
  function migrateLegacy() {
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
    const old = {
      theme: localStorage.getItem("pulsefit_theme"),
      diet: read("pulsefit_diet"),
      notes: localStorage.getItem("pulsefit_notes") || "",
      body: read("pulsefit_progress"),
      points: (read("pulsefit_graph_points") || []).map((p) => ({ ...p })),
      lastRecord: localStorage.getItem("pulsefit_last_record") || ""
    };
    return normalize(old);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch { /* dados corrompidos: começa do zero */ }
    try { return migrateLegacy(); } catch { return defaults(); }
  }

  let state = load();

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch { toast("Não foi possível salvar (armazenamento cheio ou bloqueado).", true); }
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(message, isError = false) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.toggle("is-error", isError);
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  /* ---------- Dia novo = checklist e exercícios zerados ---------- */
  function rollDay() {
    const today = dayKey();
    if (state.day !== today) {
      state.day = today;
      state.checklist = {};
      state.exercises = {};
      save();
    }
  }

  /* ---------- Tema ---------- */
  function renderTheme() {
    const theme = state.theme || document.documentElement.dataset.theme || "dark";
    document.documentElement.dataset.theme = theme;
    els.themeToggle?.setAttribute("aria-pressed", String(theme === "dark"));
    if (els.themeLabel) els.themeLabel.textContent = theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro";
    $('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0b0d" : "#f3f3ee");
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    state.theme = current === "dark" ? "light" : "dark";
    save();
    renderTheme();
    drawChart();
  }

  /* ---------- Checklist ---------- */
  const checklistInputs = () => $$("[data-task]");

  function renderChecklist() {
    const inputs = checklistInputs();
    inputs.forEach((input) => { input.checked = Boolean(state.checklist[input.dataset.task]); });
    const done = inputs.filter((i) => i.checked).length;
    if (els.checklistText) els.checklistText.textContent = `${done}/${inputs.length} concluído`;
  }

  /* ---------- Exercícios do treino ---------- */
  function enhanceWorkouts() {
    $$(".workout-card").forEach((card, ci) => {
      const id = card.dataset.day || `c${ci}`;
      let n = 0;
      $$(".workout-group", card).forEach((group) => {
        const items = $$(".ex-list li", group);
        items.forEach((li) => {
          const key = `${id}-${n++}`;
          const label = document.createElement("label");
          label.className = "ex";
          label.innerHTML =
            `<input type="checkbox" data-ex="${key}"><span class="ex__box" aria-hidden="true"></span><span class="ex__text"></span>`;
          $(".ex__text", label).innerHTML = li.innerHTML;
          li.replaceChildren(label);
        });
        const counter = $(".workout-group__title span", group);
        if (counter) counter.textContent = `${items.length} exercício${items.length === 1 ? "" : "s"}`;
      });
      card.dataset.total = String(n);
    });
  }

  function renderExercises() {
    $$("[data-ex]").forEach((input) => { input.checked = Boolean(state.exercises[input.dataset.ex]); });

    $$(".workout-card").forEach((card) => {
      const boxes = $$("[data-ex]", card);
      const done = boxes.filter((b) => b.checked).length;
      const total = boxes.length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const wrap = $("[data-card-progress]", card);
      if (wrap) {
        $(".bar__fill", wrap).style.width = `${pct}%`;
        $("span", wrap).textContent = `${done}/${total} exercícios feitos`;
      }
    });
  }

  function renderToday() {
    const now = new Date();
    const code = DAY_CODES[now.getDay()];
    const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(now);
    if (els.todayLabel) els.todayLabel.textContent = weekday;

    let todayTitle = "";
    $$(".workout-card").forEach((card) => {
      const isToday = card.dataset.day === code;
      card.classList.toggle("is-today", isToday);
      const badge = $(".today-badge", card);
      if (badge) badge.hidden = !isToday;
      if (isToday && !todayTitle) todayTitle = $("h3", card)?.textContent.trim() || "";
    });
    if (els.todayWorkout) els.todayWorkout.textContent = todayTitle || "Dia de descanso";
  }

  /* ---------- Treinos registrados / estatísticas ---------- */
  function computeStats() {
    const set = new Set(state.workoutDates);
    const weekCount = weekKeys().filter((k) => set.has(k)).length;
    const monthPrefix = dayKey().slice(0, 7);
    const monthCount = state.workoutDates.filter((k) => k.startsWith(monthPrefix)).length;
    const monthGoal = state.weeklyGoal * 4;
    const monthPct = clamp(Math.round((monthCount / monthGoal) * 100), 0, 100);
    return { set, weekCount, monthCount, monthGoal, monthPct, total: state.workoutDates.length };
  }

  function renderWeekStrip(set) {
    if (!els.weekStrip) return;
    const keys = weekKeys();
    const today = dayKey();
    els.weekStrip.innerHTML = WEEK_ORDER.map((dow, i) => {
      const key = keys[i];
      const done = set.has(key);
      const cls = ["day", done ? "is-done" : "", key === today ? "is-today" : ""].filter(Boolean).join(" ");
      const label = `${WEEK_LABELS[dow]}${done ? " — treino feito" : ""}${key === today ? " (hoje)" : ""}`;
      return `<li class="${cls}" aria-label="${label}"><span>${WEEK_LABELS[dow]}</span><span class="day__dot" aria-hidden="true">${done ? "✓" : ""}</span></li>`;
    }).join("");
  }

  function renderRegisterButtons() {
    const done = state.workoutDates.includes(dayKey());
    $$(".js-register").forEach((btn) => {
      btn.textContent = done ? "Treino de hoje registrado ✓" : "Registrar treino de hoje";
      btn.classList.toggle("is-done", done);
      btn.setAttribute("aria-pressed", String(done));
      btn.title = done ? "Clique para desfazer o registro de hoje" : "";
    });
  }

  function renderStats() {
    const s = computeStats();
    const inputs = checklistInputs();
    const checkDone = inputs.filter((i) => i.checked).length;

    if (els.weeklyGoal) els.weeklyGoal.value = String(state.weeklyGoal);
    renderWeekStrip(s.set);
    renderRegisterButtons();

    els.statWeek.textContent = `${s.weekCount}/${state.weeklyGoal}`;
    els.statMonth.textContent = `${s.monthPct}%`;
    els.statChecklist.textContent = `${checkDone}/${inputs.length}`;
    els.statTotal.textContent = String(s.total);

    els.weekWorkouts.textContent = `${s.weekCount}/${state.weeklyGoal}`;
    els.monthProgressText.textContent = `${s.monthPct}%`;

    els.monthPct.textContent = `${s.monthPct}%`;
    els.monthBar.style.width = `${s.monthPct}%`;
    els.monthBarWrap.setAttribute("aria-valuenow", String(s.monthPct));
    els.monthHint.textContent = `${s.monthCount} de ${s.monthGoal} treinos no mês (meta semanal × 4).`;

    els.trendWeek.textContent = s.weekCount >= state.weeklyGoal ? "Meta batida 🔥" : s.weekCount > 0 ? "Bom caminho" : "Em construção";
    els.trendMonth.textContent = s.monthPct >= 70 ? "Muito forte" : s.monthPct >= 40 ? "Em evolução" : "Ganhos iniciais";
    els.trendChecklist.textContent = checkDone === inputs.length && inputs.length ? "Tudo feito" : "Rotina diária";
    els.trendTotal.textContent = s.total >= 50 ? "Veterano" : s.total >= 10 ? "Criando hábito" : "Comece hoje";
  }

  function toggleWorkoutToday() {
    const key = dayKey();
    const i = state.workoutDates.indexOf(key);
    if (i >= 0) {
      state.workoutDates.splice(i, 1);
      toast("Registro de hoje removido");
    } else {
      state.workoutDates.push(key);
      state.workoutDates.sort();
      toast("Treino registrado! 💪");
    }
    save();
    renderStats();
  }

  /* ---------- Frases ---------- */
  function renderQuote() {
    const text = QUOTES[state.quoteIndex % QUOTES.length];
    if (els.motivationQuote) els.motivationQuote.textContent = text;
    if (els.heroQuote) els.heroQuote.textContent = text;
  }

  function nextQuote() {
    state.quoteIndex = (state.quoteIndex + 1) % QUOTES.length;
    save();
    renderQuote();
  }

  /* ---------- Campos de texto (dieta, notas, corpo) ---------- */
  function renderFields() {
    els.dietBreakfast.value = state.diet.breakfast;
    els.dietLunch.value = state.diet.lunch;
    els.dietDinner.value = state.diet.dinner;
    els.dietSnacks.value = state.diet.snacks;

    els.notesField.value = state.notes;
    updateNotesCounter();

    els.weightInput.value = state.body.weight;
    els.heightInput.value = state.body.height;
    els.ageInput.value = state.body.age;
    els.recordInput.value = state.lastRecord;
    renderBodyFacts();
  }

  function updateNotesCounter() {
    const n = els.notesField.value.length;
    els.notesCounter.textContent = `${n} caractere${n === 1 ? "" : "s"}`;
  }

  /* ---------- Corpo / IMC ---------- */
  function readBody() {
    const weight = parseFloat(String(els.weightInput.value).replace(",", "."));
    let height = parseFloat(String(els.heightInput.value).replace(",", "."));
    if (height > 3) height /= 100; // aceita 178 como 1,78 m
    const age = parseInt(els.ageInput.value, 10);
    return { weight, height, age };
  }

  function bmiClass(bmi) {
    if (bmi < 18.5) return "Abaixo do peso";
    if (bmi < 25) return "Peso normal";
    if (bmi < 30) return "Sobrepeso";
    return "Obesidade";
  }

  function renderBodyFacts() {
    const { weight, height } = readBody();
    if (weight > 0 && height > 0) {
      const bmi = weight / (height * height);
      els.bmiLabel.textContent = `${bmi.toFixed(1)} · ${bmiClass(bmi)}`;
    } else {
      els.bmiLabel.textContent = "—";
    }

    const pts = state.points;
    if (pts.length >= 2) {
      const diff = pts[pts.length - 1].weight - pts[0].weight;
      els.deltaLabel.textContent = `${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg`;
    } else {
      els.deltaLabel.textContent = "—";
    }
  }

  function saveBody() {
    const { weight, height, age } = readBody();
    const validWeight = weight >= 20 && weight <= 400;
    const validHeight = height >= 0.8 && height <= 2.5;

    if (!validWeight || !validHeight) {
      toast("Informe peso (20–400 kg) e altura (0,8–2,5 m).", true);
      (validWeight ? els.heightInput : els.weightInput).focus();
      return;
    }

    state.body = {
      weight: String(weight),
      height: String(Math.round(height * 100) / 100),
      age: age > 0 ? String(age) : ""
    };

    // Um ponto por dia: salvar de novo no mesmo dia substitui o anterior
    const today = dayKey();
    state.points = state.points.filter((p) => dayKey(new Date(p.date)) !== today);
    state.points.push({ weight, height, date: new Date().toISOString() });
    state.points = state.points.slice(-MAX_POINTS);

    state.lastRecord = fmtDateTime(new Date());
    els.recordInput.value = state.lastRecord;
    save();
    renderBodyFacts();
    drawChart();
    toast("Registro salvo");
  }

  /* ---------- Gráfico ---------- */
  let coords = [];
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function hideTip() { if (els.chartTip) els.chartTip.hidden = true; }

  function drawChart() {
    const canvas = els.chart;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pts = state.points;
    coords = [];
    els.chartEmpty.hidden = pts.length > 0;
    if (!pts.length) {
      hideTip();
      els.chartSummary.textContent = "";
      return;
    }

    const line = cssVar("--line-strong") || "rgba(255,255,255,.18)";
    const muted = cssVar("--muted") || "#999";
    const accent = cssVar("--accent") || "#c8ff2e";
    const hot = cssVar("--hot") || "#ff5a1f";

    const padL = 46, padR = 18, padT = 20, padB = 30;
    const pw = w - padL - padR;
    const ph = h - padT - padB;

    const weights = pts.map((p) => p.weight);
    let min = Math.min(...weights);
    let max = Math.max(...weights);
    if (max - min < 2) { min -= 1; max += 1; }
    else { const m = (max - min) * 0.2; min -= m; max += m; }

    const yOf = (v) => padT + ph - ((v - min) / (max - min)) * ph;
    const xOf = (i) => padL + (pts.length === 1 ? pw / 2 : (pw * i) / (pts.length - 1));

    // Grade horizontal + rótulos do eixo Y
    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4;
      const y = yOf(v);
      ctx.strokeStyle = line;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = muted;
      ctx.fillText(v.toFixed(1), padL - 8, y);
    }

    coords = pts.map((point, i) => ({ x: xOf(i), y: yOf(point.weight), point }));

    // Área
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, "rgba(200,255,46,.28)");
    grad.addColorStop(1, "rgba(200,255,46,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(coords[0].x, h - padB);
    coords.forEach((c) => ctx.lineTo(c.x, c.y));
    ctx.lineTo(coords[coords.length - 1].x, h - padB);
    ctx.closePath();
    ctx.fill();

    // Linha
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    coords.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.stroke();

    // Pontos
    coords.forEach((c, i) => {
      const last = i === coords.length - 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, last ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = last ? hot : cssVar("--surface") || "#16161a";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = last ? hot : accent;
      ctx.stroke();
    });

    // Datas (primeira e última)
    ctx.fillStyle = muted;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(fmtShort(new Date(pts[0].date)), padL, h - 8);
    if (pts.length > 1) {
      ctx.textAlign = "right";
      ctx.fillText(fmtShort(new Date(pts[pts.length - 1].date)), w - padR, h - 8);
    }

    const lastPt = pts[pts.length - 1];
    els.chartSummary.textContent = `${pts.length} registro${pts.length === 1 ? "" : "s"}. Último peso: ${lastPt.weight.toFixed(1)} quilos.`;
  }

  function pointAt(event) {
    const rect = els.chart.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestDist = 20;
    coords.forEach((c) => {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < bestDist) { best = c; bestDist = d; }
    });
    return best;
  }

  function showTip(event) {
    const hit = pointAt(event);
    if (!hit) { hideTip(); return; }
    const p = hit.point;
    els.chartTip.innerHTML =
      `<strong>${p.weight.toFixed(1)} kg</strong><br>Altura: ${p.height.toFixed(2)} m<br>${fmtDateTime(new Date(p.date))}`;
    els.chartTip.hidden = false;
    const wrapW = els.chartWrap.clientWidth;
    const tipHalf = els.chartTip.offsetWidth / 2;
    els.chartTip.style.left = `${clamp(hit.x, tipHalf + 4, wrapW - tipHalf - 4)}px`;
    els.chartTip.style.top = `${hit.y}px`;
  }

  /* ---------- Timer de descanso ---------- */
  const timer = { preset: 60, left: 60, end: 0, id: null };

  function renderTimer() {
    const m = Math.floor(timer.left / 60);
    const s = timer.left % 60;
    els.timerDisplay.textContent = `${pad(m)}:${pad(s)}`;
    els.timerToggle.textContent = timer.id ? "Pausar" : timer.left === 0 || timer.left === timer.preset ? "Iniciar" : "Continuar";
  }

  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      [0, 0.25, 0.5].forEach((t) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ac.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.18);
        osc.connect(gain).connect(ac.destination);
        osc.start(ac.currentTime + t);
        osc.stop(ac.currentTime + t + 0.2);
      });
      setTimeout(() => ac.close(), 1200);
    } catch { /* som é opcional */ }
  }

  function stopTimer() { clearInterval(timer.id); timer.id = null; }

  function tick() {
    timer.left = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
    if (timer.left === 0) {
      stopTimer();
      els.timerDisplay.classList.add("is-done");
      beep();
      navigator.vibrate?.([200, 100, 200]);
      toast("Descanso finalizado — próxima série!");
    }
    renderTimer();
  }

  function toggleTimer() {
    els.timerDisplay.classList.remove("is-done");
    if (timer.id) { stopTimer(); renderTimer(); return; }
    if (timer.left === 0) timer.left = timer.preset;
    timer.end = Date.now() + timer.left * 1000;
    timer.id = setInterval(tick, 250);
    renderTimer();
  }

  function resetTimer() {
    stopTimer();
    timer.left = timer.preset;
    els.timerDisplay.classList.remove("is-done");
    renderTimer();
  }

  function setPreset(seconds) {
    timer.preset = seconds;
    $$(".chip-btn[data-seconds]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.seconds) === seconds)));
    resetTimer();
  }

  /* ---------- Backup / reset ---------- */
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pulsefit-backup-${dayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Backup exportado");
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = normalize(JSON.parse(String(reader.result)));
        save();
        renderAll();
        toast("Backup importado");
      } catch {
        toast("Arquivo de backup inválido.", true);
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm("Apagar TODOS os dados salvos deste painel? Essa ação não pode ser desfeita.")) return;
    try {
      localStorage.removeItem(STORE_KEY);
      LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    state = defaults();
    state.theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    save();
    resetTimer();
    renderAll();
    toast("Dados apagados");
  }

  /* ---------- Render geral ---------- */
  function renderAll() {
    rollDay();
    renderTheme();
    renderChecklist();
    renderExercises();
    renderToday();
    renderFields();
    renderQuote();
    renderStats();
    drawChart();
  }

  /* ---------- Eventos ---------- */
  function bindEvents() {
    els.themeToggle.addEventListener("click", toggleTheme);
    els.resetAll.addEventListener("click", resetAll);
    els.exportBtn.addEventListener("click", exportData);
    els.importBtn.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", () => { importData(els.importFile.files[0]); els.importFile.value = ""; });

    $$(".js-register").forEach((btn) => btn.addEventListener("click", toggleWorkoutToday));
    els.nextMotivation.addEventListener("click", nextQuote);
    els.saveBody.addEventListener("click", saveBody);

    els.weeklyGoal.addEventListener("change", () => {
      state.weeklyGoal = clamp(parseInt(els.weeklyGoal.value, 10) || 4, 1, 7);
      save();
      renderStats();
    });

    els.resetChecklist.addEventListener("click", () => {
      state.checklist = {};
      save();
      renderChecklist();
      renderStats();
    });

    // Checklist e exercícios (um único listener)
    document.addEventListener("change", (event) => {
      const t = event.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.dataset.task) {
        state.checklist[t.dataset.task] = t.checked;
        save();
        renderChecklist();
        renderStats();
      } else if (t.dataset.ex) {
        if (t.checked) state.exercises[t.dataset.ex] = true;
        else delete state.exercises[t.dataset.ex];
        save();
        renderExercises();
      }
    });

    // Dieta
    const dietMap = [
      [els.dietBreakfast, "breakfast"], [els.dietLunch, "lunch"],
      [els.dietDinner, "dinner"], [els.dietSnacks, "snacks"]
    ];
    let dietTimer;
    dietMap.forEach(([field, key]) => {
      field.addEventListener("input", () => {
        state.diet[key] = field.value;
        clearTimeout(dietTimer);
        dietTimer = setTimeout(save, 300);
      });
    });

    // Notas
    let notesTimer;
    els.notesField.addEventListener("input", () => {
      updateNotesCounter();
      state.notes = els.notesField.value;
      clearTimeout(notesTimer);
      notesTimer = setTimeout(save, 300);
    });

    // Corpo
    [els.weightInput, els.heightInput, els.ageInput].forEach((input) => {
      input.addEventListener("input", renderBodyFacts);
    });

    // Gráfico
    els.chart.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") showTip(e); });
    els.chart.addEventListener("pointerdown", showTip);
    els.chart.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTip(); });
    document.addEventListener("pointerdown", (e) => {
      if (!els.chartWrap.contains(e.target)) hideTip();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

    let raf;
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawChart); }).observe(els.chartWrap);
    } else {
      window.addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawChart); });
    }

    // Timer
    els.timerToggle.addEventListener("click", toggleTimer);
    els.timerReset.addEventListener("click", resetTimer);
    $$(".chip-btn[data-seconds]").forEach((b) => b.addEventListener("click", () => setPreset(Number(b.dataset.seconds))));

    // Voltou para a aba (ex.: virou o dia): atualiza tudo
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        renderAll();
        if (timer.id) tick();
      }
    });
  }

  /* ---------- Extras: menu ativo e animação de entrada ---------- */
  function setupObservers() {
    const sections = $$("main section[id]");
    const links = new Map($$(".nav a").map((a) => [a.getAttribute("href").slice(1), a]));

    if ("IntersectionObserver" in window) {
      const navObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.removeAttribute("aria-current"));
          links.get(entry.target.id)?.setAttribute("aria-current", "true");
        });
      }, { rootMargin: "-40% 0px -55% 0px" });
      sections.forEach((s) => navObserver.observe(s));

      const revealObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { entry.target.classList.add("in"); obs.unobserve(entry.target); }
        });
      }, { threshold: 0.08 });
      sections.forEach((s) => { s.classList.add("reveal"); revealObserver.observe(s); });
    }
  }

  /* ---------- Início ---------- */
  function init() {
    enhanceWorkouts();
    bindEvents();
    renderAll();
    renderTimer();
    setupObservers();

    // Troca a frase automaticamente (só com a aba visível)
    setInterval(() => { if (!document.hidden) { state.quoteIndex = (state.quoteIndex + 1) % QUOTES.length; renderQuote(); } }, 20000);
  }

  init();
})();