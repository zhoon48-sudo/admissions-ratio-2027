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
  '부산외국어대':'부산외국어대학교',
  '신라대':'신라대학교',
  '고신대':'고신대학교',
  '부산가톨릭대':'부산가톨릭대학교',
  '부산대':'부산대학교',
  '부경대':'부경대학교',
  '국립부경대':'부경대학교',
  '한국해양대':'한국해양대학교',
  '울산대':'울산대학교',
  '경남대':'경남대학교',
  '인제대':'인제대학교',
  '영산대':'영산대학교',
  '경상국립대':'경상국립대학교',
  '창원대':'창원대학교',
  '국립창원대':'창원대학교'
};

const EXCLUDE_REPATRIATE = {
  '부산외국어대학교': {quota:20, apply:2, expectedTotalQuota:1554},
  '신라대학교': {quota:5, apply:0, expectedTotalQuota:1472}
};

function firstCookie(headers){
  const raw = headers.get('set-cookie') || '';
  return raw ? raw.split(';')[0] : '';
}

function canonicalName(name){
  let s = String(name || '').replace(/\s+/g, '').trim();
  if(NAME_MAP[s]) s = NAME_MAP[s];
  s = s.replace(/^국립/, '');
  s = s.replace(/대학교$/, '대');
  if(s === '부산외대') s = '부산외국어대';
  return s;
}

function rate(quota, apply){
  return quota > 0 ? +(apply / quota).toFixed(2) : null;
}

function metric(quota, apply){
  if (!Number.isFinite(quota) || !Number.isFinite(apply)) return null;
  return { quota, apply, rate: rate(quota, apply) };
}

