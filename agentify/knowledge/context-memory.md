# Context and memory: budgeting the window, tiering the state

This document governs how generated designs manage the context window and agent state. It treats context as a scarce, budgeted resource; sets the engineering practices that keep it lean (system prompt altitude, minimal toolsets, curated examples, just-in-time retrieval); defines the memory tiers from in-window conversation state through compaction to persistent stores; specifies state persistence for long-running agents; and states the privacy and retention obligations that memory creates in multi-tenant enterprise systems. Memory tier selection is Tree 7 in [knowledge/decision-trees.md]; this document supplies the detail behind each branch.

## Principles

### Context is a finite resource with diminishing returns

- LLMs have a limited attention budget, and studies of context rot show accuracy degrades as context length grows: more tokens means reduced precision for retrieval within the window and for long-range reasoning, a gradient of degradation rather than a hard cliff [Anthropic, Context Engineering].
- The architectural cause is the transformer's n-squared pairwise attention: every added token dilutes attention over all others [Anthropic, Context Engineering].
- Design consequence: context must be treated as a finite resource with diminishing marginal returns. The guiding heuristic is the smallest possible set of high-signal tokens that maximizes the likelihood of the desired outcome [Anthropic, Context Engineering].
- A 200k window is a budget to allocate across system prompt, tool definitions, examples, retrieved data, and history, not free storage. Designs should state the intended allocation, and long-context stuffing must be justified against a retrieval alternative, not assumed superior [knowledge/rag-patterns.md].

### System prompt altitude

System prompts fail at two extremes [Anthropic, Context Engineering]:

- Too low: hardcoded if-else logic that is brittle, unmaintainable, and breaks on novel inputs.
- Too high: vague high-level guidance that gives no concrete behavioral signal and falsely assumes shared context.
- The correct altitude is in between: specific enough to guide behavior, flexible enough to act as strong heuristics the model can apply to situations the author never anticipated.

Practices [Anthropic, Context Engineering]:

- Organize the prompt into distinct sections (background, instructions, tool guidance, output format) with Markdown headers or XML tags.
- Start with a minimal prompt against the best available model; add instructions and examples only in response to observed failure modes. This is the same escalation discipline as the agent ladder: earn every token.

### Minimal viable toolset and curated examples

- Tools consume context twice: definitions occupy the window, and outputs flood it. Returned information should be token-efficient [Anthropic, Context Engineering].
- Bloated tool sets with overlapping functionality create ambiguous decision points; if a human engineer cannot say definitively which tool applies in a situation, the agent cannot either [Anthropic, Context Engineering].
- Keep each tool self-contained, robust to error, and unambiguous in its parameters [Anthropic, Context Engineering]. Tool interface quality is covered further in [knowledge/interoperability-observability.md].
- For few-shot guidance, curate a small set of diverse, canonical examples of expected behavior rather than an exhaustive edge-case list; for an LLM, examples are pictures worth a thousand words [Anthropic, Context Engineering].

### Just-in-time retrieval versus pre-retrieval

Two strategies for getting data into context [Anthropic, Context Engineering]:

- Pre-retrieval: load everything relevant up front (classic RAG into the prompt). Fast at runtime; pays for context the task may never touch.
- Just-in-time: keep lightweight identifiers in context (file paths, stored queries, links) and load data on demand through tools at runtime. Enables progressive disclosure (each exploration step informs the next), exploits metadata signals like naming and folder structure, and mirrors how humans use external indexes instead of memorizing corpora.
- Just-in-time costs: runtime exploration is slower than pre-computed retrieval, and without opinionated engineering the agent can misuse tools or chase dead ends.

The pragmatic default is hybrid [Anthropic, Context Engineering]:

- Load stable, always-needed material up front (configuration, core guidelines, the CLAUDE.md pattern) for speed.
- Let the agent fetch the long tail just-in-time with primitives like glob and grep style search.
- Stable up-front prefixes also maximize prompt-cache hits, cutting latency and cost on repeated calls; keep volatile content out of the cached prefix [knowledge/latency-cost-reliability.md].

### Compaction: session summaries for continuity

- Compaction takes a conversation nearing the window limit, summarizes it, and reinitiates a new window seeded with the summary, preserving architectural decisions, unresolved bugs, and implementation details while discarding redundant tool outputs [Anthropic, Context Engineering].
- Tuning: first maximize recall so the compaction prompt captures everything relevant, then iterate for precision by cutting superfluous content. Overly aggressive compaction loses subtle context whose importance appears only later [Anthropic, Context Engineering].
- The cheapest variant is tool result clearing: drop raw tool outputs once consumed, since agents rarely reread them [Anthropic, Context Engineering].
- Platform note: server-side compaction pairs with a client-side memory store; compaction keeps the active context small while memory preserves the information that must survive summarization [Anthropic, Memory Tool].

