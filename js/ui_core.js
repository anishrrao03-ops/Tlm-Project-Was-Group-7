/* UI core: state, formatting, approvals, shell */
(function(g){
const E=g.LMEngine,{iso,dn,sum,mean}=E;
const UI=g.UI={E,views:{},ui:{view:'overview',range:'90',from:null,to:null,cmp:'prev',fcRange:'30',fcGran:'daily',priceStart:null,priceCat:'all',compObs:null,finYear:'all',festSel:null,repType:'monthly',repVal:'',res:{q:'',ch:'all',st:'all',page:0},assistant:[],cur:null}};
const U=UI.ui;
const $=(s,r)=>(r||document).querySelector(s),$$=(s,r)=>[...(r||document).querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const inr=n=>n==null||isNaN(n)?'–':'₹'+Math.round(n).toLocaleString('en-IN');
const lakh=n=>n==null||isNaN(n)?'–':(Math.abs(n)>=1e7?'₹'+(n/1e7).toFixed(2)+' Cr':Math.abs(n)>=1e5?'₹'+(n/1e5).toFixed(2)+' L':inr(n));
const pc=(x,d=0)=>x==null||isNaN(x)?'–':(x*100).toFixed(d)+'%';
const num=(n,d=0)=>n==null||isNaN(n)?'–':Number(n).toLocaleString('en-IN',{maximumFractionDigits:d,minimumFractionDigits:d});
const sgn=(n,d=0)=>(n>0?'+':'')+n.toFixed(d);
const dstr=n=>{const d=new Date(n*864e5);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})};
const dshort=n=>{const d=new Date(n*864e5);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'})};
const dow=n=>E.DOWN[E.dowOf(n)];
const pill=(t,c)=>`<span class="pill ${c||''}">${esc(t)}</span>`;
const sevPill=s=>pill(s,{Critical:'bad',High:'warn',Medium:'info',Low:'good',Pass:'good',Warning:'warn',Info:'info'}[s]);
Object.assign(UI,{$,$$,esc,inr,lakh,pc,num,sgn,dstr,dshort,dow,pill,sevPill});

/* ---------- persistence (guarded) ---------- */
const KEY='lodgemate_ai_v1';let mem={};
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return mem}};
const save=()=>{const o={settings:UI.S,appr:UI.appr,log:UI.log,extra:UI.extra};mem=o;try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}};
UI.save=save;
UI.toast=m=>{const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)};
UI.asof=()=>E.asofN(UI.M);

/* ---------- model lifecycle ---------- */
UI.init=function(sheets,keepState){
  const saved=keepState?{settings:UI.S,appr:UI.appr,log:UI.log,extra:UI.extra}:load();
  UI.S=E.newSettings(saved.settings);UI.appr=saved.appr||{};UI.log=saved.log||[];UI.extra=saved.extra||[];
  UI.M=E.build(sheets,UI.S);UI.sheets=sheets;
  const M=UI.M,a=UI.asof();
  U.from=null;U.to=null;U.priceStart=null;U.compObs=null;
  UI.applyApprovals();
};
UI.recompute=function(){const M=UI.M;M.cache={};M.rebuildPlanned();UI.applyApprovals();save()};
UI.applyApprovals=function(){const M=UI.M;M.price.pub={};M.price.incoming={};
  for(const id in UI.appr){const a=UI.appr[id];if(!['Approved','Modified','Executing','Completed'].includes(a.status))continue;
    if(a.kind==='price')M.price.pub[a.cat+'|'+a.t]=a.value;
    if(a.kind==='inv')M.price.incoming[a.item]=(M.price.incoming[a.item]||0)+a.value}};
UI.logAdd=t=>{UI.log.unshift({ts:new Date().toLocaleString('en-IN'),t});UI.log=UI.log.slice(0,200)};

