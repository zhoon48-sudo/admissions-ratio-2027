import { collectHybrid as collectBase } from './hybrid-collector-stable.js';

const TARGETS = {
  '부산외국어대학교': { expectedInnerQuota:1394, expectedTotalQuota:1554 },
  '신라대학교': { expectedInnerQuota:1366, expectedTotalQuota:1472 }
};

const HEADERS = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
  'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.7',
  'Referer':'https://www.jinhakapply.com/'
};

function rate(quota, apply){
  return quota > 0 ? +(apply / quota).toFixed(2) : null;
}

function metric(quota, apply){
  return { quota, apply, rate:rate(quota,apply) };
}

function htmlText(value){
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/\s+/g,' ')
    .trim();
}

function intCell(value){
  const s=htmlText(value).replace(/,/g,'').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

function parseSourceTime(html){
  const text=htmlText(html);
  const m=text.match(/(20\d{2})-(\d{2})-(\d{2})\s*(오전|오후)\s*(\d{1,2}):(\d{2})\s*현황/);
  if(!m) return null;
  let hour=Number(m[5]);
  if(m[4]==='오후' && hour<12) hour+=12;
  if(m[4]==='오전' && hour===12) hour=0;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${String(hour).padStart(2,'0')}:${m[6]}:00+09:00`).toISOString();
}

function findSummaryTable(html){
  const tables=[];
  for(const m of String(html||'').matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
    const text=htmlText(m[0]);
    const hasScope=/정원내/.test(text) || /\[정원외\]/.test(text);
    if(/재외국민/.test(text) && hasScope && /모집인원/.test(text) && /지원인원/.test(text)){
      tables.push({html:m[0],text});
    }
  }
  if(!tables.length) return null;
  tables.sort((a,b)=>a.text.length-b.text.length);
  return tables[0].html;
}

function parseDirectSummary(html, spec){
  const table=findSummaryTable(html);
  if(!table) return {ok:false,error:'전형별 경쟁률 현황 표를 찾지 못했습니다.'};

  let scope='inner';
  const rows=[];
  for(const m of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[];
    for(const c of m[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)) cells.push(htmlText(c[2]));
    if(!cells.length) continue;
    const rowText=cells.join(' ').replace(/\s+/g,' ').trim();
    if(!rowText || /전형명.*모집인원.*지원인원/.test(rowText)) continue;

    const first=String(cells[0]||'').replace(/\s+/g,'');
    if(first==='정원내') scope='inner';
    else if(first==='정원외') scope='outside';
    else if(/\[정원외\]/.test(rowText)) scope='outside';

    if(/소계|합계|총계/.test(rowText)) continue;

    const labelCells=cells.filter(c=>{
      const t=String(c||'').trim();
      if(!t) return false;
      if(/^(정원내|정원외)$/.test(t.replace(/\s+/g,''))) return false;
      if(intCell(t)!==null) return false;
      if(/^\d+(?:\.\d+)?\s*:\s*1$/.test(t)) return false;
      return true;
    });
    if(!labelCells.some(c=>/[가-힣A-Za-z]/.test(c))) continue;

    const nums=cells.map(intCell).filter(v=>v!==null);
    if(nums.length<2) continue;

    const quota=nums[nums.length-2];
    const apply=nums[nums.length-1];
    const repatriate=/재외국민/.test(rowText);
    rows.push({scope,quota,apply,repatriate,rowText});
  }

  if(!rows.length) return {ok:false,error:'전형별 경쟁률 행을 읽지 못했습니다.'};
  const repatriateRows=rows.filter(r=>r.repatriate);
  if(!repatriateRows.length) return {ok:false,error:'재외국민 전형행을 찾지 못했습니다.'};

  const included=rows.filter(r=>!r.repatriate);
  const inner=included.filter(r=>r.scope==='inner');
  const innerQuota=inner.reduce((s,r)=>s+r.quota,0);
  const innerApply=inner.reduce((s,r)=>s+r.apply,0);
  const totalQuota=included.reduce((s,r)=>s+r.quota,0);
  const totalApply=included.reduce((s,r)=>s+r.apply,0);
  const excludedQuota=repatriateRows.reduce((s,r)=>s+r.quota,0);
  const excludedApply=repatriateRows.reduce((s,r)=>s+r.apply,0);

  if(innerQuota!==spec.expectedInnerQuota){
    return {ok:false,error:`정원내 모집인원 ${innerQuota}명 ≠ 기준 ${spec.expectedInnerQuota}명`,innerQuota,innerApply,totalQuota,totalApply};
  }
  if(totalQuota!==spec.expectedTotalQuota){
    return {ok:false,error:`재외국민 제외 전체 모집인원 ${totalQuota}명 ≠ 기준 ${spec.expectedTotalQuota}명`,innerQuota,innerApply,totalQuota,totalApply};
  }
  if(totalApply<innerApply){
    return {ok:false,error:'전체 지원인원이 정원내 지원인원보다 작습니다.'};
  }

  return {
    ok:true,
    source:'JINHAK_DIRECT_SUMMARY',
    innerQuota,innerApply,totalQuota,totalApply,
    excludedQuota,excludedApply,
    rowCount:rows.length,
    repatriateRows:repatriateRows.map(r=>r.rowText),
    sourceCollectedAt:parseSourceTime(html)
  };
}

async function fetchDirectSummary(result,spec){
  try{
    const response=await fetch(result.url,{headers:HEADERS,redirect:'follow'});
    if(!response.ok) return {ok:false,error:`진학사 직접조회 HTTP ${response.status}`};
    const contentType=response.headers.get('content-type')||'';
    let charset=(contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1]||'utf-8').replace(/["']/g,'').toLowerCase();
    if(/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(charset)) charset='euc-kr';
    const buf=await response.arrayBuffer();
    let html;
    try{html=new TextDecoder(charset).decode(buf)}catch{html=new TextDecoder('utf-8').decode(buf)}
    return parseDirectSummary(html,spec);
  }catch(e){
    return {ok:false,error:e instanceof Error?e.message:String(e)};
  }
}

function applyDirectSummary(result,summary){
  if(!summary?.ok) return result;
  const outsideQuota=summary.totalQuota-summary.innerQuota;
  const outsideApply=summary.totalApply-summary.innerApply;
  return {
    ...result,
    level:'정상',
    parser:'JINHAK_DIRECT_SUMMARY_KEYWORD_EXCLUDE',
    inner:metric(summary.innerQuota,summary.innerApply),
    outside:metric(outsideQuota,outsideApply),
    total:metric(summary.totalQuota,summary.totalApply),
    excluded:[`재외국민 전형행 직접 제외: 모집 ${summary.excludedQuota}명 / 지원 ${summary.excludedApply}명`],
    warnings:[],
    sourceCollectedAt:summary.sourceCollectedAt || result.sourceCollectedAt || null,
    directSummary:summary
  };
}

export async function collectHybrid(env){
  const data=await collectBase(env);
  const targets=(data.results||[]).filter(r=>TARGETS[r.name]);
  if(!targets.length) return data;

  const pairs=await Promise.all(targets.map(async r=>[r.name,await fetchDirectSummary(r,TARGETS[r.name])]));
  const byName=new Map(pairs);
  const results=(data.results||[]).map(r=>{
    const summary=byName.get(r.name);
    return summary?.ok ? applyDirectSummary(r,summary) : r;
  });

  const ok=results.filter(r=>r.level==='정상').length;
  return {
    ...data,
    directTargetSummary:Object.fromEntries(pairs),
    summary:{
      ...(data.summary||{}),
      universities:results.length,
      ok,
      delayed:results.filter(r=>r.level==='지연').length,
      needVerify:results.filter(r=>r.level==='검증필요').length,
      failed:results.filter(r=>r.level==='접속실패').length
    },
    results
  };
}
