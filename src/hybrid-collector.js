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

// 재외국민은 모니터링 집계에서 제외합니다.
// 부산외대·신라대는 경성대 서버의 전체합계에는 재외국민이 포함되므로,
// 재외국민 지원인원만 진학사 공개페이지에서 실시간으로 별도 읽어 차감합니다.
const EXCLUDE_REPATRIATE = {
  '부산외국어대학교': {quota:20, expectedTotalQuota:1554},
  '신라대학교': {quota:5, expectedTotalQuota:1472}
};

const JINHAK_HEADERS = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
  'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.7',
  'Referer':'https://www.jinhakapply.com/'
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

function firstFinite(...values){
  for(const value of values){
    if(value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if(Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function htmlText(value){
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_,n)=>String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function intCell(value){
  const s = htmlText(value).replace(/,/g,'').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

async function fetchJinhakRepatriate(u){
  const spec = EXCLUDE_REPATRIATE[u.name];
  if(!spec) return null;
  try{
    const response = await fetch(u.url, {redirect:'follow', headers:JINHAK_HEADERS});
    if(!response.ok) return {ok:false, error:`진학사 직접조회 HTTP ${response.status}`};

    const contentType = response.headers.get('content-type') || '';
    let charset = (contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1] || 'utf-8')
      .replace(/["']/g,'').toLowerCase();
    if(/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(charset)) charset='euc-kr';
    const buf = await response.arrayBuffer();
    let html;
    try { html = new TextDecoder(charset).decode(buf); }
    catch { html = new TextDecoder('utf-8').decode(buf); }

    const candidates=[];
    for(const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
      const rowText = htmlText(tr[1]);
      if(!/재외국민/.test(rowText)) continue;
      const cells=[];
      for(const td of tr[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)) cells.push(td[2]);
      const ints = cells.map(intCell).filter(v=>v !== null);
      if(ints.length < 2) continue;
      const quota = ints[ints.length - 2];
      const apply = ints[ints.length - 1];
      candidates.push({quota, apply, rowText});
    }

    const exact = candidates.find(x=>x.quota === spec.quota);
    if(!exact){
      return {
        ok:false,
        error:`재외국민 모집 ${spec.quota}명 행을 찾지 못했습니다.`,
        candidates:candidates.slice(0,5)
      };
    }
    return {
      ok:true,
      quota:exact.quota,
      apply:exact.apply,
      source:'JINHAK_DIRECT',
      rowText:exact.rowText
    };
  }catch(e){
    return {ok:false, error:e instanceof Error ? e.message : String(e)};
  }
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

function fromKyungsung(u, row, directRepatriate=null){
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
    const rawTotalQuota = tq;
    const upstreamExcluded = tq === repatriate.expectedTotalQuota;
    const rawIncludesRepatriate = tq === repatriate.expectedTotalQuota + repatriate.quota;
    const dynamicApply = firstFinite(
      directRepatriate?.ok ? directRepatriate.apply : null,
      row.repatriateApply,
      row.repatriate_apply,
      row.excludedRepatriateApply,
      row.excluded_repatriate_apply
    );

    if(upstreamExcluded){
      excluded.push(`재외국민 원천 제외 확인: 모집 ${repatriate.quota}명`);
      correctionTag += '_REPATRIATE_UPSTREAM';
    }else if(rawIncludesRepatriate && dynamicApply !== null){
      tq -= repatriate.quota;
      ta -= dynamicApply;
      excluded.push(`재외국민 동적 제외: 모집 ${repatriate.quota}명 / 지원 ${dynamicApply}명`);
      correctionTag += directRepatriate?.ok ? '_NO_REPATRIATE_JINHAK' : '_NO_REPATRIATE';
    }else if(rawIncludesRepatriate){
      tq -= repatriate.quota;
      excluded.push(`재외국민 모집인원 ${repatriate.quota}명 제외 / 지원인원 동적 제외 대기`);
      const detail = directRepatriate?.error ? ` (${directRepatriate.error})` : '';
      warnings.push(`재외국민 지원인원 동적 제외값을 확인하지 못했습니다${detail}`);
      correctionTag += '_REPATRIATE_APPLY_PENDING';
    }else{
      warnings.push(`재외국민 제외 기준 모집인원 확인 필요: 원천 전체 ${rawTotalQuota}명 / 기대 ${repatriate.expectedTotalQuota}명`);
      correctionTag += '_REPATRIATE_QUOTA_CHECK';
    }

    if(tq !== repatriate.expectedTotalQuota){
      warnings.push(`재외국민 제외 후 전체 모집인원 ${tq}명 ≠ 기준 ${repatriate.expectedTotalQuota}명`);
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
  const repatriateUniversities = jinhakUniversities.filter(u => EXCLUDE_REPATRIATE[u.name]);

  const [uwayResults, ks, repatriateResults] = await Promise.all([
    Promise.all(uwayUniversities.map(u => auditOne(u))),
    fetchKyungsungLive(env),
    Promise.all(repatriateUniversities.map(async u => [u.name, await fetchJinhakRepatriate(u)]))
  ]);
  const repatriateByName = new Map(repatriateResults);

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
    byName.set(u.name, fromKyungsung(u, row, repatriateByName.get(u.name) || null));
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
    repatriateDirect:Object.fromEntries(repatriateResults),
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