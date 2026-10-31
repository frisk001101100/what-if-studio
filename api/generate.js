export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST para gerar conteúdo." });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (JSON.stringify(body).length > 100000) return res.status(413).json({ error: "O projeto é grande demais para uma única geração." });
    const kind = body.kind;
    const project = body.project || {};
    const episode = body.episode || null;
    const provider = String(body.provider || "");
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!["story-pack", "episode"].includes(kind)) return res.status(400).json({ error: "Tipo de geração inválido." });
    if (!["openai", "gemini", "claude"].includes(provider) || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({ error: "Escolha OpenAI, Gemini ou Claude e configure sua chave de API antes de gerar." });
    }
    const compactProject = {
      title: String(project.title || "").slice(0, 120),
      premise: String(project.premise || "").slice(0, 3000),
      format: String(project.format || "").slice(0, 80),
      platform: String(project.platform || "").slice(0, 80),
      language: String(project.language || "Português (Brasil)").slice(0, 80),
      duration: String(project.duration || "").slice(0, 80),
      tone: String(project.tone || "").slice(0, 160),
      audience: String(project.audience || "Público geral").slice(0, 120),
      pacing: String(project.pacing || "Dinâmico").slice(0, 100),
      world: project.world || {},
      characters: Array.isArray(project.characters) ? project.characters.slice(0, 20) : [],
      episodes: Array.isArray(project.episodes) ? project.episodes.slice(0, 12).map((item) => ({ title: item.title, summary: item.summary })) : [],
      polls: Array.isArray(project.polls) ? project.polls.slice(0, 12) : [],
      continuity: Array.isArray(project.continuity) ? project.continuity.slice(0, 30) : []
    };
    const safeEpisode = episode ? {
      number: episode.number,
      title: String(episode.title || "").slice(0, 120),
      summary: String(episode.summary || "").slice(0, 2500),
      script: String(episode.script || "").slice(0, 8000)
    } : null;
    const userPayload = kind === "episode"
      ? { task: "Crie o roteiro detalhado de um episódio", project: compactProject, episode: safeEpisode }
      : { task: "Desenvolva um pacote de estrutura para a história", project: compactProject };
    const system = kind === "episode"
      ? [
          "Você é um roteirista e produtor de histórias curtas interativas.",
          "Responda somente com um objeto JSON válido, sem markdown ou texto fora do JSON.",
          "Idioma: português brasileiro. Mantenha o tom e a premissa fornecidos.",
          "O roteiro precisa ter começo forte, desenvolvimento claro, virada e gancho final.",
          "Crie de 4 a 8 cenas. Para cada cena inclua title, visual, imagePrompt, videoPrompt, audio, audioDirection, onScreen, duration (número em segundos) e sfx.",
          "Inclua também title, summary, script, caption, pinnedComment e storyPoll. O script deve ser filmável e adequado a vídeos curtos.",
          "Mantenha conteúdo apropriado para público adolescente e geral: sem conteúdo sexual explícito, sem violência gráfica e sem descrições de automutilação.",
          "Não contradiga regras do universo nem fatos já estabelecidos. Se uma enquete tiver opção vencedora registrada, trate essa opção e sua consequência específica como o caminho oficial da história e reflita isso no episódio novo."
        ].join(" ")
      : [
          "Você é showrunner, editor de roteiro e designer de narrativas interativas.",
          "Responda somente com um objeto JSON válido, sem markdown ou texto fora do JSON.",
          "Idioma: português brasileiro. Respeite a premissa, o público-alvo e o ritmo narrativo, e desenvolva um conceito original e filmável.",
          "Crie um pacote com title, premise, setting, visualStyle, universe (lista de 3 a 6 regras), characters (3 objetos com name, role, description, appearance e voice), episodes (3 objetos com title, summary, script, caption, pinnedComment, storyPoll e de 3 a 4 scenes; cada cena com visual, imagePrompt, videoPrompt, audio, audioDirection, onScreen, duration e sfx), polls (1 a 2 objetos com question, options como lista de objetos {label, consequence}, consequence geral da enquete) e continuity (lista de fatos curtos).",
          "Mantenha cada roteiro de episódio conciso, com aproximadamente 80 a 120 palavras, para que todo o pacote caiba em uma resposta estruturada. Cada episódio deve mover a trama e terminar com gancho. Cada opção de enquete deve ter uma consequência própria, clara e realmente diferente, que altere o próximo episódio; evite opções que só mudem a frase sem mudar o rumo da história.",
          "Mantenha a lógica interna consistente. Não apresente ficção como fato. Se o formato for histórico ou documental, marque pontos que precisem de checagem em vez de inventar fatos.",
          "Mantenha conteúdo apropriado para público adolescente e geral: sem conteúdo sexual explícito, sem violência gráfica e sem descrições de automutilação."
        ].join(" ");
    let endpoint;
    let providerHeaders = { "Content-Type": "application/json" };
    let providerRequest;
    if (provider === "openai") {
      endpoint = "https://api.openai.com/v1/responses";
      providerHeaders.Authorization = "Bearer " + apiKey;
      providerRequest = {
        model: "gpt-6-luna",
        max_output_tokens: 5500,
        store: false,
        text: { format: { type: "json_object" } },
        input: [
          { role: "system", content: system + " Gere JSON que corresponda exatamente aos campos solicitados." },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      };
    } else if (provider === "gemini") {
      endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";
      providerHeaders["x-goog-api-key"] = apiKey;
      providerRequest = {
        systemInstruction: { parts: [{ text: system + " Gere JSON que corresponda exatamente aos campos solicitados." }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(userPayload) }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 5500 },
        store: false
      };
    } else {
      endpoint = "https://api.anthropic.com/v1/messages";
      providerHeaders["x-api-key"] = apiKey;
      providerHeaders["anthropic-version"] = "2023-06-01";
      providerRequest = {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 5500,
        system: system + " Gere JSON que corresponda exatamente aos campos solicitados.",
        messages: [{ role: "user", content: JSON.stringify(userPayload) }]
      };
    }
    const providerResponse = await fetch(endpoint, {
      method: "POST",
      headers: providerHeaders,
      body: JSON.stringify(providerRequest)
    });
    const responseData = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      console.error("AI provider request failed:", provider, providerResponse.status);
      if (providerResponse.status === 401 || providerResponse.status === 403) {
        return res.status(401).json({ error: "A chave informada não foi aceita. Confira a chave e a conta do provedor escolhido." });
      }
      if (providerResponse.status === 429) {
        return res.status(429).json({ error: "O provedor atingiu um limite de uso ou crédito. Confira a conta e tente novamente mais tarde." });
      }
      return res.status(502).json({ error: "A geração falhou no provedor escolhido. Confira o acesso à API e tente novamente." });
    }
    const raw = provider === "openai"
      ? (Array.isArray(responseData.output)
          ? responseData.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
              .filter((item) => item.type === "output_text")
              .map((item) => item.text || "")
              .join("\n")
          : responseData.output_text || "")
      : provider === "gemini"
        ? (responseData.candidates || []).flatMap((candidate) => candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : []).map((part) => part.text || "").join("\n")
        : (responseData.content || []).filter((item) => item.type === "text").map((item) => item.text || "").join("\n");
    if (!raw) return res.status(502).json({ error: "A IA não retornou conteúdo. Tente novamente." });
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (parseError) {
      console.error("Could not parse AI provider JSON response.");
      return res.status(502).json({ error: "A resposta da IA veio em formato inválido. Tente novamente." });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return res.status(502).json({ error: "A resposta da IA não tinha a estrutura esperada." });
    return res.status(200).json(parsed);
  } catch (error) {
    console.error("Generation function failed.");
    return res.status(500).json({ error: "Erro interno ao gerar conteúdo. Tente novamente." });
  }
}



