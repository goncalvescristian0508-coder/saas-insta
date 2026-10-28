const {chromium}=require('playwright-core');
const fs=require('fs');const path=require('path');
const SRC='file:///root/.claude/projects/-home-user-saas-insta/24f1def4-2234-5ee2-8bb4-229d73e1748d/tool-results/artifact-5773207d-1793230097-6264.html';
const FD=path.resolve('node_modules/@fontsource/nunito/files');
const css=[400,600,700,800].map(w=>`@font-face{font-family:'Nunito';font-style:normal;font-weight:${w};src:url('file://${FD}/nunito-latin-${w}-normal.woff2') format('woff2');}`).join('\n')+`\n*{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}`;
const meta={};
(async()=>{
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox','--font-render-hinting=none']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await ctx.newPage();
  async function open(h){await page.goto(SRC+(h?'#'+h:''));await page.reload();await page.addStyleTag({content:css});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);}
  async function shot(name,full=false){await page.waitForTimeout(250);await page.screenshot({path:`shots/${name}.png`,fullPage:full});const h=await page.evaluate(()=>document.documentElement.scrollHeight);meta[name]={full,pageHeight:h};console.log('shot',name,h);}
  async function box(name,sel,nth=0){const el=page.locator(sel).nth(nth);const b=await el.boundingBox();const sy=await page.evaluate(()=>window.scrollY);meta[name]={x:b.x,y:b.y+sy,w:b.width,h:b.height};console.log('box',name,meta[name]);}
  // HOME
  await open('');await shot('home');await shot('home-full',true);
  // CADASTRO
  await open('cadastro');await shot('cad-0');
  await box('cad-name','input',0);
  const inputs=page.locator('input');
  await inputs.nth(0).fill('Ana Souza');await shot('cad-1');
  await inputs.nth(1).fill('123.456.789-09');await inputs.nth(2).fill('ana.souza@email.com');await inputs.nth(3).fill('(11) 99999-0000');await inputs.nth(4).fill('maiscard7');
  await page.locator('input[type=checkbox]').check().catch(()=>{});
  await shot('cad-2');
  await box('cad-continue','button:has-text("Continuar")');
  await page.locator('button:has-text("Continuar")').click();await page.waitForTimeout(600);await shot('cad-3');
  fs.writeFileSync('shots/meta.json',JSON.stringify(meta,null,1));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
