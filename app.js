/* What If Studio — local-first interactive story workspace */
(function () {
  "use strict";

  const STORAGE_KEY = "what-if-studio.v1";
  const SETTINGS_KEY = "what-if-studio.settings.v1";
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const dateLabel = (value) => {
    try { return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
    catch (_) { return "agora"; }
  };
  const defaultState = () => ({ projects: [], activeProjectId: null });
  let state = loadState();
  let activeView = "dashboard";
  let activeTab = "overview";
  let activeEpisodeId = null;
  let supabaseClient = null;
  let signedInUser = null;
  let cloudSyncTimer = null;
  let toastTimer = null;

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (parsed && Array.isArray(parsed.projects)) return parsed;
    } catch (error) { console.warn("Could not read local workspace", error); }
    return defaultState();
  }

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
    catch (_) { return {}; }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function currentProject() {
    return state.projects.find((project) => project.id === state.activeProjectId) || null;
  }

  function save(allowCloud) {
    if (allowCloud !== false) { const active = currentProject(); if (active) active.updatedAt = new Date().toISOString(); }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const label = $("#save-status");
    if (label) label.textContent = "Salvo neste dispositivo";
    if (allowCloud !== false && signedInUser && supabaseClient) scheduleCloudSync();
  }

  function notify(message, kind) {
    const root = $("#toast-root");
    if (!root) return;
    root.innerHTML = '<div class="toast ' + escapeHtml(kind || "info") + '">' + escapeHtml(message) + '</div>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { root.innerHTML = ""; }, 3600);
  }

  function openModal(content) {
    $("#modal-root").innerHTML = '<div class="modal-backdrop" data-action="close-modal"><section class="modal-card" role="dialog" aria-modal="true" onclick="event.stopPropagation()">' + content + '</section></div>';
  }

  function closeModal() {
    $("#modal-root").innerHTML = "";
  }

  function makeEpisode(number) {
    return {
      id: uid(),
      number: number,
      title: "Episódio " + number,
      summary: "",
      script: "",
      caption: "",
      pinnedComment: "",
      storyPoll: "",
      scenes: [],
      pollId: null,
      status: "Rascunho"
    };
  }

  function createProject(data) {
    const now = new Date().toISOString();
    const project = {
      id: uid(),
      title: data.title || "Nova história",
      premise: data.premise || "",
      format: data.format || "E se?",
      platform: data.platform || "TikTok / Reels / Shorts",
      language: data.language || "Português (Brasil)",
      duration: data.duration || "60–90 segundos",
      tone: data.tone || "Mistério cinematográfico",
      audience: data.audience || "Público geral",
      status: "Em desenvolvimento",
      createdAt: now,
      updatedAt: now,
      world: { setting: "", rules: [], visualStyle: "" },
      characters: [],
      episodes: [makeEpisode(1)],
      polls: [],
      continuity: [],
      sources: []
    };
    state.projects.unshift(project);
    state.activeProjectId = project.id;
    activeView = "editor";
    activeTab = "overview";
    activeEpisodeId = null;
    save();
    render();
    notify("Projeto criado. Agora desenvolva o universo.", "success");
  }

  function openProject(id) {
    state.activeProjectId = id;
    activeView = "editor";
    activeTab = "overview";
    activeEpisodeId = null;
    save(false);
    render();
  }

  function setPath(object, path, value) {
    const parts = path.split(".");
    let target = object;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!target[parts[index]]) target[parts[index]] = {};
      target = target[parts[index]];
    }
    target[parts[parts.length - 1]] = value;
  }

  function render() {
    const project = currentProject();
    const navView = activeView === "editor" ? "projects" : activeView;
    $$("[data-nav]").forEach((item) => item.classList.toggle("active", item.dataset.nav === navView));
    const title = activeView === "editor" && project ? project.title : activeView === "projects" ? "Projetos" : activeView === "settings" ? "Configurações" : "Visão geral";
    $("#page-title").textContent = title;
    $("#save-status").textContent = signedInUser ? "Sincronização ativada" : "Salvo neste dispositivo";
    const root = $("#app");
    if (activeView === "editor" && project) root.innerHTML = renderEditor(project);
    else if (activeView === "projects") root.innerHTML = renderProjects();
    else if (activeView === "settings") root.innerHTML = renderSettings();
    else root.innerHTML = renderDashboard();
  }

  function renderDashboard() {
    const totalEpisodes = state.projects.reduce((sum, project) => sum + project.episodes.length, 0);
    const totalPolls = state.projects.reduce((sum, project) => sum + project.polls.length, 0);
    const recent = state.projects.slice(0, 3);
    return '<div class="page-stack">' +
      '<section class="hero-panel"><div class="hero-copy"><span class="eyebrow">ESTÚDIO DE NARRATIVAS INTERATIVAS</span><h1>Histórias que <span>mudam com o público.</span></h1><p>Crie universos, escreva episódios e transforme escolhas da audiência em consequências reais para a próxima parte.</p><button class="button button-primary" data-action="new-project"><span class="button-icon">＋</span> Criar projeto <span>→</span></button></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="hero-spark">✦</div><div class="hero-card"><span>WHAT IF</span><strong>01</strong><small>YOUR STORY<br>YOUR RULES</small></div><div class="hero-dot"></div></div></section>' +
      '<section class="stats-grid"><article class="stat-card"><span class="stat-icon purple">▧</span><div><strong>' + state.projects.length + '</strong><span>Projetos</span></div></article><article class="stat-card"><span class="stat-icon blue">▶</span><div><strong>' + totalEpisodes + '</strong><span>Episódios</span></div></article><article class="stat-card"><span class="stat-icon amber">◉</span><div><strong>' + totalPolls + '</strong><span>Enquetes</span></div></article><article class="stat-card"><span class="stat-icon green">↗</span><div><strong>' + (signedInUser ? "ON" : "LOCAL") + '</strong><span>Sincronização</span></div></article></section>' +
      '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">SEU ESPAÇO DE TRABALHO</span><h2>Projetos recentes</h2></div><button class="button button-ghost" data-action="navigate" data-view="projects">Ver todos <span>→</span></button></div>' +
      (recent.length ? '<div class="project-grid">' + recent.map(renderProjectCard).join("") + '</div>' : '<div class="empty-state"><div class="empty-illustration">✦</div><h3>Seu próximo universo começa aqui.</h3><p>Crie uma premissa, defina as regras do mundo e construa uma história que evolui a cada votação.</p><button class="button button-primary" data-action="new-project">Criar minha primeira história</button></div>') +
      '</section></div>';
  }

  function renderProjectCard(project) {
    return '<button class="project-card" data-action="open-project" data-id="' + escapeHtml(project.id) + '"><div class="project-card-top"><span class="project-tag">' + escapeHtml(project.format) + '</span><span class="project-arrow">↗</span></div><h3>' + escapeHtml(project.title) + '</h3><p>' + escapeHtml(project.premise || "Adicione uma premissa para definir a direção desta história.") + '</p><div class="project-card-foot"><span>' + project.episodes.length + ' episódio(s)</span><span>' + dateLabel(project.updatedAt) + '</span></div></button>';
  }

  function renderProjects() {
    return '<div class="page-stack"><div class="section-heading"><div><span class="eyebrow">BIBLIOTECA</span><h1>Todos os projetos</h1><p class="muted">Cada projeto guarda seu universo, personagens, episódios e decisões.</p></div><button class="button button-primary" data-action="new-project">＋ Novo projeto</button></div>' +
      (state.projects.length ? '<div class="project-grid">' + state.projects.map(renderProjectCard).join("") + '</div>' : '<div class="empty-state"><div class="empty-illustration">▧</div><h3>Nenhum projeto por enquanto</h3><p>Comece com uma ideia simples. O universo pode crescer depois.</p><button class="button button-primary" data-action="new-project">Criar projeto</button></div>') +
      '</div>';
  }

  function renderEditor(project) {
    const tabs = [
      ["overview", "Visão geral"], ["episodes", "Episódios"], ["characters", "Personagens"],
      ["universe", "Universo"], ["polls", "Enquetes"], ["continuity", "Continuidade"], ["sources", "Fontes"], ["export", "Exportar"]
    ];
    return '<div class="page-stack editor-stack"><div class="editor-topline"><button class="text-button" data-action="navigate" data-view="projects">← Projetos</button><span class="project-tag">' + escapeHtml(project.format) + '</span><span class="status-pill">' + escapeHtml(project.status) + '</span><span class="spacer"></span><button class="button button-secondary button-small" data-action="generate-project">✦ Desenvolver com IA</button></div>' +
      '<div class="editor-heading"><div><h1>' + escapeHtml(project.title) + '</h1><p>' + escapeHtml(project.premise || "Uma história em construção.") + '</p></div><div class="editor-metrics"><span><b>' + project.episodes.length + '</b> episódios</span><span><b>' + project.characters.length + '</b> personagens</span><span><b>' + project.polls.length + '</b> enquetes</span></div></div>' +
      '<nav class="tabs">' + tabs.map((tab) => '<button class="tab-button ' + (activeTab === tab[0] ? "active" : "") + '" data-action="switch-tab" data-tab="' + tab[0] + '">' + tab[1] + '</button>').join("") + '</nav>' +
      '<div class="tab-content">' + renderTab(project) + '</div></div>';
  }

  function renderTab(project) {
    if (activeTab === "episodes") return renderEpisodes(project);
    if (activeTab === "characters") return renderCharacters(project);
    if (activeTab === "universe") return renderUniverse(project);
    if (activeTab === "polls") return renderPolls(project);
    if (activeTab === "continuity") return renderContinuity(project);
    if (activeTab === "sources") return renderSources(project);
    if (activeTab === "export") return renderExport(project);
    return renderOverview(project);
  }

  function field(label, path, value, placeholder, type) {
    const tag = type === "textarea" ? '<textarea data-bind="' + path + '" placeholder="' + escapeHtml(placeholder || "") + '">' + escapeHtml(value || "") + '</textarea>' : '<input data-bind="' + path + '" value="' + escapeHtml(value || "") + '" placeholder="' + escapeHtml(placeholder || "") + '">';
    return '<label class="field"><span>' + label + '</span>' + tag + '</label>';
  }

  function episodeField(label, key, value, placeholder, type) {
    const tag = type === "textarea"
      ? '<textarea data-episode-field="' + key + '" placeholder="' + escapeHtml(placeholder || "") + '">' + escapeHtml(value || "") + '</textarea>'
      : '<input data-episode-field="' + key + '" value="' + escapeHtml(value || "") + '" placeholder="' + escapeHtml(placeholder || "") + '">';
    return '<label class="field"><span>' + label + '</span>' + tag + '</label>';
  }

  function renderOverview(project) {
    return '<div class="two-column"><section class="panel"><div class="panel-heading"><div><span class="eyebrow">PONTO DE PARTIDA</span><h2>Identidade da história</h2></div><span class="panel-icon">✦</span></div><div class="form-grid">' +
      field("Título", "title", project.title, "Nome da história") +
      field("Premissa", "premise", project.premise, "O que acontece neste universo?", "textarea") +
      '<label class="field"><span>Formato</span><select data-bind="format">' + ["E se?", "História interativa", "Terror e mistério", "Ficção científica", "História alternativa", "Drama", "Comédia", "Documentário / curiosidades", "Personalizado"].map((item) => '<option ' + (project.format === item ? "selected" : "") + '>' + item + '</option>').join("") + '</select></label>' +
      '<label class="field"><span>Plataforma</span><select data-bind="platform">' + ["TikTok / Reels / Shorts", "YouTube", "Podcast", "Web", "Outra"].map((item) => '<option ' + (project.platform === item ? "selected" : "") + '>' + item + '</option>').join("") + '</select></label>' +
      '<label class="field"><span>Duração por episódio</span><select data-bind="duration">' + ["Até 30 segundos", "30–60 segundos", "60–90 segundos", "2–3 minutos", "5–10 minutos", "Livre"].map((item) => '<option ' + (project.duration === item ? "selected" : "") + '>' + item + '</option>').join("") + '</select></label>' +
      '<label class="field"><span>Tom</span><input data-bind="tone" value="' + escapeHtml(project.tone) + '" placeholder="Ex.: suspense, humor, documental"></label>' +
      '</div><div class="save-hint"><span class="live-dot"></span> Alterações salvas automaticamente neste dispositivo.</div></section>' +
      '<aside class="panel panel-accent"><span class="eyebrow">PRÓXIMOS PASSOS</span><h2>Construa com intenção.</h2><p>Uma boa história interativa tem regras claras, escolhas com consequências e continuidade entre episódios.</p><div class="check-row"><span class="' + (project.world.rules.length ? "check-done" : "") + '">✓</span><span>Definir as regras do universo</span></div><div class="check-row"><span class="' + (project.characters.length ? "check-done" : "") + '">✓</span><span>Criar personagens</span></div><div class="check-row"><span class="' + (project.episodes.some((episode) => episode.script) ? "check-done" : "") + '">✓</span><span>Escrever o primeiro roteiro</span></div><div class="check-row"><span class="' + (project.polls.length ? "check-done" : "") + '">✓</span><span>Preparar uma votação</span></div><button class="button button-primary button-wide" data-action="generate-project">✦ Desenvolver estrutura com IA</button></aside></div>' +
      '<section class="panel"><div class="panel-heading"><div><span class="eyebrow">LINHA DO TEMPO</span><h2>Seus episódios</h2></div><button class="button button-secondary button-small" data-action="switch-tab" data-tab="episodes">Abrir episódios →</button></div>' +
      '<div class="episode-mini-list">' + project.episodes.slice(0, 4).map((episode) => '<button class="episode-mini" data-action="select-episode" data-id="' + escapeHtml(episode.id) + '"><span class="episode-number">' + String(episode.number).padStart(2, "0") + '</span><span class="episode-mini-copy"><b>' + escapeHtml(episode.title) + '</b><small>' + escapeHtml(episode.summary || "Sem resumo ainda") + '</small></span><span class="muted">→</span></button>').join("") + '</div></section>';
  }

  function renderEpisodes(project) {
    const episode = project.episodes.find((item) => item.id === activeEpisodeId);
    if (!episode) return '<div class="section-heading"><div><span class="eyebrow">NARRATIVA</span><h2>Estrutura de episódios</h2><p class="muted">Cada episódio deve avançar a história e deixar uma pergunta para o próximo.</p></div><button class="button button-primary" data-action="add-episode">＋ Novo episódio</button></div>' +
      (project.episodes.length ? '<div class="episode-list">' + project.episodes.map((item) => '<article class="episode-row"><button class="episode-open" data-action="select-episode" data-id="' + escapeHtml(item.id) + '"><span class="episode-number">' + String(item.number).padStart(2, "0") + '</span><span class="episode-mini-copy"><b>' + escapeHtml(item.title) + '</b><small>' + escapeHtml(item.summary || "Adicione um resumo e comece o roteiro.") + '</small></span><span class="status-pill">' + escapeHtml(item.status) + '</span><span class="muted">→</span></button></article>').join("") + '</div>' : '<div class="empty-state"><h3>Sem episódios</h3><p>Adicione o primeiro capítulo da sua história.</p></div>');
    return '<div class="section-heading"><div><button class="text-button" data-action="back-episodes">← Todos os episódios</button><h2>' + escapeHtml(episode.title) + '</h2></div><button class="button button-secondary button-small" data-action="generate-episode">✦ Gerar roteiro com IA</button></div>' +
      '<div class="two-column"><section class="panel"><div class="form-grid">' + episodeField("Título", "title", episode.title, "Nome do episódio") + episodeField("Resumo", "summary", episode.summary, "O que muda neste episódio?", "textarea") + episodeField("Roteiro completo", "script", episode.script, "Narração, falas, ações e texto na tela...", "textarea") + '</div><div class="save-hint"><span class="live-dot"></span> Roteiro salvo automaticamente.</div></section>' +
      '<aside class="panel panel-soft"><span class="eyebrow">PRODUÇÃO</span><h3>Detalhes do episódio</h3><label class="field"><span>Status</span><select data-episode-field="status"><option ' + (episode.status === "Rascunho" ? "selected" : "") + '>Rascunho</option><option ' + (episode.status === "Em revisão" ? "selected" : "") + '>Em revisão</option><option ' + (episode.status === "Pronto" ? "selected" : "") + '>Pronto</option><option ' + (episode.status === "Publicado" ? "selected" : "") + '>Publicado</option></select></label><p class="muted small">Dica: descreva o que aparece na tela, o áudio e a informação que o público precisa entender em cada momento.</p><button class="button button-ghost button-wide" data-action="add-scene">＋ Adicionar bloco de cena</button><button class="button button-danger-ghost button-wide" data-action="delete-episode">Excluir episódio</button></aside></div>' +
      '<section class="panel"><div class="panel-heading"><div><span class="eyebrow">DECUPAGEM</span><h2>Cenas e produção</h2></div><button class="button button-secondary button-small" data-action="add-scene">＋ Cena</button></div>' +
      (episode.scenes.length ? '<div class="scene-grid">' + episode.scenes.map((scene, index) => '<article class="scene-card"><div class="scene-card-top"><span class="scene-index">CENA ' + String(index + 1).padStart(2, "0") + '</span><button class="icon-button danger-text" data-action="delete-scene" data-id="' + escapeHtml(scene.id) + '" title="Excluir cena">×</button></div><label class="field"><span>Nome da cena</span><input data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="title" value="' + escapeHtml(scene.title) + '"></label><label class="field"><span>Visual / câmera</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="visual" placeholder="O que aparece?">' + escapeHtml(scene.visual) + '</textarea></label><label class="field"><span>Prompt de imagem</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="imagePrompt" placeholder="Descrição visual para gerar uma imagem...">' + escapeHtml(scene.imagePrompt) + '</textarea></label><label class="field"><span>Direção de vídeo / câmera</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="videoPrompt" placeholder="Movimento, enquadramento, transição...">' + escapeHtml(scene.videoPrompt) + '</textarea></label><label class="field"><span>Narração / diálogo</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="audio" placeholder="O que é dito ou ouvido?">' + escapeHtml(scene.audio) + '</textarea></label><label class="field"><span>Direção de áudio</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="audioDirection" placeholder="Interpretação, ritmo, intensidade...">' + escapeHtml(scene.audioDirection) + '</textarea></label><label class="field"><span>Texto na tela</span><input data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="onScreen" value="' + escapeHtml(scene.onScreen) + '" placeholder="Legenda ou chamada"></label><div class="scene-meta"><label class="field"><span>Duração (s)</span><input type="number" min="1" max="300" data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="duration" value="' + escapeHtml(scene.duration || 8) + '"></label><label class="field"><span>Som / trilha</span><input data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="sfx" value="' + escapeHtml(scene.sfx) + '" placeholder="Ambiente, efeito..."></label></div></article>').join("") + '</div>' : '<div class="empty-inline"><p>Nenhuma cena detalhada ainda.</p><button class="button button-secondary button-small" data-action="add-scene">Adicionar primeira cena</button></div>') +
      '</section>';
  }

  function renderCharacters(project) {
    return '<div class="section-heading"><div><span class="eyebrow">ELENCO</span><h2>Personagens</h2><p class="muted">Registre aparência, personalidade, voz e objetivos para manter consistência.</p></div><button class="button button-primary" data-action="add-character">＋ Personagem</button></div>' +
      (project.characters.length ? '<div class="character-grid">' + project.characters.map((character) => '<article class="character-card"><div class="character-avatar">' + escapeHtml((character.name || "?").slice(0, 1).toUpperCase()) + '</div><div class="character-card-heading"><div><h3>' + escapeHtml(character.name) + '</h3><span class="project-tag">' + escapeHtml(character.role || "Personagem") + '</span></div><button class="icon-button danger-text" data-action="delete-character" data-id="' + escapeHtml(character.id) + '">×</button></div><p>' + escapeHtml(character.description || "Sem descrição.") + '</p><div class="character-detail"><b>Aparência</b><span>' + escapeHtml(character.appearance || "Não definida") + '</span></div><div class="character-detail"><b>Voz / jeito de falar</b><span>' + escapeHtml(character.voice || "Não definido") + '</span></div></article>').join("") + '</div>' : '<div class="empty-state"><div class="empty-illustration">◎</div><h3>Quem move esta história?</h3><p>Crie personagens com objetivos, conflitos e características visuais consistentes.</p><button class="button button-primary" data-action="add-character">Criar personagem</button></div>');
  }

  function renderUniverse(project) {
    return '<div class="two-column"><section class="panel"><div class="panel-heading"><div><span class="eyebrow">WORLD BUILDING</span><h2>Regras do universo</h2></div><span class="panel-icon">⌘</span></div>' +
      field("Cenário / época", "world.setting", project.world.setting, "Onde e quando a história acontece?", "textarea") +
      field("Regras que não podem ser quebradas", "world.rulesText", (project.world.rules || []).join("\n"), "Uma regra por linha", "textarea") +
      field("Direção visual", "world.visualStyle", project.world.visualStyle, "Paleta, textura, referências visuais...", "textarea") +
      '<p class="small muted">As regras do universo servem como referência para novos episódios e para evitar contradições.</p></section><aside class="panel panel-accent"><span class="eyebrow">CONTINUIDADE</span><h2>Coerência é parte da história.</h2><p>Registre o que é verdade no seu mundo. Uma escolha da audiência pode mudar o rumo da narrativa, mas a mudança precisa ficar documentada.</p><button class="button button-secondary button-wide" data-action="switch-tab" data-tab="continuity">Abrir registro de continuidade →</button></aside></div>';
  }

  function renderPolls(project) {
    return '<div class="section-heading"><div><span class="eyebrow">PARTICIPAÇÃO DO PÚBLICO</span><h2>Enquetes e consequências</h2><p class="muted">Registre as opções publicadas, contabilize votos e anote como o resultado altera a história.</p></div><button class="button button-primary" data-action="add-poll">＋ Nova enquete</button></div>' +
      (project.polls.length ? '<div class="poll-list">' + project.polls.map((poll) => {
        const options = poll.options || [];
        const total = options.reduce((sum, option) => sum + Number(option.votes || 0), 0);
        const max = Math.max(1, ...options.map((option) => Number(option.votes || 0)));
        return '<article class="panel poll-card"><div class="poll-heading"><div><span class="eyebrow">VOTAÇÃO</span><h3>' + escapeHtml(poll.question) + '</h3></div><button class="icon-button danger-text" data-action="delete-poll" data-id="' + escapeHtml(poll.id) + '">×</button></div><div class="poll-options">' + options.map((option, index) => '<div class="poll-option"><div class="poll-option-head"><b>' + escapeHtml(option.label) + '</b><span>' + Number(option.votes || 0) + ' votos</span></div><div class="poll-track"><span style="width:' + Math.round(Number(option.votes || 0) / max * 100) + '%"></span></div><button class="text-button vote-button" data-action="add-vote" data-id="' + escapeHtml(poll.id) + '" data-index="' + index + '">+ Registrar voto</button><button class="text-button" data-action="set-winner" data-id="' + escapeHtml(poll.id) + '" data-index="' + index + '">Definir vencedora</button></div>').join("") + '</div><div class="poll-result"><span>Total: <b>' + total + '</b></span><span>Vencedora: <b>' + escapeHtml(poll.winner || "A definir") + '</b></span></div><div class="consequence"><b>Consequência narrativa</b><p>' + escapeHtml(poll.consequence || "Ainda não registrada.") + '</p></div></article>';
      }).join("") + '</div>' : '<div class="empty-state"><div class="empty-illustration">◉</div><h3>Deixe o público decidir</h3><p>Uma boa enquete cria uma escolha clara e faz cada alternativa produzir um caminho diferente.</p><button class="button button-primary" data-action="add-poll">Criar enquete</button></div>');
  }

  function renderContinuity(project) {
    return '<div class="section-heading"><div><span class="eyebrow">MEMÓRIA DO UNIVERSO</span><h2>Registro de continuidade</h2><p class="muted">Fatos estabelecidos, decisões da audiência, segredos revelados e consequências.</p></div><button class="button button-primary" data-action="add-continuity">＋ Registrar fato</button></div>' +
      (project.continuity.length ? '<div class="timeline">' + project.continuity.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((entry) => '<article class="timeline-item"><span class="timeline-dot"></span><div class="timeline-entry"><div><span class="project-tag">' + escapeHtml(entry.type || "Nota") + '</span><span class="muted small">' + dateLabel(entry.createdAt) + '</span></div><p>' + escapeHtml(entry.text) + '</p></div><button class="icon-button danger-text" data-action="delete-continuity" data-id="' + escapeHtml(entry.id) + '">×</button></article>').join("") + '</div>' : '<div class="empty-state"><div class="empty-illustration">⌁</div><h3>Comece a registrar o que é verdade</h3><p>Quando um evento muda a história, registre a mudança para que os próximos episódios respeitem o que aconteceu.</p><button class="button button-primary" data-action="add-continuity">Adicionar primeiro registro</button></div>');
  }

  function renderSources(project) {
    const sources = project.sources || [];
    return '<div class="section-heading"><div><span class="eyebrow">PESQUISA E VERIFICAÇÃO</span><h2>Fontes e referências</h2><p class="muted">Guarde links, fatos a conferir e o estado da checagem. Uma fonte registrada não é automaticamente validada.</p></div><button class="button button-primary" data-action="add-source">＋ Adicionar fonte</button></div>' +
      (sources.length ? '<div class="source-grid">' + sources.map((source) => {
        const safeUrl = /^https?:\/\//i.test(source.url || "") ? source.url : "";
        return '<article class="source-card"><div class="source-card-head"><span class="project-tag">' + escapeHtml(source.status || "Para verificar") + '</span><button class="icon-button danger-text" data-action="delete-source" data-id="' + escapeHtml(source.id) + '">×</button></div><h3>' + escapeHtml(source.title || "Referência") + '</h3><p>' + escapeHtml(source.claim || "Sem afirmação associada.") + '</p>' +
          (safeUrl ? '<a class="source-link" href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(safeUrl) + ' ↗</a>' : '<span class="small muted">Nenhum link informado</span>') +
          '<label class="field source-status"><span>Estado da checagem</span><select data-source-id="' + escapeHtml(source.id) + '" data-source-field="status"><option ' + (source.status === "Para verificar" ? "selected" : "") + '>Para verificar</option><option ' + (source.status === "Em análise" ? "selected" : "") + '>Em análise</option><option ' + (source.status === "Confirmada" ? "selected" : "") + '>Confirmada</option><option ' + (source.status === "Descartada" ? "selected" : "") + '>Descartada</option></select></label></article>';
      }).join("") + '</div>' : '<div class="empty-state"><div class="empty-illustration">⌕</div><h3>Organize suas referências</h3><p>Registre uma fonte por afirmação importante. Para histórias documentais, diferencie fatos confirmados de hipóteses e ficção.</p><button class="button button-primary" data-action="add-source">Adicionar primeira fonte</button></div>');
  }

  function renderExport(project) {
    return '<div class="two-column"><section class="panel"><span class="eyebrow">SEU MATERIAL, SEU FORMATO</span><h2>Exportar projeto</h2><p class="muted">Baixe uma cópia do projeto para guardar, revisar ou levar para outra ferramenta.</p><div class="export-options"><button class="export-option" data-action="export" data-format="json"><span class="export-icon">{ }</span><span><b>JSON completo</b><small>Todos os dados e a estrutura do projeto.</small></span><span>↓</span></button><button class="export-option" data-action="export" data-format="markdown"><span class="export-icon">M↓</span><span><b>Markdown</b><small>Documento legível com episódios, personagens e enquetes.</small></span><span>↓</span></button><button class="export-option" data-action="export" data-format="txt"><span class="export-icon">TXT</span><span><b>Texto simples</b><small>Roteiros e informações em texto.</small></span><span>↓</span></button><button class="export-option" data-action="export" data-format="srt"><span class="export-icon">CC</span><span><b>Legendas SRT</b><small>Gera legendas a partir das falas e narrações das cenas.</small></span><span>↓</span></button></div></section><aside class="panel panel-soft"><span class="eyebrow">BACKUP</span><h3>Seus dados ficam com você.</h3><p>O salvamento local mantém o projeto neste navegador. Ative a sincronização nas configurações para guardar uma cópia na sua conta Supabase.</p><button class="button button-secondary button-wide" data-action="navigate" data-view="settings">Configurar sincronização →</button></aside></div>';
  }

  function renderSettings() {
    const settings = getSettings();
    const isConfigured = Boolean(settings.supabaseUrl && settings.supabaseAnon);
    return '<div class="page-stack"><div class="section-heading"><div><span class="eyebrow">PREFERÊNCIAS</span><h1>Configurações</h1><p class="muted">Conecte os serviços opcionais. O estúdio continua funcionando localmente sem eles.</p></div></div>' +
      '<section class="panel settings-panel"><div class="panel-heading"><div><span class="eyebrow">BACKUP NA NUVEM</span><h2>Supabase</h2></div><span class="service-status ' + (signedInUser ? "online" : isConfigured ? "configured" : "") + '">' + (signedInUser ? "Conectado" : isConfigured ? "Configurado" : "Opcional") + '</span></div><p class="muted">Use a URL do projeto e a chave pública anon/publishable do Supabase. Nunca cole aqui a chave service_role.</p><form data-form="settings" class="form-grid">' +
      '<label class="field"><span>Project URL</span><input name="supabaseUrl" type="url" placeholder="https://seu-projeto.supabase.co" value="' + escapeHtml(settings.supabaseUrl || "") + '"></label>' +
      '<label class="field"><span>Anon / publishable key</span><input name="supabaseAnon" type="password" autocomplete="off" placeholder="Chave pública do Supabase" value="' + escapeHtml(settings.supabaseAnon || "") + '"></label><div class="form-actions"><button class="button button-primary" type="submit">Salvar configuração</button><span class="small muted">A chave pública fica no navegador e depende das políticas RLS do banco.</span></div></form>' +
      '<div class="cloud-account">' + (signedInUser ? '<div><b>Conectado como ' + escapeHtml(signedInUser.email || "usuário") + '</b><p class="small muted">Os projetos serão sincronizados com sua conta.</p></div><button class="button button-secondary" data-action="cloud-signout">Sair</button><button class="button button-primary" data-action="cloud-sync">Sincronizar agora</button>' : '<form data-form="cloud-login" class="login-form"><label class="field"><span>Seu e-mail</span><input name="email" type="email" required placeholder="voce@exemplo.com"></label><button class="button button-secondary" type="submit" ' + (isConfigured ? "" : "disabled") + '>Enviar link de acesso</button></form>') + '</div>' +
      '<p class="small muted">Antes de conectar, execute o arquivo supabase/schema.sql no SQL Editor do seu projeto Supabase e configure a URL de redirecionamento de autenticação.</p></section>' +
      '<section class="panel settings-panel"><div class="panel-heading"><div><span class="eyebrow">GERAÇÃO DE CONTEÚDO</span><h2>OpenAI API</h2></div><span class="service-status configured">Servidor</span></div><p>A geração por IA usa a função segura <code>/api/generate</code>. Configure <code>OPENAI_API_KEY</code>, <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> nas variáveis de ambiente do Vercel. É necessário entrar na conta Supabase; há limite de 20 gerações por dia por conta para evitar abuso e custos inesperados. A chave OpenAI nunca deve ser colocada no navegador nem no GitHub.</p><label class="field"><span>Modelo (opcional)</span><input value="Configurado no Vercel: OPENAI_MODEL" disabled></label><div class="callout-note">A assinatura do ChatGPT não inclui créditos da API. O uso da API é faturado separadamente pela OpenAI.</div></section>' +
      '<section class="panel settings-panel"><div class="panel-heading"><div><span class="eyebrow">ARMAZENAMENTO</span><h2>Dados deste dispositivo</h2></div></div><p class="muted">Atualmente há <b>' + state.projects.length + '</b> projeto(s) salvos neste navegador.</p><button class="button button-danger-ghost" data-action="clear-local">Apagar dados locais deste navegador</button><p class="small muted">Esta ação não apaga cópias já sincronizadas na nuvem.</p></section></div>';
  }

  function showNewProjectModal() {
    openModal('<div class="modal-top"><div><span class="eyebrow">NOVO UNIVERSO</span><h2>Comece com uma ideia.</h2><p>O primeiro rascunho não precisa estar perfeito.</p></div><button class="icon-button" type="button" data-action="close-modal">×</button></div><form data-form="create-project" class="form-grid">' +
      '<label class="field full"><span>Nome do projeto</span><input name="title" required maxlength="80" placeholder="Ex.: A última estação"></label>' +
      '<label class="field full"><span>Premissa</span><textarea name="premise" maxlength="1200" placeholder="E se..."></textarea></label>' +
      '<label class="field"><span>Formato</span><select name="format"><option>E se?</option><option>História interativa</option><option>Terror e mistério</option><option>Ficção científica</option><option>História alternativa</option><option>Drama</option><option>Comédia</option><option>Documentário / curiosidades</option></select></label>' +
      '<label class="field"><span>Plataforma</span><select name="platform"><option>TikTok / Reels / Shorts</option><option>YouTube</option><option>Podcast</option><option>Web</option></select></label>' +
      '<div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Criar projeto →</button></div></form>');
  }

  function showCharacterModal() {
    openModal('<div class="modal-top"><div><span class="eyebrow">ELENCO</span><h2>Adicionar personagem</h2></div><button class="icon-button" data-action="close-modal">×</button></div><form data-form="add-character" class="form-grid">' +
      '<label class="field"><span>Nome</span><input name="name" required maxlength="60" placeholder="Nome do personagem"></label><label class="field"><span>Função</span><select name="role"><option>Protagonista</option><option>Antagonista</option><option>Aliado</option><option>Co-protagonista</option><option>Outro</option></select></label>' +
      '<label class="field full"><span>Personalidade e objetivo</span><textarea name="description" placeholder="O que quer? O que teme? O que esconde?"></textarea></label><label class="field full"><span>Aparência visual</span><textarea name="appearance" placeholder="Características visuais consistentes..."></textarea></label><label class="field full"><span>Voz / jeito de falar</span><input name="voice" placeholder="Ritmo, vocabulário, sotaque fictício..."></label><div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Salvar personagem</button></div></form>');
  }

  function showPollModal() {
    openModal('<div class="modal-top"><div><span class="eyebrow">PARTICIPAÇÃO</span><h2>Criar enquete</h2><p>Faça a pergunta e dê caminhos que realmente mudem a história.</p></div><button class="icon-button" data-action="close-modal">×</button></div><form data-form="add-poll" class="form-grid">' +
      '<label class="field full"><span>Pergunta</span><input name="question" required maxlength="180" placeholder="O que a personagem deve fazer?"></label><label class="field full"><span>Opções (uma por linha)</span><textarea name="options" required placeholder="Confiar no desconhecido&#10;Voltar para casa"></textarea></label><label class="field full"><span>Consequência narrativa</span><textarea name="consequence" placeholder="Como cada escolha muda o próximo episódio?"></textarea></label><div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Criar enquete</button></div></form>');
  }

  function showContinuityModal() {
    openModal('<div class="modal-top"><div><span class="eyebrow">MEMÓRIA DA HISTÓRIA</span><h2>Registrar continuidade</h2></div><button class="icon-button" data-action="close-modal">×</button></div><form data-form="add-continuity" class="form-grid"><label class="field"><span>Tipo de registro</span><select name="type"><option>Fato estabelecido</option><option>Decisão da audiência</option><option>Segredo</option><option>Consequência</option><option>Regra do universo</option><option>Detalhe visual</option></select></label><label class="field full"><span>O que precisa ser lembrado?</span><textarea name="text" required placeholder="Registre um fato que os próximos episódios devem respeitar."></textarea></label><div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Salvar registro</button></div></form>');
  }

  function showSourceModal() {
    openModal('<div class="modal-top"><div><span class="eyebrow">PESQUISA</span><h2>Adicionar referência</h2><p>Registre o link e a afirmação que ele ajuda a verificar.</p></div><button class="icon-button" data-action="close-modal">×</button></div><form data-form="add-source" class="form-grid">' +
      '<label class="field full"><span>Título / instituição</span><input name="title" required maxlength="120" placeholder="Nome da publicação ou instituição"></label>' +
      '<label class="field full"><span>URL da fonte (opcional)</span><input name="url" type="url" placeholder="https://..."></label>' +
      '<label class="field full"><span>Afirmação ou informação relacionada</span><textarea name="claim" placeholder="O que esta fonte confirma ou precisa esclarecer?"></textarea></label>' +
      '<div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Salvar referência</button></div></form>');
  }

  async function generate(kind) {
    const project = currentProject();
    if (!project) return;
    const episode = project.episodes.find((item) => item.id === activeEpisodeId);
    const button = $('[data-action="generate-' + (kind === "episode" ? "episode" : "project") + '"]');
    if (button) { button.disabled = true; button.dataset.oldText = button.textContent; button.textContent = "Preparando..."; }
    notify("Pedindo uma estrutura à IA...", "info");
    try {
      if (!supabaseClient || !signedInUser) {
      throw new Error("Conecte o Supabase e entre na sua conta em Configurações antes de usar a IA.");
    }
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : null;
    if (sessionError || !accessToken) throw new Error("Sua sessão expirou. Entre novamente em Configurações.");
    const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
        body: JSON.stringify({ kind: kind, project: project, episode: episode || null })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível gerar. Confira a configuração da API no Vercel.");
      if (kind === "episode") {
        if (!episode) throw new Error("Abra um episódio antes de gerar o roteiro.");
        episode.title = body.title || episode.title;
        episode.summary = body.summary || episode.summary;
        episode.script = body.script || episode.script;
        episode.scenes = Array.isArray(body.scenes) ? body.scenes.map((scene) => ({
          id: uid(), title: scene.title || "Nova cena", visual: scene.visual || "",
          audio: scene.audio || "", onScreen: scene.onScreen || "",
          duration: Number(scene.duration) || 8, sfx: scene.sfx || ""
        })) : episode.scenes;
      } else {
        project.title = body.title || project.title;
        project.premise = body.premise || body.logline || project.premise;
        if (Array.isArray(body.universe)) project.world.rules = body.universe;
        if (body.setting) project.world.setting = body.setting;
        if (body.visualStyle) project.world.visualStyle = body.visualStyle;
        if (Array.isArray(body.characters) && body.characters.length) {
          project.characters = body.characters.map((character) => ({ id: uid(), name: character.name || "Personagem", role: character.role || "Personagem", description: character.description || "", appearance: character.appearance || "", voice: character.voice || "" }));
        }
        if (Array.isArray(body.episodes) && body.episodes.length) {
          project.episodes = body.episodes.map((item, index) => ({
            id: uid(), number: index + 1, title: item.title || "Episódio " + (index + 1),
            summary: item.summary || "", script: item.script || "",
            scenes: Array.isArray(item.scenes) ? item.scenes.map((scene) => ({
              id: uid(), title: scene.title || "Cena", visual: scene.visual || "",
              audio: scene.audio || "", onScreen: scene.onScreen || "",
              duration: Number(scene.duration) || 8, sfx: scene.sfx || ""
            })) : [], pollId: null, status: "Rascunho"
          }));
        }
        if (Array.isArray(body.polls)) project.polls = body.polls.map((poll) => ({
          id: uid(), question: poll.question || "Escolha o próximo passo",
          options: (poll.options || []).map((option) => ({ label: typeof option === "string" ? option : option.label || "Opção", votes: 0 })),
          winner: "", consequence: poll.consequence || ""
        }));
        if (Array.isArray(body.continuity)) project.continuity = body.continuity.map((text) => ({ id: uid(), type: "Fato estabelecido", text: String(text), createdAt: new Date().toISOString() }));
      }
      project.updatedAt = new Date().toISOString();
      save();
      render();
      notify("Estrutura gerada e salva no projeto.", "success");
    } catch (error) {
      console.error(error);
      notify(error.message || "Erro ao gerar conteúdo.", "error");
    } finally {
      if (button && button.isConnected) { button.disabled = false; button.textContent = button.dataset.oldText || "✦ Desenvolver com IA"; }
    }
  }

  function addEpisode() {
    const project = currentProject();
    if (!project) return;
    const episode = makeEpisode(project.episodes.length + 1);
    project.episodes.push(episode);
    activeEpisodeId = episode.id;
    activeTab = "episodes";
    project.updatedAt = new Date().toISOString();
    save(); render();
  }

  function addScene() {
    const project = currentProject();
    const episode = project && project.episodes.find((item) => item.id === activeEpisodeId);
    if (!episode) return;
    episode.scenes.push({ id: uid(), title: "Nova cena", visual: "", imagePrompt: "", videoPrompt: "", audio: "", audioDirection: "", onScreen: "", duration: 8, sfx: "" });
    save(); render();
  }

  function scheduleCloudSync() {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => syncCloud(false), 1400);
  }

  async function syncCloud(showMessage) {
    if (!supabaseClient || !signedInUser) {
      if (showMessage) notify("Conecte uma conta Supabase primeiro.", "error");
      return;
    }
    const records = state.projects.map((project) => ({
      id: project.id,
      user_id: signedInUser.id,
      data: project,
      updated_at: project.updatedAt || new Date().toISOString()
    }));
    if (!records.length) {
      if (showMessage) notify("Não há projetos locais para sincronizar.", "info");
      return;
    }
    const { error } = await supabaseClient.from("projects").upsert(records, { onConflict: "id" });
    if (error) {
      console.error(error);
      if (showMessage) notify("Falha na sincronização: " + error.message, "error");
      return;
    }
    if (showMessage) notify("Projetos sincronizados com a nuvem.", "success");
  }

  async function loadCloudProjects() {
    if (!supabaseClient || !signedInUser) return;
    const { data, error } = await supabaseClient.from("projects").select("id,data,updated_at").eq("user_id", signedInUser.id);
    if (error) { console.error(error); notify("Não foi possível carregar a nuvem: " + error.message, "error"); return; }
    let changed = false;
    (data || []).forEach((row) => {
      if (!row.data) return;
      const index = state.projects.findIndex((project) => project.id === row.id);
      if (index < 0) { state.projects.push(row.data); changed = true; }
      else {
        const localTime = new Date(state.projects[index].updatedAt || 0).getTime();
        const remoteTime = new Date(row.data.updatedAt || row.updated_at || 0).getTime();
        if (remoteTime > localTime) { state.projects[index] = row.data; changed = true; }
      }
    });
    if (changed) { save(false); render(); }
    await syncCloud(false);
  }

  function initSupabase() {
    const settings = getSettings();
    if (!settings.supabaseUrl || !settings.supabaseAnon || !window.supabase || !window.supabase.createClient) return;
    try {
      supabaseClient = window.supabase.createClient(settings.supabaseUrl, settings.supabaseAnon);
      supabaseClient.auth.getSession().then(({ data }) => {
        signedInUser = data.session ? data.session.user : null;
        if (signedInUser) loadCloudProjects();
        render();
      });
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        signedInUser = session ? session.user : null;
        render();
        if (signedInUser) loadCloudProjects();
      });
    } catch (error) {
      console.error(error);
      notify("Não foi possível iniciar a conexão Supabase.", "error");
    }
  }

  async function sendMagicLink(email) {
    if (!supabaseClient) { notify("Salve primeiro a URL e a chave pública do Supabase.", "error"); return; }
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) notify("Erro ao enviar link: " + error.message, "error");
    else notify("Link de acesso enviado. Confira sua caixa de entrada.", "success");
  }

  function downloadFile(name, contents, mime) {
    const blob = new Blob([contents], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportProject(format) {
    const project = currentProject();
    if (!project) return;
    const filename = (project.title || "what-if-project").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "what-if-project";
    if (format === "json") return downloadFile(filename + ".json", JSON.stringify(project, null, 2), "application/json;charset=utf-8");
    if (format === "txt" || format === "markdown") {
      const lines = ["# " + project.title, "", project.premise, "", "## Universo", project.world.setting || "", ...(project.world.rules || []).map((rule) => "- " + rule), "", "## Personagens"];
      project.characters.forEach((character) => lines.push("### " + character.name, character.role, character.description, "Aparência: " + character.appearance, "Voz: " + character.voice, ""));
      project.episodes.forEach((episode) => lines.push("## Episódio " + episode.number + " — " + episode.title, episode.summary, "", episode.script, ""));
      project.polls.forEach((poll) => lines.push("## Enquete", poll.question, ...(poll.options || []).map((option) => "- " + option.label + " (" + option.votes + " votos)"), "Consequência: " + poll.consequence, ""));
      project.continuity.forEach((entry) => lines.push("## Continuidade — " + entry.type, entry.text, ""));
      (project.sources || []).forEach((source) => lines.push("## Fonte — " + source.title, source.claim, "URL: " + source.url, "Estado: " + source.status, ""));
      return downloadFile(filename + (format === "txt" ? ".txt" : ".md"), lines.join("\n"), "text/plain;charset=utf-8");
    }
    if (format === "srt") {
      let counter = 1;
      let seconds = 0;
      const chunks = [];
      project.episodes.forEach((episode) => (episode.scenes || []).forEach((scene) => {
        const duration = Math.max(1, Number(scene.duration) || 8);
        const text = [scene.audio, scene.onScreen].filter(Boolean).join("\n");
        if (text) {
          const start = srtTime(seconds), end = srtTime(seconds + duration);
          chunks.push(counter++ + "\n" + start + " --> " + end + "\n" + text);
        }
        seconds += duration;
      }));
      return downloadFile(filename + ".srt", chunks.join("\n\n"), "application/x-subrip;charset=utf-8");
    }
  }

  function srtTime(seconds) {
    const ms = Math.floor((seconds % 1) * 1000);
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":") + "," + String(ms).padStart(3, "0");
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const project = currentProject();
    if (action === "new-project") return showNewProjectModal();
    if (action === "close-modal") return closeModal();
    if (action === "navigate") { activeView = button.dataset.view; render(); return; }
    if (action === "open-project") return openProject(button.dataset.id);
    if (action === "switch-tab") { activeTab = button.dataset.tab; activeEpisodeId = null; render(); return; }
    if (action === "select-episode") { activeTab = "episodes"; activeEpisodeId = button.dataset.id; render(); return; }
    if (action === "back-episodes") { activeEpisodeId = null; render(); return; }
    if (action === "add-episode") return addEpisode();
    if (action === "add-scene") return addScene();
    if (action === "add-character") return showCharacterModal();
    if (action === "add-poll") return showPollModal();
    if (action === "add-continuity") return showContinuityModal();
    if (action === "add-source") return showSourceModal();
    if (action === "generate-project") return generate("story-pack");
    if (action === "generate-episode") return generate("episode");
    if (action === "delete-character" && project) {
      project.characters = project.characters.filter((item) => item.id !== button.dataset.id); save(); render(); return;
    }
    if (action === "delete-poll" && project) {
      project.polls = project.polls.filter((item) => item.id !== button.dataset.id); save(); render(); return;
    }
    if (action === "delete-continuity" && project) {
      project.continuity = project.continuity.filter((item) => item.id !== button.dataset.id); save(); render(); return;
    }
    if (action === "delete-source" && project) {
      project.sources = (project.sources || []).filter((item) => item.id !== button.dataset.id); save(); render(); return;
    }
    if (action === "delete-scene" && project) {
      const episode = project.episodes.find((item) => item.id === activeEpisodeId);
      if (episode) episode.scenes = episode.scenes.filter((scene) => scene.id !== button.dataset.id);
      save(); render(); return;
    }
    if (action === "delete-episode" && project) {
      if (!window.confirm("Excluir este episódio?")) return;
      project.episodes = project.episodes.filter((item) => item.id !== activeEpisodeId);
      project.episodes.forEach((item, index) => { item.number = index + 1; });
      activeEpisodeId = null; save(); render(); return;
    }
    if (action === "add-vote" && project) {
      const poll = project.polls.find((item) => item.id === button.dataset.id);
      const option = poll && poll.options[Number(button.dataset.index)];
      if (option) { option.votes = Number(option.votes || 0) + 1; save(); render(); }
      return;
    }
    if (action === "set-winner" && project) {
      const poll = project.polls.find((item) => item.id === button.dataset.id);
      const option = poll && poll.options[Number(button.dataset.index)];
      if (poll && option) {
        poll.winner = option.label;
        project.continuity.push({ id: uid(), type: "Decisão da audiência", text: "A enquete \"" + poll.question + "\" foi vencida por: " + option.label + ". " + (poll.consequence || ""), createdAt: new Date().toISOString() });
        save(); render(); notify("Resultado registrado na continuidade.", "success");
      }
      return;
    }
    if (action === "export") return exportProject(button.dataset.format);
    if (action === "cloud-sync") return syncCloud(true);
    if (action === "cloud-signout" && supabaseClient) {
      const { error } = await supabaseClient.auth.signOut();
      if (error) notify(error.message, "error"); else { signedInUser = null; render(); notify("Sessão encerrada.", "success"); }
      return;
    }
    if (action === "clear-local") {
      if (!window.confirm("Apagar todos os projetos salvos neste dispositivo? Esta ação não pode ser desfeita.")) return;
      state = defaultState(); save(false); activeView = "dashboard"; render(); notify("Dados locais apagados.", "success"); return;
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    const project = currentProject();
    if (!project) return;
    if (target.dataset.bind) {
      const path = target.dataset.bind;
      if (path === "world.rulesText") project.world.rules = target.value.split("\n").map((item) => item.trim()).filter(Boolean);
      else setPath(project, path, target.value);
      project.updatedAt = new Date().toISOString(); save();
    }
    if (target.dataset.episodeField) {
      const episode = project.episodes.find((item) => item.id === activeEpisodeId);
      if (episode) { episode[target.dataset.episodeField] = target.value; save(); }
    }
    if (target.dataset.sceneField) {
      const episode = project.episodes.find((item) => item.id === activeEpisodeId);
      const scene = episode && episode.scenes.find((item) => item.id === target.dataset.sceneId);
      if (scene) { scene[target.dataset.sceneField] = target.value; save(); }
    }
    if (target.dataset.sourceField) {
      const source = (project.sources || []).find((item) => item.id === target.dataset.sourceId);
      if (source) { source[target.dataset.sourceField] = target.value; save(); }
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.bind && target.tagName === "SELECT") {
      const project = currentProject();
      if (project) { setPath(project, target.dataset.bind, target.value); project.updatedAt = new Date().toISOString(); save(); }
    }
    if (target.dataset.episodeField) {
      const project = currentProject();
      const episode = project && project.episodes.find((item) => item.id === activeEpisodeId);
      if (episode) { episode[target.dataset.episodeField] = target.value; save(); }
    }
    if (target.dataset.sceneField) {
      const project = currentProject();
      const episode = project && project.episodes.find((item) => item.id === activeEpisodeId);
      const scene = episode && episode.scenes.find((item) => item.id === target.dataset.sceneId);
      if (scene) { scene[target.dataset.sceneField] = target.type === "number" ? Number(target.value) : target.value; save(); }
    }
    if (target.dataset.sourceField) {
      const project = currentProject();
      const source = project && (project.sources || []).find((item) => item.id === target.dataset.sourceId);
      if (source) { source[target.dataset.sourceField] = target.value; save(); }
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const type = form.dataset.form;
    if (type === "create-project") {
      closeModal(); createProject(data); return;
    }
    const project = currentProject();
    if (type === "add-character" && project) {
      project.characters.push({ id: uid(), name: data.name, role: data.role, description: data.description || "", appearance: data.appearance || "", voice: data.voice || "" });
      save(); closeModal(); render(); notify("Personagem adicionado.", "success"); return;
    }
    if (type === "add-poll" && project) {
      const options = data.options.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 6);
      if (options.length < 2) { notify("Adicione pelo menos duas opções.", "error"); return; }
      project.polls.push({ id: uid(), question: data.question, options: options.map((label) => ({ label: label, votes: 0 })), winner: "", consequence: data.consequence || "" });
      save(); closeModal(); render(); notify("Enquete criada.", "success"); return;
    }
    if (type === "add-continuity" && project) {
      project.continuity.push({ id: uid(), type: data.type, text: data.text, createdAt: new Date().toISOString() });
      save(); closeModal(); render(); notify("Registro salvo.", "success"); return;
    }
    if (type === "add-source" && project) {
      const url = String(data.url || "").trim();
      if (url) {
        try {
          const parsed = new URL(url);
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("URL inválida");
        } catch (_) { notify("Informe um link HTTP ou HTTPS válido.", "error"); return; }
      }
      project.sources = project.sources || [];
      project.sources.push({ id: uid(), title: data.title, url: url, claim: data.claim || "", status: "Para verificar", createdAt: new Date().toISOString() });
      save(); closeModal(); render(); notify("Referência adicionada.", "success"); return;
    }
    if (type === "settings") {
      const settings = getSettings();
      settings.supabaseUrl = String(data.supabaseUrl || "").trim().replace(/\/$/, "");
      settings.supabaseAnon = String(data.supabaseAnon || "").trim();
      saveSettings(settings);
      supabaseClient = null; signedInUser = null; initSupabase(); render();
      notify("Configuração do Supabase salva neste dispositivo.", "success"); return;
    }
    if (type === "cloud-login") {
      await sendMagicLink(data.email); return;
    }
  });

  initSupabase();
  render();
})();