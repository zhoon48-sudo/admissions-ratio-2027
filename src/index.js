const UNIVERSITIES = [
  { name:"경성대학교", agency:"UWAY", mode:"admission", url:"https://ratio.uwayapply.com/Sl5KJjlKZiUmOiZKN2ZUZg==", rules:{
    "일반계고교과전형":"내","지역인재전형":"내","지역인재(저소득층)전형":"내","특성화고교과전형":"내","사회배려대상자전형":"내","학교생활우수자전형":"내","지역인재II전형":"내","지역인재Ⅱ전형":"내","실기특별전형":"내","체육특기자전형":"내","특성화고동일계전형":"외","농어촌전형":"외","저소득층전형":"외"
  }},
  { name:"동아대학교", agency:"JINHAK", mode:"summary", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10591481.html" },
  { name:"동의대학교", agency:"UWAY", mode:"summary", url:"https://ratio.uwayapply.com/Sl5KOmBWSmYlJjomSjdmVGY=" },
  { name:"동서대학교", agency:"JINHAK", mode:"grouped", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10570791.html" },
  { name:"동명대학교", agency:"JINHAK", mode:"grouped", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio30050681.html" },
  { name:"부산외국어대학교", agency:"JINHAK", mode:"grouped", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10750521.html" },
  { name:"신라대학교", agency:"JINHAK", mode:"grouped", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio11020621.html" },
  { name:"고신대학교", agency:"UWAY", mode:"pending", url:"https://ratio.uwayapply.com/Sl5KVyUmYTlKZiUmOiZKN2ZUZg==" },
  { name:"부산가톨릭대학교", agency:"JINHAK", mode:"admission", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10730551.html" },
  { name:"부산대학교", agency:"JINHAK", mode:"admission", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio12100661.html" },
  { name:"부경대학교", agency:"JINHAK", mode:"admission", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10720401.html" },
  { name:"한국해양대학교", agency:"UWAY", mode:"admission", url:"https://ratio.uwayapply.com/Sl5KOmFNOUpmJSY6Jko3ZlRm", rules:{
    "일반전형":"내","교과성적우수자전형":"내","지역인재전형":"내","아치해양인재전형Ⅰ_일반":"내","아치해양인재전형Ⅱ_사회적배려대상자":"내","체육특기자전형":"내","농ㆍ어촌학생 특별전형":"외","특성화고교졸업자 특별전형":"외","기회균형선발 특별전형":"외","특수교육대상자전형":"외","특성화고 등을 졸업한 재직자 특별전형":"외"
  }},
  { name:"울산대학교", agency:"UWAY", mode:"pending", url:"https://ratio.uwayapply.com/Sl5KVzgmQzpKZiUmOiZKN2ZUZg==", rules:{
    "일반교과전형":"내","지역교과 특별전형":"내","학교장추천 특별전형":"내","기회균형 특별전형":"내","지역의사제 특별전형(창원권)":"내","지역의사제 특별전형(진주권)":"내","지역의사제 특별전형(통영권)":"내","지역의사제 특별전형(김해권)":"내","지역의사제 특별전형(거창권)":"내","잠재역량 특별전형":"내","지역인재 특별전형":"내","지역인재(기초생활/차상위) 특별전형":"내","예체능 전형":"내","특기자 특별전형":"내","경기실적 우수자 특별전형":"내"
  }},
  { name:"경남대학교", agency:"JINHAK", mode:"grouped", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10130591.html" },
  { name:"인제대학교", agency:"UWAY", mode:"grouped", url:"https://ratio.uwayapply.com/Sl5KYC9XJUpmJSY6Jko3ZlRm" },
  { name:"영산대학교", agency:"JINHAK", mode:"grouped", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio30100311.html" },
  { name:"경상국립대학교", agency:"JINHAK", mode:"grouped", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10171011.html" },
  { name:"창원대학교", agency:"JINHAK", mode:"grouped", url:"https://addon.jinhakapply.com/RatioV1/RatioH/Ratio11350621.html" }
];

const FETCH_HEADERS={
  "User-Agent":"Mozilla/5.0 (compatible; AdmissionsRatio2027-Test/3.0)",
  "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language":"ko-KR,ko;q=0.9,en;q=0.7"
};
const EXCLUDE_RE=/재외국민/i;

function decodeEntities(s){return String(s||"").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));}
function text(s){return decodeEntities(String(s||"").replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi," ").replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim();}
function norm(s){return text(s).replace(/\s+/g,"");}
function plainNumber(s){const v=String(s??"").replace(/,/g,"").trim();return /^\d+$/.test(v)&&Number.isSafeInteger(+v)?+v:null;}
function same(a,b){return !!a&&!!b&&a.quota===b.quota&&a.apply===b.apply;}
function add(rows){return {quota:rows.reduce((s,r)=>s+(Number(r.quota)||0),0),apply:rows.reduce((s,r)=>s+(Number(r.apply)||0),0)};}
function sub(a,b){return {quota:(a?.quota||0)-(b?.quota||0),apply:(a?.apply||0)-(b?.apply||0)};}
function withRate(v){return v?{...v,rate:v.quota>0?+(v.apply/v.quota).toFixed(2):null}:null;}
function uniq(a){return [...new Set(a.filter(Boolean))];}
function extractTitle(html){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?text(m[1]).slice(0,140):"";}
function scopeFromLabel(label){const s=norm(label).replace(/[()（）\[\]【】]/g,"");if(/정원외/.test(s))return "외";if(/정원내/.test(s))return "내";return null;}

async function fetchDecoded(target){
  const started=Date.now();
  const response=await fetch(target.url,{method:"GET",redirect:"follow",headers:FETCH_HEADERS});
  const contentType=response.headers.get("content-type")||"";
  const cm=contentType.match(/charset\s*=\s*([^;\s]+)/i);let charset=(cm?.[1]||"utf-8").replace(/["']/g,"").toLowerCase();
  if(/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(charset))charset="euc-kr";
  const buffer=await response.arrayBuffer();let html,decodedWith=charset;
  try{html=new TextDecoder(charset).decode(buffer);}catch{decodedWith="utf-8";html=new TextDecoder("utf-8").decode(buffer);}
  return {response,html,contentType,decodedWith,elapsedMs:Date.now()-started};
}

function grid(table){
  const out=[];let ri=0;
  for(const tr of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    if(!out[ri])out[ri]=[];let ci=0;
    for(const c of tr[1].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)){
      while(out[ri][ci]!==undefined)ci++;
      const rs=Math.min(300,+(c[2].match(/rowspan\s*=\s*["']?(\d+)/i)?.[1]||1));
      const cs=Math.min(30,+(c[2].match(/colspan\s*=\s*["']?(\d+)/i)?.[1]||1));
      const value=text(c[3]);
      for(let r=0;r<rs;r++){if(!out[ri+r])out[ri+r]=[];for(let k=0;k<cs;k++)out[ri+r][ci+k]=value;}
      ci+=cs;
    }
    ri++;
  }
  return out;
}

function cleanTopTables(html){
  let clean=html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,"");
  let depth=0;
  clean=clean.replace(/<\/?(?:table|tr|td|th)\b[^>]*>/gi,tag=>{
    const end=/^<\//.test(tag),isTable=/^<\/?table\b/i.test(tag);
    if(isTable){if(end){const old=depth;depth=Math.max(0,depth-1);return old>1?" ":tag;}depth++;return depth>1?" ":tag;}
    return depth>1?" ":tag;
  });
  return clean;
}

function parseTables(html){
  const clean=cleanTopTables(html),parsed=[];let index=0;
  for(const m of clean.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
    const g=grid(m[0]);
    const h=g.findIndex(r=>r.some(c=>/모집인원|모집 인원/.test(text(c)))&&r.some(c=>/지원인원|지원 인원/.test(text(c))));
    if(h<0){index++;continue;}
    const q=g[h].findIndex(c=>/모집인원|모집 인원/.test(text(c))),a=g[h].findIndex(c=>/지원인원|지원 인원/.test(text(c)));
    if(q<0||a<0){index++;continue;}
    const labels=g[h].slice(0,q).join(" ");
    const records=[];
    for(const row of g.slice(h+1)){
      if(!row?.length)continue;
      const qv=plainNumber(row[q]),av=plainNumber(row[a]);
      const parts=[...new Set(row.slice(0,q).filter(Boolean))];
      const label=parts.join(" "),compact=norm(label);
      if(!compact)continue;
      if(qv===null||av===null){if(/모집인원|지원인원|경쟁률/.test(compact))continue;continue;}
      const summary=/소계|총계|합계|전체/.test(compact);
      const scope=scopeFromLabel(label);
      records.push({label,quota:qv,apply:av,summary,scope,parts});
    }
    if(records.length){
      const caption=text((m[0].match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)||[])[1]||"");
      const near=text(clean.slice(Math.max(0,m.index-500),m.index));
      const isAdmission=/전형/.test(labels)||/전형별|전형명/.test(caption+" "+near)||records.some(r=>/전형/.test(r.label));
      parsed.push({index,records,isAdmission,labels:text(labels),caption,near:near.slice(-160)});
    }
    index++;
  }
  return parsed;
}

function totalCandidates(tables){
  const out=[];
  for(const t of tables)for(const r of t.records){
    if(r.summary&&!r.scope&&/총계|합계|전체/.test(norm(r.label)))out.push({...r,tableIndex:t.index});
  }
  return out.sort((a,b)=>b.quota-a.quota||b.apply-a.apply);
}
function scopedCandidates(tables,scope){
  const out=[];
  for(const t of tables)for(const r of t.records){if(r.scope===scope&&r.summary)out.push({...r,tableIndex:t.index});}
  return out.sort((a,b)=>b.quota-a.quota||b.apply-a.apply);
}
function chooseAdmissionTable(tables,total){
  const arr=tables.filter(t=>t.isAdmission).map(t=>{
    const rows=t.records.filter(r=>!r.summary&&!EXCLUDE_RE.test(r.label));
    const sum=rows.length?add(rows):null;
    const distance=sum&&total?Math.abs(sum.quota-total.quota)+Math.abs(sum.apply-total.apply):Number.MAX_SAFE_INTEGER;
    return {t,rows,sum,distance};
  });
  arr.sort((a,b)=>a.distance-b.distance||(b.sum?.quota||0)-(a.sum?.quota||0)||b.rows.length-a.rows.length);
  return arr[0]||null;
}

function parseUniversityHtml(html,u){
  const tables=parseTables(html),warnings=[];
  const totals=totalCandidates(tables),inners=scopedCandidates(tables,"내"),outers=scopedCandidates(tables,"외");
  let pageTotal=totals[0]?{quota:totals[0].quota,apply:totals[0].apply}:null;
  let inner=inners[0]?{quota:inners[0].quota,apply:inners[0].apply}:null;
  let outer=outers[0]?{quota:outers[0].quota,apply:outers[0].apply}:null;

  if(inner&&outer&&pageTotal&&!same(pageTotal,add([inner,outer])))warnings.push(`페이지 정원내+정원외 ${add([inner,outer]).quota}/${add([inner,outer]).apply}와 총계 ${pageTotal.quota}/${pageTotal.apply} 불일치`);

  const chosen=chooseAdmissionTable(tables,pageTotal);
  const rules=Object.fromEntries(Object.entries(u.rules||{}).map(([k,v])=>[norm(k),v]));
  const excluded=[],unknown=[];let detailRows=[],detailTotal=null;
  if(chosen){
    detailRows=chosen.t.records.filter(r=>!r.summary).map(r=>({...r}));
    for(const r of detailRows){
      if(EXCLUDE_RE.test(r.label)){excluded.push(`${r.label} [${r.quota}/${r.apply}]`);continue;}
      if(!r.scope)r.scope=r.parts.map(p=>rules[norm(p)]).find(Boolean)||rules[norm(r.label)]||scopeFromLabel(r.label)||null;
      if(!r.scope)unknown.push(r.label);
    }
    const kept=detailRows.filter(r=>!EXCLUDE_RE.test(r.label));
    detailTotal=kept.length?add(kept):null;
    if(!unknown.length&&kept.length){
      const inRows=kept.filter(r=>r.scope==="내"),outRows=kept.filter(r=>r.scope==="외");
      if(inRows.length)inner=add(inRows);
      if(outRows.length)outer=add(outRows);
    }
  }

  const excludedPairs=uniq(detailRows.filter(r=>EXCLUDE_RE.test(r.label)).map(r=>`${norm(r.label)}|${r.quota}|${r.apply}`)).map(s=>{const p=s.split("|");return {quota:+p[p.length-2],apply:+p[p.length-1]};});
  const excludedSum=excludedPairs.length?add(excludedPairs):null;
  let total=pageTotal;
  if(excludedSum&&pageTotal)total=sub(pageTotal,excludedSum);
  if(detailTotal&&pageTotal){
    const expected=excludedSum?sub(pageTotal,excludedSum):pageTotal;
    if(!same(detailTotal,expected))warnings.push(`선택 상세표 합계 ${detailTotal.quota}/${detailTotal.apply}와 기준 전체 ${expected.quota}/${expected.apply} 불일치`);
  }else if(!total&&detailTotal)total=detailTotal;

  if(!total&&inner&&outer)total=add([inner,outer]);
  if(!inner&&outer&&total)inner=sub(total,outer);
  if(!outer&&inner&&total)outer=sub(total,inner);
  if(inner&&(inner.quota<0||inner.apply<0||!total||inner.quota>total.quota||inner.apply>total.apply)){warnings.push("정원내 수치 범위 오류");inner=null;}
  if(outer&&(outer.quota<0||outer.apply<0)){warnings.push("정원외 수치 범위 오류");outer=null;}
  if(inner&&outer&&total&&!same(total,add([inner,outer])))warnings.push(`최종 정원내+정원외 ${add([inner,outer]).quota}/${add([inner,outer]).apply}와 전체 ${total.quota}/${total.apply} 불일치`);

  const diagnostics=tables.map(t=>({
    tableIndex:t.index,isAdmission:t.isAdmission,labels:t.labels,records:t.records.length,
    maxTotal:totalCandidates([t])[0]?`${totalCandidates([t])[0].quota}/${totalCandidates([t])[0].apply}`:"-",
    first:t.records.slice(0,5).map(r=>`${r.label}:${r.quota}/${r.apply}`)
  }));

  return {
    title:extractTitle(html),tablesFound:tables.length,selectedAdmissionTable:chosen?.t.index??null,
    inner:withRate(inner),outside:withRate(outer),total:withRate(total),
    excluded:uniq(excluded),unknown:uniq(unknown),warnings:uniq(warnings),diagnostics
  };
}

async function auditOne(u){
  const started=Date.now();
  try{
    const {response,html,contentType,decodedWith}=await fetchDecoded(u);
    const p=parseUniversityHtml(html,u);
    const accessOk=response.ok&&html.length>0,totalOk=p.total?.quota>0&&Number.isFinite(p.total?.apply),innerOk=p.inner?.quota>0&&Number.isFinite(p.inner?.apply);
    let level;
    if(!accessOk)level="접속실패";
    else if(!totalOk)level="구조확인";
    else if(p.warnings.length)level="검증필요";
    else if(!innerOk||p.unknown.length)level="정원내 분류필요";
    else level="정상";
    return {...p,name:u.name,agency:u.agency,mode:u.mode,level,httpStatus:response.status,decodedWith,contentType,elapsedMs:Date.now()-started,url:u.url};
  }catch(error){return {name:u.name,agency:u.agency,mode:u.mode,level:"접속실패",error:error instanceof Error?error.message:String(error),elapsedMs:Date.now()-started,url:u.url};}
}

async function auditAll(){
  const results=[];
  for(let i=0;i<UNIVERSITIES.length;i+=6)results.push(...await Promise.all(UNIVERSITIES.slice(i,i+6).map(auditOne)));
  const count=l=>results.filter(x=>x.level===l).length;
  return {checkedAt:new Date().toISOString(),summary:{universities:results.length,ok:count("정상"),needRules:count("정원내 분류필요"),needVerify:count("검증필요"),needStructure:count("구조확인"),failed:count("접속실패"),excludedUniversities:results.filter(x=>x.excluded?.length).length},results};
}

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function pairText(p){return p?`${Number(p.quota).toLocaleString("ko-KR")} / ${Number(p.apply).toLocaleString("ko-KR")}`:"-";}
function auditHtml(data){
  const rows=data.results.map((r,i)=>`<tr><td>${i+1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.agency)}</td><td>${esc(r.level)}</td><td>${pairText(r.inner)}</td><td>${pairText(r.total)}</td><td>${r.excluded?.length?esc(r.excluded.join(" · ")):"-"}</td><td>${r.unknown?.length?esc(r.unknown.slice(0,10).join(" · ")):"-"}</td><td>${r.warnings?.length?esc(r.warnings.join(" / ")):"-"}</td><td>${r.selectedAdmissionTable??"-"}</td></tr>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>18개 대학 3차 파싱 점검</title><style>body{font-family:Arial,'Malgun Gothic',sans-serif;margin:22px;color:#222}h1{font-size:21px}.summary{padding:12px;background:#f4f7f9;border:1px solid #dce3e8;line-height:1.8;margin:10px 0}.note{font-size:12px;color:#5f6b74;margin:8px 0 14px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d8dee3;padding:6px;text-align:center;vertical-align:top}th{background:#eef2f5;position:sticky;top:0}td:nth-child(2),td:nth-child(7),td:nth-child(8),td:nth-child(9){text-align:left}</style></head><body><h1>2027 부·울·경 18개 대학 Cloudflare 3차 파싱 점검</h1><div class="summary">전체 ${data.summary.universities}교 · <b>정상 ${data.summary.ok}교</b> · 정원내 분류필요 ${data.summary.needRules}교 · 검증필요 ${data.summary.needVerify}교 · 구조확인 ${data.summary.needStructure}교 · 접속실패 ${data.summary.failed}교 · 재외국민 제외 감지 ${data.summary.excludedUniversities}교</div><div class="note">3차에서는 대학 전체 총계를 여러 표 중 가장 큰 총계로 잡고, 전형 상세표는 전체 총계와 가장 가까운 표를 선택합니다. 정원(내)/정원(외) 표기도 자동 인식합니다. 숫자가 나오더라도 합계 검증에 실패하면 '정상'으로 처리하지 않습니다.</div><table><thead><tr><th>#</th><th>대학</th><th>업체</th><th>3차 판정</th><th>정원내 모집/지원</th><th>전체 모집/지원</th><th>재외국민 제외</th><th>미분류 전형</th><th>검증메시지</th><th>선택표</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export default {
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==="/health")return Response.json({ok:true,service:"admissions-ratio-2027",stage:"robust-parser-v3",universities:18});
    if(url.pathname==="/audit/v3"||url.pathname==="/audit/all")return new Response(auditHtml(await auditAll()),{headers:{"content-type":"text/html; charset=UTF-8","Cache-Control":"no-store"}});
    if(url.pathname==="/audit/v3.json")return Response.json(await auditAll(),{headers:{"Cache-Control":"no-store"}});
    if(url.pathname==="/audit/one"){
      const name=url.searchParams.get("name")||"";const u=UNIVERSITIES.find(x=>x.name===name);
      if(!u)return Response.json({ok:false,error:"대학명을 찾을 수 없습니다.",available:UNIVERSITIES.map(x=>x.name)},{status:400});
      return Response.json(await auditOne(u),{headers:{"Cache-Control":"no-store"}});
    }
    if(url.pathname==="/debug/unresolved"){
      const all=await auditAll();return Response.json(all.results.filter(x=>x.level!=="정상").map(x=>({name:x.name,level:x.level,total:x.total,inner:x.inner,unknown:x.unknown,warnings:x.warnings,diagnostics:x.diagnostics})),{headers:{"Cache-Control":"no-store"}});
    }
    return new Response("Admissions Ratio Worker OK\n\n3차 점검: /audit/v3",{headers:{"content-type":"text/plain; charset=UTF-8"}});
  }
};