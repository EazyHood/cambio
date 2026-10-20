import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parseLines, makeDecision, buildPlan, RANKING_POLICY } from './engine.mjs';

// Execute the actual application against the actual HTML IDs. The small platform
// doubles below cover events, worker boundaries and downloads, not layout, browser
// accessibility, real inference or model-network privacy. Those need browser checks.
async function harness({ workerThrows = false } = {}) {
  const [html, app] = await Promise.all([
    readFile(new URL('./index.html', import.meta.url), 'utf8'),
    readFile(new URL('./app.mjs', import.meta.url), 'utf8'),
  ]);
  const nodes = new Map();
  const workers = [];
  const timers = new Map();
  const downloads = [];
  const blobs = new Map();
  let timerId = 0;
  let networkCalls = 0;
  let document;

  class Element {
    constructor(tag = 'div') {
      this.tag = tag;
      this.children = [];
      this.listeners = new Map();
      this.attributes = new Map();
      this.dataset = {};
      this.value = '';
      this.textContent = '';
      this.hidden = false;
      this.disabled = false;
      this.checked = false;
      this.readOnly = false;
      this.classList = new Set();
    }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    set innerHTML(_value) { throw new Error('Instruction content must never use innerHTML.'); }
    addEventListener(name, listener) {
      const listeners = this.listeners.get(name) || [];
      listeners.push(listener);
      this.listeners.set(name, listeners);
    }
    fire(name) {
      for (const listener of this.listeners.get(name) || []) listener({ preventDefault() {} });
    }
    click() {
      if (this.disabled) return;
      if (this.tag === 'a' && this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
      this.fire('click');
    }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
    scrollIntoView(options) { this.scrollOptions = options; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) {
      this.children = children;
      if (this.tag === 'select') this.value = children[0]?.value ?? '';
    }
    after() {}
    remove() {}
    reset() {
      for (const node of nodes.values()) {
        if (node.tag === 'textarea') node.value = '';
        if (node.tag === 'input') node.checked = false;
      }
    }
    querySelector(selector) {
      const line = selector.match(/data-line="(\d+)"/)?.[1];
      return this.children.find((child) => child.dataset.line === line) ?? null;
    }
  }

  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const node = new Element(match[1]);
    node.id = match[3];
    node.hidden = /\bhidden(?:\s|=|$)/.test(match[2]);
    node.disabled = /\bdisabled(?:\s|=|$)/.test(match[2]);
  }
  document = {
    activeElement: null,
    body: new Element('body'),
    getElementById: (id) => nodes.get(id) ?? null,
    createElement: (tag) => new Element(tag),
  };
  class FakeWorker {
    constructor() {
      if (workerThrows) throw new Error('Worker construction blocked.');
      this.messages = [];
      this.terminated = false;
      workers.push(this);
    }
    postMessage(message) { this.messages.push(structuredClone(message)); }
    terminate() { this.terminated = true; }
    reply(message) { this.onmessage({ data: { id: this.messages.at(-1).id, ...message } }); }
    fail() { this.onerror(new Error('Worker failed.')); }
  }
  class FakeURL extends URL {
    static createObjectURL(blob) {
      const url = `blob:test/${blobs.size + 1}`;
      blobs.set(url, blob);
      return url;
    }
    static revokeObjectURL(url) { blobs.delete(url); }
  }
  const context = {
    document,
    window: new Element('window'),
    Option: class extends Element {
      constructor(text, value) { super('option'); this.textContent = text; this.value = value; }
    },
    Worker: FakeWorker,
    URL: FakeURL,
    Blob,
    parseLines, makeDecision, buildPlan, RANKING_POLICY,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch() { networkCalls += 1; throw new Error('The main app must not send instructions over the network.'); },
  };
  const source = app.replace(/^import .*;\r?\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(new URL('./app.mjs', import.meta.url).href));
  runInNewContext(source, context, { filename: 'app.mjs' });
  const get = (id) => {
    assert.ok(nodes.has(id), `Expected a real HTML or dynamically-created element: ${id}`);
    return nodes.get(id);
  };
  return {
    get, workers, downloads, document,
    get networkCalls() { return networkCalls; },
    fill(before, updates) { get('original-plan').value = before; get('updates-plan').value = updates; },
    submit() { get('plan-form').fire('submit'); },
    click(id) { get(id).click(); },
    lines(id) { return get(id).children.map((node) => node.textContent); },
    timeout() {
      const entry = [...timers.entries()].find(([, timer]) => timer.delay === 180000);
      assert.ok(entry, 'Matching has a bounded timeout');
      timers.delete(entry[0]);
      entry[1].callback();
    },
    pendingMatchingTimers() { return [...timers.values()].filter((timer) => timer.delay === 180000).length; },
  };
}

async function manualReview(before, updates) {
  const app = await harness({ workerThrows: true });
  app.fill(before, updates);
  app.submit();
  assert.equal(app.get('manual-review').hidden, false);
  app.click('manual-review');
  return app;
}

test('manual fallback reviews edited input, never the snapshot from a failed match', async () => {
  const app = await harness();
  app.fill('Original instruction.', 'Old update.');
  app.submit();
  app.workers[0].fail();
  app.fill('Edited original.', 'Edited update.');
  app.click('manual-review');
  assert.equal(app.get('update-text').textContent, 'Edited update.');
  assert.deepEqual(app.lines('plan-preview'), ['Edited original.']);
  app.click('add-button');
  assert.deepEqual(app.lines('final-plan'), ['Edited original.', 'Edited update.']);
});

