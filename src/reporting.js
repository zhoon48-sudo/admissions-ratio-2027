const ADMISSION_START = '2026-09-07';
const FINAL_DATE = '2026-09-11';
const FINAL_CONFIRMED_DATE = '2026-09-12';
const DEFAULT_REPORT_TIME = '16:00';
const FINAL_CONFIRM_TIME = '09:00';

const FINAL_CLOSE = {
  '경성대학교':'18:00',
  '동아대학교':'14:00',
  '동의대학교':'16:00',
  '동서대학교':'16:00',
  '동명대학교':'16:00',
  '부산외국어대학교':'16:00',
  '신라대학교':'16:00',
  '고신대학교':'16:00',
  '부산가톨릭대학교':'16:00',
  '부산대학교':'14:00',
  '부경대학교':'16:00',
  '한국해양대학교':'16:00',
  '울산대학교':'17:30',
  '경남대학교':'17:30',
  '인제대학교':'17:00',
  '영산대학교':'17:00',
  '경상국립대학교':'16:00',
  '창원대학교':'16:00'
};

const REPORT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS system_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS report_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_key TEXT NOT NULL UNIQUE,
    report_date TEXT NOT NULL,
    kind TEXT NOT NULL,
    day_no INTEGER,
    report_time TEXT,
    created_at TEXT NOT NULL,
    note TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS report_snapshot_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    university_name TEXT NOT NULL,
    snapshot_id INTEGER NOT NULL,
    applied_time TEXT,
    source_collected_at TEXT,
    UNIQUE(report_id, university_name),
    FOREIGN KEY (report_id) REFERENCES report_snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY (snapshot_id) REFERENCES competition_snapshots(id) ON DELETE RESTRICT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_report_date ON report_snapshots(report_date, kind)`,
  `CREATE INDEX IF NOT EXISTS idx_report_items_report ON report_snapshot_items(report_id)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_name_time_status ON competition_snapshots(university_name, collected_at, status)`
];

function kstParts(date = new Date()){
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const iso = shifted.toISOString();
  return {date:iso.slice(0,10), time:iso.slice(11,16)};
}

function utcIso(kstDate, kstTime){
  return new Date(`${kstDate}T${kstTime}:00+09:00`).toISOString();
}

function addMinutes(iso, minutes){
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

function compareDateTime(aDate, aTime, bDate, bTime){
  const a = `${aDate}T${aTime}`;
  const b = `${bDate}T${bTime}`;
  return a < b ? -1 : a > b ? 1 : 0;
}

function addDays(dateKey, days){
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}

function dayNoFor(dateKey){
  const a = new Date(`${ADMISSION_START}T00:00:00Z`);
  const b = new Date(`${dateKey}T00:00:00Z`);
  return Math.floor((b-a)/86400000)+1;
}

export async function ensureReportingSchema(env){
  if(!env.DB) throw new Error('D1 binding DB가 연결되지 않았습니다.');
  for(const sql of REPORT_SCHEMA) await env.DB.prepare(sql).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO system_settings(setting_key, setting_value) VALUES('report_time', ?)`).bind(DEFAULT_REPORT_TIME).run();
  return {initialized:true};
}

export async function getReportingSettings(env){
  await ensureReportingSchema(env);
  const rows = await env.DB.prepare(`SELECT setting_key, setting_value FROM system_settings`).all();
  const settings = Object.fromEntries((rows.results||[]).map(r=>[r.setting_key,r.setting_value]));
  return {
    reportTime:settings.report_time || DEFAULT_REPORT_TIME,
    finalConfirmTime:FINAL_CONFIRM_TIME,
    admissionStart:ADMISSION_START,
    finalDate:FINAL_DATE,
    finalConfirmedDate:FINAL_CONFIRMED_DATE,
    finalClose:FINAL_CLOSE
  };
}

