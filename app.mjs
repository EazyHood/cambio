import { parseLines, makeDecision, buildPlan, RANKING_POLICY } from './engine.mjs';

const $ = (id) => document.getElementById(id);
const example = {
  before: [
    'Meet outside the north entrance at 10:00.',
    'The repair workshop takes place in Room 4.',
    'Bring your laptop and its charger.',
    'Lunch is provided at 12:30.',
    'Leave finished repairs on the blue table.',
  ],
  updates: [
    'Please gather at the north entrance at 10:30 instead.',
    'The workshop has moved to Room 7.',
    'Bring an extension cable if you have one.',
    'Lunch is still provided at 12:30.',
  ],
};

let state = { before: [], updates: [], decisions: [], rankings: [], current: 0, history: [], model: null, elapsedMs: 0 };
let worker;
let requestId = 0;
let timeout;
let busy = false;

function announce(message) { $('live-status').textContent = message; }
function error(message) { $('input-error').textContent = message; $('input-error').hidden = !message; }
function setBusy(value) {
  busy = value;
  $('plan-form').setAttribute('aria-busy', String(value));
  $('analyze-button').disabled = value;
  $('load-example').disabled = value;
  $('original-plan').readOnly = value;
  $('updates-plan').readOnly = value;
  $('model-status').hidden = !value;
}

function showView(name) {
  for (const view of ['input', 'review', 'complete']) {
    $(`${view}-view`).hidden = view !== name;
    const step = $(`step-${view}`);
    if (step) {
      if (view === name) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    }
  }
  const heading = $(`${name}-heading`);
  heading?.focus({ preventScroll: true });
  if (name !== 'input') $('app-start')?.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function resetReview(before, updates) {
  state = { before, updates, rankings: [], current: 0, history: [], model: null, elapsedMs: 0,
    decisions: updates.map((_, updateIndex) => makeDecision(before, updates, { updateIndex, action: 'pending' })) };
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./model-worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.id !== requestId || !busy) return;
    if (data.type === 'progress') {
      if (typeof data.progress === 'number') $('model-progress').value = Math.max(0, Math.min(100, data.progress));
      $('model-status-text').textContent = data.file?.endsWith('.onnx')
        ? `Downloading the matching model · ${Math.round(data.progress || 0)}%` : 'Preparing the local model…';
    } else if (data.type === 'status') {
      const messages = {
        queued: 'Preparing local matching…', loading: 'Loading the model. Your instructions stay here.',
        ready: 'Model ready on this device.', inferring: 'Finding related instructions…',
      };
      $('model-status-text').textContent = messages[data.phase] || 'Preparing local matching…';
      if (data.phase === 'inferring') $('model-progress').removeAttribute('value');
    } else if (data.type === 'result') {
      clearTimeout(timeout);
      state.rankings = data.rankings;
      state.model = data.model;
      state.elapsedMs = data.elapsedMs;
      setBusy(false);
      $('manual-review').hidden = true;
      showView('review');
      renderReview();
      announce('Matching complete. Review each update before changing your plan.');
    } else if (data.type === 'error') failed(data.message);
  };
  worker.onerror = () => {
    worker?.terminate(); worker = undefined;
    failed('The local model could not start in this browser. You can retry or review without AI suggestions.');
  };
  return worker;
}

function failed(message) {
  clearTimeout(timeout);
  if (!busy) return;
  setBusy(false);
  error(message);
  $('manual-review').hidden = false;
  announce(message);
}

function reviewManually() {
  try {
    const before = parseLines($('original-plan').value);
    const updates = parseLines($('updates-plan').value);
    if (!before.length || !updates.length) throw new Error('Add at least one instruction to each list before reviewing.');
    resetReview(before, updates);
  } catch (err) { error(err.message); return; }
  requestId += 1;
  worker?.terminate(); worker = undefined;
  clearTimeout(timeout);
  state.model = { executed: false, mode: 'manual' };
  state.rankings = state.updates.map((_, updateIndex) => ({ updateIndex, candidates: [], ambiguous: true, conditional: false }));
  setBusy(false);
  error('');
  showView('review');
  renderReview();
  announce('Manual review. No AI model was used.');
}

const manual = document.createElement('button');
manual.type = 'button'; manual.id = 'manual-review'; manual.className = 'button button-secondary';
manual.textContent = 'Review without AI suggestions'; manual.hidden = true;
$('input-error').after(manual);
manual.addEventListener('click', reviewManually);

const cancel = document.createElement('button');
cancel.type = 'button'; cancel.id = 'cancel-matching'; cancel.className = 'text-button';
cancel.textContent = 'Cancel matching';
$('model-status').append(cancel);
cancel.addEventListener('click', () => {
  requestId += 1;
  worker?.terminate(); worker = undefined;
  clearTimeout(timeout);
  setBusy(false);
  $('manual-review').hidden = false;
  announce('Matching cancelled. You can retry or review manually.');
  $('manual-review').focus();
});

$('load-example').addEventListener('click', () => {
  $('original-plan').value = example.before.join('\n');
  $('updates-plan').value = example.updates.join('\n');
  error('');
  announce('Loaded a fictional repair workshop. Try matching its four updates.');
  $('original-plan').focus();
});

