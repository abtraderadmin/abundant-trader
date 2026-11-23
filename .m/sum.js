const fs=require('fs'),{JSDOM}=require('jsdom');
const d=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=d.window; w.addEventListener('error',()=>{});
w.localStorage.setItem('at_v2',JSON.stringify({settings:{cashAccounts:['C1'],evalAccounts:['E1'],paAccounts:['PA1'],apexAccounts:{E1:{size:50000,dd:2000,firm:'Apex'}}},trades:[],
  stockHoldings:{C1:{acctName:'C1',accountType:'cash',cash:1000,ts:'x',positions:Array.from({length:23},(_,i)=>({symbol:'S'+i,qty:10,price:100,value:1000,totalCost:800,totalGain:200,totalGainPct:25,daysGain:1,changePct:.5})),summary:{netValue:5000}}}}));
w.loadState(); w.renderAll();
setTimeout(()=>{
 const before={stock:44428,futures:54413,cfg:37020,ore:18611};
 console.log('screen      before   on arrival   behind a tab');
 for(const g of ['futures','stock','ore','cfg']){
  const sc=w.document.getElementById('screen-'+g);
  const strip=[...sc.children].filter(c=>!c.classList.contains('subpane')&&!c.classList.contains('subtabs'))
    .reduce((n,c)=>n+c.innerHTML.length,0);
  let shown=strip, hid=0;
  for(const p of sc.querySelectorAll('.subpane')){
    let len=p.innerHTML.length;
    // a shut roll-up is in the DOM but not on screen
    for(const r of p.querySelectorAll('details.rollup:not([open])'))len-=r.querySelector('.ru-body').innerHTML.length;
    if(p.classList.contains('active'))shown+=len; else hid+=p.innerHTML.length;
  }
  console.log(g.padEnd(10)+String(before[g]).padStart(7)+String(shown).padStart(13)
    +String(hid).padStart(15)+'   ('+Math.round(100-shown/before[g]*100)+'% less)');
 }
 process.exit(0);
},60);
