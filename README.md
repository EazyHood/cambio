# Cambio

**Plans change. Catch up quietly.**

Cambio turns an original instruction list and a later update into a plan that a person has reviewed. An open-weight sentence model finds related lines in the browser. It never rewrites instructions, chooses which version is true, or applies a change.

Built from scratch on 19 October 2026 for the DEV Hacktoberfest Open-Source AI Challenge, Week 3: **Slow and Steady**. This repository and its public demo are the entry's product; prize eligibility is determined by the organizer.

## Try it

1. Choose **Try an example** for a fictional repair workshop, or enter two short English lists.
2. Choose **Find related instructions**. The model downloads on first use, then compares lines locally.
3. For each update, compare its source and choose **Replace**, **Add**, or **Ignore**. Replacing a line requires an explicit check. Uncertain matches do not select a source automatically.
4. Use **Previous update**, **Next update**, or **Undo last decision** to review your choices.
5. Save the final text plan or the JSON record containing both inputs, decisions, and model metadata.

No account, API key, subscription, or server-side inference. If matching fails, you can review without AI suggestions. Reloading discards unsaved inputs and decisions.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

The development and preview servers bind to `127.0.0.1`. The production build is static and uses relative asset URLs, so it can be hosted in a GitHub Pages subdirectory. A network connection is required to fetch model/runtime assets unless the browser has retained all necessary resources. Full offline operation is not promised.

## What the model does

`Xenova/all-MiniLM-L6-v2` is pinned to revision `751bff37182d3f1213fa05d7196b954e230abad9`, using q8 ONNX weights with mean pooling and normalized sentence vectors. Transformers.js 3.8.1 runs it in a module worker through WebAssembly, with one WASM thread.

Each update is compared with all original lines using cosine similarity. The UI presents up to three ranked candidates followed by all other originals. The review policy flags weak matches, a small gap between the top two results, duplicate updates, and some conditional/negative wording. These are conservative heuristics, not an entailment or contradiction model. The thresholds are versioned in `engine.mjs`.

No threshold ever authorizes a change. A score describes a relationship between two pieces of text, not the probability that an instruction is correct.

## A deliberately small contract

- At most 20 non-empty lines in each list; at most 300 Unicode characters per line.
- Lines are trimmed at the edges; internal wording is preserved. Repeated lines stay separate.
- Every decision is bound to the exact two input arrays, including their order.
- A source line cannot receive two replacements in the same plan.
- Replacement copies the exact update; addition appends it; ignoring leaves the original unchanged.
- Export remains unavailable until every update has a decision.
- JSON includes original text, update text, exact decisions, model revision, ranking policy and measured matching duration.

## Privacy and limits

Cambio sends no instruction text to an application server and has no analytics, login, or remote database. Model/runtime downloads and static hosting still expose ordinary connection metadata to their providers. Browser extensions and device-level software are outside this application's control. Inputs disable browser spellcheck and autocomplete; no instructions are written to local storage.

The JSON export includes **both full inputs**. Review it before sharing. This is a convenience tool for low-stakes plans, not a reliable resolver of legal, medical, financial, or emergency instructions. It cannot establish source authority, notice omitted context, reconcile multiple documents, or validate dates. English-only scope; no multilingual quality claim. Check conditions and cancellations yourself.

The evaluation fixtures are synthetic and were authored with AI assistance. Automated tests and a small held-out set cannot establish real-world accuracy or time saved. There is no user study and no claim of hours saved.

## Implementation

- `app.mjs`: accessible review flow, cancellation/retry, explicit decisions, downloads.
- `engine.mjs`: input limits, ranking policy, immutable source-bound decisions, plan assembly.
- `model-worker.mjs`: actual model loading, inference, progress, stale-request suppression.
- `index.html` / `styles.css`: responsive layout, system fonts, original SVG marks, reduced-motion support. Motion highlights the specific changed line.
- `engine.test.mjs`: engine invariants and worker protocol with a simulated runtime.
- `app-flow.test.mjs`: the real application module tested with small DOM/Worker doubles, including recovery regressions and exported content.
- `evaluate.mjs`: reproducible model-vs-token-overlap evaluation on explicit fixtures. This runs real model inference separately from unit tests.

The DOM doubles are not a substitute for browser testing. See `VALIDATION.md` for what was actually run and the limits of those checks.

## Provenance and license

Jhonatan del Rio Mejia directed the project; OpenAI Codex assisted with implementation, design, fixtures, tests, and documentation. No claim is made that this was written without AI assistance. The example describes fictional people and logistics.

Application code: MIT. Model: Apache-2.0. Third-party packages retain their own licenses. See `FUENTES.md` and `package-lock.json` for pinned sources and dependencies. No model weights are committed to this repository.
