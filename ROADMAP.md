# Roadmap

## v0.1.0 (launch)

- [x] Vendored, tested diagram engine (architecture, workflow, sequence, dataflow, lifecycle)
- [x] Knowledge base: 12 grounded reference documents plus decision trees and source provenance
- [x] Skill definition: enterprise architect persona, clarification loop, framework decision tree, production and interview modes
- [x] Agent-native diagram vocabulary (llm-router, retriever, vector-store, guardrail, eval-loop, tool, memory-state, queue, human-review, model-gateway)
- [x] Self-contained design document template with embedded diagrams
- [x] Three gallery examples: enterprise support agent, legal RAG document assistant, autonomous coding system (interview mode)
- [x] Dual-theme diagram previews in the README (PNG via headless Chrome, plus a standalone-SVG exporter)

## Shipped since launch

- [x] `agentify assemble`: the design document deliverable as a real tool, with every embedded diagram gated on the post-render check
- [x] Design diffing: compare two generated designs for the same use case (`agentify diff`)
- [x] Export to ADR (architecture decision record) format (`agentify adr`)
- [x] Domain-harm discovery and right-sizing (lightweight vs enterprise designs)
- [x] Voice and multimodal knowledge doc plus `asr`/`tts` diagram components
- [x] Knowledge base grown to 14 grounded documents (platform primitives, named retrieval techniques, agent benchmarks, injection defenses)
- [x] Gallery grown to six design documents, all generated through the real render-then-assemble pipeline

## Next

Stackranked by leverage; the evidence behind the ranking is in [docs/codebase-analysis-2026-07.md](docs/codebase-analysis-2026-07.md).

### Tier 1: make the guarantees true

- Fix the eval `mustNot` grading bug (word boundaries plus negation context; today a design that correctly names a rejected alternative can fail the over-engineering check)
- Seed the seven eval cases that have no committed design, so CI regression-guards all 13 cases instead of 6
- CI hardening: link check on PRs with wider scope, `agentify check` over `examples/`, dead-gallery-link detection in the site build
- Release automation: build `agentify.zip` in CI, smoke-test it standalone (`doctor`), attach it to releases

### Tier 2: deepen the eval

- `agentify lint`: a structural linter for produced designs (all sections present or N/A-with-reason, all seven trees covered, citations per decision), run in CI and in the skill's self-check step
- Model-graded eval to complement the current substring and rung checks, including grading of the clarification round (what the skill asks, and fails to ask)

### Tier 3: capability expansion

- Additional diagram views: orchestration topology, eval pipeline, cost breakdown
- Knowledge base refresh automation: scheduled link checking plus a staleness report per source; pin arXiv versions as the sources policy states
- New knowledge docs the eval cases already lean on: text-to-SQL / structured-data querying, human-in-the-loop approval patterns; then fine-tuning mechanics and compliance regimes
- Sequence renderer auto-stacking: computed message spacing (ordering stays semantic), removing the manual `y` authoring burden

### Tier 4: polish and community

- CLI UX: `--version`, targeted error messages, `inspect` on all types, `demo` runs the post-render check, fenced code blocks in `assemble`
- Code health: one shared geometry and text-metrics module for renderers and checker; retire residual `archify` identifiers; cover the doc subcommands through the CLI dispatcher
- Contributor UX: PR template, issue chooser config, feature-request template
- Community example gallery with a submission workflow (after `examples/` validation lands in CI)

## Not planned

Recording declined ideas so contributors find the rationale rather than reopening them.

| Idea | Why not |
|---|---|
| **A hosted service or web app** | Agentify generates a self-contained file you own. A backend adds an account, a data-retention surface, and an attack surface for zero gain over "run the skill, get an HTML file." |
| **Running the systems it designs** | Agentify is a design tool, not an agent runtime or orchestration framework. It tells you what to build and why; building and running it is a separate job with mature tools already. |
| **Auto-layout for diagrams** | Inherited from the engine's design: the semantic placement (a guardrail bracketing the model, the identity boundary around the agent) is the value. Auto-layout flattens that into a generic grid. |
| **A diagram editor UI** | Positioning is generator plus viewer, not editor. Edit the JSON IR and re-render; the renderers are deterministic. |
| **Replacing security, legal, or compliance review** | A generated design grounds decisions and flags risks; it does not sign off on them. A human owns the final call, and the design says so. |
| **Baking in model names and prices** | These go stale in weeks. They are pulled live at generation time and dated, never committed to the knowledge base. |
| **A giant "do everything" prompt instead of the knowledge base** | The bundled, cited knowledge base is the moat and the auditability. Folding it into one prompt loses the provenance and the ability to review and extend sources independently. |
