# Agentify

**Design production-grade agentic AI systems from a plain-English use case.**

Agentify is an agent skill that works like a seasoned AI solutions architect. Describe what you want to build ("an AI support agent for our customer portal", "a document assistant for our law firm"), answer a short round of clarifying questions, and receive a detailed, defensible system design document: requirements and NFRs, an explicit decision record, a justified component architecture, security and evaluation plans, cost math, a rollout plan, and interactive architecture diagrams embedded inline. Every architectural decision cites an authoritative source.

The output is a single self-contained HTML file with a dark/light theme toggle, a navigable table of contents, and embedded SVG diagrams. No dependencies, no network calls, shareable anywhere.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/support-agent-architecture-dark.png">
  <img alt="Architecture diagram for an enterprise support agent, showing input and output guardrails, an intent router, an agent tool loop inside a user-identity boundary, permission-aware retrieval, a vector index, session memory, ticket tools, a human review gate, and an eval and observability path" src="docs/assets/support-agent-architecture-light.png" width="100%">
</picture>

<sub>A generated architecture, drawn with agent-native components: guardrails, an intent router, the agent runtime boundary where the user identity is propagated, permission-aware retrieval, tools as an MCP server, a human-review gate, and the eval and observability loop. This is one figure from the <a href="examples/enterprise-support-agent.design.html">support agent design document</a>.</sub>

## Why

Asking an LLM to "design an agentic system" produces plausible-sounding but ungrounded output: components with no justification, agents where a workflow would do, security as an afterthought. Agentify forces the design through the published engineering canon instead:

- The **escalation ladder**: deterministic code, then a single augmented LLM call, then workflow patterns, then an agent, then multi-agent. Every climb needs written justification, and the design must say when a simpler rung wins.
- **Decision trees** for the choices that matter: do you need generative AI at all, RAG vs fine-tuning vs long context, single vs multi-agent topology, autonomy tiers with enforcement gates, memory tiers.
- An **enterprise bar**: every component carries the requirement it serves, its scaling model, its failure mode and fallback, and a concrete technology example. NFRs are numbers, not adjectives. Cost math is shown, including the 10x scenario.

## What grounds it

Agentify ships with a versioned knowledge base (in [`agentify/knowledge/`](agentify/knowledge/)) distilled from primary sources, cited inline in every design:

| Category | Sources |
|---|---|
| Agent design | Anthropic (Building Effective Agents, context engineering, multi-agent research system), OpenAI (A Practical Guide to Building Agents), Google/Kaggle Agents whitepaper, Andrew Ng's agentic patterns |
| System design | The customer-facing GenAI design loop (Selamy), Chip Huyen's AI Engineering, the a16z LLM application stack |
| Enterprise architecture | AWS Well-Architected Generative AI Lens, Azure WAF AI workloads, Google Cloud Architecture Framework |
| Research | Seven arXiv surveys covering RAG, agentic RAG, multi-agent collaboration and orchestration, LLM-as-judge, and the tau-bench reliability benchmark |
| Standards | OWASP Top 10 for LLM Applications (2025) and for Agentic Applications (2026), NIST AI RMF and its GenAI Profile, the Model Context Protocol, OpenTelemetry GenAI semantic conventions |
| Evaluation | RAGAS, the TruLens RAG Triad, eval-driven development practice |

Facts that go stale (model choices, pricing) are never baked in: designs pull them live at generation time and stamp them with the retrieval date. Provenance for every source lives in [`SOURCES.md`](agentify/knowledge/SOURCES.md).

## Two modes

- **Production mode** (default): the design your team should build. Concrete, opinionated, buildable.
- **Interview mode**: the same rigor framed as a system design interview answer. Each section adds what a strong candidate says, what interviewers probe next, and the tradeoffs to voice out loud. Useful for preparing for GenAI system design loops.

## Quick start

### Install

```bash
npx skills add avnath13/agentify -g
```

Or download `agentify.zip` from the releases page and add it to Claude, Codex CLI, or opencode as a skill.

### Use

Say what you want to design:

> Design an AI agent that triages our inbound sales leads: reads the inquiry, enriches it from our CRM, scores it, and drafts a response for rep approval. About 300 leads/day.

Agentify will ask only the questions whose answers change the design (data permissions, latency and cost targets, autonomy limits, compliance), walk its decision trees, and produce `<use-case>.design.html`.

For interview practice:

> In interview mode: design a customer-facing RAG assistant for a bank.

## Example gallery

Three complete generated designs are committed in [`examples/`](examples/); open any in a browser, each is fully self-contained:

