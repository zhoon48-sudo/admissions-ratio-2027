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

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; AdmissionsRatio2027-Test/1.0)",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7"
};

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 200) : null;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  const m = String(value || "").replace(/,/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

function ratio(quota, apply) {
  if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(apply)) return null;
  return +(apply / quota).toFixed(2);
}

function extractRows(html) {
  const rows = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm;
  while ((rm = rowRe.exec(html))) {
    const cells = [];
    const cellRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cm;
    while ((cm = cellRe.exec(rm[1]))) cells.push(htmlToText(cm[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

async function fetchDecoded(target) {
  const started = Date.now();
  const response = await fetch(target.url, {
    method: "GET",
    redirect: "follow",
    headers: FETCH_HEADERS
  });

  const contentType = response.headers.get("content-type") || "";
  const charsetMatch = contentType.match(/charset\s*=\s*([^;\s]+)/i);
  let charset = (charsetMatch?.[1] || "utf-8").replace(/["']/g, "").toLowerCase();
  if (/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(charset)) charset = "euc-kr";

  const buffer = await response.arrayBuffer();
  let html;
  let decodedWith = charset;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    decodedWith = "utf-8";
    html = new TextDecoder("utf-8").decode(buffer);
  }

  return {
    response,
    html,
    contentType,
    decodedWith,
    byteLength: buffer.byteLength,
    elapsedMs: Date.now() - started
  };
}

async function probeTarget(target) {
  const started = Date.now();
  try {
    const { response, html, contentType, decodedWith, byteLength } = await fetchDecoded(target);
    return {
      test: target.label,
      success: response.ok && html.length > 0,
      httpStatus: response.status,
      httpStatusText: response.statusText,
      finalUrl: response.url,
      contentType,
      decodedWith,
      byteLength,
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

function parseUwayRows(rows) {
  let inner = null;
  let outside = null;
  let total = null;

  for (const cells of rows) {
    if (cells.length < 4) continue;
    const label = cells[0].replace(/\s+/g, "");
    if (!inner && label === "정원내") {
      inner = { quota: parseNumber(cells[1]), apply: parseNumber(cells[2]) };
    } else if (!outside && label === "정원외") {
      outside = { quota: parseNumber(cells[1]), apply: parseNumber(cells[2]) };
    } else if (!total && label === "총계") {
      total = { quota: parseNumber(cells[1]), apply: parseNumber(cells[2]) };
    }
    if (inner && outside && total) break;
  }

  return { inner, outside, total };
}

function parseJinhakRows(rows) {
  let currentSection = null;
  let inner = null;
  let outside = null;
  let total = null;

  for (const cells of rows) {
    const normalized = cells.map(x => x.replace(/\s+/g, ""));

    if (!total && normalized[0] === "총계" && cells.length >= 4) {
      total = { quota: parseNumber(cells[1]), apply: parseNumber(cells[2]) };
    }

    if (normalized.includes("정원내")) currentSection = "inner";
    if (normalized.includes("정원외")) currentSection = "outside";

    const subtotalIndex = normalized.findIndex(x => x === "소계");
    if (subtotalIndex >= 0) {
      const quota = parseNumber(cells[subtotalIndex + 1]);
      const apply = parseNumber(cells[subtotalIndex + 2]);
      if (currentSection === "inner" && !inner) inner = { quota, apply };
      if (currentSection === "outside" && !outside) outside = { quota, apply };
    }

    if (inner && outside && total) break;
  }

  return { inner, outside, total };
}

function enrichResult(parsed) {
  const inner = parsed.inner ? { ...parsed.inner, rate: ratio(parsed.inner.quota, parsed.inner.apply) } : null;
  const outside = parsed.outside ? { ...parsed.outside, rate: ratio(parsed.outside.quota, parsed.outside.apply) } : null;
  const total = parsed.total ? { ...parsed.total, rate: ratio(parsed.total.quota, parsed.total.apply) } : null;
  return { inner, outside, total };
}

async function parseTarget(kind) {
  const target = TARGETS[kind];
  const started = Date.now();
  try {
    const { response, html, contentType, decodedWith } = await fetchDecoded(target);
    const rows = extractRows(html);
    const parsed = kind === "uway" ? parseUwayRows(rows) : parseJinhakRows(rows);
    const result = enrichResult(parsed);
    const ok = response.ok && result.inner?.quota > 0 && result.total?.quota > 0;

    return {
      test: target.label,
      success: ok,
      httpStatus: response.status,
      contentType,
      decodedWith,
      title: extractTitle(html),
      rowsFound: rows.length,
      ...result,
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
        stage: "first-parser-test"
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

    if (url.pathname === "/parse/uway") {
      return Response.json(await parseTarget("uway"), {
        headers: { "Cache-Control": "no-store" }
      });
    }

    if (url.pathname === "/parse/jinhak") {
      return Response.json(await parseTarget("jinhak"), {
        headers: { "Cache-Control": "no-store" }
      });
    }

    return new Response("Admissions Ratio Worker OK", {
      headers: { "content-type": "text/plain; charset=UTF-8" }
    });
  }
};
