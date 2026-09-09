import { collectHybrid as collectBase } from './hybrid-collector-ks-testurl.js';

const API='https://ipsiu.ks.ac.kr/ipsi/servlet/ipsi.Manager';
const LOGIN=API+'?cmd=brf_login';

function cookieOf(headers){
  const raw=headers.get('set-cookie')||'';
  return raw?raw.split(';')[0]:'';
}

async function forceRefresh(env){
  if(!env?.KS_EMP_ID||!env?.KS_PASSWORD)return {ok:false,error:'KS credentials unavailable'};
  try{
    const first=await fetch(LOGIN,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},redirect:'manual'});
    await first.text();
    let cookie=cookieOf(first.headers);

    const body=new URLSearchParams({cmd:'brf_login_check',empId:env.KS_EMP_ID,pw:env.KS_PASSWORD});
    const login=await fetch(API+'?cmd=brf_login_check',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Referer':LOGIN,...(cookie?{'Cookie':cookie}:{})},
      body:body.toString(),redirect:'manual'
    });
    const loginText=await login.text();
    let loginJson=null;try{loginJson=JSON.parse(loginText)}catch{}
    const newCookie=cookieOf(login.headers);if(newCookie)cookie=newCookie;
    if(!login.ok||loginJson?.ok===false)return {ok:false,error:`KS login failed (${login.status})`};

    const crawlBody=new URLSearchParams({cmd:'cmp_crawl_run',roundId:'3'});
    const crawl=await fetch(API+'?cmd=cmp_crawl_run',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Accept':'application/json,text/plain,*/*','Referer':'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1',...(cookie?{'Cookie':cookie}:{})},
      body:crawlBody.toString(),redirect:'manual'
    });
    const txt=await crawl.text();
    let j=null;try{j=JSON.parse(txt)}catch{}
    if(!crawl.ok||j?.ok===false)return {ok:false,error:j?.error||`KS crawl failed (${crawl.status})`};
    return {ok:true,refreshedAt:new Date().toISOString()};
  }catch(e){
    return {ok:false,error:e instanceof Error?e.message:String(e)};
  }
}

export async function collectHybrid(env){
  // 경성대 서버 저장값을 먼저 최신화한 뒤 cmp_live/test_url을 읽습니다.
  const ksRefresh=await forceRefresh(env);
  const data=await collectBase(env);
  return {...data,ksRefresh};
}