### Structured note-taking: agent-managed working memory

- The agent writes notes to storage outside the window (a NOTES.md, a task ledger, files under a memory directory) and pulls them back later, giving persistent working memory at minimal token overhead [Anthropic, Context Engineering].
- This achieves long-horizon coherence across context resets: the documented example is an agent maintaining precise tallies and strategy notes across thousands of game steps, resuming multi-hour work after a reset by reading its own notes [Anthropic, Context Engineering].
- Productized as the memory tool: a client-side, file-based store under a /memories path with view, create, str_replace, insert, delete, and rename commands, persisting across conversations. The application executes every operation against storage it controls [Anthropic, Memory Tool].
- The agent-managed lifecycle is save, retrieve, and forget: the agent checks its memory directory before starting a task, records progress as it works, and is prompted to keep the directory coherent, delete files no longer relevant, and scope what gets written to the task domain [Anthropic, Memory Tool].

### Sub-agent architectures for context isolation

- When the working set exceeds any single window, partition it: subagents explore with clean context windows, using tens of thousands of tokens each, and return condensed summaries of 1,000 to 2,000 tokens to a lead agent that holds only the plan and the distillates [Anthropic, Context Engineering].
- This is context engineering by separation of concerns: detailed search context stays isolated inside subagents while the lead focuses on synthesis [Anthropic, Context Engineering].
- It is the context rationale for the multi-agent patterns in [knowledge/multi-agent-orchestration.md]; the token economics there (about 15x chat) price the technique.

Selecting among the three long-horizon techniques [Anthropic, Context Engineering]:

- Compaction: tasks needing extensive back-and-forth conversational flow.
- Note-taking: iterative development with clear milestones.
- Multi-agent: complex research and analysis where parallel exploration pays.
- They compose: a lead agent can compact, take notes, and spawn subagents. The general principle remains the simplest thing that works.

### Memory tiers and what warrants each

- Tier 0, conversation state: the message history in the window. Sufficient for single-session, short-horizon tasks. No infrastructure.
- Tier 1, session summaries: tool result clearing and compaction when a single session outgrows the window [Anthropic, Context Engineering].
- Tier 2, working notes: structured note-taking when a task has milestones and might be interrupted; survives context resets within a project [Anthropic, Context Engineering].
- Tier 3, long-term stores: cross-session, cross-task memory. Three substrates with different query semantics:
  - File-based: agent-readable and editable, transparent, auditable; the memory tool model [Anthropic, Memory Tool].
  - Vector store: similarity lookup over many unstructured memories; opaque, hard to audit, and hard to selectively delete.
  - Structured database: typed facts (preferences, entitlements, account attributes); queryable, governable, best for compliance-sensitive data.
- Enterprise default: file-based or structured first, because both support inspection, correction, and per-record deletion; vector memory only when scale defeats direct lookup.
- Escalate tiers exactly like the agent ladder: each tier adds infrastructure, staleness risk, and governance duty. Do not build Tier 3 for a use case with no cross-session continuity requirement.

Tier selection summary:

| Use case signal | Tier | Mechanism |
|---|---|---|
| Short, independent sessions | 0 | window history only |
| One session outgrows the window | 1 | tool result clearing, then compaction |
| Milestone tasks, interruptible | 2 | notes file or memory directory |
| Cross-session continuity required | 3 | file store (agent knowledge), structured DB (governed facts), vector (large-scale recall) |
| Working set exceeds any window | partition | sub-agents returning 1k to 2k token distillates |

### State persistence for long-running agents

Long-running agents fail mid-task; the design must make failure cheap:

- Checkpoint progress and resume from the failure point rather than restarting, and let the model adapt gracefully to tool failures rather than aborting [Anthropic, multi-agent research system].
- Persist the plan to external memory before approaching the window limit, then retrieve it to continue past truncation [Anthropic, multi-agent research system].
- Multi-session pattern [Anthropic, Memory Tool]: an initializer session creates the memory files (progress log, feature checklist, startup script reference); each later session opens by reading them and closes by updating the progress log; items are marked complete only after end-to-end verification, keeping the log truthful across sessions.
- Deployment: gradual (rainbow) rollouts shift traffic between agent versions so code updates do not break long-running processes mid-flight [Anthropic, multi-agent research system].
- Observability: full production tracing of decision patterns is what makes non-deterministic, stateful agents debuggable [Anthropic, multi-agent research system; knowledge/interoperability-observability.md].

### Privacy, retention, and tenant isolation

Memory turns transient conversation into stored personal data, with obligations:

