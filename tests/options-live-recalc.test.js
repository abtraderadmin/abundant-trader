// Runs the real recalcO() in a DOM against the rows of the Access "Type" table.
// Nothing here reimplements a formula: the page is loaded, the form is filled,
// recalcO() is called, and the readouts are compared to what Access produced.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');

const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window;
// The app boots against localStorage/network; failures there are irrelevant here.
w.addEventListener('error',()=>{});

const set=(id,v)=>{const e=w.document.getElementById(id); if(!e)throw new Error('missing #'+id); e.value=(v==null?'':String(v));};
const read=id=>{const e=w.document.getElementById(id); return e?e.textContent.trim():null;};
const money=t=>t&&t.startsWith('$')?parseFloat(t.slice(1).replace(/,/g,'')):null;

function plan({type,are,going,stockPrice,avgDay}){
  w.setOptType(type);   // the app's own toggle; state is block-scoped
  set('o-ticker','TEST');            // no levels on file -> ATR readout is '—'
  set('o-price-now',are);            // [Where you are]
  set('o-stock-price',stockPrice);   // [Stock Price] -- Access keeps it separate
  set('o-price-target',going);       // [Where you are going]
  set('o-avg-day',avgDay);
  set('o-expiry','');
  w.recalcO();
  const tam=read('oc-tam');
  const m=tam&&tam!=='—'?tam.match(/^([\d.]+) · ([\d.]+)w$/):null;
  return {
    points: money(read('oc-pts')),
    pointsText: read('oc-pts'),
    strike: money(read('oc-strike-calc')),
    tam: m?parseFloat(m[1]):null,
    weeks: m?parseFloat(m[2]):null
  };
}

let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

console.log('\npage boots and the options calc is reachable');
t('recalcO exists',()=>assert.strictEqual(typeof w.recalcO,'function'));
t('setOptType is reachable',()=>assert.strictEqual(typeof w.setOptType,'function'));
t('the readouts exist',()=>['oc-pts','oc-strike-calc','oc-tam'].forEach(id=>
  assert(w.document.getElementById(id),'missing #'+id)));

// ---------------------------------------------------------------------------
// Access "Type" table rows that carry a Stock Price, so Access itself computed
// a Strike Price. These are the rows where Access can be checked directly.
// are / going / stockPrice / avgDay -> Access Points, Strike, TotalAvgMove
// ---------------------------------------------------------------------------
console.log('\nrows read straight off the Access Type table');
// are / going / Stock Price / Avg Moving Day -> the Points, Strike Price,
// Total Avg Move and Contract in Weeks that Access itself computed.
[
  {n:'F    put  350->305  SP 344', type:'PUT', are:350,going:305,stockPrice:344,avgDay:6, pts:22.5,strike:321.50,tam:8,   weeks:1.6},
  {n:'PGR  call  96->106  SP 97',  type:'CALL',are:96, going:106,stockPrice:97, avgDay:28,pts:5,   strike:102.00,tam:19,  weeks:3.8},
  {n:'QQQ  call 171->173  SP 171', type:'CALL',are:171,going:173,stockPrice:171,avgDay:2, pts:1,   strike:172.00,tam:6,   weeks:1.2},
  {n:'AAPL call 166->168  SP 166', type:'CALL',are:166,going:168,stockPrice:166,avgDay:5, pts:1,   strike:167.00,tam:7.5, weeks:1.5},
  {n:'tqqq call  52->60   SP 53',  type:'CALL',are:52, going:60, stockPrice:53, avgDay:5, pts:4,   strike:57.00, tam:7.5, weeks:1.5},
  {n:'AAPL put  170->168  SP 170', type:'PUT', are:170,going:168,stockPrice:170,avgDay:4, pts:1,   strike:169.00,tam:7,   weeks:1.4},
  {n:'     call  39->42   SP 39',  type:'CALL',are:39, going:42, stockPrice:39, avgDay:22,pts:1.5, strike:40.50, tam:16,  weeks:3.2},
  {n:'     call  13->16   SP 14',  type:'CALL',are:13, going:16, stockPrice:14, avgDay:30,pts:1.5, strike:15.50, tam:35,  weeks:7},
].forEach(r=>{
  const g=plan(r);
  t(r.n+'  Points '+r.pts,          ()=>assert.strictEqual(g.points,r.pts));
  t(r.n+'  Strike $'+r.strike.toFixed(2),()=>assert.strictEqual(g.strike,r.strike));
  t(r.n+'  TotAvgMove '+r.tam+' -> '+r.weeks+'w',()=>{
    assert.strictEqual(g.tam,r.tam); assert.strictEqual(g.weeks,r.weeks);
  });
});

