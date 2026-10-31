# What If Studio

Workspace individual para criar séries curtas e histórias interativas em português.

## Recursos

- Projetos, episódios, roteiros e cenas verticais.
- Personagens, regras do universo, enquetes e continuidade.
- Calendário editorial, pacote de publicação e área do Curso What If.
- Exportação JSON, Markdown e texto; importação de backup JSON.
- Salvamento automático neste navegador.
- Renderização local de gráficos animados 9:16 em WebM, com voz narrada por IA por cena, legendas derivadas do texto narrado e trilha/efeitos sintetizados.
- Geração opcional de roteiros com OpenAI, Gemini ou Claude. A chave informada fica na memória da aba e é enviada ao endpoint server-side para uma chamada. O provedor pode cobrar o uso da API.

## Executar e publicar

O app usa HTML, CSS e JavaScript sem etapa de compilação. Para desenvolver, instale o Vercel CLI e execute `vercel dev`; para publicar, conecte o repositório à Vercel.

A geração de roteiros e de voz usa `/api/generate`. O render precisa de uma chave OpenAI ou Gemini configurada na aba. A chamada retorna o áudio ao navegador e a gravação WebM acontece no próprio aparelho; o arquivo não é enviado nem salvo no servidor. Renderize até 10 cenas e 90 segundos por vídeo. O uso das APIs pode ser cobrado pelos provedores.

Não é necessário banco nem conta para usar o estúdio. Os projetos ficam no armazenamento local do navegador deste aparelho. Exporte backups JSON regularmente; apagar os dados do navegador pode remover projetos. Não há sincronização entre aparelhos.

## Privacidade e limites

Este modo é individual em termos de uso, mas uma URL pública da Vercel continua acessível a qualquer pessoa que a encontre. Os dados ficam no navegador de quem os criou. A chave de IA não é salva no projeto, mas a solicitação envia ao provedor escolhido o conteúdo necessário para gerar o roteiro.

O app não publica automaticamente no Instagram, não importa comentários/visualizações e não escolhe resultados de votação a partir de métricas. Enquetes e calendário são ferramentas de planejamento manual.

O render gera uma voz por cena e alinha a faixa àquela cena. As legendas aparecem por cena, sem sincronização palavra a palavra. O vídeo sinaliza que a narração foi gerada por IA. A trilha e os efeitos sintetizados são simples, sem músicas licenciadas. A captura depende do suporte a `MediaRecorder` e WebM no navegador; Chrome e Edge recentes são recomendados.

Nota do provedor: a documentação da OpenAI informa que `gpt-4o-mini-tts` será descontinuado em 6 de janeiro de 2027. A geração via Gemini usa o modelo `gemini-3.8-flash-tts`; confirme os modelos e preços atuais antes de criar vídeos em volume.