- PII in memories: models usually decline to write sensitive data to memory, but the design must not rely on that; add validation that strips sensitive data before the handler persists a file [Anthropic, Memory Tool]. Treat memory stores as PII systems of record: minimize what is written and prefer references over raw values.
- Tenant isolation: the memory path is a prefix the application maps to real storage, such as a per-user directory or per-tenant keys [Anthropic, Memory Tool]. Isolation is enforced by the handler, never by prompt.
- Path traversal: validate every path in every command; a path like /memories/../../secrets.env escapes the store. Resolve to canonical form, verify containment in the memory root, and reject traversal sequences including URL-encoded variants [Anthropic, Memory Tool].
- TTL and expiration: periodically delete memory files not accessed in a long time, and cap file sizes and view lengths [Anthropic, Memory Tool]. Set TTLs by data class: session scratch in days, project state for the project lifetime, user preferences until revoked.
- Right to erasure: deletion requests must map to deletable memory records, which is a reason to prefer file or structured stores with per-record deletion over vector stores.
- Memory poisoning: memory is written by the model from conversation content, so injected instructions can persist across sessions and replay as trusted context. Treat memory reads as untrusted data and audit memory writes in high-stakes deployments [knowledge/security-governance.md].

## When to apply

- Always: treat context as a budget; state the allocation across prompt, tools, examples, retrieval, and history [Anthropic, Context Engineering].
- If the agent misbehaves, then tune prompt altitude and tool clarity before adding memory machinery; most "memory" problems are context quality problems.
- If a large corpus backs the agent, then hybrid loading: stable material up front (cache-friendly), the rest just-in-time through tools [Anthropic, Context Engineering].
- If sessions are short and independent, then Tier 0 only; do not build memory.
- If single sessions exceed the window, then tool result clearing first, then compaction [Anthropic, Context Engineering].
- If tasks span interruptions or resets with clear milestones, then structured note-taking (Tier 2) [Anthropic, Context Engineering].
- If the use case requires cross-session continuity (a project assistant, a support agent recalling account history), then Tier 3, choosing substrate by query semantics: files for agent-managed knowledge, structured DB for governed attributes, vector for large-scale similarity recall.
- If the working set cannot fit one window even with compaction, then sub-agent context partitioning, priced per [knowledge/multi-agent-orchestration.md].
- If the agent runs for hours or days, then checkpointing, external plan persistence, and the initializer-session pattern [Anthropic, Memory Tool; Anthropic, multi-agent research system].
- If the system is multi-tenant, then handler-enforced per-tenant memory isolation, path validation, PII scrubbing before write, and a TTL policy are mandatory design elements, recorded in the security section of the design.
- If repeated calls share a stable prefix, then structure prompts for caching: stable content first, volatile content last [knowledge/latency-cost-reliability.md].

## Common failure modes

- Context maximalism: filling a 200k window because it exists, degrading precision through context rot while raising cost and latency [Anthropic, Context Engineering].
- Wrong prompt altitude: brittle hardcoded logic that breaks on novel inputs, or vague guidance that yields inconsistent behavior [Anthropic, Context Engineering].
- Tool sprawl: overlapping tools that confuse selection and bloat the window; fix the toolset before blaming the model [Anthropic, Context Engineering].
- Over-aggressive compaction: discarding subtle context whose importance appears later; tune recall before precision [Anthropic, Context Engineering].
- Memory hoarding: append-only memory with no forget path; stale facts accumulate until retrieval surfaces obsolete decisions as current truth [Anthropic, Memory Tool].
- PII pass-through: conversation content persisted verbatim into memory without scrubbing, creating an ungoverned personal-data store [Anthropic, Memory Tool].
- Prompt-enforced isolation: relying on instructions to keep tenant A's memories from tenant B instead of handler-enforced storage separation [Anthropic, Memory Tool].
- Path traversal: memory handlers that execute file operations without canonical-path validation, letting a crafted path escape the memory root [Anthropic, Memory Tool].
- Memory poisoning: persisted injected instructions replayed into future sessions as trusted context [knowledge/security-governance.md].
- Restart-from-zero: long-running agents with no checkpoints, so any failure or window exhaustion loses all progress [Anthropic, multi-agent research system].
- Optimistic progress logs: marking work complete before end-to-end verification, so the next session resumes from fiction [Anthropic, Memory Tool].
- Cache-hostile prompts: volatile content (timestamps, per-request IDs) interleaved into the stable prefix, defeating prompt caching and inflating cost [knowledge/latency-cost-reliability.md].

## Citations

- Anthropic, Context Engineering: Effective context engineering for AI agents. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic, Memory Tool: Memory tool documentation, Claude Developer Platform. https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- Anthropic, multi-agent research system: How we built our multi-agent research system. https://www.anthropic.com/engineering/multi-agent-research-system
- Cross-references: knowledge/decision-trees.md, knowledge/rag-patterns.md, knowledge/multi-agent-orchestration.md, knowledge/security-governance.md, knowledge/latency-cost-reliability.md, knowledge/interoperability-observability.md
