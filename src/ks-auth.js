const API='https://ipsiu.ks.ac.kr/ipsi/servlet/ipsi.Manager';
const LOGIN=API+'?cmd=brf_login';

function cookies(headers){
  const raw=headers.get('set-cookie')||'';
  return raw ? raw.split(';')[0] : '';
}

export async function kyungsungLiveWithAccount(env){
  if(!env.KS_EMP_ID||!env.KS_PASSWORD){
    return {ok:false,configured:false,missing:['KS_EMP_ID','KS_PASSWORD'].filter(k=>!env[k])};
  }

  const first=await fetch(LOGIN,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},redirect:'manual'});
  await first.text();
  let cookie=cookies(first.headers);

  const body=new URLSearchParams({cmd:'brf_login_check',empId:env.KS_EMP_ID,pw:env.KS_PASSWORD});
  const login=await fetch(API+'?cmd=brf_login_check',{
    method:'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With':'XMLHttpRequest',
      'Referer':LOGIN,
      ...(cookie?{'Cookie':cookie}:{})
    },
    body:body.toString(),
    redirect:'manual'
  });
  const loginText=await login.text();
  let loginJson=null;
  try{loginJson=JSON.parse(loginText)}catch{}
  const newCookie=cookies(login.headers);
  if(newCookie) cookie=newCookie;
  if(!login.ok||loginJson?.ok===false){
    return {ok:false,configured:true,loginStatus:login.status,loginResponse:loginJson||loginText.slice(0,300)};
  }

  const live=await fetch(API+'?cmd=cmp_live',{
    headers:{
      'Accept':'application/json,text/plain,*/*',
      'X-Requested-With':'XMLHttpRequest',
      'Referer':'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1',
      ...(cookie?{'Cookie':cookie}:{})
    },
    redirect:'manual'
  });
  const text=await live.text();
  return {ok:live.ok,configured:true,loginStatus:login.status,liveStatus:live.status,contentType:live.headers.get('content-type')||'',length:text.length,preview:text.slice(0,1200)};
}
