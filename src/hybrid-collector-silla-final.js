import { collectHybrid as collectBase } from './hybrid-collector-direct-targets.js';

const TARGETS = {
  '신라대학교': { kind:'silla', expectedInnerQuota:1366, expectedTotalQuota:1472 },
  '부산외국어대학교': { kind:'bufs', expectedInnerQuota:1394, expectedTotalQuota:1554 }
};

const HEADERS={
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
  'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.7',
  'Referer':'https://www.jinhakapply.com/',
  'Cache-Control':'no-cache',
  'Pragma':'no-cache'
};

function rate(quota,apply){return quota>0?+(apply/quota).toFixed(2):null}
function metric(quota,apply){return {quota,apply,rate:rate(quota,apply)}}
function plain(v){return String(v||'').replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi,' ').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/\s+/g,' ').trim()}
function intCell(v){const s=plain(v).replace(/,/g,'').trim();return /^\d+$/.test(s)?Number(s):null}
function numsFromCells(cells){return cells.map(intCell).filter(v=>v!==null)}
function parseTime(text){const t=plain(text);const m=t.match(/(20\d{2})-(\d{2})-(\d{2})\s*(오전|오후)\s*(\d{1,2}):(\d{2})\s*현황/);if(!m)return null;let h=Number(m[5]);if(m[4]==='오후'&&h<12)h+=12;if(m[4]==='오전'&&h===12)h=0;return new Date(`${m[1]}-${m[2]}-${m[3]}T${String(h).padStart(2,'0')}:${m[6]}:00+09:00`).toISOString()}

function validate(spec, values, source, sourceCollectedAt){
  const {innerQuota,innerApply,totalQuota,totalApply,excludedQuota,excludedApply}=values;
  if(![innerQuota,innerApply,totalQuota,totalApply,excludedQuota,excludedApply].every(Number.isFinite))return {ok:false,error:'필수 합계값을 읽지 못했습니다.',source};
  if(innerQuota!==spec.expectedInnerQuota)return {ok:false,error:`정원내 모집인원 ${innerQuota}명 ≠ ${spec.expectedInnerQuota}명`,source};
  if(totalQuota!==spec.expectedTotalQuota)return {ok:false,error:`재외국민 제외 전체 모집인원 ${totalQuota}명 ≠ ${spec.expectedTotalQuota}명`,source};
  if(totalApply<innerApply)return {ok:false,error:'전체 지원인원이 정원내 지원인원보다 작습니다.',source};
  return {ok:true,source,innerQuota,innerApply,totalQuota,totalApply,excludedQuota,excludedApply,sourceCollectedAt:sourceCollectedAt||null};
}

function findTable(html, kind){
  const candidates=[];
  for(const m of String(html||'').matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
    const t=plain(m[0]);
    const common=/재외국민/.test(t)&&/모집인원/.test(t)&&/지원인원/.test(t);
    const match=kind==='silla' ? common&&/정원내\s*소계/.test(t) : common&&/\[정원외\]/.test(t)&&/총계/.test(t);
    if(match)candidates.push({html:m[0],length:t.length});
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>a.length-b.length);
  return candidates[0].html;
}

