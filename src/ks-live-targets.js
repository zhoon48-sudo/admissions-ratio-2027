const KS_API='https://ipsiu.ks.ac.kr/ipsi/servlet/ipsi.Manager';
const KS_LOGIN=KS_API+'?cmd=brf_login';
const BOARD='https://ipsiu.ks.ac.kr/ipsi/cmp/cmp_board_view.jsp?pub=1';

function firstCookie(headers){
  const raw=headers.get('set-cookie')||'';
  return raw?raw.split(';')[0]:'';
}
function canonical(name){
  const s=String(name||'').replace(/\s+/g,'');
  if(/부산외/.test(s)) return '부산외국어대학교';
  if(/신라/.test(s)) return '신라대학교';
  return s;
}

export async function fetchKyungsungTargetRows(env){
  if(!env?.KS_EMP_ID||!env?.KS_PASSWORD){
    return {ok:false,error:'경성대 로그인 Secret이 설정되지 않았습니다.',rows:[]};
  }
  try{
    const first=await fetch(KS_LOGIN,{
      headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},
      redirect:'manual'
    });
    await first.text();
    let cookie=firstCookie(first.headers);

    const loginBody=new URLSearchParams({
      cmd:'brf_login_check',
      empId:env.KS_EMP_ID,
      pw:env.KS_PASSWORD
    });
    const login=await fetch(KS_API+'?cmd=brf_login_check',{
      method:'POST',
      headers:{
        'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With':'XMLHttpRequest',
        'Referer':KS_LOGIN,
        ...(cookie?{'Cookie':cookie}:{})
      },
      body:loginBody.toString(),
      redirect:'manual'
    });
    const loginText=await login.text();
    let loginJson=null;
    try{loginJson=JSON.parse(loginText)}catch{}
    const newCookie=firstCookie(login.headers);
    if(newCookie) cookie=newCookie;
    if(!login.ok||loginJson?.ok===false){
      return {ok:false,error:`경성대 서버 로그인 실패 (${login.status})`,rows:[]};
    }

    const live=await fetch(KS_API+'?cmd=cmp_live',{
      headers:{
        'Accept':'application/json,text/plain,*/*',
        'X-Requested-With':'XMLHttpRequest',
        'Referer':BOARD,
        ...(cookie?{'Cookie':cookie}:{})
      },
      cache:'no-store',
      redirect:'manual'
    });
    const text=await live.text();
    if(!live.ok) return {ok:false,error:`경성대 cmp_live 조회 실패 (${live.status})`,rows:[]};
    let json=null;
    try{json=JSON.parse(text)}catch{}
    if(!json||json?.ok===false||!Array.isArray(json?.univs)){
      return {ok:false,error:json?.error||'경성대 cmp_live 응답 형식 오류',rows:[]};
    }

    const rows=json.univs
      .filter(r=>['부산외국어대학교','신라대학교'].includes(canonical(r?.univName)))
      .map(r=>({...r,canonicalName:canonical(r?.univName)}));

    return {
      ok:rows.length===2,
      rows,
      collectedAt:json.collectedAt||null,
      roundId:json.roundId||null,
      error:rows.length===2?null:`대상 대학 ${rows.length}/2개 확인`
    };
  }catch(e){
    return {ok:false,error:e instanceof Error?e.message:String(e),rows:[]};
  }
}
