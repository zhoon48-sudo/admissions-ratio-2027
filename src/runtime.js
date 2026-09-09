import app from './db-stage.js';
import { probeKyungsungSession, probeKyungsungLoginForm, probeKyungsungLoginScript } from './ks-session-probe.js';
import { kyungsungLiveWithAccount, kyungsungCorrectionDiagnostics } from './ks-auth.js';
import { collectHybridAndStore } from './hybrid-store.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/collect/once') {
      try {
        const triggerType = url.searchParams.get('source') === 'cron' ? 'cron' : 'manual';
        return Response.json(await collectHybridAndStore(env, triggerType), {
          headers: { 'Cache-Control': 'no-store' }
        });
      } catch (e) {
        return Response.json({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, {
          status: 500,
          headers: { 'Cache-Control': 'no-store' }
        });
      }
    }

    if (url.pathname === '/debug/ks-corrections') {
      try {
        return Response.json(await kyungsungCorrectionDiagnostics(env), {
          headers: { 'Cache-Control': 'no-store' }
        });
      } catch (e) {
        return Response.json({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, {
          status: 500,
          headers: { 'Cache-Control': 'no-store' }
        });
      }
    }

    if (url.pathname === '/debug/ks-auth-live') {
      try {
        return Response.json(await kyungsungLiveWithAccount(env), {
          headers: { 'Cache-Control': 'no-store' }
        });
      } catch (e) {
        return Response.json({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, {
          status: 500,
          headers: { 'Cache-Control': 'no-store' }
        });
      }
    }

    if (url.pathname === '/debug/ks-login-script') {
      try {
        return Response.json(await probeKyungsungLoginScript(), {
          headers: { 'Cache-Control': 'no-store' }
        });
      } catch (e) {
        return Response.json({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, {
          status: 500,
          headers: { 'Cache-Control': 'no-store' }
        });
      }
    }

    if (url.pathname === '/debug/ks-login-form') {
      try {
        return Response.json(await probeKyungsungLoginForm(), {
          headers: { 'Cache-Control': 'no-store' }
        });
      } catch (e) {
        return Response.json({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, {
          status: 500,
          headers: { 'Cache-Control': 'no-store' }
        });
      }
    }

    if (url.pathname === '/debug/ks-session') {
      try {
        return Response.json(await probeKyungsungSession(), {
          headers: { 'Cache-Control': 'no-store' }
        });
      } catch (e) {
        return Response.json({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        }, {
          status: 500,
          headers: { 'Cache-Control': 'no-store' }
        });
      }
    }
    return app.fetch(request, env, ctx);
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
