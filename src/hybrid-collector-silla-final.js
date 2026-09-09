import { collectHybrid as collectBase } from './hybrid-collector-direct-targets.js';

const SILLA_NAME='신라대학교';
const EXPECTED_INNER_QUOTA=1366;
const EXPECTED_TOTAL_QUOTA=1472;

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

function calculate(innerQuota,innerApply,outsideQuota,outsideApply,excludedQuota,excludedApply,source,sourceCollectedAt){
  const totalQuota=innerQuota+outsideQuota-excludedQuota;
  const totalApply=innerApply+outsideApply-excludedApply;
  if(innerQuota!==EXPECTED_INNER_QUOTA)return {ok:false,error:`정원내 모집인원 ${innerQuota}명 ≠ ${EXPECTED_INNER_QUOTA}명`,source};
  if(totalQuota!==EXPECTED_TOTAL_QUOTA)return {ok:false,error:`재외국민 제외 전체 모집인원 ${totalQuota}명 ≠ ${EXPECTED_TOTAL_QUOTA}명`,source};
  if(totalApply<innerApply)return {ok:false,error:'전체 지원인원이 정원내 지원인원보다 작습니다.',source};
  return {ok:true,source,innerQuota,innerApply,outsideQuota,outsideApply,excludedQuota,excludedApply,totalQuota,totalApply,sourceCollectedAt:sourceCollectedAt||null};
}

function parseHtml(html){
  let target=null;
  for(const m of String(html||'').matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
    const t=plain(m[0]);
    if(/정원내\s*소계/.test(t)&&/재외국민/.test(t)&&/모집인원/.test(t)&&/지원인원/.test(t)){target=m[0];break}
  }
  if(!target)return {ok:false,error:'신라대 전형별 경쟁률 현황 표를 찾지 못했습니다.',source:'JINHAK_DIRECT_SILLA'};

  let scope=null,inner=null,repatriate=null,outsideSummary=null;
  const outsideRows=[];
  for(const m of target.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
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
      if(!label&&nums.length>=2){outsideSummary={quota:nums[nums.length-2],apply:nums[nums.length-1]};continue}
      if(label&&/[가-힣A-Za-z]/.test(label))outsideRows.push({quota:nums[nums.length-2],apply:nums[nums.length-1],text});
    }
  }
  if(!inner)return {ok:false,error:'정원내 소계행을 읽지 못했습니다.',source:'JINHAK_DIRECT_SILLA'};
  if(!repatriate)return {ok:false,error:'재외국민 전형행을 읽지 못했습니다.',source:'JINHAK_DIRECT_SILLA'};
  if(!outsideSummary){outsideSummary={quota:outsideRows.reduce((s,r)=>s+r.quota,0)+repatriate.quota,apply:outsideRows.reduce((s,r)=>s+r.apply,0)+repatriate.apply}}
  return calculate(inner.quota,inner.apply,outsideSummary.quota,outsideSummary.apply,repatriate.quota,repatriate.apply,'JINHAK_DIRECT_SILLA',parseTime(html));
}

