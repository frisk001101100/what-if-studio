# What If Studio — handoff para Codex

Atualizado em 2026-10-31. Este documento descreve o estado dos arquivos encontrados no workspace e a última publicação conhecida.

## 1. Objetivo e funcionamento

Aplicação individual em português brasileiro para planejar séries curtas verticais e histórias interativas. O criador organiza projetos, episódios e cenas; a audiência pode escolher caminhos por enquetes. A escolha vencedora e suas consequências podem ser registradas para orientar o roteiro seguinte.

É um app estático de HTML/CSS/JavaScript hospedado na Vercel, com uma função serverless para geração textual e narração. Os projetos são salvos no `localStorage` do navegador. Não há login, banco de dados ou sincronização entre dispositivos. O renderizador compõe gráficos no `<canvas>`, recebe áudio de voz do provedor escolhido e grava um arquivo WebM no próprio navegador.

## 2. Funcionalidades implementadas

- Painel inicial e biblioteca de projetos.
- Projetos de histórias com premissa, formato, plataforma, idioma, duração, tom, público e ritmo.
- Editor de episódios e cenas, com roteiro, visual, prompts, narração/diálogo, direção de áudio, texto na tela, duração e efeitos.
- Geração opcional de pacote de história e de episódio por API: OpenAI, Gemini ou Claude.
- Renderização local de vídeo vertical WebM: gráficos 2D animados, voz gerada por cena (OpenAI ou Gemini), legenda por cena e áudio sintetizado simples. O fluxo aceita até 10 cenas e limita o resultado a 90 segundos. O usuário baixa o arquivo no dispositivo.
- Elenco, regras do universo, continuidade, referências/fontes e enquetes com consequências.
- Contagem manual de votos ao colar comentários; opção de registrar votos e definir a alternativa vencedora.
- Preparação de legenda, comentário fixado, enquete de Stories, fila editorial local limitada a quatro itens por dia e cópia de textos.
- Página do Curso What If, com título, descrição, preço opcional e link `wa.me` para combinar Pix manualmente. Há uma visualização de curso acessível por `?view=course`.
- Importação de backup JSON; exportação JSON, Markdown, TXT e SRT; snapshots manuais e restauração.
- Interface responsiva para desktop e dispositivos móveis.

## 3. Funcionalidades pendentes