console.log('\nStock Price is its own input, as in Access');
t('tqqq: Points off the levels, strike off the stock price',()=>{
  const g=plan({type:'CALL',are:52,going:60,stockPrice:53,avgDay:5});
  assert.strictEqual(g.points,4,   'Points must use 52->60, not the $53 price');
  assert.strictEqual(g.strike,57,  'strike must use the $53 price, not the $52 level');
});
t('blank Stock Price falls back to Where You Are',()=>{
  const a=plan({type:'CALL',are:100,going:120,stockPrice:'',  avgDay:4});
  const b=plan({type:'CALL',are:100,going:120,stockPrice:100, avgDay:4});
  assert.deepStrictEqual(a,b);
});

console.log('\nthe $15.50 strike is what makes 30 -> 35, not a special case');
t('same Avg Moving Day, strike over $20, gives 20 not 35',()=>{
  const low =plan({type:'CALL',are:13, going:16, stockPrice:14, avgDay:30});
  const high=plan({type:'CALL',are:130,going:160,stockPrice:140,avgDay:30});
  assert.strictEqual(low.strike,15.50); assert.strictEqual(low.tam,35);
  assert.strictEqual(high.strike,155);  assert.strictEqual(high.tam,20);
});

console.log('\nthe sub-$20 put the Access $20 gate got backwards');
// Access: IIf([StockType]="Put" And [Stock Price]>20, (are-going)/2, (going-are)/2)
// A put at $8 fails the >20 test, so Access returns (going-are)/2 and the
// strike lands the wrong side of price. The app must not reproduce that.
t('HOOD-style put 15->8 @8 gives +3.5, not -3.5',()=>{
  const g=plan({type:'PUT',are:15,going:8,stockPrice:8,avgDay:1});
  assert.strictEqual(g.points,3.5,'Points came out '+g.points);
});
t('and its strike sits below the stock price, as a put should',()=>{
  const g=plan({type:'PUT',are:15,going:8,stockPrice:8,avgDay:1});
  assert.strictEqual(g.strike,4.50);
  assert(g.strike<8,'strike $'+g.strike+' is not below the $8 underlying');
});
t('a $19 put and a $21 put behave the same way',()=>{
  const a=plan({type:'PUT',are:25,going:19,stockPrice:19,avgDay:2});
  const b=plan({type:'PUT',are:27,going:21,stockPrice:21,avgDay:2});
  assert.strictEqual(a.points,3); assert.strictEqual(b.points,3);
  assert.strictEqual(a.strike,16); assert.strictEqual(b.strike,18);
});

console.log('\na target on the wrong side is caught, not absolute-valued');
t('call with target below price is flagged',()=>{
  const g=plan({type:'CALL',are:99,going:98,stockPrice:99,avgDay:1});
  assert.strictEqual(g.pointsText,'check direction');
  assert.strictEqual(g.strike,null);
});
t('put with target above price is flagged',()=>{
  const g=plan({type:'PUT',are:305,going:350,stockPrice:305,avgDay:16});
  assert.strictEqual(g.pointsText,'check direction');
});

console.log('\nContract in Weeks is Total Avg Move / 5');
[[1,5.5,1.1],[16,13,2.6],[28,19,3.8],[4,7,1.4]].forEach(([d,tam,wk])=>
  t('AvgMovingDay '+d+' → '+tam+' → '+wk+'w',()=>{
    const g=plan({type:'CALL',are:100,going:120,stockPrice:100,avgDay:d});
    assert.strictEqual(g.tam,tam); assert.strictEqual(g.weeks,wk);
  }));

