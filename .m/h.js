const fs=require('fs'),{JSDOM}=require('jsdom');
const d=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=d.window; w.addEventListener('error',()=>{});
w.localStorage.setItem('at_v2',JSON.stringify(JSON.parse(process.argv[2])));
w.loadState();
console.log('loadState ok');
w.renderAll();
console.log('renderAll ok');
process.exit(0);