/* ---------- proposals ---------- */
UI.proposals=function(){
  const M=UI.M,a=UI.asof(),out=[],dl=k=>dstr(a+k);
  /* pricing */
  const base=U.priceStart||a+1;
  const snapPub={};
  for(const id in UI.appr){const x=UI.appr[id];if(x.kind==='price')snapPub[id]=x}
  for(let k=0;k<7;k++)for(const c of M.cats){const t=base+k,id='PRC|'+c+'|'+t,st=UI.appr[id];
    let r;if(st&&st.snap&&['Approved','Modified','Executing','Completed'].includes(st.status)){r=st.snap}else{const keep=M.price.pub[c+'|'+t];delete M.price.pub[c+'|'+t];r=E.priceRec(M,a,t,c);if(keep!=null)M.price.pub[c+'|'+t]=keep}
    out.push({id,type:'Room price changes',kind:'price',cat:c,t,rec:r,title:`${c} room price for ${dshort(t)} (${dow(t)})`,
      recommendation:r.rec===r.pub?`Keep ${inr(r.pub)} (no change)`:`Change ${c} price on ${dstr(t)} from ${inr(r.pub)} to ${inr(r.rec)} (${sgn(r.changePct||0,1)}%)`,
      evidence:[`Forecast occupancy ${pc(r.fc.f)} (${r.fc.conf?r.fc.conf.label+' confidence':''})`,r.comp?`Competitor median ${inr(r.comp.median)}`:'No competitor comparable',r.fc.pickup!=null?`Booking pace ${pc(r.fc.pickup)} of history`:'No pace signal'],
      reasoning:r.reasons.join(' '),impact:r.impact||0,risk:r.rec<r.pub?'Medium: lower rate may not stimulate demand':'Medium: higher rate may reduce bookings',deadline:dstr(t-1),value:r.rec,noChange:r.rec===r.pub,unit:'₹'})}
  /* staffing */
  const wk={};
  for(let k=1;k<=7;k++){const s=E.staffing(M,a,a+k);for(const x of s.shortages){const id=`STF|${x.dept}|${a+k}`;
    out.push({id,type:x.option==='Overtime'?'Overtime':'Temporary hiring',kind:'staff',title:`${x.dept}: ${x.option.toLowerCase()} for ${dshort(a+k)}`,recommendation:`${x.option==='Overtime'?'Approve overtime':'Hire temporary staff'} for ${x.shortage} ${x.dept.toLowerCase()} shift(s) on ${dstr(a+k)}`,evidence:[`Required ${x.required} (ratio rules), roster has ${x.available} present`,`Overtime est. ${inr(x.otCost)}; temporary est. ${inr(x.tempCost)}`],reasoning:`Staff Shortage = Required − Available = ${x.required} − ${x.available}. The cheaper feasible option is proposed. Nothing is committed until approved.`,impact:-x.cost,risk:'Low to medium: short-notice availability',deadline:dstr(a+k-1),value:x.shortage,unit:'shifts'});wk[x.dept]=1}}
  let cover=0;for(let k=1;k<=7;k++){const s=E.staffing(M,a,a+k);cover+=s.shortages.length}
  out.push({id:'SCH|'+(a+1),type:'Staff schedules',kind:'sched',title:`Draft roster for ${dshort(a+1)}–${dshort(a+7)}`,recommendation:`Publish the draft roster for the next 7 days${cover?` with ${cover} gap(s) covered by the proposals above`:' (no gaps found)'}`,evidence:['Roster rows from Staff Management for each date','Requirements from the staffing ratios in Settings'],reasoning:'The roster is the workbook schedule checked against the forecast requirement per department.',impact:0,risk:'Low',deadline:dstr(a+1),value:null});
  /* inventory */
  for(const it of E.invAll(M,a)){if(it.status==='OK'||it.status==='Watch'||it.order<=0)continue;const id='INV|'+it.name+'|'+a;
    out.push({id,type:'Inventory purchases',kind:'inv',item:it.name,title:`Purchase ${it.name}`,recommendation:`Order ${Math.ceil(it.order)} ${it.unit} of ${it.name} from ${it.supplier?it.supplier.Supplier_Name:it.supplierId} (lead time ${it.lead} d)`,evidence:[`Available ${num(it.available,0)} ${it.unit}; reorder point ${num(it.rop,0)}; expected use ${num(it.expDaily,1)}/day`,`Status: ${it.status}`],reasoning:`Suggested quantity = MAX(0, target − available) = ${num(it.target,0)} − ${num(it.available,0)}. Target covers max(${it.tdays} days, lead time + 1) of expected use plus safety stock.`,impact:-Math.ceil(it.order)*it.unitCost,risk:it.status.startsWith('Stock-out')?'High if not ordered':'Medium',deadline:dstr(a+0),value:Math.ceil(it.order),unit:it.unit})}
  /* catering + taxi */
  let cat=null,tx=null;
  for(let k=1;k<=14;k++){const t=a+k,d=E.demand(M,a,t),s=E.staffing(M,a,t),kit=s.rows.find(r=>r.dept==='Kitchen'),capM=kit.available*M.S.staff.kitchenMeals*1;
    if(d.meals>capM&&!cat)cat={t,d,capM};
    const tr=E.transport(M,a,t);if(tr.gap>0&&!tx)tx={t,tr}}
  if(cat)out.push({id:'CAT|'+cat.t,type:'Catering',kind:'cat',title:`Outside catering for ${dshort(cat.t)}`,recommendation:`Request quotes from partner restaurants for about ${num(cat.d.meals-cat.capM)} meals`,evidence:[`Expected meals ${num(cat.d.meals)} vs kitchen capacity ${num(cat.capM)}`],reasoning:'Internal capacity from roster × meals per worker per shift.',impact:0,risk:'Medium',deadline:dstr(cat.t-2),value:null});
  if(tx)out.push({id:'TAX|'+tx.t,type:'Taxi arrangements',kind:'taxi',title:`Extra transport for ${dshort(tx.t)}`,recommendation:`Ask additional transport partners to confirm availability for ${num(tx.tr.gap,0)} more trips`,evidence:[`Expected requests ${num(tx.tr.requests,0)} vs partner capacity ${num(tx.tr.cap,0)} trips`],reasoning:'Transport Capacity Gap = expected requests − available partner capacity (assumption-based, see Settings).',impact:0,risk:'Medium',deadline:dstr(tx.t-2),value:null});
  /* promotions */
  const pr=E.promotions(M,a);
  pr.options.filter(o=>o.ok&&pr.days.length).sort((x,y)=>y.contrib-x.contrib).slice(0,2).forEach(o=>out.push({id:'PRM|'+o.id+'|'+a,type:'Promotions',kind:'promo',title:o.name,recommendation:`Run "${o.name}" (${o.disc}% off) on ${pr.days.length} forecast-weak day(s) in the next 28 days`,evidence:[`${pr.days.length} days forecast below ${M.S.weekday.threshold}%`,`Estimated added room-nights ${num(o.addRooms,0)} (assumed lift ${pc(o.lift)})`],reasoning:`Contribution after discounts on existing demand and variable costs is positive: ${inr(o.contrib)}. The lift is an assumption, not a measured result.`,impact:o.contrib,risk:'Medium: lift is an assumption',deadline:dstr(a+3),value:o.disc,unit:'% off'}));
  for(const x of UI.extra)out.push(x);
  return out;
};
const FLOW=['Awaiting Approval','Approved','Executing','Completed'];
UI.stOf=p=>(UI.appr[p.id]||{}).status||'Awaiting Approval';
UI.act=function(p,action,val){
  const a=UI.appr[p.id]=UI.appr[p.id]||{status:'Awaiting Approval'};const old=a.status;
  Object.assign(a,{kind:p.kind,cat:p.cat,t:p.t,item:p.item});
  if(p.kind==='price')a.snap={...p.rec};
  if(action==='approve'){a.status='Approved';a.value=a.value!=null&&old==='Modified'?a.value:p.value}
  else if(action==='modify'){const v=Number(val);if(!isFinite(v)||v<=0)return UI.toast('Enter a valid value');if(p.kind==='price'){const r=p.rec;if(v<r.min||v>r.max)return UI.toast(`Price must stay within ${inr(r.min)}–${inr(r.max)}`)}a.status='Modified';a.value=v;if(a.snap)a.snap.rec=v}
  else if(action==='reject'){a.status='Rejected'}
  else if(action==='execute'){a.status='Executing'}
  else if(action==='complete'){a.status='Completed'}
  else if(action==='reset'){delete UI.appr[p.id]}
  UI.logAdd(`${p.type}: "${p.title}" → ${action==='reset'?'Awaiting Approval':a.status}${a.value!=null&&action!=='reject'&&action!=='reset'?` (value ${a.value})`:''} — simulated, no external action taken`);
  UI.applyApprovals();save();UI.render(true);
};
UI.actBtns=function(p){const st=UI.stOf(p),id=esc(p.id);
  if(p.noChange&&st==='Awaiting Approval')return'<span class="note">No change needed</span>';
  const b=(a,l,c)=>`<button class="btn sm ${c||''}" data-act="${a}" data-id="${id}">${l}</button>`;
  if(st==='Awaiting Approval'||st==='Rejected')return b('approve','Approve')+' '+b('modify','Modify','sec')+' '+(st==='Rejected'?b('reset','Reopen','sec'):b('reject','Reject','bad'));
  if(st==='Modified')return b('approve','Approve as modified')+' '+b('execute','Execute','sec')+' '+b('reset','Undo','sec');
  if(st==='Approved')return b('execute','Start execution','gold')+' '+b('modify','Modify','sec')+' '+b('reset','Undo','sec');
  if(st==='Executing')return b('complete','Mark completed','gold');
  return b('reset','Reopen','sec')};
