/** Pure review logic. Similarity ranks sources; only explicit decisions change a plan. */
export const LIMITS = Object.freeze({ lines: 20, charactersPerLine: 300 });
export const RANKING_POLICY = Object.freeze({
  minSimilarity: 0.45,
  minGap: 0.08,
  candidates: 3,
  version: '2026-10-19-v2',
});

export class CambioError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CambioError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CambioError(code, message);
}

/** Ignore blank lines, trim their edges, and keep internal text and duplicates. */
export function parseLines(text) {
  if (typeof text !== 'string') fail('INVALID_INPUT', 'Enter instructions as text.');
  const lines = text.split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
  validateLines(lines, 'List');
  return lines;
}

function validateLines(lines, label) {
  if (!Array.isArray(lines)) fail('INVALID_INPUT', `${label} must be an array of lines.`);
  if (lines.length > LIMITS.lines) {
    fail('INPUT_LIMIT', `${label} can contain at most ${LIMITS.lines} instructions.`);
  }
  lines.forEach((line, index) => {
    if (typeof line !== 'string' || !line.trim() || /[\r\n]/.test(line)) {
      fail('INVALID_INPUT', `${label}, line ${index + 1}: enter one non-empty instruction.`);
    }
    if (Array.from(line).length > LIMITS.charactersPerLine) {
      fail('INPUT_LIMIT', `${label}, line ${index + 1}: use at most ${LIMITS.charactersPerLine} characters.`);
    }
  });
}

export function validateSources(before, updates) {
  validateLines(before, 'Current list');
  validateLines(updates, 'Updates');
}

/** Exact binding, not a probabilistic hash. Do not persist it outside the review. */
export function sourceKey(before, updates) {
  validateSources(before, updates);
  return JSON.stringify([before, updates]);
}

const normalized = (line) => line.trim().toLowerCase().replace(/\s+/g, ' ');
const conditionalLanguage = (line) => /\b(if|unless|until|except|provided that|only when|only after|when|whenever)\b/i.test(line);
const negativeLanguage = (line) => /\b(no|not|never|without|avoid|prohibit|prohibited|disable|disabled|stop|cancel|cancelled|canceled|cancellations?|cannot|can't|don't|doesn't|isn't|aren't|mustn't|shouldn't|won't)\b/i.test(line.replace(/[’‘]/g, "'"));

function checkedVectors(vectors, beforeCount, updateCount) {
  if (!vectors || !Array.isArray(vectors.before) || !Array.isArray(vectors.updates)
    || vectors.before.length !== beforeCount || vectors.updates.length !== updateCount) {
    fail('INVALID_VECTOR', 'The model result does not match these source lists.');
  }
  let dimension;
  const check = (vector) => {
    if (!(Array.isArray(vector) || ArrayBuffer.isView(vector))
      || typeof vector.length !== 'number' || vector.length === 0) {
      fail('INVALID_VECTOR', 'The model returned an empty or invalid vector.');
    }
    dimension ??= vector.length;
    if (vector.length !== dimension) fail('INVALID_VECTOR', 'Model vector dimensions do not match.');
    let norm = 0;
    for (const value of vector) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail('INVALID_VECTOR', 'The model returned a non-finite vector.');
      }
      norm += value * value;
    }
    if (!Number.isFinite(norm) || norm <= 0) {
      fail('INVALID_VECTOR', 'The model returned a vector with no usable direction.');
    }
    return { values: vector, norm: Math.sqrt(norm) };
  };
  return { before: vectors.before.map(check), updates: vectors.updates.map(check) };
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.values.length; i += 1) dot += a.values[i] * b.values[i];
  return Math.max(-1, Math.min(1, dot / (a.norm * b.norm)));
}

