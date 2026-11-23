const fs=require('fs'),{JSDOM}=require('jsdom');
const w=new JSDOM(fs.readFileSync('index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'}).window;
w.addEventListener('error',()=>{});
setTimeout(()=>{
const pos=(s,q,p)=>({symbol:s,qty:q,price:p,value:q*p,totalCost:q*p*.8,totalGain:q*p*.2,
  totalGainPct:20,daysGain:1,changePct:.5});
w.localStorage.setItem('at_v2',JSON.stringify({settings:{cashAccounts:['C1']},trades:[],
  stockHoldings:{C1:{acctName:'C1',accountType:'cash',cash:1000,ts:'x',
    positions:Array.from({length:23},(_,i)=>pos('SYM'+i,10,100)),summary:{netValue:5000}}}}));
w.loadState(); w.renderAll();
const d=w.document, st=d.getElementById('screen-stock');
const vis=[...st.querySelectorAll('.subpane')].filter(p=>p.classList.contains('active'));
console.log('active pane:', vis.map(p=>p.dataset.pane).join(',')||'(none)');
const shown=vis.reduce((n,p)=>n+p.innerHTML.length,0);
const strip=st.children[0].innerHTML.length+st.children[1].innerHTML.length;
console.log('stock screen total markup :', st.innerHTML.length);
console.log('  visible = strip + pane  :', strip+shown, '(strip '+strip+' + pane '+shown+')');
console.log('  hidden behind the tab   :', st.innerHTML.length-(strip+shown));
console.log('portfolio tab count attr  :',
  d.querySelector('.subtabs[data-group=stock] .subtab[data-tab=portfolio] .st-count').textContent);
// switch and re-measure
w.atSetSubTab('stock','portfolio');
const vis2=[...st.querySelectorAll('.subpane.active')].map(p=>p.dataset.pane);
console.log('after switching           :', vis2.join(','));
process.exit(0);},2500);
