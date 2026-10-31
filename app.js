/* What If Studio — local-first interactive story workspace */
(function () {
  "use strict";

  const STORAGE_KEY = "what-if-studio.v1";
  const SETTINGS_KEY = "what-if-studio.settings.v1";
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => { const random = Math.random() * 16 | 0; return (char === "x" ? random : (random & 3 | 8)).toString(16); }));
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const dateLabel = (value) => {
    try { return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
    catch (_) { return "agora"; }
  };
  const formatTimecode = (seconds) => {
    const total = Math.floor(Math.max(0, Number(seconds) || 0));
    return String(Math.floor(total / 60)).padStart(2, "0") + ':' + String(total % 60).padStart(2, "0");
  };
  const defaultState = () => ({ projects: [], activeProjectId: null, course: { title: "Curso What If", description: "Aprenda a transformar ideias em roteiros curtos, vídeos envolventes e histórias que crescem com a participação do público.", price: "", paymentNote: "Fale comigo pelo WhatsApp para receber detalhes e formas de pagamento." } });
  let state = loadState();
  state.course = { ...defaultState().course, ...(state.course || {}) };
  state.publishQueue = Array.isArray(state.publishQueue) ? state.publishQueue : [];
  let activeView = "dashboard";
  let activeTab = "overview";
  let activeEpisodeId = null;
  let activeSceneId = null;
  let aiSessionCredentials = null;
  let pendingAiGeneration = null;
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
    const defaults = {
      supabaseUrl: "https://auppgrsgikvsjtpiuvkq.supabase.co",
      supabaseAnon: "sb_publishable_na6azEXNYbMR7sq92sQ0jg_2ekWyNHb"
    };
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      const configured = saved && typeof saved === "object" ? saved : {};
      return {
        ...configured,
        supabaseUrl: configured.supabaseUrl || defaults.supabaseUrl,
        supabaseAnon: configured.supabaseAnon || defaults.supabaseAnon
      };
    } catch (_) { return defaults; }
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
      pacing: data.pacing || "Dinâmico",
      status: "Em desenvolvimento",
      createdAt: now,
      updatedAt: now,
      world: { setting: "", rules: [], visualStyle: "" },
      characters: [],
      episodes: [makeEpisode(1)],
      polls: [],
      continuity: [],
      sources: [],
      history: []
    };
    state.projects.unshift(project);
    state.activeProjectId = project.id;
    activeView = "editor";
    activeTab = "overview";
    activeEpisodeId = null;
    activeSceneId = null;
    save();
    render();
    notify("Projeto criado. Agora desenvolva o universo.", "success");
  }

  function openProject(id) {
    state.activeProjectId = id;
    activeView = "editor";
    activeTab = "overview";
    activeEpisodeId = null;
    activeSceneId = null;
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
    const title = activeView === "editor" && project ? project.title : activeView === "projects" ? "Projetos" : activeView === "settings" ? "Configurações" : activeView === "publishing" ? "Publicação" : activeView === "course" ? "Curso" : "Visão geral";
    $("#page-title").textContent = title;
    $("#save-status").textContent = signedInUser ? "Sincronização ativada" : "Salvo neste dispositivo";
    const aiButton = $('[data-action="configure-ai"]');
    if (aiButton) aiButton.textContent = aiSessionCredentials ? "IA: " + aiProviderLabel(aiSessionCredentials.provider) : "Configurar IA";
    const root = $("#app");
    if (activeView === "editor" && project) root.innerHTML = renderEditor(project);
    else if (activeView === "projects") root.innerHTML = renderProjects();
    else if (activeView === "settings") root.innerHTML = renderSettings();
    else if (activeView === "publishing") root.innerHTML = renderPublishing();
    else if (activeView === "course") root.innerHTML = renderCourse();
    else root.innerHTML = renderDashboard();
  }

  function renderCourse() {
    const course = state.course;
    const price = course.price ? '<span class="course-price">' + escapeHtml(course.price) + '</span>' : '<span class="course-price">Consulte as condições pelo WhatsApp</span>';
    const message = encodeURIComponent("Olá! Quero saber mais sobre o curso: " + (course.title || "Curso What If"));
    return '<div class="page-stack"><section class="hero-panel course-hero"><div class="hero-copy"><span class="eyebrow">APRENDA A CRIAR</span><h1>' + escapeHtml(course.title) + '</h1><p>' + escapeHtml(course.description) + '</p>' + price + '<a class="button button-primary" href="https://wa.me/5582993485560?text=' + message + '" target="_blank" rel="noopener noreferrer">Conversar no WhatsApp <span>→</span></a><small class="course-contact-note">' + escapeHtml(course.paymentNote) + '</small></div><div class="course-art" aria-hidden="true"><span>IDEIA</span><i>→</i><b>ROTEIRO</b><i>→</i><strong>HISTÓRIA</strong></div></section>' +
      '<section class="panel course-edit-panel"><div class="panel-heading"><div><span class="eyebrow">SUA OFERTA</span><h2>Prévia editável neste navegador</h2></div><span class="status-pill">Salvo neste dispositivo</span></div><p class="muted">Edite o texto e o preço para conferir a apresentação. Estas alterações ainda não são compartilhadas com outros visitantes.</p><div class="form-grid"><label class="field full"><span>Nome do curso</span><input data-course-field="title" maxlength="100" value="' + escapeHtml(course.title) + '"></label><label class="field full"><span>Descrição</span><textarea data-course-field="description" maxlength="600">' + escapeHtml(course.description) + '</textarea></label><label class="field"><span>Preço (opcional)</span><input data-course-field="price" maxlength="60" value="' + escapeHtml(course.price) + '" placeholder="Ex.: R$ 197 ou consulte no WhatsApp"></label><label class="field"><span>Informação de pagamento</span><input data-course-field="paymentNote" maxlength="160" value="' + escapeHtml(course.paymentNote) + '"></label></div><p class="small muted" data-course-payment-note>' + escapeHtml(course.paymentNote) + '</p><p class="small muted">Esta versão inicia o atendimento no WhatsApp; ela não processa nem confirma pagamentos automaticamente. O pagamento Pix é combinado e confirmado manualmente por você.</p></section></div>';
  }

  function renderPublishing() {
    const projects = state.projects;
    if (!projects.length) return '<div class="page-stack"><div class="empty-state"><div class="empty-illustration">▶</div><h2>Prepare sua primeira publicação</h2><p>Crie um projeto e um episódio para organizar roteiro, legenda e votação.</p><button class="button button-primary" data-action="new-project">Criar projeto</button></div><section class="panel integration-note"><span class="eyebrow">INSTAGRAM</span><h3>Conta ainda não conectada</h3><p>O planejamento e a votação manual já podem ser usados. Para publicar e importar comentários automaticamente, esta conta precisa ser conectada pelo fluxo oficial da Meta.</p></section></div>';
    const chosenProject = projects.find((item) => item.id === state.publishProjectId) || projects[0];
    const chosenEpisode = chosenProject.episodes.find((item) => item.id === state.publishEpisodeId) || chosenProject.episodes[0];
    if (!chosenEpisode) return '<div class="empty-state"><h2>Este projeto ainda não tem episódios</h2><button class="button button-primary" data-action="open-project" data-id="' + escapeHtml(chosenProject.id) + '">Abrir projeto</button></div>';
    const script = chosenEpisode.script || "Gere ou escreva o roteiro na área de vídeos do projeto.";
    const caption = chosenEpisode.caption || "Adicione uma legenda antes de publicar.";
    const sceneList = (chosenEpisode.scenes || []).map((scene, index) => '<li><b>Cena ' + (index + 1) + ' · ' + escapeHtml(scene.title || "Sem título") + '</b><span>' + escapeHtml(scene.visual || scene.videoPrompt || "Descreva o plano") + '</span></li>').join("");
    const queue = state.publishQueue.slice().sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    const queueRows = queue.map((item) => {
      const queuedProject = projects.find((project) => project.id === item.projectId);
      const queuedEpisode = queuedProject && queuedProject.episodes.find((episode) => episode.id === item.episodeId);
      if (!queuedEpisode) return "";
      return '<article class="queue-row"><span class="queue-date">' + escapeHtml(new Date(item.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })) + '</span><b>' + escapeHtml(queuedProject.title + " · " + queuedEpisode.title) + '</b><span class="status-pill">Planejado</span><button class="text-button" data-action="remove-from-queue" data-id="' + escapeHtml(item.id) + '">Remover</button></article>';
    }).join("");
    const dailyLimit = 4;
    return '<div class="page-stack"><div class="section-heading"><div><span class="eyebrow">DO ROTEIRO AO POST</span><h1>Preparar publicação</h1><p class="muted">Revise o vídeo e a legenda. Nada é publicado sem a integração oficial e sua autorização.</p></div><span class="status-pill">Rascunho</span></div>' +
      '<section class="panel publishing-selectors"><label class="field"><span>Projeto</span><select data-publish-select="project">' + projects.map((item) => '<option value="' + escapeHtml(item.id) + '" ' + (item.id === chosenProject.id ? "selected" : "") + '>' + escapeHtml(item.title) + '</option>').join("") + '</select></label><label class="field"><span>Episódio</span><select data-publish-select="episode">' + chosenProject.episodes.map((item) => '<option value="' + escapeHtml(item.id) + '" ' + (item.id === chosenEpisode.id ? "selected" : "") + '>Parte ' + item.number + ' · ' + escapeHtml(item.title) + '</option>').join("") + '</select></label><button class="button button-secondary" data-action="edit-publish-episode">Editar roteiro →</button></section>' +
      '<div class="publishing-grid"><section class="panel"><span class="eyebrow">ROTEIRO</span><h2>' + escapeHtml(chosenEpisode.title) + '</h2><p class="publish-script">' + escapeHtml(script) + '</p>' + (sceneList ? '<ol class="publish-scene-list">' + sceneList + '</ol>' : '<p class="small muted">Adicione cenas e prompts para orientar a gravação ou edição do vídeo.</p>') + '<button class="button button-secondary" data-action="copy-publish" data-field="script">Copiar roteiro</button></section><section class="panel"><span class="eyebrow">LEGENDA E VOTAÇÃO</span><h2>Texto para o post</h2><p class="publish-script">' + escapeHtml(caption) + '</p><div class="callout-note">A votação por comentários será contabilizada na aba Enquetes do projeto. Você pode colar os comentários recebidos; o texto original não fica salvo.</div><button class="button button-secondary" data-action="copy-publish" data-field="caption">Copiar legenda</button><button class="button button-ghost" data-action="open-publish-poll">Configurar votação →</button></section></div>' +
      '<section class="panel schedule-panel"><div class="panel-heading"><div><span class="eyebrow">PLANEJAMENTO</span><h2>Meta: até 4 vídeos por dia</h2></div><span class="status-pill">Fila deste navegador</span></div><div class="schedule-add-row"><label class="field"><span>Data e hora</span><input type="datetime-local" data-publish-time></label><button class="button button-primary" data-action="add-to-queue">Adicionar à fila</button></div><div class="queue-list">' + (queueRows || '<p class="small muted">Nenhum vídeo planejado. Defina a data e a hora acima.</p>') + '</div><p class="small muted">A fila organiza datas e bloqueia mais de quatro itens por dia, mas ainda não publica automaticamente. A publicação programada exige a integração e a autorização Meta.</p></section>' +
      '<section class="panel integration-note"><div><span class="eyebrow">PUBLICAÇÃO NO INSTAGRAM</span><h2>Conexão necessária</h2><p>O app já organiza roteiro, storyboard e legenda, mas ainda não renderiza o arquivo de vídeo nem publica na conta. A publicação oficial exige uma conta Profissional (Criador ou Empresa), um app Meta com permissões aprovadas e um arquivo de vídeo acessível pelo servidor. A conta que você criar deve ser convertida em Profissional e conectada ao app.</p></div><a class="button button-secondary" href="https://developers.facebook.com/docs/instagram-platform/content-publishing/" target="_blank" rel="noopener noreferrer">Ver requisitos da Meta</a></section></div>';
  }

  function renderDashboard() {
    const totalEpisodes = state.projects.reduce((sum, project) => sum + project.episodes.length, 0);
    const totalPolls = state.projects.reduce((sum, project) => sum + project.polls.length, 0);
    const recent = state.projects.slice(0, 3);
    return '<div class="page-stack">' +
      '<section class="hero-panel creator-hero"><div class="hero-copy"><span class="eyebrow">SHORT-FORM STORY STUDIO</span><h1>Da primeira ideia ao <span>próximo vídeo.</span></h1><p>Planeje histórias verticais, organize cada cena e transforme a escolha da audiência no gancho do episódio seguinte.</p><button class="button button-primary" data-action="new-project"><span class="button-icon">＋</span> Criar série <span>→</span></button><div class="hero-proof"><span>9:16 vertical</span><span>Roteiro + storyboard</span><span>Enquetes com consequência</span></div></div><div class="hero-art creator-hero-art" aria-hidden="true"><div class="hero-phone"><div class="phone-top"><i></i><span>STORY / 01</span><i></i></div><div class="phone-content"><span class="phone-kicker">E SE...</span><strong>UMA ESCOLHA<br>MUDA TUDO?</strong><span class="phone-caption">parte 01 · assista até o fim</span></div><div class="phone-bottom"><span>●</span><span>◉</span><span>↗</span></div></div><div class="hero-orbit"></div><span class="hero-float hero-float-one">9:16</span><span class="hero-float hero-float-two">● REC</span></div></section>' +
      '<section class="stats-grid"><article class="stat-card"><span class="stat-icon purple">▧</span><div><strong>' + state.projects.length + '</strong><span>Séries</span></div></article><article class="stat-card"><span class="stat-icon blue">▶</span><div><strong>' + totalEpisodes + '</strong><span>Vídeos planejados</span></div></article><article class="stat-card"><span class="stat-icon amber">◉</span><div><strong>' + totalPolls + '</strong><span>Enquetes</span></div></article><article class="stat-card"><span class="stat-icon green">↗</span><div><strong>' + (signedInUser ? "ON" : "LOCAL") + '</strong><span>Cloud sync</span></div></article></section>' +
      '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">LINGUAGENS DE VÍDEO</span><h2>Escolha um formato para experimentar</h2><p class="muted">Referências de linguagem comuns em vídeos curtos — adapte ao seu universo, sem copiar a identidade de outras contas.</p></div></div><div class="format-inspiration-grid">' +
      '<article class="format-inspiration-card"><div class="format-cover format-cover-pov"><span class="format-index">01 / POV</span><strong>Você percebe<br>algo estranho.</strong><i>GANCHO VISUAL</i></div><div class="format-card-copy"><h3>POV cinematográfico</h3><p>Comece com uma imagem intrigante, narração curta e uma revelação no fim.</p><span class="format-meta">Close-ups · som ambiente · cliffhanger</span></div></article>' +
      '<article class="format-inspiration-card"><div class="format-cover format-cover-series"><span class="format-index">02 / SÉRIE</span><strong>Parte 01:<br>a escolha.</strong><i>CONTINUA...</i></div><div class="format-card-copy"><h3>História em partes</h3><p>Contexto rápido, conflito claro e uma pergunta que realmente muda a próxima parte.</p><span class="format-meta">Capítulos · comentário · votação</span></div></article>' +
      '<article class="format-inspiration-card"><div class="format-cover format-cover-doc"><span class="format-index">03 / MINI-DOC</span><strong>O detalhe<br>que ninguém viu.</strong><i>FATO → CONTEXTO</i></div><div class="format-card-copy"><h3>Mini-documentário</h3><p>Uma pergunta por vídeo, cortes objetivos, legendas legíveis e fontes registradas.</p><span class="format-meta">Hook · evidência · conclusão</span></div></article>' +
      '</div></section>' +
      '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">SEU ESPAÇO DE TRABALHO</span><h2>Projetos recentes</h2></div><button class="button button-ghost" data-action="navigate" data-view="projects">Ver todos <span>→</span></button></div>' +
      (recent.length ? '<div class="project-grid">' + recent.map(renderProjectCard).join("") + '</div>' : '<div class="empty-state"><div class="empty-illustration">✦</div><h3>Sua primeira série começa com uma ideia.</h3><p>Crie uma premissa, escolha uma linguagem de vídeo e desenvolva cada episódio em formato vertical.</p><button class="button button-primary" data-action="new-project">Criar minha primeira série</button></div>') +
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
      ["overview", "Visão geral"], ["episodes", "Vídeos"], ["characters", "Personagens"],
      ["universe", "Universo"], ["polls", "Enquetes"], ["continuity", "Continuidade"], ["sources", "Fontes"], ["history", "Versões"], ["export", "Exportar"]
    ];
    return '<div class="page-stack editor-stack"><div class="editor-topline"><button class="text-button" data-action="navigate" data-view="projects">← Projetos</button><span class="project-tag">' + escapeHtml(project.format) + '</span><span class="status-pill">' + escapeHtml(project.status) + '</span><span class="spacer"></span><button class="button button-secondary button-small" data-action="generate-project">✦ Desenvolver com IA</button><button class="button button-danger-ghost button-small" data-action="delete-project">Excluir projeto</button></div>' +
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
    if (activeTab === "history") return renderHistory(project);
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
      '<label class="field"><span>Idioma</span><select data-bind="language">' + ["Português (Brasil)", "English", "Español"].map((item) => '<option ' + (project.language === item ? "selected" : "") + '>' + item + '</option>').join("") + '</select></label>' +
      '<label class="field"><span>Público-alvo</span><select data-bind="audience">' + ["Público geral", "Adolescente", "Jovem", "Família", "Educativo"].map((item) => '<option ' + (project.audience === item ? "selected" : "") + '>' + item + '</option>').join("") + '</select></label>' +
      '<label class="field"><span>Ritmo narrativo</span><select data-bind="pacing">' + ["Dinâmico", "Lento e atmosférico", "Crescente", "Episódico", "Investigativo", "Com cortes rápidos"].map((item) => '<option ' + (project.pacing === item ? "selected" : "") + '>' + item + '</option>').join("") + '</select></label>' +
      '</div><div class="save-hint"><span class="live-dot"></span> Alterações salvas automaticamente neste dispositivo.</div></section>' +
      '<aside class="panel panel-accent"><span class="eyebrow">PRÓXIMOS PASSOS</span><h2>Construa com intenção.</h2><p>Uma boa história interativa tem regras claras, escolhas com consequências e continuidade entre episódios.</p><div class="check-row"><span class="' + (project.world.rules.length ? "check-done" : "") + '">✓</span><span>Definir as regras do universo</span></div><div class="check-row"><span class="' + (project.characters.length ? "check-done" : "") + '">✓</span><span>Criar personagens</span></div><div class="check-row"><span class="' + (project.episodes.some((episode) => episode.script) ? "check-done" : "") + '">✓</span><span>Escrever o primeiro roteiro</span></div><div class="check-row"><span class="' + (project.polls.length ? "check-done" : "") + '">✓</span><span>Preparar uma votação</span></div><button class="button button-primary button-wide" data-action="generate-project">✦ Desenvolver estrutura com IA</button></aside></div>' +
      '<section class="panel"><div class="panel-heading"><div><span class="eyebrow">LINHA DO TEMPO</span><h2>Seus vídeos</h2></div><button class="button button-secondary button-small" data-action="switch-tab" data-tab="episodes">Abrir episódios →</button></div>' +
      '<div class="episode-mini-list">' + project.episodes.slice(0, 4).map((episode) => '<button class="episode-mini" data-action="select-episode" data-id="' + escapeHtml(episode.id) + '"><span class="episode-number">' + String(episode.number).padStart(2, "0") + '</span><span class="episode-mini-copy"><b>' + escapeHtml(episode.title) + '</b><small>' + escapeHtml(episode.summary || "Sem resumo ainda") + '</small></span><span class="muted">→</span></button>').join("") + '</div></section>';
  }

  function renderEpisodes(project) {
    const episode = project.episodes.find((item) => item.id === activeEpisodeId);
    if (!episode) return '<div class="page-stack"><div class="section-heading video-library-heading"><div><span class="eyebrow">BIBLIOTECA DE VÍDEOS</span><h2>Seus episódios</h2><p class="muted">Cada cartão é um vídeo vertical em desenvolvimento. Abra para editar roteiro, cenas e publicação.</p></div><div class="button-group"><button class="button button-secondary" data-action="generate-next-episode">✦ Próximo episódio com IA</button><button class="button button-primary" data-action="add-episode">＋ Novo vídeo</button></div></div>' +
      (project.episodes.length ? '<div class="video-episode-grid">' + project.episodes.map((item) => '<button class="video-episode-card" data-action="select-episode" data-id="' + escapeHtml(item.id) + '"><div class="episode-cover"><span class="cover-label">WHAT IF / ' + String(item.number).padStart(2, "0") + '</span><span class="cover-play">▶</span><div class="cover-title">' + escapeHtml(item.title) + '</div><span class="cover-ratio">9:16</span></div><div class="video-episode-meta"><div><b>' + escapeHtml(item.title) + '</b><small>' + escapeHtml(item.summary || "Adicione um resumo para definir o gancho.") + '</small></div><span class="status-pill">' + escapeHtml(item.status) + '</span></div><div class="video-card-foot"><span>▶ ' + (item.scenes || []).length + ' cenas</span><span>Editar vídeo →</span></div></button>').join("") + '</div>' : '<div class="empty-state"><div class="empty-illustration">▶</div><h3>Nenhum vídeo por enquanto</h3><p>Crie o primeiro episódio e monte o storyboard em 9:16.</p><button class="button button-primary" data-action="add-episode">Criar primeiro vídeo</button></div>') +
      '</div>';

    const scenes = Array.isArray(episode.scenes) ? episode.scenes : [];
    const totalSeconds = scenes.reduce((sum, scene) => sum + Math.max(1, Number(scene.duration) || 8), 0);
    const activeScene = scenes.find((scene) => scene.id === activeSceneId) || scenes[0] || {};
    const previewHeadline = activeScene.onScreen || episode.title || "Sua próxima história começa aqui.";
    const previewVisual = activeScene.visual || episode.summary || "Adicione a descrição visual da primeira cena.";
    const previewAudio = activeScene.audio || "Narração e diálogo aparecem aqui.";
    let elapsedSeconds = 0;
    const timeline = scenes.length ? '<div class="storyboard-strip">' + scenes.map((scene, index) => {
      const startAt = elapsedSeconds;
      elapsedSeconds += Math.max(1, Number(scene.duration) || 8);
      return '<button class="storyboard-frame ' + (scene.id === activeScene.id ? "active" : "") + '" data-action="select-scene" data-id="' + escapeHtml(scene.id) + '" aria-pressed="' + (scene.id === activeScene.id) + '"><span class="storyboard-thumb"><span>' + String(index + 1).padStart(2, "0") + '</span><i>▶</i><small data-storyboard-duration="' + escapeHtml(scene.id) + '">' + escapeHtml(scene.duration || 8) + 's</small></span><b data-storyboard-title="' + escapeHtml(scene.id) + '">' + escapeHtml(scene.title || "Cena " + (index + 1)) + '</b><small data-storyboard-caption="' + escapeHtml(scene.id) + '">' + escapeHtml(scene.onScreen || scene.visual || "Sem descrição visual") + '</small><span class="storyboard-timecode" data-storyboard-timecode="' + escapeHtml(scene.id) + '">' + formatTimecode(startAt) + '</span></button>';
    }).join("") + '</div>' : '<div class="storyboard-empty">Adicione cenas para montar a sequência visual do episódio.</div>';
    elapsedSeconds = 0;
    const sceneCards = scenes.length ? '<div class="scene-grid scene-grid-editor">' + scenes.map((scene, index) => {
      const startAt = elapsedSeconds;
      elapsedSeconds += Math.max(1, Number(scene.duration) || 8);
      return '<article class="scene-card scene-card-pro ' + (scene.id === activeScene.id ? "active" : "") + '"><div class="scene-card-top"><span class="scene-index">CENA ' + String(index + 1).padStart(2, "0") + '</span><span class="scene-timecode" data-scene-timecode="' + escapeHtml(scene.id) + '">' + formatTimecode(startAt) + '</span><button class="icon-button danger-text" data-action="delete-scene" data-id="' + escapeHtml(scene.id) + '" title="Excluir cena">×</button></div><div class="scene-shot-placeholder"><span>SHOT ' + String(index + 1).padStart(2, "0") + '</span><b data-scene-title="' + escapeHtml(scene.id) + '">' + escapeHtml(scene.title || "Plano sem título") + '</b></div><label class="field"><span>Nome da cena</span><input data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="title" value="' + escapeHtml(scene.title || "") + '" placeholder="Ex.: O corredor vazio"></label><label class="field"><span>Visual / câmera</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="visual" placeholder="O que aparece?">' + escapeHtml(scene.visual || "") + '</textarea></label><label class="field"><span>Prompt de imagem</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="imagePrompt" placeholder="Descrição visual para gerar uma imagem...">' + escapeHtml(scene.imagePrompt || "") + '</textarea></label><label class="field"><span>Direção de vídeo / câmera</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="videoPrompt" placeholder="Movimento, enquadramento, transição...">' + escapeHtml(scene.videoPrompt || "") + '</textarea></label><label class="field"><span>Narração / diálogo</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="audio" placeholder="O que é dito ou ouvido?">' + escapeHtml(scene.audio || "") + '</textarea></label><label class="field"><span>Direção de áudio</span><textarea data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="audioDirection" placeholder="Interpretação, ritmo, intensidade...">' + escapeHtml(scene.audioDirection || "") + '</textarea></label><label class="field"><span>Texto na tela</span><input data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="onScreen" value="' + escapeHtml(scene.onScreen || "") + '" placeholder="Frase de abertura ou legenda"></label><div class="scene-meta"><label class="field"><span>Duração (s)</span><input type="number" min="1" max="300" data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="duration" value="' + escapeHtml(scene.duration || 8) + '"></label><label class="field"><span>Som / trilha</span><input data-scene-id="' + escapeHtml(scene.id) + '" data-scene-field="sfx" value="' + escapeHtml(scene.sfx || "") + '" placeholder="Ambiente, efeito..."></label></div></article>';
    }).join("") + '</div>' : '<div class="empty-inline"><p>Nenhuma cena detalhada ainda.</p><button class="button button-secondary button-small" data-action="add-scene">Adicionar primeira cena</button></div>';

    return '<div class="page-stack video-editor-page"><div class="video-editor-topline"><button class="text-button" data-action="back-episodes">← Todos os vídeos</button><span class="project-tag">EPISÓDIO ' + String(episode.number).padStart(2, "0") + '</span><span class="status-pill">' + escapeHtml(episode.status) + '</span><span class="spacer"></span><button class="button button-secondary button-small" data-action="generate-episode">✦ Gerar roteiro com IA</button></div>' +
      '<div class="video-editor-heading"><div><span class="eyebrow">EDITOR DE VÍDEO VERTICAL</span><h2>' + escapeHtml(episode.title) + '</h2><p>' + escapeHtml(episode.summary || "Defina a premissa visual e narrativa deste vídeo.") + '</p></div><div class="video-editor-specs"><span>9:16</span><span>' + scenes.length + ' cenas</span><span>' + totalSeconds + 's estimados</span></div></div>' +
      '<div class="video-editor-layout"><div class="video-editor-main"><section class="panel video-preview-panel"><div class="panel-heading"><div><span class="eyebrow">MONITOR DE PRÉVIA</span><h2>Composição vertical</h2></div><div class="preview-mode-chip"><i></i> STORYBOARD</div></div><div class="video-preview-stage"><div class="reel-preview"><div class="reel-preview-top"><span>WHAT IF STUDIO</span><span>9:16 · PREVIEW</span></div><div class="reel-preview-center"><span class="reel-preview-kicker">PARTE ' + String(episode.number).padStart(2, "0") + '</span><h3 data-preview-headline>' + escapeHtml(previewHeadline) + '</h3><p data-preview-visual>' + escapeHtml(previewVisual) + '</p><span class="reel-play-mark">▶</span></div><div class="reel-preview-bottom"><div class="reel-mini-avatar">W</div><div><b>@whatifstudio</b><small data-preview-title>' + escapeHtml(episode.title) + '</small></div><span class="reel-preview-heart">♥</span></div><div class="reel-progress"><i></i><i></i><i></i><i></i></div></div><div class="preview-inspector"><span class="eyebrow" data-preview-audio-label>ÁUDIO / CENA ' + String((scenes.findIndex((scene) => scene.id === activeScene.id) + 1) || 1).padStart(2, "0") + '</span><p data-preview-audio>' + escapeHtml(previewAudio) + '</p><div class="preview-inspector-foot"><span>Prévia conceitual</span><span>Não é render de vídeo</span></div></div></div><p class="preview-disclaimer">A tela acima é uma referência de composição do storyboard. O arquivo de vídeo final deve ser montado em um editor de vídeo usando os prompts, cenas e áudios planejados.</p></section>' +
      '<section class="panel video-timeline-panel"><div class="panel-heading"><div><span class="eyebrow">SEQUÊNCIA</span><h2>Storyboard / timeline</h2></div><button class="button button-secondary button-small" data-action="add-scene">＋ Adicionar cena</button></div>' + timeline + '</section>' +
      '<section class="panel video-script-panel"><div class="panel-heading"><div><span class="eyebrow">ROTEIRO</span><h2>Texto e narrativa</h2></div><span class="save-chip"><i></i> Auto-save</span></div><div class="form-grid">' + episodeField("Título do vídeo", "title", episode.title, "Nome do episódio") + episodeField("Resumo / gancho", "summary", episode.summary, "O que prende a atenção nos primeiros segundos?", "textarea") + episodeField("Roteiro completo", "script", episode.script, "Narração, falas, ações e texto na tela...", "textarea") + '</div><div class="save-hint"><span class="live-dot"></span> Roteiro salvo automaticamente.</div></section>' +
      '</div><aside class="video-editor-aside"><section class="panel video-settings-panel"><span class="eyebrow">CONFIGURAÇÃO DO VÍDEO</span><h3>Produção</h3><label class="field"><span>Status</span><select data-episode-field="status"><option ' + (episode.status === "Rascunho" ? "selected" : "") + '>Rascunho</option><option ' + (episode.status === "Em revisão" ? "selected" : "") + '>Em revisão</option><option ' + (episode.status === "Pronto" ? "selected" : "") + '>Pronto</option><option ' + (episode.status === "Publicado" ? "selected" : "") + '>Publicado</option></select></label><div class="production-spec-row"><span>Formato</span><b>Vertical · 9:16</b></div><div class="production-spec-row"><span>Duração estimada</span><b data-production-duration>' + totalSeconds + ' segundos</b></div><p class="muted small">Pense no primeiro segundo como uma promessa visual. Cada cena precisa entregar uma informação nova.</p><button class="button button-ghost button-wide" data-action="add-scene">＋ Nova cena</button><button class="button button-danger-ghost button-wide" data-action="delete-episode">Excluir episódio</button></section>' +
      '<section class="panel publish-panel"><span class="eyebrow">PACOTE DE PUBLICAÇÃO</span><h3>Depois de editar</h3><div class="form-grid">' + episodeField("Legenda do post", "caption", episode.caption, "Texto da publicação...", "textarea") + episodeField("Comentário fixado", "pinnedComment", episode.pinnedComment, "Contexto ou chamada para votar...", "textarea") + episodeField("Enquete para Stories", "storyPoll", episode.storyPoll, "Pergunta e opções para publicar...", "textarea") + '</div></section></aside></div>' +
      '<section class="panel video-scenes-panel"><div class="panel-heading"><div><span class="eyebrow">DECUPAGEM DETALHADA</span><h2>Cenas, prompts e áudio</h2><p class="muted small">Descreva o plano, o movimento, a voz e o texto que aparece em cada take.</p></div><button class="button button-secondary button-small" data-action="add-scene">＋ Adicionar cena</button></div>' + sceneCards + '</section></div>';
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
        return '<article class="panel poll-card"><div class="poll-heading"><div><span class="eyebrow">VOTAÇÃO</span><h3>' + escapeHtml(poll.question) + '</h3></div><button class="icon-button danger-text" data-action="delete-poll" data-id="' + escapeHtml(poll.id) + '">×</button></div><div class="poll-options">' + options.map((option, index) => '<div class="poll-option"><div class="poll-option-head"><b>' + escapeHtml(option.label) + '</b><span>' + Number(option.votes || 0) + ' votos</span></div>' + (option.consequence ? '<small class="branch-consequence">Se vencer: ' + escapeHtml(option.consequence) + '</small>' : '') + '<div class="poll-track"><span style="width:' + Math.round(Number(option.votes || 0) / max * 100) + '%"></span></div><button class="text-button vote-button" data-action="add-vote" data-id="' + escapeHtml(poll.id) + '" data-index="' + index + '">+ Registrar voto</button><button class="text-button" data-action="set-winner" data-id="' + escapeHtml(poll.id) + '" data-index="' + index + '">Definir vencedora</button></div>').join("") + '</div><div class="poll-result"><span>Total: <b>' + total + '</b></span><span>Vencedora: <b>' + escapeHtml(poll.winner || "A definir") + '</b></span></div><div class="consequence"><b>Consequência narrativa</b><p>' + escapeHtml(poll.consequence || "Ainda não registrada.") + '</p></div><form data-form="count-poll-comments" data-poll-id="' + escapeHtml(poll.id) + '" class="comment-vote-form"><label class="field"><span>Contar votos dos comentários</span><textarea name="comments" required placeholder="Cole aqui um comentário por linha. Ex.: A, 1, ou o nome exato da opção."></textarea></label><p class="small muted">Conta comentários que mencionem apenas uma opção. O texto colado é processado nesta aba e não é salvo.</p><button class="button button-secondary button-small" type="submit">Somar votos reconhecidos</button></form></article>';
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

  function renderHistory(project) {
    const history = Array.isArray(project.history) ? project.history.slice().reverse() : [];
    return '<div class="section-heading"><div><span class="eyebrow">PONTOS DE RESTAURAÇÃO</span><h2>Versões do projeto</h2><p class="muted">Salve marcos antes de mudanças importantes e restaure uma versão sem perder o registro das demais.</p></div><button class="button button-primary" data-action="save-version">＋ Salvar versão atual</button></div>' +
      (history.length ? '<div class="version-list">' + history.map((version) => '<article class="version-card"><div class="version-symbol">↺</div><div class="version-copy"><b>' + escapeHtml(version.snapshot && version.snapshot.title || project.title) + '</b><small>' + dateLabel(version.createdAt) + ' · ' + escapeHtml(version.label || "Ponto de restauração") + '</small></div><button class="button button-secondary button-small" data-action="restore-version" data-id="' + escapeHtml(version.id) + '">Restaurar</button><button class="icon-button danger-text" data-action="delete-version" data-id="' + escapeHtml(version.id) + '" title="Excluir versão">×</button></article>').join("") + '</div>' : '<div class="empty-state"><div class="empty-illustration">↺</div><h3>Nenhuma versão salva</h3><p>Crie um ponto de restauração antes de reescrever um episódio ou mudar o rumo da história.</p><button class="button button-primary" data-action="save-version">Salvar primeira versão</button></div>');
  }

  function renderExport(project) {
    return '<div class="two-column"><section class="panel"><span class="eyebrow">SEU MATERIAL, SEU FORMATO</span><h2>Exportar projeto</h2><p class="muted">Baixe uma cópia do projeto para guardar, revisar ou levar para outra ferramenta.</p><div class="export-options"><button class="export-option" data-action="import-json"><span class="export-icon">↑</span><span><b>Importar backup JSON</b><small>Recupere um projeto exportado anteriormente.</small></span><span>↑</span></button><input type="file" accept="application/json,.json" data-import-file hidden><button class="export-option" data-action="export" data-format="json"><span class="export-icon">{ }</span><span><b>JSON completo</b><small>Todos os dados e a estrutura do projeto.</small></span><span>↓</span></button><button class="export-option" data-action="export" data-format="markdown"><span class="export-icon">M↓</span><span><b>Markdown</b><small>Documento legível com episódios, personagens e enquetes.</small></span><span>↓</span></button><button class="export-option" data-action="export" data-format="txt"><span class="export-icon">TXT</span><span><b>Texto simples</b><small>Roteiros e informações em texto.</small></span><span>↓</span></button><button class="export-option" data-action="export" data-format="srt"><span class="export-icon">CC</span><span><b>Legendas SRT</b><small>Gera legendas a partir das falas e narrações das cenas.</small></span><span>↓</span></button></div></section><aside class="panel panel-soft"><span class="eyebrow">BACKUP</span><h3>Seus dados ficam com você.</h3><p>O salvamento local mantém o projeto neste navegador. Ative a sincronização nas configurações para guardar uma cópia na sua conta Supabase.</p><button class="button button-secondary button-wide" data-action="navigate" data-view="settings">Configurar sincronização →</button></aside></div>';
  }

  function renderSettings() {
    const settings = getSettings();
    const isConfigured = Boolean(settings.supabaseUrl && settings.supabaseAnon);
    return '<div class="page-stack"><div class="section-heading"><div><span class="eyebrow">PREFERÊNCIAS</span><h1>Configurações</h1><p class="muted">Conecte os serviços opcionais. O estúdio continua funcionando localmente sem eles.</p></div></div>' +
      '<section class="panel settings-panel"><div class="panel-heading"><div><span class="eyebrow">BACKUP NA NUVEM</span><h2>Supabase</h2></div><span class="service-status ' + (signedInUser ? "online" : isConfigured ? "configured" : "") + '">' + (signedInUser ? "Conectado" : isConfigured ? "Configurado" : "Opcional") + '</span></div><p class="muted">Este projeto já vem conectado ao Supabase. URL e chave publishable estão pré-configuradas; você só precisa entrar com seu e-mail para ativar a sincronização na nuvem.</p><form data-form="settings" class="form-grid">' +
      '<label class="field"><span>Project URL</span><input name="supabaseUrl" type="url" placeholder="https://seu-projeto.supabase.co" value="' + escapeHtml(settings.supabaseUrl || "") + '"></label>' +
      '<label class="field"><span>Anon / publishable key</span><input name="supabaseAnon" type="password" autocomplete="off" placeholder="Chave pública do Supabase" value="' + escapeHtml(settings.supabaseAnon || "") + '"></label><div class="form-actions"><button class="button button-primary" type="submit">Salvar configuração</button><span class="small muted">A chave pública fica no navegador e depende das políticas RLS do banco.</span></div></form>' +
      '<div class="cloud-account">' + (signedInUser ? '<div><b>Conectado como ' + escapeHtml(signedInUser.email || "usuário") + '</b><p class="small muted">Os projetos serão sincronizados com sua conta.</p></div><button class="button button-secondary" data-action="cloud-signout">Sair</button><button class="button button-primary" data-action="cloud-sync">Sincronizar agora</button>' : '<form data-form="cloud-login" class="login-form"><label class="field"><span>Seu e-mail</span><input name="email" type="email" required placeholder="voce@exemplo.com"></label><button class="button button-secondary" type="submit" ' + (isConfigured ? "" : "disabled") + '>Enviar link de acesso</button></form>') + '</div>' +
      '<p class="small muted">O schema e as políticas por usuário já foram instalados. Depois que o site estiver publicado, a URL final será adicionada à lista de redirecionamentos permitidos do Supabase.</p></section>' +
      '<section class="panel settings-panel"><div class="panel-heading"><div><span class="eyebrow">GERAÇÃO DE CONTEÚDO</span><h2>Escolha sua IA</h2></div><span class="service-status ' + (aiSessionCredentials ? "configured" : "") + '">' + (aiSessionCredentials ? aiProviderLabel(aiSessionCredentials.provider) + " pronta" : "Chave necessária") + '</span></div><p>Antes de gerar roteiros, escolha OpenAI, Gemini ou Claude e informe sua própria chave de API. O uso é cobrado diretamente pelo serviço escolhido.</p><div class="ai-provider-status"><span class="live-dot"></span><span>' + (aiSessionCredentials ? "Chave ativa somente nesta aba · " + aiProviderLabel(aiSessionCredentials.provider) : "Nenhuma chave configurada nesta aba") + '</span></div><div class="button-group"><button class="button button-primary" data-action="configure-ai">' + (aiSessionCredentials ? "Trocar provedor ou chave" : "＋ Configurar chave de IA") + '</button>' + (aiSessionCredentials ? '<button class="button button-ghost" data-action="clear-ai-key">Esquecer chave</button>' : '') + '</div><p class="small muted">A chave é mantida apenas na memória desta aba e enviada ao servidor somente durante a geração. Ela não é salva no projeto, na nuvem ou no navegador; feche a aba para removê-la.</p><div class="callout-note">É necessário entrar no Supabase para aplicar o limite de 20 gerações por dia. Cada provedor pode exigir créditos ou faturamento próprios.</div></section>' +
      '<section class="panel settings-panel"><div class="panel-heading"><div><span class="eyebrow">ARMAZENAMENTO</span><h2>Dados deste dispositivo</h2></div></div><p class="muted">Atualmente há <b>' + state.projects.length + '</b> projeto(s) salvos neste navegador.</p><button class="button button-danger-ghost" data-action="clear-local">Apagar dados locais deste navegador</button><p class="small muted">Esta ação não apaga cópias já sincronizadas na nuvem.</p></section></div>';
  }

  function aiProviderLabel(provider) {
    return ({ openai: "OpenAI", gemini: "Gemini", claude: "Claude" })[provider] || "IA";
  }

  function showAiProviderModal() {
    const provider = aiSessionCredentials && aiSessionCredentials.provider || "openai";
    openModal('<div class="modal-top"><div><span class="eyebrow">CONFIGURAÇÃO NECESSÁRIA</span><h2>Conecte sua IA</h2><p>Escolha um provedor e informe uma chave de API sua.</p></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button></div><form data-form="ai-provider" class="form-grid ai-key-form"><label class="field full"><span>Provedor de IA</span><select name="provider"><option value="openai" ' + (provider === "openai" ? "selected" : "") + '>OpenAI</option><option value="gemini" ' + (provider === "gemini" ? "selected" : "") + '>Google Gemini</option><option value="claude" ' + (provider === "claude" ? "selected" : "") + '>Anthropic Claude</option></select></label><label class="field full"><span>Chave de API</span><input name="apiKey" type="password" required minlength="10" autocomplete="new-password" spellcheck="false" placeholder="Cole sua chave de API" autofocus></label><div class="provider-key-note full"><b>A chave fica nesta aba.</b><span>Ela será enviada ao servidor somente para a geração e apagada ao fechar a aba. Não cole uma chave em um computador compartilhado.</span></div><div class="callout-note full">O provedor cobra o uso da API diretamente na conta dele. Entrar no ChatGPT, Gemini ou Claude não substitui uma chave de API.</div><div class="modal-actions full"><button class="button button-ghost" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Salvar nesta aba e continuar</button></div></form>');
    const input = $('[name="apiKey"]', $("#modal-root"));
    if (input) input.focus();
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
      '<label class="field full"><span>Pergunta</span><input name="question" required maxlength="180" placeholder="O que a personagem deve fazer?"></label><label class="field full"><span>Opções (uma por linha; use | para definir a consequência)</span><textarea name="options" required placeholder="Confiar no desconhecido | Revela o segredo&#10;Voltar para casa | Perde a pista principal"></textarea></label><label class="field full"><span>Consequência narrativa</span><textarea name="consequence" placeholder="Como cada escolha muda o próximo episódio?"></textarea></label><div class="modal-actions"><button class="button button-ghost" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Criar enquete</button></div></form>');
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
    if (!aiSessionCredentials || !aiSessionCredentials.apiKey) {
      pendingAiGeneration = kind;
      showAiProviderModal();
      notify("Configure uma chave de IA para continuar.", "info");
      return;
    }
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
        body: JSON.stringify({ kind: kind, project: project, episode: episode || null, provider: aiSessionCredentials.provider, apiKey: aiSessionCredentials.apiKey })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível gerar. Confira a chave e o provedor de IA.");
      if (kind === "episode") {
        if (!episode) throw new Error("Abra um episódio antes de gerar o roteiro.");
        episode.title = body.title || episode.title;
        episode.summary = body.summary || episode.summary;
        episode.script = body.script || episode.script;
        episode.caption = body.caption || episode.caption || "";
        episode.pinnedComment = body.pinnedComment || episode.pinnedComment || "";
        episode.storyPoll = body.storyPoll || episode.storyPoll || "";
        episode.scenes = Array.isArray(body.scenes) ? body.scenes.map((scene) => ({
          id: uid(), title: scene.title || "Nova cena", visual: scene.visual || "",
          audio: scene.audio || "", audioDirection: scene.audioDirection || "", imagePrompt: scene.imagePrompt || "", videoPrompt: scene.videoPrompt || "", onScreen: scene.onScreen || "",
          duration: Number(scene.duration) || 8, sfx: scene.sfx || ""
        })) : episode.scenes;
      } else {
        if ((!project.title || project.title === "Nova história") && body.title) project.title = body.title;
        if (!project.premise && (body.premise || body.logline)) project.premise = body.premise || body.logline;
        if (body.setting && !project.world.setting) project.world.setting = body.setting;
        if (body.visualStyle && !project.world.visualStyle) project.world.visualStyle = body.visualStyle;
        if (Array.isArray(body.universe)) {
          project.world.rules = Array.from(new Set([...(project.world.rules || []), ...body.universe.map(String)]));
        }
        if (Array.isArray(body.characters) && body.characters.length) {
          const existingNames = new Set(project.characters.map((item) => String(item.name || "").toLowerCase()));
          const generatedCharacters = body.characters
            .filter((character) => !existingNames.has(String(character.name || "").toLowerCase()))
            .map((character) => ({ id: uid(), name: character.name || "Personagem", role: character.role || "Personagem", description: character.description || "", appearance: character.appearance || "", voice: character.voice || "" }));
          project.characters.push(...generatedCharacters);
        }
        if (Array.isArray(body.episodes) && body.episodes.length) {
          const hasOnlyBlankStarter = project.episodes.length === 1 &&
            project.episodes[0].title === "Episódio 1" &&
            !project.episodes[0].summary && !project.episodes[0].script &&
            !(project.episodes[0].scenes || []).length;
          const startNumber = hasOnlyBlankStarter ? 0 : project.episodes.length;
          const generatedEpisodes = body.episodes.map((item, index) => ({
            id: uid(), number: startNumber + index + 1, title: item.title || "Episódio " + (startNumber + index + 1),
            summary: item.summary || "", script: item.script || "", caption: item.caption || "", pinnedComment: item.pinnedComment || "", storyPoll: item.storyPoll || "",
            scenes: Array.isArray(item.scenes) ? item.scenes.map((scene) => ({
              id: uid(), title: scene.title || "Cena", visual: scene.visual || "",
              audio: scene.audio || "", audioDirection: scene.audioDirection || "", imagePrompt: scene.imagePrompt || "", videoPrompt: scene.videoPrompt || "", onScreen: scene.onScreen || "",
              duration: Number(scene.duration) || 8, sfx: scene.sfx || ""
            })) : [], pollId: null, status: "Rascunho"
          }));
          if (hasOnlyBlankStarter) project.episodes = generatedEpisodes;
          else project.episodes.push(...generatedEpisodes);
        }
        if (Array.isArray(body.polls)) {
          const generatedPolls = body.polls.map((poll) => ({
            id: uid(), question: poll.question || "Escolha o próximo passo",
            options: (poll.options || []).map((option) => ({ label: typeof option === "string" ? option : option.label || "Opção", consequence: typeof option === "string" ? "" : option.consequence || "", votes: 0 })),
            winner: "", consequence: poll.consequence || ""
          }));
          project.polls.push(...generatedPolls);
        }
        if (Array.isArray(body.continuity)) {
          const existingFacts = new Set(project.continuity.map((entry) => String(entry.text || "").toLowerCase()));
          project.continuity.push(...body.continuity
            .map((text) => String(text))
            .filter((text) => !existingFacts.has(text.toLowerCase()))
            .map((text) => ({ id: uid(), type: "Fato estabelecido", text, createdAt: new Date().toISOString() })));
        }
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
    activeSceneId = null;
    activeTab = "episodes";
    project.updatedAt = new Date().toISOString();
    save(); render();
  }

  function addScene() {
    const project = currentProject();
    const episode = project && project.episodes.find((item) => item.id === activeEpisodeId);
    if (!episode) return;
    const scene = { id: uid(), title: "Nova cena", visual: "", imagePrompt: "", videoPrompt: "", audio: "", audioDirection: "", onScreen: "", duration: 8, sfx: "" };
    episode.scenes.push(scene);
    activeSceneId = scene.id;
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
    if (!supabaseClient) { notify("A conexão com o Supabase ainda não foi carregada. Atualize a página e tente novamente.", "error"); return; }
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
      project.episodes.forEach((episode) => {
        lines.push("## Episódio " + episode.number + " — " + episode.title, episode.summary, "", episode.script, "", "Legenda: " + (episode.caption || ""), "Comentário fixado: " + (episode.pinnedComment || ""), "Enquete para Stories: " + (episode.storyPoll || ""), "");
        (episode.scenes || []).forEach((scene, index) => lines.push("### Cena " + (index + 1) + " — " + scene.title, "Visual: " + (scene.visual || ""), "Prompt de imagem: " + (scene.imagePrompt || ""), "Prompt de vídeo: " + (scene.videoPrompt || ""), "Áudio: " + (scene.audio || ""), "Direção de áudio: " + (scene.audioDirection || ""), "Texto na tela: " + (scene.onScreen || ""), "Duração: " + (scene.duration || 0) + "s", "Som: " + (scene.sfx || ""), ""));
      });
      project.polls.forEach((poll) => lines.push("## Enquete", poll.question, ...(poll.options || []).map((option) => "- " + option.label + " (" + option.votes + " votos)" + (option.consequence ? " — Se vencer: " + option.consequence : "")), "Consequência: " + poll.consequence, ""));
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
    if (action === "close-modal") {
      if ($('[data-form="ai-provider"]')) pendingAiGeneration = null;
      return closeModal();
    }
    if (action === "configure-ai") return showAiProviderModal();
    if (action === "clear-ai-key") { aiSessionCredentials = null; render(); notify("Chave esquecida nesta aba.", "success"); return; }
    if (action === "navigate") { activeView = button.dataset.view; render(); return; }
    if (action === "edit-publish-episode") {
      const projectId = state.publishProjectId || state.projects[0]?.id;
      const projectToEdit = state.projects.find((item) => item.id === projectId);
      if (!projectToEdit) return;
      state.activeProjectId = projectToEdit.id;
      activeView = "editor"; activeTab = "episodes";
      activeEpisodeId = state.publishEpisodeId || projectToEdit.episodes[0]?.id || null;
      activeSceneId = null; save(false); render(); return;
    }
    if (action === "open-publish-poll") {
      const projectToEdit = state.projects.find((item) => item.id === state.publishProjectId) || state.projects[0];
      if (!projectToEdit) return;
      state.activeProjectId = projectToEdit.id; activeView = "editor"; activeTab = "polls";
      activeEpisodeId = null; activeSceneId = null; save(false); render(); return;
    }
    if (action === "add-to-queue") {
      const projectToQueue = state.projects.find((item) => item.id === state.publishProjectId) || state.projects[0];
      const episodeToQueue = projectToQueue && (projectToQueue.episodes.find((item) => item.id === state.publishEpisodeId) || projectToQueue.episodes[0]);
      if (!projectToQueue || !episodeToQueue) { notify("Escolha um projeto com episódio para planejar.", "error"); return; }
      const scheduleInput = $("[data-publish-time]");
      const scheduledAt = scheduleInput && new Date(scheduleInput.value);
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) { notify("Escolha uma data e hora futuras.", "error"); return; }
      const dayKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
      const dailyCount = state.publishQueue.filter((item) => dayKey(new Date(item.scheduledAt)) === dayKey(scheduledAt)).length;
      if (dailyCount >= 4) { notify("A fila já tem quatro vídeos planejados para esse dia.", "error"); return; }
      if (state.publishQueue.some((item) => item.episodeId === episodeToQueue.id && item.projectId === projectToQueue.id)) { notify("Este episódio já está na fila.", "error"); return; }
      state.publishQueue.push({ id: uid(), projectId: projectToQueue.id, episodeId: episodeToQueue.id, scheduledAt: scheduledAt.toISOString(), status: "planned" });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); notify("Vídeo adicionado ao planejamento.", "success"); return;
    }
    if (action === "remove-from-queue") {
      state.publishQueue = state.publishQueue.filter((item) => item.id !== button.dataset.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); return;
    }
    if (action === "copy-publish") {
      const projectToCopy = state.projects.find((item) => item.id === state.publishProjectId) || state.projects[0];
      const episodeToCopy = projectToCopy && projectToCopy.episodes.find((item) => item.id === state.publishEpisodeId) || projectToCopy?.episodes[0];
      const text = episodeToCopy && (button.dataset.field === "caption" ? episodeToCopy.caption : episodeToCopy.script);
      if (!text) { notify("Este campo ainda está vazio.", "error"); return; }
      try { await navigator.clipboard.writeText(text); notify("Texto copiado.", "success"); }
      catch (_) { notify("Não foi possível copiar automaticamente neste navegador.", "error"); }
      return;
    }
    if (action === "open-project") return openProject(button.dataset.id);
    if (action === "switch-tab") { activeTab = button.dataset.tab; activeEpisodeId = null; activeSceneId = null; render(); return; }
    if (action === "select-episode") { activeTab = "episodes"; activeEpisodeId = button.dataset.id; activeSceneId = null; render(); return; }
    if (action === "select-scene") { activeSceneId = button.dataset.id; render(); return; }
    if (action === "back-episodes") { activeEpisodeId = null; activeSceneId = null; render(); return; }
    if (action === "add-episode") return addEpisode();
    if (action === "add-scene") return addScene();
    if (action === "add-character") return showCharacterModal();
    if (action === "add-poll") return showPollModal();
    if (action === "add-continuity") return showContinuityModal();
    if (action === "add-source") return showSourceModal();
    if (action === "generate-next-episode") {
      if (!supabaseClient || !signedInUser) { notify("Conecte o Supabase e entre em Configurações antes de gerar com IA.", "error"); return; }
      if (!aiSessionCredentials || !aiSessionCredentials.apiKey) {
        pendingAiGeneration = "next-episode";
        showAiProviderModal();
        notify("Configure uma chave de IA para continuar.", "info");
        return;
      }
      addEpisode(); return generate("episode");
    }
    if (action === "save-version" && project) {
      const snapshot = JSON.parse(JSON.stringify(project));
      delete snapshot.history;
      project.history = Array.isArray(project.history) ? project.history : [];
      project.history.push({ id: uid(), createdAt: new Date().toISOString(), label: "Ponto de restauração", snapshot });
      if (project.history.length > 20) project.history.shift();
      save(); render(); notify("Versão salva.", "success"); return;
    }
    if (action === "restore-version" && project) {
      const version = (project.history || []).find((item) => item.id === button.dataset.id);
      if (!version || !version.snapshot) return;
      if (!window.confirm("Restaurar esta versão? O estado atual será substituído, mas seus pontos de restauração serão mantidos.")) return;
      const restored = JSON.parse(JSON.stringify(version.snapshot));
      const projectId = project.id;
      const history = project.history || [];
      Object.keys(project).forEach((key) => delete project[key]);
      Object.assign(project, restored, { id: projectId, history, updatedAt: new Date().toISOString() });
      save(); render(); notify("Versão restaurada.", "success"); return;
    }
    if (action === "delete-version" && project) {
      project.history = (project.history || []).filter((item) => item.id !== button.dataset.id);
      save(); render(); return;
    }
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
      if (activeSceneId === button.dataset.id) activeSceneId = null;
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
        project.continuity.push({ id: uid(), type: "Decisão da audiência", text: "A enquete \"" + poll.question + "\" foi vencida por: " + option.label + ". " + (option.consequence || "") + " " + (poll.consequence || ""), createdAt: new Date().toISOString() });
        save(); render(); notify("Resultado registrado na continuidade.", "success");
      }
      return;
    }
    if (action === "delete-project" && project) {
      if (!window.confirm("Excluir este projeto? A cópia local será removida e, se houver conexão, a cópia na nuvem também será excluída.")) return;
      const projectId = project.id;
      let cloudDeleteError = null;
      if (supabaseClient && signedInUser) {
        const { error } = await supabaseClient.from("projects").delete().eq("id", projectId).eq("user_id", signedInUser.id);
        cloudDeleteError = error;
      }
      state.projects = state.projects.filter((item) => item.id !== projectId);
      state.activeProjectId = null;
      activeView = "projects";
      activeEpisodeId = null;
      save(false);
      render();
      if (cloudDeleteError) notify("Projeto removido deste dispositivo, mas a cópia na nuvem não foi apagada: " + cloudDeleteError.message, "error");
      else notify("Projeto excluído.", "success");
      return;
    }
    if (action === "import-json") { const input = $('[data-import-file]'); if (input) input.click(); return; }
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
    if (target.dataset.courseField) {
      state.course[target.dataset.courseField] = target.value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const coursePreview = $(".course-hero");
      if (coursePreview) {
        const heading = $("h1", coursePreview), description = $(".hero-copy p", coursePreview), price = $(".course-price", coursePreview);
        const note = $("[data-course-payment-note]");
        if (target.dataset.courseField === "title" && heading) heading.textContent = target.value;
        if (target.dataset.courseField === "description" && description) description.textContent = target.value;
        if (target.dataset.courseField === "price" && price) price.textContent = target.value || "Consulte as condições pelo WhatsApp";
        if (target.dataset.courseField === "paymentNote" && note) note.textContent = target.value;
        if (target.dataset.courseField === "title") {
          const contact = $("a.button", coursePreview);
          if (contact) contact.href = "https://wa.me/5582993485560?text=" + encodeURIComponent("Olá! Quero saber mais sobre o curso: " + target.value);
        }
      }
      return;
    }
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
      if (episode) {
        episode[target.dataset.episodeField] = target.value;
        if (target.dataset.episodeField === "title") { const previewTitle = $("[data-preview-title]"); if (previewTitle) previewTitle.textContent = target.value || "Episódio"; }
        const previewScene = episode.scenes.find((scene) => scene.id === activeSceneId) || episode.scenes[0];
        if (target.dataset.episodeField === "title" && (!previewScene || !previewScene.onScreen)) { const headline = $("[data-preview-headline]"); if (headline) headline.textContent = target.value || "Sua próxima história começa aqui."; }
        if (target.dataset.episodeField === "summary" && (!previewScene || !previewScene.visual)) { const previewVisual = $("[data-preview-visual]"); if (previewVisual) previewVisual.textContent = target.value || "Adicione a descrição visual da primeira cena."; }
        save();
      }
    }
    if (target.dataset.sceneField) {
      const episode = project.episodes.find((item) => item.id === activeEpisodeId);
      const scene = episode && episode.scenes.find((item) => item.id === target.dataset.sceneId);
      if (scene) {
        scene[target.dataset.sceneField] = target.value;
        const sceneTitle = $("[data-scene-title=\"" + scene.id + "\"]");
        const storyboardTitle = $("[data-storyboard-title=\"" + scene.id + "\"]");
        const storyboardCaption = $("[data-storyboard-caption=\"" + scene.id + "\"]");
        if (target.dataset.sceneField === "title") {
          if (sceneTitle) sceneTitle.textContent = target.value || "Plano sem título";
          if (storyboardTitle) storyboardTitle.textContent = target.value || "Cena";
        }
        if (target.dataset.sceneField === "onScreen" || target.dataset.sceneField === "visual") {
          if (storyboardCaption) storyboardCaption.textContent = scene.onScreen || scene.visual || "Sem descrição visual";
        }
        if (target.dataset.sceneField === "duration") {
          const duration = Math.max(1, Number(target.value) || 8);
          const sceneDuration = $("[data-storyboard-duration=\"" + scene.id + "\"]");
          if (sceneDuration) sceneDuration.textContent = duration + "s";
          const totalDuration = episode.scenes.reduce((sum, item) => sum + Math.max(1, Number(item.duration) || 8), 0);
          const specs = $(".video-editor-specs span:last-child");
          const production = $("[data-production-duration]");
          if (specs) specs.textContent = totalDuration + "s estimados";
          if (production) production.textContent = totalDuration + " segundos";
          let elapsed = 0;
          episode.scenes.forEach((item) => {
            const timecode = formatTimecode(elapsed);
            const sceneTimecode = $("[data-scene-timecode=\"" + item.id + "\"]");
            const storyboardTimecode = $("[data-storyboard-timecode=\"" + item.id + "\"]");
            if (sceneTimecode) sceneTimecode.textContent = timecode;
            if (storyboardTimecode) storyboardTimecode.textContent = timecode;
            elapsed += Math.max(1, Number(item.duration) || 8);
          });
        }
        if (scene.id === activeSceneId || (!activeSceneId && episode.scenes[0] === scene)) {
          if (target.dataset.sceneField === "onScreen") { const headline = $("[data-preview-headline]"); if (headline) headline.textContent = target.value || episode.title || "Sua próxima história começa aqui."; }
          if (target.dataset.sceneField === "visual") { const visual = $("[data-preview-visual]"); if (visual) visual.textContent = target.value || episode.summary || "Adicione a descrição visual da primeira cena."; }
          if (target.dataset.sceneField === "audio") { const audio = $("[data-preview-audio]"); if (audio) audio.textContent = target.value || "Narração e diálogo aparecem aqui."; }
        }
        save();
      }
    }
    if (target.dataset.sourceField) {
      const source = (project.sources || []).find((item) => item.id === target.dataset.sourceId);
      if (source) { source[target.dataset.sourceField] = target.value; save(); }
    }
  });

  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target.dataset.publishSelect === "project") {
      state.publishProjectId = target.value;
      const selectedProject = state.projects.find((item) => item.id === target.value);
      state.publishEpisodeId = selectedProject && selectedProject.episodes[0] ? selectedProject.episodes[0].id : null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); return;
    }
    if (target.dataset.publishSelect === "episode") {
      state.publishEpisodeId = target.value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); return;
    }
    if (target.dataset.importFile !== undefined && target.files && target.files[0]) {
      const file = target.files[0];
      if (file.size > 2 * 1024 * 1024) { notify("O arquivo precisa ter até 2 MB.", "error"); target.value = ""; return; }
      try {
        const imported = JSON.parse(await file.text());
        if (!imported || typeof imported !== "object" || Array.isArray(imported) || !imported.title || !Array.isArray(imported.episodes)) {
          throw new Error("Este arquivo não parece ser um backup de projeto What If Studio.");
        }
        imported.id = uid();
        imported.createdAt = new Date().toISOString();
        imported.updatedAt = new Date().toISOString();
        imported.world = imported.world && typeof imported.world === "object" ? imported.world : { setting: "", rules: [], visualStyle: "" };
        imported.world.rules = Array.isArray(imported.world.rules) ? imported.world.rules : [];
        imported.characters = Array.isArray(imported.characters) ? imported.characters.map((item) => ({ ...item, id: uid() })) : [];
        imported.episodes = imported.episodes.map((item, index) => ({
          ...item, id: uid(), number: index + 1,
          scenes: Array.isArray(item.scenes) ? item.scenes.map((scene) => ({ ...scene, id: uid() })) : []
        }));
        imported.polls = Array.isArray(imported.polls) ? imported.polls.map((item) => ({ ...item, id: uid() })) : [];
        imported.continuity = Array.isArray(imported.continuity) ? imported.continuity.map((item) => ({ ...item, id: uid() })) : [];
        imported.sources = Array.isArray(imported.sources) ? imported.sources.map((item) => ({ ...item, id: uid() })) : [];
        imported.history = Array.isArray(imported.history) ? imported.history.map((item) => ({ ...item, id: uid(), snapshot: item.snapshot && typeof item.snapshot === "object" ? { ...item.snapshot, id: imported.id, history: undefined } : null })) : [];
        state.projects.unshift(imported);
        state.activeProjectId = imported.id;
        activeView = "editor";
        activeTab = "overview";
        activeEpisodeId = null;
        save();
        render();
        notify("Backup importado como um novo projeto.", "success");
      } catch (error) {
        notify(error.message || "Não foi possível importar o arquivo.", "error");
      } finally {
        target.value = "";
      }
      return;
    }
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
    if (type === "ai-provider") {
      const provider = String(data.provider || "");
      const apiKey = String(data.apiKey || "").trim();
      if (!["openai", "gemini", "claude"].includes(provider) || apiKey.length < 10 || apiKey.length > 512) {
        notify("Escolha um provedor e informe uma chave de API válida.", "error");
        return;
      }
      aiSessionCredentials = { provider, apiKey };
      const pending = pendingAiGeneration;
      pendingAiGeneration = null;
      closeModal();
      render();
      notify("" + aiProviderLabel(provider) + " pronta nesta aba.", "success");
      if (pending === "next-episode") {
        if (!supabaseClient || !signedInUser) { notify("Entre na sua conta Supabase antes de gerar com IA.", "error"); return; }
        addEpisode();
        return generate("episode");
      }
      if (pending) return generate(pending);
      return;
    }
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
      project.polls.push({ id: uid(), question: data.question, options: options.map((line) => { const parts = line.split("|"); return { label: (parts.shift() || "").trim(), consequence: parts.join("|").trim(), votes: 0 }; }), winner: "", consequence: data.consequence || "" });
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
    if (type === "count-poll-comments" && project) {
      const poll = project.polls.find((item) => item.id === form.dataset.pollId);
      if (!poll || !Array.isArray(poll.options)) return;
      const lines = String(data.comments || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
      const totals = poll.options.map(() => 0);
      let ignored = 0;
      lines.forEach((line) => {
        const normalizedLine = normalize(line);
        let matched = normalizedLine === "a" && poll.options[0] ? [{ index: 0 }] : normalizedLine === "b" && poll.options[1] ? [{ index: 1 }] : [];
        if (!matched.length) matched = poll.options.map((option, index) => ({ index, label: normalize(option.label) })).filter((item) => item.label && (normalizedLine === item.label || normalizedLine.includes(item.label)));
        if (!matched.length) {
          const choice = normalizedLine.match(/^\s*([1-6a-f])(?:\s*[-:.)]\s*|\s+)/i);
          if (choice) {
            const code = choice[1].toLowerCase();
            const index = /^[1-6]$/.test(code) ? Number(code) - 1 : code.charCodeAt(0) - 97;
            if (index >= 0 && index < poll.options.length) matched = [{ index }];
          }
        }
        if (matched.length === 1) totals[matched[0].index] += 1;
        else ignored += 1;
      });
      const recognized = totals.reduce((sum, value) => sum + value, 0);
      if (!recognized) { notify("Não encontrei comentários que correspondam a uma opção sem ambiguidade.", "error"); return; }
      poll.options.forEach((option, index) => { option.votes = Number(option.votes || 0) + totals[index]; });
      const finalCounts = poll.options.map((option) => Number(option.votes || 0));
      const highScore = Math.max(...finalCounts);
      const winners = finalCounts.map((value, index) => value === highScore ? index : -1).filter((index) => index >= 0);
      if (highScore > 0 && winners.length === 1) {
        const winner = poll.options[winners[0]];
        poll.winner = winner.label;
        project.continuity.push({ id: uid(), type: "Decisão da audiência", text: "A votação pelos comentários em \"" + poll.question + "\" escolheu \"" + winner.label + "\". " + (winner.consequence || poll.consequence || ""), createdAt: new Date().toISOString() });
      }
      save(); render();
      notify(recognized + " voto(s) somado(s). " + ignored + " comentário(s) ignorado(s)." + (winners.length === 1 ? " Roteiro seguinte atualizado com a opção vencedora." : " Empate: escolha a vencedora depois."), "success"); return;
    }
  });

  initSupabase();
  render();
})();
