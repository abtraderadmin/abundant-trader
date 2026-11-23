// Every screen has to survive imperfect data.
//
// A single holding missing a percentage field threw inside the renderer and
// took the WHOLE Stock screen down — not one row, the lot. Broker exports
// fill those fields, so it hid behind good data; a hand-added position, a
// partial import, or a row merged back from the tables does not.
//
// The rest of that renderer already guarded every figure it touched. These
// two were simply missed, which is the kind of thing a blank screen is made
// of.
//
// All figures invented. This repo is public.
//
//   node tests/render-resilience.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

function seed(positions,extra){
  w.localStorage.setItem('at_v2',JSON.stringify({
    settings:Object.assign({cashAccounts:['C1'],stockOptionsAccountValue:40000,
      tradeRiskPct:2,maxLossPerTrade:200,capitalCeiling:1500},extra||{}),
    trades:[],
    stockHoldings:{'C1':{acctName:'C1',accountType:'cash',cash:1000,
      ts:'Nov 6 2026 06:41 PM ET',positions:positions,
      summary:{netValue:2000,availableForWithdrawal:1500}}}}));
  w.loadState();
}
const FULL={symbol:'AAPL',qty:10,price:100,value:1000,totalCost:900,totalGain:100,
  totalGainPct:11.1,daysGain:5,changePct:0.5};

console.log('\nthe Stock screen renders whatever it is given');
t('a complete position renders',()=>{
  seed([FULL]);
  w.renderPortfolioHoldings();
  assert.match(w.document.getElementById('stockPortfolioPanel').innerHTML,/AAPL/);
});
t('a position with no percentages does not take the screen down',()=>{
  // The exact shape that threw: qty and price, nothing else.
  seed([{symbol:'AAPL',qty:10,price:100}]);
  w.renderPortfolioHoldings();
  const html=w.document.getElementById('stockPortfolioPanel').innerHTML;
  assert.match(html,/AAPL/,'the row still has to appear');
  assert(!/NaN/.test(html),'and a missing figure reads as 0, never NaN: '+html.slice(0,200));
});
t('one bad position does not hide the good ones beside it',()=>{
  seed([FULL,{symbol:'MSFT',qty:2,price:400}]);
  w.renderPortfolioHoldings();
  const html=w.document.getElementById('stockPortfolioPanel').innerHTML;
  assert.match(html,/AAPL/);
  assert.match(html,/MSFT/,'this is the whole point — no all-or-nothing render');
});
t('navigating to the Stock screen survives it too',()=>{
  seed([{symbol:'AAPL',qty:10,price:100}]);
  w.showScreen('stock');   // threw before: renderPortfolioHoldings is on this path
});
t('an account with no positions at all is fine',()=>{
  seed([]);
  w.renderPortfolioHoldings();
});

console.log('\nerror messages are HTML, not mangled text');
t('no curly quotes where an attribute is meant',()=>{
  // Valid JS inside a template literal, invalid HTML out of it: the browser
  // never parsed style=”…” as an attribute, so the message telling you the
  // API key is wrong rendered broken.
  assert(!/style=[”“]/.test(src),'curly quote used as an attribute delimiter');
  assert(!/(class|id|onclick|href|src)=[”“]/.test(src));
});

console.log('\nno function is declared twice in one script block');
t('atNum and atDate exist once each',()=>{
  const n=(src.match(/^function atNum\(/gm)||[]).length;
  const d=(src.match(/^function atDate\(/gm)||[]).length;
  assert.strictEqual(n,1,'two definitions meant the first was dead code');
  assert.strictEqual(d,1);
});
t('and they still work',()=>{
  assert.strictEqual(w.atNum('12.5'),12.5);
  assert.strictEqual(w.atNum(''),null);
  assert.strictEqual(w.atNum(null),null);
  assert.strictEqual(w.atNum('abc'),null);
  assert.strictEqual(w.atDate('2026-11-21T04:00:00Z'),'2026-11-21');
  assert.strictEqual(w.atDate('not a date'),null);
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
