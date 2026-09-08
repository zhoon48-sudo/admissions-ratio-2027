const API='https://ipsiu.ks.ac.kr/ipsi/servlet/ipsi.Manager';
const LOGIN=API+'?cmd=brf_login';

function cookies(headers){
  const raw=headers.get('set-cookie')||'';
  return raw ? raw.split(';')[0] : '';
}

async function loginSession(env){
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
  return {ok:true,configured:true,loginStatus:login.status,cookie};
}

async function sessionFetch(session,query,options={}){
  const url=API+(query.startsWith('?')?query:'?'+query);
  return fetch(url,{
    method:options.method||'GET',
    headers:{
      'Accept':options.accept||'application/json,text/plain,*/*',
      'X-Requested-With':'XMLHttpRequest',
      'Referer':options.referer||'https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1',
      ...(options.contentType?{'Content-Type':options.contentType}:{}),
      ...(session.cookie?{'Cookie':session.cookie}:{}),
      ...(options.headers||{})
    },
    body:options.body,
    redirect:'manual'
  });
}

export async function kyungsungLiveWithAccount(env){
  const session=await loginSession(env);
  if(!session.ok)return session;

  const live=await sessionFetch(session,'cmd=cmp_live');
  const text=await live.text();
  return {ok:live.ok,configured:true,loginStatus:session.loginStatus,liveStatus:live.status,contentType:live.headers.get('content-type')||'',length:text.length,preview:text.slice(0,1200)};
}

export async function kyungsungCorrectionDiagnostics(env){
  const session=await loginSession(env);
  if(!session.ok)return session;

  const [liveRes,urlsRes]=await Promise.all([
    sessionFetch(session,'cmd=cmp_live'),
    sessionFetch(session,'cmd=cmp_manage_api&action=urls&roundId=3')
  ]);
  const liveText=await liveRes.text();
  const urlsText=await urlsRes.text();
  let live=null,urls=null;
  try{live=JSON.parse(liveText)}catch{}
  try{urls=JSON.parse(urlsText)}catch{}

  const targets=['부산외대','부산외국어대','신라대','부산대'];
  const rows=Array.isArray(live?.univs)?live.univs.filter(r=>targets.includes(r.univName)):[];
  const cfgRows=Array.isArray(urls?.urls)?urls.urls.filter(r=>{
    const n=String(r.univName||'');
    return /부산외|신라|부산대|부산대학교/.test(n);
  }).map(r=>({
    univName:r.univName,
    univCd:r.univCd,
    parserType:r.parserType,
    mode:r.mode??r.collectMode??r.aggregateMode??null,
    rules:r.rules??r.classificationRules??r.ruleMap??null,
    keys:Object.keys(r||{})
  })):[];

  return {
    ok:liveRes.ok&&urlsRes.ok,
    loginStatus:session.loginStatus,
    liveStatus:liveRes.status,
    urlsStatus:urlsRes.status,
    liveKeys:live&&typeof live==='object'?Object.keys(live):[],
    rows,
    config:cfgRows,
    urlsResponseKeys:urls&&typeof urls==='object'?Object.keys(urls):[],
    urlsPreview:urls?null:urlsText.slice(0,500)
  };
}
