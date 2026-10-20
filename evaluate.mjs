/** Portable offline reproduction of the published synthetic retrieval evaluation.
 * Changes from the archived v3 runner are path configuration/output naming only.
 * No model or engine tuning is performed here. Original results are not overwritten.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RANKING_POLICY, LIMITS, rankMatches, validateSources } from './engine.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.join(ROOT, 'evaluation');
const REPORT_ROOT = path.resolve(process.env.CAMBIO_EVAL_OUTPUT_DIR ?? path.join(DATA_ROOT, 'reproduction'));
if (!process.env.CAMBIO_EVAL_MODEL_DIR) throw new Error('Set CAMBIO_EVAL_MODEL_DIR to an existing local directory containing the pinned q8 model. This evaluator never downloads it. See evaluation/README.md.');
const MODEL_ROOT = path.resolve(process.env.CAMBIO_EVAL_MODEL_DIR);
const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
const EXPECTED_WEIGHT_SHA = 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1';
const MANIFEST_PATH = path.join(REPORT_ROOT, 'cambio-eval-run-manifest-reproduction.json');
const mode = process.argv[2];
if (!['freeze', 'dev', 'heldout'].includes(mode)) throw new Error('Usage: node evaluate.mjs freeze|dev|heldout');
const sha = async (p) => crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const json = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const TRANSFORMERS_ROOT = path.resolve(process.env.CAMBIO_EVAL_TRANSFORMERS_ROOT ?? path.join(ROOT, 'node_modules/@huggingface/transformers'));
const packagePath = path.join(TRANSFORMERS_ROOT, 'package.json');
const runtimeEntry = path.join(TRANSFORMERS_ROOT, 'dist/transformers.node.mjs');
const fraction = (numerator, denominator) => ({ numerator, denominator, value: denominator ? numerator / denominator : null });
const round = (n) => Number(n.toFixed(6));
const exactPolicy = { minSimilarity: 0.45, minGap: 0.08, candidates: 3, version: '2026-10-19-v2' };
if (JSON.stringify(RANKING_POLICY) !== JSON.stringify(exactPolicy)) throw new Error('Ranking policy differs from the instructed v2 freeze. Do not evaluate heldout.');

async function currentFingerprint() {
  const pkg = await json(packagePath);
  if (pkg.version !== '3.8.1') throw new Error('Expected transformers 3.8.1');
  const weightPath = path.join(MODEL_ROOT, 'onnx/model_quantized.onnx');
  const weightSha = await sha(weightPath);
  if (weightSha !== EXPECTED_WEIGHT_SHA) throw new Error('Cached q8 weight differs from the recorded source.');
  const files = {};
  for (const relative of ['engine.mjs', 'model-worker.mjs', 'evaluate.mjs', 'package.json']) {
    files[relative] = await sha(path.join(ROOT, relative));
  }
  const datasets = {};
  for (const split of ['dev', 'heldout']) datasets[split] = await sha(path.join(DATA_ROOT, `cambio-eval-${split}.json`));
  const modelFiles = {};
  for (const relative of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']) {
    modelFiles[relative] = await sha(path.join(MODEL_ROOT, relative));
  }
  const runtime = { transformersRoot: TRANSFORMERS_ROOT, entrySha256: await sha(runtimeEntry), packageSha256: await sha(packagePath) };
  return { files, datasets, modelFiles, policy: RANKING_POLICY, limits: LIMITS, packageVersion: pkg.version, runtime };
}

if (mode === 'freeze') {
  const fingerprint = await currentFingerprint();
  await fs.mkdir(REPORT_ROOT, { recursive: true });
  await fs.writeFile(path.join(REPORT_ROOT, 'LEEME.md'), ['What: local reproduction results for Cambio.', 'Created by: the evaluator run by this checkout owner.', `Date: ${new Date().toISOString().slice(0, 10)}.`, 'Used by: local benchmark verification; not the original published run.', 'May be deleted: yes, after retaining any needed evidence.'].join('\n') + '\n', { flag: 'wx' }).catch((e) => { if (e.code !== 'EEXIST') throw e; });
  const manifest = {
    version: 'cambio-retrieval-evaluation-portable-reproduction', frozenAt: new Date().toISOString(),
    ...fingerprint,
    model: { id: 'Xenova/all-MiniLM-L6-v2', revision: MODEL_REVISION, dtype: 'q8', localPath: MODEL_ROOT, pooling: 'mean', normalize: true },
    evaluationRuntime: { node: process.version, platform: process.platform, arch: process.arch, osRelease: os.release(), cpu: os.cpus()[0]?.model, device: 'cpu', backend: 'onnxruntime-node CPU', threads: 'runtime default' },
    productionRuntime: { device: 'wasm', threads: 1, location: 'browser Web Worker' },
    runtimeLimitation: 'This run tests the same q8 weights, pooling and pure ranking engine in Node CPU. It does not validate browser/WASM parity, browser latency or offline browser caching.',
    runtimeReuse: 'The evaluator may use an explicitly selected existing installation of Transformers 3.8.1 while the product npm install completes. Its exact path and source hashes are recorded. No third-party code or model weights are copied. Product package-lock is not part of this independent runtime fingerprint.',
    gitCommit: null,
    codeIdentity: 'Source SHA-256 hashes identify this local reproduction. The public runner differs in path configuration and output naming from the archived v3 runner that produced the original published results.',
    protocolDeviation: 'Freeze v3 supersedes v2 before any dev or heldout inference: package.json changed only its npm test script to add app-flow.test.mjs. Engine and worker source hashes and ranking policy remain identical to v2. Before any heldout inference, the coordinating agent specified the core thresholds 0.45/0.08/top3. A static review found missing inflections of cancel in the warning regex; core corrected that to v2 before heldout. The earlier synthetic protocol suggested 0.65/0.10 and a dev grid. No grid search or threshold fitting is performed. The actual fixed policy is recorded here, without claiming dev calibration.',
    baseline: { name: 'Jaccard', tokenization: 'Unicode letters/numbers/apostrophes; lowercase; set of tokens; retain negations and numbers', emptySimilarity: 0, tieBreak: 'original source index ascending', topK: 3, thresholds: { minSimilarity: 0.45, minGap: 0.08 }, selection: 'Score and margin only. No production warning heuristics. Its selection numbers must not be presented as an equivalent calibrated confidence comparison.' },
    metricPolicy: 'Report retrieval separately from selection and ambiguity warnings. Correct retrieval does not entail the update or authorize an action.',
    noNetworkPolicy: 'allowRemoteModels=false; local_files_only=true; FS/browser model caches disabled; global fetch throws. Model cache is read only and verified after evaluation.',
    heldoutPolicy: 'Run dev first. Report material findings before heldout. Heldout output is created exclusively once; never tune on it.',
  };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ frozen: MANIFEST_PATH, policy: RANKING_POLICY, files: fingerprint.files }, null, 2));
  process.exit(0);
}

const manifest = await json(MANIFEST_PATH);
const current = await currentFingerprint();
for (const key of ['files', 'datasets', 'modelFiles', 'policy', 'limits', 'packageVersion', 'runtime']) {
  if (JSON.stringify(manifest[key]) !== JSON.stringify(current[key])) throw new Error(`Frozen fingerprint changed: ${key}. Do not use the existing heldout claim.`);
}
if (mode === 'heldout') {
  const devReport = await json(path.join(REPORT_ROOT, 'cambio-eval-dev-results-reproduction.json'));
  if (devReport.frozenManifestSha256 !== await sha(MANIFEST_PATH)) throw new Error('Dev was not evaluated with this freeze.');
}
const reportPath = path.join(REPORT_ROOT, `cambio-eval-${mode}-results-reproduction.json`);
try { await fs.access(reportPath); throw new Error('This split already has results. Preserve it; do not silently overwrite or rerun heldout.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }

const dataset = await json(path.join(DATA_ROOT, `cambio-eval-${mode}.json`));
for (const item of dataset.cases) validateSources(item.plan, item.updates);
let blockedFetchCalls = 0;
globalThis.fetch = async () => { blockedFetchCalls += 1; throw new Error('Network fetch is disabled for this offline evaluation.'); };
console.log(`${mode}: frozen files checked; importing local Transformers 3.8.1 runtime`);
const { env, pipeline } = await import(pathToFileURL(runtimeEntry).href);
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useFSCache = false;
env.useBrowserCache = false;
env.localModelPath = '';
console.log(`${mode}: loading cached q8 model on CPU, remote models disabled`);
const loadStart = performance.now();
const extractor = await pipeline('feature-extraction', MODEL_ROOT, { local_files_only: true, dtype: 'q8', device: 'cpu' });
const loadMs = performance.now() - loadStart;

const tokens = (s) => new Set(s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
function jaccard(a, b) {
  const ta = tokens(a), tb = tokens(b);
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union ? intersection / union : 0;
}
function scoreGate(candidates) {
  return Boolean(candidates[0]) && candidates[0].score >= RANKING_POLICY.minSimilarity
    && (!candidates[1] || candidates[0].score - candidates[1].score >= RANKING_POLICY.minGap);
}
const rows = [];
const caseTimings = [];
for (const item of dataset.cases) {
  const started = performance.now();
  const output = await extractor([...item.plan, ...item.updates], { pooling: 'mean', normalize: true });
  const vectors = output.tolist();
  const predictions = rankMatches(item.plan, item.updates, { before: vectors.slice(0, item.plan.length), updates: vectors.slice(item.plan.length) });
  caseTimings.push({ caseId: item.id, lineCount: item.plan.length + item.updates.length, elapsedMs: round(performance.now() - started) });
  for (const expected of item.expected) {
    const prediction = predictions[expected.update_index];
    const lexical = item.plan.map((source, beforeIndex) => ({ beforeIndex, score: jaccard(item.updates[expected.update_index], source) }))
      .sort((a, b) => b.score - a.score || a.beforeIndex - b.beforeIndex).slice(0, RANKING_POLICY.candidates);
    rows.push({
      caseId: item.id, updateIndex: expected.update_index, update: item.updates[expected.update_index], plan: item.plan,
      expected,
      minilm: { ...prediction, scoreMarginEligible: scoreGate(prediction.candidates), highlighted: !prediction.ambiguous, candidates: prediction.candidates.map((c) => ({ ...c, score: round(c.score) })) },
      jaccard: { candidates: lexical.map((c) => ({ ...c, score: round(c.score) })), highlighted: scoreGate(lexical), selectionMode: 'score-margin only; no engine warnings' },
    });
  }
  console.log(`${mode}: ${item.id} evaluated`);
}
await extractor.dispose();
const after = await currentFingerprint();
if (JSON.stringify(after) !== JSON.stringify(current)) throw new Error('Evaluated source, dataset or model files changed during the run.');

function metrics(method) {
  const single = rows.filter((r) => r.expected.alignment === 'single');
  const clear = single.filter((r) => !r.expected.ambiguous);
  const noTarget = rows.filter((r) => r.expected.alignment === 'none');
  const alternatives = rows.filter((r) => r.expected.alignment === 'alternatives');
  const multiple = rows.filter((r) => r.expected.alignment === 'multiple_required');
  const selected = rows.filter((r) => r[method].highlighted);
  const hit = (r, k) => r[method].candidates.slice(0, k).some((c) => r.expected.source_indexes.includes(c.beforeIndex));
  return {
    singleTop1: fraction(single.filter((r) => hit(r, 1)).length, single.length),
    singleRecallAt2: fraction(single.filter((r) => hit(r, 2)).length, single.length),
    singleRecallAt3: fraction(single.filter((r) => hit(r, 3)).length, single.length),
    selectedFractionOfAll: fraction(selected.length, rows.length),
    selectiveAlignmentPrecision: fraction(selected.filter((r) => r.expected.alignment === 'single' && hit(r, 1)).length, selected.length),
    strictUnambiguousSelectionPrecision: fraction(selected.filter((r) => r.expected.alignment === 'single' && !r.expected.ambiguous && hit(r, 1)).length, selected.length),
    clearSingleCoverage: fraction(clear.filter((r) => r[method].highlighted && hit(r, 1)).length, clear.length),
    falseAssociationOnNoTarget: fraction(noTarget.filter((r) => r[method].highlighted).length, noTarget.length),
    alternativesHitAnyAt2: fraction(alternatives.filter((r) => hit(r, 2)).length, alternatives.length),
    alternativesNotHighlighted: fraction(alternatives.filter((r) => !r[method].highlighted).length, alternatives.length),
    multipleRecallAllAt2: fraction(multiple.filter((r) => r.expected.source_indexes.every((id) => r[method].candidates.slice(0, 2).some((c) => c.beforeIndex === id))).length, multiple.length),
    multipleNotHighlighted: fraction(multiple.filter((r) => !r[method].highlighted).length, multiple.length),
  };
}
const minilmMetrics = metrics('minilm');
const jaccardMetrics = metrics('jaccard');
const goldAmbiguous = rows.filter((r) => r.expected.ambiguous);
const goldClear = rows.filter((r) => !r.expected.ambiguous);
const cancellations = rows.filter((r) => r.expected.cancellation);
const diagnostics = {
  ambiguousWarningRecall: fraction(goldAmbiguous.filter((r) => r.minilm.ambiguous).length, goldAmbiguous.length),
  warningsOnGoldNonAmbiguous: fraction(goldClear.filter((r) => r.minilm.ambiguous).length, goldClear.length),
  cancellationCasesWarned: fraction(cancellations.filter((r) => r.minilm.ambiguous).length, cancellations.length),
  limitation: 'The engine exposes ambiguous and conditional flags, not a semantic cancellation detector. These numbers describe caution on annotated cases, not cancellation accuracy.',
};
const findings = rows.filter((r) =>
  (r.expected.alignment === 'single' && r.minilm.candidates[0]?.beforeIndex !== r.expected.source_indexes[0])
  || (r.expected.alignment === 'none' && r.minilm.highlighted)
  || (r.expected.ambiguous && !r.minilm.ambiguous)
  || (r.expected.cancellation && !r.minilm.ambiguous)
).map((r) => ({ caseId: r.caseId, updateIndex: r.updateIndex, expected: r.expected, actual: r.minilm }));
const report = {
  version: 'cambio-retrieval-evaluation-portable-reproduction', completedAt: new Date().toISOString(), split: mode,
  frozenManifestSha256: await sha(MANIFEST_PATH), policy: RANKING_POLICY,
  cases: dataset.cases.length, updates: rows.length,
  minilm: minilmMetrics, jaccard: jaccardMetrics, diagnostics,
  timing: { loadFromLocalDiskMs: round(loadMs), caseTimings, limitation: 'Node CPU batch timings; not browser or human-use timings. No cold network download occurred.' },
  blockedFetchCalls,
  verifiedUnchanged: ['engine source', 'worker source', 'runner source', 'data files', 'q8 ONNX and tokenizer/config files'],
  materialFindings: findings,
  limitations: [
    '20 synthetic case pairs total; this report evaluates only its stated split. Labels are agent-authored, not a real-user study.',
    'Similarity is retrieval, not entailment, contradiction detection, correctness or permission to replace.',
    'The heldout author knows the labels; this is an implementer-reserved set, not an external blinded benchmark.',
    'Node CPU is not the deployed browser WASM backend. Quantized model and pooling are the same, but browser parity is untested here.',
    'Jaccard selection is a score-only diagnostic at fixed uncalibrated thresholds; ranking metrics are the cleaner baseline comparison.',
  ],
  rows,
};
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
const show = (f) => `${f.numerator}/${f.denominator}${f.value === null ? ' (N/A)' : ` (${(100 * f.value).toFixed(1)}%)`}`;
const tableRows = [
  ['Top-1, single target', 'singleTop1'], ['Recall@2, single target', 'singleRecallAt2'], ['Recall@3, single target', 'singleRecallAt3'],
  ['Selected / all updates', 'selectedFractionOfAll'], ['Selective alignment precision', 'selectiveAlignmentPrecision'],
  ['Strict unambiguous selection precision', 'strictUnambiguousSelectionPrecision'], ['Clear single-target coverage', 'clearSingleCoverage'],
  ['False association on no-target updates', 'falseAssociationOnNoTarget'], ['Alternatives not highlighted', 'alternativesNotHighlighted'], ['Multiple targets not highlighted', 'multipleNotHighlighted'],
];
const md = [
  `# CAMBIO evaluation: ${mode}`, '',
  `Completed: ${report.completedAt}. ${report.cases} synthetic list pairs, ${report.updates} update lines.`, '',
  `Frozen policy: minSimilarity=${RANKING_POLICY.minSimilarity}, minGap=${RANKING_POLICY.minGap}, topK=${RANKING_POLICY.candidates}, version=${RANKING_POLICY.version}. No threshold tuning was performed.`, '',
  'Node CPU inference used the cached q8 ONNX at the fixed model revision. The engine is the actual engine.mjs identified in the run manifest. Browser WASM behavior and latency are not certified by this run.', '',
  '| Metric | MiniLM + actual engine | Jaccard baseline |', '|---|---:|---:|',
  ...tableRows.map(([label, key]) => `| ${label} | ${show(minilmMetrics[key])} | ${show(jaccardMetrics[key])} |`), '',
  'Jaccard selection uses only the same numerical score/margin thresholds, without engine warning heuristics. Those score scales are not calibrated; compare ranking metrics primarily. Both always require human decisions in the product.', '',
  `Ambiguity warning recall: ${show(diagnostics.ambiguousWarningRecall)}. Warnings on non-ambiguous labels: ${show(diagnostics.warningsOnGoldNonAmbiguous)}. Cancellation cases receiving a caution flag: ${show(diagnostics.cancellationCasesWarned)}. This is not a cancellation classifier.`, '',
  `Material diagnostic rows: ${findings.length}. Full source lines, gold annotations, candidate scores and flags are in the JSON.`, '',
  ...findings.map((f) => `- ${f.caseId}, update index ${f.updateIndex}: gold ${f.expected.alignment} [${f.expected.source_indexes.join(', ')}], ambiguity=${f.expected.ambiguous}, cancellation=${f.expected.cancellation}; top=${f.actual.candidates[0]?.beforeIndex ?? 'none'}, score=${f.actual.candidates[0]?.score ?? 'none'}, flagged=${f.actual.ambiguous}. ${f.expected.note}`), '',
  `Local model load: ${report.timing.loadFromLocalDiskMs} ms. Network fetch attempts: ${blockedFetchCalls}. Input, engine and model hashes verified unchanged after the run.`, '',
  ...report.limitations.map((s) => `- ${s}`), '',
  'No user time-saving, production reliability, universal superiority or automatic edit accuracy is claimed.', '',
].join('\n');
await fs.writeFile(path.join(REPORT_ROOT, `cambio-eval-${mode}-results-reproduction.md`), md, { flag: 'wx' });
console.log(JSON.stringify({ reportPath, split: mode, minilm: minilmMetrics, jaccard: jaccardMetrics, diagnostics, materialFindings: findings.length }, null, 2));