$('plan-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  error('');
  $('manual-review').hidden = true;
  let sourcesReady = false;
  try {
    const before = parseLines($('original-plan').value);
    const updates = parseLines($('updates-plan').value);
    if (!before.length || !updates.length) {
      $(!before.length ? 'original-plan' : 'updates-plan').focus();
      throw new Error('Add at least one instruction to each list. Use a separate line for each instruction.');
    }
    resetReview(before, updates);
    sourcesReady = true;
    setBusy(true);
    $('model-progress').removeAttribute('value');
    $('model-status-text').textContent = 'Loading the local matching model…';
    requestId += 1;
    getWorker().postMessage({ id: requestId, type: 'match', before, updates });
    timeout = setTimeout(() => {
      requestId += 1;
      worker?.terminate(); worker = undefined;
      failed('Matching is taking longer than expected. Retry on a stable connection, or review manually.');
    }, 180000);
  } catch (err) {
    setBusy(false);
    error(err.message);
    $('manual-review').hidden = !sourcesReady;
  }
});

function listLines(target, lines, changes = []) {
  target.replaceChildren();
  const replacementIndexes = new Set(changes.filter((c) => c.action === 'replace').map((c) => c.beforeIndex));
  lines.forEach((line, index) => {
    const item = document.createElement('li');
    item.textContent = line;
    item.dataset.line = String(index);
    if (replacementIndexes.has(index)) item.classList.add('is-updated');
    else if (index >= state.before.length) item.classList.add('is-added');
    target.append(item);
  });
}

function renderPreview(changedIndex = -1) {
  const result = buildPlan(state.before, state.updates, state.decisions);
  listLines($('plan-preview'), result.previewLines, result.changes);
  $('preview-count').textContent = `${result.previewLines.length} instructions`;
  if (changedIndex >= 0) {
    const item = $('plan-preview').querySelector(`[data-line="${changedIndex}"]`);
    item?.classList.add('is-entering');
  }
}

function targetTaken(beforeIndex) {
  return state.decisions.some((d) => d.updateIndex !== state.current && d.action === 'replace' && d.beforeIndex === beforeIndex);
}

function renderReview() {
  const done = state.decisions.filter((d) => d.action !== 'pending').length;
  $('review-progress').max = state.updates.length;
  $('review-progress').value = done;
  $('review-count').textContent = `${done} of ${state.updates.length} reviewed`;
  $('update-number').textContent = `Update ${state.current + 1} of ${state.updates.length}`;
  $('update-text').textContent = state.updates[state.current];
  $('undo-button').disabled = state.history.length === 0;
  const ranking = state.rankings[state.current];
  const existing = state.decisions[state.current];
  $('previous-update').disabled = state.current === 0;
  $('next-update').disabled = state.current === state.updates.length - 1;
  $('show-result').hidden = done !== state.updates.length;
  const actionLabels = { pending: 'No decision yet.', replace: 'Current decision: replace the selected original.', add: 'Current decision: add as a separate instruction.', ignore: 'Current decision: ignore this update.' };
  $('current-decision').textContent = actionLabels[existing.action];
  const select = $('candidate-select');
  select.replaceChildren(new Option('Choose the instruction this changes', ''));
  const order = [...ranking.candidates.map((candidate) => candidate.beforeIndex), ...state.before.map((_, i) => i)]
    .filter((id, index, ids) => ids.indexOf(id) === index);
  order.forEach((index) => {
    const candidate = ranking.candidates.find((item) => item.beforeIndex === index);
    const taken = targetTaken(index);
    const prefix = candidate ? `${index + 1} · suggested` : `${index + 1}`;
    const option = new Option(`${prefix} — ${state.before[index]}${taken ? ' (already replaced)' : ''}`, String(index));
    option.disabled = taken;
    select.append(option);
  });
  const suggested = ranking.candidates[0]?.beforeIndex;
  if (existing.action === 'replace') select.value = String(existing.beforeIndex);
  else if (!ranking.ambiguous && suggested !== undefined && !targetTaken(suggested)) select.value = String(suggested);
  $('source-confirm').checked = false;
  if (!state.model?.executed) $('match-note').textContent = 'Manual review. Choose a source yourself; no AI suggestion was used.';
  else if (ranking.conditional) $('match-note').textContent = 'Check the condition. This wording may depend on something else; similarity cannot decide what is now true.';
  else if (ranking.ambiguous) $('match-note').textContent = 'Needs a closer look. Similarity, wording or competing matches make this suggestion uncertain. Choose a source, add separately, or ignore.';
  else $('match-note').textContent = 'Related wording found. Check the meaning and the full source before replacing it.';
  $('match-note').dataset.kind = ranking.ambiguous ? 'review' : 'match';
  showSource();
  renderPreview();
}

function showSource() {
  const selected = $('candidate-select').value;
  $('source-text').textContent = selected === '' ? 'Select an original instruction to see it in full.' : state.before[Number(selected)];
  $('replace-button').disabled = selected === '' || !$('source-confirm').checked || targetTaken(Number(selected));
}
$('candidate-select').addEventListener('change', () => { $('source-confirm').checked = false; showSource(); });
$('source-confirm').addEventListener('change', showSource);

