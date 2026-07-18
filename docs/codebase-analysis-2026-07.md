# Codebase analysis and stackranked roadmap (July 2026)

A full-repo review of Agentify as of `main` after v0.1.1 (skill core and knowledge base, diagram engine and CLI, eval harness, CI, site, and distribution), with a stackranked proposal of the next features and improvements. The ranked list also lives in [ROADMAP.md](../ROADMAP.md); this document carries the evidence behind the ranking.

## Overall state

The codebase is in good shape. There are no TODO/FIXME markers anywhere; known debt is tracked in prose (ROADMAP, eval README limitations). The diagram engine has byte-exact golden tests plus twelve targeted test files, the knowledge base has disciplined per-source provenance, and the deliverable pipeline (`assemble`) gates every embedded diagram on the post-render check.

The gaps cluster in three places:

1. **The eval harness**, which guards the product's core differentiator (grounded reasoning), has a real grading bug and runs only 6 of its 13 cases in CI.
2. **CI holes** let several documented guarantees go unverified: link checks skip PRs, gallery examples are never validated, and the release zip is built and tested by hand.
3. **Roadmap features not yet built**: the three additional diagram views, the model-graded eval, and knowledge-base freshness automation.

## Findings

### Eval harness (guards the moat; currently the weakest link)

- **Bug: `mustNot` substring matching penalizes correct designs.** `eval/check.mjs` grades `mustNot` with a plain lowercase `includes()`. The section templates (`agentify/templates/section-templates.md`, decision record) require naming rejected alternatives, so a correct design that writes "we rejected a vector database" contains the substring `vector database` and fails the `recipe-app` over-engineering check. There are also no word boundaries: `mustNot: ["agent"]` (the `invoice-router` case) matches "management", "agentic", and even "Agentify".
- **Only 6 of 13 cases run in CI.** The cases without a committed `design` path (`invoice-router`, `meeting-notes`, `hr-policy-qa`, `sql-analytics-copilot`, `symptom-checker`, `insurance-photo-claims`, `lead-triage`) are only shape-validated by `--validate`; their expectations never execute. "13 golden cases" overstates the automated coverage.
- **Grading is purely lexical** (substring plus a `rung N` regex). CI never exercises the skill's reasoning end to end, and the clarification round (which questions get asked) is completely untested. The Step 7 self-check in SKILL.md is prose enforced only by the model; nothing mechanical asserts that the fourteen sections are present or that all seven decision trees were walked.

### CI and distribution (documented guarantees not verified)

- The lychee link check is gated `if: github.event_name == 'push'`, so it never runs on pull requests; a broken knowledge-base link is caught only after merge. Its scope also excludes `SKILL.md`, `docs/index.html`, `CONTRIBUTING.md`, `ROADMAP.md`, and `CHANGELOG.md`.
- Top-level `examples/` gallery documents are never validated in CI, although CONTRIBUTING tells contributors to run `agentify check` on them. A broken gallery example can merge green.
- **No release automation.** `scripts/build-zip.sh` is manual and not referenced by any workflow, yet the README and the site promise `agentify.zip` "from the latest release", and the changelog claims the distributable "passes `doctor` standalone". Neither claim is verified by CI.
- The six gallery cards in `docs/index.html` are hand-written hrefs that `build-site.mjs` does not validate; a renamed example produces a dead link no check catches. Committed PNG previews in `docs/assets/` are regenerated manually and can silently drift.
- `SOURCES.md` says dead links "open an issue, not a silent removal"; in reality the CI job just fails the build. The stated arXiv "pin the version consulted" policy is not implemented (the table records unversioned `abs/` URLs), the OWASP Agentic Top 10 item IDs are self-flagged "still to spot-check", and there is no scheduled staleness job (every source shares the single consulted date 2026-07-14).

### Engine and CLI (healthy, with papercuts)

- The three roadmap diagram views (orchestration topology, eval pipeline, cost breakdown) do not exist yet, but the component vocabulary (`eval-loop`, `guardrail`, `human-review`, `model-gateway` in `schemas/common.schema.json`) and the backing knowledge docs already do, so the lift is schema + renderer + example + registration.
- Computational geometry is duplicated between `renderers/shared/geometry.mjs` and `scripts/check-render-output.mjs` with different epsilons (1e-4 vs 1e-9), and text-width estimation is duplicated with different heuristics, so the renderer and the checker can disagree at the boundary.
- CLI papercuts: no `--version`; missing-argument errors dump the full usage block; `inspect` on a non-architecture type leaks an internal `--layout-json` error the user never typed; `demo` skips the post-render check that `assemble` enforces.
- `assemble`'s markdown subset has no fenced code blocks or blockquotes; `diff-doc.mjs` hardcodes this skill's metric vocabulary and ships its own styling and escaping instead of reusing the shared template.
- Residual `archify`/`tt-a1i` identifiers remain in 26 files (schema `$id`s and titles, `ARCHIFY:SVG_SLOT_*` sentinels, temp-dir prefixes).
- The sequence renderer requires a manual `y` on every message: the engine's biggest authoring burden.
- Test gaps: the `assemble`/`adr`/`diff` subcommands are untested through the bin dispatcher (their backing tools are tested directly); the asset scripts and `scripts/build-site.mjs` have no coverage.