function cleanMarkdown(v){return String(v||'').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[`*_]/g,'').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim()}
function numbers(line){return [...String(line||'').matchAll(/(?:^|[|\s])(\d{1,3}(?:,\d{3})*|\d+)(?=[|\s]|$)/g)].map(m=>Number(m[1].replace(/,/g,'')))}
function parseReader(text){
  const lines=String(text||'').split(/\r?\n/);const start=lines.findIndex(l=>/전형별\s*경쟁률\s*현황/.test(cleanMarkdown(l)));if(start<0)return {ok:false,error:'Reader에서 전형별 경쟁률 현황을 찾지 못했습니다.',source:'JINA_SILLA'};
  const section=[];for(let i=start+1;i<lines.length;i++){if(i>start+1&&/^#{1,4}\s/.test(lines[i].trim()))break;section.push(lines[i])}
  let inner=null,repatriate=null,outsideSummary=null,seenOutside=false;const outsideRows=[];
  for(const raw of section){const t=cleanMarkdown(raw);if(!t)continue;const ns=numbers(raw);if(/정원외/.test(t))seenOutside=true;if(/정원내\s*소계/.test(t)&&ns.length>=2){inner={quota:ns[0],apply:ns[1]};continue}if(/재외국민/.test(t)&&ns.length>=2){repatriate={quota:ns[0],apply:ns[1]};continue}if(seenOutside&&ns.length>=2){if(/정원외\s*(소계|합계)|소계|합계|총계/.test(t)){outsideSummary={quota:ns[0],apply:ns[1]};continue}const label=t.replace(/\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?\s*:\s*1/g,' ').replace(/[|:\-]/g,' ').replace(/정원외/g,' ').replace(/\s+/g,' ').trim();if(!label){outsideSummary={quota:ns[0],apply:ns[1]};continue}if(!/재외국민/.test(t)&&/[가-힣A-Za-z]/.test(label))outsideRows.push({quota:ns[0],apply:ns[1]})}}
  if(!inner||!repatriate)return {ok:false,error:'Reader에서 신라대 소계/재외국민 행을 읽지 못했습니다.',source:'JINA_SILLA'};
  if(!outsideSummary)outsideSummary={quota:outsideRows.reduce((s,r)=>s+r.quota,0)+repatriate.quota,apply:outsideRows.reduce((s,r)=>s+r.apply,0)+repatriate.apply};
  return calculate(inner.quota,inner.apply,outsideSummary.quota,outsideSummary.apply,repatriate.quota,repatriate.apply,'JINA_SILLA',parseTime(text));
}

async function fetchFresh(url){
  const u=new URL(url);u.searchParams.set('_fresh',String(Math.floor(Date.now()/60000)));
  try{const r=await fetch(u.toString(),{headers:HEADERS,redirect:'follow',cache:'no-store'});if(r.ok){const ct=r.headers.get('content-type')||'';let cs=(ct.match(/charset\s*=\s*([^;\s]+)/i)?.[1]||'utf-8').replace(/["']/g,'').toLowerCase();if(/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(cs))cs='euc-kr';const b=await r.arrayBuffer();let h;try{h=new TextDecoder(cs).decode(b)}catch{h=new TextDecoder('utf-8').decode(b)}const p=parseHtml(h);if(p.ok)return p}}
  catch{}
  try{const readerUrl=`https://r.jina.ai/${u.toString()}`;const r=await fetch(readerUrl,{headers:{'Accept':'text/plain','X-Respond-With':'markdown','X-No-Cache':'true','X-Engine':'browser'},redirect:'follow'});const t=await r.text();if(r.ok){const p=parseReader(t);if(p.ok)return p;return p}return {ok:false,error:`Reader HTTP ${r.status}`,source:'JINA_SILLA'}}catch(e){return {ok:false,error:e instanceof Error?e.message:String(e),source:'JINA_SILLA'}}
}

function apply(result,fresh){
  const oq=fresh.totalQuota-fresh.innerQuota,oa=fresh.totalApply-fresh.innerApply;
  return {...result,level:'정상',parser:`${fresh.source}_SUMMARY_PRIORITY`,inner:metric(fresh.innerQuota,fresh.innerApply),outside:metric(oq,oa),total:metric(fresh.totalQuota,fresh.totalApply),excluded:[`재외국민 전형행 제외: 모집 ${fresh.excludedQuota}명 / 지원 ${fresh.excludedApply}명`],warnings:[],sourceCollectedAt:fresh.sourceCollectedAt||result.sourceCollectedAt||null,sillaFresh:fresh};
}

export async function collectHybrid(env){
  const data=await collectBase(env);const target=(data.results||[]).find(r=>r.name===SILLA_NAME);if(!target)return data;
  const fresh=await fetchFresh(target.url);const results=(data.results||[]).map(r=>r.name===SILLA_NAME&&fresh?.ok?apply(r,fresh):r);
  const ok=results.filter(r=>r.level==='정상').length;
  return {...data,sillaFresh:fresh,summary:{...(data.summary||{}),universities:results.length,ok,delayed:results.filter(r=>r.level==='지연').length,needVerify:results.filter(r=>r.level==='검증필요').length,failed:results.filter(r=>r.level==='접속실패').length},results};
}
