export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST para gerar conteúdo." });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "A geração por IA ainda não está conectada. Adicione OPENAI_API_KEY nas Environment Variables do projeto Vercel." });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const kind = body.kind;
    const project = body.project || {};
    const episode = body.episode || null;
    if (!["story-pack", "episode"].includes(kind)) return res.status(400).json({ error: "Tipo de geração inválido." });
    const compactProject = {
      title: String(project.title || "").slice(0, 120),
      premise: String(project.premise || "").slice(0, 3000),
      format: String(project.format || "").slice(0, 80),
      platform: String(project.platform || "").slice(0, 80),
      language: String(project.language || "Português (Brasil)").slice(0, 80),
      duration: String(project.duration || "").slice(0, 80),
      tone: String(project.tone || "").slice(0, 160),
      audience: String(project.audience || "Público geral").slice(0, 120),
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
          "Crie de 4 a 8 cenas. Para cada cena inclua title, visual, audio, onScreen, duration (número em segundos) e sfx.",
          "Inclua também title, summary e script. O script deve ser filmável e adequado a vídeos curtos.",
          "Mantenha conteúdo apropriado para público adolescente e geral: sem conteúdo sexual explícito, sem violência gráfica e sem descrições de automutilação.",
          "Não contradiga regras do universo nem fatos já estabelecidos."
        ].join(" ")
      : [
          "Você é showrunner, editor de roteiro e designer de narrativas interativas.",
          "Responda somente com um objeto JSON válido, sem markdown ou texto fora do JSON.",
          "Idioma: português brasileiro. Respeite a premissa e desenvolva um conceito original e filmável.",
          "Crie um pacote com title, premise, setting, visualStyle, universe (lista de 3 a 6 regras), characters (3 a 5 objetos com name, role, description, appearance e voice), episodes (3 a 5 objetos com title, summary, script e scenes), polls (1 a 3 objetos com question, options como lista de objetos {label}, consequence) e continuity (lista de fatos curtos).",
          "Cada episódio deve mover a trama e terminar com gancho. Pelo menos uma votação deve criar consequências narrativas diferentes.",
          "Mantenha a lógica interna consistente. Não apresente ficção como fato. Se o formato for histórico ou documental, marque pontos que precisem de checagem em vez de inventar fatos.",
          "Mantenha conteúdo apropriado para público adolescente e geral: sem conteúdo sexual explícito, sem violência gráfica e sem descrições de automutilação."
        ].join(" ");
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        max_output_tokens: 5500,
        text: { format: { type: "json_object" } },
        input: [
          { role: "system", content: system + " Gere JSON que corresponda exatamente aos campos solicitados." },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      })
    });
    const responseData = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      const message = responseData && responseData.error && responseData.error.message ? responseData.error.message : "A API de IA retornou um erro.";
      console.error("OpenAI API error:", openaiResponse.status, message);
      return res.status(openaiResponse.status === 429 ? 429 : 502).json({
        error: openaiResponse.status === 429
          ? "Limite ou crédito da API atingido. Verifique o faturamento e os limites da sua conta OpenAI."
          : "A geração falhou. Verifique OPENAI_MODEL e o acesso da chave à API."
      });
    }
    const outputText = Array.isArray(responseData.output)
      ? responseData.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
          .filter((item) => item.type === "output_text")
          .map((item) => item.text || "")
          .join("\n")
      : "";
    const raw = outputText || responseData.output_text || "";
    if (!raw) return res.status(502).json({ error: "A IA não retornou conteúdo. Tente novamente." });
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (parseError) {
      console.error("Could not parse model JSON:", parseError);
      return res.status(502).json({ error: "A resposta da IA veio em formato inválido. Tente novamente." });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return res.status(502).json({ error: "A resposta da IA não tinha a estrutura esperada." });
    return res.status(200).json(parsed);
  } catch (error) {
    console.error("Generation function failed:", error);
    return res.status(500).json({ error: "Erro interno ao gerar conteúdo. Tente novamente." });
  }
}