### Docs and contributor experience

- The "Next" section of ROADMAP.md predated this analysis and did not reflect shipped work (`diff`, `adr`); the launch section's counts (12 docs, three examples) are historically accurate for v0.1.0 and were left as a record.
- No pull request template, no `ISSUE_TEMPLATE/config.yml`, and no feature-request template.
- Knowledge topic gaps that existing eval cases already lean on: text-to-SQL / structured-data querying (`sql-analytics-copilot`), dedicated human-in-the-loop approval patterns, fine-tuning mechanics beyond the RAG comparison, and compliance regimes.

## Stackranked roadmap

Ranked by leverage: first make the existing guarantees true (trust is the product), then deepen the eval that guards the reasoning, then expand capability, then polish.

### Tier 1: make the guarantees true (small effort, highest leverage)

1. **Fix the eval `mustNot` bug.** Word-boundary matching plus negation-context awareness (a marker inside a "rejected / instead of / not" clause should not fail the case), with unit tests for the grader. Until then the eval punishes the skill's mandated behavior.
2. **Seed the seven unseeded eval cases** with designs generated through the real pipeline (or explicitly label them manual-only in `cases.jsonl` and the eval README). Side effect: seven new gallery-quality examples.
3. **CI hardening bundle.** Run the link check on PRs and widen its scope; add a job running `agentify check` over `examples/*.html`; make `build-site.mjs` fail on dead gallery hrefs; align the `SOURCES.md` link-check claim with what CI actually does.
4. **Release automation.** A workflow that runs `build-zip.sh`, unzips and smoke-tests `doctor`/`check` standalone, and attaches `agentify.zip` to the GitHub release, so the documented install path cannot silently break.

### Tier 2: deepen the eval (protects the differentiator)

5. **Structural design-doc linter** (`agentify lint <design.md>`): mechanically assert the fourteen sections are present or "not applicable, with reason", the decision record covers all seven trees, every decision carries a citation, and rung and weight class are declared. Run it in CI over committed examples and let the skill run it in Step 7, converting the prose self-check into an enforced gate.
6. **Model-graded eval** (existing roadmap item): an LLM-judge pass over produced designs (decision quality, grounding, right-sizing) complementing the lexical checks, run nightly or on demand rather than per-PR. Include grading of the clarification round (were domain-harm and PII questions asked?), which is currently untested.

### Tier 3: capability expansion (the visible new features)

7. **New diagram views** (existing roadmap item): orchestration topology and eval pipeline first (node-and-edge shaped, vocabulary already in `common.schema.json`); cost breakdown last (needs a new schema shape). Each is schema + renderer + example + `TYPES` registration + goldens.
8. **Knowledge-base freshness automation** (existing roadmap item): a scheduled link check over `SOURCES.md` URLs plus a per-source staleness report (flag consulted dates older than a quarter); pin arXiv versions as the stated policy requires; resolve the self-flagged OWASP Agentic Top 10 ID spot-check.
9. **Fill knowledge topic gaps** the eval cases already lean on: text-to-SQL / structured-data querying and human-in-the-loop approval patterns first; then fine-tuning mechanics and compliance regimes.
10. **Sequence renderer auto-stacking:** derive message `y` positions automatically (with a manual override), removing the engine's biggest authoring burden without violating the no-auto-layout stance (ordering stays semantic; only spacing is computed).

### Tier 4: polish, code health, community

11. **CLI UX pass:** `--version`, targeted per-command error messages, fix the `inspect` alias error, make `demo` run the post-render check, add fenced-code-block support to `assemble`.
12. **Code health:** a single shared geometry and text-metrics module used by both renderers and checker; rename residual `archify`/`tt-a1i` identifiers; cover the doc subcommands in `cli.test.mjs`; generalize the `diff` metric detection and reuse the shared template and escaping.
13. **Contributor UX:** PR template, `ISSUE_TEMPLATE/config.yml`, feature-request template.
14. **Community example gallery with a submission workflow** (existing roadmap item), deliberately last: it depends on Tier 1's example validation in CI to be safe to open up.
