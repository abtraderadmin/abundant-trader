const fs=require('fs'),{JSDOM}=require('jsdom');
const w=new JSDOM(fs.readFileSync('index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'}).window;
w.addEventListener('error',()=>{});
setTimeout(()=>{
const d=w.document, st=d.getElementById('screen-stock');
const b3=st.children[2];
console.log('block 3 id/class:', b3.id||'(no id)', '/', b3.className||'(no class)');
console.log('children:');
[...b3.children].forEach((c,i)=>{
  const h=(c.querySelector('.form-title,h2,h3,.sec-title')||{}).textContent;
  console.log('  '+(i+1)+'. id='+(c.id||'—').padEnd(24)+' class='+String(c.className||'').slice(0,26).padEnd(28)
    +String(c.innerHTML.length).padStart(7)+'  '+(h?h.trim().slice(0,40):''));
});
console.log('\nall ids on the stock screen that renderers target:');
[...st.querySelectorAll('[id]')].slice(0,30).forEach(e=>
  console.log('  #'+e.id+'  ('+e.innerHTML.length+' chars)'));
process.exit(0);},2500);
