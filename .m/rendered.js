const fs=require('fs'),{JSDOM}=require('jsdom');
const w=new JSDOM(fs.readFileSync('index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'}).window;
w.addEventListener('error',()=>{});
setTimeout(()=>{
const pos=(sym,q,p)=>({symbol:sym,qty:q,price:p,value:q*p,totalCost:q*p*0.8,
  totalGain:q*p*0.2,totalGainPct:20,daysGain:1,changePct:0.5});
w.localStorage.setItem('at_v2',JSON.stringify({
  settings:{cashAccounts:['C1','C2','C3'],paperAccounts:['P1','P2'],
    evalAccounts:['E1','E2','E3','E4','E5','E6','','','',''],paAccounts:['PA1','PA2','','',''],
    stockOptionsAccountValue:40000,tradeRiskPct:2,maxLossPerTrade:200,capitalCeiling:1500,minRR:1.5},
  trades:[],discoveries:[],
  stockHoldings:{C1:{acctName:'C1',accountType:'cash',cash:1000,ts:'x',
    positions:Array.from({length:23},(_,i)=>pos('SYM'+i,10,100)),summary:{netValue:5000}}}}));
w.loadState();
try{w.renderAll();}catch(e){console.log('renderAll threw:',e.message);}
const d=w.document;
console.log('SCREEN      RENDERED CHARS   TOP-LEVEL BLOCKS');
[...d.querySelectorAll('[id^="screen-"]')].forEach(s=>{
  console.log(s.id.replace('screen-','').padEnd(12)+
    String(s.innerHTML.length).padEnd(17)+s.children.length);
});
const st=d.getElementById('screen-stock');
console.log('\nSTOCK, rendered, block by block:');
[...st.children].forEach((c,i)=>{
  const h=(c.querySelector('.form-title,h2,h3,.sec-title')||{}).textContent;
  console.log('  '+String(i+1).padStart(2)+'. '+String(c.className||c.tagName).slice(0,30).padEnd(32)
    +String(c.innerHTML.length).padStart(7)+'  '+(h?h.trim().slice(0,40):''));
});
process.exit(0);},2500);
