# Evaluation: useful retrieval, unreliable authority

Cambio was evaluated on 20 newly authored synthetic English list pairs: ten development pairs (30 updates) and ten implementer-reserved pairs (30 updates). The labels were written by an AI agent before inference. They are not independent human validation or a real-user study. The reserved split was run once after the coordinator reviewed the development findings, with no threshold or engine changes afterward.

## Results

| Metric | Development: MiniLM | Development: Jaccard | Reserved: MiniLM | Reserved: Jaccard |
| --- | ---: | ---: | ---: | ---: |
| Top-1 among updates with one source target | 20/20 | 18/20 | 18/21 | 19/21 |
| Target present in the first two candidates | 20/20 | 19/20 | 20/21 | 20/21 |
| New updates incorrectly highlighted as matching a source | 2/7 | 0/7 | 3/6 | 0/6 |

**MiniLM did not beat the lexical baseline on reserved top-1 retrieval.** It suggested a camera instruction for “Bring a sketchbook” and a car-parking instruction for a public-park announcement. Similarity cannot decide whether something replaces an instruction, adds a new one or needs clarification.

The actual engine warned on 5/8 reserved ambiguous updates. It missed a partial-scope change (“Desk A” versus all badge desks) and two successive changes to one starting time. The separate plan engine rejects two replacements of the same original line; that structural protection is not semantic understanding. All decisions still require a person.

The “highlighted” metrics refer to the frozen engine's score/margin and warning gate, **not automatic edits**. Jaccard uses only the same numerical score and margin thresholds, without the engine's warning heuristics. The score scales were not calibrated. Ranking is the cleaner baseline comparison; selection numbers are diagnostics, not a fair confidence contest.

## Frozen method

- Model: `Xenova/all-MiniLM-L6-v2`, revision `751bff37182d3f1213fa05d7196b954e230abad9`.
- Runtime: Transformers.js `3.8.1`; q8 ONNX, mean pooling, normalized embeddings; Node CPU backend.
- Ranking policy: minimum similarity `0.45`, minimum top-two gap `0.08`, three candidates, engine policy `2026-10-19-v2`.
- Maximum input: 20 lines per list, 300 Unicode characters per line.
- Jaccard: lowercase Unicode letter/number/apostrophe token sets, keep numbers and negations, stable original-index tie break.
- No parameter grid, fitted threshold or accuracy guarantee. The original planning document suggested a grid and different initial thresholds; the coordinator fixed the policy before any reserved inference. This deviation is recorded in the manifest.
- A static review added cancellation word inflections before evaluation. Freeze v3 superseded v2 only because `package.json` gained an additional test script. Engine/worker hashes remained identical. Earlier interrupted attempts produced no reported inference results.
- Model files, datasets and evaluated code hashes were verified before and after each run. Remote model access and `fetch` were disabled; both original runs recorded zero network fetch attempts.

The CPU run does **not** validate browser/WASM parity, browser download time, browser offline behavior or human time savings. The small dataset cannot establish real-world error rates or general model superiority. Conditional/cancellation markers are caution heuristics, not classifiers of meaning.

## Evidence

- [Development report](cambio-eval-dev-results-v3.md) and [every prediction](cambio-eval-dev-results-v3.json).
- [Reserved report](cambio-eval-heldout-results-v3.md) and [every prediction](cambio-eval-heldout-results-v3.json).
- [Development labels](cambio-eval-dev.json) and [reserved labels](cambio-eval-heldout.json).
- [Sanitized original run manifest](run-manifest-v3-public.json). Only absolute machine paths were removed; original source/model/dataset hashes are preserved. Its original private manifest SHA-256 remains in the results. The archived original runner is preserved with the project's private provenance, not presented as the portable runner below.

## Reproduce without downloading during evaluation

Install this repository's locked dependencies. Obtain the model's `config.json`, `tokenizer.json`, `tokenizer_config.json` and `onnx/model_quantized.onnx` at the pinned revision, or reuse an existing cache. Keep the `onnx/` subdirectory. Source and license: [Hugging Face model repository](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/751bff37182d3f1213fa05d7196b954e230abad9), Apache-2.0. Do not copy weights into the application repository.

The q8 ONNX must have SHA-256 `afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1`. The evaluator checks this, the installed runtime version and frozen source/data hashes. It never downloads missing model files.

In PowerShell, set the existing model directory and run:

```powershell
$env:CAMBIO_EVAL_MODEL_DIR = 'E:/models/xenova-all-minilm-l6-v2'
node evaluate.mjs freeze
node evaluate.mjs dev
# Inspect development findings before running the reserved split.
node evaluate.mjs heldout
```

On macOS/Linux, use `export CAMBIO_EVAL_MODEL_DIR=/path/to/existing/model` before the same three commands. The path is an example, not a required drive.

Outputs default to `evaluation/reproduction/`, which is ignored by Git. `CAMBIO_EVAL_OUTPUT_DIR` may select another local output directory. A manifest and each split result are created exclusively; existing evidence is never silently replaced. The portable runner changes path configuration and output naming from the archived original v3 runner. It freezes its own identity and does not claim to reproduce the exact original runner hash. Latencies may differ substantially between cold and warm filesystem/native-library caches.

The portable runner was checked with `node --check`, a fresh freeze and a development-only reproduction. Its metrics, findings and all 30 development prediction rows matched the original report exactly. The reserved split was not rerun for this check.

Once a reserved split has been inspected, treat it as regression material for future implementations. Do not tune against it and continue calling it a fresh heldout test.
