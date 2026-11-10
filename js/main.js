(function(){
try{UI.init(LMEngine.decode(window.LM_DATA));
UI.shell();window.addEventListener('hashchange',UI.route);UI.route();
let rt,lw=innerWidth;window.addEventListener('resize',()=>{if(innerWidth===lw)return;lw=innerWidth;clearTimeout(rt);rt=setTimeout(()=>UI.render(true),250)});
}catch(e){console.error(e);document.getElementById('root').innerHTML='<div style="padding:24px;font-family:sans-serif">LODGEMATE AI could not start: '+e.message+'</div>'}
})();
