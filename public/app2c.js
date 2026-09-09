function ensureChartState(){
  state.chart ||= {};
  state.chart.selected = Array.isArray(state.chart.selected) ? state.chart.selected.filter(n=>universities.some(u=>u.name===n)).slice(0,5) : ['경성대학교'];
  state.chart.scope = state.chart.scope === 'inner' ? 'inner' : 'total';
  state.chart.range = ['all','1d','6h','1h'].includes(state.chart.range) ? state.chart.range : 'all';
  state.chart.mode = state.chart.mode === 'delta' ? 'delta' : 'absolute';
}

function ensureChartEnhancements(){
  ensureChartState();
  if(!document.getElementById('chartEnhanceStyle')){
    const style=document.createElement('style');
    style.id='chartEnhanceStyle';
    style.textContent=`
      #chartView .current-compare-panel{background:#fff;border:1px solid #dfe5ea;border-radius:7px;box-shadow:var(--shadow);margin-bottom:8px;overflow:hidden}
      #chartView .current-compare-head{display:flex;align-items:center;gap:10px;padding:9px 11px;border-bottom:1px solid #e5eaee;background:#fbfcfd}
      #chartView .current-compare-head b{font-size:15px;color:#29465e}
      #chartView .current-compare-head small{color:#7c8993}
      #chartView .current-rank-bars{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 18px;padding:10px 12px}
      #chartView .rank-bar-row{display:grid;grid-template-columns:25px 92px minmax(120px,1fr) 60px;align-items:center;gap:7px;min-height:25px;padding:2px 5px;border-radius:5px;cursor:pointer;transition:background .14s}
      #chartView .rank-bar-row:hover{background:#f5f8fa}
      #chartView .rank-bar-row.selected{background:#edf4f9}
      #chartView .rank-num{font-size:10px;font-weight:800;color:#7b8892;text-align:right}
      #chartView .rank-name{font-size:11.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#344b5d}
      #chartView .rank-track{height:10px;background:#edf1f4;border-radius:6px;overflow:hidden;position:relative}
      #chartView .rank-fill{height:100%;border-radius:6px;background:#6b8ca6;min-width:2px;transition:width .2s}
      #chartView .rank-bar-row.selected .rank-fill{background:#244d73}
      #chartView .rank-value{font-size:11px;font-weight:900;color:#274f73;text-align:right;font-variant-numeric:tabular-nums}
      #chartView .selector-head{display:flex;justify-content:space-between;align-items:center}
      #chartView .selector-limit{font-size:10px;color:#7e8992;font-weight:500}
      #chartView .univ-check.limit input:not(:checked){opacity:.4}
      #chartView .chart-summary{display:grid;grid-template-columns:repeat(5,minmax(118px,1fr));gap:5px;padding:7px 10px;border-bottom:1px solid #edf0f2;background:#fff}
      #chartView .summary-card{border:1px solid #e1e7eb;border-radius:6px;padding:6px 7px;min-width:0;background:#fbfcfd}
      #chartView .summary-name{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:800;color:#435766;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #chartView .summary-dot,.chart-legend-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:0 0 auto}
      #chartView .summary-current{font-size:15px;font-weight:900;color:#203f5b;margin:3px 0 2px;font-variant-numeric:tabular-nums}
      #chartView .summary-deltas{display:flex;gap:7px;color:#72808a;font-size:9.5px;white-space:nowrap}
      #chartView .summary-deltas b{font-weight:800;color:#4b6172}
      #chartView .chart-legend-live{display:flex;gap:11px;align-items:center;flex-wrap:wrap;padding:6px 11px;border-bottom:1px solid #edf0f2;background:#fff;font-size:10.5px;color:#4d5e6a}
      #chartView .chart-legend-item{display:flex;align-items:center;gap:4px;font-weight:700}
      #chartView .chart-legend-item strong{font-variant-numeric:tabular-nums;color:#263f53}
      #chartView .chart-wrap{height:520px}
      #chartView .chart-hover.crosshair-tip{transform:none;min-width:185px;padding:7px 9px}
      #chartView .cross-row{display:grid;grid-template-columns:9px 72px 1fr;gap:5px;align-items:center;margin-top:2px}
      #chartView .cross-row b{text-align:right;font-variant-numeric:tabular-nums}
      #chartView .metric-hint{font-size:10px;color:#7c8993;margin-left:2px}
      @media(max-width:1100px){#chartView .current-rank-bars{grid-template-columns:1fr}#chartView .chart-summary{grid-template-columns:repeat(2,minmax(140px,1fr))}}
    `;
    document.head.appendChild(style);
  }

  const view=document.getElementById('chartView');
  const layout=view?.querySelector('.chart-layout');
  if(view&&layout&&!document.getElementById('currentComparePanel')){
    const panel=document.createElement('div');
    panel.className='current-compare-panel';
    panel.id='currentComparePanel';
    panel.innerHTML=`<div class="current-compare-head"><b>현재 지원율 비교</b><small id="currentCompareScope">18개 대학 · 정원내+정원외 기준 · 막대를 클릭하면 하단 추이 비교에 추가됩니다.</small></div><div class="current-rank-bars" id="currentRankBars"></div>`;
    view.insertBefore(panel,layout);
  }

  const selectorHead=view?.querySelector('.selector-head');
  if(selectorHead&&!selectorHead.querySelector('.selector-limit')){
    selectorHead.innerHTML=`<span>추이 비교 대학</span><span class="selector-limit">최대 5개</span>`;
  }

  const controls=view?.querySelector('.chart-controls');
  const rangeSeg=document.getElementById('rangeSeg');
  if(controls&&rangeSeg&&!document.getElementById('metricSeg')){
    const metric=document.createElement('div');
    metric.className='seg';
    metric.id='metricSeg';
    metric.innerHTML='<button data-mode="absolute">절대 지원율</button><button data-mode="delta">증가속도</button>';
    controls.insertBefore(metric,rangeSeg);
    const hint=document.createElement('span');
    hint.className='metric-hint';
    hint.id='metricHint';
    controls.insertBefore(hint,rangeSeg);
  }

  const chartWrap=document.getElementById('chartWrap');
  if(chartWrap&&!document.getElementById('chartSummary')){
    const summary=document.createElement('div');summary.id='chartSummary';summary.className='chart-summary';chartWrap.parentNode.insertBefore(summary,chartWrap);
    const legend=document.createElement('div');legend.id='chartLegendLive';legend.className='chart-legend-live';chartWrap.parentNode.insertBefore(legend,chartWrap);
  }

  const selectAll=document.getElementById('selectAllBtn');
  if(selectAll) selectAll.textContent='상위 5개';
}

