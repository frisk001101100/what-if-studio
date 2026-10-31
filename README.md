# What If Studio

Workspace individual para criar séries curtas e histórias interativas em português.

## Recursos

- Projetos, episódios, roteiros e cenas verticais.
- Personagens, regras do universo, enquetes e continuidade.
- Calendário editorial, pacote de publicação e área do Curso What If.
- Exportação JSON, Markdown e texto; importação de backup JSON.
- Salvamento automático neste navegador.
- Renderização local de gráficos animados 9:16 em WebM, com legendas derivadas da narração por cena, trilha/efeitos sintetizados e opção de misturar um arquivo de voz gravado pelo criador.
- Geração opcional de roteiros com OpenAI, Gemini ou Claude. A chave informada fica na memória da aba e é enviada ao endpoint server-side para uma chamada. O provedor pode cobrar o uso da API.

## Executar e publicar

O app usa HTML, CSS e JavaScript sem etapa de compilação. Para desenvolver, instale o Vercel CLI e execute `vercel dev`; para publicar, conecte o repositório à Vercel.

A geração de IA usa `/api/generate`. Não é necessário banco nem conta para usar o estúdio. Os projetos ficam no armazenamento local do navegador deste aparelho. Exporte backups JSON regularmente; apagar os dados do navegador pode remover projetos. Não há sincronização entre aparelhos.

## Privacidade e limites

Este modo é individual em termos de uso, mas uma URL pública da Vercel continua acessível a qualquer pessoa que a encontre. Os dados ficam no navegador de quem os criou. A chave de IA não é salva no projeto, mas a solicitação envia ao provedor escolhido o conteúdo necessário para gerar o roteiro.

O app não publica automaticamente no Instagram, não importa comentários/visualizações e não escolhe resultados de votação a partir de métricas. Enquetes e calendário são ferramentas de planejamento manual.

O renderizador não gera voz narrada por IA. Se um arquivo de voz for selecionado, ele é misturado a partir do início do vídeo; sincronização palavra a palavra ainda requer edição externa. A trilha e os efeitos sintetizados são simples, sem músicas licenciadas.

