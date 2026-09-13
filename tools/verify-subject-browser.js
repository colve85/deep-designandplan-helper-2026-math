const assert=require('assert');
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage();
 await page.goto('http://localhost:8107');
 await page.waitForFunction(()=>typeof BOOT!=='undefined'&&BOOT&&BOOT.units);
 await page.evaluate(()=>{
 state.operationPlans=['공통수학2','공통수학1','미적분Ⅰ','미적분Ⅰ'].map(subject=>{const p=opEmpty();p.meta.subject=subject;p.sections.schedule=[{unit:'교사가 작성한 기존 계획'}];p._scheduleDraftVersion='2.8.0';return p;});
 });
 await page.locator('#btnOperation').click();
 const subjects=await page.locator('#opSubject option').allTextContents();
 assert.equal(subjects.length,21);
 assert(subjects.includes('중학교 수학')&&subjects.includes('고급 기하'));
 assert.equal(await page.locator('#opSelect option').count(),4);
 for(const subject of subjects){
 await page.locator('#opSubject').selectOption(subject);
 assert.equal(await page.evaluate(()=>opCurrent().meta.subject),subject);
 assert(await page.locator('[data-ot="schedule"]').count()>0);
 }
 await page.locator('#opSubject').selectOption('공통수학2');
 assert.equal(await page.evaluate(()=>opCurrent().sections.schedule[0].unit),'교사가 작성한 기존 계획');
 await page.screenshot({path:'../subject-selector-v2.8.6.png',fullPage:true});
 console.log('브라우저 검증: 저장 계획 4개와 독립적으로 21개 수학 과목 표시·전환·교사 입력 보존 PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
