import app from './db-stage.js';
import { probeKyungsungSession, probeKyungsungLoginForm, probeKyungsungLoginScript } from './ks-session-probe.js';
import { kyungsungLiveWithAccount } from './ks-auth.js';

const PUBLIC_COLLECT_URL = 'https://admissions-ratio-2027-test.zhoon48.workers.dev/collect/once?source=cron';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
      const response = await fetch(PUBLIC_COLLECT_URL, {
        headers: {
          'Accept': 'application/json',
          'X-Admissions-Trigger': 'cron'
        }
      });
      const body = await response.json();

      if (!response.ok || !body?.saved || !body?.runId) {
        throw new Error(`자동수집 실패: ${JSON.stringify(body)}`);
      }

      await env.DB.prepare('UPDATE crawl_runs SET trigger_type=? WHERE id=?')
        .bind('cron', body.runId)
        .run();
    })());
  }
};
