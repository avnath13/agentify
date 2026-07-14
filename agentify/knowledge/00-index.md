# Knowledge base index

This directory is the grounding layer for agentify. Every generated design consults these documents and cites them. This index tells the model which documents to read at which stage of the design loop.

## Consultation map

| Design stage | Consult |
|---|---|
| Clarify (question selection) | genai-sysdesign-loop.md, enterprise-architecture.md (NFR checklist) |
| Decide (pattern selection) | decision-trees.md first, then building-effective-agents.md, agentic-design-patterns.md |
| Design: retrieval and data | rag-patterns.md |
| Design: orchestration | building-effective-agents.md, multi-agent-orchestration.md |
| Design: state and memory | context-memory.md |
| Design: security and identity | security-governance.md |
| Design: voice, image, or other non-text modality | voice-and-multimodal.md |
| Design: evaluation plan | evaluation.md |
| Design: observability and tools | interoperability-observability.md |
| Design: model and platform primitives (tool use, structured outputs, thinking, caching, SDKs) | model-platform-primitives.md |
| Design: NFRs, scaling, cost, DR | enterprise-architecture.md, latency-cost-reliability.md |
| Final gate before emitting | decision-trees.md (gate checklist) |

## Document inventory

- decision-trees.md: the synthesis. Executable decision procedures (7 trees plus the gate checklist). Always walked, in order.
- building-effective-agents.md: workflows vs agents, the five workflow patterns, the escalation ladder, cognitive architecture (model/tools/orchestration).
- agentic-design-patterns.md: reflection, tool use, planning, multi-agent collaboration; composition and cost implications.
- genai-sysdesign-loop.md: the ten-step customer-facing GenAI design procedure; discovery questions; strong vs weak answers per step (powers interview mode).
- enterprise-architecture.md: NFR checklist with numbers, component justification discipline, multi-tenancy, capacity math, DR, cost governance.
- rag-patterns.md: naive/advanced/modular/agentic RAG, retrieval design choices, permission-aware retrieval, RAG vs fine-tuning vs long context.
- multi-agent-orchestration.md: topologies, communication, coordination failure modes, token economics, when multi-agent wins and loses.
- evaluation.md: eval-driven development, golden datasets, LLM-as-judge with bias mitigations, agent-specific evals, rollout gates.
- security-governance.md: threat model, layered guardrails, identity propagation, autonomy tiers, audit, OWASP and NIST mappings.
- interoperability-observability.md: MCP, tool interface quality, OpenTelemetry GenAI tracing, debugging from traces.
- model-platform-primitives.md: the provider API surface designs sit on: tool-use loop, parallel calls and tool_choice, structured outputs, extended thinking, prompt caching, agent SDKs (OpenAI/Google ADK/smolagents), and safety classifiers (Llama Guard).
- voice-and-multimodal.md: cascaded vs speech-to-speech voice, the conversational latency budget, turn-taking (VAD, endpointing, barge-in), multimodal input and RAG, visual hallucination, audio-native evaluation.
- context-memory.md: context budgeting, compaction, memory tiers, persistence, retention and tenant isolation.
- latency-cost-reliability.md: streaming, caching tiers, model routing, fallbacks, SLO design, tail latency in chains.
- SOURCES.md: provenance for every external source with retrieval dates and the update policy.

## Rules of use

1. Cite the knowledge document (and through it, the primary source) for every architectural decision.
2. When the knowledge base is silent or possibly stale on a point (model choices, pricing, tool landscape), supplement with live web search and mark the claim "live-sourced" with the date.
3. Never invent a citation. If neither the knowledge base nor a live source supports a claim, present it as an assumption to validate.
