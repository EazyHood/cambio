# CAMBIO evaluation: dev

Completed: 2026-10-20T02:09:13.231Z. 10 synthetic list pairs, 30 update lines.

Frozen policy: minSimilarity=0.45, minGap=0.08, topK=3, version=2026-10-19-v2. No threshold tuning was performed.

Node CPU inference used the cached q8 ONNX at the fixed model revision. The engine is the actual engine.mjs identified in the run manifest. Browser WASM behavior and latency are not certified by this run.

| Metric | MiniLM + actual engine | Jaccard baseline |
|---|---:|---:|
| Top-1, single target | 20/20 (100.0%) | 18/20 (90.0%) |
| Recall@2, single target | 20/20 (100.0%) | 19/20 (95.0%) |
| Recall@3, single target | 20/20 (100.0%) | 19/20 (95.0%) |
| Selected / all updates | 15/30 (50.0%) | 9/30 (30.0%) |
| Selective alignment precision | 13/15 (86.7%) | 9/9 (100.0%) |
| Strict unambiguous selection precision | 12/15 (80.0%) | 8/9 (88.9%) |
| Clear single-target coverage | 12/18 (66.7%) | 8/18 (44.4%) |
| False association on no-target updates | 2/7 (28.6%) | 0/7 (0.0%) |
| Alternatives not highlighted | 2/2 (100.0%) | 2/2 (100.0%) |
| Multiple targets not highlighted | 1/1 (100.0%) | 1/1 (100.0%) |

Jaccard selection uses only the same numerical score/margin thresholds, without engine warning heuristics. Those score scales are not calibrated; compare ranking metrics primarily. Both always require human decisions in the product.

Ambiguity warning recall: 4/5 (80.0%). Warnings on non-ambiguous labels: 11/25 (44.0%). Cancellation cases receiving a caution flag: 5/5 (100.0%). This is not a cancellation classifier.

Material diagnostic rows: 3. Full source lines, gold annotations, candidate scores and flags are in the JSON.

- dev-04, update index 1: gold single [3], ambiguity=true, cancellation=false; top=3, score=0.766976, flagged=false. Only participants change entrance; replacing the everyone instruction loses other roles.
- dev-06, update index 0: gold none [], ambiguity=false, cancellation=false; top=0, score=0.484404, flagged=false. Different object: bring syntax alone must not imply replacement.
- dev-06, update index 1: gold none [], ambiguity=false, cancellation=false; top=2, score=0.453432, flagged=false. New umbrella instruction does not replace bicycle storage.

Local model load: 36555.5892 ms. Network fetch attempts: 0. Input, engine and model hashes verified unchanged after the run.

- 20 synthetic case pairs total; this report evaluates only its stated split. Labels are agent-authored, not a real-user study.
- Similarity is retrieval, not entailment, contradiction detection, correctness or permission to replace.
- The heldout author knows the labels; this is an implementer-reserved set, not an external blinded benchmark.
- Node CPU is not the deployed browser WASM backend. Quantized model and pooling are the same, but browser parity is untested here.
- Jaccard selection is a score-only diagnostic at fixed uncalibrated thresholds; ranking metrics are the cleaner baseline comparison.

No user time-saving, production reliability, universal superiority or automatic edit accuracy is claimed.
