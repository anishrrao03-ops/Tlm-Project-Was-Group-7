(function(g){
const UI=g.UI,E=UI.E,{iso,dn,sum,mean}=E,{$,esc,inr,lakh,pc,num,sgn,dstr,dshort,dow,pill,sevPill,tbl,kpi}=UI,U=UI.ui,V=UI.views;
const C=g.LMC;
const ymLabel=ym=>{const[y,m]=ym.split('-');return['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+" '"+y.slice(2)};
const ctl=(h)=>`<div class="bar">${h}</div>`;
const demoBanner=()=>`<div class="demo"><b>Synthetic demo workbook.</b> Every record is fictional. Figures on or before the as-of date are actuals from the workbook; later dates are forecasts or scheduled bookings and are labelled as such.</div>`;
UI.demoBanner=demoBanner;

function range(){const M=UI.M,a=UI.asof();let to=U.to?dn(U.to):a,from;if(U.from)from=dn(U.from);else{const r=U.range;from=r==='ytd'?dn(iso(a).slice(0,4)+'-01-01'):a-(+r)+1}
  to=Math.min(to,a);from=Math.max(M.d0,Math.min(from,to));return{from,to}}
const shiftYear=(n,y)=>{const d=new Date(n*864e5);return Date.UTC(d.getUTCFullYear()-y,d.getUTCMonth(),d.getUTCDate())/864e5};
function series(from,to,key){const M=UI.M,n=to-from+1,g=n>150?30:n>45?7:1,labels=[],vals=[];
  for(let s=from;s<=to;s+=g){const e=Math.min(to,s+g-1);let o=0,r=0,f=0,x=0,d=0;for(let k=s;k<=e;k++){const i=k-M.d0;o+=M.occ[i];r+=M.roomRev[i];f+=M.foodRev[i];x+=M.otherRev[i];d++}labels.push(g===30?ymLabel(iso(s).slice(0,7)):dshort(s));vals.push({occ:o/(d*M.cap.all),room:r,food:f,other:x,d,s})}return{labels,vals,g}}

/* ---------------- Overview ---------------- */
V.overview=function(){
  const M=UI.M,a=UI.asof(),{from,to}=range(),k=E.kpis(M,a,from,to);
  const cmpFrom=U.cmp==='none'?null:shiftYear(from,1),cmpTo=U.cmp==='none'?null:shiftYear(to,1);
  const kp=cmpFrom?E.kpis(M,a,cmpFrom,Math.min(cmpTo,a)):null;
  const d=(x,y,f=pc)=>kp&&y?`<span class="${x>=y?'up':'dn'}">${x>=y?'▲':'▼'} ${Math.abs((x/y-1)*100).toFixed(1)}%</span> vs ${iso(cmpFrom).slice(0,4)}`:'';
  const i0=a-M.d0,occNow=M.occ[i0],ciN=[],coN=[];
  const onb=(lo,hi,f)=>M.bk.filter(b=>b.status!=='Cancelled'||(b.cx!=null&&b.cx>a)).filter(b=>b.b<=a&&!(b.status==='Cancelled'&&b.cx<=a)&&f(b)>=lo&&f(b)<=hi&&b.status!=='No-show'||0);
  const active=b=>b.b<=a&&(b.status==='Completed'||b.status==='No-show'||(b.status==='Cancelled'&&b.cx>a));
  const ins=M.bk.filter(b=>active(b)&&b.ci>a&&b.ci<=a+7),outs=M.bk.filter(b=>active(b)&&b.co>a&&b.co<=a+7&&b.ci<=a+7);
  const inHouse=M.bk.filter(b=>b.status==='Completed'&&b.ci<=a&&b.co>a).length,future=M.bk.filter(b=>active(b)&&b.ci>a).length;
  const fest=M.editions.filter(e=>e.end>=a).slice(0,2),hol=[];for(let n=a+1;n<=Math.min(M.d1,a+60);n++){const h=M.holiday[n-M.d0];if(h)hol.push([n,h])}
  const staff=(M.staffBy.get(a)||[]),pres=staff.filter(r=>r.Attendance_Status==='Present').length;
  const inv=E.invAll(M,a),low=inv.filter(x=>x.status!=='OK'&&x.status!=='Watch');
  const al=E.alerts(M,a);
  /* brief */
  const f7=Array.from({length:7},(_,i)=>E.forecast(M,a,a+1+i,'all')),avg7=mean(f7.map(x=>x.f));
  const w=f7.reduce((m,x)=>x.f<m.f?x:m,f7[0]),h=f7.reduce((m,x)=>x.f>m.f?x:m,f7[0]);
  const last30=E.kpis(M,a,a-29,a),prev30=E.kpis(M,a,a-59,a-30),cs=E.cancelStats(M,a);
  const sort=al.filter(x=>x.sev==='Critical'||x.sev==='High').slice(0,4);
  const brief=[`Occupancy over the last 30 days was <b>${pc(last30.occ,1)}</b> (${pc(prev30.occ,1)} in the 30 days before). ADR ${inr(last30.adr)}, RevPAR ${inr(last30.revpar)}.`,
   `Next 7 days forecast <b>${pc(avg7,0)}</b> average occupancy; lowest ${dshort(w.t)} (${pc(w.f)}), highest ${dshort(h.t)} (${pc(h.f)}). Confidence: ${f7[0].conf?f7[0].conf.label:'n/a'}.`,
   low.length?`<b>${low.length} of ${inv.length}</b> stock items are at or below reorder point or projected to run short before delivery (${low.slice(0,3).map(x=>x.name).join(', ')}).`:'Stock levels are adequate for all tracked items.',
   cs.recRate!=null?`Cancellation rate last 30 days: ${pc(cs.recRate,1)} vs a historical baseline of ${pc(cs.base,1)} (${cs.z>=M.S.alerts.cancelZ?'significantly above':'within normal range'}).`:'',
   `Actions required: ${sort.length?sort.map(x=>x.type).filter((v,i,s)=>s.indexOf(v)===i).join(', '):'none urgent'}. ${UI.proposals().filter(p=>UI.stOf(p)==='Awaiting Approval'&&!p.noChange).length} proposal(s) await approval.`].filter(Boolean);
  const html=`${demoBanner()}
  ${ctl(`<div class="seg" id="rseg">${[['30','30 days'],['90','90 days'],['365','12 months'],['ytd','Year to date']].map(([v,l])=>`<button data-r="${v}" class="${!U.from&&U.range===v?'on':''}">${l}</button>`).join('')}</div>
  <label>From <input type="date" id="rf" value="${iso(from)}"></label><label>To <input type="date" id="rt" value="${iso(to)}" max="${iso(a)}"></label>
  <label>Compare <select id="cmp"><option value="prev" ${U.cmp==='prev'?'selected':''}>Same period last year</option><option value="none" ${U.cmp==='none'?'selected':''}>No comparison</option></select></label><span class="note">${k.days} days · actual data up to as-of date</span>`)}
  <div class="grid g4" style="margin-bottom:14px">
   ${kpi('Total rooms',M.cap.all,M.cats.map(c=>M.cap[c]+' '+c).join(' · '),'k-green')}
   ${kpi('Occupied tonight',occNow,`${M.cap.all-occNow} available · ${pc(occNow/M.cap.all)}`,'k-green')}
   ${kpi('Occupancy',pc(k.occ,1),d(k.occ,kp&&kp.occ),'k-green')}
   ${kpi('ADR',inr(k.adr),d(k.adr,kp&&kp.adr),'k-gold')}
   ${kpi('Room revenue',lakh(k.room),d(k.room,kp&&kp.room),'k-gold')}
   ${kpi('Total revenue',lakh(k.total),`Room ${lakh(k.room)} + food ${lakh(k.food)} + other ${lakh(k.other)}`,'k-gold')}
   ${kpi('RevPAR',inr(k.revpar),d(k.revpar,kp&&kp.revpar),'k-gold')}
   ${kpi('Guests',num(k.guests),`${k.ci} check-ins · ${k.co} check-outs`,'k-green')}
  </div>
  <div class="grid g32" style="margin-bottom:14px">
   <div class="card brief"><div class="hd"><div><h2>AI Daily Business Brief</h2><p><span class="sim">Simulated narrative</span> Generated from the calculations on this page, not by a language model.</p></div></div><ul>${brief.map(b=>`<li>${b}</li>`).join('')}</ul></div>
   <div class="card"><div class="hd"><h2>Alerts</h2><a href="#assistant" class="note">Ask the assistant</a></div>${al.slice(0,5).map(x=>`<div class="alert sev-${x.sev}"><b>${sevPill(x.sev)} ${esc(x.type)}</b><span>${esc(x.text)}</span><span class="note">→ ${esc(x.action)}</span></div>`).join('')||'<p class="note">No alerts.</p>'}${al.length>5?`<p class="note">${al.length-5} more alerts in Reports.</p>`:''}</div>
  </div>
  <div class="grid g2" style="margin-bottom:14px">
   <div class="card"><div class="hd"><div><h2>Occupancy trend</h2><p>${U.cmp==='none'?'Selected period':'Selected period vs same dates last year'}</p></div></div><div id="ch1"></div></div>
   <div class="card"><div class="hd"><div><h2>Revenue trend</h2><p>Room, food and other revenue</p></div></div><div id="ch2"></div></div>
  </div>
  <div class="grid g3">
   <div class="card"><h2>Next 7 days (booked)</h2><p class="note">Confirmed bookings known at the as-of date</p><div class="stat"><span>Check-ins</span><b>${ins.length}</b></div><div class="stat"><span>Check-outs</span><b>${outs.length}</b></div><div class="stat"><span>In house now</span><b>${inHouse}</b></div><div class="stat"><span>Future confirmed bookings</span><b>${future}</b></div></div>
   <div class="card"><h2>Upcoming festivals & holidays</h2>${fest.length?fest.map(e=>`<div class="stat"><span>${esc(e.name)}${e.planned?' '+pill('Planning assumption','gold'):''}</span><b>${dstr(e.start)} · in ${e.start-a} d</b></div>`).join(''):'<p class="note">No festival dates after the as-of date in the workbook.</p>'}${hol.length?hol.slice(0,3).map(([n,h])=>`<div class="stat"><span>${esc(h)}</span><b>${dstr(n)}</b></div>`).join(''):`<p class="note">No public holidays in the workbook for the next 60 days.</p>`}</div>
   <div class="card"><h2>Staffing today</h2><p class="note">Present of rostered, by department</p>${[...new Set(staff.map(r=>r.Department))].map(dp=>{const r=staff.filter(x=>x.Department===dp);return`<div class="stat"><span>${dp}</span><b>${r.filter(x=>x.Attendance_Status==='Present').length} / ${r.length}</b></div>`}).join('')}<div class="stat"><span>Low-stock items</span><b class="${low.length?'dn':''}">${low.length}</b></div></div>
  </div>`;
  return{html,draw(){
    const s=series(from,to);let cmpS=null;if(kp&&U.cmp!=='none')cmpS=series(cmpFrom,Math.min(cmpTo,a));
    const lab=s.labels;C.line($('#ch1'),{labels:lab,series:[{name:iso(from).slice(0,4)+' (actual)',data:s.vals.map(v=>v.occ),area:true},...(cmpS?[{name:iso(cmpFrom).slice(0,4)+' (actual)',data:lab.map((_,i)=>cmpS.vals[i]?cmpS.vals[i].occ:null),color:'var(--c2)',dash:true}]:[])],yFmt:v=>pc(v),yMin:0,h:250});
    C.bar($('#ch2'),{labels:lab,series:[{name:'Room',data:s.vals.map(v=>v.room),color:'var(--c1)'},{name:'Food',data:s.vals.map(v=>v.food),color:'var(--c2)'},{name:'Other',data:s.vals.map(v=>v.other),color:'var(--c3)'}],stacked:true,yFmt:v=>lakh(v),yFmtW:62,h:250})},
   bind(){document.querySelectorAll('#rseg button').forEach(b=>b.onclick=()=>{U.range=b.dataset.r;U.from=null;U.to=null;UI.render(true)});
    $('#rf').onchange=e=>{U.from=e.target.value;UI.render(true)};$('#rt').onchange=e=>{U.to=e.target.value;UI.render(true)};$('#cmp').onchange=e=>{U.cmp=e.target.value;UI.render(true)}}}};

/* ---------------- Forecasting ---------------- */
function aggDays(rows,gran){if(gran==='daily')return rows.map(r=>({l:dshort(r.t),...r}));const out=[],m=new Map();for(const r of rows){const k=gran==='weekly'?'W'+Math.floor((r.t+3)/7):ymLabel(iso(r.t).slice(0,7));if(!m.has(k)){m.set(k,[]);}m.get(k).push(r)}
  for(const [k,v] of m){out.push({l:gran==='weekly'?dshort(v[0].t):k,t:v[0].t,f:mean(v.map(x=>x.f)),guests:sum(v.map(x=>x.guests)),rooms:mean(v.map(x=>x.rooms)),n:v.length,wb:mean(v.filter(x=>x.wb!=null).map(x=>x.wb))})}return out}
V.forecast=function(){
  const M=UI.M,a=UI.asof(),H=U.fcRange==='365'?365:U.fcRange==='90'?90:30,gran=U.fcGran==='daily'&&H>90?'monthly':U.fcGran;
  const days=[];for(let k=1;k<=H;k++){const t=a+k,d=E.demand(M,a,t);days.push({t,f:d.f.f,rooms:d.rooms,guests:d.guests,ci:d.checkins,fc:d.f,wb:t<=M.d1?M.occ[t-M.d0]/M.cap.all:null})}
  const g=aggDays(days,gran),f0=days[0].fc,bt=E.backtest(M,a,M.S.btLead,'all');
  const hi=[...days].sort((x,y)=>y.f-x.f).slice(0,5),lo=[...days].sort((x,y)=>x.f-y.f).slice(0,5);
  const cs=E.cancelStats(M,a);
  const pick=[];for(let k=1;k<=30;k++){const f=E.forecast(M,a,a+k,'all');pick.push(f)}
  const html=`${demoBanner()}${ctl(`<div class="seg" id="fr">${[['30','30 days'],['90','90 days'],['365','12 months']].map(([v,l])=>`<button data-v="${v}" class="${U.fcRange===v?'on':''}">${l}</button>`).join('')}</div><div class="seg" id="fg">${['daily','weekly','monthly'].map(v=>`<button data-v="${v}" class="${gran===v?'on':''}">${v}</button>`).join('')}</div><span class="note">Forecast Occupancy = 0.40·H + 0.25·W + 0.25·B + 0.10·C (weights in Settings). ${U.fcRange==='365'?'Beyond 90 days only H, W and C are available; weights are redistributed.':''}</span>`)}
  <div class="grid g4" style="margin-bottom:14px">
   ${kpi('Avg forecast occupancy',pc(mean(days.map(x=>x.f)),1),`Next ${H} days · FORECAST`,'k-green')}
   ${kpi('Expected room demand',num(sum(days.map(x=>x.rooms)),0),'Room-nights · FORECAST','k-green')}
   ${kpi('Expected guests',num(sum(days.map(x=>x.guests)),0),'Guest-nights · FORECAST','k-gold')}
   ${kpi('Forecast confidence',f0.conf?f0.conf.label:'–',f0.conf?`Backtest error ±${(f0.conf.mae*100).toFixed(1)} pts at ${f0.conf.btLead}-day lead (${f0.conf.btN} days)`:'','k-gold')}
  </div>
  <div class="grid g2" style="margin-bottom:14px">
   <div class="card"><div class="hd"><div><h2>Occupancy: history and forecast</h2><p>Solid = actual (to as-of). Dashed = forecast with ± backtest error band. Light line = workbook value for later dates (scheduled data, not actual).</p></div></div><div id="f1"></div></div>
   <div class="card"><div class="hd"><div><h2>Actual vs forecast (backtest)</h2><p>Forecast issued ${M.S.btLead} days before each date, last 90 days. Mean abs. error ${pc(bt.mae,1)}, bias ${sgn(bt.bias*100,1)} pts.</p></div></div><div id="f2"></div></div>
   <div class="card"><div class="hd"><h2>Expected room demand and guests</h2></div><div id="f3"></div></div>
   <div class="card"><div class="hd"><div><h2>Booking pickup</h2><p>Rooms on the books vs the historical average at the same lead time (next 30 days)</p></div></div><div id="f4"></div></div>
   <div class="card"><div class="hd"><div><h2>Cancellation trend</h2><p>30-day windows by check-in date. Baseline ${pc(cs.base,1)} ±${pc(cs.sd,1)}.</p></div></div><div id="f5"></div></div>
   <div class="card"><h2>How this forecast is built</h2>${['H','W','B','C'].map(k=>{const i=f0.inputs[k];return`<div class="stat"><span><b>${k}</b> ${esc(i.desc)}</span><b>${i.v==null?'unavailable':pc(i.v,1)} <span class="note">n=${i.n}${f0.weightsUsed[k]!=null?' · weight '+pc(f0.weightsUsed[k]):''}</span></b></div>`}).join('')}<p class="note">Showing ${dstr(f0.t)}. ${esc(f0.notes.join(' '))} Confidence combines input coverage (${pc(f0.coverage)}), sample size and measured backtest error.</p></div>
  </div>
  <div class="grid g2" style="margin-bottom:14px"><div class="card"><h2>High-demand periods</h2>${tbl(['Date','Forecast','Rooms'],hi.map(x=>[`${dstr(x.t)} ${dow(x.t)}`,pc(x.f),num(x.rooms,1)]))}</div><div class="card"><h2>Low-demand periods</h2>${tbl(['Date','Forecast','Rooms'],lo.map(x=>[`${dstr(x.t)} ${dow(x.t)}`,pc(x.f),num(x.rooms,1)]))}</div></div>
  <div class="card"><h2>Daily forecast detail (next 14 days)</h2><div style="height:8px"></div>${tbl(['Date','H','W','B','C','Forecast','Rooms','Guests','Pickup','Confidence'],days.slice(0,14).map(x=>{const i=x.fc.inputs,p=v=>v.v==null?'–':pc(v.v);return[`${dshort(x.t)} ${dow(x.t)}${x.fc.fest?' '+pill('Festival','gold'):''}`,p(i.H),p(i.W),p(i.B),p(i.C),`<b>${pc(x.f)}</b>`,num(x.rooms,1),num(x.guests,0),x.fc.pickup!=null?pc(x.fc.pickup):'–',x.fc.conf?x.fc.conf.label:'']}),{num:[1,2,3,4,5,6,7,8]})}</div>`;
  return{html,draw(){
    const hn=60,hl=[],hv=[];for(let k=hn;k>=0;k--){hl.push(dshort(a-k));hv.push(M.occ[a-k-M.d0]/M.cap.all)}
    const mae=bt.mae||0.08;
    const L=[...hl,...g.map(x=>x.l)],act=[...hv,...g.map(()=>null)],fc=[...hl.map((_,i)=>i===hn?hv[i]:null),...g.map(x=>x.f)],band=[...hl.map(()=>[null,null]),...g.map(x=>[Math.max(0,x.f-mae),Math.min(1,x.f+mae)])],wb=[...hl.map(()=>null),...g.map(x=>x.wb)];
    C.line($('#f1'),{labels:L,series:[{name:'Actual',data:act,area:true},{name:'Forecast',data:fc,color:'var(--c2)',dash:true,band},{name:'Workbook later value (not actual)',data:wb,color:'var(--mute)',width:1}],yFmt:v=>pc(v),yMin:0,yMax:1,h:260,marks:[{from:hn,to:L.length-1,label:'Forecast'}]});
    C.line($('#f2'),{labels:bt.rows.map(r=>dshort(r.d)),series:[{name:'Actual',data:bt.rows.map(r=>r.act)},{name:'Forecast',data:bt.rows.map(r=>r.fc),color:'var(--c2)',dash:true}],yFmt:v=>pc(v),yMin:0,yMax:1,h:260});
    C.bar($('#f3'),{labels:g.map(x=>x.l),series:[{name:gran==='daily'?'Rooms':'Avg rooms/day',data:g.map(x=>gran==='daily'?x.rooms:x.rooms),color:'var(--c1)'},{name:gran==='daily'?'Guests':'Guests (total)',data:g.map(x=>x.guests),color:'var(--c2)'}],yFmt:v=>num(v,0),h:260});
    C.bar($('#f4'),{labels:pick.map(f=>dshort(f.t)),series:[{name:'On the books (rooms)',data:pick.map(f=>f.otb),color:'var(--c1)'},{name:'Historical average at same lead',data:pick.map(f=>f.inputs.B.avgOTB),color:'var(--c2)'}],yFmt:v=>num(v,1),h:260});
    C.line($('#f5'),{labels:cs.wins.slice(-18).map(w=>ymLabel(iso(w.end).slice(0,7))),series:[{name:'Cancellation rate',data:cs.wins.slice(-18).map(w=>w.rate)},{name:'Baseline',data:cs.wins.slice(-18).map(()=>cs.base),color:'var(--c2)',dash:true}],yFmt:v=>pc(v,0),yMin:0,h:240})},
   bind(){document.querySelectorAll('#fr button').forEach(b=>b.onclick=()=>{U.fcRange=b.dataset.v;if(b.dataset.v==='365'&&U.fcGran==='daily')U.fcGran='monthly';UI.render(true)});document.querySelectorAll('#fg button').forEach(b=>b.onclick=()=>{U.fcGran=b.dataset.v;UI.render(true)})}}};

/* ---------------- Pricing ---------------- */
V.pricing=function(){
  const M=UI.M,a=UI.asof(),base=U.priceStart||a+1,ps=UI.proposals().filter(p=>p.kind==='price').filter(p=>U.priceCat==='all'||p.cat===U.priceCat);
  const tot=sum(ps.filter(p=>!p.noChange&&UI.stOf(p)==='Awaiting Approval').map(p=>p.impact));
  const rows=ps.map(p=>{const r=p.rec,st=UI.stOf(p),ap=UI.appr[p.id],fc=r.fc,val=ap&&ap.value!=null&&['Approved','Modified','Executing','Completed'].includes(st)?ap.value:r.rec;
    return[`${dshort(p.t)} ${dow(p.t)}`,esc(p.cat),inr(r.pub),`<b>${inr(val)}</b>${val!==r.rec?`<div class="note">proposed ${inr(r.rec)}</div>`:''}`,`${sgn((val/r.pub-1)*100,1)}%<div class="note">${sgn(r.devPct,1)}% vs reference</div>`,pc(fc.f),fc.pickup!=null?pc(fc.pickup):'–',r.comp?inr(r.comp.median)+`<div class="note">${r.prem>=0?'+':''}${r.prem.toFixed(0)}% vs lodge</div>`:'<span class="note">none</span>',`<span class="${(r.impact||0)>=0?'up':'dn'}">${(r.impact||0)>=0?'+':''}${inr(r.impact)}</span>`,`${inr(r.min)}–${inr(r.max)}`,`<details><summary>Why</summary><ul class="note" style="margin:4px 0;padding-left:16px">${r.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}${r.flags.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`,UI.stPill(st)+'<div style="margin-top:4px">'+UI.actBtns(p)+'</div>']});
  const html=`${demoBanner()}<div class="demo">Prices below are <b>proposals</b>. A price counts as published (in this prototype) only after you approve it. The published price starts at the Room Master standard price; approvals move it.</div>
  ${ctl(`<label>From <input type="date" id="ps" value="${iso(base)}" min="${iso(a+1)}"></label><label>Category <select id="pcat"><option value="all">All</option>${M.cats.map(c=>`<option ${U.priceCat===c?'selected':''}>${c}</option>`).join('')}</select></label><button class="btn sec sm" id="appall">Approve all pending in view</button><span class="note">Pending net revenue effect (estimate): <b>${inr(tot)}</b></span>`)}
  <div class="grid g4" style="margin-bottom:14px">${M.cats.map(c=>{const i=M.info[c],r=E.priceRec(M,a,base,c);return kpi(c,inr(r.rec),`Published ${inr(r.pub)} · allowed ${inr(r.min)}–${inr(r.max)} · ${sgn(r.changePct,1)}%`,'k-gold')}).join('')}</div>
  <div class="card"><div class="hd"><div><h2>Recommendations</h2><p>Revenue effect = (new price × expected rooms after assumed demand response) − (published price × expected rooms). Price elasticity ${M.S.elasticity} is an <b>assumption</b>, not measured.</p></div></div>${tbl(['Date','Category','Current','Recommended','Change','Forecast occ.','Booking pace','Competitor median','Est. revenue effect','Min–Max','Reason','Status / action'],rows,{num:[2,5,6]})}</div>
  <div class="card" style="margin-top:14px"><h2>Algorithm</h2><p class="note">Occupancy band + booking-pace adjustment + competitor adjustment + festival adjustment (only with evidence and not on top of a high occupancy adjustment) → reference price × (1 + combined). Then: minimum and maximum price, ±${M.S.maxDailyChange}% from the published price, ±${M.S.maxDeviation}% from reference, category by category, rounded to ₹${M.S.roundTo}. Thresholds are in Settings.</p></div>`;
  return{html,bind(){$('#ps').onchange=e=>{U.priceStart=e.target.value?dn(e.target.value):null;UI.render(true)};$('#pcat').onchange=e=>{U.priceCat=e.target.value;UI.render(true)};
    $('#appall').onclick=()=>{let n=0;ps.forEach(p=>{if(!p.noChange&&UI.stOf(p)==='Awaiting Approval'){const x=UI.appr[p.id]=UI.appr[p.id]||{};Object.assign(x,{status:'Approved',kind:'price',cat:p.cat,t:p.t,value:p.value,snap:{...p.rec}});n++}});UI.logAdd(`Pricing: ${n} proposal(s) approved in bulk — simulated`);UI.applyApprovals();UI.save();UI.render(true);UI.toast(n+' proposals approved')}}}};

/* ---------------- Competitors ---------------- */
V.competitors=function(){
  const M=UI.M,a=UI.asof(),ds=M.compDates;let obs=U.compObs||ds.filter(n=>n>=a)[0]||ds[ds.length-1];
  const rows=M.comp.filter(r=>r.n===obs),cats=M.cats.filter(c=>rows.some(r=>r.Room_Category===c));
  const prevObs=ds.filter(n=>n<obs).pop(),prevYear=ds.find(n=>Math.abs(n-(obs-365))<=10);
  const stats=cats.map(c=>{const p=rows.filter(r=>r.Room_Category===c).map(r=>r.Competitor_Room_Price),pub=E.pubPrice(M,c,obs);return{c,mean:mean(p),med:E.median(p),min:Math.min(...p),max:Math.max(...p),pub,prem:(pub/E.median(p)-1)*100}});
  const mv=(r)=>{const f=n=>{const x=M.comp.find(y=>y.n===n&&y.Competitor_ID===r.Competitor_ID&&y.Room_Category===r.Room_Category);return x?x.Competitor_Room_Price:null};const p=prevObs?f(prevObs):null,y=prevYear?f(prevYear):null;return[p?`<span class="${r.Competitor_Room_Price>=p?'up':'dn'}">${sgn((r.Competitor_Room_Price/p-1)*100,1)}%</span>`:'–',y?`<span class="${r.Competitor_Room_Price>=y?'up':'dn'}">${sgn((r.Competitor_Room_Price/y-1)*100,1)}%</span>`:'–']};
  const tab=rows.sort((x,y)=>x.Room_Category<y.Room_Category?-1:x.Room_Category>y.Room_Category?1:x.Competitor_Room_Price-y.Competitor_Room_Price).map(r=>{const pub=E.pubPrice(M,r.Room_Category,obs),df=(pub/r.Competitor_Room_Price-1)*100,m=mv(r);
    return[esc(r.Competitor_Name),r.Room_Category,inr(r.Competitor_Room_Price),inr(pub),`<span class="${df>0?'dn':'up'}">${sgn(df,1)}%</span> ${df>0?pill('Competitor cheaper','warn'):pill('Competitor dearer','good')}`,m[0],m[1],pc(r.Discount_Offered),r.Rooms_Available,pc(r.Occupancy_Estimate),r.Breakfast_Included,esc(r.Cancellation_Policy),esc(r.Booking_Conditions),dstr(r.upd),`<span class="note">${esc(r.Data_Quality)}</span>`]});
  const cheaper=cats.map(c=>{const p=rows.filter(r=>r.Room_Category===c),pub=E.pubPrice(M,c,obs);return`${c}: ${p.filter(r=>r.Competitor_Room_Price<pub).length} of ${p.length} competitors are cheaper than the lodge's ${inr(pub)}`});
  const fe=M.editions.filter(e=>!e.planned).map(e=>{const rs=M.comp.filter(r=>r.n>=e.start&&r.n<=e.end);return rs.length?{y:e.year,price:mean(rs.map(r=>r.Competitor_Room_Price)),disc:mean(rs.map(r=>r.Discount_Offered)),occ:mean(rs.map(r=>r.Occupancy_Estimate)),own:e.actOcc}:null}).filter(Boolean);
  const html=`${demoBanner()}<div class="demo"><b>Competitor records are fictional.</b> Every row is marked "${esc(rows[0]?rows[0].Data_Quality:'')}" in the workbook and is not real market research. The workbook has ${ds.length} observation dates, 6 lodges and no Family Suite category.</div>
  ${ctl(`<label>Observation date <select id="cobs">${ds.map(n=>`<option value="${n}" ${n===obs?'selected':''}>${dstr(n)}${n>a?' (after as-of)':''}</option>`).join('')}</select></label><span class="note">Last updated: ${rows.length?dstr(Math.max(...rows.map(r=>r.upd))):'–'} · lodge price = published price on that date</span>`)}
  <div class="grid g3" style="margin-bottom:14px">${stats.map(s=>`<div class="card"><h2>${s.c}</h2><div class="stat"><span>Market mean / median</span><b>${inr(s.mean)} / ${inr(s.med)}</b></div><div class="stat"><span>Range</span><b>${inr(s.min)}–${inr(s.max)}</b></div><div class="stat"><span>Lodge</span><b>${inr(s.pub)} <span class="${s.prem>M.S.alerts.compGap?'dn':''}">${sgn(s.prem,1)}%</span></b></div></div>`).join('')}</div>
  <div class="grid g2" style="margin-bottom:14px"><div class="card"><div class="hd"><div><h2>Median competitor price over time</h2><p>Per category vs the lodge standard price (dotted)</p></div></div><div id="cc1"></div></div>
   <div class="card"><h2>What this means for pricing</h2><ul style="padding-left:18px;margin:6px 0">${cheaper.map(x=>`<li>${x}.</li>`).join('')}<li>The pricing engine only reviews a reduction when the lodge is more than ${M.S.compPremiumThreshold}% above the median <i>and</i> forecast occupancy is below ${M.S.compReduceBelowOcc}%. It never matches the cheapest competitor.</li><li>Room quality, breakfast and cancellation terms differ by lodge (see table), so a lower price is not automatically a like-for-like undercut.</li>${fe.length?`<li>At earlier festivals competitors' average discount was ${fe.map(f=>f.y+': '+pc(f.disc,0)).join(', ')} while the lodge's festival occupancy was ${fe.map(f=>f.y+': '+pc(f.own,0)).join(', ')}.</li>`:''}</ul></div></div>
  ${fe.length?`<div class="card" style="margin-bottom:14px"><h2>Festival comparison</h2>${tbl(['Year','Competitor avg price','Competitor avg discount','Competitor est. occupancy','Lodge actual occupancy'],fe.map(f=>[f.y,inr(f.price),pc(f.disc,1),pc(f.occ,0),pc(f.own,1)]),{num:[1,2,3,4]})}<p class="note">Only the observation dates inside each festival window are used.</p></div>`:''}
  <div class="card"><h2>Competitor rates on ${dstr(obs)}</h2><div style="height:8px"></div>${tbl(['Competitor','Category','Price','Lodge price','Difference','vs prev. obs.','vs last year','Discount','Rooms avail.','Est. occupancy','Breakfast','Cancellation','Conditions','Last updated','Data quality'],tab,{num:[2,3,7,8,9]})}</div>`;
  return{html,draw(){const labs=ds.map(n=>ymLabel(iso(n).slice(0,7))+' '+iso(n).slice(8));C.line($('#cc1'),{labels:labs,series:[...M.cats.filter(c=>M.comp.some(r=>r.Room_Category===c)).map((c,i)=>({name:c+' competitor median',data:ds.map(n=>E.median(M.comp.filter(r=>r.n===n&&r.Room_Category===c).map(r=>r.Competitor_Room_Price)),),color:'var(--c'+(i+1)+')'})),...M.cats.filter(c=>M.comp.some(r=>r.Room_Category===c)).map((c,i)=>({name:c+' lodge',data:ds.map(()=>M.info[c].ref),color:'var(--c'+(i+1)+')',dash:true,width:1}))],yFmt:v=>inr(v),yFmtW:60,h:280,xw:90})},
   bind(){$('#cobs').onchange=e=>{U.compObs=+e.target.value;UI.render(true)}}}};
})(window);