function chartKey(){return state.chart.scope==='inner'?'innerRate':'totalRate'}
function currentRateFor(row){return state.chart.scope==='inner'?ratio(row.innerQuota,row.innerApplicants):ratio(row.totalQuota,row.totalApplicants)}
function seriesColor(name){const idx=orderIndex(name);return COLORS[(idx<0?0:idx)%COLORS.length]}
function signed(v){if(v==null||!Number.isFinite(Number(v)))return '-';const n=Number(v);return `${n>0?'+':''}${n.toFixed(2)}`}

function renderCurrentComparison(){
  const box=document.getElementById('currentRankBars');if(!box)return;
  const selected=new Set(state.chart.selected||[]);
  const rows=state.data.map(x=>({name:x.name,region:x.region,rate:currentRateFor(x)})).filter(x=>Number.isFinite(x.rate)).sort((a,b)=>b.rate-a.rate||orderIndex(a.name)-orderIndex(b.name));
  const max=Math.max(.01,...rows.map(x=>x.rate));
  document.getElementById('currentCompareScope').textContent=`${rows.length}개 대학 · ${state.chart.scope==='inner'?'정원내':'정원내+정원외'} 기준 · 막대를 클릭하면 하단 추이 비교에 추가됩니다.`;
  box.innerHTML=rows.map((x,i)=>`<div class="rank-bar-row ${selected.has(x.name)?'selected':''}" data-name="${x.name}" title="${x.name} ${x.rate.toFixed(2)} : 1"><span class="rank-num">${i+1}</span><span class="rank-name">${SHORT_NAMES[x.name]||x.name}</span><span class="rank-track"><span class="rank-fill" style="display:block;width:${Math.max(1,x.rate/max*100).toFixed(1)}%"></span></span><span class="rank-value">${x.rate.toFixed(2)} : 1</span></div>`).join('');
  box.querySelectorAll('.rank-bar-row').forEach(el=>el.onclick=()=>toggleChartUniversity(el.dataset.name));
}

