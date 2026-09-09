const LEGACY_REPORTS = {
  '2026-09-07': {
    dayNo: 1,
    reportTime: '16:00',
    note: '기존 경성대학교 경쟁률 모니터링 1일차 보고자료 수기 이관 · 16:00 기준',
    runId: -20260907,
    rows: [
      ['경성대학교','유웨이',2579,391,2731,429,'16:01','정상'],
      ['동아대학교','진학',3617,457,4048,555,'16:01','정상'],
      ['동의대학교','유웨이',3526,604,3965,726,'16:01','정상'],
      ['동서대학교','진학',1931,332,2045,353,'16:00','정상'],
      ['동명대학교','진학',1424,221,1525,233,'16:00','정상'],
      ['부산외국어대학교','진학',1394,302,1574,322,'16:00','정상'],
      ['신라대학교','진학',1366,402,1477,429,'16:00','정상'],
      ['고신대학교','유웨이',705,149,741,160,'16:00','정상'],
      ['부산가톨릭대학교','진학',677,102,715,118,'16:00','정상'],
      ['부산대학교','진학',0,0,0,0,null,'미수집'],
      ['부경대학교','진학',2770,446,2962,501,'16:00','정상'],
      ['한국해양대학교','유웨이',1123,202,1213,238,'16:00','정상'],
      ['울산대학교','유웨이',2353,186,2490,217,'16:00','정상'],
      ['경남대학교','진학',1956,263,2153,319,'16:00','정상'],
      ['인제대학교','유웨이',1557,209,1645,236,'16:00','정상'],
      ['영산대학교','진학',1261,167,1331,177,'16:00','정상'],
      ['경상국립대학교','진학',3437,668,3729,754,'16:00','정상'],
      ['창원대학교','진학',1578,236,1725,273,'16:00','정상']
    ]
  }
};

function utcIso(kstDate, kstTime){
  return new Date(`${kstDate}T${kstTime}:00+09:00`).toISOString();
}

function rate(q,a){
  const quota=Number(q), apply=Number(a);
  return quota>0 && Number.isFinite(apply) ? apply/quota : null;
}

