import app from './db-stage.js';

export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const response = await app.fetch(new Request('https://internal/collect/once'), env, ctx);
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