function parseSillaHtml(html,spec){
  const table=findTable(html,'silla');
  if(!table)return {ok:false,error:'신라대 전형별 경쟁률 현황 표를 찾지 못했습니다.',source:'JINHAK_DIRECT_SILLA'};
  let scope=null,inner=null,repatriate=null,outsideSummary=null;
  const outsideRows=[];
  for(const m of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[];for(const c of m[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi))cells.push(plain(c[2]));
    if(!cells.length)continue;
    const text=cells.join(' ').replace(/\s+/g,' ').trim();
    const nums=numsFromCells(cells);
    const first=String(cells[0]||'').replace(/\s+/g,'');
    if(first==='정원내')scope='inner';else if(first==='정원외')scope='outside';
    if(/정원내\s*소계/.test(text)&&nums.length>=2){inner={quota:nums[nums.length-2],apply:nums[nums.length-1]};continue}
    if(/재외국민/.test(text)&&nums.length>=2){repatriate={quota:nums[nums.length-2],apply:nums[nums.length-1]};continue}
    if(scope==='outside'&&nums.length>=2){
      if(/정원외\s*(소계|합계)|소계|합계|총계/.test(text)){outsideSummary={quota:nums[nums.length-2],apply:nums[nums.length-1]};continue}
      const label=cells.filter(x=>x&&!/^\d[\d,]*$/.test(x)&&!/\d+(?:\.\d+)?\s*:\s*1/.test(x)&&!/^정원외$/.test(x.replace(/\s+/g,''))).join(' ').trim();
      if(!label){outsideSummary={quota:nums[nums.length-2],apply:nums[nums.length-1]};continue}
      if(/[가-힣A-Za-z]/.test(label))outsideRows.push({quota:nums[nums.length-2],apply:nums[nums.length-1]});
    }
  }
  if(!inner||!repatriate)return {ok:false,error:'신라대 정원내 소계 또는 재외국민 행을 읽지 못했습니다.',source:'JINHAK_DIRECT_SILLA'};
  if(!outsideSummary)outsideSummary={quota:outsideRows.reduce((s,r)=>s+r.quota,0)+repatriate.quota,apply:outsideRows.reduce((s,r)=>s+r.apply,0)+repatriate.apply};
  return validate(spec,{innerQuota:inner.quota,innerApply:inner.apply,totalQuota:inner.quota+outsideSummary.quota-repatriate.quota,totalApply:inner.apply+outsideSummary.apply-repatriate.apply,excludedQuota:repatriate.quota,excludedApply:repatriate.apply},'JINHAK_DIRECT_SILLA',parseTime(html));
}

function parseBufsHtml(html,spec){
  const table=findTable(html,'bufs');
  if(!table)return {ok:false,error:'부산외대 전형별 경쟁률 현황 표를 찾지 못했습니다.',source:'JINHAK_DIRECT_BUFS'};
  const innerRows=[], outsideRows=[];let repatriate=null,totalSummary=null;
  for(const m of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[];for(const c of m[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi))cells.push(plain(c[2]));
    if(!cells.length)continue;
    const text=cells.join(' ').replace(/\s+/g,' ').trim();
    if(!text||/전형명.*모집인원.*지원인원/.test(text))continue;
    const nums=numsFromCells(cells);if(nums.length<2)continue;
    const quota=nums[nums.length-2],apply=nums[nums.length-1];
    if(/^총계\b|\s총계\b/.test(text)){totalSummary={quota,apply};continue}
    if(/재외국민/.test(text)){repatriate={quota,apply};outsideRows.push({quota,apply});continue}
    if(/\[정원외\]/.test(text))outsideRows.push({quota,apply});
    else if(/[가-힣A-Za-z]/.test(text))innerRows.push({quota,apply});
  }
  if(!repatriate)return {ok:false,error:'부산외대 재외국민 전형행을 읽지 못했습니다.',source:'JINHAK_DIRECT_BUFS'};
  const innerQuota=innerRows.reduce((s,r)=>s+r.quota,0),innerApply=innerRows.reduce((s,r)=>s+r.apply,0);
  const rawTotalQuota=totalSummary?.quota ?? innerQuota+outsideRows.reduce((s,r)=>s+r.quota,0);
  const rawTotalApply=totalSummary?.apply ?? innerApply+outsideRows.reduce((s,r)=>s+r.apply,0);
  return validate(spec,{innerQuota,innerApply,totalQuota:rawTotalQuota-repatriate.quota,totalApply:rawTotalApply-repatriate.apply,excludedQuota:repatriate.quota,excludedApply:repatriate.apply},'JINHAK_DIRECT_BUFS',parseTime(html));
}