- Autenticação/contas e banco/sincronização entre dispositivos. A versão atual é local e individual.
- Integração oficial com Instagram/Meta: OAuth, publicação automática, hospedagem acessível do arquivo de vídeo, leitura de comentários/visualizações e apuração automática de votos/limiares. A fila editorial atual não publica posts.
- Pagamentos do curso, checkout, confirmação automática de Pix, matrícula e entrega de aulas. O botão apenas inicia uma conversa no WhatsApp.
- Teste real da geração de voz com chave válida e teste completo do arquivo baixado em Android/Chrome. A geração depende de uma chave colocada pelo dono da conta no próprio app.
- Sincronização palavra a palavra das legendas e controle fino de pausas/volume. No estado atual, a legenda corresponde ao texto da cena e a faixa é alinhada por cena.
- Substituição/migração da voz OpenAI antes da data de encerramento anunciada para `gpt-4o-mini-tts` em 2027-01-06. Consulte a [documentação de voz OpenAI](https://developers.openai.com/api/docs/guides/text-to-speech); Gemini é a alternativa já implementada.
- Suíte automatizada de testes e verificação visual automatizada. Não há framework nem script de teste no `package.json`.

## 4. Pastas e arquivos importantes

```text
what-if-studio/
├── api/
│   └── generate.js   # Geração textual e TTS server-side
├── index.html        # Shell, navegação, metadados e carregamento de assets
├── app.js            # Estado local, telas, editor, ações, geração e renderização
├── styles.css        # Sistema visual anterior e estilos dos componentes
├── studio.css        # Camada visual renovada carregada depois de styles.css
├── vercel.json       # Duração da função e cabeçalhos HTTP
├── package.json      # Metadados e comando de desenvolvimento
├── .env.example      # Orientação; não contém credenciais
├── .gitignore        # Ignora `.env*` (exceto `.env.example`), `.vercel/` e outros
├── README.md         # Recursos, execução, privacidade e limites
├── AGENTS.md         # Missão, arquitetura e regras para agentes
└── HANDOFF.md        # Este documento
```

Não existem pastas `supabase/`, `src/`, `tests/` ou saída de build na listagem atual.

## 5. Tecnologias e dependências

- HTML, CSS e JavaScript vanilla (ES modules no backend); sem framework de frontend, bundler ou etapa de compilação.
- Node.js `>=20` para a função e ferramentas locais.
- Vercel Functions Node para `api/generate.js`, configurada com `maxDuration: 60`.
- Integrações via `fetch`: OpenAI Responses para texto e Audio Speech para voz; Gemini `generateContent` para texto e Interactions TTS para voz; Anthropic Messages para texto.
- APIs do navegador: `localStorage`, Canvas 2D, `MediaRecorder`, `captureStream`, Web Audio e downloads via Blob/Object URL.
- Google Fonts (DM Sans, Space Grotesk e DM Mono), carregadas de forma externa.
- Nenhuma dependência npm listada além do uso de `npx vercel dev` no script. Não há variáveis de ambiente obrigatórias para executar; cada chave de IA é fornecida pelo usuário, guardada em memória na aba e enviada por solicitação.

## 6. Problemas conhecidos e limites

- O conteúdo é local ao navegador. Limpar dados do navegador pode apagar projetos; exporte backups JSON. Um link público não transforma o workspace em privado.
- Não há chave de API configurada no repositório. As chamadas a provedores reais e a criação de voz não foram verificadas com uma chave do dono. O uso pode ser cobrado pelo provedor.
- OpenAI TTS usa `gpt-4o-mini-tts`, cuja descontinuação foi anunciada para 2027-01-06. O modelo Gemini configurado é `gemini-3.8-flash-tts`; confirme disponibilidade e preço do provedor antes de produção em volume.
- A gravação WebM depende do suporte de `MediaRecorder`/`canvas.captureStream` do navegador e de memória disponível. Chrome/Edge recentes são a recomendação do README; renderizações longas em celulares podem falhar ou ser lentas.
- O vídeo contém motion graphics ilustrativos. Não gera imagens, filmagens ou cenas 3D do Blender. A voz é anunciada no próprio vídeo como gerada por IA.
- As legendas são por cena, sem sincronização palavra a palavra. Trilha/efeitos são simples e sintetizados.
- Comentários e votos são contados manualmente após colar o texto; visualizações não são consultadas. Publicação automática, autorização Meta e métricas não estão implementadas.
- O curso não recebe pagamento nem libera conteúdo automaticamente; valor e Pix são combinados no WhatsApp `5582993485560`.
- Estado Git local na inspeção: branch `feat/course-instagram-workflow`, último commit local `49331be`; `AGENTS.md`, `README.md`, `api/generate.js`, `app.js`, `index.html` e `vercel.json` estão modificados, e `studio.css` está sem rastreamento local. Portanto, a cópia local não está limpa/commitada.
- As últimas atualizações GitHub feitas pelo Codex foram diretamente na branch remota `feat/course-and-publishing-workflow` pela API do GitHub. Não houve `git push` deste workspace. Não presuma que a branch local e a remota estão sincronizadas; compare antes de integrar.

## 7. Últimas alterações

- Reorganização ampla do tema/interface para um estúdio de criação responsivo, mantendo as telas e os dados do produto.
- Integração do TTS de OpenAI/Gemini dentro de `api/generate.js`, usando chave por solicitação e sem persistir a chave no app.
- Botão de render passou a gerar voz por cena, alinhar narração/legendas à cena, gravar WebM localmente e exibir erros/andamento. A tela de storyboard deixou de afirmar que o vídeo precisa ser montado em outro editor.
- Aviso de narração gerada por IA no vídeo; limites de 10 cenas/90 segundos; encerramento de OpenAI TTS anunciado no modal/README.
- `README.md` e `AGENTS.md` foram atualizados para refletir TTS e limitações.
- Última publicação conhecida: Vercel production `dpl_4BJkrzVt2y5nGRWbcbW86XA61eyB`, estado `READY`, com alias `what-if-studio-beta.vercel.app`. Foi criada via upload direto de arquivos à Vercel e indica SHA de GitHub como `Unknown`; não use essa implantação como prova de que a branch de produção GitHub está sincronizada.

## 8. Próximos passos por prioridade

1. Configurar uma chave de API no site e testar voz em um episódio curto com duas cenas; conferir voz, sincronização por cena, arquivo WebM, download e áudio em Chrome desktop e Android.
2. Corrigir problemas observados nesse teste e adicionar uma verificação repetível para os fluxos principais/API (não há suíte no momento).
3. Planejar a migração do endpoint de voz OpenAI antes do desligamento de `gpt-4o-mini-tts`; manter Gemini como opção e tornar modelos configuráveis/atualizáveis.
4. Decidir explicitamente se o produto continua local e individual. Só então planejar login/banco e migração segura dos dados existentes.
5. Se a publicação Instagram ainda for desejada, implementar o fluxo oficial Meta (conta profissional, app/permissões, OAuth, armazenamento/URL de mídia e callbacks) e validar comentários/métricas antes de prometer automação.
6. Se o curso for comercializado, definir oferta/preço, processo Pix/checkout e liberação do conteúdo; atualmente só existe contato pelo WhatsApp.
7. Sincronizar a branch local `feat/course-instagram-workflow` com a branch remota `feat/course-and-publishing-workflow` sem sobrescrever alterações; revisar commits/arquivo por arquivo antes de merge ou push.

## 9. Executar e verificar

### Desenvolvimento local

1. Instale Node.js 20 ou superior.
2. Na raiz do projeto, execute `npm run dev` (o script roda `npx vercel dev`; precisa do Vercel CLI/acesso à rede e contexto de projeto apropriado).
3. Abra a URL local indicada pela CLI, normalmente `http://localhost:3000`.
4. Para verificar voz, configure uma chave OpenAI ou Gemini pelo botão **Configurar IA**. A chave fica na memória da aba. Se a chave configurada para roteiro for Claude, escolha/configure uma chave OpenAI ou Gemini separadamente no renderizador.
5. Crie/abra um projeto, edite um episódio, adicione cenas e preencha a narração em cada cena ou o roteiro; abra **Renderizar vídeo**, escolha provedor e selecione **Gerar voz e renderizar vídeo**. O botão pode chamar APIs cobradas. Baixe o WebM quando a renderização terminar.

### Verificações disponíveis

- `node --check app.js`
- `node --check api/generate.js`
- Validar o JSON de Vercel, por exemplo em PowerShell: `Get-Content vercel.json | ConvertFrom-Json | Out-Null`.
- `git diff --check`
- Não há `test`, lint ou build script no `package.json`. Na verificação da última implantação, página, `studio.css` e `app.js` retornaram HTTP 200; `/api/generate` sem chave retornou HTTP 400 esperado. Isso só confirma a resposta de validação, não uma geração real de texto/voz.

### Publicação

O README recomenda conectar o repositório à Vercel. Antes de uma nova publicação, confirmar projeto, branch e ambiente; revisar/sincronizar o estado Git acima. O domínio atual conhecido é `what-if-studio-beta.vercel.app`.

