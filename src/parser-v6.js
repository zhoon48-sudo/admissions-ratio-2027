import {
  auditAll as auditAllV5,
  auditOne as auditOneV5,
  UNIVERSITIES
} from './parser-v5.js';

const HEADERS={
  'User-Agent':'Mozilla/5.0 (compatible; AdmissionsRatio2027-Test/6.0)',
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

function sequentialRows(html){
  const rows=[];
  for(const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[];
    for(const c of tr[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi))cells.push(text(c[2]));
    if(cells.length)rows.push(cells);
  }
  return rows;
}

function lastPair(cells){
  const ints=cells.map((v,idx)=>({idx,value:num(v)})).filter(x=>x.value!==null);
  if(ints.length<2)return null;
  const q=ints[ints.length-2],a=ints[ints.length-1];
  return {quota:q.value,apply:a.value};
}

function findPair(rows,needle){
  const n=norm(needle);
  for(const cells of rows){
    if(!norm(cells.join(' ')).includes(n))continue;
    const p=lastPair(cells);
    if(p)return p;
  }
  return null;
}

function customResult(u,meta,inner,outer,excluded=[],missing=[],warnings=[]){
  const total=inner&&outer?add([inner,outer]):null;
  return {
    name:u.name,agency:u.agency,mode:u.mode,
    level:missing.length||warnings.length?'검증필요':'정상',
    parser:meta.parser,httpStatus:meta.response.status,
    title:pageTitle(meta.html),decodedWith:meta.decodedWith,contentType:meta.contentType,
    elapsedMs:meta.elapsedMs,url:u.url,
    inner:rated(inner),outside:rated(outer),total:rated(total),
    excluded,unknown:missing,warnings,
    diagnostics:[meta.diagnostics]
  };
}

async function parseDongmyung(u){
  const meta=await fetchHtml(u),rows=sequentialRows(meta.html);
  const warnings=[],missing=[];

  const inner=findPair(rows,'정원 내 소계')||findPair(rows,'정원내 소계');
  if(!inner)missing.push('정원내 소계');

  const outerNames=['특성화고동일계','농어촌학생','기회균형','만학도'];
  const outerRows=[];
  for(const name of outerNames){
    const p=findPair(rows,name);
    if(!p)missing.push(name);else outerRows.push({...p,name});
  }
  const outer=outerRows.length===outerNames.length?add(outerRows):null;

  if(inner&&inner.quota!==1424)warnings.push(`정원내 모집인원 ${inner.quota}명 ≠ 기준 1,424명`);
  if(outer&&outer.quota!==101)warnings.push(`정원외 모집인원 ${outer.quota}명 ≠ 기준 101명`);
  if(inner&&outer&&add([inner,outer]).quota!==1525)warnings.push('전체 모집인원 기준 1,525명과 불일치');

  return customResult(u,{
    ...meta,parser:'JINHAK_DONGMYUNG_V6',
    diagnostics:{innerSubtotal:inner,outerRows}
  },inner,outer,[],missing,warnings);
}

async function parseBufs(u){
  const meta=await fetchHtml(u),rows=sequentialRows(meta.html);
  const warnings=[],missing=[];

  const innerNames=[
    '일반고교과','교과면접','학생부서류','특성화고교과','기회균형','다문화',
    '영어능력우수자','일본어능력우수자','중국어능력우수자','체육경기실적우수자','체육실기우수자'
  ];
  const outerNames=[
    '[정원외]농어촌학생','[정원외]특성화고동일계','[정원외]기초생활수급자 및 차상위계층',
    '[정원외]특성화고 등을 졸업한 재직자','[정원외]만학도'
  ];

  const innerRows=[],outerRows=[];
  for(const name of innerNames){const p=findPair(rows,name);if(!p)missing.push(name);else innerRows.push({...p,name})}
  for(const name of outerNames){const p=findPair(rows,name);if(!p)missing.push(name);else outerRows.push({...p,name})}

  const inner=innerRows.length===innerNames.length?add(innerRows):null;
  const outer=outerRows.length===outerNames.length?add(outerRows):null;
  const re=findPair(rows,'[정원외]재외국민');
  const excluded=re?[`[정원외]재외국민 [${re.quota}/${re.apply}]`]:[];

  if(inner&&inner.quota!==1394)warnings.push(`정원내 모집인원 ${inner.quota}명 ≠ 기준 1,394명`);
  if(outer&&outer.quota!==160)warnings.push(`재외국민 제외 정원외 모집인원 ${outer.quota}명 ≠ 기준 160명`);
  if(inner&&outer&&add([inner,outer]).quota!==1554)warnings.push('재외국민 제외 전체 모집인원 기준 1,554명과 불일치');

  return customResult(u,{
    ...meta,parser:'JINHAK_BUFS_V6',
    diagnostics:{innerRows,outerRows,reexcluded:re}
  },inner,outer,excluded,missing,warnings);
}

export async function auditOne(u){
  if(u.name==='동명대학교')return parseDongmyung(u);
  if(u.name==='부산외국어대학교')return parseBufs(u);
  return auditOneV5(u);
}

export async function auditAll(){
  const base=await auditAllV5();
  const uDm=UNIVERSITIES.find(x=>x.name==='동명대학교');
  const uBu=UNIVERSITIES.find(x=>x.name==='부산외국어대학교');
  const [dm,bu]=await Promise.all([parseDongmyung(uDm),parseBufs(uBu)]);
  const results=base.results.map(r=>r.name==='동명대학교'?dm:r.name==='부산외국어대학교'?bu:r);
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
