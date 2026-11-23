const fs=require('fs'),{JSDOM}=require('jsdom');
const d=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=d.window; w.addEventListener('error',()=>{});
w.localStorage.setItem('at_v2',JSON.stringify({settings:{cashAccounts:['C1'],evalAccounts:['E1'],paAccounts:['PA1'],apexAccounts:{E1:{size:50000,dd:2000,firm:'Apex'}}},trades:[],stockHoldings:{}}));
w.loadState(); w.renderAll();
const g=w.document.querySelector('#screen-'+process.argv[2]+' .cfg-grid')||w.document.getElementById('screen-'+process.argv[2]);
console.log('container: '+g.innerHTML.length+'  children: '+g.children.length+'\n');
[...g.children].forEach((c,i)=>{
  const h=c.querySelector('.section-title,h2,h3,summary,label,b,strong');
  console.log(String(i+1).padStart(3)+'. id='+(c.id||'—').padEnd(22)
    +' cls='+(c.className||'—').padEnd(16)
    +String(c.innerHTML.length).padStart(7)+'  '
    +(h?h.textContent.trim().replace(/\s+/g,' ').slice(0,44):''));
});
process.exit(0);
