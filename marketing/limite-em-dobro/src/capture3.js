const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const APP=p=>'file://'+path.resolve('app/'+p);
const FD=path.resolve('node_modules/@fontsource/nunito/files');
const css=[400,600,700,800].map(w=>`@font-face{font-family:'Nunito';font-style:normal;font-weight:${w};src:url('file://${FD}/nunito-latin-${w}-normal.woff2') format('woff2');}`).join('\n')+`\n*{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}`;
const meta=JSON.parse(fs.readFileSync('shots/meta.json'));
(async()=>{
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--font-render-hinting=none']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await ctx.newPage();
  async function open(file,h){await page.goto(APP(file)+(h?'#'+h:''));await page.reload();await page.addStyleTag({content:css});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);}
  async function shot(name,full=false){await page.waitForTimeout(250);await page.screenshot({path:`shots/${name}.png`,fullPage:full});const h=await page.evaluate(()=>document.documentElement.scrollHeight);meta[name]={full,pageHeight:h};console.log('shot',name,h);}
  const txt=async()=>(await page.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ').slice(0,300);
  for(const r of ['documento','selfie','endereco','conta-criada']){await open('stateA.html',r);await shot(r);console.log(r,':',await txt());}
  // bounding boxes of the checklist items on conta-criada
  await open('stateA.html','conta-criada');
  const items=await page.evaluate(()=>[...document.querySelectorAll('li,div')].filter(e=>/Análise do documento/.test(e.innerText)&&e.innerText.length<60).map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}}));
  console.log('analise item',JSON.stringify(items.slice(-1)));meta['analise-item']=items.slice(-1)[0];
  fs.writeFileSync('shots/meta.json',JSON.stringify(meta,null,1));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
