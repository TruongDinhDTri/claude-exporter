// ═══════════════════════════════════════════════════════════════════════════
// Regression test: harvested turns must come back in conversation order.
//
// A real export put one answer five messages further down than it belonged.
// Nothing was missing and nothing was duplicated — the order was simply
// wrong, which reads as if the conversation repeated itself.
//
// The cause is timing, not scrolling: a turn whose body has not rendered yet
// is skipped, and when it fills in a moment later it gets picked up *after*
// the turns that follow it. Anything that trusts "first seen" as "comes
// first" therefore files it in the wrong place.
// ═══════════════════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POPUP = path.join(HERE, '..', 'popup.js');

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
  return src.slice(start + 'const extractionScript = '.length, end + 1);
}

const CLIENT_HEIGHT = 800;

// ─────────────────────────────────────────────────────────────────────────
// Every turn is in the DOM from the start, but a few of them render their
// body late — the shape that reordered a real export.
// ─────────────────────────────────────────────────────────────────────────
function buildLateRenderingThread(turnCount, lateTurns) {
  const dom = new JSDOM('<!doctype html><title>Test Thread - Claude</title><body></body>', {
    url: 'https://claude.ai/chat/abc'
  });
  const doc = dom.window.document;

  const turns = Array.from({ length: turnCount }, (_, i) => ({
    role: i % 2 === 0 ? 'human' : 'assistant',
    text: `Turn ${i} body text`
  }));

  const container = doc.createElement('div');
  container.setAttribute('data-autoscroll-container', 'true');
  container.style.overflowY = 'auto';
  doc.body.appendChild(container);

  const bodies = [];
  for (const [i, t] of turns.entries()) {
    const turn = doc.createElement('div');
    turn.setAttribute('data-test-render-count', '1');

    let body;
    if (t.role === 'human') {
      const msg = doc.createElement('div');
      msg.setAttribute('data-testid', 'user-message');
      body = doc.createElement('p');
      msg.appendChild(body);
      turn.appendChild(msg);
    } else {
      const resp = doc.createElement('div');
      resp.setAttribute('data-is-streaming', 'false');
      const md = doc.createElement('div');
      md.className = 'standard-markdown';
      body = doc.createElement('p');
      md.appendChild(body);
      resp.appendChild(md);
      turn.appendChild(resp);
    }

    // A late turn stays blank — and a blank turn is skipped by the parser —
    // until enough scrolls have gone by.
    if (!lateTurns.has(i)) body.textContent = t.text;
    bodies.push(body);
    container.appendChild(turn);
  }

  let scrollTop = 0, scrolls = 0;
  const height = () => turnCount * 500;

  Object.defineProperty(container, 'clientHeight', { get: () => CLIENT_HEIGHT });
  Object.defineProperty(container, 'scrollHeight', { get: () => height() });
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (v) => {
      scrollTop = Math.max(0, Math.min(Number(v) || 0, height() - CLIENT_HEIGHT));
      if (++scrolls === 6) {
        for (const i of lateTurns) bodies[i].textContent = turns[i].text;
      }
    }
  });

  return { window: dom.window, turns };
}

async function runExport(window, autoScroll) {
  const fn = new Function(
    'window', 'document', 'Node', 'getComputedStyle', 'location', 'setTimeout',
    `return (${loadExtractionScript()});`
  )(
    window, window.document, window.Node,
    window.getComputedStyle.bind(window), window.location,
    (fn) => setTimeout(fn, 0)
  );
  return fn(autoScroll);
}

test('a turn that renders late is still filed in its own place', async () => {
  const turnCount = 20;
  const { window, turns } = buildLateRenderingThread(turnCount, new Set([2]));

  const data = await runExport(window, true);

  assert.deepEqual(
    data.messages.map(m => m.content),
    turns.map(t => t.text),
    'the late turn was appended after its successors instead of slotting back in'
  );
});

test('several late turns all land in order', async () => {
  const turnCount = 24;
  const { window, turns } = buildLateRenderingThread(turnCount, new Set([1, 4, 5, 11, 19]));

  const data = await runExport(window, true);

  assert.deepEqual(data.messages.map(m => m.content), turns.map(t => t.text));
});
