const fs=require('fs'),{JSDOM}=require('jsdom');
const d=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=d.window; w.addEventListener('error',()=>{});
w.localStorage.setItem('at_v2',JSON.stringify({settings:{cashAccounts:['C1']},trades:[],
  discoveries:[{ticker:'AAA',entry:10,stop:9,target:13,source:'acorn_wealth',status:'watch'}],
  importQueue:[]}));
w.loadState(); w.renderAll();
setTimeout(()=>{
  const walk=(el,depth,path)=>{
    [...el.children].forEach(c=>{
      const len=c.innerHTML.length;
      if(len<40)return;
      const h=c.querySelector('.form-title,.section-title,.cfg-hd,h2,h3,summary,.form-hd');
      const lbl=h?h.textContent.trim().replace(/\s+/g,' ').slice(0,52):'';
      console.log('  '.repeat(depth)+'· '+(c.id||c.className||c.tagName).slice(0,34).padEnd(34)
        +String(len).padStart(7)+'  '+lbl);
      if(depth<2)walk(c,depth+1,path);
    });
  };
  for(const pane of ['review','add']){
    const p=w.document.querySelector('.subpane[data-pane="'+pane+'"][data-group="ore"]');
    console.log('\n=== ore / '+pane+'  ('+p.innerHTML.length+') ===');
    walk(p,0,'');
  }
  const wl=w.document.getElementById('screen-watchlist');
  console.log('\n=== watchlist ('+wl.innerHTML.length+') ===');
  walk(wl,0,'');
  process.exit(0);
},60);