test('manual fallback refuses empty edited input instead of silently restoring an older plan', async () => {
  const app = await harness();
  app.fill('Original.', 'Update.');
  app.submit();
  app.click('cancel-matching');
  app.fill('Original.', '');
  app.click('manual-review');
  assert.equal(app.get('review-view').hidden, true);
  assert.equal(app.get('input-error').hidden, false);
});

test('a synchronous worker failure offers manual review only after valid inputs', async () => {
  const app = await harness({ workerThrows: true });
  app.fill('', 'Update.');
  app.submit();
  assert.equal(app.get('manual-review').hidden, true);
  assert.equal(app.document.activeElement, app.get('original-plan'));
  app.fill('Original.', 'Update.');
  app.submit();
  assert.equal(app.get('manual-review').hidden, false);
  assert.equal(app.get('analyze-button').disabled, false);
  assert.equal(app.get('original-plan').readOnly, false);
  app.click('manual-review');
  assert.equal(app.get('review-view').hidden, false);
});

test('cancellation stops the worker, clears its timeout and gives a retry a fresh worker', async () => {
  const app = await harness();
  app.fill('Original.', 'Update.');
  app.submit();
  const oldWorker = app.workers[0];
  app.click('cancel-matching');
  assert.equal(oldWorker.terminated, true);
  assert.equal(app.pendingMatchingTimers(), 0);
  assert.equal(app.get('plan-form').getAttribute('aria-busy'), 'false');
  assert.equal(app.get('updates-plan').readOnly, false);
  app.submit();
  assert.equal(app.workers.length, 2);
  oldWorker.reply({ type: 'error', message: 'Stale worker response' });
  assert.equal(app.get('input-error').hidden, true);
  assert.equal(app.get('model-status').hidden, false);
});

test('timeout terminates blocked work, permits manual review and does not reuse the blocked worker', async () => {
  const app = await harness();
  app.fill('Original.', 'Update.');
  app.submit();
  const oldWorker = app.workers[0];
  app.timeout();
  assert.equal(oldWorker.terminated, true);
  assert.equal(app.get('manual-review').hidden, false);
  assert.equal(app.get('analyze-button').disabled, false);
  app.submit();
  assert.equal(app.workers.length, 2);
  assert.equal(app.pendingMatchingTimers(), 1);
});

test('a completed review can visit every update and return to the final plan without changing a decision', async () => {
  const app = await manualReview('Original.', 'First update.\nSecond update.\nThird update.');
  app.click('ignore-button');
  app.click('add-button');
  app.click('ignore-button');
  const final = app.lines('final-plan');
  app.click('review-again');
  assert.equal(app.get('update-text').textContent, 'First update.');
  app.click('next-update');
  assert.equal(app.get('update-text').textContent, 'Second update.');
  assert.match(app.get('current-decision').textContent, /add/);
  app.click('next-update');
  assert.equal(app.get('update-text').textContent, 'Third update.');
  assert.equal(app.get('next-update').disabled, true);
  app.click('previous-update');
  assert.equal(app.get('update-text').textContent, 'Second update.');
  assert.equal(app.get('show-result').hidden, false);
  app.click('show-result');
  assert.equal(app.get('complete-view').hidden, false);
  assert.deepEqual(app.lines('final-plan'), final);
});

test('replace, add, ignore, undo and both exports preserve exact reviewed text and block partial exports', async () => {
  const incoming = 'Bring <b>water</b> & cups.';
  const app = await manualReview('Arrive at 9.\nBring paper.', `Arrive at 10.\n${incoming}\nIgnore this notice.`);
  app.get('export-json').fire('click');
  assert.equal(app.downloads.length, 0);
  app.get('candidate-select').value = '0';
  app.get('candidate-select').fire('change');
  assert.equal(app.get('replace-button').disabled, true);
  app.get('source-confirm').checked = true;
  app.get('source-confirm').fire('change');
  app.click('replace-button');
  app.click('add-button');
  app.click('ignore-button');
  assert.deepEqual(app.lines('final-plan'), ['Arrive at 10.', 'Bring paper.', incoming]);
  app.click('review-again');
  app.click('undo-button');
  assert.equal(app.get('update-text').textContent, 'Ignore this notice.');
  assert.equal(app.get('show-result').hidden, true);
  app.get('export-txt').fire('click');
  assert.equal(app.downloads.length, 0);
  app.click('ignore-button');
  app.click('export-txt');
  app.click('export-json');
  const txt = await app.downloads.find((file) => file.name.endsWith('.txt')).blob.text();
  const json = JSON.parse(await app.downloads.find((file) => file.name.endsWith('.json')).blob.text());
  assert.ok(txt.includes(incoming));
  assert.deepEqual(json.plan, ['Arrive at 10.', 'Bring paper.', incoming]);
  assert.deepEqual(json.changes.map((change) => change.action), ['replace', 'add', 'ignore']);
  assert.equal(json.matching.model.executed, false);
  assert.equal(app.networkCalls, 0);
});
