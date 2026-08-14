// ═══════════════════════════════════════════════════════════════════════════
// Regression test: a virtualized thread must export ALL turns.
//
// Reproduces the defect that truncated real exports: claude.ai only knows
// about the turns it has mounted so far, so scrollHeight reports the height
// of *discovered* content, not of the whole conversation, and it grows a
// couple of turns at a time as you scroll. Any end-of-thread test built on
// `scrollTop + clientHeight >= scrollHeight` therefore fires early — the
// position is pinned at the bottom of what is currently known while more
// turns are still waiting to mount.
//
//   node --test test/                (needs jsdom)
// ═══════════════════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POPUP = path.join(HERE, '..', 'popup.js');

// ─────────────────────────────────────────────────────────────────────────
// Lift the real extractionScript out of popup.js by brace-matching, so the
// test exercises shipped source rather than a copy that can drift.
// ─────────────────────────────────────────────────────────────────────────
function loadExtractionScript() {
  const src = fs.readFileSync(POPUP, 'utf8');
  const marker = 'const extractionScript = async (autoScroll) => {';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('extractionScript not found in popup.js');

  let depth = 0, end = -1;
  for (let j = src.indexOf('{', start + marker.length - 1); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) { end = j; break; }
  }
  if (end < 0) throw new Error('unbalanced braces around extractionScript');

  return src.slice(start + 'const extractionScript = '.length, end + 1);
}

const TURN_HEIGHT = 500;
const CLIENT_HEIGHT = 800;

// ─────────────────────────────────────────────────────────────────────────
// A thread that mounts only the visible window and, like the real app,
// discovers further turns a couple at a time instead of knowing its full
// height up front.
// ─────────────────────────────────────────────────────────────────────────
function buildVirtualizedThread(turnCount, { growPerScroll = 2, growEvery = 1 } = {}) {
  const dom = new JSDOM('<!doctype html><title>Test Thread - Claude</title><body></body>', {
    url: 'https://claude.ai/chat/abc'
  });
  const { window } = dom;
  const doc = window.document;

  const turns = Array.from({ length: turnCount }, (_, i) => ({
    role: i % 2 === 0 ? 'human' : 'assistant',
    text: `Turn ${i} body text`
  }));

  const container = doc.createElement('div');
  container.setAttribute('data-autoscroll-container', 'true');
  container.style.overflowY = 'auto';
  doc.body.appendChild(container);

  let scrollTop = 0;
  let discovered = Math.min(turnCount, 3);   // turns the list knows about
  let pendingGrow = 0;             // turns fetched but not yet measured in
  let fetchAttempts = 0;
  let renderedFrom = -1, renderedTo = -1;

  const knownHeight = () => discovered * TURN_HEIGHT;
  const maxScroll = () => Math.max(0, knownHeight() - CLIENT_HEIGHT);

  const render = () => {
    const from = Math.max(0, Math.floor(scrollTop / TURN_HEIGHT));
    const to = Math.min(discovered - 1, Math.floor((scrollTop + CLIENT_HEIGHT) / TURN_HEIGHT));
    if (from === renderedFrom && to === renderedTo) return;
    renderedFrom = from; renderedTo = to;

    container.textContent = '';
    for (let i = from; i <= to; i++) {
      const t = turns[i];
      const turn = doc.createElement('div');
      turn.setAttribute('data-test-render-count', '1');

      if (t.role === 'human') {
        const msg = doc.createElement('div');
        msg.setAttribute('data-testid', 'user-message');
        const p = doc.createElement('p');
        p.textContent = t.text;
        msg.appendChild(p);
        turn.appendChild(msg);
      } else {
        const resp = doc.createElement('div');
        resp.setAttribute('data-is-streaming', 'false');
        const md = doc.createElement('div');
        md.className = 'standard-markdown';
        const p = doc.createElement('p');
        p.textContent = t.text;
        md.appendChild(p);
        resp.appendChild(md);
        turn.appendChild(resp);
      }
      container.appendChild(turn);
    }
  };

  Object.defineProperty(container, 'clientHeight', { get: () => CLIENT_HEIGHT });
  Object.defineProperty(container, 'scrollHeight', { get: () => knownHeight() });
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (v) => {
      // Turns requested by the *previous* scroll land now — fetching is
      // asynchronous, so the browser clamps against what is known today
      // and the height only catches up afterwards. That lag is what makes
      // scrollHeight lie about where the conversation ends.
      if (pendingGrow) {
        discovered = Math.min(turnCount, discovered + pendingGrow);
        pendingGrow = 0;
      }

      const want = Math.max(0, Number(v) || 0);
      scrollTop = Math.min(want, maxScroll());

      // Approaching the end of known content triggers the next fetch —
      // but a slow network only delivers every `growEvery` attempts, so
      // the position can sit still for several rounds with the rest of
      // the conversation still to come.
      if (want + CLIENT_HEIGHT >= knownHeight() - 1 && discovered < turnCount) {
        if (++fetchAttempts % growEvery === 0) pendingGrow = growPerScroll;
      }
      render();
    }
  });

  render();
  return { window, container, turns };
}

