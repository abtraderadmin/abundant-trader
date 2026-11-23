// Where an idea came from, and which rules it answers to.
//
// Two questions that look like one. SOURCE is provenance and grows with every
// subscription added. RULESET is which parameters apply and does NOT grow,
// because the rules follow the instrument rather than the seller: every
// options service answers to the same options rules. SPY is the exception
// and has a system of its own, which is why it is a ruleset.
//
// Keeping them apart means a new subscription is one line and no rule
// changes at all.
//
// All figures invented. This repo is public.
//
//   node tests/source-tagging.test.js

const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window; w.addEventListener('error',()=>{});
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};
const seed=ds=>{w.localStorage.setItem('at_v2',JSON.stringify({settings:{},trades:[],discoveries:ds||[]}));w.loadState();};
const saved=()=>JSON.parse(w.localStorage.getItem('at_v2')).discoveries;

console.log('\nrules follow the instrument, not the seller');
t('every options service lands on the same ruleset',()=>{
  ['options_sub_1','options_sub_2','options_sub_3'].forEach(s=>
    assert.strictEqual(w.atRulesetOf({source:s}),'options',s+' must not need rules of its own'));
});
t('the stock services share the stock ruleset',()=>{
  ['acorn_wealth','motley_fool','class_analysis','analyzer'].forEach(s=>
    assert.strictEqual(w.atRulesetOf({source:s}),'stock'));
});
t('SPY keeps its own system',()=>{
  assert.strictEqual(w.atRulesetOf({source:'spy_system'}),'spy');
});
t('an explicit ruleset on the record overrides its source',()=>{
  // An Acorn name traded as options is a real case, not a mistake.
  assert.strictEqual(w.atRulesetOf({source:'acorn_wealth',ruleset:'options'}),'options');
});
t('a nonsense ruleset is ignored rather than obeyed',()=>{
  assert.strictEqual(w.atRulesetOf({source:'acorn_wealth',ruleset:'banana'}),'stock');
});
t('an unknown source falls back to stock, not to nothing',()=>{
  assert.strictEqual(w.atRulesetOf({source:'some_new_service'}),'stock');
  assert.strictEqual(w.atRulesetOf({}),'stock');
  assert.strictEqual(w.atRulesetOf(null),'stock');
});

console.log('\nolder records get tagged, visibly');
t('untagged entries are tagged as the analyzer, which is what saved them',()=>{
  seed([{id:1,ticker:'ACCO',status:'watch'},{id:2,ticker:'SDS',status:'watch',source:'acorn_wealth'}]);
  assert.strictEqual(w.atBackfillSources(),1,'only the untagged one');
  const d=saved();
  assert.strictEqual(d[0].source,'analyzer');
  assert.strictEqual(d[1].source,'acorn_wealth','an existing tag is never overwritten');
});
t('and marked as assumed, with the date it happened',()=>{
  seed([{id:1,ticker:'ACCO',status:'watch'}]);
  w.atBackfillSources();
  assert.ok(saved()[0].sourceBackfilled,'a guess has to look like a guess');
});
t('running it again changes nothing',()=>{
  seed([{id:1,ticker:'ACCO',status:'watch'}]);
  w.atBackfillSources();
  assert.strictEqual(w.atBackfillSources(),0);
});

console.log('\nthe watchlist slices by source');
t('filtering by source narrows the list, independently of status',()=>{
  seed([{id:1,ticker:'ACCO',status:'watch',source:'analyzer'},
        {id:2,ticker:'SDS',status:'watch',source:'acorn_wealth'},
        {id:3,ticker:'BAC',status:'rejected',source:'acorn_wealth'}]);
  w.setWlFilter('all'); w.setWlSource('acorn_wealth');
  let html=w.document.getElementById('ore-wl-body').innerHTML;
  assert(/SDS/.test(html)&&/BAC/.test(html),'source cuts across status');
  assert(!/ACCO/.test(html));
  w.setWlSource('all');
  html=w.document.getElementById('ore-wl-body').innerHTML;
  assert(/ACCO/.test(html));
});
t('the picker lists only sources actually present, with counts',()=>{
  seed([{id:1,ticker:'ACCO',status:'watch',source:'analyzer'},
        {id:2,ticker:'SDS',status:'watch',source:'acorn_wealth'}]);
  w.setWlSource('all');
  const html=w.document.getElementById('ore-wl-source').innerHTML;
  assert.match(html,/Acorn Wealth \(1\)/);
  assert.match(html,/My analysis \(1\)/);
  assert(!/Motley Fool/.test(html),'an unused service is noise in a filter');
});
t('the row says where it came from',()=>{
  seed([{id:1,ticker:'SDS',status:'watch',source:'acorn_wealth'}]);
  w.setWlSource('all');
  assert.match(w.document.getElementById('ore-wl-body').innerHTML,/Acorn Wealth/);
});
t('a non-stock ruleset is named on the row',()=>{
  seed([{id:1,ticker:'SPY',status:'watch',source:'spy_system'}]);
  w.setWlSource('all');
  assert.match(w.document.getElementById('ore-wl-body').innerHTML,/SPY rules/);
});

console.log(fail?'\n'+fail+' failure(s)':'\nall checks passed');
process.exit(fail?1:0);