console.log('\nblank Avg Moving Day produces nothing rather than 5');
t('empty field leaves the readout blank',()=>{
  const g=plan({type:'CALL',are:100,going:120,stockPrice:100,avgDay:''});
  assert.strictEqual(g.tam,null);
  assert.strictEqual(g.points,10);   // Points still works without it
});

console.log('\nthe planning level is rounded to a strike you can actually buy');
const strikeHint=()=>{const e=w.document.getElementById('o-strike-real');
  return e.hidden?null:parseFloat(e.dataset.v);};
[
  // underlying, are, going -> exact planning level, nearest listed strike
  {n:'$344 underlying uses $5 strikes', type:'PUT', are:350,going:305,stockPrice:344,exact:321.50,real:320},
  {n:'$97 underlying uses $1 strikes',  type:'CALL',are:96, going:106,stockPrice:97, exact:102.00,real:102},
  {n:'$14 underlying uses $0.50 strikes',type:'CALL',are:13,going:16, stockPrice:14, exact:15.50, real:15.5},
  {n:'$39 underlying rounds 40.50 to 41',type:'CALL',are:39,going:42, stockPrice:39, exact:40.50, real:41},
].forEach(r=>t(r.n,()=>{
  const g=plan({...r,avgDay:5});
  assert.strictEqual(g.strike,r.exact,'planning level moved');
  assert.strictEqual(strikeHint(),r.real,'wrong listed strike');
}));
t('the exact level is never overwritten by the rounding',()=>{
  const g=plan({type:'PUT',are:350,going:305,stockPrice:344,avgDay:6});
  assert.strictEqual(g.strike,321.50);
  assert.strictEqual(w.document.getElementById('o-strike-plan').value,'');
});
t('clicking fills Planned Strike, then the prompt goes away',()=>{
  plan({type:'CALL',are:39,going:42,stockPrice:39,avgDay:5});
  w.oUseStrikeReal();
  assert.strictEqual(w.document.getElementById('o-strike-plan').value,'41');
  assert.strictEqual(w.document.getElementById('o-strike-real').hidden,true);
});

console.log('\nreversed levels can be swapped, not silently corrected');
t('the swap prompt appears only when the direction is wrong',()=>{
  plan({type:'CALL',are:99,going:98,stockPrice:99,avgDay:1});
  assert.strictEqual(w.document.getElementById('o-swap-levels').hidden,false);
  plan({type:'CALL',are:98,going:99,stockPrice:98,avgDay:1});
  assert.strictEqual(w.document.getElementById('o-swap-levels').hidden,true);
});
t('swapping fixes a backwards put without touching Stock Price',()=>{
  plan({type:'PUT',are:8,going:15,stockPrice:8,avgDay:1});   // HOOD as entered
  assert.strictEqual(read('oc-pts'),'check direction');
  w.oSwapLevels();
  assert.strictEqual(money(read('oc-pts')),3.5);
  assert.strictEqual(money(read('oc-strike-calc')),4.50);
  assert.strictEqual(w.document.getElementById('o-stock-price').value,'8');
});

console.log('\nAvg Moving Day is suggested, never written on its own');
t('no ATR on file means no suggestion and no value',()=>{
  plan({type:'CALL',are:100,going:120,stockPrice:100,avgDay:''});
  assert.strictEqual(w.document.getElementById('o-avg-day-hint').hidden,true);
  assert.strictEqual(w.document.getElementById('o-avg-day').value,'');
});
t('the field stays empty until the suggestion is clicked',()=>{
  const h=w.document.getElementById('o-avg-day-hint');
  h.hidden=false; h.dataset.v='3';
  assert.strictEqual(w.document.getElementById('o-avg-day').value,'');
  w.oUseAvgDayHint();
  assert.strictEqual(w.document.getElementById('o-avg-day').value,'3');
});

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
dom.window.close();
process.exit(fail?1:0);