export async function setReportTime(env, reportTime){
  await ensureReportingSchema(env);
  const value = String(reportTime||'').trim();
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('보고 저장시간은 HH:MM 형식이어야 합니다.');
  await env.DB.prepare(`
    INSERT INTO system_settings(setting_key, setting_value, updated_at)
    VALUES('report_time', ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at
  `).bind(value, new Date().toISOString()).run();
  return getReportingSettings(env);
}

async function universityNames(env){
  const rows = await env.DB.prepare(`SELECT name FROM universities WHERE enabled=1 ORDER BY sort_order`).all();
  return (rows.results||[]).map(r=>r.name);
}

async function snapshotNearTarget(env, universityName, targetIso, requireNormal=false){
  const afterLimit = addMinutes(targetIso, 10);
  const beforeLimit = addMinutes(targetIso, -10);
  const statusSql = requireNormal ? ` AND status='정상'` : '';
  let row = await env.DB.prepare(`
    SELECT * FROM competition_snapshots
    WHERE university_name=? AND collected_at>=? AND collected_at<=?${statusSql}
    ORDER BY collected_at ASC, id ASC LIMIT 1
  `).bind(universityName, targetIso, afterLimit).first();
  if(row) return row;

  row = await env.DB.prepare(`
    SELECT * FROM competition_snapshots
    WHERE university_name=? AND collected_at>=? AND collected_at<?${statusSql}
    ORDER BY collected_at DESC, id DESC LIMIT 1
  `).bind(universityName, beforeLimit, targetIso).first();
  return row || null;
}

// 공통 보고시각 자료는 해당 시각의 값이 우선입니다.
// 다만 최종일에 14:00처럼 16:00보다 먼저 공개를 종료한 대학은
// 16:00 직전 자료가 더 이상 생성되지 않을 수 있으므로 같은 날의 마지막 저장값을 사용합니다.
async function snapshotAsOfTarget(env, universityName, reportDate, targetIso, requireNormal=false){
  const near = await snapshotNearTarget(env, universityName, targetIso, requireNormal);
  if(near) return near;

  const dayStartIso = utcIso(reportDate, '00:00');
  const statusSql = requireNormal ? ` AND status='정상'` : '';
  const row = await env.DB.prepare(`
    SELECT * FROM competition_snapshots
    WHERE university_name=? AND collected_at>=? AND collected_at<?${statusSql}
    ORDER BY collected_at DESC, id DESC LIMIT 1
  `).bind(universityName, dayStartIso, targetIso).first();
  return row || null;
}

async function snapshotOnOrAfter(env, universityName, targetIso, untilIso, requireNormal=true){
  const statusSql = requireNormal ? ` AND status='정상'` : '';
  const row = await env.DB.prepare(`
    SELECT * FROM competition_snapshots
    WHERE university_name=? AND collected_at>=? AND collected_at<=?${statusSql}
    ORDER BY collected_at ASC, id ASC LIMIT 1
  `).bind(universityName, targetIso, untilIso).first();
  return row || null;
}

async function existingReport(env, reportKey){
  return await env.DB.prepare(`SELECT * FROM report_snapshots WHERE report_key=?`).bind(reportKey).first();
}

async function insertReport(env, meta, items){
  const existing = await existingReport(env, meta.reportKey);
  if(existing) return {created:false, report:existing, items:items.length};

  const createdAt = new Date().toISOString();
  const report = await env.DB.prepare(`
    INSERT INTO report_snapshots(report_key, report_date, kind, day_no, report_time, created_at, note)
    VALUES(?,?,?,?,?,?,?) RETURNING *
  `).bind(
    meta.reportKey,
    meta.reportDate,
    meta.kind,
    meta.dayNo ?? null,
    meta.reportTime ?? null,
    createdAt,
    meta.note || null
  ).first();

  const statements = items.map(item=>env.DB.prepare(`
    INSERT INTO report_snapshot_items(report_id, university_name, snapshot_id, applied_time, source_collected_at)
    VALUES(?,?,?,?,?)
  `).bind(report.id, item.universityName, item.snapshot.id, item.appliedTime || null, item.snapshot.collected_at || null));
  if(statements.length) await env.DB.batch(statements);
  return {created:true, report, items:items.length};
}

