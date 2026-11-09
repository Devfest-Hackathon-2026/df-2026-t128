// Isolated local demo only: no .env, external API, credentials, or user's browser profile.
// Usage after npm run build: node scripts/browser-smoke.mjs /path/to/node_modules/playwright
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../dist-server/server/app.js';
import { demoProvider } from '../dist-server/server/provider.js';
import { scenarios } from '../dist-server/shared/scenarios.js';
import { characterIds, withCharacter } from '../dist-server/shared/scene-characters.js';

const require = createRequire(import.meta.url);
const { chromium, expect } = require(process.argv[2] ? resolve(process.argv[2]) : 'playwright/test');
// The standalone playwright package also exposes assertions through its /test entry.
const assertions = expect ?? require(resolve(process.argv[2], 'test')).expect;
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {channel: 'chromium'}) });
await mkdir('output/browser-smoke', { recursive: true });
let completed = 0;

async function fixture(viewport, character, run) {
  const app = createApp(demoProvider, { secureCookie: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Repeatable character selection in this test context, never in application code.
  await page.addInitScript(value => { Math.random = () => value; }, (characterIds.indexOf(character) + .5) / 3);
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  try {
    await page.goto(origin);
    await assertions(page.locator('.practice-choice')).toHaveCount(0);
    await page.getByRole('button', { name: '場所を選ぶ', exact: false }).click();
    await assertions(page.locator('.practice-welcome')).toHaveCount(0);
    await run(page, origin);
    assert.deepEqual(errors, []);
    completed++;
  } catch (error) {
    await page.screenshot({ path: 'output/browser-smoke/failure.png', fullPage: true });
    throw error;
  } finally {
    await context.close();
    app.locals.dispose();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

async function assertReplyBefore(page, selector) {
  const line = await page.locator('.bookstore-dialogue').boundingBox();
  const control = await page.locator(selector).first().boundingBox();
  assert.ok(line && control && line.y + line.height <= control.y + 1, 'Read the character before choosing or typing');
}

async function chooseAndStart(page, scene, person) {
  await page.getByRole('button', { name: scene.location, exact: true }).click();
  await assertions(page.locator('.bookstore-dialogue strong').filter({hasText: withCharacter(scene, person).character.split('（')[0]})).toBeVisible();
  await assertReplyBefore(page, '.opening-actions');
  const response = page.waitForResponse(response => response.url().endsWith('/api/sessions') && response.request().method() === 'POST');
  await page.locator(`.opening-actions button[value="${scene.actions[1].id}"]`).click();
  return (await (await response).json()).session;
}

async function checkLayout(page) {
  await assertReplyBefore(page, '.composer');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal page overflow');
  await assertions(page.locator('.bookstore-person[data-visible="true"]')).toHaveCount(1);
  for (const name of ['声をかける', '会話を終えて振り返る', '手助けを断られたので終える']) {
    const control = page.getByRole('button', { name, exact: true });
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, name);
  }
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const scene of scenarios) for (const person of characterIds) {
      await fixture(viewport, person, async page => {
        const started = await chooseAndStart(page, scene, person);
        assert.equal(started.characterId, person);
        await page.getByRole('button',{name:'これまでのやり取り'}).click();
        await assertions(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('button',{name:'閉じる',exact:true}).click();
        await assertions(page.locator('.conversation-mode-note')).toContainText('用意した返事');
        await assertions(page.locator('.scene-image-status')).toBeEmpty();
        await checkLayout(page);
        const before = await page.locator('.bookstore-person[data-visible="true"]').boundingBox();
        await page.getByLabel('返事を入力').fill('何かお手伝いできることはありますか。');
        await page.getByRole('button', { name: '声をかける', exact: true }).click();
        await assertions(page.locator('.history-dialog')).toContainText('1 / 5 往復');
        await assertions(page.locator('.scene-image-status')).toBeEmpty();
        const after = await page.locator('.bookstore-person[data-visible="true"]').boundingBox();
        // Page scrolling is allowed; the image frame dimensions must remain fixed.
        assert.equal(before.width, after.width); assert.equal(before.height, after.height);
        await page.getByRole('button', { name: person === 'sato' ? '手助けを断られたので終える' : '会話を終えて振り返る', exact: true }).click();
        await assertions(page.getByRole('heading', { name: '自分の声かけを振り返る', exact: true })).toBeVisible();
        await assertions(page.getByRole('heading', { name: '声かけを見直すヒント', exact: true })).toBeVisible();
        await page.getByRole('button', { name: '同じ人ともう一度話す', exact: false }).click();
        await assertions(page.locator('.bookstore-dialogue strong').filter({hasText: withCharacter(scene, person).character.split('（')[0]})).toBeVisible();
        assert.equal(await page.locator('.opening-actions button').count(), 3);
        const response = page.waitForResponse(response => response.url().endsWith('/api/sessions') && response.request().method() === 'POST');
        await page.locator(`.opening-actions button[value="${scene.actions[2].id}"]`).click();
        const restarted = (await (await response).json()).session;
        assert.equal(restarted.characterId, person); assert.notEqual(restarted.id, started.id);
        assert.equal(restarted.messages.length, 1); assert.equal(restarted.turnCount, 0);
        if (scene.id === 'bookstore' && person === 'sato') {
          await assertions(page.locator('.scene-image-status')).toBeEmpty();
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `output/browser-smoke/chat-${viewport.width}.png`, fullPage: true });
        }
      });
      console.log(`PASS ${viewport.width}px ${scene.id}/${person}`);
    }
  }
  await fixture({ width: 390, height: 844 }, 'tanaka', async page => {
    let allowImage = false;
    await page.route('**/tanaka-relieved.webp', route => allowImage ? route.continue() : route.abort());
    // Fixture expression sequence tests the display contract, not AI response quality.
    const expressions = ['relieved', 'confused', 'cautious', 'neutral'];
    await page.route('**/messages', async route => {
      const response = await route.fetch();
      const data = await response.json();
      data.session.messages.at(-1).expression = expressions.shift();
      await route.fulfill({ response, json: data });
    });
    const session = await chooseAndStart(page, scenarios[0], 'tanaka');
    await assertions(page.locator('.scene-image-status')).toBeEmpty();
    await page.getByLabel('返事を入力').fill('こんにちは。');
    await page.getByRole('button', { name: '声をかける', exact: true }).click();
    await assertions(page.getByRole('button', { name: '画像を再読み込み', exact: true })).toBeVisible();
    await assertions(page.locator('.bookstore-person[data-visible="true"]')).toHaveAttribute('src', /neutral\.webp$/);
    await page.getByLabel('返事を入力').fill('消えない下書き');
    allowImage = true;
    await page.getByRole('button', { name: '画像を再読み込み', exact: true }).click();
    await assertions(page.locator('.scene-image-status')).toBeEmpty();
    await assertions(page.getByLabel('返事を入力')).toHaveValue('消えない下書き');
    await assertions(page.locator('.bookstore-person[data-visible="true"]')).toHaveAttribute('src', /relieved\.webp$/);
    for (const expression of ['confused', 'cautious', 'neutral']) {
      await page.getByLabel('返事を入力').fill('ご希望を聞かせてください。');
      await page.getByRole('button', { name: '声をかける', exact: true }).click();
      await assertions(page.locator('.bookstore-person[data-visible="true"]')).toHaveAttribute('src', new RegExp(expression + '\\.webp$'));
    }
    await assertions(page.locator('.bookstore-stage')).toHaveAttribute('data-reduced', 'true');
    assert.equal(await page.locator('.bookstore-person[data-visible="true"]').evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    assert.equal(await page.locator('.bookstore-background').evaluate(element => getComputedStyle(element).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const motion = page.getByRole('button', { name: '動きを一時停止', exact: true });
    await assertions(motion).toBeEnabled();
    assert.notEqual(await page.locator('.bookstore-person[data-visible="true"]').evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    await motion.click();
    await assertions(page.getByRole('button', { name: '動きを再生', exact: true })).toBeEnabled();
    assert.equal(await page.locator('.bookstore-background').evaluate(element => getComputedStyle(element).animationName), 'none');
    // Short viewport models limited vertical space, not an actual phone keyboard.
    await page.setViewportSize({ width: 320, height: 430 });
    await checkLayout(page);
    await assertions(page.locator('.history-dialog')).toContainText('4 / 5 往復');
    assert.ok(session.id);
  });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const failure of ['unavailable', 'offline', 'lost-response', 'edited-draft']) {
      await fixture(viewport, 'tanaka', async page => {
        await chooseAndStart(page, scenarios[0], 'tanaka');
        await assertions(page.locator('.scene-image-status')).toBeEmpty();
        const before = await page.locator('.bookstore-dialogue').textContent();
        const requests = [];
        let release;
        const gate = new Promise(resolveGate => { release = resolveGate; });
        await page.route('**/messages', async route => {
          requests.push(route.request().postDataJSON());
          if (requests.length > 1) { await route.continue(); return; }
          await gate;
          if (failure === 'lost-response') {
            const committed = await route.fetch();
            assert.equal(committed.status(), 200);
            assert.equal((await committed.json()).session.turnCount, 1);
            await route.abort('connectionfailed');
          } else if (failure === 'offline') await route.abort('connectionfailed');
          else await route.fulfill({ status: 503, json: { error: 'ただいま混み合っています。少し待ってから再度お試しください。' } });
        });
        const input = page.getByLabel('返事を入力');
        await input.fill('いつものお茶について教えてください。');
        await page.getByRole('button', { name: '声をかける', exact: true }).click();
        try {
          await assertions(page.locator('.composer')).toHaveAttribute('aria-busy', 'true');
          await assertions(input).toBeDisabled();
          await assertions(page.getByRole('button', { name: '会話を終えて振り返る', exact: true })).toBeDisabled();
          await assertions(page.getByRole('button', { name: '手助けを断られたので終える', exact: true })).toBeDisabled();
          // Duplicate form submission cannot issue a second logical send while waiting.
          await page.locator('.composer').evaluate(form => form.requestSubmit());
          await assertions(page.locator('.bookstore-dialogue')).toHaveText(before);
        } finally { release(); }
        const error = page.getByRole('alert');
        await assertions(error).toHaveCount(1);
        await assertions(error).toBeInViewport();
        await assertions(page.getByRole('button', { name: 'もう一度送る', exact: true })).toBeInViewport();
        await assertions(input).toHaveValue('いつものお茶について教えてください。');
        await assertions(input).toHaveAttribute('aria-describedby', 'message-help conversation-error');
        await assertions(page.locator('.composer')).toHaveAttribute('aria-busy', 'false');
        await assertions(page.locator('.history-dialog')).toContainText('0 / 5 往復');
        assert.equal(requests.length, 1);
        if (failure === 'edited-draft') await input.fill('緑の袋のお茶をお探しですか。');
        if (failure === 'unavailable') await page.screenshot({ path: `output/browser-smoke/message-error-${viewport.width}.png`, fullPage: false });
        await page.getByRole('button', { name: 'もう一度送る', exact: true }).click();
        await assertions(page.locator('.history-dialog')).toContainText('1 / 5 往復');
        await assertions(page.getByRole('alert')).toHaveCount(0);
        await assertions(input).toHaveValue('');
        assert.equal(requests.length, 2);
        if (failure === 'edited-draft') assert.notEqual(requests[0].requestId, requests[1].requestId);
        else assert.equal(requests[0].requestId, requests[1].requestId);
        const speakers = await page.locator('.story-history strong').allTextContents();
        assert.equal(speakers.filter(speaker => speaker === 'あなた').length, 1);
      });
      console.log(`PASS ${viewport.width}px recovery/${failure}`);
    }
    await fixture(viewport, 'sato', async page => {
      await chooseAndStart(page, scenarios[1], 'sato');
      const input = page.getByLabel('返事を入力');
      await input.fill('終了時にも残る下書き');
      let attempts = 0;
      await page.route('**/end', async route => {
        if (++attempts === 1) await route.fulfill({ status: 503, json: { error: '終了を確認できませんでした。もう一度お試しください。' } });
        else await route.continue();
      });
      await page.getByRole('button', { name: '手助けを断られたので終える', exact: true }).click();
      await assertions(page.getByRole('alert')).toBeInViewport();
      await assertions(page.getByRole('alert')).toContainText('画面の会話と入力は残っています');
      await assertions(input).toHaveValue('終了時にも残る下書き');
      await assertions(page.getByRole('button', { name: 'もう一度送る', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '手助けを断られたので終える', exact: true }).click();
      await assertions(page.getByRole('heading', { name: '自分の声かけを振り返る', exact: true })).toBeVisible();
      await assertions(page.locator('.respect-note')).toBeVisible();
      await assertions(page.getByRole('alert')).toHaveCount(0);
      assert.equal(attempts, 2);
    });
    console.log(`PASS ${viewport.width}px recovery/end`);
  }
  console.log(`Browser smoke passed: ${completed} cases, demo only. Screenshots: output/browser-smoke/`);
} finally { await browser.close(); }
