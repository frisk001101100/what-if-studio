type SkillModule = { default:string };
const modules = import.meta.glob<SkillModule>("../vendor/instagram-agent-skill/skills/*/SKILL.md",{eager:true,query:"?raw"});
export const skills = Object.entries(modules).map(([path,mod])=>{
  const id=path.split("/").slice(-2,-1)[0];
  const body=mod.default;
  const title=body.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? id.replace(/^ig-/,"").replace(/-/g," ");
  const description=body.match(/^description:\s*>?-?\s*\n?([\s\S]*?)(?=\n---)/m)?.[1]?.replace(/\n\s+/g," ").trim() ?? "Creator workflow";
  return {id,title,description,body};
}).sort((a,b)=>a.id.localeCompare(b.id));