function cleanMarkdown(v){return String(v||'').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[`*_]/g,'').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim()}
function numbers(line){return [...String(line||'').matchAll(/(?:^|[|\s])(\d{1,3}(?:,\d{3})*|\d+)(?=[|\s]|$)/g)].map(m=>Number(m[1].replace(/,/g,'')))}
function summaryLines(text){const lines=String(text||'').split(/\r?\n/);const start=lines.findIndex(l=>/전형별\s*경쟁률\s*현황/.test(cleanMarkdown(l)));if(start<0)return [];const out=[];for(let i=start+1;i<lines.length;i++){if(i>start+1&&/^#{1,4}\s/.test(lines[i].trim()))break;out.push(lines[i])}return out}

function parseSillaReader(text,spec){
  const section=summaryLines(text);if(!section.length)return {ok:false,error:'Reader에서 신라대 전형별 현황을 찾지 못했습니다.',source:'JINA_SILLA'};
  let inner=null,repatriate=null,outsideSummary=null,seenOutside=false;const outsideRows=[];
  for(const raw of section){const t=cleanMarkdown(raw);if(!t)continue;const ns=numbers(raw);if(/정원외/.test(t))seenOutside=true;if(/정원내\s*소계/.test(t)&&ns.length>=2){inner={quota:ns[0],apply:ns[1]};continue}if(/재외국민/.test(t)&&ns.length>=2){repatriate={quota:ns[0],apply:ns[1]};continue}if(seenOutside&&ns.length>=2){if(/정원외\s*(소계|합계)|소계|합계|총계/.test(t)){outsideSummary={quota:ns[0],apply:ns[1]};continue}const label=t.replace(/\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?\s*:\s*1/g,' ').replace(/[|:\-]/g,' ').replace(/정원외/g,' ').replace(/\s+/g,' ').trim();if(!label){outsideSummary={quota:ns[0],apply:ns[1]};continue}if(!/재외국민/.test(t)&&/[가-힣A-Za-z]/.test(label))outsideRows.push({quota:ns[0],apply:ns[1]})}}
  if(!inner||!repatriate)return {ok:false,error:'Reader에서 신라대 소계/재외국민 행을 읽지 못했습니다.',source:'JINA_SILLA'};
  if(!outsideSummary)outsideSummary={quota:outsideRows.reduce((s,r)=>s+r.quota,0)+repatriate.quota,apply:outsideRows.reduce((s,r)=>s+r.apply,0)+repatriate.apply};
  return validate(spec,{innerQuota:inner.quota,innerApply:inner.apply,totalQuota:inner.quota+outsideSummary.quota-repatriate.quota,totalApply:inner.apply+outsideSummary.apply-repatriate.apply,excludedQuota:repatriate.quota,excludedApply:repatriate.apply},'JINA_SILLA',parseTime(text));
}

function parseBufsReader(text,spec){
  const section=summaryLines(text);if(!section.length)return {ok:false,error:'Reader에서 부산외대 전형별 현황을 찾지 못했습니다.',source:'JINA_BUFS'};
  const innerRows=[],outsideRows=[];let repatriate=null,totalSummary=null;
  for(const raw of section){const t=cleanMarkdown(raw);if(!t||/전형명.*모집인원.*지원인원/.test(t))continue;const ns=numbers(raw);if(ns.length<2)continue;const quota=ns[0],apply=ns[1];if(/^총계\b/.test(t)){totalSummary={quota,apply};continue}if(/재외국민/.test(t)){repatriate={quota,apply};outsideRows.push({quota,apply});continue}if(/\[정원외\]/.test(t))outsideRows.push({quota,apply});else if(/[가-힣A-Za-z]/.test(t))innerRows.push({quota,apply})}
  if(!repatriate)return {ok:false,error:'Reader에서 부산외대 재외국민 행을 읽지 못했습니다.',source:'JINA_BUFS'};
  const innerQuota=innerRows.reduce((s,r)=>s+r.quota,0),innerApply=innerRows.reduce((s,r)=>s+r.apply,0);
  const rawTotalQuota=totalSummary?.quota ?? innerQuota+outsideRows.reduce((s,r)=>s+r.quota,0);
  const rawTotalApply=totalSummary?.apply ?? innerApply+outsideRows.reduce((s,r)=>s+r.apply,0);
  return validate(spec,{innerQuota,innerApply,totalQuota:rawTotalQuota-repatriate.quota,totalApply:rawTotalApply-repatriate.apply,excludedQuota:repatriate.quota,excludedApply:repatriate.apply},'JINA_BUFS',parseTime(text));
}

async function fetchFresh(result,spec){
  const u=new URL(result.url);u.searchParams.set('_fresh',String(Math.floor(Date.now()/60000)));
  const parseHtml=spec.kind==='silla'?parseSillaHtml:parseBufsHtml;
  const parseReader=spec.kind==='silla'?parseSillaReader:parseBufsReader;
  let directError=null;
  try{const r=await fetch(u.toString(),{headers:HEADERS,redirect:'follow',cache:'no-store'});if(r.ok){const ct=r.headers.get('content-type')||'';let cs=(ct.match(/charset\s*=\s*([^;\s]+)/i)?.[1]||'utf-8').replace(/["']/g,'').toLowerCase();if(/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(cs))cs='euc-kr';const b=await r.arrayBuffer();let h;try{h=new TextDecoder(cs).decode(b)}catch{h=new TextDecoder('utf-8').decode(b)}const p=parseHtml(h,spec);if(p.ok)return p;directError=p.error}else directError=`직접조회 HTTP ${r.status}`}
  catch(e){directError=e instanceof Error?e.message:String(e)}
  try{const readerUrl=`https://r.jina.ai/${u.toString()}`;const r=await fetch(readerUrl,{headers:{'Accept':'text/plain','X-Respond-With':'markdown','X-No-Cache':'true','X-Engine':'browser'},redirect:'follow'});const t=await r.text();if(r.ok){const p=parseReader(t,spec);if(p.ok)return p;return {...p,directError}}return {ok:false,error:`Reader HTTP ${r.status}`,directError,source:spec.kind==='silla'?'JINA_SILLA':'JINA_BUFS'}}catch(e){return {ok:false,error:e instanceof Error?e.message:String(e),directError,source:spec.kind==='silla'?'JINA_SILLA':'JINA_BUFS'}}
}

function applyFresh(result,fresh){
  const oq=fresh.totalQuota-fresh.innerQuota,oa=fresh.totalApply-fresh.innerApply;
  return {...result,level:'정상',parser:`${fresh.source}_SUMMARY_PRIORITY`,inner:metric(fresh.innerQuota,fresh.innerApply),outside:metric(oq,oa),total:metric(fresh.totalQuota,fresh.totalApply),excluded:[`재외국민 전형행 제외: 모집 ${fresh.excludedQuota}명 / 지원 ${fresh.excludedApply}명`],warnings:[],sourceCollectedAt:fresh.sourceCollectedAt||result.sourceCollectedAt||null,targetFresh:fresh};
}

export async function collectHybrid(env){
  const data=await collectBase(env);
  const targets=(data.results||[]).filter(r=>TARGETS[r.name]);
  if(!targets.length)return data;
  const freshPairs=await Promise.all(targets.map(async r=>[r.name,await fetchFresh(r,TARGETS[r.name])]));
  const freshByName=new Map(freshPairs);
  const results=(data.results||[]).map(r=>{const f=freshByName.get(r.name);return f?.ok?applyFresh(r,f):r});
  const ok=results.filter(r=>r.level==='정상').length;
  return {...data,targetFresh:Object.fromEntries(freshPairs),summary:{...(data.summary||{}),universities:results.length,ok,delayed:results.filter(r=>r.level==='지연').length,needVerify:results.filter(r=>r.level==='검증필요').length,failed:results.filter(r=>r.level==='접속실패').length},results};
}
