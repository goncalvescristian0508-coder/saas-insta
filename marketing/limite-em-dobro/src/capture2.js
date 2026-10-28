const {chromium}=require('playwright-core');
const fs=require('fs');const path=require('path');
const APP=p=>'file://'+path.resolve('app/'+p);
const FD=path.resolve('node_modules/@fontsource/nunito/files');
const css=[400,600,700,800].map(w=>`@font-face{font-family:'Nunito';font-style:normal;font-weight:${w};src:url('file://${FD}/nunito-latin-${w}-normal.woff2') format('woff2');}`).join('\n')+`\n*{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}`;
const meta=fs.existsSync('shots/meta.json')?JSON.parse(fs.readFileSync('shots/meta.json')):{};
(async()=>{
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--font-render-hinting=none']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await ctx.newPage();
  async function open(file,h){await page.goto(APP(file)+(h?'#'+h:''));await page.reload();await page.addStyleTag({content:css});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);}
  async function shot(name,full=false){await page.waitForTimeout(250);await page.screenshot({path:`shots/${name}.png`,fullPage:full});const h=await page.evaluate(()=>document.documentElement.scrollHeight);meta[name]={full,pageHeight:h};console.log('shot',name,h);}
  async function box(name,sel){const el=page.locator(sel).first();const b=await el.boundingBox();const sy=await page.evaluate(()=>window.scrollY);meta[name]={x:b.x,y:b.y+sy,w:b.width,h:b.height};console.log('box',name,JSON.stringify(meta[name]));}
  const txt=async()=>(await page.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ');
  // STATE A
  await open('stateA.html','card');await shot('cardA-0');await shot('cardA-0-full',true);await box('cardA-activate','button:has-text("Ativar meu limite")');
  await open('stateA.html','garantia');await shot('garA-0');await shot('garA-0-full',true);
  await box('garA-500','button:has-text("R$ 500,00")');
  await page.locator('button:has-text("R$ 500,00")').first().click();await page.waitForTimeout(300);
  console.log('HDR',(await txt()).match(/Seu limite será \| (R\$ [0-9.,]+)/)?.[1]);
  await shot('garA-1');await shot('garA-1-full',true);await box('garA-btn','button:has-text("via Pix")');
  await page.locator('button:has-text("via Pix")').click();await page.waitForTimeout(1500);
  console.log('AFTER PIX hash',await page.evaluate(()=>location.hash),(await txt()).slice(0,400));
  await shot('cardA-1');await shot('cardA-1-full',true);
  // STATE B
  await open('stateB.html','card');await shot('cardB');await shot('cardB-full',true);await box('cardB-dia','text=/Dia \\d de 7/');
  console.log('B',(await txt()).match(/Caixinha Garantia \|.{0,160}/)?.[0]);
  // STATE C
  await open('stateC.html','card');await shot('cardC');await shot('cardC-full',true);await box('cardC-dia','text=/Dia \\d de 7/').catch(e=>console.log('no dia pill'));
  console.log('C',(await txt()).match(/Caixinha Garantia \|.{0,200}/)?.[0]);
  await open('stateC.html','');await shot('homeC');
  fs.writeFileSync('shots/meta.json',JSON.stringify(meta,null,1));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
