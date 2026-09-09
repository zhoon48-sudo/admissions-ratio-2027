import { collectHybrid as collectBase } from './hybrid-collector.js';

const TARGETS = {
  '부산외국어대학교': { expectedTotalQuota: 1554 },
  '신라대학교': { expectedTotalQuota: 1472 }
};

function rate(quota, apply){
  return quota > 0 ? +(apply / quota).toFixed(2) : null;
}

function metric(quota, apply){
  return { quota, apply, rate: rate(quota, apply) };
}

function cleanReaderText(value){
  return String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function integerTokens(line){
  const normalized = String(line || '').replace(/\u00a0/g, ' ');
  const out=[];
  for(const m of normalized.matchAll(/(?:^|\s|\|)(\d{1,3}(?:,\d{3})*|\d+)(?=\s|\||$)/g)){
    const n=Number(m[1].replace(/,/g,''));
    if(Number.isFinite(n)) out.push(n);
  }
  return out;
}

function summarySection(text){
  const lines=String(text || '').split(/\r?\n/);
  const start=lines.findIndex(line=>/전형별\s*경쟁률\s*현황/.test(cleanReaderText(line)));
  if(start < 0) return [];
  const out=[];
  for(let i=start+1;i<lines.length;i++){
    const clean=cleanReaderText(lines[i]);
    if(i>start+1 && /^#{1,4}\s/.test(String(lines[i]).trim())) break;
    if(clean) out.push(lines[i]);
  }
  return out;
}

function parseSummaryFromReader(text, spec){
  const lines=summarySection(text);
  if(!lines.length) return null;

  const rows=[];
  for(const rawLine of lines){
    const rowText=cleanReaderText(rawLine);
    if(!rowText || /모집인원.*지원인원.*경쟁률/.test(rowText)) continue;
    if(/^[-|:\s]+$/.test(String(rawLine).trim())) continue;
    if(/소계|총계/.test(rowText)) continue;

    const nums=integerTokens(rawLine);
    if(nums.length < 2) continue;

    const quota=nums[0], apply=nums[1];
    const labelPart=rowText
      .replace(/\b\d{1,3}(?:,\d{3})*\b/g,' ')
      .replace(/\d+\.\d+\s*:\s*1/g,' ')
      .replace(/[|:\-]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    if(!/[가-힣A-Za-z]/.test(labelPart)) continue;

    rows.push({quota, apply, rowText, repatriate:/재외국민/.test(rowText)});
  }

  if(!rows.length) return null;

  const unique=[];
  const seen=new Set();
  for(const row of rows){
    const key=`${row.rowText.replace(/\s+/g,'')}|${row.quota}|${row.apply}`;
    if(seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  const repatriateRows=unique.filter(r=>r.repatriate);
  if(!repatriateRows.length) return null;

  const sourceTotalQuota=unique.reduce((s,r)=>s+r.quota,0);
  const sourceTotalApply=unique.reduce((s,r)=>s+r.apply,0);
  const excludedQuota=repatriateRows.reduce((s,r)=>s+r.quota,0);
  const excludedApply=repatriateRows.reduce((s,r)=>s+r.apply,0);
  const correctedTotalQuota=sourceTotalQuota-excludedQuota;
  const correctedTotalApply=sourceTotalApply-excludedApply;

  if(correctedTotalQuota !== spec.expectedTotalQuota){
    return {
      ok:false,
      source:'JINA_READER_SUMMARY',
      error:`재외국민 제외 후 모집인원 ${correctedTotalQuota}명 ≠ 기준 ${spec.expectedTotalQuota}명`,
      sourceTotalQuota,
      sourceTotalApply,
      excludedQuota,
      excludedApply,
      correctedTotalQuota,
      correctedTotalApply,
      repatriateRows:repatriateRows.map(r=>r.rowText)
    };
  }

  return {
    ok:true,
    source:'JINA_READER_SUMMARY',
    sourceTotalQuota,
    sourceTotalApply,
    excludedQuota,
    excludedApply,
    correctedTotalQuota,
    correctedTotalApply,
    rowCount:unique.length,
    repatriateRows:repatriateRows.map(r=>r.rowText)
  };
}

async function fetchSummaryViaJina(url, spec){
  try{
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-Respond-With': 'markdown',
        'X-No-Cache': 'true',
        'X-Engine': 'browser'
      },
      redirect:'follow'
    });
    const text=await response.text();
    if(!response.ok){
      return {ok:false,source:'JINA_READER_SUMMARY',error:`Jina Reader HTTP ${response.status}`};
    }
    const parsed=parseSummaryFromReader(text,spec);
    if(!parsed){
      return {ok:false,source:'JINA_READER_SUMMARY',error:'전형별 경쟁률 현황에서 재외국민 전형행을 찾지 못했습니다.'};
    }
    return parsed;
  }catch(e){
    return {ok:false,source:'JINA_READER_SUMMARY',error:e instanceof Error?e.message:String(e)};
  }
}

function unrelatedWarnings(result){
  return (result?.warnings || []).filter(w=>!/재외국민/.test(String(w)));
}

function unrelatedExcluded(result){
  return (result?.excluded || []).filter(w=>!/재외국민/.test(String(w)));
}

function applySummaryCorrection(result, summary){
  const spec=TARGETS[result?.name];
  if(!spec || !summary?.ok || !result?.inner) return result;

  const innerQuota=Number(result.inner.quota);
  const innerApply=Number(result.inner.apply);
  const totalQuota=Number(summary.correctedTotalQuota);
  const totalApply=Number(summary.correctedTotalApply);
  if(![innerQuota,innerApply,totalQuota,totalApply].every(Number.isFinite)) return result;
  if(totalQuota !== spec.expectedTotalQuota || totalQuota < innerQuota || totalApply < innerApply) return result;

  const outsideQuota=totalQuota-innerQuota;
  const outsideApply=totalApply-innerApply;
  const warnings=unrelatedWarnings(result);

  return {
    ...result,
    level:warnings.length ? '검증필요' : '정상',
    parser:'KS_SERVER_JINHAK_JINHAK_SUMMARY_KEYWORD_EXCLUDE',
    total:metric(totalQuota,totalApply),
    outside:metric(outsideQuota,outsideApply),
    excluded:[
      ...unrelatedExcluded(result),
      `재외국민 전형행 키워드 제외: 모집 ${summary.excludedQuota}명 / 지원 ${summary.excludedApply}명`
    ],
    warnings,
    repatriateSummary:summary
  };
}

function baseIsSafelyCorrected(result){
  const parser=String(result?.parser || '');
  return result?.level==='정상' && /NO_REPATRIATE_JINHAK/.test(parser);
}

async function lastVerifiedSnapshot(env, name, spec){
  if(!env?.DB) return null;
  try{
    return await env.DB.prepare(`
      SELECT * FROM competition_snapshots
      WHERE university_name=?
        AND status='정상'
        AND run_id>0
        AND total_quota=?
        AND (parser LIKE '%NO_REPATRIATE%' OR parser LIKE '%KEYWORD_EXCLUDE%')
      ORDER BY collected_at DESC, id DESC
      LIMIT 1
    `).bind(name,spec.expectedTotalQuota).first();
  }catch{
    return null;
  }
}

function splitExcludedNote(value){
  return String(value || '').split(' | ').map(x=>x.trim()).filter(Boolean);
}

function applyLastVerifiedSnapshot(result,row,summary){
  const spec=TARGETS[result?.name];
  if(!spec || !row) return result;

  const innerQuota=Number(row.inner_quota);
  const innerApply=Number(row.inner_apply);
  const totalQuota=Number(row.total_quota);
  const totalApply=Number(row.total_apply);
  const outsideQuota=Number(row.outside_quota);
  const outsideApply=Number(row.outside_apply);
  if(![innerQuota,innerApply,totalQuota,totalApply,outsideQuota,outsideApply].every(Number.isFinite)) return result;
  if(totalQuota !== spec.expectedTotalQuota) return result;

  const detail=summary?.error?` · ${summary.error}`:'';
  return {
    ...result,
    level:'지연',
    parser:`${row.parser || 'KS_SERVER_JINHAK_JINHAK_SUMMARY_KEYWORD_EXCLUDE'}_LAST_VERIFIED`,
    inner:metric(innerQuota,innerApply),
    outside:metric(outsideQuota,outsideApply),
    total:metric(totalQuota,totalApply),
    excluded:[
      ...splitExcludedNote(row.excluded_note),
      '재외국민 전형표 일시조회 실패 · 직전 검증 완료 정상값 유지'
    ],
    warnings:[`재외국민 전형표 조회 지연으로 직전 정상값을 유지합니다${detail}`],
    sourceCollectedAt:row.collected_at || null,
    repatriateSummary:summary || null
  };
}

function markSummaryPending(result,summary){
  return {
    ...result,
    level:'검증필요',
    parser:`${String(result?.parser || 'KS_SERVER_JINHAK').replace(/_REPATRIATE_[A-Z_]+/g,'')}_REPATRIATE_SUMMARY_PENDING`,
    warnings:[
      ...unrelatedWarnings(result),
      `재외국민 전형표를 확인하지 못했습니다${summary?.error?` (${summary.error})`:''}`
    ],
    repatriateSummary:summary || null
  };
}

export async function collectHybrid(env){
  const data=await collectBase(env);
  const targetResults=(data.results || []).filter(r=>TARGETS[r.name]);
  if(!targetResults.length) return data;

  const summaryPairs=await Promise.all(targetResults.map(async r=>[
    r.name,
    await fetchSummaryViaJina(r.url,TARGETS[r.name])
  ]));
  const summaryByName=new Map(summaryPairs);

  const results=[];
  for(const result of (data.results || [])){
    const spec=TARGETS[result.name];
    if(!spec){
      results.push(result);
      continue;
    }

    const summary=summaryByName.get(result.name);
    if(summary?.ok){
      results.push(applySummaryCorrection(result,summary));
      continue;
    }

    if(baseIsSafelyCorrected(result)){
      results.push(result);
      continue;
    }

    const previous=await lastVerifiedSnapshot(env,result.name,spec);
    if(previous){
      results.push(applyLastVerifiedSnapshot(result,previous,summary));
      continue;
    }

    results.push(markSummaryPending(result,summary));
  }

  const ok=results.filter(r=>r.level==='정상').length;
  return {
    ...data,
    repatriateSummary:Object.fromEntries(summaryPairs),
    summary:{
      ...(data.summary || {}),
      universities:results.length,
      ok,
      delayed:results.filter(r=>r.level==='지연').length,
      needVerify:results.filter(r=>r.level==='검증필요').length,
      failed:results.filter(r=>r.level==='접속실패').length
    },
    results
  };
}
