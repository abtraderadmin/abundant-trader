const fs=require('fs'),{JSDOM}=require('jsdom');
const w=new JSDOM(fs.readFileSync('index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'}).window;
w.addEventListener('error',()=>{});
setTimeout(()=>{
const d=w.document;
const tabs=[...d.querySelectorAll('.tab,[data-screen],nav button')]
  .map(e=>e.textContent.trim()).filter(Boolean);
console.log('TOP-LEVEL TABS ('+tabs.length+'):', tabs.join(' | '));
const screens=[...d.querySelectorAll('[id^="screen-"]')];
console.log('\nSCREEN                 CARDS  H2/H3  INPUTS  BUTTONS  CHARS');
screens.forEach(s=>{
  const cards=s.querySelectorAll('.card,.form-card,.panel,.form-hd').length;
  const heads=s.querySelectorAll('h2,h3,.form-title,.sec-title').length;
  const inputs=s.querySelectorAll('input,select,textarea').length;
  const btns=s.querySelectorAll('button').length;
  const chars=s.innerHTML.length;
  console.log(s.id.replace('screen-','').padEnd(22)+
    String(cards).padEnd(7)+String(heads).padEnd(7)+String(inputs).padEnd(8)+
    String(btns).padEnd(9)+chars);
});
const st=d.getElementById('screen-stock');
if(st){
  console.log('\nSTOCK SCREEN — top-level blocks:');
  [...st.children].forEach((c,i)=>{
    const title=(c.querySelector('.form-title,h2,h3,.sec-title')||{}).textContent;
    console.log('  '+String(i+1).padStart(2)+'. '+(c.className||c.tagName).toString().slice(0,34).padEnd(36)
      +(title?title.trim().slice(0,52):'(no heading)'));
  });
}
process.exit(0);},2500);
