import app from './db-stage.js';
import { probeKyungsungSession, probeKyungsungLoginForm, probeKyungsungLoginScript } from './ks-session-probe.js';
import { kyungsungLiveWithAccount, kyungsungCorrectionDiagnostics, kyungsungRepatriateDiagnostics } from './ks-auth.js';
import { collectHybridAndStore } from './hybrid-store.js';
import {
  processReportingAfterCollection,
  backfillReports,
  listReports,
  reportDetail,
  reportArchive,
  historyData,
  reportingStatus,
  getReportingSettings
} from './reporting.js';

const RELEASE = '2026-09-09-r7';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

function jsonResponse(data, status = 200){
  return Response.json(data, {status, headers:CORS_HEADERS});
}

function withCors(response){
  const headers = new Headers(response.headers);
  for(const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, {
    status:response.status,
    statusText:response.statusText,
    headers
  });
}

async function appJson(path, request, env, ctx){
  const target = new URL(path, request.url);
  const response = await app.fetch(new Request(target.toString(), {method:'GET'}), env, ctx);
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { return {ok:false, httpStatus:response.status, error:'내부 점검 응답을 JSON으로 읽지 못했습니다.'}; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if(request.method === 'OPTIONS'){
      return new Response(null, {status:204, headers:CORS_HEADERS});
    }

    if(url.pathname === '/health'){
      return jsonResponse({
        ok:true,
        service:'admissions-ratio-2027',
        release:RELEASE,
        scheduler:'direct-worker-call+server-reporting',
        d1Binding:Boolean(env.DB),
        kyungsungSecrets:Boolean(env.KS_EMP_ID && env.KS_PASSWORD),
        checkedAt:new Date().toISOString()
      });
    }

    if(url.pathname === '/check'){
      try{
        const [db, latest, reporting] = await Promise.all([
          appJson('/db/status', request, env, ctx),
          appJson('/api/latest', request, env, ctx),
          reportingStatus(env)
        ]);
        const rows = Array.isArray(latest?.results) ? latest.results : [];
        const attention = rows
          .filter(r => r.status !== '정상')
          .map(r => ({
            university:r.university_name,
            status:r.status,
            warning:r.warning_note || null,
            parser:r.parser || null
          }));
        const latestCollectedAt = rows.map(r=>r.collected_at).filter(Boolean).sort().pop() || null;
        return jsonResponse({
          ok:Boolean(db?.connected && db?.initialized && latest?.run),
          release:RELEASE,
          scheduler:'direct-worker-call+server-reporting',
          d1Binding:Boolean(env.DB),
          kyungsungSecrets:Boolean(env.KS_EMP_ID && env.KS_PASSWORD),
          db,
          latestRun:latest?.run || null,
          latestCollectedAt,
          storedUniversities:rows.length,
          normalUniversities:rows.filter(r=>r.status === '정상').length,
          attentionCount:attention.length,
          attention,
          reporting:{
            initialized:reporting.initialized,
            reportCount:reporting.reportCount,
            reports:reporting.reports,
            settings:reporting.settings,
            nowKst:reporting.nowKst
          },
          checkedAt:new Date().toISOString()
        });
      }catch(e){
        return jsonResponse({
          ok:false,
          release:RELEASE,
          error:e instanceof Error ? e.message : String(e)
        }, 500);
      }
    }

    if (url.pathname === '/collect/once') {
      try {
        const triggerType = url.searchParams.get('source') === 'cron' ? 'cron' : 'manual';
        const collection = await collectHybridAndStore(env, triggerType);
        const reporting = await processReportingAfterCollection(env);
        return jsonResponse({...collection, reporting});
      } catch (e) {
        return jsonResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, 500);
      }
    }

    if(url.pathname === '/api/reporting/status'){
      try { return jsonResponse(await reportingStatus(env)); }
      catch(e){ return jsonResponse({ok:false,error:e instanceof Error?e.message:String(e)},500); }
    }

    if(url.pathname === '/api/reporting/settings'){
      try { return jsonResponse(await getReportingSettings(env)); }
      catch(e){ return jsonResponse({ok:false,error:e instanceof Error?e.message:String(e)},500); }
    }

    if(url.pathname === '/api/reports/backfill'){
      try { return jsonResponse(await backfillReports(env)); }
      catch(e){ return jsonResponse({ok:false,error:e instanceof Error?e.message:String(e)},500); }
    }

    if(url.pathname === '/api/reports/archive'){
      try { return jsonResponse(await reportArchive(env)); }
      catch(e){ return jsonResponse({ok:false,error:e instanceof Error?e.message:String(e)},500); }
    }

    if(url.pathname === '/api/reports'){
      try{
        const key=url.searchParams.get('key');
        return jsonResponse(key ? await reportDetail(env,key) : await listReports(env));
      }catch(e){
        return jsonResponse({ok:false,error:e instanceof Error?e.message:String(e)},500);
      }
    }

    if(url.pathname === '/api/history'){
      try { return jsonResponse(await historyData(env,url.searchParams)); }
      catch(e){ return jsonResponse({ok:false,error:e instanceof Error?e.message:String(e)},500); }
    }

    if (url.pathname === '/debug/ks-repatriate') {
      try {
        return jsonResponse(await kyungsungRepatriateDiagnostics(env));
      } catch (e) {
        return jsonResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, 500);
      }
    }

    if (url.pathname === '/debug/ks-corrections') {
      try {
        return jsonResponse(await kyungsungCorrectionDiagnostics(env));
      } catch (e) {
        return jsonResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, 500);
      }
    }

    if (url.pathname === '/debug/ks-auth-live') {
      try {
        return jsonResponse(await kyungsungLiveWithAccount(env));
      } catch (e) {
        return jsonResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, 500);
      }
    }

    if (url.pathname === '/debug/ks-login-script') {
      try {
        return jsonResponse(await probeKyungsungLoginScript());
      } catch (e) {
        return jsonResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, 500);
      }
    }

    if (url.pathname === '/debug/ks-login-form') {
      try {
        return jsonResponse(await probeKyungsungLoginForm());
      } catch (e) {
        return jsonResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, 500);
      }
    }

    if (url.pathname === '/debug/ks-session') {
      try {
        return jsonResponse(await probeKyungsungSession());
      } catch (e) {
        return jsonResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, 500);
      }
    }

    return withCors(await app.fetch(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const result = await collectHybridAndStore(env, 'cron');
      if (!result?.saved || !result?.runId) {
        throw new Error(`자동수집 실패: ${JSON.stringify(result)}`);
      }
      await processReportingAfterCollection(env);
    })());
  }
};
