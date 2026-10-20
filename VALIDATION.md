# Validation record

Work began 19 October 2026 (America/Bogota), during the challenge entry window. The checks below distinguish automated tests, real browser behavior and model evaluation. They validate a working product, not submission or prize status.

## Build and automated checks

- `node --check app.mjs`: passed.
- `npm test`: **32 passed, 0 failed** on the local sources, then in Linux CI. This comprises 25 engine/worker-protocol tests and 7 application-flow tests. Worker-protocol tests use a simulated runtime; application-flow tests run the real app module against DOM/Worker doubles.
- [GitHub Actions run 39358087890](https://github.com/EazyHood/cambio/actions/runs/39358087890), commit `7c6cc8d7ccbefb56fd008700e9fe1332b1fd2da2`: `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, `npm run build`, artifact upload and GitHub Pages deployment all completed successfully on 19 October 2026, Colombia time.
- The lockfile contains 142 resolved packages from the official npm registry with integrity hashes. It matches the unchanged `package.json` used for that build.
- The local Windows dependency installation was stopped during slow HDD extraction. Local `node_modules` remained incomplete; no successful local production build is claimed. The production build above ran on Linux CI.

## Actual browser checks

The published [GitHub Pages demo](https://eazyhood.github.io/cambio/) was exercised in Edge after deployment. The saved screenshots and export are from that UI, not mockups.

- The built-in fictional repair-workshop example ran real model inference: MiniLM at revision `751bff37182d3f1213fa05d7196b954e230abad9`, q8 weights, WASM backend, with `model.executed: true` in the actual JSON download.
- Explicit decisions of **replace, replace, add, ignore** yielded the expected six lines. Exact original/update wording remained intact. The conditional extension-cable update displayed a warning and did not preselect a source.
- The downloaded JSON was inspected: inputs, all four decisions, six-line plan, model configuration and policy `2026-10-19-v2` agree with the reviewed flow. It records **3,222 ms**, including loading, for this one run; that is not an isolated inference benchmark or a cross-device performance claim.
- Review and result screens were checked at a **390 × 844 browser viewport**. The document's measured client width and scroll width were both 375 px, with no horizontal overflow. This was viewport testing, not a physical mobile-device test.
- No application console errors were observed in the checked published flow. Unrelated extension warnings were present.
- The desktop UI was also inspected at 1680 × 927. Reduced-motion rules were reviewed in the source; runtime reduced-motion preference emulation was **not** performed.

Earlier local-browser recovery checks also confirmed that a model-loading failure exposes manual review, edited inputs replace the failed request's snapshot, and explicit replacement/addition reaches a complete plan. The actual TXT and JSON downloads from that manual flow contained the expected six lines and correctly recorded `model.executed: false`. Those checks are separate from the real-inference public run above.

### Browser evidence

- [Landing view](evidence/cambio-live-landing.png), [desktop review](evidence/cambio-live-review.png) and [completed plan](evidence/cambio-live-complete.png).
- [Narrow-viewport review](evidence/cambio-mobile-review.png) and [completed plan](evidence/cambio-mobile-complete.png).
- [Actual JSON export](evidence/cambio-live-review.json). It contains the fictional example's complete inputs, never user credentials or private documents.

The evidence files were copied byte-for-byte from the original captures/download. Screenshots document the visible state; the JSON documents the recorded output. Neither substitutes for the executable source or a general usability study.

## Model evaluation

The [evaluation record](evaluation/README.md) includes frozen method details, synthetic labels, every prediction, failures and reproduction instructions. Real CPU inference was run on ten development pairs and ten implementer-reserved pairs, 30 updates in each split. The reserved split was run once after development findings were reviewed, with no subsequent engine or threshold tuning.

Among the 21 reserved updates labeled with one source target, MiniLM ranked the expected source first in **18/21**, compared with **19/21** for token-overlap Jaccard. It did not beat that baseline on reserved top-1 retrieval. The engine warned on **5/8** reserved ambiguous updates and missed the rest. These findings support mandatory review, not a general accuracy claim. The labels were AI-authored synthetic material, not independent human validation.

CPU evaluation is separate from the browser test. No full CPU/WASM parity test was run. A single successful browser example does not validate all evaluation cases in WASM.

## Limits of these checks

No user study, measured human time saving, general accuracy guarantee, full offline certification, physical-phone test, or runtime reduced-motion emulation is claimed. English is the only evaluated language. Conditional/cancellation checks are heuristics and can miss important distinctions. The product cannot establish source authority or safely resolve high-stakes instructions.
