import { collectHybrid as collectBase } from './hybrid-collector-silla-final.js';

const KS_API='https://ipsiu.ks.ac.kr/ipsi/servlet/ipsi.Manager';
const KS_LOGIN=KS_API+'?cmd=brf_login';

function firstCookie(headers){
  const raw=headers.get('set-cookie')||'';
  return raw?raw.split(';')[0]:'';
}

async function refreshKyungsungCrawl(env){
  if(!env?.KS_EMP_ID||!env?.KS_PASSWORD) return {ok:false,error:'KS credentials unavailable'};
  try{
    const first=await fetch(KS_LOGIN,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},redirect:'manual'});
    await first.text();
    let cookie=firstCookie(first.headers);

    const loginBody=new URLSearchParams({cmd:'brf_login_check',empId:env.KS_EMP_ID,pw:env.KS_PASSWORD});
    const login=await fetch(KS_API+'?cmd=brf_login_check',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Referer':KS_LOGIN,...(cookie?{'Cookie':cookie}:{})},
      body:loginBody.toString(),
      redirect:'manual'
    });
    const loginText=await login.text();
    let loginJson=null;try{loginJson=JSON.parse(loginText)}catch{}
    const newCookie=firstCookie(login.headers);if(newCookie)cookie=newCookie;
    if(!login.ok||loginJson?.ok===false) return {ok:false,error:`KS login failed (${login.status})`};

    const crawlBody=new URLSearchParams({cmd:'cmp_crawl_run',roundId:'3'});
    const crawl=await fetch(KS_API+'?cmd=cmp_crawl_run',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Accept':'application/json,text/plain,*/*','Referer':'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1',...(cookie?{'Cookie':cookie}:{})},
      body:crawlBody.toString(),
      redirect:'manual'
    });
    const text=await crawl.text();
    let json=null;try{json=JSON.parse(text)}catch{}
    if(!crawl.ok||json?.ok===false) return {ok:false,error:json?.error||`KS crawl failed (${crawl.status})`};
    return {ok:true,refreshedAt:new Date().toISOString()};
  }catch(e){
    return {ok:false,error:e instanceof Error?e.message:String(e)};
  }
}

export async function collectHybrid(env){
  const ksRefresh=await refreshKyungsungCrawl(env);
  const data=await collectBase(env);
  return {...data,ksRefresh};
}
