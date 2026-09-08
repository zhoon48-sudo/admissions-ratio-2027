import app from './db-stage.js';

const PUBLIC_COLLECT_URL = 'https://admissions-ratio-2027-test.zhoon48.workers.dev/collect/once?source=cron';

export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      // Cron 자체 실행 위치와 실제 수집 위치를 분리합니다.
      // 공개 HTTP 경로로 다시 들어오게 하면 fetch 요청에 지정한 Seoul placement가 적용됩니다.
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
