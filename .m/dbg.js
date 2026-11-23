const fs=require('fs'),{JSDOM}=require('jsdom');
const d=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=d.window; w.addEventListener('error',e=>console.log('ERR',e.message));
w.localStorage.setItem('at_v2',JSON.stringify({settings:{cashAccounts:['C1']},trades:[],discoveries:[{ticker:'A'},{ticker:'B'}],importQueue:[{}]}));
w.loadState(); w.renderAll();
console.log('navgroup bars:',w.document.querySelectorAll('.navgroup').length);
w.document.querySelectorAll('.navgroup').forEach(b=>console.log(' ',b.dataset.group,'html len',b.innerHTML.length));
console.log('nav buttons:',w.document.querySelectorAll('[data-nav]').length);
try{w.atPaintNav();console.log('after manual paint:',w.document.querySelectorAll('[data-nav]').length);}catch(e){console.log('atPaintNav threw:',e.message);}
process.exit(0);
