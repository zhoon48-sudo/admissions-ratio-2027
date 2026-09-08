import auditApp from './v7.js';
import { auditAll, auditOne, UNIVERSITIES } from './parser-v7.js';

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS universities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    agency TEXT NOT NULL,
    source_url TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS crawl_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger_type TEXT NOT NULL DEFAULT 'manual',
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    ok_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    note TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS competition_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    university_name TEXT NOT NULL,
    agency TEXT NOT NULL,
    parser TEXT,
    status TEXT NOT NULL,
    inner_quota INTEGER,
    inner_apply INTEGER,
    inner_rate REAL,
    outside_quota INTEGER,
    outside_apply INTEGER,
    outside_rate REAL,
    total_quota INTEGER,
    total_apply INTEGER,
    total_rate REAL,
    excluded_note TEXT,
    warning_note TEXT,
    source_url TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES crawl_runs(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_university_time
    ON competition_snapshots(university_name, collected_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_run
    ON competition_snapshots(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_runs_started
    ON crawl_runs(started_at DESC)`
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function initDb(env) {
  if (!env.DB) throw new Error('D1 binding DB가 연결되지 않았습니다.');

  for (const sql of SCHEMA_STATEMENTS) {
    await env.DB.prepare(sql).run();
  }

  const statements = UNIVERSITIES.map((u, i) =>
    env.DB.prepare(`INSERT OR IGNORE INTO universities (name, agency, source_url, sort_order) VALUES (?, ?, ?, ?)`)
      .bind(u.name, u.agency, u.url, i + 1)
  );
  if (statements.length) await env.DB.batch(statements);
  const row = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM universities').first();
  return { initialized: true, universities: Number(row?.cnt || 0) };
}

async function dbStatus(env) {
  if (!env.DB) return { connected: false, initialized: false, error: 'DB binding missing' };
  try {
    const tableRow = await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name IN ('universities','crawl_runs','competition_snapshots')`).first();
    const tableCount = Number(tableRow?.cnt || 0);
    if (tableCount < 3) return { connected: true, initialized: false, tableCount };
    const uni = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM universities').first();
    const runs = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM crawl_runs').first();
    const snaps = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM competition_snapshots').first();
    const latest = await env.DB.prepare('SELECT id, started_at, finished_at, status, ok_count, error_count, note FROM crawl_runs ORDER BY id DESC LIMIT 1').first();
    return {
      connected: true,
      initialized: true,
      tableCount,
      universities: Number(uni?.cnt || 0),
      runs: Number(runs?.cnt || 0),
      snapshots: Number(snaps?.cnt || 0),
      latestRun: latest || null
    };
  } catch (e) {
    return { connected: true, initialized: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function collectWithRetry() {
  const data = await auditAll();
  const results = [...data.results];
  let retryAttempts = 0;
  let recovered = 0;

  for (let i = 0; i < results.length; i++) {
    if (results[i].level === '정상') continue;
    const u = UNIVERSITIES.find(x => x.name === results[i].name);
    if (!u) continue;

    let latest = results[i];
    for (let attempt = 1; attempt <= 2; attempt++) {
      await sleep(attempt === 1 ? 500 : 1000);
      retryAttempts++;
      latest = await auditOne(u);
      if (latest.level === '정상') {
        recovered++;
        break;
      }
    }
    results[i] = latest;
  }

  return {
    ...data,
    checkedAt: new Date().toISOString(),
    results,
    retryAttempts,
    recovered
  };
}

async function collectAndStore(env, triggerType = 'manual') {
  await initDb(env);
  const startedAt = new Date().toISOString();
  const run = await env.DB.prepare(`INSERT INTO crawl_runs (trigger_type, started_at, status) VALUES (?, ?, 'running') RETURNING id`)
    .bind(triggerType, startedAt).first();
  const runId = Number(run?.id);
  if (!runId) throw new Error('crawl_runs 실행번호 생성에 실패했습니다.');

  try {
    const data = await collectWithRetry();
    const collectedAt = data.checkedAt || new Date().toISOString();
    const inserts = data.results.map(r => env.DB.prepare(`
      INSERT INTO competition_snapshots (
        run_id, university_name, agency, parser, status,
        inner_quota, inner_apply, inner_rate,
        outside_quota, outside_apply, outside_rate,
        total_quota, total_apply, total_rate,
        excluded_note, warning_note, source_url, collected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      runId, r.name, r.agency, r.parser || null, r.level,
      r.inner?.quota ?? null, r.inner?.apply ?? null, r.inner?.rate ?? null,
      r.outside?.quota ?? null, r.outside?.apply ?? null, r.outside?.rate ?? null,
      r.total?.quota ?? null, r.total?.apply ?? null, r.total?.rate ?? null,
      r.excluded?.length ? r.excluded.join(' | ') : null,
      r.warnings?.length ? r.warnings.join(' | ') : (r.error || null),
      r.url, collectedAt
    ));
    if (inserts.length) await env.DB.batch(inserts);

    const okCount = data.results.filter(r => r.level === '정상').length;
    const errorCount = data.results.length - okCount;
    const finishedAt = new Date().toISOString();
    const note = `retryAttempts=${data.retryAttempts || 0}, recovered=${data.recovered || 0}`;
    await env.DB.prepare(`UPDATE crawl_runs SET finished_at=?, status=?, ok_count=?, error_count=?, note=? WHERE id=?`)
      .bind(finishedAt, errorCount === 0 ? 'success' : 'partial', okCount, errorCount, note, runId).run();

    return {
      saved: true,
      runId,
      startedAt,
      finishedAt,
      universities: data.results.length,
      okCount,
      errorCount,
      snapshotsSaved: data.results.length,
      retryAttempts: data.retryAttempts || 0,
      recovered: data.recovered || 0
    };
  } catch (e) {
    const finishedAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE crawl_runs SET finished_at=?, status='error', note=? WHERE id=?`)
      .bind(finishedAt, e instanceof Error ? e.message : String(e), runId).run();
    throw e;
  }
}

async function latestSnapshot(env) {
  const run = await env.DB.prepare(`SELECT * FROM crawl_runs WHERE status IN ('success','partial') ORDER BY id DESC LIMIT 1`).first();
  if (!run) return { run: null, results: [] };
  const rows = await env.DB.prepare(`SELECT * FROM competition_snapshots WHERE run_id=? ORDER BY id`).bind(run.id).all();
  return { run, results: rows.results || [] };
}

async function latestRunDetail(env) {
  const run = await env.DB.prepare(`SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 1`).first();
  if (!run) return { run: null, results: [] };
  const rows = await env.DB.prepare(`
    SELECT university_name, agency, parser, status, inner_quota, inner_apply, total_quota, total_apply, warning_note
    FROM competition_snapshots
    WHERE run_id=?
    ORDER BY id
  `).bind(run.id).all();
  return { run, results: rows.results || [] };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/db/init') {
        return Response.json(await initDb(env), { headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/db/status') {
        return Response.json(await dbStatus(env), { headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/db/latest-run') {
        return Response.json(await latestRunDetail(env), { headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/collect/once') {
        return Response.json(await collectAndStore(env, 'manual'), { headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/api/latest') {
        return Response.json(await latestSnapshot(env), { headers: { 'Cache-Control': 'no-store' } });
      }
      return auditApp.fetch(request, env, ctx);
    } catch (e) {
      return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
  }
};
