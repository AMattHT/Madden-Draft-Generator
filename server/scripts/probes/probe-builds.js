// Dump position / height / weight / body type from the games' own generated classes
// (cache/game-builds.json) — the evidence behind DraftClassBuilder.bodyTypeFor.
require('tsx/cjs');
const fs=require('fs');
const { Mdc27Service } = require('../../src/services/Mdc27Service');
const { MdcService } = require('../../src/services/MdcService');
const { PositionMapper } = require('../../src/services/PositionMapper');
const silence=(fn)=>{const c={...console};console.log=console.error=console.warn=console.info=()=>{};try{return fn();}finally{Object.assign(console,c);}};
const out={};
for (const [v,dir,names] of [['m27','C:/Users/amatthews/Documents/Madden NFL 27/saves',['TEST1','TEST2','TEST3','TESTSUPERSTRONG']],['m26','C:/Users/amatthews/Documents/Madden NFL 26/Saves',['RANDOMGEN1','RANDOMGEN2','RANDOMGEN3','RANDOMGEN4','RANDOMGEN5']]]) {
  const rows=[];
  for (const n of names) {
    const f=dir+'/CAREERDRAFT-'+n; if(!fs.existsSync(f)) continue;
    const ps=silence(()=>(v==='m27'?Mdc27Service.parse(fs.readFileSync(f)):MdcService.parse(fs.readFileSync(f)))).filter(p=>p.firstName);
    for (const p of ps) rows.push({pos:PositionMapper.name(Number(p.position)), h:Number(p.heightInches??p.height), w:Number(p.weight), bt:(p.visuals&&p.visuals.bodyType)||p.bodyType||null, btid:p.bodyTypeId});
  }
  out[v]=rows; console.log(v, rows.length, JSON.stringify(rows.slice(0,2)), Object.keys(ps0(rows)));
}
function ps0(r){return r[0]||{};}
fs.writeFileSync(require('path').join(__dirname, '..', '..', 'cache', 'game-builds.json'), JSON.stringify(out));
