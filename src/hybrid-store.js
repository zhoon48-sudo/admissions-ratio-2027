import { collectHybrid } from './hybrid-collector-priority-freshness.js';
import { importLegacyReports } from './legacy-report-import.js';

const PRIORITY_TARGETS = {
  '부산외국어대학교':1554,
  '신라대학교':1472
};

function rate(quota,apply){return quota>0?+(apply/quota).toFixed(2):null}
function metric(quota,apply){return Number.isFinite(quota)&&Number.isFinite(apply)?{quota,apply,rate:rate(quota,apply)}:null}

function diagnosticText(r){
  if(r.warnings?.length) return r.warnings.join(' | ');
  if(r.level === '정상') return null;
  if(r.error) return String(r.error);
  return '원인정보 없음';
}

async function lastFreshPriority(env,name,expectedTotalQuota){
  try{
    return await env.DB.prepare(`
      SELECT * FROM competition_snapshots
      WHERE university_name=?
        AND status='정상'
        AND run_id>0
        AND total_quota=?
        AND parser LIKE '%SUMMARY_PRIORITY%'
      ORDER BY collected_at DESC, id DESC
      LIMIT 1
    `).bind(name,expectedTotalQuota).first();
  }catch{return null}
}

async function protectPriorityTargets(env,data){
  const fresh=data.targetFresh||{};
  const out=[];
  for(const r of (data.results||[])){
    const expected=PRIORITY_TARGETS[r.name];
    if(!expected){out.push(r);continue}
    if(fresh[r.name]?.ok){out.push(r);continue}

    const previous=await lastFreshPriority(env,r.name,expected);
    const freshError=fresh[r.name]?.error||fresh[r.name]?.directError||'최신 원본 상단표 조회 실패';
    if(previous){
      const iq=Number(previous.inner_quota),ia=Number(previous.inner_apply),oq=Number(previous.outside_quota),oa=Number(previous.outside_apply),tq=Number(previous.total_quota),ta=Number(previous.total_apply);
      if([iq,ia,oq,oa,tq,ta].every(Number.isFinite)){
        out.push({...r,level:'지연',parser:`${previous.parser||'JINHAK_SUMMARY_PRIORITY'}_LAST_FRESH`,inner:metric(iq,ia),outside:metric(oq,oa),total:metric(tq,ta),excluded:String(previous.excluded_note||'').split(' | ').filter(Boolean),warnings:[`최신 진학사 상단표 조회 실패 · 마지막 직접 검증값 유지 (${freshError})`],sourceCollectedAt:previous.collected_at||r.sourceCollectedAt||null});
        continue;
      }
    }

    // 부산외대·신라대는 경성대 서버의 과거/보정값을 최신값처럼 재사용하지 않습니다.
    // 최신 전용수집도 실패하고 이전 직접검증값도 없으면 숫자를 비워 확인필요로 표시합니다.
    out.push({...r,level:'검증필요',parser:`${r.parser||'JINHAK'}_FRESH_REQUIRED`,inner:null,outside:null,total:null,warnings:[`최신 진학사 상단표를 확인하지 못해 기존 집계값은 사용하지 않습니다. (${freshError})`]});
  }
  return {...data,results:out};
}

export async function collectHybridAndStore(env, triggerType='manual'){
  if(!env.DB) throw new Error('D1 binding DB가 연결되지 않았습니다.');

  const startedAt = new Date().toISOString();
  const run = await env.DB.prepare(
    `INSERT INTO crawl_runs (trigger_type, started_at, status) VALUES (?, ?, 'running') RETURNING id`
  ).bind(triggerType, startedAt).first();
  const runId = Number(run?.id);
  if(!runId) throw new Error('crawl_runs 실행번호 생성에 실패했습니다.');

  try{
    let data = await collectHybrid(env);
    data = await protectPriorityTargets(env,data);
    const collectedAt = data.checkedAt || new Date().toISOString();

    const inserts = data.results.map(r => env.DB.prepare(`
      INSERT INTO competition_snapshots (
        run_id, university_name, agency, parser, status,
        inner_quota, inner_apply, inner_rate,
        outside_quota, outside_apply, outside_rate,
        total_quota, total_apply, total_rate,
        excluded_note, warning_note, source_url, collected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      runId, r.name, r.agency, r.parser || null, r.level,
      r.inner?.quota ?? null, r.inner?.apply ?? null, r.inner?.rate ?? null,
      r.outside?.quota ?? null, r.outside?.apply ?? null, r.outside?.rate ?? null,
      r.total?.quota ?? null, r.total?.apply ?? null, r.total?.rate ?? null,
      r.excluded?.length ? r.excluded.join(' | ') : null,
      diagnosticText(r),
      r.url,
      r.sourceCollectedAt || collectedAt
    ));
    if(inserts.length) await env.DB.batch(inserts);

    const okCount = data.results.filter(r => r.level === '정상').length;
    const delayedCount = data.results.filter(r => r.level === '지연').length;
    const errorCount = data.results.length - okCount - delayedCount;
    const finishedAt = new Date().toISOString();
    const fallbackNames = Object.entries(data.repatriateFallback || {}).filter(([,v])=>v?.ok).map(([k])=>k);
    const delayedNames = data.results.filter(r=>r.level==='지연').map(r=>r.name);
    const freshNames=Object.entries(data.targetFresh||{}).filter(([,v])=>v?.ok).map(([k])=>k);
    const note = `hybrid=uway-direct+jinhak-ks+priority-summary${fallbackNames.length?'+jina-fallback':''}; roundId=${data.sourceRoundId ?? 'unknown'}${freshNames.length?`; fresh=${freshNames.join(',')}`:''}${fallbackNames.length?`; fallback=${fallbackNames.join(',')}`:''}${delayedNames.length?`; delayed=${delayedNames.join(',')}`:''}`;

    await env.DB.prepare(
      `UPDATE crawl_runs SET finished_at=?, status=?, ok_count=?, error_count=?, note=? WHERE id=?`
    ).bind(
      finishedAt,
      errorCount === 0 ? 'success' : 'partial',
      okCount + delayedCount,
      errorCount,
      note,
      runId
    ).run();

    let legacyImport=null;
    try{
      legacyImport=await importLegacyReports(env);
    }catch(importError){
      legacyImport={ok:false,error:importError instanceof Error?importError.message:String(importError)};
    }

    return {
      saved:true,
      runId,
      startedAt,
      finishedAt,
      universities:data.results.length,
      okCount,
      delayedCount,
      errorCount,
      snapshotsSaved:data.results.length,
      sourceRoundId:data.sourceRoundId ?? null,
      collectionMode:freshNames.length?'priority-summary':'hybrid',
      freshUniversities:freshNames,
      fallbackUniversities:fallbackNames,
      delayedUniversities:delayedNames,
      priorityTargets:data.results.filter(r=>PRIORITY_TARGETS[r.name]).map(r=>({name:r.name,status:r.level,parser:r.parser,inner:r.inner,total:r.total,sourceCollectedAt:r.sourceCollectedAt||null,warning:r.warnings?.[0]||null})),
      targetFresh:data.targetFresh||{},
      legacyImport
    };
  }catch(e){
    const finishedAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE crawl_runs SET finished_at=?, status='error', note=? WHERE id=?`)
      .bind(finishedAt, e instanceof Error ? e.message : String(e), runId).run();
    throw e;
  }
}
