import { collectHybrid as collectBase } from './hybrid-collector-direct-targets.js';

const TARGETS = {
  '신라대학교': {
    kind: 'silla',
    expectedInnerQuota: 1366,
    expectedTotalQuota: 1472,
    url: 'https://addon.jinhakapply.com/RatioV1/RatioH/Ratio11020621.html'
  },
  '부산외국어대학교': {
    kind: 'bufs',
    expectedInnerQuota: 1394,
    expectedTotalQuota: 1554,
    url: 'https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10750521.html'
  }
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
  'Referer': 'https://www.jinhakapply.com/',
  'Cache-Control': 'no-cache, no-store, max-age=0',
  'Pragma': 'no-cache'
};

function rate(quota, apply) {
  return quota > 0 ? +(apply / quota).toFixed(2) : null;
}

function metric(quota, apply) {
  return { quota, apply, rate: rate(quota, apply) };
}

function plain(value) {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanMarkdown(value) {
  return String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pureInteger(value) {
  const s = String(value || '').replace(/,/g, '').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

function htmlPair(cells) {
  const nums = cells.map(pureInteger).filter(v => v !== null);
  if (nums.length < 2) return null;
  return { quota: nums[nums.length - 2], apply: nums[nums.length - 1] };
}

function markdownCells(raw) {
  const cleaned = cleanMarkdown(raw);
  if (!cleaned.includes('|')) return [];
  return cleaned.split('|').map(x => x.trim()).filter(Boolean);
}

// Markdown 표에서는 전형명 셀 안의 숫자는 무시하고 숫자만 있는 셀만 사용합니다.
// 예: "| 정원내 소계 | 1,366 | 3,366 | 2.46 : 1 |" -> 1,366 / 3,366
function readerPair(raw) {
  const cells = markdownCells(raw);
  if (cells.length) {
    const nums = cells.map(pureInteger).filter(v => v !== null);
    if (nums.length >= 2) {
      return { quota: nums[nums.length - 2], apply: nums[nums.length - 1] };
    }
  }

  // 비표준 Reader 응답용 보조 처리
  let s = cleanMarkdown(raw)
    .replace(/\d+(?:\.\d+)?\s*:\s*1\s*\|?\s*$/, ' ')
    .trim();
  const nums = [...s.matchAll(/(?:^|\s)(\d{1,3}(?:,\d{3})*|\d+)(?=\s|$)/g)]
    .map(m => Number(m[1].replace(/,/g, '')));
  if (nums.length < 2) return null;
  return { quota: nums[nums.length - 2], apply: nums[nums.length - 1] };
}

function readerLabel(raw) {
  const cells = markdownCells(raw);
  if (!cells.length) return cleanMarkdown(raw);
  return cells
    .filter(cell => pureInteger(cell) === null)
    .filter(cell => !/^\d+(?:\.\d+)?\s*:\s*1$/.test(cell))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSourceTime(text) {
  const t = plain(text);
  const m = t.match(/(20\d{2})-(\d{2})-(\d{2})\s*(오전|오후)\s*(\d{1,2}):(\d{2})\s*현황/);
  if (!m) return null;
  let hour = Number(m[5]);
  if (m[4] === '오후' && hour < 12) hour += 12;
  if (m[4] === '오전' && hour === 12) hour = 0;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${String(hour).padStart(2, '0')}:${m[6]}:00+09:00`).toISOString();
}

function validate(spec, values, source, sourceCollectedAt) {
  const { innerQuota, innerApply, totalQuota, totalApply, excludedQuota, excludedApply } = values;
  if (![innerQuota, innerApply, totalQuota, totalApply, excludedQuota, excludedApply].every(Number.isFinite)) {
    return { ok: false, error: '필수 합계값을 읽지 못했습니다.', source };
  }
  if (innerQuota !== spec.expectedInnerQuota) {
    return { ok: false, error: `정원내 모집인원 ${innerQuota}명 ≠ ${spec.expectedInnerQuota}명`, source };
  }
  if (totalQuota !== spec.expectedTotalQuota) {
    return { ok: false, error: `재외국민 제외 전체 모집인원 ${totalQuota}명 ≠ ${spec.expectedTotalQuota}명`, source };
  }
  if (totalApply < innerApply) {
    return { ok: false, error: '전체 지원인원이 정원내 지원인원보다 작습니다.', source };
  }
  return {
    ok: true,
    source,
    innerQuota,
    innerApply,
    totalQuota,
    totalApply,
    excludedQuota,
    excludedApply,
    sourceCollectedAt: sourceCollectedAt || null
  };
}

function findSummaryTable(html, kind) {
  const candidates = [];
  for (const m of String(html || '').matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const text = plain(m[0]);
    const common = /재외국민/.test(text) && /모집인원/.test(text) && /지원인원/.test(text);
    const match = kind === 'silla'
      ? common && /정원내\s*소계/.test(text)
      : common && /\[정원외\]/.test(text) && /총계/.test(text);
    if (match) candidates.push({ html: m[0], length: text.length });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.length - b.length);
  return candidates[0].html;
}

function parseSillaHtml(html, spec) {
  const table = findSummaryTable(html, 'silla');
  if (!table) return { ok: false, error: '신라대 전형별 경쟁률 현황 표를 찾지 못했습니다.', source: 'JINHAK_DIRECT_SILLA' };

  let scope = null;
  let inner = null;
  let repatriate = null;
  let outsideSummary = null;
  const outsideRows = [];

  for (const m of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const c of m[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)) cells.push(plain(c[2]));
    if (!cells.length) continue;

    const text = cells.join(' ').replace(/\s+/g, ' ').trim();
    const first = String(cells[0] || '').replace(/\s+/g, '');
    if (first === '정원내') scope = 'inner';
    else if (first === '정원외') scope = 'outside';

    const pair = htmlPair(cells);
    if (/정원내\s*소계/.test(text) && pair) {
      inner = pair;
      continue;
    }
    if (/재외국민/.test(text) && pair) {
      repatriate = pair;
      continue;
    }

    if (scope === 'outside' && pair) {
      const label = cells
        .filter(x => x && pureInteger(x) === null)
        .filter(x => !/^\d+(?:\.\d+)?\s*:\s*1$/.test(x))
        .filter(x => !/^정원외$/.test(x.replace(/\s+/g, '')))
        .join(' ')
        .trim();

      if (/정원외\s*(소계|합계)|소계|합계|총계/.test(text) || !label) {
        outsideSummary = pair;
        continue;
      }
      if (/[가-힣A-Za-z]/.test(label) && !/재외국민/.test(text)) outsideRows.push(pair);
    }
  }

  if (!inner || !repatriate) {
    return { ok: false, error: '신라대 정원내 소계 또는 재외국민 행을 읽지 못했습니다.', source: 'JINHAK_DIRECT_SILLA' };
  }
  if (!outsideSummary) {
    outsideSummary = {
      quota: outsideRows.reduce((s, r) => s + r.quota, 0) + repatriate.quota,
      apply: outsideRows.reduce((s, r) => s + r.apply, 0) + repatriate.apply
    };
  }

  return validate(spec, {
    innerQuota: inner.quota,
    innerApply: inner.apply,
    totalQuota: inner.quota + outsideSummary.quota - repatriate.quota,
    totalApply: inner.apply + outsideSummary.apply - repatriate.apply,
    excludedQuota: repatriate.quota,
    excludedApply: repatriate.apply
  }, 'JINHAK_DIRECT_SILLA', parseSourceTime(html));
}

function parseBufsHtml(html, spec) {
  const table = findSummaryTable(html, 'bufs');
  if (!table) return { ok: false, error: '부산외대 전형별 경쟁률 현황 표를 찾지 못했습니다.', source: 'JINHAK_DIRECT_BUFS' };

  const innerRows = [];
  let repatriate = null;
  let totalSummary = null;

  for (const m of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const c of m[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)) cells.push(plain(c[2]));
    if (!cells.length) continue;

    const text = cells.join(' ').replace(/\s+/g, ' ').trim();
    if (!text || /전형명.*모집인원.*지원인원/.test(text)) continue;
    const pair = htmlPair(cells);
    if (!pair) continue;

    if (/^총계\b|\s총계\b/.test(text)) {
      totalSummary = pair;
      continue;
    }
    if (/재외국민/.test(text)) {
      repatriate = pair;
      continue;
    }
    if (!/\[정원외\]/.test(text) && /[가-힣A-Za-z]/.test(text)) innerRows.push(pair);
  }

  if (!repatriate || !totalSummary) {
    return { ok: false, error: '부산외대 총계 또는 재외국민 행을 읽지 못했습니다.', source: 'JINHAK_DIRECT_BUFS' };
  }

  const innerQuota = innerRows.reduce((s, r) => s + r.quota, 0);
  const innerApply = innerRows.reduce((s, r) => s + r.apply, 0);

  return validate(spec, {
    innerQuota,
    innerApply,
    totalQuota: totalSummary.quota - repatriate.quota,
    totalApply: totalSummary.apply - repatriate.apply,
    excludedQuota: repatriate.quota,
    excludedApply: repatriate.apply
  }, 'JINHAK_DIRECT_BUFS', parseSourceTime(html));
}

function summaryLines(text) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex(line => /전형별\s*경쟁률\s*현황/.test(cleanMarkdown(line)));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (i > start + 1 && /^#{1,4}\s/.test(lines[i].trim())) break;
    out.push(lines[i]);
  }
  return out;
}

function parseSillaReader(text, spec) {
  const section = summaryLines(text);
  if (!section.length) return { ok: false, error: 'Reader에서 신라대 전형별 현황을 찾지 못했습니다.', source: 'JINA_SILLA' };

  let inner = null;
  let repatriate = null;
  let outsideSummary = null;
  let seenOutside = false;
  const outsideRows = [];

  for (const raw of section) {
    const rowText = cleanMarkdown(raw);
    if (!rowText) continue;
    const pair = readerPair(raw);

    if (/정원내\s*소계/.test(rowText) && pair) {
      inner = pair;
      continue;
    }
    if (/정원외/.test(rowText)) seenOutside = true;
    if (/재외국민/.test(rowText) && pair) {
      repatriate = pair;
      continue;
    }
    if (!seenOutside || !pair) continue;

    const label = readerLabel(raw)
      .replace(/^정원외\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (/정원외\s*(소계|합계)|소계|합계|총계/.test(rowText) || !label) {
      outsideSummary = pair;
      continue;
    }
    if (/[가-힣A-Za-z]/.test(label) && !/재외국민/.test(rowText)) outsideRows.push(pair);
  }

  if (!inner || !repatriate) {
    return { ok: false, error: 'Reader에서 신라대 정원내 소계/재외국민 행을 읽지 못했습니다.', source: 'JINA_SILLA' };
  }
  if (!outsideSummary) {
    outsideSummary = {
      quota: outsideRows.reduce((s, r) => s + r.quota, 0) + repatriate.quota,
      apply: outsideRows.reduce((s, r) => s + r.apply, 0) + repatriate.apply
    };
  }

  return validate(spec, {
    innerQuota: inner.quota,
    innerApply: inner.apply,
    totalQuota: inner.quota + outsideSummary.quota - repatriate.quota,
    totalApply: inner.apply + outsideSummary.apply - repatriate.apply,
    excludedQuota: repatriate.quota,
    excludedApply: repatriate.apply
  }, 'JINA_SILLA', parseSourceTime(text));
}

function parseBufsReader(text, spec) {
  const section = summaryLines(text);
  if (!section.length) return { ok: false, error: 'Reader에서 부산외대 전형별 현황을 찾지 못했습니다.', source: 'JINA_BUFS' };

  const innerRows = [];
  let repatriate = null;
  let totalSummary = null;

  for (const raw of section) {
    const rowText = cleanMarkdown(raw);
    if (!rowText || /전형명.*모집인원.*지원인원/.test(rowText) || /^---/.test(rowText)) continue;
    const pair = readerPair(raw);
    if (!pair) continue;

    if (/^총계\b/.test(rowText)) {
      totalSummary = pair;
      continue;
    }
    if (/재외국민/.test(rowText)) {
      repatriate = pair;
      continue;
    }
    if (!/\[정원외\]/.test(rowText) && /[가-힣A-Za-z]/.test(readerLabel(raw))) innerRows.push(pair);
  }

  if (!repatriate || !totalSummary) {
    return { ok: false, error: 'Reader에서 부산외대 총계/재외국민 행을 읽지 못했습니다.', source: 'JINA_BUFS' };
  }

  const innerQuota = innerRows.reduce((s, r) => s + r.quota, 0);
  const innerApply = innerRows.reduce((s, r) => s + r.apply, 0);

  return validate(spec, {
    innerQuota,
    innerApply,
    totalQuota: totalSummary.quota - repatriate.quota,
    totalApply: totalSummary.apply - repatriate.apply,
    excludedQuota: repatriate.quota,
    excludedApply: repatriate.apply
  }, 'JINA_BUFS', parseSourceTime(text));
}

function addCacheBuster(url, token) {
  const u = new URL(url);
  u.searchParams.set('__ksu_refresh', token);
  return u.toString();
}

async function decodeResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  let charset = (contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1] || 'utf-8').replace(/["']/g, '').toLowerCase();
  if (/^(euc[-_]?kr|ks_c_5601-1987|korean)$/i.test(charset)) charset = 'euc-kr';
  const buf = await response.arrayBuffer();
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

function newestSuccessful(candidates) {
  const ok = candidates.filter(x => x?.ok);
  if (!ok.length) return null;
  ok.sort((a, b) => {
    const ta = Date.parse(a.sourceCollectedAt || '') || 0;
    const tb = Date.parse(b.sourceCollectedAt || '') || 0;
    return tb - ta;
  });
  return ok[0];
}

async function fetchFresh(result, spec) {
  const parseHtml = spec.kind === 'silla' ? parseSillaHtml : parseBufsHtml;
  const parseReader = spec.kind === 'silla' ? parseSillaReader : parseBufsReader;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const freshUrl = addCacheBuster(result.url, token);
  const attempts = [];
  const candidates = [];

  for (const url of [freshUrl, result.url]) {
    try {
      const response = await fetch(url, { headers: HEADERS, redirect: 'follow', cache: 'no-store' });
      if (!response.ok) {
        attempts.push(`direct ${response.status}`);
        continue;
      }
      const html = await decodeResponse(response);
      const parsed = parseHtml(html, spec);
      attempts.push(`direct ${parsed.ok ? 'ok' : parsed.error}`);
      if (parsed.ok) candidates.push(parsed);
    } catch (e) {
      attempts.push(`direct ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const sourceUrl of [freshUrl, result.url]) {
    try {
      const readerUrl = `https://r.jina.ai/${sourceUrl}`;
      const response = await fetch(readerUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Respond-With': 'markdown',
          'X-No-Cache': 'true',
          'X-Engine': 'browser'
        },
        redirect: 'follow',
        cache: 'no-store'
      });
      if (!response.ok) {
        attempts.push(`reader ${response.status}`);
        continue;
      }
      const text = await response.text();
      const parsed = parseReader(text, spec);
      attempts.push(`reader ${parsed.ok ? 'ok' : parsed.error}`);
      if (parsed.ok) candidates.push(parsed);
    } catch (e) {
      attempts.push(`reader ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const best = newestSuccessful(candidates);
  if (best) return { ...best, attempts };
  return {
    ok: false,
    source: spec.kind === 'silla' ? 'JINHAK_SILLA_PRIORITY' : 'JINHAK_BUFS_PRIORITY',
    error: attempts.join(' | ') || '최신 원본 조회 실패',
    attempts
  };
}

function applyFresh(result, fresh) {
  const outsideQuota = fresh.totalQuota - fresh.innerQuota;
  const outsideApply = fresh.totalApply - fresh.innerApply;
  return {
    ...result,
    level: '정상',
    parser: `${fresh.source}_SUMMARY_PRIORITY`,
    inner: metric(fresh.innerQuota, fresh.innerApply),
    outside: metric(outsideQuota, outsideApply),
    total: metric(fresh.totalQuota, fresh.totalApply),
    excluded: [`재외국민 전형행 제외: 모집 ${fresh.excludedQuota}명 / 지원 ${fresh.excludedApply}명`],
    warnings: [],
    sourceCollectedAt: fresh.sourceCollectedAt || result.sourceCollectedAt || null,
    targetFresh: fresh
  };
}

export async function diagnosePrioritySources() {
  const results = {};
  for (const [name, spec] of Object.entries(TARGETS)) {
    results[name] = await fetchFresh({ name, url: spec.url }, spec);
  }
  return { checkedAt: new Date().toISOString(), results };
}

export async function collectHybrid(env) {
  const data = await collectBase(env);
  const targets = (data.results || []).filter(r => TARGETS[r.name]);
  if (!targets.length) return data;

  const freshPairs = await Promise.all(
    targets.map(async r => [r.name, await fetchFresh(r, TARGETS[r.name])])
  );
  const freshByName = new Map(freshPairs);
  const results = (data.results || []).map(r => {
    const fresh = freshByName.get(r.name);
    return fresh?.ok ? applyFresh(r, fresh) : r;
  });

  const ok = results.filter(r => r.level === '정상').length;
  return {
    ...data,
    targetFresh: Object.fromEntries(freshPairs),
    summary: {
      ...(data.summary || {}),
      universities: results.length,
      ok,
      delayed: results.filter(r => r.level === '지연').length,
      needVerify: results.filter(r => r.level === '검증필요').length,
      failed: results.filter(r => r.level === '접속실패').length
    },
    results
  };
}
