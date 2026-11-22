// End-to-end test against the live site: three browsers, real LiveKit call, real R2 uploads, agenda webhook.
import { chromium } from 'playwright';
import crypto from 'node:crypto';

const BASE = 'https://theboys.space';
const SECRET = process.env.AUTH_SECRET, AGENDA = process.env.AGENDA_TOKEN;
const room = 'e2e' + Math.random().toString(36).slice(2, 8);
const b64u = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmac = (d) => b64u(crypto.createHmac('sha256', SECRET).update(d).digest());
const inviteKey = hmac('room:' + room).slice(0, 16);
// Host session cookie (same format the site issues after the passcode) — only for the Library/agenda API checks.
const hostCookie = (() => { const body = `${encodeURIComponent('E2E Host')}.${Date.now() + 3600e3}`; return `${body}.${hmac(body)}`; })();

const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
async function person(name) {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1400, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::ERR|jsdelivr|storage.googleapis|status of 40[14]|status of 50[17]/.test(m.text())) errors.push(`${name} console: ${m.text().slice(0, 200)}`); });
  await pg.goto(`${BASE}/green-room/${room}?k=${inviteKey}`);
  await pg.fill('input[autocomplete=given-name]', name);
  await pg.click('text=Enter studio');
  await pg.waitForURL(`**/studio/${room}`);
  return { pg, ctx, name };
}