async function ensureBaseTables(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS report_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_key TEXT NOT NULL UNIQUE,
    report_date TEXT NOT NULL,
    kind TEXT NOT NULL,
    day_no INTEGER,
    report_time TEXT,
    created_at TEXT NOT NULL,
    note TEXT
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS report_snapshot_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    university_name TEXT NOT NULL,
    snapshot_id INTEGER NOT NULL,
    applied_time TEXT,
    source_collected_at TEXT,
    UNIQUE(report_id, university_name)
  )`).run();
}

async function importOne(env, reportDate, seed){
  await ensureBaseTables(env);
  const reportKey=`${reportDate}:daily`;
  const reportIso=utcIso(reportDate,seed.reportTime);

  await env.DB.prepare(`
    INSERT OR IGNORE INTO crawl_runs(id,trigger_type,started_at,finished_at,status,ok_count,error_count,note)
    VALUES(?,?,?,?,?,?,?,?)
  `).bind(
    seed.runId,'legacy_import',reportIso,reportIso,'archive',
    seed.rows.filter(r=>r[7]==='정상').length,
    seed.rows.filter(r=>r[7]!=='정상').length,
    `legacy-report:${reportDate}`
  ).run();

  const snapshots=[];
  for(const row of seed.rows){
    const [name,agency,innerQuota,innerApply,totalQuota,totalApply,sourceTime,status]=row;
    const outsideQuota=Number(totalQuota)-Number(innerQuota);
    const outsideApply=Number(totalApply)-Number(innerApply);
    const collectedAt=sourceTime ? utcIso(reportDate,sourceTime) : reportIso;
    const uni=await env.DB.prepare(`SELECT source_url FROM universities WHERE name=?`).bind(name).first();
    const sourceUrl=uni?.source_url || 'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1';
    let snap=await env.DB.prepare(`SELECT id FROM competition_snapshots WHERE run_id=? AND university_name=? LIMIT 1`).bind(seed.runId,name).first();
    if(snap?.id){
      await env.DB.prepare(`
        UPDATE competition_snapshots SET agency=?, parser='LEGACY_IMPORT', status=?,
          inner_quota=?, inner_apply=?, inner_rate=?, outside_quota=?, outside_apply=?, outside_rate=?,
          total_quota=?, total_apply=?, total_rate=?, excluded_note=?, warning_note=?, source_url=?, collected_at=?
        WHERE id=?
      `).bind(
        agency,status,innerQuota,innerApply,rate(innerQuota,innerApply),
        outsideQuota,outsideApply,rate(outsideQuota,outsideApply),
        totalQuota,totalApply,rate(totalQuota,totalApply),
        '기존 경성대학교 경쟁률 모니터링 보고자료 이관',
        status==='정상'?null:'접수 전 · 기존 보고자료 미수집',sourceUrl,collectedAt,snap.id
      ).run();
    }else{
      snap=await env.DB.prepare(`
        INSERT INTO competition_snapshots (
          run_id, university_name, agency, parser, status,
          inner_quota, inner_apply, inner_rate,
          outside_quota, outside_apply, outside_rate,
          total_quota, total_apply, total_rate,
          excluded_note, warning_note, source_url, collected_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id
      `).bind(
        seed.runId,name,agency,'LEGACY_IMPORT',status,
        innerQuota,innerApply,rate(innerQuota,innerApply),
        outsideQuota,outsideApply,rate(outsideQuota,outsideApply),
        totalQuota,totalApply,rate(totalQuota,totalApply),
        '기존 경성대학교 경쟁률 모니터링 보고자료 이관',
        status==='정상'?null:'접수 전 · 기존 보고자료 미수집',sourceUrl,collectedAt
      ).first();
    }
    snapshots.push({name,snapshotId:Number(snap.id),sourceTime,collectedAt});
  }

  const existing=await env.DB.prepare(`SELECT id FROM report_snapshots WHERE report_key=?`).bind(reportKey).first();
  if(existing?.id){
    await env.DB.prepare(`DELETE FROM report_snapshot_items WHERE report_id=?`).bind(existing.id).run();
    await env.DB.prepare(`DELETE FROM report_snapshots WHERE id=?`).bind(existing.id).run();
  }

  const report=await env.DB.prepare(`
    INSERT INTO report_snapshots(report_key,report_date,kind,day_no,report_time,created_at,note)
    VALUES(?,?,?,?,?,?,?) RETURNING id
  `).bind(reportKey,reportDate,'daily',seed.dayNo,seed.reportTime,reportIso,seed.note).first();

  const inserts=snapshots.map(s=>env.DB.prepare(`
    INSERT INTO report_snapshot_items(report_id,university_name,snapshot_id,applied_time,source_collected_at)
    VALUES(?,?,?,?,?)
  `).bind(report.id,s.name,s.snapshotId,seed.reportTime,s.sourceTime?s.collectedAt:null));
  if(inserts.length) await env.DB.batch(inserts);

  return {date:reportDate,reportKey,reportId:Number(report.id),items:snapshots.length,source:'legacy-manual'};
}

export async function importLegacyReports(env, onlyDate=null){
  if(!env.DB) throw new Error('D1 binding DB가 연결되지 않았습니다.');
  const dates=onlyDate?[onlyDate]:Object.keys(LEGACY_REPORTS);
  const results=[];
  for(const date of dates){
    const seed=LEGACY_REPORTS[date];
    if(!seed){
      results.push({date,skipped:true,reason:'이관자료 없음'});
      continue;
    }
    results.push(await importOne(env,date,seed));
  }
  return {ok:true,results};
}

export function legacyReportDates(){
  return Object.keys(LEGACY_REPORTS).sort();
}
