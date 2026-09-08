import { auditAll, auditOne, UNIVERSITIES } from './parser-v6.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pair=p=>p?`${Number(p.quota).toLocaleString('ko-KR')} / ${Number(p.apply).toLocaleString('ko-KR')}`:'-';

function page(data){
  const rows=data.results.map((r,i)=>`<tr><td>${i+1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.agency)}</td><td>${esc(r.parser||'-')}</td><td>${esc(r.level)}</td><td>${pair(r.inner)}</td><td>${pair(r.total)}</td><td>${r.excluded?.length?esc(r.excluded.join(' · ')):'-'}</td><td>${r.unknown?.length?esc(r.unknown.slice(0,10).join(' · ')):'-'}</td><td>${r.warnings?.length?esc(r.warnings.join(' / ')):'-'}</td></tr>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>18개 대학 6차 파싱 점검</title><style>body{font-family:Arial,'Malgun Gothic',sans-serif;margin:22px;color:#222}h1{font-size:21px}.summary{padding:12px;background:#f4f7f9;border:1px solid #dce3e8;line-height:1.8;margin:10px 0}.note{font-size:12px;color:#5f6b74;margin:8px 0 14px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d8dee3;padding:6px;text-align:center;vertical-align:top}th{background:#eef2f5;position:sticky;top:0}td:nth-child(2),td:nth-child(8),td:nth-child(9),td:nth-child(10){text-align:left}</style></head><body><h1>2027 부·울·경 18개 대학 Cloudflare 6차 파싱 점검</h1><div class="summary">전체 ${data.summary.universities}교 · <b>정상 ${data.summary.ok}교</b> · 정원내 분류필요 ${data.summary.needRules}교 · 검증필요 ${data.summary.needVerify}교 · 구조확인 ${data.summary.needStructure}교 · 접속실패 ${data.summary.failed}교 · 재외국민 제외 감지 ${data.summary.excludedUniversities}교</div><div class="note">6차에서는 5차에서 남은 동명대학교와 부산외국어대학교만 전용 보정합니다. 동명대는 정원내 소계와 정원외 4개 전형을 직접 합산하고, 부산외대는 정원내 11개·정원외 5개 전형을 직접 합산한 뒤 재외국민을 제외합니다. 나머지 16개 대학은 5차 정상 로직을 그대로 유지합니다.</div><table><thead><tr><th>#</th><th>대학</th><th>업체</th><th>파서</th><th>6차 판정</th><th>정원내 모집/지원</th><th>전체 모집/지원</th><th>재외국민 제외</th><th>미분류 전형</th><th>검증메시지</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export default {
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true,service:'admissions-ratio-2027',stage:'robust-parser-v6',universities:18});
    if(url.pathname==='/audit/v6'||url.pathname==='/audit/all')return new Response(page(await auditAll()),{headers:{'content-type':'text/html; charset=UTF-8','Cache-Control':'no-store'}});
    if(url.pathname==='/audit/v6.json')return Response.json(await auditAll(),{headers:{'Cache-Control':'no-store'}});
    if(url.pathname==='/audit/one'){
      const name=url.searchParams.get('name')||'',u=UNIVERSITIES.find(x=>x.name===name);
      if(!u)return Response.json({ok:false,error:'대학명을 찾을 수 없습니다.',available:UNIVERSITIES.map(x=>x.name)},{status:400});
      return Response.json(await auditOne(u),{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/debug/unresolved'){
      const all=await auditAll();
      return Response.json(all.results.filter(x=>x.level!=='정상').map(x=>({name:x.name,level:x.level,parser:x.parser,total:x.total,inner:x.inner,outside:x.outside,unknown:x.unknown,warnings:x.warnings,diagnostics:x.diagnostics})),{headers:{'Cache-Control':'no-store'}});
    }
    return new Response('Admissions Ratio Worker OK\n\n6차 점검: /audit/v6',{headers:{'content-type':'text/plain; charset=UTF-8'}});
  }
};
