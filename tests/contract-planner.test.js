// Contract Planner, run live. Seeds ATR, fills the form, calls the real
// recalcO(), and reads the panel. Checks the expiry model, moneyness and the
// breakeven gate, mirrored for calls and puts.
const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});

const set=(id,v)=>{const e=w.document.getElementById(id); if(e)e.value=(v==null?'':String(v));};
const txt=id=>{const e=w.document.getElementById(id); return e?e.textContent.trim():null;};
const num=id=>{const t=txt(id); const m=t&&t.match(/-?[\d.]+/); return m?parseFloat(m[0]):null;};

function plan({type,price,target,atr,premium,expiry,strike}){
  // Seed ATR the way an analysis would, through the app's own capture call.
  w.atCaptureLevels({ticker:'TEST',atr14:atr,analysisDate:'2026-11-18'});
  w.setOptType(type);
  set('o-ticker','TEST'); set('o-price-now',price); set('o-stock-price','');
  set('o-price-target',target); set('o-cost',premium); set('o-expiry',expiry||'');
  set('o-strike',strike); set('o-strike-plan',''); set('o-avg-day','');
  w.recalcO();
  return {
    hidden:w.document.getElementById('oPlanner').hidden,
    move:txt('op-move'),
    days:{t:num('op-d-trend'),n:num('op-d-norm'),c:num('op-d-chop')},
    wks:{t:num('op-w-trend'),n:num('op-w-norm'),c:num('op-w-chop')},
    exp:txt('op-exp'), money:txt('op-money'), be:txt('op-be')
  };
}
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

console.log('\nthe panel appears only when it can say something');
t('no ATR on file -> hidden',()=>{
  w.setOptType('CALL');
  set('o-ticker','NOPE'); set('o-price-now',100); set('o-price-target',120); w.recalcO();
  assert.strictEqual(w.document.getElementById('oPlanner').hidden,true);
});
t('wrong-direction target -> hidden',()=>{
  assert.strictEqual(plan({type:'CALL',price:100,target:90,atr:3}).hidden,true);
});
t('priced move with ATR -> shown',()=>{
  assert.strictEqual(plan({type:'CALL',price:166,target:180,atr:3.5}).hidden,false);
});

console.log('\nthe move is stated in ATR units');
t('AAPL $166 -> $180 at ATR 3.50 is 4x ATR',()=>{
  const g=plan({type:'CALL',price:166,target:180,atr:3.5});
  assert(/\$14\.00 move/.test(g.move),g.move);
  assert(/4\.0× ATR/.test(g.move),g.move);
});

console.log('\nexpected days follow N^p, p = 1.3 / 1.6 / 2.0');
const days=(N,p)=>Math.max(1,Math.pow(N,p));
const dte =d=>Math.ceil(1.4*(2*d)+21);
[[4.0,166,180,3.5],[6.67,100,120,3],[0.67,166,168,3]].forEach(([N,pr,tg,atr])=>{
  t('N='+N.toFixed(2)+' days and weeks',()=>{
    const g=plan({type:'CALL',price:pr,target:tg,atr});
    [['t',1.3],['n',1.6],['c',2.0]].forEach(([k,p])=>{
      assert.strictEqual(g.days[k],Math.round(days(N,p)),'days '+k);
      assert.strictEqual(g.wks[k], Math.round(dte(days(N,p))/7),'weeks '+k);
    });
  });
});
t('choppy always buys at least as much time as trending',()=>{
  const g=plan({type:'CALL',price:100,target:120,atr:3});
  assert(g.wks.c>=g.wks.n && g.wks.n>=g.wks.t,JSON.stringify(g.wks));
});
t('even a tiny move still buys the theta buffer',()=>{
  const g=plan({type:'CALL',price:166,target:166.5,atr:5});
  assert(g.wks.t>=3,'buffer missing: '+g.wks.t+'w');
});

console.log('\ncalls and puts mirror exactly');
t('same move either way gives the same timing',()=>{
  const c=plan({type:'CALL',price:166,target:180,atr:3.5});
  const p=plan({type:'PUT', price:166,target:152,atr:3.5});
  assert.deepStrictEqual(c.days,p.days);
  assert.deepStrictEqual(c.wks,p.wks);
});
t('moneyness is measured toward the money, not by sign',()=>{
  const c=plan({type:'CALL',price:166,target:180,atr:3.5});
  const p=plan({type:'PUT', price:166,target:152,atr:3.5});
  assert(/4\.2% out of the money/.test(c.money),c.money);
  assert(/4\.2% out of the money/.test(p.money),p.money);
});
t('a far OTM strike is called out',()=>{
  const g=plan({type:'CALL',price:100,target:140,atr:3});   // strike 120 = 20% OTM
  assert(/20\.0% out of the money/.test(g.money),g.money);
  assert(/break even/.test(g.money),'no warning on a 20% OTM strike');
});

console.log('\nbreakeven is the gate');
t('call: target clears the breakeven',()=>{
  const g=plan({type:'CALL',price:166,target:180,atr:3.5,premium:4,strike:173});
  assert(/\$177\.00/.test(g.be),g.be);          // 173 + 4
  assert(/clears it by \$3\.00/.test(g.be),g.be);
});
t('put: breakeven is below the strike',()=>{
  const g=plan({type:'PUT',price:166,target:152,atr:3.5,premium:4,strike:159});
  assert(/\$155\.00/.test(g.be),g.be);          // 159 - 4
  assert(/clears it by \$3\.00/.test(g.be),g.be);
});
t('a premium that eats the whole move is refused outright',()=>{
  const g=plan({type:'CALL',price:166,target:180,atr:3.5,premium:9,strike:173});
  assert(/cannot win/.test(g.be),g.be);
});
t('the same refusal applies to puts',()=>{
  const g=plan({type:'PUT',price:166,target:152,atr:3.5,premium:9,strike:159});
  assert(/cannot win/.test(g.be),g.be);
});
t('no premium yet -> asks for it rather than guessing',()=>{
  const g=plan({type:'CALL',price:166,target:180,atr:3.5});
  assert(/Add the premium/.test(g.be),g.be);
});

console.log('\nthe chosen expiry is checked against the model');
t('too-near an expiry is flagged',()=>{
  const soon=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
  const g=plan({type:'CALL',price:100,target:120,atr:3,expiry:soon});
  assert(/only 10 days/.test(g.exp),g.exp);
});
t('enough time is confirmed',()=>{
  const far=new Date(Date.now()+200*86400000).toISOString().slice(0,10);
  const g=plan({type:'CALL',price:100,target:120,atr:3,expiry:far});
  assert(/enough/.test(g.exp),g.exp);
});

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
dom.window.close(); process.exit(fail?1:0);
