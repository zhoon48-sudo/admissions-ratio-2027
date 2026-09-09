import { collectHybrid as collectBase } from './hybrid-collector.js';

const TARGETS = {
  '부산외국어대학교': { quota: 20, expectedTotalQuota: 1554 },
  '신라대학교': { quota: 5, expectedTotalQuota: 1472 }
};

function rate(quota, apply){
  return quota > 0 ? +(apply / quota).toFixed(2) : null;
}

function metric(quota, apply){
  return { quota, apply, rate: rate(quota, apply) };
}

function parseIntegerCell(value){
  const s = String(value || '').replace(/[`*_\[\]()]/g, '').replace(/,/g, '').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

function parseRepatriateFromReader(text, spec){
  const lines = String(text || '').split(/\r?\n/);
  const candidates = [];

  for(let i=0;i<lines.length;i++){
    if(!/재외국민/.test(lines[i])) continue;
    const block = [lines[i-1] || '', lines[i], lines[i+1] || ''].join(' ');
    const cells = lines[i].includes('|') ? lines[i].split('|') : block.split(/\s{2,}|\t+/);
    const nums = cells.map(parseIntegerCell).filter(v => v !== null);

    const quotaIndex = nums.indexOf(spec.quota);
    if(quotaIndex >= 0 && nums[quotaIndex + 1] !== undefined){
      candidates.push({ quota: spec.quota, apply: nums[quotaIndex + 1], rowText: lines[i].trim() });
      continue;
    }

    const cleaned = block.replace(/,/g, ' ');
    const all = [...cleaned.matchAll(/(?:^|\D)(\d{1,6})(?=\D|$)/g)].map(m => Number(m[1]));
    for(let j=0;j<all.length-1;j++){
      if(all[j] === spec.quota){
        candidates.push({ quota: spec.quota, apply: all[j+1], rowText: lines[i].trim() });
        break;
      }
    }
  }

  const exact = candidates.find(x => x.quota === spec.quota && Number.isFinite(x.apply) && x.apply >= 0);
  return exact || null;
}

async function fetchViaJinaReader(url, spec){
  try{
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-Respond-With': 'markdown',
        'X-No-Cache': 'true',
        'X-Engine': 'browser'
      },
      redirect: 'follow'
    });
    const text = await response.text();
    if(!response.ok){
      return { ok:false, source:'JINA_READER', error:`Jina Reader HTTP ${response.status}` };
    }
    const parsed = parseRepatriateFromReader(text, spec);
    if(!parsed){
      return { ok:false, source:'JINA_READER', error:'Jina Reader 응답에서 재외국민 행을 찾지 못했습니다.' };
    }
    return { ok:true, source:'JINA_READER', ...parsed };
  }catch(e){
    return { ok:false, source:'JINA_READER', error:e instanceof Error ? e.message : String(e) };
  }
}

function applyFallbackCorrection(result, fallback){
  const spec = TARGETS[result?.name];
  if(!spec || !fallback?.ok || !result?.total || !result?.inner) return result;

  // 기본 collector가 이미 정상 처리했다면 그대로 둡니다.
  if(result.level === '정상' && !String(result.parser || '').includes('REPATRIATE_APPLY_PENDING')) return result;

  // pending 상태의 기본 collector는 모집인원 20/5명만 이미 제외하고 지원인원은 원본 전체값을 유지합니다.
  const totalQuota = Number(result.total.quota);
  const totalApply = Number(result.total.apply);
  const innerQuota = Number(result.inner.quota);
  const innerApply = Number(result.inner.apply);
  if(![totalQuota,totalApply,innerQuota,innerApply].every(Number.isFinite)) return result;
  if(totalQuota !== spec.expectedTotalQuota) return result;
  if(fallback.quota !== spec.quota || fallback.apply > totalApply) return result;

  const correctedTotalApply = totalApply - fallback.apply;
  if(correctedTotalApply < innerApply) return result;
  const outsideQuota = totalQuota - innerQuota;
  const outsideApply = correctedTotalApply - innerApply;

  return {
    ...result,
    level:'정상',
    parser:String(result.parser || 'KS_SERVER_JINHAK')
      .replace('_REPATRIATE_APPLY_PENDING','') + '_NO_REPATRIATE_JINA',
    total:metric(totalQuota, correctedTotalApply),
    outside:metric(outsideQuota, outsideApply),
    excluded:[
      ...(result.excluded || []).filter(x => !/지원인원 동적 제외 대기/.test(String(x))),
      `재외국민 Jina 보조 제외: 모집 ${fallback.quota}명 / 지원 ${fallback.apply}명`
    ],
    warnings:[],
    repatriateFallback:fallback
  };
}

export async function collectHybrid(env){
  const data = await collectBase(env);
  const pending = (data.results || []).filter(r => TARGETS[r.name] && String(r.parser || '').includes('REPATRIATE_APPLY_PENDING'));
  if(!pending.length) return data;

  const fallbackPairs = await Promise.all(pending.map(async r => {
    const spec = TARGETS[r.name];
    const fb = await fetchViaJinaReader(r.url, spec);
    return [r.name, fb];
  }));
  const fallbackByName = new Map(fallbackPairs);

  const results = (data.results || []).map(r => applyFallbackCorrection(r, fallbackByName.get(r.name)));
  const ok = results.filter(r => r.level === '정상').length;

  return {
    ...data,
    repatriateFallback:Object.fromEntries(fallbackPairs),
    summary:{
      ...(data.summary || {}),
      universities:results.length,
      ok,
      needVerify:results.filter(r=>r.level==='검증필요').length,
      failed:results.filter(r=>r.level==='접속실패').length
    },
    results
  };
}
