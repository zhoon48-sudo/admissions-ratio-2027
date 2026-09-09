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
function parsePublished(v){
  const s=text(v);
  const m=s.match(/(20\d{2})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})\s*(오전|오후)?\s*(\d{1,2}):(\d{2})/);
  if(!m)return null;
  let h=Number(m[5]);
  if(m[4]==='오후'&&h<12)h+=12;
  if(m[4]==='오전'&&h===12)h=0;
  return new Date(`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}T${String(h).padStart(2,'0')}:${m[6]}:00+09:00`).toISOString();
}

function objectName(o){
  if(!o||typeof o!=='object')return '';
  return text(o.name??o.title??o.label??o.type??o.admission??o.admissionName??o.typeName??o.displayName??o.gubun??o.전형명);
}
function objectPair(o){
  if(!o||typeof o!=='object')return null;
  const q=num(o.quota,o.recruit,o.recruitment,o.capacity,o.mo,o.모집인원);
  const a=num(o.apply,o.applicants,o.application,o.support,o.ji,o.지원인원);
  return q!==null&&a!==null?{quota:q,apply:a}:null;
}
function findRepatriate(value,depth=0){
  if(depth>6||value===null||value===undefined)return null;
  if(Array.isArray(value)){
    for(const x of value){const p=findRepatriate(x,depth+1);if(p)return p}
    return null;
  }
  if(typeof value!=='object')return null;
  if(/재외국민/.test(objectName(value))){const p=objectPair(value);if(p)return p}
  for(const [k,v] of Object.entries(value)){
    if(/재외국민/.test(text(k))&&typeof v==='object'){const p=objectPair(v);if(p)return p}
  }
  for(const v of Object.values(value)){const p=findRepatriate(v,depth+1);if(p)return p}
  return null;
}
function explicitRepatriate(r){
  const q=num(r?.repatriateQuota,r?.repatriate_quota,r?.excludedRepatriateQuota,r?.excluded_repatriate_quota);
  const a=num(r?.repatriateApply,r?.repatriate_apply,r?.excludedRepatriateApply,r?.excluded_repatriate_apply);
  if(q!==null&&a!==null)return {quota:q,apply:a};
  return findRepatriate(r);
}

async function lastExcludedApply(env,name,quota){
  if(!env?.DB)return null;
  try{
    const rows=await env.DB.prepare(`
      SELECT excluded_note FROM competition_snapshots
      WHERE university_name=? AND run_id>0 AND excluded_note IS NOT NULL
      ORDER BY collected_at DESC,id DESC LIMIT 30
    `).bind(name).all();
    for(const row of (rows?.results||[])){
      const m=text(row?.excluded_note).match(new RegExp(`재외국민[^|]*모집\\s*${quota}명[^|]*지원\\s*(\\d+)명`));
      if(m)return Number(m[1]);
    }
  }catch{}
  return null;
}

async function fromTestUrl(env,base,diag){
  const spec=SPECS[base.name];
  const r=diag?.response;
  if(!spec||!diag?.ok||!r||typeof r!=='object')return null;

  const iq=num(r.innerQuota,r.inQuota,r.inner_quota,r.in_quota);
  const ia=num(r.innerApply,r.inApply,r.inner_apply,r.in_apply);
  const rq=num(r.quota,r.totalQuota,r.total_quota);
  const ra=num(r.apply,r.totalApply,r.total_apply);
  if(iq!==spec.innerQuota||ia===null||rq===null||ra===null)return null;

  let rep=explicitRepatriate(r);
  if(!rep){
    const oldApply=await lastExcludedApply(env,base.name,spec.repatriateQuota);
    if(oldApply!==null)rep={quota:spec.repatriateQuota,apply:oldApply};
  }

  let tq,ta,status='정상',warning=null;
  if(rq===spec.totalQuota+spec.repatriateQuota){
    if(rep){
      tq=rq-spec.repatriateQuota;
      ta=ra-rep.apply;
    }else{
      tq=base?.total?.quota;
      ta=base?.total?.apply;
      status='지연';
      warning='정원내는 test_url 최신값, 재외국민 지원인원 확인 지연';
    }
  }else if(rq===spec.totalQuota){
    tq=rq;
    ta=ra;
  }else return null;

  if(!Number.isFinite(tq)||!Number.isFinite(ta)||tq<iq||ta<ia)return null;
  const published=parsePublished(r.sourcePublished??r.published??r.sourceTime??r.checkedAt)||new Date().toISOString();
  return {
    ...base,
    level:status,
    parser:'KS_TEST_URL_LIVE_REPATRIATE_EXCLUDE',
    inner:metric(iq,ia),
    outside:metric(tq-iq,ta-ia),
    total:metric(tq,ta),
    excluded:rep?[`재외국민 전형행 제외: 모집 ${spec.repatriateQuota}명 / 지원 ${rep.apply}명`]:[],
    warnings:warning?[warning]:[],
    sourceCollectedAt:published,
    ksTestUrl:{ok:true,innerQuota:iq,innerApply:ia,rawTotalQuota:rq,rawTotalApply:ra,repatriate:rep,totalQuota:tq,totalApply:ta,sourcePublished:r.sourcePublished??null}
  };
}

function usableBase(r,spec){
  const iq=num(r?.inner?.quota),ia=num(r?.inner?.apply),tq=num(r?.total?.quota),ta=num(r?.total?.apply);
  return iq===spec.innerQuota&&tq===spec.totalQuota&&ia!==null&&ta!==null&&ta>=ia;
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
    const spec=SPECS[r.name];
    if(!spec){results.push(r);continue}

    const fixed=await fromTestUrl(env,r,diagByName.get(r.name));
    if(fixed){
      results.push(fixed);
      fresh[r.name]={ok:true,source:'KS_TEST_URL_LIVE',sourceCollectedAt:fixed.sourceCollectedAt,innerQuota:fixed.inner.quota,innerApply:fixed.inner.apply,totalQuota:fixed.total.quota,totalApply:fixed.total.apply,excludedQuota:spec.repatriateQuota,excludedApply:fixed.ksTestUrl?.repatriate?.apply??null};
      continue;
    }

    // 최신 test_url이 실패하더라도 기존 숫자가 있으면 절대 공란으로 만들지 않습니다.
    if(usableBase(r,spec)){
      const kept={...r,level:'지연',warnings:[...(r.warnings||[]),'경성대 test_url 최신조회 실패 · 기존 수집값 유지'],sourceCollectedAt:r.sourceCollectedAt||new Date().toISOString()};
      results.push(kept);
      fresh[r.name]={ok:true,source:'KS_EXISTING_DELAYED',sourceCollectedAt:kept.sourceCollectedAt,innerQuota:kept.inner.quota,innerApply:kept.inner.apply,totalQuota:kept.total.quota,totalApply:kept.total.apply,excludedQuota:spec.repatriateQuota,excludedApply:null};
      continue;
    }

    results.push(r);
  }

  const ok=results.filter(r=>r.level==='정상').length;
  return {...data,ksTestUrlDiagnostics:diag,targetFresh:fresh,results,summary:{...(data.summary||{}),universities:results.length,ok,delayed:results.filter(r=>r.level==='지연').length,needVerify:results.filter(r=>r.level==='검증필요'||r.level==='확인필요').length,failed:results.filter(r=>r.level==='접속실패').length}};
}