function toggleChartUniversity(name){
  const list=[...(state.chart.selected||[])],idx=list.indexOf(name);
  if(idx>=0) list.splice(idx,1);
  else{
    if(list.length>=5){notify('추이 비교는 최대 5개 대학까지 선택할 수 있습니다.');return}
    list.push(name);
  }
  state.chart.selected=list;save();renderChartControls();
}

function renderUniversityList(){
  const box=document.getElementById('univList'),selected=new Set(state.chart.selected||[]),atLimit=selected.size>=5;
  box.innerHTML=sortRows(state.data).map(x=>`<label class="univ-check ${atLimit&&!selected.has(x.name)?'limit':''}"><input type="checkbox" data-name="${x.name}" ${selected.has(x.name)?'checked':''}><span>${x.name}</span><span class="spacer"></span><small style="color:#88939c">${x.region}</small></label>`).join('');
  box.querySelectorAll('input').forEach(el=>el.addEventListener('change',()=>toggleChartUniversity(el.dataset.name)));
}

function getChartRows(){
  const selected=new Set(state.chart.selected||[]);if(!selected.size)return [];
  let rows=state.history.filter(h=>selected.has(h.name));if(!rows.length)return [];
  const maxTs=Math.max(...rows.map(r=>r.ts));let cutoff=-Infinity;
  if(state.chart.range==='1d')cutoff=maxTs-86400000;
  if(state.chart.range==='6h')cutoff=maxTs-21600000;
  if(state.chart.range==='1h')cutoff=maxTs-3600000;
  return rows.filter(r=>r.ts>=cutoff);
}

function svgEl(tag,attrs={},text=''){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(text)el.textContent=text;return el}
function niceStep(raw){if(!Number.isFinite(raw)||raw<=0)return 0.1;const p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p,n=f<=1?1:f<=2?2:f<=5?5:10;return n*p}
function sampleSeries(arr,maxPoints=260){if(arr.length<=maxPoints)return arr;const out=[arr[0]],step=(arr.length-1)/(maxPoints-1);for(let i=1;i<maxPoints-1;i++)out.push(arr[Math.min(arr.length-2,Math.round(i*step))]);out.push(arr[arr.length-1]);return out}
function smoothPath(pts){if(!pts.length)return '';if(pts.length===1)return `M ${pts[0].x} ${pts[0].y}`;let d=`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],mx=(a.x+b.x)/2;d+=` C ${mx.toFixed(1)} ${a.y.toFixed(1)}, ${mx.toFixed(1)} ${b.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`}return d}

function allSeriesForSelected(rows,key){
  return (state.chart.selected||[]).map(name=>{
    const raw=rows.filter(r=>r.name===name&&Number.isFinite(Number(r[key]))).sort((a,b)=>a.ts-b.ts);
    if(!raw.length)return null;
    const base=Number(raw[0][key]);
    return {name,color:seriesColor(name),raw,points:raw.map(r=>({ts:r.ts,raw:Number(r[key]),value:state.chart.mode==='delta'?Number(r[key])-base:Number(r[key])}))};
  }).filter(Boolean);
}

function nearestPoint(points,ts){
  if(!points.length)return null;let lo=0,hi=points.length-1;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(points[mid].ts<ts)lo=mid+1;else hi=mid}
  const a=points[lo],b=lo>0?points[lo-1]:null;return b&&Math.abs(b.ts-ts)<Math.abs(a.ts-ts)?b:a;
}

function latestSeriesStats(name,key){
  const arr=state.history.filter(h=>h.name===name&&Number.isFinite(Number(h[key]))).sort((a,b)=>a.ts-b.ts);if(!arr.length)return null;
  const latest=arr[arr.length-1],ld=new Date(latest.ts),dateSig=`${ld.getFullYear()}-${ld.getMonth()}-${ld.getDate()}`;
  const today=arr.find(p=>{const d=new Date(p.ts);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`===dateSig})||arr[0];
  const target=latest.ts-3600000;let hour=arr[0];for(const p of arr){if(p.ts<=target)hour=p;else break}
  return {current:Number(latest[key]),todayDelta:Number(latest[key])-Number(today[key]),hourDelta:Number(latest[key])-Number(hour[key]),latestTs:latest.ts};
}

