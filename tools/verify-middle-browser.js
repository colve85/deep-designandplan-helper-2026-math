const assert=require('assert');
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage();
 await page.goto('http://localhost:8110');
 await page.waitForFunction(()=>typeof BOOT!=='undefined'&&BOOT&&BOOT.units);
 await page.locator('#btnOperation').click();
 assert.equal(await page.locator('#opSubject option').count(),26);
 for(let grade=1;grade<=3;grade++)for(let term=1;term<=2;term++){
 const label='중학교 '+grade+'학년 '+term+'학기';
 await page.locator('#opSubject').selectOption(label);
 assert.equal(await page.locator('[data-om="grade"]').inputValue(),grade+'학년');
 assert.equal(await page.locator('[data-om="semester"]').inputValue(),String(term));
 assert.equal(await page.locator('[data-ot="schedule"][data-ok="unit"]').count(),17);
 }
 await page.evaluate(()=>{const p=opEmpty();p.meta.subject='중학교 수학';p.sections.schedule=[{unit:'교사 기존 통합 계획'}];p._scheduleDraftVersion='2.8.0';opPlans().push(p);opActive=opPlans().length-1;opRender();});
 assert.equal(await page.locator('#opSubject').inputValue(),'중학교 수학');
 await page.locator('#opSubject').selectOption('중학교 1학년 2학기');
 await page.screenshot({path:'../middle-six-terms-v2.9.0.png'});
 console.log('Edge: 6학기 선택·학년/학기 기본값·17주 표·기존 통합 계획 보존 PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
