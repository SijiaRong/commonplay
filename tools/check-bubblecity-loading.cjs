// Run against a local static preview or deployed game. No game dependencies needed.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DEMO_URL || 'http://127.0.0.1:8894/';
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}});
    const errors = [], requested = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(request.url()));
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    await page.route('**/models/park/*.glb', async route => { await delayed; await route.continue(); });
    await page.addInitScript(() => {
      window.__loadingValues = [];
      new MutationObserver(() => {
        const value = document.querySelector('#loading-percent')?.value;
        if (value && window.__loadingValues.at(-1) !== value) window.__loadingValues.push(value);
      }).observe(document, {subtree: true, childList: true, characterData: true});
    });
    let releaseCharacter;
    const characterWait = new Promise(resolve => { releaseCharacter = resolve; });
    await page.route('**/teddy-bear-startup.glb', async route => { await characterWait; await route.continue(); });
    await page.goto(base, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => Number.parseInt(document.querySelector('#loading-percent')?.value) > 0);
    const heldProgress = await page.locator('#loading-percent').textContent();
    assert(Number.parseInt(heldProgress) < 100, 'a stalled character download cannot report 100%');
    await page.screenshot({path: '/tmp/commonplay-loading-percent.png'});
    releaseCharacter();
    await page.waitForFunction(() => !document.querySelector('#game-loading') && !document.querySelector('#go').disabled);
    assert.equal(await page.locator('#character-name').textContent(), '缝线小熊');
    assert(!requested.some(url => /01-saturn-landmark|05-glass-dome-pavilion|07-terminal-station/.test(url)), 'future-stage props must not load at startup');
    const values = await page.evaluate(() => window.__loadingValues.map(Number.parseFloat));
    assert(values.length > 2 && values.at(-1) === 100, 'download and first frame must reach 100%');
    assert(values.every((value, index) => !index || value >= values[index-1]), 'progress must never move backwards');
    assert(!requested.some(url => /\/characters\/pip\.jpg/.test(url)), 'hidden picker thumbnails must not load');
    release();
    await page.locator('#choose-character').click();
    await page.locator('[data-character="pip"]').click();
    await page.waitForFunction(() => document.querySelector('#character-name').textContent.includes('PIP') && !document.querySelector('#close-character-picker').disabled);
    await page.locator('#close-character-picker').click();
    await page.locator('#go').click();
    await page.waitForFunction(() => document.querySelector('#launch').hidden);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
    assert.deepEqual(errors, []);
    await page.close();
    const mobile = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    const phone = await mobile.newPage();phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(base);
    await phone.waitForFunction(() => !document.querySelector('#game-loading') && !document.querySelector('#go').disabled);
    await phone.locator('#go').tap();
    await phone.waitForFunction(() => document.querySelector('#launch').hidden);
    await phone.waitForFunction(() => !document.querySelector('.mobile-controls').hidden);
    await phone.screenshot({path: '/tmp/commonplay-mobile-after.png'});
    await phone.goto(base + '?mode=yard');
    await phone.waitForFunction(() => !document.querySelector('#game-loading') && !document.querySelector('#go').disabled);
    await phone.locator('#go').tap();
    await phone.waitForFunction(() => document.querySelector('#launch').hidden);
    assert.deepEqual(errors, []);
    console.log('PASS: slow scenery does not block startup; future stages and hidden portraits stay deferred; character switch, single-player start, mobile controls and classic slide work.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exit(1);});
