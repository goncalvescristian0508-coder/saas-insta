const {chromium}=require('playwright-core');const path=require('path');const fs=require('fs');
const FPS=30,DUR=parseFloat(process.argv[2]||'32.5'),OUT=process.argv[3]||'frames';const START=parseFloat(process.argv[4]||'0');
(async()=>{fs.mkdirSync(OUT,{recursive:true});
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--font-render-hinting=none','--disable-gpu']});
  const p=await (await b.newContext({viewport:{width:1080,height:1920},deviceScaleFactor:1})).newPage();
  await p.goto('file://'+path.resolve('comp.html'));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
  const N=Math.round(DUR*FPS);const t0=Date.now();
  for(let i=Math.round(START*FPS);i<N;i++){await p.evaluate(t=>seek(t),i/FPS);await p.screenshot({path:path.join(OUT,String(i).padStart(5,'0')+'.png'),type:'png'});if(i%150===0)console.log('frame',i,'/',N,((Date.now()-t0)/1000).toFixed(0)+'s');}
  await b.close();console.log('done',N);})().catch(e=>{console.error(e);process.exit(1)});
