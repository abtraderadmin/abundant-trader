const fs=require('fs'),{JSDOM}=require('jsdom');
const w=new JSDOM(fs.readFileSync('index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'}).window;
w.addEventListener('error',()=>{});
setTimeout(()=>{
w.localStorage.setItem('at_v2',JSON.stringify({settings:{
  evalAccounts:['E1','E2','E3','E4','E5','E6','','','',''],paAccounts:['PA1','PA2','','',''],
  accountGoals:{E1:3000},apexAccounts:{E1:{size:50000,dd:2000,maxContracts:5,firm:'Black Vault'}}},
  trades:[]}));
w.loadState(); w.renderAll();
const f=w.document.getElementById('screen-futures');
console.log('futures total:',f.innerHTML.length,' blocks:',f.children.length);
[...f.children].forEach((c,i)=>{
  const h=(c.querySelector('.form-title,h2,h3,.section-title')||{}).textContent;
  console.log('  '+String(i+1).padStart(2)+'. id='+String(c.id||'—').padEnd(22)
    +' class='+String(c.className||'').slice(0,22).padEnd(24)
    +String(c.innerHTML.length).padStart(7)+'  '+(h?h.trim().slice(0,38):''));
});
process.exit(0);},2500);
