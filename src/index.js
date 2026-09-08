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
  "User-Agent":"Mozilla/5.0 (compatible; AdmissionsRatio2027-Test/2.0)",
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
function withRate(v){return v?{...v,rate:v.quota>0?+(v.apply/v.quota).toFixed(2):null}:null;}
function uniq(a){return [...new Set(a.filter(Boolean))];}
function extractTitle(html){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?text(m[1]).slice(0,140):"";}

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

// rowspan/colspan을 실제 칸처럼 펼쳐서 '정원내/외'가 행마다 반복되게 만듭니다.
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
  const clean=cleanTopTables(html),parsed=[];
  for(const m of clean.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
    const g=grid(m[0]);
    const h=g.findIndex(r=>r.some(c=>/모집인원/.test(norm(c)))&&r.some(c=>/지원인원/.test(norm(c))));
    if(h<0)continue;
    const q=g[h].findIndex(c=>/모집인원/.test(norm(c))),a=g[h].findIndex(c=>/지원인원/.test(norm(c)));
    if(q<0||a<0)continue;
    const labels=g[h].slice(0,q).join(" ");
    if(/모집단위|학과|계열/.test(labels)&&!/전형명|전형/.test(labels))continue;
    const records=[];
    for(const row of g.slice(h+1)){
      if(!row?.length)continue;
      const qv=plainNumber(row[q]),av=plainNumber(row[a]);
      const parts=[...new Set(row.slice(0,q).filter(Boolean))];
      const label=parts.join(" "),compact=norm(label);
      if(!compact)continue;
      if(qv===null||av===null){if(/모집인원|지원인원|경쟁률/.test(compact))continue;continue;}
      const summary=/소계|총계|합계|전체/.test(compact);
      const scope=/정원외/.test(compact)?"외":/정원내/.test(compact)?"내":null;
      records.push({label,quota:qv,apply:av,summary,scope,parts});
    }
    if(records.length){
      const caption=text((m[0].match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)||[])[1]||"");
      const near=text(clean.slice(Math.max(0,m.index-500),m.index));
      const isAdmission=/전형/.test(labels)||/전형별|전형명/.test(caption+" "+near);
      parsed.push({records,isAdmission,labels,score:records.filter(r=>!r.summary).length});
    }
  }
  return parsed;
}

function parseUniversityHtml(html,u){
  const tables=parseTables(html);
  const admissions=tables.filter(t=>t.isAdmission).sort((a,b)=>b.score-a.score);
  const overviews=tables.filter(t=>!t.isAdmission).sort((a,b)=>{
    const score=t=>t.records.filter(r=>r.summary||r.scope).length;
    return score(b)-score(a);
  });
  const admission=admissions[0]||null,overview=overviews[0]||null;
  let total=null,inner=null,outer=null;const warnings=[];
  function take(current,value,label){
    if(!current)return {quota:value.quota,apply:value.apply};
    if(!same(current,value))warnings.push(`${label} 합계 후보 불일치 ${current.quota}/${current.apply} vs ${value.quota}/${value.apply}`);
    return current;
  }
  for(const t of [overview,admission].filter(Boolean))for(const r of t.records){
    if(r.summary||(!t.isAdmission&&r.scope)){
      if(r.scope==="내")inner=take(inner,r,"정원내");
      else if(r.scope==="외")outer=take(outer,r,"정원외");
      else if(/총계|합계|전체/.test(norm(r.label)))total=take(total,r,"전체");
    }
  }

  const excluded=[],unknown=[];let detailRows=[];
  if(admission){
    const rules=Object.fromEntries(Object.entries(u.rules||{}).map(([k,v])=>[norm(k),v]));
    detailRows=admission.records.filter(r=>!r.summary).map(r=>({...r}));
    const kept=[];
    for(const r of detailRows){
      if(EXCLUDE_RE.test(r.label)){excluded.push(r.label);continue;}
      if(!r.scope)r.scope=r.parts.map(p=>rules[norm(p)]).find(Boolean)||rules[norm(r.label)]||null;
      if(!r.scope)unknown.push(r.label);
      kept.push(r);
    }
    detailRows=kept;
    if(detailRows.length){
      const detailTotal=add(detailRows);
      if(excluded.length){
        // 재외국민이 같은 표에 있으면 원본 총계 대신 제외 후 상세행 합계를 사용합니다.
        total=detailTotal;
      }else if(!total)total=detailTotal;
      else if(!same(total,detailTotal))warnings.push(`상세행 합계 ${detailTotal.quota}/${detailTotal.apply}와 페이지 전체 ${total.quota}/${total.apply} 불일치`);

      if(!unknown.length){
        const inRows=detailRows.filter(r=>r.scope==="내"),outRows=detailRows.filter(r=>r.scope==="외");
        if(inRows.length)inner=add(inRows);
        if(outRows.length)outer=add(outRows);
      }
    }
  }

  if(!total&&inner&&outer)total=add([inner,outer]);
  if(!inner&&outer&&total)inner={quota:total.quota-outer.quota,apply:total.apply-outer.apply};
  if(!outer&&inner&&total)outer={quota:total.quota-inner.quota,apply:total.apply-inner.apply};
  if(inner&&(inner.quota<0||inner.apply<0||!total||inner.quota>total.quota||inner.apply>total.apply)){warnings.push("정원내 수치 범위 오류");inner=null;}
  if(outer&&(outer.quota<0||outer.apply<0)){warnings.push("정원외 수치 범위 오류");outer=null;}
  if(inner&&outer&&total&&!same(total,add([inner,outer])))warnings.push("정원내+정원외 합계 불일치");

  return {
    title:extractTitle(html),
    tablesFound:tables.length,
    admissionRows:detailRows.length,
    inner:withRate(inner),outside:withRate(outer),total:withRate(total),
    excluded:uniq(excluded),unknown:uniq(unknown),warnings:uniq(warnings)
  };
}