async function runExport(window, autoScroll) {
  const fn = new Function(
    'window', 'document', 'Node', 'getComputedStyle', 'location', 'setTimeout',
    `return (${loadExtractionScript()});`
  )(
    window, window.document, window.Node,
    window.getComputedStyle.bind(window), window.location,
    // Run the sweep without paying its real wall-clock cost.
    (fn) => setTimeout(fn, 0)
  );
  return fn(autoScroll);
}

test('exports every turn of a virtualized thread, including the last', async () => {
  const turnCount = 30;
  const { window, turns } = buildVirtualizedThread(turnCount);

  const data = await runExport(window, true);

  assert.equal(data.error, undefined, `unexpected error: ${data.error}`);
  assert.equal(data.messages.length, turnCount,
    `expected ${turnCount} messages, got ${data.messages.length} — the sweep stopped early`);

  // Order must match conversation order, and the tail must survive.
  assert.deepEqual(
    data.messages.map(m => m.content),
    turns.map(t => t.text)
  );
});

test('the final turn is never dropped even when the list grows one turn at a time', async () => {
  const turnCount = 24;
  const { window, turns } = buildVirtualizedThread(turnCount, { growPerScroll: 1 });

  const data = await runExport(window, true);

  assert.equal(data.messages.length, turnCount);
  assert.equal(data.messages.at(-1).content, turns.at(-1).text);
});

test('a long thread that mounts one turn at a time still exports in full', async () => {
  const turnCount = 120;
  const { window, turns } = buildVirtualizedThread(turnCount, { growPerScroll: 1 });

  const data = await runExport(window, true);

  assert.equal(data.messages.length, turnCount,
    `expected ${turnCount} messages, got ${data.messages.length}`);
  assert.equal(data.messages.at(-1).content, turns.at(-1).text);
});

// The failure users actually reported: the middle of the conversation goes
// missing while the ending survives, so two answers end up side by side and
// the export reads as if it repeated itself.
test('a slow-loading thread exports with no gap in the middle', async () => {
  const turnCount = 40;
  const { window, turns } = buildVirtualizedThread(turnCount, { growPerScroll: 2, growEvery: 4 });

  const data = await runExport(window, true);

  assert.deepEqual(
    data.messages.map(m => m.content),
    turns.map(t => t.text),
    'the sweep left a hole in the conversation'
  );
});

test('survives a thread that loads one turn per eight scroll attempts', async () => {
  const turnCount = 60;
  const { window, turns } = buildVirtualizedThread(turnCount, { growPerScroll: 1, growEvery: 8 });

  const data = await runExport(window, true);

  assert.deepEqual(data.messages.map(m => m.content), turns.map(t => t.text));
});

test('without autoScroll only the mounted screenful is harvested', async () => {
  const { window } = buildVirtualizedThread(30);

  const data = await runExport(window, false);

  assert.equal(data.stats.passes, 1);
  assert.ok(data.messages.length < 30, 'a single pass must not see the whole thread');
});
