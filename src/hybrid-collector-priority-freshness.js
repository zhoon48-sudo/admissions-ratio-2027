import { collectHybrid as collectBase } from './hybrid-collector-refresh-then-testurl.js';

const TARGETS=new Set(['부산외국어대학교','신라대학교']);
const MAX_SOURCE_AGE_MIN=25;

export async function collectHybrid(env){
  const data=await collectBase(env);
  const fresh=data.targetFresh||{};
  const results=(data.results||[]).map(r=>{
    if(!TARGETS.has(r.name))return r;
    const f=fresh[r.name];
    if(!f?.ok)return r;
    const ms=Date.parse(f.sourceCollectedAt||'');
    if(!Number.isFinite(ms)){
      return {...r,level:'지연',parser:`${r.parser||'JINHAK_SUMMARY_PRIORITY'}_SOURCE_TIME_UNKNOWN`,warnings:['원본 자료시각을 확인하지 못해 정상값으로 확정하지 않습니다.']};
    }
    const ageMin=Math.max(0,(Date.now()-ms)/60000);
    if(ageMin>MAX_SOURCE_AGE_MIN){
      return {...r,level:'지연',parser:`${r.parser||'JINHAK_SUMMARY_PRIORITY'}_STALE_SOURCE`,warnings:[`원본 자료가 ${Math.floor(ageMin)}분 전 값이어서 정상값으로 확정하지 않습니다.`]};
    }
    return r;
  });
  const ok=results.filter(r=>r.level==='정상').length;
  return {...data,results,summary:{...(data.summary||{}),universities:results.length,ok,delayed:results.filter(r=>r.level==='지연').length,needVerify:results.filter(r=>r.level==='검증필요'||r.level==='확인필요').length,failed:results.filter(r=>r.level==='접속실패').length}};
}