/** Vectors correspond one-for-one to each list. Scores are similarities, not confidence. */
export function rankMatches(before, updates, vectors) {
  validateSources(before, updates);
  const checked = checkedVectors(vectors, before.length, updates.length);
  const duplicateUpdates = updates.map((line) => updates.filter((item) => normalized(item) === normalized(line)).length > 1);
  return updates.map((update, updateIndex) => {
    const allCandidates = before.map((_, beforeIndex) => ({
      beforeIndex,
      score: cosine(checked.updates[updateIndex], checked.before[beforeIndex]),
    })).sort((a, b) => b.score - a.score || a.beforeIndex - b.beforeIndex);
    const first = allCandidates[0];
    const second = allCandidates[1];
    const conditional = conditionalLanguage(update)
      || Boolean(first && conditionalLanguage(before[first.beforeIndex]));
    const polarityMismatch = Boolean(first)
      && negativeLanguage(update) !== negativeLanguage(before[first.beforeIndex]);
    const ambiguous = !first
      || first.score < RANKING_POLICY.minSimilarity
      || Boolean(second && first.score - second.score < RANKING_POLICY.minGap)
      || duplicateUpdates[updateIndex]
      || conditional
      || polarityMismatch;
    return {
      updateIndex,
      candidates: allCandidates.slice(0, RANKING_POLICY.candidates),
      ambiguous,
      conditional,
    };
  });
}

const ACTIONS = new Set(['replace', 'add', 'ignore', 'pending']);

function validateDecision(before, updates, decision) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    fail('INVALID_DECISION', 'Each update needs a review decision.');
  }
  if (!Number.isInteger(decision.updateIndex) || decision.updateIndex < 0
    || decision.updateIndex >= updates.length || !ACTIONS.has(decision.action)) {
    fail('INVALID_DECISION', 'A review decision has an invalid update or action.');
  }
  if (decision.action === 'replace') {
    if (!Number.isInteger(decision.beforeIndex) || decision.beforeIndex < 0
      || decision.beforeIndex >= before.length) {
      fail('INVALID_DECISION', 'Choose an existing instruction to replace.');
    }
  } else if (decision.beforeIndex !== undefined) {
    fail('INVALID_DECISION', 'Only a replacement can target an existing instruction.');
  }
}

/** Call when a person chooses an action, or to initialize an explicit pending row. */
export function makeDecision(before, updates, decision) {
  const key = sourceKey(before, updates);
  validateDecision(before, updates, decision);
  return Object.freeze({
    updateIndex: decision.updateIndex,
    action: decision.action,
    ...(decision.action === 'replace' ? { beforeIndex: decision.beforeIndex } : {}),
    sourceKey: key,
  });
}

/** Exportable lines exist only after every update has an explicit, current decision. */
export function buildPlan(before, updates, decisions) {
  const key = sourceKey(before, updates);
  if (!Array.isArray(decisions) || decisions.length !== updates.length) {
    fail('INCOMPLETE_DECISIONS', 'Every update must have exactly one review decision.');
  }
  const byUpdate = new Map();
  const targets = new Set();
  decisions.forEach((decision) => {
    validateDecision(before, updates, decision);
    if (decision.sourceKey !== key) {
      fail('STALE_DECISION', 'The source lists changed. Review these updates again.');
    }
    if (byUpdate.has(decision.updateIndex)) {
      fail('DUPLICATE_DECISION', 'An update has more than one review decision.');
    }
    byUpdate.set(decision.updateIndex, decision);
    if (decision.action === 'replace') {
      if (targets.has(decision.beforeIndex)) {
        fail('TARGET_CONFLICT', 'Two updates cannot replace the same instruction. Choose one, add separately, or ignore.');
      }
      targets.add(decision.beforeIndex);
    }
  });
  const previewLines = [...before];
  const additions = [];
  const pending = [];
  const changes = updates.map((update, updateIndex) => {
    const decision = byUpdate.get(updateIndex);
    if (!decision) fail('INCOMPLETE_DECISIONS', 'An update has not been reviewed.');
    if (decision.action === 'replace') previewLines[decision.beforeIndex] = update;
    if (decision.action === 'add') additions.push(update);
    if (decision.action === 'pending') pending.push(updateIndex);
    return {
      updateIndex,
      action: decision.action,
      update,
      ...(decision.action === 'replace' ? {
        beforeIndex: decision.beforeIndex,
        previous: before[decision.beforeIndex],
      } : {}),
    };
  });
  previewLines.push(...additions);
  const complete = pending.length === 0;
  return {
    complete,
    lines: complete ? [...previewLines] : null,
    previewLines,
    changes,
    pending,
  };
}
