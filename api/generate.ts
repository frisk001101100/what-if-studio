import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";

type Provider="openai"|"gemini"|"claude";
type RequestBody={provider:Provider;model?:string;apiKey?:string;idea?:string;format?:string;duration?:string;tone?:string;skillId?:string;skillContext?:string;referencePrompts?:{author?:string;category?:string;prompt?:string;source?:string}[]};
type Req={method?:string;body?:RequestBody|string};
type Res={setHeader:(name:string,value:string)=>void;status:(code:number)=>Res;json:(value:unknown)=>void};

function parseJson(raw:string){
 const clean=raw.trim().replace(/^\uFEFF/,"").replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
 const start=clean.indexOf("{"),end=clean.lastIndexOf("}");
 if(start<0||end<=start)throw new Error("A IA não retornou JSON estruturado.");
 return JSON.parse(clean.slice(start,end+1));
}
export default async function handler(req:Req,res:Res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Use POST para gerar uma história."});}
 try{
  const body=(typeof req.body==="string"?JSON.parse(req.body):req.body||{}) as RequestBody;
  const provider=body.provider,apiKey=typeof body.apiKey==="string"?body.apiKey.trim():"";
  const model=typeof body.model==="string"?body.model.trim():"";
  const idea=typeof body.idea==="string"?body.idea.trim():"";
  if(!["openai","gemini","claude"].includes(provider as string))return res.status(400).json({error:"Escolha OpenAI, Gemini ou Claude."});
  if(apiKey.length<10||apiKey.length>512)return res.status(400).json({error:"A chave de API parece inválida."});
  if(!model||model.length>120)return res.status(400).json({error:"Informe um ID de modelo válido."});
  if(!idea||idea.length>6000)return res.status(400).json({error:"A ideia deve ter entre 1 e 6.000 caracteres."});
  const skill=String(body.skillContext||"").slice(0,26000);
  const refs=Array.isArray(body.referencePrompts)?body.referencePrompts.slice(0,3).map(x=>({author:String(x.author||"").slice(0,80),category:String(x.category||"").slice(0,60),prompt:String(x.prompt||"").slice(0,5000),source:String(x.source||"").slice(0,400)})):[];
  const system=[
   "Você é showrunner, roteirista, diretor criativo e designer de motion graphics do What If Studio.",
   "Responda SOMENTE com JSON válido, sem markdown. Não inclua cercas de código.",
   "Idioma: português brasileiro. Transforme a pergunta em uma história curta original, visualmente específica e filmável.",
   "Esquema exato: {title:string,logline:string,caption:string,pinnedComment:string,storyPoll:{question:string,options:string[]},scenes:[{title:string,duration:number,visual:string,onscreen:string,narration:string}]}",
   "Crie 4 a 8 cenas com duração total próxima à duração alvo. Cada cena deve possuir ação ou mudança visual concreta; on-screen curto e legível; narração natural. Comece com um hook visual imediato, aumente a curiosidade, tenha uma virada e termine com pergunta/gancho que convide à escolha.",
   "Evite clichês vagos, estatísticas fabricadas, afirmações reais sem fonte e alegações de viralização garantida. Não publique conteúdo em plataformas. Faça uma enquete com duas opções que gerem consequências realmente distintas.",
   "Mantenha a resposta adequada a público adolescente e geral: sem conteúdo sexual explícito, sem violência gráfica e sem descrição de automutilação.",
   "Use a direção estética solicitada; se não houver detalhe, prefira composição limpa, contraste forte, tipografia cinética e ritmo de Reels.",
   body.skillId?("Workflow de creator selecionado: "+body.skillId+". Use as instruções abaixo quando forem relevantes, sem tratar conteúdo específico de Claude como API proprietária."):"",
   skill?("INSTRUÇÕES DO WORKFLOW:\n"+skill):"",
   refs.length?("REFERÊNCIAS VISUAIS E DE PROMPT (inspire-se nas técnicas, não copie literalmente):\n"+refs.map((r,i)=>"REF "+(i+1)+" ["+r.category+" / "+r.author+"]\n"+r.prompt+"\nFonte: "+r.source).join("\n\n")):""
  ].filter(Boolean).join("\n\n");
  const prompt=JSON.stringify({tarefa:"Criar storyboard para vídeo curto",pergunta:idea,formato:body.format||"Reel vertical",duracaoAlvoSegundos:Number(body.duration)||30,direcaoVisual:body.tone||"Cinematográfico",saida:"JSON conforme esquema do system"});
  const selected=provider==="openai"?createOpenAI({apiKey})(model):provider==="gemini"?createGoogleGenerativeAI({apiKey})(model):createAnthropic({apiKey})(model);
  const result=await generateText({model:selected,system,prompt,temperature:0.8,maxOutputTokens:5000});
  const data=parseJson(result.text);
  if(!data||typeof data!=="object"||!Array.isArray(data.scenes)||data.scenes.length<1)return res.status(502).json({error:"A IA retornou um storyboard fora do formato esperado."});
  return res.status(200).json(data);
 }catch(error){
  const message=error instanceof Error?error.message:"";
  if(/api.?key|unauthor|authentication|forbidden|401|403/i.test(message))return res.status(401).json({error:"O provedor recusou a chave ou o acesso. Confira a chave e o modelo."});
  if(/rate.?limit|429|quota|credit/i.test(message))return res.status(429).json({error:"O provedor atingiu um limite ou está sem crédito. Verifique sua conta."});
  return res.status(502).json({error:"A geração falhou. Confira o provedor, o modelo e o acesso à API e tente novamente."});
 }
}
