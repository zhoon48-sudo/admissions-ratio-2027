import {
  auditAll as auditAllV6,
  auditOne as auditOneV6,
  UNIVERSITIES
} from './parser-v6.js';

const HEADERS={
  'User-Agent':'Mozilla/5.0 (compatible; AdmissionsRatio2027-Test/7.0)',
  'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.7'
};

const decode=s=>String(s||'')
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
  .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
const text=s=>decode(String(s||'')
  .replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi,' ')
  .replace(/<br\s*\/?\s*>/gi,' ')
  .replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const norm=s=>text(s).replace(/\s+/g,'');
const num=s=>{const v=String(s??'').replace(/,/g,'').trim();return /^\d+$/.test(v)?+v:null};
const add=rows=>({quota:rows.reduce((s,r)=>s+(+r.quota||0),0),apply:rows.reduce((s,r)=>s+(+r.apply||0),0)});
const rated=v=>v?{...v,rate:v.quota>0?+(v.apply/v.quota).toFixed(2):null}:null;
const pageTitle=html=>text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').slice(0,140);

async function fetchHtml(u){
  const started=Date.now();
  const response=await fetch(u.url,{redirect:'follow',headers:HEADERS});
  const ct=response.headers.get('content-type')||'';
  let charset=(ct.match(/charset\s*=\s*([^;\s]+)/i)?.[1]||'utf-8').replace(/["']/g,'').toLowerCase();
  if(/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(charset))charset='euc-kr';
  const buf=await response.arrayBuffer();let html,decodedWith=charset;
  try{html=new TextDecoder(charset).decode(buf)}catch{decodedWith='utf-8';html=new TextDecoder('utf-8').decode(buf)}
  return {response,html,contentType:ct,decodedWith,elapsedMs:Date.now()-started};
}

function lastPairFromRowHtml(rowHtml){
  const cells=[];
  for(const c of rowHtml.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi))cells.push(text(c[2]));
  const ints=cells.map((v,idx)=>({idx,value:num(v)})).filter(x=>x.value!==null);
  if(ints.length<2)return null;
  const q=ints[ints.length-2],a=ints[ints.length-1];
  return {quota:q.value,apply:a.value};
}

function headingBlocks(html){
  const heads=[];
  for(const m of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)){
    heads.push({index:m.index,title:text(m[2])});
  }
  return heads.map((h,i)=>({
    ...h,
    end:i+1<heads.length?heads[i+1].index:html.length,
    html:html.slice(h.index,i+1<heads.length?heads[i+1].index:html.length)
  }));
}

function sectionTotal(html,heading){
  const target=norm(heading);
  const block=headingBlocks(html).find(b=>norm(b.title).includes(target));
  if(!block)return null;
  let found=null;
  for(const tr of block.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    if(!/총계/.test(norm(text(tr[1]))))continue;
    const p=lastPairFromRowHtml(tr[0]);
    if(p)found=p;
  }
  return found;
}

async function parseDongmyungV7(u){
  const meta=await fetchHtml(u);
  const innerNames=['면접','일반고교과','특성화고교과','스포츠우수자','지역인재','평생학습자Ⅰ','평생학습자Ⅱ','창의인재','실기','실적우수자'];
  const outerNames=['특성화고동일계','농어촌학생','기회균형','만학도'];
  const missing=[],warnings=[],innerRows=[],outerRows=[];

  for(const name of innerNames){
    const p=sectionTotal(meta.html,`${name} 경쟁률 현황`);
    if(!p)missing.push(`정원내:${name}`);else innerRows.push({...p,name});
  }
  for(const name of outerNames){
    const p=sectionTotal(meta.html,`${name} 경쟁률 현황`);
    if(!p)missing.push(`정원외:${name}`);else outerRows.push({...p,name});
  }

  const inner=innerRows.length===innerNames.length?add(innerRows):null;
  const outer=outerRows.length===outerNames.length?add(outerRows):null;
  const total=inner&&outer?add([inner,outer]):null;

  if(inner&&inner.quota!==1424)warnings.push(`정원내 모집인원 ${inner.quota}명 ≠ 기준 1,424명`);
  if(outer&&outer.quota!==101)warnings.push(`정원외 모집인원 ${outer.quota}명 ≠ 기준 101명`);
  if(total&&total.quota!==1525)warnings.push(`전체 모집인원 ${total.quota}명 ≠ 기준 1,525명`);

  return {
    name:u.name,agency:u.agency,mode:u.mode,
    level:missing.length?'검증필요':warnings.length?'검증필요':'정상',
    parser:'JINHAK_DONGMYUNG_V7',httpStatus:meta.response.status,
    title:pageTitle(meta.html),decodedWith:meta.decodedWith,contentType:meta.contentType,
    elapsedMs:meta.elapsedMs,url:u.url,
    inner:rated(inner),outside:rated(outer),total:rated(total),
    excluded:[],unknown:missing,warnings,
    diagnostics:[{innerRows,outerRows}]
  };
}

export async function auditOne(u){
  if(u.name==='동명대학교')return parseDongmyungV7(u);
  return auditOneV6(u);
}

export async function auditAll(){
  const base=await auditAllV6();
  const u=UNIVERSITIES.find(x=>x.name==='동명대학교');
  const dm=await parseDongmyungV7(u);
  const results=base.results.map(r=>r.name==='동명대학교'?dm:r);
  const count=x=>results.filter(r=>r.level===x).length;
  return {
    checkedAt:new Date().toISOString(),
    summary:{
      universities:results.length,ok:count('정상'),needRules:count('정원내 분류필요'),
      needVerify:count('검증필요'),needStructure:count('구조확인'),failed:count('접속실패'),
      excludedUniversities:results.filter(r=>r.excluded?.length).length
    },
    results
  };
}

export { UNIVERSITIES };