function decide(action) {
  const target = $('candidate-select').value;
  if (action === 'replace' && (!$('source-confirm').checked || target === '')) return;
  const previous = state.decisions[state.current];
  const decision = makeDecision(state.before, state.updates, {
    updateIndex: state.current, action, ...(action === 'replace' ? { beforeIndex: Number(target) } : {}),
  });
  const proposed = [...state.decisions];
  proposed[state.current] = decision;
  let result;
  try { result = buildPlan(state.before, state.updates, proposed); }
  catch (err) { $('match-note').textContent = err.message; announce(err.message); return; }
  state.history.push({ index: state.current, previous });
  state.decisions = proposed;
  const changedIndex = action === 'replace' ? Number(target) : action === 'add' ? result.previewLines.length - 1 : -1;
  renderPreview(changedIndex);
  announce(action === 'ignore' ? 'Update ignored. The original plan stays unchanged.' : action === 'add' ? 'Added the exact update as a separate instruction.' : 'Replaced the selected instruction with the exact update.');
  if (result.complete) {
    showComplete();
    return;
  }
  state.current = result.pending.find((index) => index > state.current) ?? result.pending[0];
  renderReview();
  // Only the changed line moves. The source and next update remain readable.
  if (changedIndex >= 0) $('plan-preview').querySelector(`[data-line="${changedIndex}"]`)?.classList.add('is-entering');
  $('update-text').focus({ preventScroll: false });
}

for (const action of ['replace', 'add', 'ignore']) $(`${action}-button`).addEventListener('click', () => decide(action));

function undo() {
  const last = state.history.pop();
  if (!last) return;
  state.decisions[last.index] = last.previous;
  state.current = last.index;
  showView('review'); renderReview();
  announce('Last decision undone. Review this update again.');
}
$('undo-button').addEventListener('click', undo);
for (const [id, delta] of [['previous-update', -1], ['next-update', 1]]) {
  $(id).addEventListener('click', () => {
    const next = state.current + delta;
    if (next < 0 || next >= state.updates.length) return;
    state.current = next; renderReview();
    $('update-text').focus({ preventScroll: false });
    announce(`Reviewing update ${next + 1} of ${state.updates.length}.`);
  });
}
$('show-result').addEventListener('click', showComplete);
$('back-button').addEventListener('click', () => { showView('input'); announce('Editing sources starts a fresh review.'); });

function showComplete() {
  const result = buildPlan(state.before, state.updates, state.decisions);
  if (!result.complete) return;
  listLines($('final-plan'), result.lines, result.changes);
  const count = (action) => result.changes.filter((item) => item.action === action).length;
  $('decision-summary').textContent = `${count('replace')} replaced · ${count('add')} added · ${count('ignore')} ignored. ${state.model?.executed ? `Local matching took ${(state.elapsedMs / 1000).toFixed(1)}s, including any model loading.` : 'Reviewed manually; the AI model did not run.'}`;
  $('export-txt').disabled = false;
  $('export-json').disabled = false;
  showView('complete');
  announce('Every update reviewed. Your revised plan is ready to download.');
}

function download(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('export-txt').addEventListener('click', () => {
  const result = buildPlan(state.before, state.updates, state.decisions);
  if (!result.complete) return;
  download('cambio-plan.txt', 'text/plain;charset=utf-8', `REVIEWED PLAN\n\n${result.lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}\n\nReviewed in Cambio. Confirm important details with the organizer.\n`);
  announce('Plan downloaded as plain text.');
});
$('export-json').addEventListener('click', () => {
  const result = buildPlan(state.before, state.updates, state.decisions);
  if (!result.complete) return;
  download('cambio-review.json', 'application/json', JSON.stringify({
    schema: 'cambio-review-v1', exportedAt: new Date().toISOString(),
    before: state.before, updates: state.updates, plan: result.lines, changes: result.changes,
    matching: { model: state.model, elapsedMs: state.elapsedMs, policy: RANKING_POLICY, rankings: state.rankings },
    note: 'Model scores are similarity, not truth or confidence. Every change was selected by the person reviewing.',
  }, null, 2));
  announce('Review downloaded with original sources and decisions.');
});
$('review-again').addEventListener('click', () => { state.current = 0; showView('review'); renderReview(); });
$('reset-button').addEventListener('click', () => {
  requestId += 1; clearTimeout(timeout); worker?.postMessage({ id: requestId, type: 'cancel' });
  resetReview([], []); setBusy(false); $('plan-form').reset(); error(''); $('manual-review').hidden = true;
  showView('input'); $('original-plan').focus(); announce('Cleared both lists and all review decisions.');
});

window.addEventListener('pagehide', () => { clearTimeout(timeout); worker?.terminate(); worker = undefined; });
window.addEventListener('pageshow', (event) => {
  if (event.persisted && busy) { setBusy(false); $('manual-review').hidden = false; error('Matching stopped when this page was left. Start again to continue.'); }
});
