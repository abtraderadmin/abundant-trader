const fs=require('fs'),{JSDOM}=require('jsdom');
const d=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=d.window; w.addEventListener('error',()=>{});
w.localStorage.setItem('at_v2',JSON.stringify({settings:{cashAccounts:['C1'],evalAccounts:['E1','','','','','','','',''],paAccounts:['PA1','','','',''],apexAccounts:{E1:{size:50000,dd:2000,firm:'Apex'}}},trades:[],stockHoldings:{C1:{acctName:'C1',accountType:'cash',cash:1000,ts:'x',positions:[],summary:{netValue:1000}}}}));
w.loadState(); w.renderAll();
const id=process.argv[2];
const el=w.document.getElementById('screen-'+id);
console.log(id+' total: '+el.innerHTML.length+'\n');
[...el.children].forEach((c,i)=>{
  const h=c.querySelector('h2,h3,.card-title,summary,label');
  console.log(String(i+1).padStart(3)+'. <'+c.tagName.toLowerCase()+'> id='+(c.id||'—')
    +' class='+(c.className||'—')
    +'  '+String(c.innerHTML.length).padStart(6)
    +'  '+(h?h.textContent.trim().slice(0,46):''));
});
process.exit(0);
