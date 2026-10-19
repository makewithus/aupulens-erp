/** Isolated browser regression using installed Chrome/CDP, local MongoDB and a
 * local provider fixture. Run after npm run build. Never connects to .env DB/provider. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

const runId = randomUUID().slice(0, 8);
const tenant = `usage-review-${runId}`;
const mongo = new MongoClient(`mongodb://127.0.0.1:27017/aupulens_test_usage_browser_${runId}`);
const output = path.resolve(process.argv[2] || `/tmp/aupulens-usage-browser-${runId}`);
const profile = await mkdtemp(path.join(tmpdir(), 'aupulens-usage-chrome-'));
const base = 'http://127.0.0.1:3109';
const secret = randomUUID() + randomUUID();
let next, chrome, cdp;
let serverLog = '';
const results = { runId, checks: [], screenshots: [], errors: [], providerRequests: 0, memoryChecks: [], providerPrompts: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const stub = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  const data = JSON.parse(body || '{}');
  results.providerRequests++;
  const classifier = data.messages?.some(m => typeof m.content === 'string' && /query classifier/i.test(m.content));
  let content = classifier ? '{"category":"general","action":"summary"}' : 'Browser verification reply.';
  results.providerPrompts.push({ classifier, question: String(data.messages?.at(-1)?.content).slice(0, 160) });
  if (!classifier && /previous chat|just recall/i.test(String(data.messages?.at(-1)?.content))) {
    const payload = JSON.stringify(data.messages);
    results.memoryChecks.push({ prior: payload.includes('ORCHID-748 delivery on Friday'), isolated: !payload.includes('OTHER_USER_MEMORY_SECRET'), current: data.messages.some(m => m.role === 'assistant' && m.content.includes('Remembered Orchid delivery on Friday')) });
    content = 'Remembered Orchid delivery on Friday from your saved prior chat.';
  }
  const usage = { prompt_tokens: 21, completion_tokens: 13, total_tokens: 34 };
  if (data.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const chunk of [
      { choices: [{ index: 0, delta: { content }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage },
    ]) res.write(`data: ${JSON.stringify({ id: 'test-only', object: 'chat.completion.chunk', model: 'test', ...chunk })}\n\n`);
    res.end('data: [DONE]\n\n');
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'test-only', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage }));
  }
});
async function waitFor(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await fn()) return; } catch {} await pause(150); }
  throw new Error(`Timed out: ${label}`);
}
class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.seq = 0; this.pending = new Map(); this.handlers = new Map();
    this.ready = new Promise(resolve => this.ws.addEventListener('open', resolve, { once: true }));
    this.ws.addEventListener('message', event => { const msg = JSON.parse(event.data); if (msg.id) { const task = this.pending.get(msg.id); this.pending.delete(msg.id); if (msg.error) task?.reject(new Error(msg.error.message)); else task?.resolve(msg.result); } else this.handlers.get(msg.method)?.(msg.params); });
  }
  async send(method, params = {}) { await this.ready; return new Promise((resolve, reject) => { const id = ++this.seq; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
}
try {
  await mkdir(output, { recursive: true });
  await mongo.connect(); const db = mongo.db();
  const userId = new ObjectId();
  const policy = { startsAt: new Date(Date.now() - 1000).toISOString(), session: { minutes: 60, limit: 20 }, weekly: { limit: 100 } };
  await db.collection('organizations').insertOne({ name: 'Usage browser test', subdomain: tenant, ownerUserId: userId, isActive: true, subscriptionStatus: 'active', tier: 'enterprise', settings: { ai: {}, enabledModules: [] } });
  await db.collection('users').insertOne({ _id: userId, tenantId: tenant, name: 'Usage Browser Test', email: 'usage-browser@example.test', phone: '0000000000', password: await bcrypt.hash(secret, 10), role: 'admin', status: 'active' });
  // Pricing and plan fixtures stay inside this run's isolated database.
  await db.collection('aicostrates').insertMany(['test', 'gpt-4o'].map(modelName => ({ modelName, inputCostPerMillionTokens: 2.5, outputCostPerMillionTokens: 10, effectiveFrom: new Date() })));
  await db.collection('plans').insertOne({ key: 'enterprise', name: 'Test enterprise', features: { modules: ['admin', 'finance', 'sales', 'inventory', 'manufacturing', 'hr', 'crm'], featureFlags: {}, aiCreditsPerMonth: 100, aiRequestsPerMonth: 10000, maxUsers: 100, maxCompanies: 10, storageGb: 10, apiRequestsPerMonth: 10000, automationRunsPerMonth: 1000, documentLimitPerMonth: 1000, supportLevel: 'community' } });
  await new Promise(resolve => stub.listen(3110, '127.0.0.1', resolve));
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3109'], { env: { ...process.env,
    MONGODB_URI: `mongodb://127.0.0.1:27017/aupulens_test_usage_browser_${runId}`, AUTH_SECRET: secret, NEXTAUTH_SECRET: secret, AUTH_URL: base, NEXTAUTH_URL: base, NEXT_PUBLIC_APP_URL: base, COOKIE_DOMAIN: '127.0.0.1', MIDDLEWARE_INTERNAL_SECRET: secret, SESSION_SECURITY_VERSION: 'static-v1',
    SARVAM_ENABLED: 'false', SARVAM_API_KEY: '', AZURE_OPENAI_API_KEY: 'local-test-only', AZURE_OPENAI_ENDPOINT: 'http://127.0.0.1:3110', AZURE_OPENAI_API_VERSION: '2024-10-21', AZURE_OPENAI_CHAT_DEPLOYMENT: 'test',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  next.stdout.on('data', b => { serverLog += b; }); next.stderr.on('data', b => { serverLog += b; });
  await waitFor(async () => (await fetch(`${base}/api/auth/csrf`)).ok, 'local application startup');
  chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9227', `--user-data-dir=${profile}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', 'about:blank'], { stdio: 'ignore' });
  await waitFor(async () => (await fetch('http://127.0.0.1:9227/json/version')).ok, 'Chrome');
  const target = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  cdp.handlers.set('Runtime.exceptionThrown', e => results.errors.push(e.exceptionDetails.text));
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/ai/transcribe*' }] });
  cdp.handlers.set('Fetch.requestPaused', async e => { await cdp.send('Fetch.fulfillRequest', { requestId: e.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ success: true, text: 'Microphone browser fixture' })).toString('base64') }); });
  await cdp.send('Page.navigate', { url: `${base}/auth` });
  await waitFor(() => cdp.evaluate('location.origin === ' + JSON.stringify(base)), 'origin');
  const login = await cdp.evaluate(`(async () => { const {csrfToken} = await (await fetch('/api/auth/csrf')).json(); const r = await fetch('/api/auth/callback/credentials', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'}, body:new URLSearchParams({csrfToken,email:'usage-browser@example.test',password:${JSON.stringify(secret)},tenantId:${JSON.stringify(tenant)}}) }); return r.status; })()`);
  assert.equal(login, 200);
  await cdp.send('Page.navigate', { url: `${base}/admin/ai-assistant` });
  await waitFor(() => cdp.evaluate(`document.querySelector('[aria-label="Workspace AI usage"]')?.textContent.includes('No limit set')`), 'unconfigured real usage');
  const configured = await cdp.evaluate(`fetch('/api/admin/org-settings', {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({settings:{ai:{usagePolicy:${JSON.stringify(policy)}}}})}).then(r=>r.status)`);
  assert.equal(configured, 200);
  await cdp.evaluate(`window.dispatchEvent(new Event('aupulens:ai-usage-changed'))`);
  await waitFor(() => cdp.evaluate(`document.querySelector('[aria-label="Workspace AI usage"]')?.textContent.includes('Session: 0%')`), 'authenticated real usage');
  results.checks.push('Real login and authenticated summary: configured session/weekly zero usage');
  async function click(selector) {
    const point = await cdp.evaluate(`(() => { const candidates=[...document.querySelectorAll(${JSON.stringify(selector)})]; for(const e of candidates){const r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)continue;const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);if(hit===e||e.contains(hit))return{x,y,visible:true};}return {visible:false, candidates:candidates.map(e=>{const r=e.getBoundingClientRect();return{rect:{x:r.x,y:r.y,width:r.width,height:r.height},display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML?.slice(0,120)}})};})()`);
    assert(point?.visible, `Control is not visible/clickable: ${selector}; ${JSON.stringify(point)}`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }
  async function viewport(width, name, sidebar = false) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 320 });
    await pause(500);
    const metrics = await cdp.evaluate(`(() => { const root = ${sidebar ? "document.querySelector('aside textarea')?.closest('aside')" : "document.querySelector('form')"}; const indicator = root?.querySelector('[aria-label="Workspace AI usage"]'); const r=indicator?.getBoundingClientRect(); return { width:innerWidth, documentWidth:document.documentElement.scrollWidth, indicator:r&&{left:r.left,right:r.right,width:r.width,height:r.height}, textarea:!!root?.querySelector('textarea'), enabledButtons:root&&[...root.querySelectorAll('button')].filter(b=>!b.disabled).length, textareaVisible:(()=>{const t=root?.querySelector('textarea'); if(!t)return false; const r=t.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===t})(), overflow:root&&root.scrollWidth>root.clientWidth }; })()`);
    assert(metrics.indicator, `${name}: indicator present`);
    assert(metrics.indicator.left >= 0 && metrics.indicator.right <= width + 1, `${name}: indicator within viewport ${JSON.stringify(metrics)}`);
    assert.equal(metrics.overflow, false, `${name}: composer overflow`);
    assert(metrics.textarea && metrics.textareaVisible && metrics.enabledButtons > 0, `${name}: composer is obscured`);
    const shot = path.join(output, `${name}.png`);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(shot, Buffer.from(screenshot.data, 'base64')); results.screenshots.push(shot); results.checks.push({ name, metrics });
  }
  await viewport(1440, 'desktop'); await viewport(320, 'mobile');
  // Send through the real route/wrapper/counters with only the external provider replaced locally.
  await cdp.evaluate(`(() => { const t=document.querySelector('form textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Explain current workspace data.'); t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await pause(200); await click('form button[type="submit"]');
  await waitFor(() => cdp.evaluate(`document.querySelector('[aria-label="Workspace AI usage"]')?.textContent.includes('Session: 5%')`), 'streamed reply and usage refresh');
  results.checks.push('Message send → local provider stream → actual backend counters → toolbar 5%');
  const summary = await cdp.evaluate(`fetch('/api/ai/usage').then(r=>r.json())`);
  assert.equal(summary.data.session.used, 1); assert.equal(summary.data.weekly.used, 1);
  const image = path.join(output, 'attachment.png');
  await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=', 'base64'));
  const documentNode = await cdp.send('DOM.getDocument');
  const fileInput = await cdp.send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: 'form input[type="file"]' });
  await cdp.send('DOM.setFileInputFiles', { nodeId: fileInput.nodeId, files: [image] });
  await waitFor(() => cdp.evaluate(`document.querySelector('form').textContent.includes('attachment.png')`), 'attachment chip');
  await click('form button[title="Remove file"]');
  results.checks.push('Attachment selection and removal work at 320px');
  await click('form button[title="Speak your message"]');
  await waitFor(() => cdp.evaluate(`!!document.querySelector('form button[title="Stop and transcribe"]')`), 'microphone recording');
  await waitFor(() => cdp.evaluate(`Array.from(document.querySelectorAll('form [role="status"] span[style]')).some(e => parseFloat(e.style.height) > 2)`), 'waveform responds to fake microphone samples');
  const voiceShot = path.join(output, 'microphone-waveform.png');
  await writeFile(voiceShot, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  results.screenshots.push(voiceShot);
  results.checks.push('Live waveform responds to captured audio samples');
  await click('form button[title="Stop and transcribe"]');
  await waitFor(() => cdp.evaluate(`document.querySelector('form textarea').value.includes('Microphone browser fixture')`), 'microphone fixture');
  results.checks.push('Microphone fake-device capture and test-only transcription fixture work');
  await pause(6000); // allow the auth notification to expire before clicking the header toolbar
  await click('button[title="Aupulens Copilot"]');
  await waitFor(() => cdp.evaluate(`!!document.querySelector('aside textarea')`), 'shared sidebar');
  await viewport(320, 'sidebar-mobile', true); await viewport(1440, 'sidebar-desktop', true);
  for (const [limit, status] of [[0, 'exhausted'], [null, 'unlimited']]) {
    const testPolicy = {...policy, session: {...policy.session, limit}, weekly: {limit}};
    assert.equal(await cdp.evaluate(`fetch('/api/admin/org-settings', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings:{ai:{usagePolicy:${JSON.stringify(testPolicy)}}}})}).then(r=>r.status)`), 200);
    const response = await cdp.evaluate(`fetch('/api/ai/usage').then(r=>r.json())`);
    assert.equal(response.data.session.status, status); assert.equal(response.data.weekly.status, status);
    if (limit === 0) {
      const before = results.providerRequests;
      const gate = await cdp.evaluate(`fetch('/api/admin/ai-assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Read test image',stream:true,attachments:[{name:'test.png',type:'image/png',dataUrl:'data:image/png;base64,AA=='}]})}).then(async r=>({status:r.status,body:await r.json()}))`);
      assert.equal(gate.status, 403); assert.equal(gate.body.code, 'AI_LIMIT_REACHED');
      assert.equal(results.providerRequests, before);
    }
  }
  assert.equal(await cdp.evaluate(`fetch('/api/admin/org-settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings:{ai:{usagePolicy:null}}})}).then(r=>r.status)`), 200);
  const removed = await cdp.evaluate(`fetch('/api/ai/usage').then(r=>r.json())`);
  assert.equal(removed.data.session.status, 'unconfigured'); assert.equal(removed.data.weekly.status, 'unconfigured');
  assert.equal(removed.data.monthly.used, 1);
  results.checks.push('Authenticated policy configure/zero enforcement/unlimited/removal round trip; no production policy writes');
  await db.collection('chathistories').insertMany([
    { tenantId: tenant, userId, conversationId: 'prior-memory-fixture', module: 'admin', title: 'Orchid delivery', isArchived: false, messages: [{role: 'user', content: 'ORCHID-748 delivery on Friday', timestamp: new Date()}], createdAt: new Date(), updatedAt: new Date() },
    { tenantId: tenant, userId: new ObjectId(), conversationId: 'other-user-memory', module: 'admin', title: 'Private', isArchived: false, messages: [{role: 'user', content: 'OTHER_USER_MEMORY_SECRET', timestamp: new Date()}], createdAt: new Date(), updatedAt: new Date() },
  ]);
  const recallId = randomUUID();
  for (const message of ['What was discussed in the previous chat? MEMORY_RECALL_CHECK', 'What delivery did you just recall?']) {
    const response = await cdp.evaluate(`fetch('/api/admin/ai-assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:${JSON.stringify(message)},stream:true,conversationId:${JSON.stringify(recallId)},requestId:crypto.randomUUID()})}).then(async r=>({status:r.status,text:await r.text()}))`);
    assert.equal(response.status, 200, response.text);
    assert(response.text.includes('Remembered Orchid'), response.text);
  }
  assert.equal(results.memoryChecks.length, 2);
  assert(results.memoryChecks.every(check => check.prior && check.isolated));
  assert.equal(results.memoryChecks[1].current, true);
  assert.equal(await db.collection('chathistories').countDocuments({ tenantId: tenant, userId, conversationId: recallId }), 1);
  results.checks.push('Prior-chat recall reaches the provider; other users are excluded; completed streams restore active history without client-side saving');

  assert.equal(results.errors.length, 0, `Browser errors: ${results.errors.join('; ')}`);
  results.checks.push('No browser runtime exceptions');
  await writeFile(path.join(output, 'server.log'), serverLog);
} catch (error) {
  results.failure = error.stack; process.exitCode = 1;
} finally {
  cdp?.ws.close(); chrome?.kill('SIGTERM'); next?.kill('SIGTERM');
  stub.closeAllConnections(); await new Promise(resolve => stub.close(resolve));
  if (mongo.topology?.isConnected()) {
    for (const collection of await mongo.db().listCollections().toArray()) {
      await mongo.db().collection(collection.name).deleteMany({ $or: [{ tenantId: tenant }, { subdomain: tenant }, { tenantId: '__platform__' }] });
    }
  }
  await mongo.close(); await rm(profile, { recursive: true, force: true }).catch(() => {});
  await writeFile(path.join(output, 'server.log'), serverLog);
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, checks: results.checks, failure: results.failure, providerRequests: results.providerRequests }, null, 2));
}