try {
  // ---------- Access ----------
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${BASE}/library`); ok('Library needs the passcode', anon.url().includes('/enter'));
  await anon.goto(`${BASE}/green-room/${room}?k=wrong`); ok('Tampered invite link is refused', anon.url().includes('/enter'));
  const sfx = await anon.request.get(`${BASE}/sfx/airhorn.mp3`); ok('Sound files load without sign-in', sfx.ok() && (await sfx.body()).length > 10000);

  // ---------- Join ----------
  const A = await person('Ahsan'); await sleep(1500);
  const B = await person('Bilal'); await sleep(1500);
  const C = await person('Omar');
  const P = [A, B, C];
  let live = false;
  for (let i = 0; i < 40 && !live; i++) { await sleep(500); live = (await Promise.all(P.map((p) => p.pg.locator('main video').count()))).every((n) => n === 3); }
  ok('All three see each other in the call', live);
  await sleep(3000);
  const flowing = await Promise.all(P.map((p) => p.pg.evaluate(() => [...document.querySelectorAll('main video')].filter((v) => v.videoWidth > 0 && v.readyState >= 2).length)));
  ok('Remote video is actually playing (frames decoded)', flowing.every((n) => n === 3), JSON.stringify(flowing));
  const audioEls = await Promise.all(P.map((p) => p.pg.evaluate(() => [...document.querySelectorAll('main audio')].filter((a) => a.srcObject && a.srcObject.getAudioTracks().length).length)));
  ok('Remote audio tracks attached', audioEls.every((n) => n === 2), JSON.stringify(audioEls));

  // ---------- Invite link from Setup ----------
  await A.pg.click('button:has-text("Setup")'); await sleep(1500);
  const invite = await A.pg.locator('input[aria-label="Invite link"]').inputValue();
  ok('Setup shows a signed invite link', invite.includes(`/green-room/${room}?k=${inviteKey}`));
  const statusText = await A.pg.locator('aside').innerText();
  ok('People section shows everyone', ['Ahsan (you)', 'Bilal', 'Omar'].every((n) => statusText.includes(n)));
  await A.pg.click('button[aria-label="Close panel"]');

  // ---------- Games over the real data channel ----------
  await A.pg.click('button:has-text("Games")'); await sleep(400);
  await A.pg.locator('aside div:has(> div > span:text-is("Imposter")) button:has-text("Play")').click(); await sleep(1500);
  const secrets = await Promise.all(P.map((p) => p.pg.locator('main div[style*="rgb(42, 26, 18)"]').first().innerText().catch(() => '')));
  const imps = secrets.filter((s) => s.includes('imposter')).length, words = secrets.filter((s) => s.startsWith('Word:')).length;
  ok('Imposter: exactly one imposter, two see the word', imps === 1 && words === 2, JSON.stringify(secrets));

  await A.pg.click('button:has-text("Games")'); await A.pg.locator('aside div:has(> div > span:text-is("Fast Money, no sound")) button:has-text("Play")').click(); await sleep(1500);
  const askerIdx = (await Promise.all(P.map((p) => p.pg.locator('text=Say it out loud').count()))).findIndex((n) => n > 0);
  const mutedCounts = await Promise.all(P.map((p) => p.pg.evaluate(() => [...document.querySelectorAll('main audio')].filter((a) => a.muted).length)));
  ok('Fast Money: asker muted for the two guessers only', askerIdx >= 0 && mutedCounts.every((n, i) => n === (i === askerIdx ? 0 : 1)), `asker=${askerIdx} muted=${JSON.stringify(mutedCounts)}`);
  await B.pg.click('main button:has-text("Reveal question")'); await sleep(800);
  const unmuted = await Promise.all(P.map((p) => p.pg.evaluate(() => [...document.querySelectorAll('main audio')].filter((a) => a.muted).length)));
  ok('Fast Money: everyone hears again after the reveal', unmuted.every((n) => n === 0));
  await A.pg.click('main button:has-text("End game")'); await sleep(500);

  // ---------- Shared set (virtual background) ----------
  await A.pg.click('button:has-text("Setup")'); await sleep(500);
  await A.pg.locator('aside button:has-text("Studio")').click(); await sleep(6000);
  const stillVideo = await B.pg.evaluate(() => [...document.querySelectorAll('main video')].filter((v) => v.videoWidth > 0).length);
  ok('Studio set applied without breaking video', stillVideo === 3, `B sees ${stillVideo} playing videos`);
  await A.pg.locator('aside button:has-text("Off")').first().click(); await sleep(1500);
  await A.pg.click('button[aria-label="Close panel"]');

  // ---------- Record ----------
  await B.pg.click('button:has-text("● Record")');
  await sleep(4500);
  const recOn = await Promise.all(P.map((p) => p.pg.locator('button:has-text("Pause")').count()));
  ok('Recording started on every screen', recOn.every((n) => n === 1));
  await A.pg.keyboard.press('2'); await C.pg.keyboard.press('m'); await sleep(14000);
  await C.pg.click('button:has-text("Pause")'); await sleep(1500);
  ok('Pause syncs', (await Promise.all(P.map((p) => p.pg.locator('button:has-text("Resume")').count()))).every((n) => n === 1));
  await A.pg.click('button:has-text("Resume")'); await sleep(6000);
  await A.pg.click('button.btn-rec:has-text("Stop")'); await A.pg.click('[role=alertdialog] button:has-text("Stop")');
  await sleep(2000);
  ok('Stop syncs', (await Promise.all(P.map((p) => p.pg.locator('button:has-text("● Record")').count()))).every((n) => n === 1));
  // wait for uploads to drain
  let drained = false;
  for (let i = 0; i < 90 && !drained; i++) { await sleep(1000); drained = (await Promise.all(P.map((p) => p.pg.locator('text=/Uploading \\(/').count()))).every((n) => n === 0); }
  ok('All chunks uploaded', drained);
  await sleep(4000);

  // ---------- Library ----------
  const api = await browser.newContext({ extraHTTPHeaders: { cookie: `st3=${encodeURIComponent(hostCookie)}` } });
  const lib = await (await api.request.get(`${BASE}/api/library`)).json();
  const ep = lib.sessions?.find((s) => s.id === room);
  const kinds = ep ? ep.tracks.map((t) => `${t.person.split('-')[0]}:${t.track}:${t.chunks}`) : [];
  ok('Episode is in the Library', !!ep, kinds.join(' '));
  const need = ['active', 'camera_raw', 'mic_raw'];
  ok('Episode video + every person’s camera and mic stored', !!ep && need.every((k) => ep.tracks.some((t) => t.track === k)) && ep.tracks.filter((t) => t.track === 'camera_raw').length === 3);
  ok('Episode title, markers and events saved', !!ep?.meta && (ep.meta.markers?.length ?? 0) >= 1 && (ep.meta.events ?? []).some((e) => e.type === 'sound'), `markers=${ep?.meta?.markers?.length} events=${JSON.stringify(ep?.meta?.events?.map((e) => e.type))}`);
  ok('Storage usage reported', typeof lib.usedBytes === 'number' && lib.limitBytes === 150e9, `${(lib.usedBytes / 1e6).toFixed(1)} MB of ${lib.limitBytes / 1e9} GB`);
  for (const t of ep?.tracks.filter((t) => ['active', 'mic_raw'].includes(t.track)).slice(0, 2) ?? []) {
    const files = await (await api.request.get(`${BASE}/api/library/files?session=${room}&person=${t.person}&track=${t.track}`)).json();
    const first = await (await api.request.get(files.parts[0].urls[0])).body();
    const magic = first.subarray(0, 4).toString('hex');
    ok(`Download works (${t.track})`, t.track === 'mic_raw' ? first.subarray(0, 4).toString() === 'RIFF' : magic === '1a45dfa3', `${first.length} bytes, header ${magic}`);
  }

  // ---------- Agenda by email ----------
  const bad = await api.request.post(`${BASE}/api/agenda?token=nope`, { data: { plain: 'x' } });
  ok('Agenda webhook rejects a wrong token', bad.status() === 401);
  const good = await (await browser.newContext()).request.post(`${BASE}/api/agenda?token=${AGENDA}`, { data: { headers: { subject: 'E2E agenda', from: 'instinct@example.com' }, plain: 'Hi team, tonight:\n1. 7:00 PM - Cold open\n2. Lead story: AI video\n- Game: Imposter (10 min)\nThanks!' } });
  const got = await (await api.request.get(`${BASE}/api/agenda`)).json();
  ok('Agenda email becomes a clean plan', good.ok() && JSON.stringify(got.agenda?.items) === JSON.stringify(['Cold open', 'Lead story: AI video', 'Game: Imposter']), JSON.stringify(got.agenda?.items));

  // ---------- Topics ----------
  const topics = await (await api.request.get(`${BASE}/api/topics`)).json();
  ok('Topics load today’s headlines', (topics.news?.length ?? 0) > 5, `${topics.news?.length} headlines`);

  // ---------- Clean up ----------
  const del = await api.request.delete(`${BASE}/api/library?session=${room}`);
  ok('Test episode deleted from storage', del.ok(), JSON.stringify(await del.json()));
  for (const s of (lib.sessions ?? []).filter((s) => /^e2e/.test(s.id) && s.id !== room)) await api.request.delete(`${BASE}/api/library?session=${s.id}`); // earlier test runs
} catch (e) {
  ok('Test run crashed', false, e.message);
} finally {
  ok('No page errors', errors.length === 0, errors.slice(0, 8).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
}
