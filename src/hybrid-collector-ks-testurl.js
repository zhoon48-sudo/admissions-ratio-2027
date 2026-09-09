import { collectHybrid as collectBase } from './hybrid-collector-silla-final.js';
import { kyungsungRepatriateDiagnostics } from './ks-auth.js';

const SPECS={
  '부산외국어대학교':{innerQuota:1394,totalQuota:1554,repatriateQuota:20},
  '신라대학교':{innerQuota:1366,totalQuota:1472,repatriateQuota:5}
};

function num(...values){
  for(const v of values){
    if(v===null||v===undefined||v==='')continue;
    const n=Number(String(v).replace(/,/g,''));
    if(Number.isFinite(n)&&n>=0)return n;
  }
  return null;
}
function rate(q,a){return q>0?+(a/q).toFixed(2):null}
function metric(q,a){return Number.isFinite(q)&&Number.isFinite(a)?{quota:q,apply:a,rate:rate(q,a)}:null}
function text(v){return String(v??'').replace(/\s+/g,' ').trim()}

function parsePublished(value){
  const s=text(value);
  const m=s.match(/(20\d{2})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})\s*(오전|오후)?\s*(\d{1,2}):(\d{2})/);
  if(!m)return null;
  let h=Number(m[5]);
  if(m[4]==='오후'&&h<12)h+=12;
  if(m[4]==='오전'&&h===12)h=0;
  return new Date(`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}T${String(h).padStart(2,'0')}:${m[6]}:00+09:00`).toISOString();
}

function candidateName(obj){
  if(!obj||typeof obj!=='object')return '';
  return text(obj.name??obj.title??obj.label??obj.type??obj.admission??obj.admissionName??obj.typeName??obj.displayName??obj.gubun??obj.전형명);
}
function objectPair(obj){
  if(!obj||typeof obj!=='object')return null;
  const q=num(obj.quota,obj.recruit,obj.recruitment,obj.capacity,obj.mo,obj.모집인원);
  const a=num(obj.apply,obj.applicants,obj.application,obj.support,obj.ji,obj.지원인원);
  return q!==null&&a!==null?{quota:q,apply:a}:null;
}
function findRepatriateDeep(value,depth=0){
  if(depth>6||value===null||value===undefined)return null;
  if(Array.isArray(value)){
    for(const x of value){const f=findRepatriateDeep(x,depth+1);if(f)return f}
    return null;
  }
  if(typeof value!=='object')return null;
  if(/재외국민/.test(candidateName(value))){
    const p=objectPair(value);if(p)return p;
  }
  for(const [k,v] of Object.entries(value)){
    if(/재외국민/.test(text(k))&&typeof v==='object'){
      const p=objectPair(v);if(p)return p;
    }
  }
  for(const v of Object.values(value)){
    const f=findRepatriateDeep(v,depth+1);if(f)return f;
  }
  return null;
}

function explicitRepatriate(response){
  const q=num(response?.repatriateQuota,response?.repatriate_quota,response?.excludedRepatriateQuota,response?.excluded_repatriate_quota);
  const a=num(response?.repatriateApply,response?.repatriate_apply,response?.excludedRepatriateApply,response?.excluded_repatriate_apply);
  if(q!==null&&a!==null)return {quota:q,apply:a};
  return findRepatriateDeep(response);
}

async function lastExcludedApply(env,name,quota){
  if(!env?.DB)return null;
  try{
    const row=await env.DB.prepare(`
      SELECT excluded_note FROM competition_snapshots
      WHERE university_name=? AND run_id>0 AND excluded_note IS NOT NULL
      ORDER BY collected_at DESC,id DESC LIMIT 20
    `).bind(name).first();
    const m=text(row?.excluded_note).match(new RegExp(`재외국민[^|]*모집\\s*${quota}명[^|]*지원\\s*(\\d+)명`));
    return m?Number(m[1]):null;
  }catch{return null}
}

