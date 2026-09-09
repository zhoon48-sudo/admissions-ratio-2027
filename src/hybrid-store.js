import { collectHybrid } from './hybrid-collector-stable.js';

function diagnosticText(r){
  if(r.warnings?.length) return r.warnings.join(' | ');
  if(r.level === '정상') return null;
  if(r.error) return String(r.error);
  return '원인정보 없음';
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
    const data = await collectHybrid(env);
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
      collectedAt
    ));
    if(inserts.length) await env.DB.batch(inserts);

    const okCount = data.results.filter(r => r.level === '정상').length;
    const errorCount = data.results.length - okCount;
    const finishedAt = new Date().toISOString();
    const fallbackNames = Object.entries(data.repatriateFallback || {}).filter(([,v])=>v?.ok).map(([k])=>k);
    const note = `hybrid=uway-direct+jinhak-ks${fallbackNames.length?'+jina-fallback':''}; roundId=${data.sourceRoundId ?? 'unknown'}${fallbackNames.length?`; fallback=${fallbackNames.join(',')}`:''}`;

    await env.DB.prepare(
      `UPDATE crawl_runs SET finished_at=?, status=?, ok_count=?, error_count=?, note=? WHERE id=?`
    ).bind(
      finishedAt,
      errorCount === 0 ? 'success' : 'partial',
      okCount,
      errorCount,
      note,
      runId
    ).run();

    return {
      saved:true,
      runId,
      startedAt,
      finishedAt,
      universities:data.results.length,
      okCount,
      errorCount,
      snapshotsSaved:data.results.length,
      sourceRoundId:data.sourceRoundId ?? null,
      collectionMode:fallbackNames.length?'hybrid-resilient':'hybrid',
      fallbackUniversities:fallbackNames
    };
  }catch(e){
    const finishedAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE crawl_runs SET finished_at=?, status='error', note=? WHERE id=?`)
      .bind(finishedAt, e instanceof Error ? e.message : String(e), runId).run();
    throw e;
  }
}