UI.stPill=s=>pill(s,{'Awaiting Approval':'warn',Approved:'good',Rejected:'bad',Modified:'info',Executing:'gold',Completed:'good'}[s]);

/* click delegation for approvals */
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const p=UI.proposals().find(x=>x.id===b.dataset.id);if(!p)return;
  if(b.dataset.act==='modify'){const cell=b.closest('td,div');const cur=(UI.appr[p.id]||{}).value??p.value;
    const box=document.createElement('span');box.innerHTML=`<input type="number" step="any" value="${cur}" style="width:92px" id="mod_${UI.$$('[id^=mod_]').length}"> <button class="btn sm">Save</button>`;b.replaceWith(box);const inp=box.querySelector('input');inp.focus();
    box.querySelector('button').onclick=()=>UI.act(p,'modify',inp.value);inp.onkeydown=ev=>{if(ev.key==='Enter')UI.act(p,'modify',inp.value)};return}
  UI.act(p,b.dataset.act)});

/* ---------- shell ---------- */
const NAV=[['Command',[['overview','Overview','◈'],['assistant','AI Command Centre','✦'],['approvals','AI Approval Centre','✓']]],
['Planning',[['forecast','Demand Forecasting','↗'],['pricing','Dynamic Pricing','₹'],['competitors','Competitors','⚖'],['weekday','Weekday Optimisation','◐'],['festivals','Festival Planner','✺']]],
['Operations',[['reservations','Reservations & Guests','▤'],['workforce','Workforce','☺'],['inventory','Inventory & Procurement','▣'],['kitchen','Food & Kitchen','♨'],['partners','Local Partners','⇄']]],
['Insight',[['finance','Financial Analytics','▥'],['reports','Reports','⎙'],['rag','RAG Knowledge Base','❖'],['mcp','MCP Connections','⛓'],['quality','Data & Quality','✔'],['settings','Settings','⚙']]]];
const TITLES={};NAV.forEach(([,l])=>l.forEach(([k,t])=>TITLES[k]=t));
UI.shell=function(){
  document.getElementById('root').innerHTML=`<div class="app"><aside class="rail" id="rail"><div class="brand"><div class="logo">L</div><div><b>LODGEMATE AI</b><small>Temple Trails Family Lodge</small></div></div><nav class="nav" id="nav"></nav><div class="sp"></div><div class="note" style="color:var(--railfg);opacity:.6;padding:8px 10px">Frontend prototype · synthetic workbook · no external actions</div></aside><div class="main"><div class="top"><button class="btn sec menu" id="menu" aria-label="Menu">☰</button><div class="ttl"><h1 id="ttl"></h1><div class="sub" id="sub"></div></div><div id="topctl" class="row"></div></div><div id="view" class="fade"></div></div></div>`;
  $('#menu').onclick=()=>$('#rail').classList.toggle('open');
  UI.nav();
};
UI.nav=function(){const pend=UI.proposals().filter(p=>UI.stOf(p)==='Awaiting Approval'&&!p.noChange).length;
  $('#nav').innerHTML=NAV.map(([g,l])=>`<div class="grp">${g}</div>`+l.map(([k,t,i])=>`<a href="#${k}" class="${U.view===k?'on':''}"><span class="ico">${i}</span>${t}${k==='approvals'&&pend?`<span class="badge">${pend}</span>`:''}</a>`).join('')).join('')};
