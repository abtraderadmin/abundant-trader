const fs=require('fs'),{JSDOM}=require('jsdom');
const w=new JSDOM(fs.readFileSync('index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'}).window;
w.addEventListener('error',()=>{});
setTimeout(()=>{
const pos=(s,q,p)=>({symbol:s,qty:q,price:p,value:q*p,totalCost:q*p*0.8,totalGain:q*p*0.2,
  totalGainPct:20,daysGain:1,changePct:0.5});
w.localStorage.setItem('at_v2',JSON.stringify({settings:{cashAccounts:['C1']},trades:[],
  stockHoldings:{C1:{acctName:'C1',accountType:'cash',cash:1000,ts:'x',
    positions:Array.from({length:23},(_,i)=>pos('SYM'+i,10,100)),summary:{netValue:5000}}}}));
w.loadState(); w.renderAll();
const st=w.document.getElementById('screen-stock'), b3=st.children[2];
console.log('block 3: id='+(b3.id||'(none)')+' class='+(b3.className||'(none)')+
  ' chars='+b3.innerHTML.length);
[...b3.children].forEach((c,i)=>console.log('   child '+(i+1)+': id='+(c.id||'—')+
  ' class='+String(c.className||'').slice(0,30)+' chars='+c.innerHTML.length));
console.log('\nstockPortfolioPanel chars:',
  w.document.getElementById('stockPortfolioPanel').innerHTML.length);
process.exit(0);},2500);