async function auditOne(u){
  const started=Date.now();
  try{
    const {response,html,contentType,decodedWith}=await fetchDecoded(u);
    const p=parseUniversityHtml(html,u);
    const accessOk=response.ok&&html.length>0,totalOk=p.total?.quota>0&&Number.isFinite(p.total?.apply),innerOk=p.inner?.quota>0&&Number.isFinite(p.inner?.apply);
    let level=!accessOk?"접속실패":innerOk&&totalOk?"정원내+전체 추출":totalOk?"정원내 분류필요":"접속만 성공";
    return {...p,name:u.name,agency:u.agency,mode:u.mode,level,httpStatus:response.status,decodedWith,contentType,elapsedMs:Date.now()-started,url:u.url};
  }catch(error){return {name:u.name,agency:u.agency,mode:u.mode,level:"접속실패",error:error instanceof Error?error.message:String(error),elapsedMs:Date.now()-started,url:u.url};}
}

async function auditAll(){
  const results=[];
  for(let i=0;i<UNIVERSITIES.length;i+=6)results.push(...await Promise.all(UNIVERSITIES.slice(i,i+6).map(auditOne)));
  const count=l=>results.filter(x=>x.level===l).length;
  return {checkedAt:new Date().toISOString(),summary:{universities:results.length,full:count("정원내+전체 추출"),needRules:count("정원내 분류필요"),accessOnly:count("접속만 성공"),failed:count("접속실패"),excludedUniversities:results.filter(x=>x.excluded?.length).length},results};
}

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function pairText(p){return p?`${Number(p.quota).toLocaleString("ko-KR")} / ${Number(p.apply).toLocaleString("ko-KR")}`:"-";}
function auditHtml(data){
  const rows=data.results.map((r,i)=>`<tr><td>${i+1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.agency)}</td><td>${esc(r.mode)}</td><td>${esc(r.level)}</td><td>${pairText(r.inner)}</td><td>${pairText(r.total)}</td><td>${r.excluded?.length?esc(r.excluded.join(" · ")):"-"}</td><td>${r.unknown?.length?esc(r.unknown.slice(0,8).join(" · ")):"-"}</td><td>${r.warnings?.length?esc(r.warnings.join(" / ")):"-"}</td></tr>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>18개 대학 2차 파싱 점검</title><style>body{font-family:Arial,'Malgun Gothic',sans-serif;margin:22px;color:#222}h1{font-size:21px}.summary{padding:12px;background:#f4f7f9;border:1px solid #dce3e8;line-height:1.8;margin:10px 0}.note{font-size:12px;color:#5f6b74;margin:8px 0 14px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d8dee3;padding:6px;text-align:center;vertical-align:top}th{background:#eef2f5;position:sticky;top:0}td:nth-child(2),td:nth-child(8),td:nth-child(9),td:nth-child(10){text-align:left}.ok{font-weight:700}</style></head><body><h1>2027 부·울·경 18개 대학 Cloudflare 2차 파싱 점검</h1><div class="summary">전체 ${data.summary.universities}교 · <b>정원내+전체 추출 ${data.summary.full}교</b> · 정원내 분류필요 ${data.summary.needRules}교 · 접속만 성공 ${data.summary.accessOnly}교 · 접속실패 ${data.summary.failed}교 · 재외국민 제외 감지 ${data.summary.excludedUniversities}교</div><div class="note">2차 점검은 병합셀(rowspan/colspan)을 펼쳐 읽고, 페이지에 표시된 정원내·정원외 구분을 우선 사용합니다. 재외국민 전형 행은 상세 합계에서 제외합니다. '미분류 전형'이 남은 대학만 다음 단계에서 전형별 정원내/외 분류표를 추가하면 됩니다.</div><table><thead><tr><th>#</th><th>대학</th><th>업체</th><th>방식</th><th>2차 판정</th><th>정원내 모집/지원</th><th>전체 모집/지원</th><th>재외국민 제외행</th><th>미분류 전형(최대 8개)</th><th>검증메시지</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export default {
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==="/health")return Response.json({ok:true,service:"admissions-ratio-2027",stage:"robust-parser-v2",universities:18});
    if(url.pathname==="/audit/v2"||url.pathname==="/audit/all")return new Response(auditHtml(await auditAll()),{headers:{"content-type":"text/html; charset=UTF-8","Cache-Control":"no-store"}});
    if(url.pathname==="/audit/v2.json")return Response.json(await auditAll(),{headers:{"Cache-Control":"no-store"}});
    if(url.pathname==="/audit/one"){
      const name=url.searchParams.get("name")||"";const u=UNIVERSITIES.find(x=>x.name===name);
      if(!u)return Response.json({ok:false,error:"대학명을 찾을 수 없습니다.",available:UNIVERSITIES.map(x=>x.name)},{status:400});
      return Response.json(await auditOne(u),{headers:{"Cache-Control":"no-store"}});
    }
    return new Response("Admissions Ratio Worker OK\n\n2차 점검: /audit/v2",{headers:{"content-type":"text/plain; charset=UTF-8"}});
  }
};
