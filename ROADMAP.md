# Roadmap

## v0.1.0 (launch)

- [x] Vendored, tested diagram engine (architecture, workflow, sequence, dataflow, lifecycle)
- [x] Knowledge base: 12 grounded reference documents plus decision trees and source provenance
- [x] Skill definition: enterprise architect persona, clarification loop, framework decision tree, production and interview modes
- [x] Agent-native diagram vocabulary (llm-router, retriever, vector-store, guardrail, eval-loop, tool, memory-state, queue, human-review, model-gateway)
- [x] Self-contained design document template with embedded diagrams
- [x] Three gallery examples: enterprise support agent, legal RAG document assistant, autonomous coding system (interview mode)
- [x] Dual-theme diagram previews in the README (PNG via headless Chrome, plus a standalone-SVG exporter)

## Next

- Run the skill against a wide set of unscripted prompts and tune the clarification loop from what it asks (and fails to ask)
- Knowledge base refresh automation: link checking plus a staleness report per source
- [x] Design diffing: compare two generated designs for the same use case (`agentify diff`)
- [x] Export to ADR (architecture decision record) format (`agentify adr`)
- Model-graded eval to complement the current substring and rung checks
- Additional diagram views: orchestration topology, eval pipeline, cost breakdown
- Community example gallery with a submission workflow

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
