import { UNIVERSITIES } from './config-v4.js';

const HEADERS={
  'User-Agent':'Mozilla/5.0 (compatible; AdmissionsRatio2027-Test/4.0)',
  'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.7'
};
const EXCLUDE_RE=/재외국민/i;

const decode=s=>String(s||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
const text=s=>decode(String(s||'').replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi,' ').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const norm=s=>text(s).replace(/\s+/g,'');
const num=s=>{const v=String(s??'').replace(/,/g,'').trim();return /^\d+$/.test(v)&&Number.isSafeInteger(+v)?+v:null};
const add=rows=>({quota:rows.reduce((s,r)=>s+(+r.quota||0),0),apply:rows.reduce((s,r)=>s+(+r.apply||0),0)});
const sub=(a,b)=>({quota:(a?.quota||0)-(b?.quota||0),apply:(a?.apply||0)-(b?.apply||0)});
const same=(a,b)=>!!a&&!!b&&a.quota===b.quota&&a.apply===b.apply;
const rated=v=>v?{...v,rate:v.quota>0?+(v.apply/v.quota).toFixed(2):null}:null;
const uniq=a=>[...new Set(a.filter(Boolean))];
const title=html=>text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').slice(0,140);
function scope(label){const s=norm(label).replace(/[()（）\[\]【】]/g,'');if(s.includes('정원외'))return '외';if(s.includes('정원내'))return '내';return null}
function onlyScope(label){return norm(label).replace(/[()（）\[\]【】]/g,'').replace(/정원내|정원외/g,'')==='' }
function rule(u,label,parts=[]){const nl=norm(label);for(const [k,v] of Object.entries(u.rules||{})){const nk=norm(k);if(nl===nk||nl.includes(nk)||parts.some(p=>norm(p)===nk||norm(p).includes(nk)))return v}return null}

async function fetchHtml(u){
  const response=await fetch(u.url,{redirect:'follow',headers:HEADERS});
  const ct=response.headers.get('content-type')||'';
  let charset=(ct.match(/charset\s*=\s*([^;\s]+)/i)?.[1]||'utf-8').replace(/["']/g,'').toLowerCase();
  if(/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(charset))charset='euc-kr';
  const buf=await response.arrayBuffer();let html,decodedWith=charset;
  try{html=new TextDecoder(charset).decode(buf)}catch{decodedWith='utf-8';html=new TextDecoder('utf-8').decode(buf)}
  return {response,html,contentType:ct,decodedWith};
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
      for(let r=0;r<rs;r++){if(!out[ri+r])out[ri+r]=[];for(let k=0;k<cs;k++)out[ri+r][ci+k]=value}
      ci+=cs;
    }
    ri++;
  }
  return out;
}

function rawTables(html){
  const clean=html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,'');
  const out=[];let index=0;
  for(const m of clean.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
    const g=grid(m[0]);
    const h=g.findIndex(r=>r.some(c=>/모집인원|총모집인원|모집 인원/.test(text(c)))&&r.some(c=>/지원인원|지원 인원/.test(text(c))));
    if(h<0){index++;continue}
    const q=g[h].findIndex(c=>/모집인원|총모집인원|모집 인원/.test(text(c)));
    const a=g[h].findIndex(c=>/지원인원|지원 인원/.test(text(c)));
    if(q<0||a<0){index++;continue}
    const header=g[h].slice(0,q).map(text).filter(Boolean),rows=[];
    for(const row of g.slice(h+1)){
      const qv=num(row[q]),av=num(row[a]);if(qv===null||av===null)continue;
      const parts=[...new Set(row.slice(0,q).map(text).filter(Boolean))],label=parts.join(' ');if(!label)continue;
      const sc=scope(label),compact=norm(label);
      const summary=/소계|총계|합계|전체/.test(compact)||(sc&&onlyScope(label));
      rows.push({label,quota:qv,apply:av,scope:sc,summary,parts});
    }
    out.push({index,header,rows,near:text(clean.slice(Math.max(0,m.index-450),m.index)).slice(-300)});index++;
  }
  return out;
}

function overviewTable(html){
  return rawTables(html).find(t=>{const h=norm(t.header.join(' '));return /전형명|전형/.test(h)&&!/모집단위|학과|대학/.test(h)&&t.rows.some(r=>!r.summary)})||null;
}
function mixedOuter(html,cfg){
  const ts=rawTables(html),a=norm(cfg.admission),unit=norm(cfg.unit);
  for(const t of ts.filter(t=>norm(t.near).includes(a))){const r=t.rows.find(x=>!x.summary&&norm(x.label).includes(unit));if(r)return {quota:r.quota,apply:r.apply}}
  return null;
}

