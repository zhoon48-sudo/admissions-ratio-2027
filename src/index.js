const UNIVERSITIES = [
  { name: "경성대학교", agency: "UWAY", mode: "admission", url: "https://ratio.uwayapply.com/Sl5KJjlKZiUmOiZKN2ZUZg==" },
  { name: "동아대학교", agency: "JINHAK", mode: "summary", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10591481.html" },
  { name: "동의대학교", agency: "UWAY", mode: "summary", url: "https://ratio.uwayapply.com/Sl5KOmBWSmYlJjomSjdmVGY=" },
  { name: "동서대학교", agency: "JINHAK", mode: "grouped", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10570791.html" },
  { name: "동명대학교", agency: "JINHAK", mode: "grouped", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio30050681.html" },
  { name: "부산외국어대학교", agency: "JINHAK", mode: "grouped", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10750521.html" },
  { name: "신라대학교", agency: "JINHAK", mode: "grouped", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio11020621.html" },
  { name: "고신대학교", agency: "UWAY", mode: "pending", url: "https://ratio.uwayapply.com/Sl5KVyUmYTlKZiUmOiZKN2ZUZg==" },
  { name: "부산가톨릭대학교", agency: "JINHAK", mode: "admission", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10730551.html" },
  { name: "부산대학교", agency: "JINHAK", mode: "admission", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio12100661.html" },
  { name: "부경대학교", agency: "JINHAK", mode: "admission", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10720401.html" },
  { name: "한국해양대학교", agency: "UWAY", mode: "admission", url: "https://ratio.uwayapply.com/Sl5KOmFNOUpmJSY6Jko3ZlRm" },
  { name: "울산대학교", agency: "UWAY", mode: "pending", url: "https://ratio.uwayapply.com/Sl5KVzgmQzpKZiUmOiZKN2ZUZg==" },
  { name: "경남대학교", agency: "JINHAK", mode: "grouped", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10130591.html" },
  { name: "인제대학교", agency: "UWAY", mode: "grouped", url: "https://ratio.uwayapply.com/Sl5KYC9XJUpmJSY6Jko3ZlRm" },
  { name: "영산대학교", agency: "JINHAK", mode: "grouped", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio30100311.html" },
  { name: "경상국립대학교", agency: "JINHAK", mode: "grouped", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10171011.html" },
  { name: "창원대학교", agency: "JINHAK", mode: "grouped", url: "https://addon.jinhakapply.com/RatioV1/RatioH/Ratio11350621.html" }
];

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; AdmissionsRatio2027-Test/1.0)",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7"
};

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(value) {
  return decodeEntities(String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? htmlToText(m[1]).slice(0, 120) : "";
}

function parseNumber(value) {
  const m = String(value || "").replace(/,/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

function rate(pair) {
  return pair && pair.quota > 0 && Number.isFinite(pair.apply) ? +(pair.apply / pair.quota).toFixed(2) : null;
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
  const response = await fetch(target.url, { method: "GET", redirect: "follow", headers: FETCH_HEADERS });
  const contentType = response.headers.get("content-type") || "";
  const charsetMatch = contentType.match(/charset\s*=\s*([^;\s]+)/i);
  let charset = (charsetMatch?.[1] || "utf-8").replace(/["']/g, "").toLowerCase();
  if (/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(charset)) charset = "euc-kr";
  const buffer = await response.arrayBuffer();
  let html, decodedWith = charset;
  try { html = new TextDecoder(charset).decode(buffer); }
  catch { decodedWith = "utf-8"; html = new TextDecoder("utf-8").decode(buffer); }
  return { response, html, contentType, decodedWith, elapsedMs: Date.now() - started };
}

function parseRows(rows, agency) {
  let inner = null, outside = null, total = null, currentSection = null;

  for (const cells of rows) {
    const n = cells.map(x => x.replace(/\s+/g, ""));
    if (!cells.length) continue;

    if (!total && n[0] === "총계" && cells.length >= 3) {
      total = { quota: parseNumber(cells[1]), apply: parseNumber(cells[2]) };
    }

    if (agency === "UWAY") {
      if (!inner && n[0] === "정원내" && cells.length >= 3) inner = { quota: parseNumber(cells[1]), apply: parseNumber(cells[2]) };
      if (!outside && n[0] === "정원외" && cells.length >= 3) outside = { quota: parseNumber(cells[1]), apply: parseNumber(cells[2]) };
    } else {
      if (n.includes("정원내")) currentSection = "inner";
      if (n.includes("정원외")) currentSection = "outside";
      const si = n.findIndex(x => x === "소계");
      if (si >= 0 && cells.length > si + 2) {
        const pair = { quota: parseNumber(cells[si + 1]), apply: parseNumber(cells[si + 2]) };
        if (currentSection === "inner" && !inner) inner = pair;
        if (currentSection === "outside" && !outside) outside = pair;
      }
      if (!inner && n[0] === "정원내" && cells.length >= 3) inner = { quota: parseNumber(cells[1]), apply: parseNumber(cells[2]) };
      if (!outside && n[0] === "정원외" && cells.length >= 3) outside = { quota: parseNumber(cells[1]), apply: parseNumber(cells[2]) };
    }
  }

  return {
    inner: inner ? { ...inner, rate: rate(inner) } : null,
    outside: outside ? { ...outside, rate: rate(outside) } : null,
    total: total ? { ...total, rate: rate(total) } : null
  };
}

async function auditOne(target) {
  const started = Date.now();
  try {
    const { response, html, contentType, decodedWith } = await fetchDecoded(target);
    const rows = extractRows(html);
    const parsed = parseRows(rows, target.agency);
    const accessOk = response.ok && html.length > 0;
    const totalOk = parsed.total?.quota > 0 && Number.isFinite(parsed.total?.apply);
    const innerOk = parsed.inner?.quota > 0 && Number.isFinite(parsed.inner?.apply);
    const level = !accessOk ? "접속실패" : innerOk && totalOk ? "정원내+전체 추출" : totalOk ? "전체만 추출" : "접속만 성공";
    return {
      name: target.name, agency: target.agency, mode: target.mode, level,
      httpStatus: response.status, title: extractTitle(html), rowsFound: rows.length,
      inner: parsed.inner, outside: parsed.outside, total: parsed.total,
      decodedWith, contentType, elapsedMs: Date.now() - started, url: target.url
    };
  } catch (error) {
    return { name: target.name, agency: target.agency, mode: target.mode, level: "접속실패", error: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - started, url: target.url };
  }
}

async function auditAll() {
  const results = [];
  for (let i = 0; i < UNIVERSITIES.length; i += 6) {
    const batch = await Promise.all(UNIVERSITIES.slice(i, i + 6).map(auditOne));
    results.push(...batch);
  }
  const count = level => results.filter(x => x.level === level).length;
  return {
    checkedAt: new Date().toISOString(),
    note: "1차 구조 점검용입니다. '전체만 추출' 대학은 전형별 정원내/정원외 분류 로직을 다음 단계에서 추가합니다. 재외국민 제외 규칙도 아직 최종 적용 전입니다.",
    summary: {
      universities: results.length,
      full: count("정원내+전체 추출"),
      totalOnly: count("전체만 추출"),
      accessOnly: count("접속만 성공"),
      failed: count("접속실패")
    },
    results
  };
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function pairText(p) { return p ? `${Number(p.quota).toLocaleString("ko-KR")} / ${Number(p.apply).toLocaleString("ko-KR")}` : "-"; }

function auditHtml(data) {
  const rows = data.results.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.agency)}</td><td>${esc(r.mode)}</td><td>${esc(r.httpStatus ?? "-")}</td><td>${esc(r.level)}</td><td>${pairText(r.inner)}</td><td>${pairText(r.total)}</td><td>${esc(r.title || r.error || "")}</td></tr>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>18개 대학 수집 점검</title><style>body{font-family:Arial,'Malgun Gothic',sans-serif;margin:24px;color:#222}h1{font-size:22px}.summary{padding:12px;background:#f5f7f9;border:1px solid #dfe5ea;margin:12px 0;line-height:1.7}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #d9dee3;padding:7px;text-align:center}th{background:#eef2f5}td:nth-child(2),td:last-child{text-align:left}.note{font-size:12px;color:#666;margin:10px 0}</style></head><body><h1>2027 부·울·경 18개 대학 Cloudflare 수집 1차 점검</h1><div class="summary">전체 ${data.summary.universities}교 · <b>정원내+전체 추출 ${data.summary.full}교</b> · 전체만 추출 ${data.summary.totalOnly}교 · 접속만 성공 ${data.summary.accessOnly}교 · 접속실패 ${data.summary.failed}교</div><div class="note">${esc(data.note)}</div><table><thead><tr><th>#</th><th>대학</th><th>업체</th><th>기존 방식</th><th>HTTP</th><th>1차 판정</th><th>정원내 모집/지원</th><th>전체 모집/지원</th><th>페이지 제목/오류</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

async function legacyParse(kind) {
  const target = kind === "uway" ? UNIVERSITIES[0] : UNIVERSITIES.find(x => x.name === "창원대학교");
  return auditOne(target);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "admissions-ratio-2027", stage: "18-university-audit" });
    if (url.pathname === "/test/uway" || url.pathname === "/parse/uway") return Response.json(await legacyParse("uway"), { headers: { "Cache-Control": "no-store" } });
    if (url.pathname === "/test/jinhak" || url.pathname === "/parse/jinhak") return Response.json(await legacyParse("jinhak"), { headers: { "Cache-Control": "no-store" } });
    if (url.pathname === "/api/audit/all") return Response.json(await auditAll(), { headers: { "Cache-Control": "no-store" } });
    if (url.pathname === "/audit/all") {
      const data = await auditAll();
      return new Response(auditHtml(data), { headers: { "content-type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } });
    }
    return new Response("Admissions Ratio Worker OK\n\n18개 대학 점검: /audit/all", { headers: { "content-type": "text/plain; charset=UTF-8" } });
  }
};