function renderTrendSummary(){
  const box=document.getElementById('chartSummary');if(!box)return;const key=chartKey(),selected=state.chart.selected||[];
  if(!selected.length){box.innerHTML='<div style="grid-column:1/-1;color:#8a949d;padding:4px">비교할 대학을 선택하세요.</div>';return}
  box.innerHTML=selected.map(name=>{const s=latestSeriesStats(name,key),c=seriesColor(name);return `<div class="summary-card"><div class="summary-name"><span class="summary-dot" style="background:${c}"></span>${SHORT_NAMES[name]||name}</div><div class="summary-current">${s?`${s.current.toFixed(2)} : 1`:'-'}</div><div class="summary-deltas"><span>오늘 <b>${s?signed(s.todayDelta):'-'}</b></span><span>1시간 <b>${s?signed(s.hourDelta):'-'}</b></span></div></div>`}).join('');
}

function renderChartLegend(){
  const box=document.getElementById('chartLegendLive');if(!box)return;const key=chartKey();
  box.innerHTML=(state.chart.selected||[]).map(name=>{const s=latestSeriesStats(name,key),c=seriesColor(name),val=s?s.current:null;return `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${c}"></span>${SHORT_NAMES[name]||name} <strong>${val!=null?val.toFixed(2):'-'}</strong></span>`}).join('')||'<span style="color:#8a949d">선택된 대학 없음</span>';
}

