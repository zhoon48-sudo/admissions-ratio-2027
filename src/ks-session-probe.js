const KS_BOARD_URL = 'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1';
const KS_LIVE_URL = 'https://ipsiu.ks.ac.kr/ipsi/servlet/ipsi.Manager?cmd=cmp_live';

function firstCookie(setCookie) {
  if (!setCookie) return '';
  return setCookie.split(',').map(v => v.trim()).map(v => v.split(';')[0]).filter(Boolean).join('; ');
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
