# CAMBIO evaluation: heldout

Completed: 2026-10-20T02:10:20.886Z. 10 synthetic list pairs, 30 update lines.

Frozen policy: minSimilarity=0.45, minGap=0.08, topK=3, version=2026-10-19-v2. No threshold tuning was performed.

Node CPU inference used the cached q8 ONNX at the fixed model revision. The engine is the actual engine.mjs identified in the run manifest. Browser WASM behavior and latency are not certified by this run.

| Metric | MiniLM + actual engine | Jaccard baseline |
|---|---:|---:|
| Top-1, single target | 18/21 (85.7%) | 19/21 (90.5%) |
| Recall@2, single target | 20/21 (95.2%) | 20/21 (95.2%) |
| Recall@3, single target | 20/21 (95.2%) | 21/21 (100.0%) |
| Selected / all updates | 18/30 (60.0%) | 10/30 (33.3%) |
| Selective alignment precision | 14/18 (77.8%) | 10/10 (100.0%) |
| Strict unambiguous selection precision | 11/18 (61.1%) | 8/10 (80.0%) |
| Clear single-target coverage | 11/16 (68.8%) | 8/16 (50.0%) |
| False association on no-target updates | 3/6 (50.0%) | 0/6 (0.0%) |
| Alternatives not highlighted | 2/2 (100.0%) | 2/2 (100.0%) |
| Multiple targets not highlighted | 1/1 (100.0%) | 1/1 (100.0%) |

Jaccard selection uses only the same numerical score/margin thresholds, without engine warning heuristics. Those score scales are not calibrated; compare ranking metrics primarily. Both always require human decisions in the product.

Ambiguity warning recall: 5/8 (62.5%). Warnings on non-ambiguous labels: 7/22 (31.8%). Cancellation cases receiving a caution flag: 4/4 (100.0%). This is not a cancellation classifier.

Material diagnostic rows: 9. Full source lines, gold annotations, candidate scores and flags are in the JSON.

- heldout-01, update index 0: gold single [1], ambiguity=false, cancellation=false; top=0, score=0.705022, flagged=true. Role is the target; the new destination duplicates a different role's old destination.
- heldout-02, update index 2: gold none [], ambiguity=false, cancellation=false; top=2, score=0.664261, flagged=false. A book announcement is not a replacement for the book-return instruction.
- heldout-06, update index 1: gold none [], ambiguity=false, cancellation=false; top=1, score=0.460183, flagged=false. New item does not replace camera merely because bring is shared.
- heldout-07, update index 1: gold single [2], ambiguity=false, cancellation=false; top=1, score=0.692267, flagged=false. Reverses the visitors' badge requirement, not a cancellation.
- heldout-07, update index 2: gold single [3], ambiguity=true, cancellation=false; top=3, score=0.728259, flagged=false. Only Desk A changes; original line governs every badge desk.
- heldout-08, update index 0: gold single [0], ambiguity=true, cancellation=false; top=0, score=0.969026, flagged=false. Both update lines target one original. Order is visible, but final resolution must be explicit.
- heldout-08, update index 1: gold single [0], ambiguity=true, cancellation=false; top=0, score=0.875712, flagged=false. A later correction must not silently overwrite a human decision on the earlier update.
- heldout-09, update index 0: gold single [0], ambiguity=true, cancellation=false; top=2, score=0.507363, flagged=true. Possible postponement is not an actual cancellation.
- heldout-10, update index 1: gold none [], ambiguity=false, cancellation=false; top=2, score=0.613717, flagged=false. Public park is not car parking; shared park and hall tokens are misleading.

Local model load: 128.6976 ms. Network fetch attempts: 0. Input, engine and model hashes verified unchanged after the run.

- 20 synthetic case pairs total; this report evaluates only its stated split. Labels are agent-authored, not a real-user study.
- Similarity is retrieval, not entailment, contradiction detection, correctness or permission to replace.
- The heldout author knows the labels; this is an implementer-reserved set, not an external blinded benchmark.
- Node CPU is not the deployed browser WASM backend. Quantized model and pooling are the same, but browser parity is untested here.
- Jaccard selection is a score-only diagnostic at fixed uncalibrated thresholds; ranking metrics are the cleaner baseline comparison.

No user time-saving, production reliability, universal superiority or automatic edit accuracy is claimed.
