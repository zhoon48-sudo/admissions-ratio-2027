import app from './db-stage.js';
import { probeKyungsungSession, probeKyungsungLoginForm, probeKyungsungLoginScript } from './ks-session-probe.js';
import { kyungsungLiveWithAccount, kyungsungCorrectionDiagnostics } from './ks-auth.js';
import { collectHybridAndStore } from './hybrid-store.js';

const RELEASE = '2026-09-09-r3';
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
        scheduler:'direct-worker-call',
        d1Binding:Boolean(env.DB),
        kyungsungSecrets:Boolean(env.KS_EMP_ID && env.KS_PASSWORD),
        checkedAt:new Date().toISOString()
      });
    }

    if (url.pathname === '/collect/once') {
      try {
        const triggerType = url.searchParams.get('source') === 'cron' ? 'cron' : 'manual';
        return jsonResponse(await collectHybridAndStore(env, triggerType));
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
    })());
  }
};
