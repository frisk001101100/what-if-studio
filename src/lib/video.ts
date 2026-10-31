export type Scene = { title:string; duration:number; visual:string; onscreen:string; narration:string; };
export type Story = { title:string; logline:string; caption:string; pinnedComment:string; storyPoll:{question:string;options:string[]}; scenes:Scene[]; };

const safeJson=(value:unknown)=>JSON.stringify(value).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
export function buildAnimationHtml(story:Story){
  const data=safeJson(story);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"><title>${story.title}</title><style>
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#07142f;color:#f5f3eb;font-family:Inter,Arial,sans-serif}
  body{display:grid;place-items:center;background:radial-gradient(ellipse at 50% 22%,rgba(82,133,255,.38),transparent 48%),linear-gradient(145deg,#0a245e,#07142f 68%)}
  .frame{position:relative;width:min(100vw,56.25vh);height:min(177.777vw,100vh);aspect-ratio:9/16;overflow:hidden;padding:9% 8%;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(180deg,rgba(6,20,49,.15),rgba(4,12,30,.8))}
  .frame:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 1px,transparent 1px 56px);pointer-events:none}
  .spot{position:absolute;inset:-22% -20% auto;height:70%;background:radial-gradient(ellipse,rgba(162,191,255,.24),transparent 67%);animation:breathe 6s ease-in-out infinite alternate}
  .rule{height:1px;background:linear-gradient(90deg,transparent,#c8a96c,transparent);opacity:.7}
  .eyebrow{font:500 10px 'DM Mono',monospace;letter-spacing:.24em;text-transform:uppercase;color:#e0c58e}
  h1{position:relative;font:400 clamp(38px,8vw,84px)/.88 Anton,Impact,sans-serif;text-transform:uppercase;letter-spacing:-.02em;margin:0;max-width:100%;overflow-wrap:anywhere}
  .scene{position:relative;display:flex;flex-direction:column;gap:18px;animation:rise .8s cubic-bezier(.2,.8,.2,1) both}
  .scene p{font:italic clamp(15px,2.4vw,23px)/1.45 'Playfair Display',serif;color:#d7e2ff;margin:0;max-width:90%}
  .bottom{display:flex;flex-direction:column;gap:12px}.brand{font:400 10px 'DM Mono',monospace;letter-spacing:.2em;color:#a6bdec}
  @keyframes breathe{from{opacity:.5;transform:scale(.96)}to{opacity:1;transform:scale(1.04)}}@keyframes rise{from{opacity:0;transform:translateY(35px)}to{opacity:1;transform:translateY(0)}}
  </style></head><body><main class="frame"><div class="spot"></div><div class="eyebrow">WHAT IF STUDIO · A STORY IN MOTION</div><div class="rule"></div><section class="scene"><h1 id="title"></h1><p id="line"></p></section><div class="bottom"><div class="rule"></div><div class="brand">MAKE THE IMPOSSIBLE WATCHABLE</div></div></main><script>
  const story=${data};const title=document.getElementById('title'),line=document.getElementById('line');let index=0;
  function show(){const scene=story.scenes[index%story.scenes.length];title.textContent=scene.onscreen||scene.title||story.title;line.textContent=scene.narration||scene.visual||story.logline;document.querySelector('.eyebrow').textContent='SCENE '+String(index+1).padStart(2,'0')+' · '+story.title.toUpperCase();index++;}
  show();setInterval(show,Math.max(1800,(story.scenes[0]?.duration||4)*1000));
  </script></body></html>`;
}
function wrap(ctx,text,maxWidth,lineHeight){
  const words=String(text||"").split(/\s+/);let line="",lines=[];
  for(const word of words){const test=line?line+" "+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}
  if(line)lines.push(line);return lines;
}
export function drawStoryboardFrame(canvas:HTMLCanvasElement,story:Story,seconds:number){
  const ctx=canvas.getContext("2d");if(!ctx)return;
  const w=canvas.width,h=canvas.height,total=story.scenes.reduce((s,x)=>s+Math.max(1,x.duration||4),0);
  let cursor=0,idx=0;for(;idx<story.scenes.length-1;idx++){const d=Math.max(1,story.scenes[idx].duration||4);if(seconds<cursor+d)break;cursor+=d;}
  const scene=story.scenes[idx]||story.scenes[0];const local=Math.max(0,seconds-cursor);
  const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#123b9a");bg.addColorStop(.55,"#091d4b");bg.addColorStop(1,"#040c20");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const pulse=.5+.5*Math.sin(seconds*1.4);const glow=ctx.createRadialGradient(w*.5,h*.22,10,w*.5,h*.22,w*.7);glow.addColorStop(0,"rgba(133,174,255,.32)");glow.addColorStop(1,"rgba(133,174,255,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  ctx.globalAlpha=.12;ctx.fillStyle="#d5e3ff";for(let x=0;x<w;x+=66)ctx.fillRect(x,0,1,h);ctx.globalAlpha=1;
  ctx.fillStyle="#d8bd83";ctx.font="500 24px monospace";ctx.fillText("WHAT IF STUDIO  /  9:16",72,112);
  ctx.fillStyle="rgba(205,220,255,.2)";ctx.fillRect(72,154,w-144,2);ctx.fillStyle="#d8bd83";ctx.fillRect(72,154,(w-144)*Math.min(1,seconds/Math.max(total,1)),2);
  ctx.save();ctx.translate(0,Math.max(0,45-local*32));ctx.globalAlpha=Math.min(1,.25+local*.8);
  ctx.fillStyle="#f8f6f0";ctx.font="400 100px Anton,Impact,sans-serif";
  const headline=String(scene?.onscreen||scene?.title||story.title).toUpperCase();const lines=wrap(ctx,headline,w-150,112);
  let y=h*.37-(lines.length-1)*55;for(const ln of lines.slice(0,4)){ctx.fillText(ln,72,y);y+=112;}
  ctx.restore();
  ctx.fillStyle="#dce6ff";ctx.font="italic 36px 'Playfair Display',Georgia,serif";ctx.letterSpacing="0px";
  const sub=wrap(ctx,scene?.narration||scene?.visual||story.logline,w-150,50).slice(0,4);let sy=h*.70;for(const ln of sub){ctx.fillText(ln,72,sy);sy+=50;}
  ctx.fillStyle="rgba(230,238,255,.45)";ctx.font="22px monospace";ctx.fillText(String(idx+1).padStart(2,"0")+" / "+String(story.scenes.length).padStart(2,"0"),72,h-105);
  ctx.fillStyle="rgba(230,238,255,.15)";ctx.fillRect(72,h-76,w-144,3);ctx.fillStyle="#e2c68a";ctx.fillRect(72,h-76,(w-144)*Math.min(1,seconds/Math.max(total,1)),3);
  ctx.globalAlpha=.1+pulse*.08;ctx.strokeStyle="#b6caff";ctx.lineWidth=2;ctx.strokeRect(24,24,w-48,h-48);ctx.globalAlpha=1;
}
export async function recordStoryboard(canvas:HTMLCanvasElement,story:Story){
  const stream=canvas.captureStream(30);
  const choices=["video/webm;codecs=vp9","video/webm","video/mp4"];
  const mimeType=choices.find(t=>MediaRecorder.isTypeSupported(t));
  if(!mimeType)throw new Error("Este navegador não oferece um formato de gravação compatível.");
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6000000});
  const chunks:BlobPart[]=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const total=Math.min(90,Math.max(4,story.scenes.reduce((s,x)=>s+Math.max(1,x.duration||4),0)));
  const stopped=new Promise<Blob>((resolve,reject)=>{recorder.onerror=()=>reject(new Error("Falha ao gravar o vídeo."));recorder.onstop=()=>resolve(new Blob(chunks,{type:mimeType}));});
  recorder.start(250);const start=performance.now();
  await new Promise<void>(resolve=>{const frame=(now:number)=>{const elapsed=(now-start)/1000;drawStoryboardFrame(canvas,story,elapsed);if(elapsed>=total){recorder.stop();resolve();}else requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  stream.getTracks().forEach(track=>track.stop());return {blob:await stopped,mimeType,extension:mimeType.includes("mp4")?"mp4":"webm"};
}
