import { auditOne, UNIVERSITIES } from './parser-v7.js';

const KS_API = 'https://ipsiu.ks.ac.kr/ipsi/servlet/ipsi.Manager';
const KS_LOGIN = KS_API + '?cmd=brf_login';

const NAME_MAP = {
  '경성대':'경성대학교',
  '동아대':'동아대학교',
  '동의대':'동의대학교',
  '동서대':'동서대학교',
  '동명대':'동명대학교',
  '부산외대':'부산외국어대학교',
  '신라대':'신라대학교',
  '고신대':'고신대학교',
  '부산가톨릭대':'부산가톨릭대학교',
  '부산대':'부산대학교',
  '부경대':'부경대학교',
  '한국해양대':'한국해양대학교',
  '울산대':'울산대학교',
  '경남대':'경남대학교',
  '인제대':'인제대학교',
  '영산대':'영산대학교',
  '경상국립대':'경상국립대학교',
  '창원대':'창원대학교'
};

function firstCookie(headers){
  const raw = headers.get('set-cookie') || '';
  return raw ? raw.split(';')[0] : '';
}

function rate(quota, apply){
  return quota > 0 ? +(apply / quota).toFixed(2) : null;
}

function metric(quota, apply){
  if (!Number.isFinite(quota) || !Number.isFinite(apply)) return null;
  return { quota, apply, rate: rate(quota, apply) };
}

async function fetchKyungsungLive(env){
  if(!env.KS_EMP_ID || !env.KS_PASSWORD){
    throw new Error('경성대 로그인 Secret이 설정되지 않았습니다.');
  }

  const first = await fetch(KS_LOGIN, {
    headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},
    redirect:'manual'
  });
  await first.text();
  let cookie = firstCookie(first.headers);

  const body = new URLSearchParams({
    cmd:'brf_login_check',
    empId:env.KS_EMP_ID,
    pw:env.KS_PASSWORD
  });
  const login = await fetch(KS_API + '?cmd=brf_login_check', {
    method:'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With':'XMLHttpRequest',
      'Referer':KS_LOGIN,
      ...(cookie ? {'Cookie':cookie} : {})
    },
    body:body.toString(),
    redirect:'manual'
  });
  const loginText = await login.text();
  let loginJson = null;
  try { loginJson = JSON.parse(loginText); } catch {}
  const newCookie = firstCookie(login.headers);
  if(newCookie) cookie = newCookie;

  if(!login.ok || loginJson?.ok === false){
    throw new Error(`경성대 서버 로그인 실패 (${login.status})`);
  }

  const live = await fetch(KS_API + '?cmd=cmp_live', {
    headers:{
      'Accept':'application/json,text/plain,*/*',
      'X-Requested-With':'XMLHttpRequest',
      'Referer':'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1',
      ...(cookie ? {'Cookie':cookie} : {})
    },
    redirect:'manual'
  });
  const text = await live.text();
  if(!live.ok) throw new Error(`경성대 경쟁률 조회 실패 (${live.status})`);

  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error('경성대 경쟁률 응답을 읽지 못했습니다.'); }
  if(json?.ok === false) throw new Error(json.error || '경성대 경쟁률 조회 실패');
  if(!Array.isArray(json?.univs)) throw new Error('경성대 경쟁률 대학 목록이 없습니다.');

  return json;
}

function fromKyungsung(u, row){
  if(!row){
    return {
      name:u.name, agency:u.agency, mode:u.mode, level:'접속실패',
      parser:'KS_SERVER_JINHAK', url:u.url,
      inner:null, outside:null, total:null,
      excluded:[], unknown:[], warnings:['경성대 서버 결과에서 대학을 찾지 못했습니다.']
    };
  }

  const tq = Number(row.quota);
  const ta = Number(row.apply);
  const iq = Number(row.inQuota);
  const ia = Number(row.inApply);
  const valid = [tq, ta, iq, ia].every(Number.isFinite) && tq >= iq && ta >= ia;
  const oq = valid ? tq - iq : null;
  const oa = valid ? ta - ia : null;
  const warnings = [];
  if(row.lastErr) warnings.push(String(row.lastErr));
  if(!valid) warnings.push('경성대 서버 경쟁률 값 확인 필요');

  return {
    name:u.name,
    agency:u.agency,
    mode:u.mode,
    level:valid && !row.lastErr ? '정상' : '검증필요',
    parser:`KS_SERVER_${row.parserType || 'JINHAK'}`,
    url:u.url,
    inner:valid ? metric(iq, ia) : null,
    outside:valid ? metric(oq, oa) : null,
    total:valid ? metric(tq, ta) : null,
    excluded:[],
    unknown:[],
    warnings,
    sourceCollectedAt:row.collectedAt || null,
    univCd:row.univCd || null
  };
}

export async function collectHybrid(env){
  const checkedAt = new Date().toISOString();
  const uwayUniversities = UNIVERSITIES.filter(u => u.agency === 'UWAY');
  const jinhakUniversities = UNIVERSITIES.filter(u => u.agency === 'JINHAK');

  const [uwayResults, ks] = await Promise.all([
    Promise.all(uwayUniversities.map(u => auditOne(u))),
    fetchKyungsungLive(env)
  ]);

  const ksByName = new Map();
  for(const row of ks.univs){
    const fullName = NAME_MAP[row.univName] || row.univName;
    ksByName.set(fullName, row);
  }

  const byName = new Map(uwayResults.map(r => [r.name, r]));
  for(const u of jinhakUniversities){
    byName.set(u.name, fromKyungsung(u, ksByName.get(u.name)));
  }

  const results = UNIVERSITIES.map(u => byName.get(u.name) || {
    name:u.name, agency:u.agency, mode:u.mode, level:'접속실패', parser:'HYBRID_MISSING',
    url:u.url, inner:null, outside:null, total:null, excluded:[], unknown:[], warnings:['수집 결과 누락']
  });

  const ok = results.filter(r => r.level === '정상').length;
  return {
    checkedAt,
    sourceRoundId:ks.roundId ?? null,
    summary:{
      universities:results.length,
      ok,
      needRules:results.filter(r=>r.level==='정원내 분류필요').length,
      needVerify:results.filter(r=>r.level==='검증필요').length,
      needStructure:results.filter(r=>r.level==='구조확인').length,
      failed:results.filter(r=>r.level==='접속실패').length,
      excludedUniversities:results.filter(r=>r.excluded?.length).length
    },
    results
  };
}