async function createDailyReport(env, reportDate, reportTime){
  const reportKey = `${reportDate}:daily`;
  const existing = await existingReport(env, reportKey);
  if(existing) return {created:false, report:existing};
  const names = await universityNames(env);
  const targetIso = utcIso(reportDate, reportTime);
  const items=[];
  for(const name of names){
    const snapshot = await snapshotAsOfTarget(env, name, reportDate, targetIso, false);
    if(!snapshot) return {created:false, skipped:true, reason:`${name} 저장자료 없음`};
    items.push({universityName:name, snapshot, appliedTime:reportTime});
  }
  return insertReport(env, {
    reportKey,
    reportDate,
    kind:'daily',
    dayNo:dayNoFor(reportDate),
    reportTime,
    note:reportDate===FINAL_DATE
      ? `공통 보고시각 ${reportTime} 기준 5일차 자동 저장 · 조기 공개종료 대학은 ${reportTime} 이전 마지막 공개자료 적용`
      : `공통 보고시각 ${reportTime} 기준 자동 저장`
  }, items);
}

async function createFinalReport(env){
  const reportKey = `${FINAL_DATE}:final`;
  const existing = await existingReport(env, reportKey);
  if(existing) return {created:false, report:existing};
  const names = await universityNames(env);
  const items=[];
  for(const name of names){
    const closeTime = FINAL_CLOSE[name] || DEFAULT_REPORT_TIME;
    const snapshot = await snapshotNearTarget(env, name, utcIso(FINAL_DATE, closeTime), false);
    if(!snapshot) return {created:false, skipped:true, reason:`${name} 최종일 저장자료 없음`};
    items.push({universityName:name, snapshot, appliedTime:closeTime});
  }
  return insertReport(env, {
    reportKey,
    reportDate:FINAL_DATE,
    kind:'final',
    dayNo:null,
    reportTime:'대학별',
    note:'대학별 경쟁률 공개 종료시각 기준 자동 저장'
  }, items);
}

async function createFinalConfirmedReport(env){
  const reportKey = `${FINAL_CONFIRMED_DATE}:finalConfirmed`;
  const existing = await existingReport(env, reportKey);
  if(existing) return {created:false, report:existing};
  const names = await universityNames(env);
  const targetIso = utcIso(FINAL_CONFIRMED_DATE, FINAL_CONFIRM_TIME);
  const untilIso = utcIso(FINAL_CONFIRMED_DATE, '23:59');
  const items=[];
  for(const name of names){
    const snapshot = await snapshotOnOrAfter(env, name, targetIso, untilIso, true);
    if(!snapshot) return {created:false, skipped:true, reason:`${name} 다음날 정상자료 대기`};
    items.push({universityName:name, snapshot, appliedTime:FINAL_CONFIRM_TIME});
  }
  return insertReport(env, {
    reportKey,
    reportDate:FINAL_CONFIRMED_DATE,
    kind:'finalConfirmed',
    dayNo:null,
    reportTime:FINAL_CONFIRM_TIME,
    note:'접수 종료 다음날 정상 수집자료 기준 최종확정'
  }, items);
}

