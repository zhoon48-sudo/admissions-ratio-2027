const TARGETS = {
  uway: {
    label: "경성대학교 / 유웨이",
    url: "https://ratio.uwayapply.com/Sl5KJjlKZiUmOiZKN2ZUZg=="
  },
  jinhak: {
    label: "창원대학교 / 진학사",
    url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio11350621.html"
  }
};

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim().slice(0, 200) : null;
}

async function probeTarget(target) {
  const started = Date.now();

  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AdmissionsRatio2027-Test/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7"
      }
    });

    const html = await response.text();

    return {
      test: target.label,
      success: response.ok && html.length > 0,
      httpStatus: response.status,
      httpStatusText: response.statusText,
      finalUrl: response.url,
      contentType: response.headers.get("content-type"),
      htmlLength: html.length,
      title: extractTitle(html),
      hasCompetitionKeyword: /경쟁률|competition|ratio/i.test(html),
      elapsedMs: Date.now() - started,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      test: target.label,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
      checkedAt: new Date().toISOString()
    };
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "admissions-ratio-2027",
        stage: "external-fetch-test"
      });
    }

    if (url.pathname === "/test/uway") {
      return Response.json(await probeTarget(TARGETS.uway), {
        headers: { "Cache-Control": "no-store" }
      });
    }

    if (url.pathname === "/test/jinhak") {
      return Response.json(await probeTarget(TARGETS.jinhak), {
        headers: { "Cache-Control": "no-store" }
      });
    }

    return new Response("Admissions Ratio Worker OK", {
      headers: { "content-type": "text/plain; charset=UTF-8" }
    });
  }
};
