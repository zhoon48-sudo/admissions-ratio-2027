const KS_BOARD_URL = 'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1';
const KS_LIVE_URL = 'https://ipsiu.ks.ac.kr/ipsi/servlet/ipsi.Manager?cmd=cmp_live';
const KS_LOGIN_URL = 'https://ipsiu.ks.ac.kr/ipsi/servlet/ipsi.Manager?cmd=brf_login';

function firstCookie(setCookie) {
  if (!setCookie) return '';
  return setCookie.split(',').map(v => v.trim()).map(v => v.split(';')[0]).filter(Boolean).join('; ');
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  if (m) return m[1];
  const m2 = tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'));
  return m2 ? m2[1] : '';
}

export async function probeKyungsungLoginForm() {
  const started = Date.now();
  const response = await fetch(KS_LOGIN_URL, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; AdmissionsRatio2027/1.0)'
    },
    redirect: 'follow'
  });
  const html = await response.text();
  const forms = [];

  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const formTag = `<form${m[1]}>`;
    const body = m[2];
    const inputs = [];
    for (const im of body.matchAll(/<input\b[^>]*>/gi)) {
      const tag = im[0];
      const type = (attr(tag, 'type') || 'text').toLowerCase();
      inputs.push({
        name: attr(tag, 'name') || null,
        id: attr(tag, 'id') || null,
        type,
        value: type === 'password' ? null : (attr(tag, 'value') || null)
      });
    }
    forms.push({
      method: (attr(formTag, 'method') || 'get').toUpperCase(),
      action: attr(formTag, 'action') || null,
      name: attr(formTag, 'name') || null,
      id: attr(formTag, 'id') || null,
      inputs
    });
  }

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    ok: response.ok,
    httpStatus: response.status,
    finalUrl: response.url,
    contentType: response.headers.get('content-type') || '',
    elapsedMs: Date.now() - started,
    title,
    forms,
    htmlLength: html.length
  };
}

export async function probeKyungsungSession() {
  const started = Date.now();

  const board = await fetch(KS_BOARD_URL, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; AdmissionsRatio2027/1.0)'
    },
    redirect: 'follow'
  });
  await board.arrayBuffer();

  const setCookie = board.headers.get('set-cookie') || '';
  const cookie = firstCookie(setCookie);

  const headers = {
    'Accept': 'application/json,text/plain,*/*',
    'User-Agent': 'Mozilla/5.0 (compatible; AdmissionsRatio2027/1.0)',
    'Referer': KS_BOARD_URL,
    'X-Requested-With': 'XMLHttpRequest'
  };
  if (cookie) headers['Cookie'] = cookie;

  const live = await fetch(KS_LIVE_URL, {
    headers,
    redirect: 'follow'
  });
  const text = await live.text();

  return {
    boardStatus: board.status,
    sessionCookieReceived: Boolean(cookie),
    sessionCookieName: cookie ? cookie.split('=')[0] : null,
    liveStatus: live.status,
    liveOk: live.ok,
    contentType: live.headers.get('content-type') || '',
    elapsedMs: Date.now() - started,
    preview: text.slice(0, 1200)
  };
}