async function applyTestUrlResult(env,baseResult,diag){
  const spec=SPECS[baseResult.name];
  const r=diag?.response;
  if(!spec||!diag?.ok||!r||typeof r!=='object')return null;

  const innerQuota=num(r.innerQuota,r.inQuota,r.inner_quota,r.in_quota);
  const innerApply=num(r.innerApply,r.inApply,r.inner_apply,r.in_apply);
  const rawTotalQuota=num(r.quota,r.totalQuota,r.total_quota);
  const rawTotalApply=num(r.apply,r.totalApply,r.total_apply);
  if(innerQuota!==spec.innerQuota||innerApply===null||rawTotalQuota===null||rawTotalApply===null)return null;

  let rep=explicitRepatriate(r);
  if(!rep){
    const direct=baseResult?.targetFresh||baseResult?.directSummary||null;
    const directApply=num(direct?.excludedApply,direct?.excluded_apply);
    if(directApply!==null)rep={quota:spec.repatriateQuota,apply:directApply};
  }
  if(!rep){
    const last=await lastExcludedApply(env,baseResult.name,spec.repatriateQuota);
    if(last!==null)rep={quota:spec.repatriateQuota,apply:last};
  }

  let totalQuota=null,totalApply=null,status='정상',warning=null;
  if(rawTotalQuota===spec.totalQuota+spec.repatriateQuota&&rep?.apply!==undefined){
    totalQuota=rawTotalQuota-spec.repatriateQuota;
    totalApply=rawTotalApply-rep.apply;
  }else if(rawTotalQuota===spec.totalQuota){
    totalQuota=rawTotalQuota;
    totalApply=rawTotalApply;
  }else{
    return null;
  }

  if(!rep){
    totalQuota=baseResult?.total?.quota??totalQuota;
    totalApply=baseResult?.total?.apply??totalApply;
    status='지연';
    warning='정원내는 경성대 test_url 최신값, 재외국민 지원인원은 확인 지연';
  }
  if(!Number.isFinite(totalQuota)||!Number.isFinite(totalApply)||totalQuota<innerQuota||totalApply<innerApply)return null;

  const outsideQuota=totalQuota-innerQuota;
  const outsideApply=totalApply-innerApply;
  const published=parsePublished(r.sourcePublished??r.published??r.sourceTime??r.checkedAt) || new Date().toISOString();
  return {
    ...baseResult,
    level:status,
    parser:'KS_TEST_URL_LIVE_REPATRIATE_EXCLUDE',
    inner:metric(innerQuota,innerApply),
    outside:metric(outsideQuota,outsideApply),
    total:metric(totalQuota,totalApply),
    excluded:rep?[`재외국민 전형행 제외: 모집 ${spec.repatriateQuota}명 / 지원 ${rep.apply}명`]:[],
    warnings:warning?[warning]:[],
    sourceCollectedAt:published,
    ksTestUrl:{ok:true,innerQuota,innerApply,rawTotalQuota,rawTotalApply,repatriate:rep,totalQuota,totalApply,sourcePublished:r.sourcePublished??null}
  };
}

export async function collectHybrid(env){
  const [data,diag]=await Promise.all([
    collectBase(env),
    kyungsungRepatriateDiagnostics(env).catch(e=>({ok:false,error:e instanceof Error?e.message:String(e),results:[]}))
  ]);
  const diagByName=new Map((diag?.results||[]).map(x=>[x.university,x]));
  const results=[];
  const fresh={...(data.targetFresh||{})};

  for(const r of (data.results||[])){
    if(!SPECS[r.name]){results.push(r);continue}
    const fixed=await applyTestUrlResult(env,r,diagByName.get(r.name));
    if(fixed){
      results.push(fixed);
      fresh[r.name]={ok:true,source:'KS_TEST_URL_LIVE',sourceCollectedAt:fixed.sourceCollectedAt,innerQuota:fixed.inner.quota,innerApply:fixed.inner.apply,totalQuota:fixed.total.quota,totalApply:fixed.total.apply,excludedQuota:SPECS[r.name].repatriateQuota,excludedApply:fixed.ksTestUrl?.repatriate?.apply??null};
    }else{
      // test_url 실패 시 기존 수집값은 유지합니다. 데이터를 비우지 않습니다.
      results.push({...r,level:r.level==='정상'?'지연':r.level,warnings:[...(r.warnings||[]),'경성대 test_url 최신조회 실패 · 기존 수집값 유지']});
    }
  }

  const ok=results.filter(r=>r.level==='정상').length;
  return {...data,ksTestUrlDiagnostics:diag,targetFresh:fresh,results,summary:{...(data.summary||{}),universities:results.length,ok,delayed:results.filter(r=>r.level==='지연').length,needVerify:results.filter(r=>r.level==='검증필요').length,failed:results.filter(r=>r.level==='접속실패').length}};
}