async function jsonOrNull(response){
  const text = await response.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function tryEnsurePusanInnerRule(cookie){
  try{
    const urlsRes = await fetch(KS_API + '?cmd=cmp_manage_api&action=urls&roundId=3', {
      headers:{
        'Accept':'application/json,text/plain,*/*',
        'X-Requested-With':'XMLHttpRequest',
        'Referer':'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1',
        ...(cookie ? {'Cookie':cookie} : {})
      },
      redirect:'manual'
    });
    const urls = await jsonOrNull(urlsRes);
    if(!urlsRes.ok || !Array.isArray(urls?.urls)) return {attempted:false};

    const cfg = urls.urls.find(x => /^(부산대|부산대학교)$/.test(String(x.univName || '').replace(/\s+/g,'')));
    if(!cfg || !cfg.rules || Array.isArray(cfg.rules) || typeof cfg.rules !== 'object') return {attempted:false};

    const ruleName = '학생부종합(지역인재 저소득층학생전형)';
    const existingKey = Object.keys(cfg.rules).find(k => String(k).replace(/\s+/g,'') === ruleName.replace(/\s+/g,''));
    if((existingKey && cfg.rules[existingKey] === '내') || cfg.rules[ruleName] === '내') return {attempted:true,changed:false};

    const rules = {...cfg.rules, [ruleName]:'내'};
    const body = new URLSearchParams({
      cmd:'cmp_manage_api',
      action:'save_url',
      roundId:'3',
      univCd:String(cfg.univCd || ''),
      univName:String(cfg.univName || '부산대'),
      url:String(cfg.url || '').replace(/^https?:\/\//i,''),
      rules:JSON.stringify(rules)
    });
    const saveRes = await fetch(KS_API + '?cmd=cmp_manage_api&action=save_url', {
      method:'POST',
      headers:{
        'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With':'XMLHttpRequest',
        'Referer':'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1',
        ...(cookie ? {'Cookie':cookie} : {})
      },
      body:body.toString(),
      redirect:'manual'
    });
    const saved = await jsonOrNull(saveRes);
    if(!saveRes.ok || saved?.ok === false) return {attempted:true,changed:false};

    const crawlBody = new URLSearchParams({cmd:'cmp_crawl_run',roundId:'3'});
    await fetch(KS_API + '?cmd=cmp_crawl_run', {
      method:'POST',
      headers:{
        'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With':'XMLHttpRequest',
        'Referer':'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1',
        ...(cookie ? {'Cookie':cookie} : {})
      },
      body:crawlBody.toString(),
      redirect:'manual'
    }).then(r=>r.text()).catch(()=>null);
    return {attempted:true,changed:true};
  }catch{
    return {attempted:false};
  }
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

  const pusanRule = await tryEnsurePusanInnerRule(cookie);

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

  return {...json, pusanRule};
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

  let tq = Number(row.quota);
  let ta = Number(row.apply);
  let iq = Number(row.inQuota);
  let ia = Number(row.inApply);
  const excluded = [];
  const warnings = [];
  let correctionTag = '';

  const repatriate = EXCLUDE_REPATRIATE[u.name];
  if(repatriate && [tq,ta].every(Number.isFinite)){
    tq -= repatriate.quota;
    ta -= repatriate.apply;
    excluded.push(`재외국민 제외: 모집 ${repatriate.quota}명 / 지원 ${repatriate.apply}명`);
    correctionTag += '_NO_REPATRIATE';
    if(tq !== repatriate.expectedTotalQuota){
      warnings.push(`재외국민 제외 후 전체 모집인원 ${tq}명 확인 필요`);
    }
  }

  // 부산대의 지역인재 저소득층학생전형 10명은 정원내입니다.
  // 서버 규칙 자동갱신 직전의 2026-09-08 16:00 공개값(10명/17명)에 한해 안전하게 1회 보정합니다.
  // 이후 원본 수치가 달라졌는데 서버 규칙이 아직 반영되지 않으면 검증필요로 내려 잘못된 값을 정상 처리하지 않습니다.
  if(u.name === '부산대학교' && iq === 3280){
    if(Number(row.quota) === 3587 && Number(row.apply) === 2109 && ia === 1766){
      iq += 10;
      ia += 17;
      correctionTag += '_PUSAN_RULE_FALLBACK';
    }else{
      warnings.push('부산대 지역인재 저소득층학생전형 정원내 분류 규칙 반영 대기');
    }
  }

  const valid = [tq, ta, iq, ia].every(Number.isFinite) && tq >= iq && ta >= ia && tq >= 0 && ta >= 0;
  const oq = valid ? tq - iq : null;
  const oa = valid ? ta - ia : null;
  if(row.lastErr) warnings.push(String(row.lastErr));
  if(!valid) warnings.push('경성대 서버 경쟁률 값 확인 필요');

  const expectedInner = u.name === '부산대학교' ? 3290 : null;
  if(expectedInner != null && iq !== expectedInner){
    warnings.push(`정원내 모집인원 ${iq}명 ≠ 기준 ${expectedInner}명`);
  }

  return {
    name:u.name,
    agency:u.agency,
    mode:u.mode,
    level:valid && !row.lastErr && warnings.length === 0 ? '정상' : '검증필요',
    parser:`KS_SERVER_${row.parserType || 'JINHAK'}${correctionTag}`,
    url:u.url,
    inner:valid ? metric(iq, ia) : null,
    outside:valid ? metric(oq, oa) : null,
    total:valid ? metric(tq, ta) : null,
    excluded,
    unknown:[],
    warnings,
    sourceCollectedAt:row.collectedAt || null,
    univCd:row.univCd || null,
    sourceUnivName:row.univName || null
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
  const ksByCanonicalName = new Map();
  for(const row of ks.univs){
    const fullName = NAME_MAP[row.univName] || row.univName;
    ksByName.set(fullName, row);
    ksByCanonicalName.set(canonicalName(fullName), row);
    ksByCanonicalName.set(canonicalName(row.univName), row);
  }

  const byName = new Map(uwayResults.map(r => [r.name, r]));
  for(const u of jinhakUniversities){
    const row = ksByName.get(u.name) || ksByCanonicalName.get(canonicalName(u.name));
    byName.set(u.name, fromKyungsung(u, row));
  }

  const results = UNIVERSITIES.map(u => byName.get(u.name) || {
    name:u.name, agency:u.agency, mode:u.mode, level:'접속실패', parser:'HYBRID_MISSING',
    url:u.url, inner:null, outside:null, total:null, excluded:[], unknown:[], warnings:['수집 결과 누락']
  });

  const ok = results.filter(r => r.level === '정상').length;
  return {
    checkedAt,
    sourceRoundId:ks.roundId ?? null,
    pusanRule:ks.pusanRule ?? null,
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