function parseJinhak(html,u){
  const t=overviewTable(html);if(!t)return null;
  const warnings=[],excluded=[],unknown=[],classified=[];
  let pageTotal=null;
  for(const r of t.rows)if(r.summary&&!r.scope&&/총계|합계|전체/.test(norm(r.label))&&(!pageTotal||r.quota>pageTotal.quota))pageTotal={quota:r.quota,apply:r.apply};
  const details=t.rows.filter(r=>!r.summary),hasOuter=details.some(r=>r.scope==='외');
  for(const r of details){
    if(EXCLUDE_RE.test(r.label)){excluded.push(`${r.label} [${r.quota}/${r.apply}]`);continue}
    let sc=r.scope||rule(u,r.label,r.parts);if(!sc&&hasOuter)sc='내';
    if(sc==='혼합'){
      const cfg=(u.mixedOuterUnits||[]).find(x=>norm(r.label).includes(norm(x.admission)));
      const o=cfg?mixedOuter(html,cfg):null;
      if(!o||o.quota>r.quota||o.apply>r.apply){unknown.push(`${r.label}(혼합분리실패)`);continue}
      classified.push({quota:r.quota-o.quota,apply:r.apply-o.apply,scope:'내',label:r.label});
      classified.push({quota:o.quota,apply:o.apply,scope:'외',label:r.label});continue;
    }
    if(!sc){unknown.push(r.label);continue}
    classified.push({...r,scope:sc});
  }
  const excludedRows=details.filter(r=>EXCLUDE_RE.test(r.label)),excludedSum=excludedRows.length?add(excludedRows):null;
  let total=pageTotal?{...pageTotal}:null;if(total&&excludedSum)total=sub(total,excludedSum);if(!total)total=add(details.filter(r=>!EXCLUDE_RE.test(r.label)));
  let inner=null,outer=null;
  if(!unknown.length&&classified.length){inner=add(classified.filter(r=>r.scope==='내'));outer=add(classified.filter(r=>r.scope==='외'));const c=add(classified);if(!same(c,total))warnings.push(`상단 전형합계 ${c.quota}/${c.apply}와 전체 ${total.quota}/${total.apply} 불일치`)}
  if(inner&&u.expectedInnerQuota!=null&&inner.quota!==u.expectedInnerQuota)warnings.push(`정원내 모집인원 ${inner.quota}명 ≠ 요강 기준 ${u.expectedInnerQuota}명`);
  if(inner&&outer&&!same(add([inner,outer]),total))warnings.push('정원내+정원외 합계 불일치');
  return {title:title(html),parser:'JINHAK_TOP',selectedTable:t.index,inner:rated(inner),outside:rated(outer),total:rated(total),excluded:uniq(excluded),unknown:uniq(unknown),warnings:uniq(warnings),diagnostics:[{table:t.index,header:t.header,first:t.rows.slice(0,10)}]};
}

/* Uway 페이지용: 기존처럼 페이지 전체의 정원내/정원외/총계를 우선 사용 */
function parseUway(html,u){
  const ts=rawTables(html),warnings=[],excluded=[],unknown=[];
  const all=ts.flatMap(t=>t.rows.map(r=>({...r,table:t.index})));
  const totals=all.filter(r=>r.summary&&!r.scope&&/총계|합계|전체/.test(norm(r.label))).sort((a,b)=>b.quota-a.quota||b.apply-a.apply);
  const ins=all.filter(r=>r.summary&&r.scope==='내').sort((a,b)=>b.quota-a.quota||b.apply-a.apply);
  const outs=all.filter(r=>r.summary&&r.scope==='외').sort((a,b)=>b.quota-a.quota||b.apply-a.apply);
  let total=totals[0]?{quota:totals[0].quota,apply:totals[0].apply}:null;
  let inner=ins[0]?{quota:ins[0].quota,apply:ins[0].apply}:null;
  let outer=outs[0]?{quota:outs[0].quota,apply:outs[0].apply}:null;
  if(!total&&inner&&outer)total=add([inner,outer]);
  if(!inner&&outer&&total)inner=sub(total,outer);if(!outer&&inner&&total)outer=sub(total,inner);
  if(!total){
    const top=ts.find(t=>/전형명|전형/.test(norm(t.header.join(' '))));
    if(top){const d=top.rows.filter(r=>!r.summary&&!EXCLUDE_RE.test(r.label));if(d.length)total=add(d)}
  }
  if(inner&&outer&&total&&!same(add([inner,outer]),total))warnings.push('정원내+정원외 합계 불일치');
  return {title:title(html),parser:'UWAY_SUMMARY',inner:rated(inner),outside:rated(outer),total:rated(total),excluded,unknown,warnings,diagnostics:ts.slice(0,5).map(t=>({table:t.index,header:t.header,first:t.rows.slice(0,5)}))};
}

export async function auditOne(u){
  const started=Date.now();
  try{
    const {response,html,contentType,decodedWith}=await fetchHtml(u);
    const p=u.agency==='JINHAK'?(parseJinhak(html,u)||parseUway(html,u)):parseUway(html,u);
    const accessOk=response.ok&&html.length>0,totalOk=p.total?.quota>0&&Number.isFinite(p.total?.apply),innerOk=p.inner?.quota>0&&Number.isFinite(p.inner?.apply);
    let level=!accessOk?'접속실패':!totalOk?'구조확인':p.warnings.length?'검증필요':(!innerOk||p.unknown.length)?'정원내 분류필요':'정상';
    return {...p,name:u.name,agency:u.agency,mode:u.mode,level,httpStatus:response.status,decodedWith,contentType,elapsedMs:Date.now()-started,url:u.url};
  }catch(e){return {name:u.name,agency:u.agency,mode:u.mode,level:'접속실패',error:e instanceof Error?e.message:String(e),elapsedMs:Date.now()-started,url:u.url}}
}

export async function auditAll(){
  const results=[];for(let i=0;i<UNIVERSITIES.length;i+=6)results.push(...await Promise.all(UNIVERSITIES.slice(i,i+6).map(auditOne)));
  const count=x=>results.filter(r=>r.level===x).length;
  return {checkedAt:new Date().toISOString(),summary:{universities:results.length,ok:count('정상'),needRules:count('정원내 분류필요'),needVerify:count('검증필요'),needStructure:count('구조확인'),failed:count('접속실패'),excludedUniversities:results.filter(r=>r.excluded?.length).length},results};
}

export { UNIVERSITIES };
