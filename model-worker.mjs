import { env, pipeline } from '@huggingface/transformers';
import { rankMatches, validateSources } from './engine.mjs';

export const MODEL = Object.freeze({
  id: 'Xenova/all-MiniLM-L6-v2',
  revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  dtype: 'q8',
  device: 'wasm',
  pooling: 'mean',
  normalize: true,
  license: 'Apache-2.0',
});

// Only public model assets are fetched. Instruction text is passed to local WASM.
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
// CPU WASM works without cross-origin isolation and keeps inference off the UI thread.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

let extractorPromise = null;
let requestVersion = 0;
let queue = Promise.resolve();

function send(version, message) {
  if (version === requestVersion) self.postMessage(message);
}

function status(version, id, phase, detail) {
  send(version, { id, type: 'status', phase, ...(detail ? { detail } : {}) });
}

async function extractor(version, id) {
  if (!extractorPromise) {
    status(version, id, 'loading', 'Downloading the public model for local matching.');
    extractorPromise = pipeline('feature-extraction', MODEL.id, {
      revision: MODEL.revision,
      dtype: MODEL.dtype,
      device: MODEL.device,
      progress_callback: (event) => {
        const progress = {};
        for (const key of ['status', 'file', 'progress', 'loaded', 'total']) {
          if (typeof event[key] === 'string' || Number.isFinite(event[key])) progress[key] = event[key];
        }
        send(version, { id, type: 'progress', ...progress });
      },
    }).catch((error) => {
      extractorPromise = null;
      throw error;
    });
  }
  const instance = await extractorPromise;
  status(version, id, 'ready', 'Model ready. Matching runs on this device.');
  return instance;
}

async function run(version, message) {
  const { id, before, updates } = message;
  if (version !== requestVersion) return;
  const started = performance.now();
  try {
    // With no source candidates there is nothing to embed or download.
    if (updates.length === 0 || before.length === 0) {
      send(version, {
        id,
        type: 'result',
        rankings: updates.map((line, updateIndex) => ({
          updateIndex,
          candidates: [],
          ambiguous: true,
          conditional: /\b(if|unless|until|except|provided that|only when|only after|when|whenever)\b/i.test(line),
        })),
        elapsedMs: performance.now() - started,
        model: { ...MODEL, executed: false },
      });
      return;
    }
    const instance = await extractor(version, id);
    if (version !== requestVersion) return;
    status(version, id, 'inferring', 'Ranking source candidates. No changes are applied.');
    const output = await instance([...before, ...updates], { pooling: MODEL.pooling, normalize: MODEL.normalize });
    if (version !== requestVersion) return;
    const rows = output.tolist();
    const rankings = rankMatches(before, updates, {
      before: rows.slice(0, before.length),
      updates: rows.slice(before.length),
    });
    send(version, {
      id,
      type: 'result',
      rankings,
      elapsedMs: performance.now() - started,
      model: { ...MODEL, executed: true },
    });
  } catch (error) {
    // A failed load or inference can be retried with a fresh pipeline.
    extractorPromise = null;
    send(version, {
      id,
      type: 'error',
      code: error?.code || 'MODEL_UNAVAILABLE',
      message: error?.code ? error.message : 'Local matching could not finish. Retry, or review the lines manually.',
      recoverable: true,
    });
  }
}

self.addEventListener('message', ({ data }) => {
  if (!data || (data.type !== 'match' && data.type !== 'cancel')) return;
  if (!((typeof data.id === 'string' && data.id.length > 0)
    || (typeof data.id === 'number' && Number.isFinite(data.id)))) return;
  const version = ++requestVersion;
  if (data.type === 'cancel') {
    status(version, data.id, 'cancelled', 'Matching cancelled. You can continue reviewing manually.');
    return;
  }
  try {
    validateSources(data.before, data.updates);
  } catch (error) {
    send(version, { id: data.id, type: 'error', code: error.code, message: error.message, recoverable: true });
    return;
  }
  // Clone the accepted request and serialize model work; only the latest request can reply.
  const accepted = { id: data.id, before: [...data.before], updates: [...data.updates] };
  status(version, data.id, 'queued');
  queue = queue.catch(() => {}).then(() => run(version, accepted));
});
