// 23502: "null value in column journal violates not-null constraint".
//
// PostgREST unions the column set across a batch. A live row carries every
// column; a tombstone carries almost none. Send both in one upsert and the
// tombstone is given an explicit null for each column it omitted, which
// overrides the column default and fails the WHOLE batch -- so one deleted
// row stops every new row from syncing.
//
// Every NOT NULL column without a client-supplied value must therefore be
// present on the tombstone too.
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../index.html','utf8');
let fail=0;
const t=(m,fn)=>{try{fn();console.log('  ok   '+m);}catch(e){fail++;console.log('  FAIL '+m+'\n       '+e.message);}};

// table -> NOT NULL jsonb columns the client is responsible for
const NOT_NULL={trades:['journal','data'], holdings:['data'], transactions:['data'],
                holding_snapshots:['summary'], opportunities:['data'],
                archer_signals:['data'], class_sessions:['data'], class_analysis:['data']};

console.log('\nthe trades tombstone — the one that broke');
const inline=src.slice(src.indexOf('async function atPushTrades'),
                       src.indexOf('async function atPushTrades')+2600);
t('it is built inline, so atPushRows cannot cover it',()=>
  assert(/changed\.push\(\{id:id,user_id:atUser\.id,deleted:true/.test(inline),
    'the inline tombstone has moved — re-point this test'));
NOT_NULL.trades.forEach(col=>
  t('carries '+col,()=>{
    const m=inline.match(/changed\.push\(\{[\s\S]{0,320}?\}\);/);
    assert(m,'tombstone not found');
    assert(new RegExp('\\b'+col+':').test(m[0]),
      col+' is missing — a batch with one deletion will fail with 23502');
  }));
t('it is still a tombstone, not a live row',()=>{
  const m=inline.match(/changed\.push\(\{[\s\S]{0,320}?\}\);/);
  assert(/deleted:true/.test(m[0]),'lost deleted:true');
  assert(/journal:\{\}/.test(m[0])&&/data:\{\}/.test(m[0]),
    'the placeholders must be empty objects, not real content');
});

console.log('\nevery other mirror goes through atPushRows(tombstoneExtra)');
t('atPushRows merges the extra into its tombstone',()=>{
  const f=src.slice(src.indexOf('async function atPushRows'),
                    src.indexOf('async function atPushRows')+1400);
  assert(/tombstoneExtra\|\|\{\}/.test(f),'tombstoneExtra is not merged in');
});
[['holdings','{data:{}}'],['holding_snapshots','{summary:{}}'],
 ['transactions','{data:{}}']].forEach(([tb,extra])=>
  t(tb+' passes '+extra,()=>
    assert(src.includes("'"+tb+"'")&&src.includes(extra),
      tb+' does not supply its NOT NULL placeholder')));

console.log('\nno mirror omits a NOT NULL column from its tombstone');
t('every atPushRows call for a table with NOT NULL jsonb passes an extra',()=>{
  const re=/atPushRows\('([a-z_]+)','[^']+',\s*[A-Za-z0-9_]+\s*(,\s*\{[^)]*\})?\)/g;
  let m;
  while((m=re.exec(src))){
    const table=m[1], extra=m[2]||'';
    const need=NOT_NULL[table]||[];
    need.forEach(col=>assert(extra.includes(col+':'),
      table+' tombstone omits '+col+' — one deletion would block the table'));
  }
});

console.log(fail?'\n'+fail+' failure(s)\n':'\nall checks passed\n');
process.exit(fail?1:0);