export async function backfillReports(env){
  const settings = await getReportingSettings(env);
  const now = kstParts();
  const results=[];

  // 접수 마지막 날(9/11)도 16:00 공통 보고자료를 먼저 저장합니다.
  // 이후 대학별 공개종료가 모두 끝나면 같은 날짜에 별도의 최종일 보고자료를 추가합니다.
  for(let d=ADMISSION_START; d<=FINAL_DATE; d=addDays(d,1)){
    const targetPassed = compareDateTime(now.date, now.time, d, settings.reportTime) >= 0;
    if(targetPassed) results.push({date:d, kind:'daily', ...(await createDailyReport(env,d,settings.reportTime))});
  }

  const latestFinalClose = Object.values(FINAL_CLOSE).sort().at(-1) || '18:00';
  if(compareDateTime(now.date, now.time, FINAL_DATE, latestFinalClose) >= 0){
    results.push({date:FINAL_DATE, kind:'final', ...(await createFinalReport(env))});
  }
  if(compareDateTime(now.date, now.time, FINAL_CONFIRMED_DATE, FINAL_CONFIRM_TIME) >= 0){
    results.push({date:FINAL_CONFIRMED_DATE, kind:'finalConfirmed', ...(await createFinalConfirmedReport(env))});
  }
  return {ok:true, settings, results};
}

export async function processReportingAfterCollection(env){
  return backfillReports(env);
}

export async function listReports(env){
  await ensureReportingSchema(env);
  const rows = await env.DB.prepare(`
    SELECT r.*, COUNT(i.id) AS item_count
    FROM report_snapshots r
    LEFT JOIN report_snapshot_items i ON i.report_id=r.id
    GROUP BY r.id
    ORDER BY r.report_date, CASE r.kind WHEN 'daily' THEN 1 WHEN 'final' THEN 2 ELSE 3 END
  `).all();
  return {reports:rows.results||[]};
}

export async function reportDetail(env, reportKey){
  await ensureReportingSchema(env);
  const report = await existingReport(env, reportKey);
  if(!report) return {report:null, results:[]};
  const rows = await env.DB.prepare(`
    SELECT
      i.university_name, i.applied_time, i.source_collected_at,
      s.id AS snapshot_id, s.run_id, s.agency, s.parser, s.status,
      s.inner_quota, s.inner_apply, s.inner_rate,
      s.outside_quota, s.outside_apply, s.outside_rate,
      s.total_quota, s.total_apply, s.total_rate,
      s.excluded_note, s.warning_note, s.source_url, s.collected_at
    FROM report_snapshot_items i
    JOIN competition_snapshots s ON s.id=i.snapshot_id
    JOIN universities u ON u.name=i.university_name
    WHERE i.report_id=?
    ORDER BY u.sort_order
  `).bind(report.id).all();
  return {report, results:rows.results||[]};
}

export async function reportArchive(env){
  const list = await listReports(env);
  const reports=[];
  for(const meta of list.reports){
    const detail = await reportDetail(env, meta.report_key);
    reports.push(detail);
  }
  return {reports};
}

export async function historyData(env, searchParams){
  await ensureReportingSchema(env);
  const hoursRaw = Number(searchParams?.get?.('hours'));
  const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.min(hoursRaw, 168) : null;
  const from = searchParams?.get?.('from');
  const to = searchParams?.get?.('to');
  let sql = `
    SELECT university_name, inner_rate, total_rate, collected_at, status
    FROM competition_snapshots
    WHERE (inner_rate IS NOT NULL OR total_rate IS NOT NULL)
  `;
  const binds=[];
  if(hours){
    binds.push(new Date(Date.now()-hours*3600000).toISOString());
    sql += ` AND collected_at>=?`;
  }else if(from){
    binds.push(from.includes('T') ? from : utcIso(from,'00:00'));
    sql += ` AND collected_at>=?`;
  }else{
    binds.push(utcIso(ADMISSION_START,'00:00'));
    sql += ` AND collected_at>=?`;
  }
  if(to){
    binds.push(to.includes('T') ? to : utcIso(to,'23:59'));
    sql += ` AND collected_at<=?`;
  }
  sql += ` ORDER BY collected_at ASC, university_name ASC LIMIT 40000`;
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return {points:rows.results||[], hours, from:from||null, to:to||null};
}

export async function reportingStatus(env){
  await ensureReportingSchema(env);
  const settings = await getReportingSettings(env);
  const list = await listReports(env);
  return {
    initialized:true,
    settings,
    reports:list.reports,
    reportCount:list.reports.length,
    nowKst:kstParts()
  };
}
