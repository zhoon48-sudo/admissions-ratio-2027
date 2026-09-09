import { collectHybrid as collectBase } from './hybrid-collector.js';
import { fetchKyungsungTargetRows } from './ks-live-targets.js';

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

// 경성대 서버 stamp_()는 "yyyy-MM-dd HH:mm:ss" 형식의 한국시간(KST)을 반환합니다.
// 시간대 표기가 없는 이 문자열을 new Date(raw)로 먼저 읽으면 Worker에서 UTC로 해석되어
// 화면에서 +9시간 밀리는 문제가 있으므로, KST 형식을 먼저 명시적으로 처리합니다.
function sourceIso(row,fallback){
  const raw=row?.collectedAt || row?.sourcePublished || row?.published || row?.attemptedAt || fallback || '';
  if(!raw) return null;
  const s=String(raw).trim();

  // 2026-09-09 15:00:00 / 2026. 9. 9. 15:00:00 등 한국시간 문자열
  let m=s.match(/(20\d{2})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if(m){
    const iso=`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}T${String(m[4]).padStart(2,'0')}:${m[5]}:${String(m[6]||'00').padStart(2,'0')}+09:00`;
    const d=new Date(iso);
    if(!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // 오전/오후가 포함된 경우
  m=s.match(/(20\d{2})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if(m){
    let hour=Number(m[5]);
    if(m[4]==='오후'&&hour<12) hour+=12;
    if(m[4]==='오전'&&hour===12) hour=0;
    const iso=`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${m[6]}:${String(m[7]||'00').padStart(2,'0')}+09:00`;
    const d=new Date(iso);
    if(!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // 이미 Z 또는 +09:00 등의 시간대가 포함된 표준 ISO 값은 그대로 처리
  const d=new Date(s);
  if(!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

export async function collectHybrid(env){
  const [base,live] = await Promise.all([
    collectBase(env),
    fetchKyungsungTargetRows(env)
  ]);

  const rows=new Map((live.rows||[]).map(r=>[r.canonicalName,r]));
  const authoritative={};
  const results=(base.results||[]).map(r=>{
    if(!TARGETS.has(r.name)) return r;
    const row=rows.get(r.name);
    if(!row){
      return {...r,level:r.level==='정상'?'지연':r.level,warnings:[...(r.warnings||[]),'경성대 서버 cmp_live 대상 행 조회 실패 · 기존값 유지']};
    }

    const iq=n(row.innerQuota,row.inQuota);
    const ia=n(row.innerApply,row.innerApplicants,row.inApply);
    const tq=n(row.quota,row.totalQuota);
    const ta=n(row.apply,row.totalApply);
    if(![iq,ia,tq,ta].every(Number.isFinite) || iq>tq || ia>ta){
      return {...r,level:r.level==='정상'?'지연':r.level,warnings:[...(r.warnings||[]),'경성대 서버 cmp_live 숫자 검증 실패 · 기존값 유지']};
    }

    const oq=tq-iq, oa=ta-ia;
    const warning=String(row.lastErr||'').trim();
    const sourceCollectedAt=sourceIso(row,live.collectedAt) || r.sourceCollectedAt || base.checkedAt || new Date().toISOString();
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
    ksAuthoritative:{ok:Boolean(live.ok),error:live.error||null,targets:authoritative},
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
