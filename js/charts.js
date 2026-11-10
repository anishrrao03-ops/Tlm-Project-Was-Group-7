/* Small SVG chart kit (no dependencies). Colours come from CSS variables so both themes work. */
(function(g){
const NS='http://www.w3.org/2000/svg';
let tip;const T=()=>tip||(tip=Object.assign(document.body.appendChild(document.createElement('div')),{className:'tip'}));
const showTip=(e,html)=>{const t=T();t.innerHTML=html;t.style.display='block';const w=t.offsetWidth,x=Math.min(innerWidth-w-8,e.clientX+14);t.style.left=Math.max(8,x)+'px';t.style.top=(e.clientY+16)+'px'};
const hideTip=()=>{if(tip)tip.style.display='none'};
const nice=(lo,hi,n=5)=>{if(hi===lo){hi=lo+1}const r=hi-lo,s=Math.pow(10,Math.floor(Math.log10(r/n))),m=r/n/s,st=(m>5?10:m>2?5:m>1?2:1)*s;const a=Math.floor(lo/st)*st,b=Math.ceil(hi/st)*st,t=[];for(let v=a;v<=b+st/2;v+=st)t.push(+v.toFixed(10));return t};
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const PAL=['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)','var(--c6)'];
function frame(el,o){el.innerHTML='';const W=Math.max(280,el.clientWidth||600),H=o.h||260;const m={l:o.yFmtW||52,r:14,t:12,b:o.xb||30};
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('width','100%');svg.setAttribute('height',H);svg.setAttribute('role','img');if(o.title)svg.setAttribute('aria-label',o.title);el.appendChild(svg);
 const add=(tag,at,txt,par)=>{const n=document.createElementNS(NS,tag);for(const k in at)n.setAttribute(k,at[k]);if(txt!=null)n.textContent=txt;(par||svg).appendChild(n);return n};return{svg,W,H,m,add}}
function legend(el,series){if(series.filter(s=>s.name).length<2&&!series.some(s=>s.legend))return;const d=document.createElement('div');d.className='legend';d.innerHTML=series.filter(s=>s.name).map((s,i)=>`<span><i style="background:${s.color||PAL[i%6]};${s.dash?'background:repeating-linear-gradient(90deg,'+(s.color||PAL[i%6])+' 0 4px,transparent 4px 7px)':''}"></i>${esc(s.name)}</span>`).join('');el.appendChild(d)}
function axes(f,o,ys,xs,labels,yLo,yHi){const{add,W,H,m}=f;const ticks=nice(yLo,yHi,4);
 ticks.forEach(v=>{const y=ys(v);add('line',{x1:m.l,x2:W-m.r,y1:y,y2:y,class:'grid'});add('text',{x:m.l-8,y:y+4,class:'ax','text-anchor':'end'},(o.yFmt||(x=>x))(v))});
 const step=Math.ceil(labels.length/Math.max(2,Math.floor((W-m.l-m.r)/(o.xw||70))));
 labels.forEach((l,i)=>{if(i%step===0)add('text',{x:xs(i),y:H-m.b+16,class:'ax','text-anchor':'middle'},l)});return ticks}
function line(el,o){const f=frame(el,o),{add,W,H,m}=f,n=o.labels.length;
 const all=o.series.flatMap(s=>s.data.filter(v=>v!=null).concat(s.band?s.band.flat().filter(v=>v!=null):[]));let lo=o.yMin!=null?o.yMin:Math.min(0,...all),hi=o.yMax!=null?o.yMax:Math.max(...all,1);
 const tk=nice(lo,hi,4);lo=tk[0];hi=tk[tk.length-1];
 const xs=i=>m.l+(n<2?0:(W-m.l-m.r)*i/(n-1)),ys=v=>H-m.b-(H-m.b-m.t)*(v-lo)/(hi-lo||1);
 axes(f,o,ys,xs,o.labels,lo,hi);
 (o.marks||[]).forEach(mk=>{const a=xs(mk.from),b=xs(mk.to);add('rect',{x:a,y:m.t,width:Math.max(2,b-a),height:H-m.b-m.t,class:'mark'});if(mk.label)add('text',{x:a+3,y:m.t+10,class:'ax'},mk.label)});
 o.series.forEach((s,k)=>{const c=s.color||PAL[k%6];let d='',seg=[];
  s.data.forEach((v,i)=>{if(v==null){if(seg.length)seg.push(null);return}seg.push([xs(i),ys(v)])});
  let cur=[];const runs=[];seg.forEach(p=>{if(p)cur.push(p);else{if(cur.length)runs.push(cur);cur=[]}});if(cur.length)runs.push(cur);
  if(s.band)add('path',{d:s.band.map((b,i)=>b[0]==null?null:[xs(i),b]).filter(Boolean).map((p,i)=>(i?'L':'M')+p[0]+' '+ys(p[1][1])).join('')+s.band.map((b,i)=>b[0]==null?null:[xs(i),b]).filter(Boolean).reverse().map(p=>'L'+p[0]+' '+ys(p[1][0])).join('')+'Z',style:`fill:${c};opacity:.14`});
  runs.forEach(r=>{d=r.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join('');
   if(s.area)add('path',{d:d+`L${r[r.length-1][0]} ${ys(lo)}L${r[0][0]} ${ys(lo)}Z`,style:`fill:${c};opacity:.12`});
   add('path',{d,style:`fill:none;stroke:${c};stroke-width:${s.width||2};${s.dash?'stroke-dasharray:5 4;':''}stroke-linejoin:round`});
   if(r.length<=40||s.dots)r.forEach(p=>add('circle',{cx:p[0],cy:p[1],r:2.5,style:`fill:${c}`}))});
  const last=s.data.map((v,i)=>v!=null?i:-1).filter(i=>i>=0).pop();if(last!=null&&s.end!==false&&n>40)add('circle',{cx:xs(last),cy:ys(s.data[last]),r:3.5,style:`fill:${c}`})});
 const guide=add('line',{y1:m.t,y2:H-m.b,class:'guide',style:'display:none'});
 const ov=add('rect',{x:m.l,y:m.t,width:W-m.l-m.r,height:H-m.t-m.b,style:'fill:transparent'});
 ov.addEventListener('mousemove',e=>{const r=f.svg.getBoundingClientRect(),px=(e.clientX-r.left)*W/r.width;const i=Math.max(0,Math.min(n-1,Math.round((px-m.l)/((W-m.l-m.r)/(n-1||1)))));guide.setAttribute('x1',xs(i));guide.setAttribute('x2',xs(i));guide.style.display='';
  showTip(e,`<b>${esc(o.labels[i])}</b>`+o.series.map((s,k)=>s.data[i]==null?'':`<div><i style="background:${s.color||PAL[k%6]}"></i>${esc(s.name||'')} <b>${(o.tipFmt||o.yFmt||(x=>x))(s.data[i])}</b></div>`).join(''))});
 ov.addEventListener('mouseleave',()=>{guide.style.display='none';hideTip()});legend(el,o.series)}
function bar(el,o){const f=frame(el,o),{add,W,H,m}=f,n=o.labels.length,S=o.series;
 const tot=o.labels.map((_,i)=>o.stacked?S.reduce((a,s)=>a+Math.max(0,s.data[i]||0),0):Math.max(0,...S.map(s=>s.data[i]||0)));const neg=Math.min(0,...S.flatMap(s=>s.data.map(v=>v||0)));
 const tk=nice(Math.min(neg,0),o.yMax||Math.max(...tot,1),4),lo=tk[0],hi=tk[tk.length-1];
 const ys=v=>H-m.b-(H-m.b-m.t)*(v-lo)/(hi-lo||1),bw=(W-m.l-m.r)/n,xs=i=>m.l+bw*(i+.5);axes(f,o,ys,xs,o.labels,lo,hi);
 o.labels.forEach((lb,i)=>{const gw=Math.min(46,bw*.74),k=o.stacked?1:S.length;let off=0;S.forEach((s,j)=>{const v=s.data[i]||0,c=(o.colorFn&&o.colorFn(i,j))||s.color||PAL[j%6];
   const x=o.stacked?xs(i)-gw/2:xs(i)-gw/2+j*gw/k,w=o.stacked?gw:gw/k-1;let y0,y1;if(o.stacked){y0=ys(off);off+=Math.max(0,v);y1=ys(off)}else{y0=ys(0);y1=ys(v)}
   const r=add('rect',{x,y:Math.min(y0,y1),width:Math.max(1,w),height:Math.max(0,Math.abs(y0-y1)),rx:2,style:`fill:${c}`});
   r.addEventListener('mousemove',e=>showTip(e,`<b>${esc(lb)}</b><div><i style="background:${c}"></i>${esc(s.name||'')} <b>${(o.tipFmt||o.yFmt||(x=>x))(v)}</b></div>`));r.addEventListener('mouseleave',hideTip)})});
 (o.hline||[]).forEach(h=>{add('line',{x1:m.l,x2:W-m.r,y1:ys(h.v),y2:ys(h.v),class:'ref'});add('text',{x:W-m.r,y:ys(h.v)-4,class:'ax','text-anchor':'end'},h.label)});legend(el,S)}
function hbar(el,o){el.innerHTML='';const mx=Math.max(...o.values,1e-9);const d=document.createElement('div');d.className='hb';d.innerHTML=o.labels.map((l,i)=>`<div class="hbr"><span class="hbl">${esc(l)}</span><span class="hbt"><span class="hbf" style="width:${(Math.max(0,o.values[i])/mx*100).toFixed(1)}%;background:${(o.colors&&o.colors[i])||'var(--c1)'}"></span></span><span class="hbv">${(o.fmt||(x=>x))(o.values[i])}</span></div>`).join('');el.appendChild(d)}
function donut(el,o){el.innerHTML='';const tot=o.values.reduce((a,b)=>a+b,0)||1,R=54,r=34,C=60;let a0=-Math.PI/2;const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 120 120');svg.setAttribute('width',120);svg.setAttribute('height',120);
 o.values.forEach((v,i)=>{const a1=a0+v/tot*Math.PI*2-.0001,lg=a1-a0>Math.PI?1:0,p=(R_,a)=>[C+R_*Math.cos(a),C+R_*Math.sin(a)];const[x0,y0]=p(R,a0),[x1,y1]=p(R,a1),[x2,y2]=p(r,a1),[x3,y3]=p(r,a0);
  const pa=document.createElementNS(NS,'path');pa.setAttribute('d',`M${x0} ${y0}A${R} ${R} 0 ${lg} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${lg} 0 ${x3} ${y3}Z`);pa.setAttribute('style','fill:'+PAL[i%6]);pa.addEventListener('mousemove',e=>showTip(e,`<b>${esc(o.labels[i])}</b> ${(o.fmt||(x=>x))(v)} (${(v/tot*100).toFixed(0)}%)`));pa.addEventListener('mouseleave',hideTip);svg.appendChild(pa);a0=a1});
 const w=document.createElement('div');w.className='donut';w.appendChild(svg);const l=document.createElement('div');l.className='legend col';l.innerHTML=o.labels.map((t,i)=>`<span><i style="background:${PAL[i%6]}"></i>${esc(t)} <b>${(o.fmt||(x=>x))(o.values[i])}</b></span>`).join('');w.appendChild(l);el.appendChild(w)}
g.LMC={line,bar,hbar,donut};
})(window);