function drawChart(){
  ensureChartEnhancements();renderCurrentComparison();renderTrendSummary();renderChartLegend();
  const svg=document.getElementById('ratioChart'),wrap=document.getElementById('chartWrap'),empty=document.getElementById('chartEmpty'),hover=document.getElementById('chartHover'),rows=getChartRows(),selected=state.chart.selected||[];
  svg.innerHTML='';hover.classList.add('hidden','crosshair-tip');empty.classList.toggle('hidden',selected.length>0&&rows.length>0);if(!selected.length||!rows.length)return;
  const rect=wrap.getBoundingClientRect(),W=Math.max(760,Math.floor(rect.width-20)),H=Math.max(430,Math.floor(rect.height-20));svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.removeAttribute('width');svg.removeAttribute('height');svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  const m={l:68,r:28,t:24,b:50},pw=W-m.l-m.r,ph=H-m.t-m.b,key=chartKey(),series=allSeriesForSelected(rows,key);if(!series.length)return;
  const minTs=Math.min(...series.flatMap(s=>s.points.map(p=>p.ts))),maxTs=Math.max(...series.flatMap(s=>s.points.map(p=>p.ts))),vals=series.flatMap(s=>s.points.map(p=>p.value)).filter(Number.isFinite);
  let minV=Math.min(...vals),maxV=Math.max(...vals),span=maxV-minV;if(!Number.isFinite(span)||span<=0)span=Math.max(.2,Math.abs(maxV)*.08||.2);const padding=Math.max(.04,span*.10);
  let yMin=state.chart.mode==='delta'?Math.min(0,minV-padding):Math.max(0,minV-padding),yMax=maxV+padding,step=niceStep((yMax-yMin)/6);yMin=state.chart.mode==='delta'?Math.floor(yMin/step)*step:Math.max(0,Math.floor(yMin/step)*step);yMax=Math.ceil(yMax/step)*step;if(yMax-yMin<step*4)yMax=yMin+step*4;
  svg.appendChild(svgEl('rect',{x:m.l,y:m.t,width:pw,height:ph,rx:'3',fill:'#ffffff',stroke:'#d9e1e6','stroke-width':'1','vector-effect':'non-scaling-stroke'}));
  for(let j=0;j<=5;j++){const val=yMin+(yMax-yMin)*j/5,y=m.t+ph-(val-yMin)/(yMax-yMin)*ph;svg.appendChild(svgEl('line',{x1:m.l,y1:y,x2:W-m.r,y2:y,stroke:Math.abs(val)<1e-9?'#b9c5ce':'#e9edf0','stroke-width':Math.abs(val)<1e-9?'1.4':'1','vector-effect':'non-scaling-stroke'}));svg.appendChild(svgEl('text',{x:m.l-9,y:y+4,'text-anchor':'end',fill:'#5f6e79','font-size':'11','font-weight':'600'},`${val>0&&state.chart.mode==='delta'?'+':''}${val.toFixed(2)}`))}
  svg.appendChild(svgEl('text',{x:18,y:m.t+ph/2,fill:'#6e7c86','font-size':'10','font-weight':'700',transform:`rotate(-90 18 ${m.t+ph/2})`},state.chart.mode==='delta'?'선택기간 증가폭':'지원율 (대 1)'));
  for(let j=0;j<=5;j++){const ts=minTs+(maxTs-minTs)*j/5,d=new Date(ts),x=m.l+pw*j/5,label=`${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;if(j>0&&j<5)svg.appendChild(svgEl('line',{x1:x,y1:m.t,x2:x,y2:m.t+ph,stroke:'#f3f5f7','stroke-width':'1','vector-effect':'non-scaling-stroke'}));svg.appendChild(svgEl('text',{x,y:H-17,'text-anchor':'middle',fill:'#74818b','font-size':'10'},label))}

  const rendered=[];
  series.forEach(s=>{const arr=sampleSeries(s.points,260),pts=arr.map(p=>({x:m.l+((p.ts-minTs)/(maxTs-minTs||1))*pw,y:m.t+ph-((p.value-yMin)/(yMax-yMin))*ph,...p})),g=svgEl('g',{'class':'chart-series','data-name':s.name});g.appendChild(svgEl('path',{'class':'series-line',d:smoothPath(pts),fill:'none',stroke:s.color,'stroke-width':'3.1','stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}));const last=pts[pts.length-1];if(last)g.appendChild(svgEl('circle',{cx:last.x,cy:last.y,r:'4.2',fill:'#fff',stroke:s.color,'stroke-width':'2.2','vector-effect':'non-scaling-stroke'}));g.addEventListener('mouseenter',()=>{rendered.forEach(o=>o.classList.toggle('dim',o!==g));g.classList.add('active')});g.addEventListener('mouseleave',()=>{rendered.forEach(o=>o.classList.remove('dim','active'))});svg.appendChild(g);rendered.push(g)});

  const cross=svgEl('line',{x1:m.l,y1:m.t,x2:m.l,y2:m.t+ph,stroke:'#788d9d','stroke-width':'1','stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke',visibility:'hidden'});svg.appendChild(cross);
  const overlay=svgEl('rect',{x:m.l,y:m.t,width:pw,height:ph,fill:'transparent','pointer-events':'all'});overlay.addEventListener('mousemove',e=>{const sr=svg.getBoundingClientRect(),wr=wrap.getBoundingClientRect(),sx=W/sr.width,localX=(e.clientX-sr.left)*sx,clamped=Math.max(m.l,Math.min(m.l+pw,localX)),ts=minTs+((clamped-m.l)/pw)*(maxTs-minTs||1);cross.setAttribute('x1',clamped);cross.setAttribute('x2',clamped);cross.setAttribute('visibility','visible');const d=new Date(ts),items=series.map(s=>({s,p:nearestPoint(s.points,ts)})).filter(x=>x.p);hover.innerHTML=`<b>${d.getMonth()+1}.${d.getDate()}. ${pad(d.getHours())}:${pad(d.getMinutes())}</b>${items.map(({s,p})=>`<div class="cross-row"><span class="summary-dot" style="background:${s.color}"></span><span>${SHORT_NAMES[s.name]||s.name}</span><b>${state.chart.mode==='delta'?(p.value>=0?'+':'')+p.value.toFixed(2):p.raw.toFixed(2)}</b></div>`).join('')}`;const cssX=(clamped/W)*sr.width+(sr.left-wr.left),cssY=Math.max(8,(e.clientY-wr.top)-20);hover.style.left=`${Math.min(wr.width-205,cssX+12)}px`;hover.style.top=`${cssY}px`;hover.classList.remove('hidden')});overlay.addEventListener('mouseleave',()=>{cross.setAttribute('visibility','hidden');hover.classList.add('hidden')});svg.appendChild(overlay);
}

function renderChartControls(){
  ensureChartEnhancements();
  document.querySelectorAll('#scopeSeg button').forEach(b=>b.classList.toggle('active',b.dataset.scope===state.chart.scope));
  document.querySelectorAll('#rangeSeg button').forEach(b=>b.classList.toggle('active',b.dataset.range===state.chart.range));
  document.querySelectorAll('#metricSeg button').forEach(b=>{b.classList.toggle('active',b.dataset.mode===state.chart.mode);b.onclick=()=>{state.chart.mode=b.dataset.mode;save();renderChartControls()}});
  const hint=document.getElementById('metricHint');if(hint)hint.textContent=state.chart.mode==='delta'?'선택기간 첫 값 대비 증가폭':'실제 경쟁률을 그대로 비교';
  const title=document.querySelector('#chartView .chart-titleline b');if(title)title.textContent=state.chart.mode==='delta'?'지원율 증가속도':'지원율 추이';
  const titleSmall=document.querySelector('#chartView .chart-titleline small');if(titleSmall)titleSmall.textContent='최대 5개 대학 · 그래프 위에 마우스를 올리면 같은 시각 값을 동시에 비교합니다.';
  renderUniversityList();renderCurrentComparison();renderTrendSummary();renderChartLegend();
  const top5=document.getElementById('selectAllBtn');if(top5)top5.onclick=()=>{state.chart.selected=state.data.map(x=>({name:x.name,rate:currentRateFor(x)})).filter(x=>Number.isFinite(x.rate)).sort((a,b)=>b.rate-a.rate).slice(0,5).map(x=>x.name);save();renderChartControls()};
  const clear=document.getElementById('clearAllBtn');if(clear)clear.onclick=()=>{state.chart.selected=[];save();renderChartControls()};
  setTimeout(drawChart,20);
}

function moveOrder(name,delta){const order=orderedNames(),i=order.indexOf(name),j=i+delta;if(i<0||j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];state.settings.order=order;save();renderAll();renderSettings();notify('대학 표시 순서를 변경했습니다.')}
function reorderBefore(source,target){if(!source||!target||source===target)return;const order=orderedNames().filter(n=>n!==source),idx=order.indexOf(target);order.splice(idx<0?order.length:idx,0,source);state.settings.order=order;save();renderAll();renderSettings();notify('대학 표시 순서를 변경했습니다.')}