- [**Enterprise support agent**](examples/enterprise-support-agent.design.html) for a B2B SaaS company. A single tool-using agent behind an intent router, permission-aware RAG, autonomy tiers 0 to 1 with human escalation, and the full cost and latency math.
- [**Legal document assistant**](examples/rag-document-assistant.design.html) for a 900-lawyer firm. Deliberately not an agent: a routed retrieval workflow where daily-changing ethical walls make permission-aware retrieval the crux. Shows the anti-escalation rule rejecting an agent on the record.
- [**Autonomous coding system**](examples/multi-agent-coding-system.design.html), in interview mode. A bounded agent per ticket with a reflection loop, sandboxed with no merge or deploy access, and an explicit single vs multi-agent economics argument. Each section carries interview coaching notes.

Each design embeds diagrams drawn with the agent-native vocabulary: a component architecture plus a request sequence or a ticket lifecycle state machine.

## What a design contains

Fourteen sections, each with a defined pass bar: executive summary, requirements and NFRs, decision record (with rejected alternatives), system architecture, data and retrieval, tools and integrations, state and memory, security and guardrails, evaluation plan, observability, scale and cost analysis, failure modes and degradation, rollout plan, references.

Plus embedded diagrams rendered by the bundled engine: architecture (with agent-native component types like `agent`, `llm-router`, `retriever`, `vector-store`, `guardrail`, `eval-loop`, `human-review`, `model-gateway`), request sequence, data flow, and orchestration workflow. Diagrams support dark/light themes and export to PNG, JPEG, WebP, and SVG.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/support-agent-query-dark.png">
  <img alt="Sequence diagram of a support agent query: the customer question passes an input guardrail, an intent router, then the agent runs retrieval under the user identity, looks up subscription data, creates a ticket, and an output guardrail checks groundedness before the reply returns" src="docs/assets/support-agent-query-light.png" width="100%">
</picture>

<sub>The request sequence for a single turn, from the same design document. Retrieval and tools run under the caller identity, and the output guardrail checks groundedness before the reply is returned.</sub>

## How it works

1. **Intake and clarify.** The skill reads your use case and asks only the missing questions that would change the design, drawn from a discovery checklist (business context, data and permissions, autonomy and risk, load, latency, availability, cost, compliance).
2. **Decide.** It walks seven decision trees synthesized from the knowledge base, recording the answer, the reasoning, and the citation at every gate, including the alternatives it rejected.
3. **Design.** It writes the document section by section against the enterprise bar, doing the capacity and cost math with live-sourced pricing.
4. **Diagram and render.** It emits diagram JSON, validates it against bundled schemas, renders self-contained SVG/HTML, runs post-render quality checks, and assembles everything into one document.
5. **Self-check.** A final gate checklist rejects the design if any escalation is unjustified, any component is unexplained, or any claim is uncited.

## Repository layout

```
agentify/            the installable skill
  SKILL.md           persona, loop, and rules
  knowledge/         the grounded knowledge base (14 documents + provenance)
  schemas/           diagram JSON schemas (with agent-native component types)
  renderers/         deterministic JSON-to-SVG/HTML renderers
  templates/         design document shell + per-section requirements
  bin/agentify.mjs   CLI: render / validate / check / examples / doctor
examples/            generated design documents (the gallery) + diagram sources
scripts/             build and release tooling
```

## CLI

The bundled renderer also works standalone:

```bash
cd agentify
node bin/agentify.mjs render architecture my-system.architecture.json out.html
node bin/agentify.mjs validate architecture my-system.architecture.json
node bin/agentify.mjs check out.html
node bin/agentify.mjs doctor
```

## Contributing

The knowledge base is the heart of this project and has a defined bar for sources (vendor engineering guides, peer-reviewed surveys, standards bodies, cloud well-architected frameworks, university courses). See [CONTRIBUTING.md](CONTRIBUTING.md) for the three contribution surfaces (knowledge, engine, examples) and the style rules, and use the "Knowledge source proposal" issue template to suggest sources.

## Credits

The diagram engine is a fork of [Archify](https://github.com/tt-a1i/archify) by tt-a1i (MIT), itself based on Cocoon AI's architecture-diagram-generator. Agentify vendors and extends that engine with agent-native component types; the deterministic renderer design, schema validation approach, and self-contained HTML output are Archify's work, and this project would not exist without it. The knowledge base stands on the published work of the teams and authors listed in [`SOURCES.md`](agentify/knowledge/SOURCES.md).

## License

MIT. See [LICENSE](LICENSE) for the full attribution chain.
