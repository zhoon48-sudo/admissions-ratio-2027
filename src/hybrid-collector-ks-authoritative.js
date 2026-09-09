import { collectHybrid as collectBase } from './hybrid-collector.js';
import { kyungsungCorrectionDiagnostics } from './ks-auth.js';

const TARGETS = new Set(['부산외국어대학교','신라대학교']);

function n(...values){
  for(const v of values){
    if(v === null || v === undefined || v === '') continue;
    const x = Number(v);
    if(Number.isFinite(x) && x >= 0) return x;
  }
  return null;
}
function rate(q,a){ return q > 0 ? +(a/q).toFixed(2) : null; }
function metric(q,a){ return Number.isFinite(q) && Number.isFinite(a) ? {quota:q,apply:a,rate:rate(q,a)} : null; }
function canonical(v){
  const s=String(v||'').replace(/\s+/g,'');
  if(/^부산외(국어)?대(학교)?$/.test(s)) return '부산외국어대학교';
  if(/^신라대(학교)?$/.test(s)) return '신라대학교';
  return s;
}
function sourceIso(row){
  const raw=row?.collectedAt || row?.sourcePublished || row?.published || row?.attemptedAt || '';
  if(!raw) return null;
  const d=new Date(raw);
  if(!Number.isNaN(d.getTime())) return d.toISOString();
  const m=String(raw).match(/(20\d{2})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})\s*(\d{1,2}):(\d{2})/);
  if(!m) return null;
  return new Date(`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}T${String(m[4]).padStart(2,'0')}:${m[5]}:00+09:00`).toISOString();
}

export async function collectHybrid(env){
  const [base,diag] = await Promise.all([
    collectBase(env),
    kyungsungCorrectionDiagnostics(env).catch(e=>({ok:false,error:e instanceof Error?e.message:String(e),rows:[]}))
  ]);

  const rows=new Map((Array.isArray(diag?.rows)?diag.rows:[]).map(r=>[canonical(r.univName),r]));
  const authoritative={};
  const results=(base.results||[]).map(r=>{
    if(!TARGETS.has(r.name)) return r;
    const row=rows.get(r.name);
    if(!row) return {...r,warnings:[...(r.warnings||[]),'경성대 서버 cmp_live에서 최신 행을 찾지 못했습니다.']};

    const iq=n(row.innerQuota,row.inQuota);
    const ia=n(row.innerApply,row.innerApplicants,row.inApply);
    const tq=n(row.quota,row.totalQuota);
    const ta=n(row.apply,row.totalApply);
    if(![iq,ia,tq,ta].every(Number.isFinite) || iq>tq || ia>ta){
      return {...r,warnings:[...(r.warnings||[]),'경성대 서버 cmp_live 숫자 검증에 실패했습니다.']};
    }

    const oq=tq-iq, oa=ta-ia;
    const warning=String(row.lastErr||'').trim();
    const sourceCollectedAt=sourceIso(row) || r.sourceCollectedAt || base.checkedAt || new Date().toISOString();
    authoritative[r.name]={ok:true,source:'KS_CMP_LIVE',innerQuota:iq,innerApply:ia,totalQuota:tq,totalApply:ta,sourceCollectedAt};
    return {
      ...r,
      level:warning?'지연':'정상',
      parser:'KS_CMP_LIVE_AUTHORITATIVE',
      inner:metric(iq,ia),
      outside:metric(oq,oa),
      total:metric(tq,ta),
      excluded:['경성대 서버 cmp_live 집계값 그대로 사용'],
      warnings:warning?[warning]:[],
      sourceCollectedAt
    };
  });

  return {
    ...base,
    targetFresh:{...(base.targetFresh||{}),...authoritative},
    ksAuthoritative:{ok:Boolean(diag?.ok),error:diag?.error||null,targets:authoritative},
    results,
    summary:{
      ...(base.summary||{}),
      universities:results.length,
      ok:results.filter(r=>r.level==='정상').length,
      delayed:results.filter(r=>r.level==='지연').length,
      needVerify:results.filter(r=>r.level==='검증필요'||r.level==='확인필요').length,
      failed:results.filter(r=>r.level==='접속실패').length
    }
  };
}