UI.render=function(keepScroll){
  const v=UI.views[U.view]||UI.views.overview,y=window.scrollY;
  const M=UI.M,a=UI.asof();
  $('#ttl').textContent=TITLES[U.view]||'Overview';
  $('#sub').innerHTML=`As of <b>${dstr(a)}</b> · ${esc(M.lodge.Lodge_Name||'Lodge')} · ${M.cap.all} rooms · <span class="pill gold">DEMO DATA</span>`;
  $('#topctl').innerHTML=`<label class="note">As-of date <input type="date" id="asof" value="${iso(a)}" min="${iso(M.d0)}" max="${iso(M.d1)}"></label><button class="btn sec sm" id="theme" aria-label="Toggle theme">◐</button>`;
  $('#asof').onchange=e=>{if(!e.target.value)return;UI.S.asof=e.target.value;U.priceStart=null;U.from=null;U.to=null;UI.recompute();UI.render()};
  $('#theme').onclick=()=>{const r=document.documentElement,d=r.dataset.theme==='dark'||(!r.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches);r.dataset.theme=d?'light':'dark';UI.render(true)};
  const out=v();$('#view').innerHTML=out.html;$('#view').classList.remove('fade');void $('#view').offsetWidth;$('#view').classList.add('fade');
  UI.nav();if(out.draw)try{out.draw()}catch(e){console.error(e);$('#view').insertAdjacentHTML('beforeend',`<div class="demo">A chart could not be drawn: ${esc(e.message)}</div>`)}
  if(out.bind)out.bind();
  window.scrollTo(0,keepScroll?y:0);
};
UI.route=function(){const h=location.hash.replace('#','');U.view=UI.views[h]?h:'overview';$('#rail')&&$('#rail').classList.remove('open');UI.render()};
UI.tbl=(heads,rows,o={})=>`<div class="tw" ${o.id?`id="${o.id}"`:''}><table><thead><tr>${heads.map((h,i)=>`<th class="${(o.num||[]).includes(i)?'n':''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${(o.num||[]).includes(i)?'n':''}">${c}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${heads.length}" class="note">No records match.</td></tr>`}</tbody></table></div>`;
UI.kpi=(l,v,s,c)=>`<div class="card kpi ${c||''}"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s||''}</span></div>`;
UI.csv=function(name,heads,rows){const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';const txt=[heads.map(q).join(','),...rows.map(r=>r.map(q).join(','))].join('\n');
  try{const b=new Blob([txt],{type:'text/csv'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),500);UI.toast('CSV generated: '+name)}catch(e){}
  try{navigator.clipboard.writeText(txt).then(()=>UI.toast('Also copied to clipboard'),()=>{})}catch(e){}};
})(window);
