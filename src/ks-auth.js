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

async function responseJson(response){
  const text=await response.text();
  try{return {json:JSON.parse(text),text};}catch{return {json:null,text};}
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

export async function kyungsungRepatriateDiagnostics(env){
  const session=await loginSession(env);
  if(!session.ok)return session;

  const urlsRes=await sessionFetch(session,'cmd=cmp_manage_api&action=urls&roundId=3');
  const {json:urls,text:urlsText}=await responseJson(urlsRes);
  if(!urlsRes.ok||!Array.isArray(urls?.urls)){
    return {ok:false,stage:'urls',httpStatus:urlsRes.status,preview:urlsText.slice(0,800)};
  }

  const wanted=[
    {pattern:/부산외/,canonical:'부산외국어대학교'},
    {pattern:/신라/,canonical:'신라대학교'}
  ];
  const results=[];

  for(const target of wanted){
    const cfg=urls.urls.find(r=>target.pattern.test(String(r.univName||'')));
    if(!cfg){
      results.push({university:target.canonical,ok:false,error:'경성대 URL 설정에서 대학을 찾지 못했습니다.'});
      continue;
    }
    const form=new URLSearchParams({
      cmd:'cmp_manage_api',
      action:'test_url',
      roundId:'3',
      univCd:String(cfg.univCd||''),
      univName:String(cfg.univName||''),
      url:String(cfg.url||'').replace(/^https?:\/\//i,'')
    });
    const res=await sessionFetch(session,'cmd=cmp_manage_api&action=test_url',{
      method:'POST',
      contentType:'application/x-www-form-urlencoded; charset=UTF-8',
      body:form.toString()
    });
    const {json,text}=await responseJson(res);
    results.push({
      university:target.canonical,
      sourceUnivName:cfg.univName||null,
      url:cfg.url||null,
      httpStatus:res.status,
      ok:Boolean(res.ok&&json?.ok!==false),
      responseKeys:json&&typeof json==='object'?Object.keys(json):[],
      response:json||null,
      preview:json?null:text.slice(0,1200)
    });
  }

  return {ok:results.every(r=>r.ok),loginStatus:session.loginStatus,results};
}
