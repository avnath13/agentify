# Decision trees: which pattern, when

This document is the synthesis layer of the knowledge base. It turns the frameworks in the other documents into executable decision procedures. Every generated design must walk these trees in order and record the answer, the reasoning, and the citation at each gate. A design that skips a gate or escalates without written justification fails the enterprise bar.

## Tree 1: do you need generative AI at all

Walk this before any AI architecture appears. The right answer is rarely "use RAG" or "add an agent" [Selamy, GenAI System Design Loop].

```
Is the task deterministic with well-defined inputs and outputs?
  YES -> Use deterministic automation (code, rules, workflow engine). STOP.
  NO  v
Is the core need finding existing information rather than generating content?
  YES -> Improve search first (better indexing, filters, ranking).
         Add generation only if synthesis across sources is required.
  NO  v
Does the task tolerate non-determinism, with review or low blast radius?
  NO  -> Generative AI is the wrong tool, or needs human review on every
         output. Consider human-in-the-loop by design or do not build.
  YES -> Continue to Tree 2.
```

Record: the task property that justified generative AI, and what the fallback (non-AI) path is.

## Tree 2: the escalation ladder

Start at the bottom. Each rung must be justified in writing before climbing to the next [Anthropic, Building Effective Agents; OpenAI, Practical Guide].

```
Rung 0: deterministic code, no LLM
Rung 1: single augmented LLM call (prompt + retrieval + tools available)
Rung 2: workflow (LLM steps orchestrated by predefined code paths)
Rung 3: single agent (LLM directs its own tool use in a loop)
Rung 4: multi-agent system
```

Escalation criteria:

- 0 to 1: the task requires understanding or generating natural language, or judgment over unstructured input.
- 1 to 2: the task decomposes into known, fixed subtasks (chain), or inputs fall into distinct categories needing different handling (routing), or independent subtasks can run concurrently (parallelization), or output quality needs iterative critique (evaluator-optimizer).
- 2 to 3: the path cannot be predetermined. The number, order, or choice of steps depends on intermediate results. Open-ended exploration is required. Predictability and cost increase are accepted in exchange for flexibility [Anthropic, Building Effective Agents].
- 3 to 4: a single agent demonstrably fails: context window cannot hold the working set, tools exceed what one agent can reliably select among, subtasks are genuinely parallelizable and read-heavy, or privilege separation demands isolated agents. Multi-agent costs roughly an order of magnitude more tokens than single-agent chat; the value of the task must support it [Anthropic, multi-agent research system].

Anti-escalation rule: if a workflow pattern reproduces 90 percent of the value at lower cost and higher predictability, the design must choose the workflow and say so.

## Tree 3: workflow pattern selection (at rung 2)

```
Subtasks are sequential refinements of one artifact  -> prompt chaining
Inputs cluster into categories with different needs  -> routing
Subtasks are independent and latency matters         -> parallelization (sectioning)
Same task benefits from diverse attempts + voting    -> parallelization (voting)
Subtasks are dynamic but a plan can be made upfront  -> orchestrator-workers
Output has measurable quality criteria worth iterating -> evaluator-optimizer
```

Patterns compose. A router can front a chain; an orchestrator's workers can each be a chain. Justify each composition against latency budget: each serial LLM step adds full model latency, and tail latencies multiply across steps [knowledge/latency-cost-reliability.md].

## Tree 4: knowledge strategy (RAG vs fine-tuning vs long context vs none)

```
Does the system need knowledge beyond the model's training data?
  NO  -> No retrieval layer. Do not add RAG by default.
  YES v
Is the knowledge stable, bounded, and small (fits comfortably in context)?
  YES -> Long context or prompt-embedded knowledge. Consider prompt caching.
  NO  v
Does knowledge change frequently, or is it per-tenant/permissioned?
  YES -> RAG with permission-aware retrieval (identity propagated to the
         retriever; results filtered by the caller's entitlements).
  NO  v
Is the need stylistic or behavioral (tone, format, domain dialect)
rather than factual?
  YES -> Fine-tuning, possibly combined with RAG for facts.
```

If RAG is chosen, walk the RAG design choices in [knowledge/rag-patterns.md]: paradigm (naive, advanced, modular, agentic), chunking, hybrid search, reranking, freshness pipeline. Agentic RAG only when retrieval itself requires planning or iteration, per the same escalation discipline as Tree 2.

## Tree 5: multi-agent topology (at rung 4 only)

```
One coordinator decomposes and delegates; workers do not talk to
each other                                -> orchestrator-workers (manager)
Tasks hand off between specialists, each owning a phase
                                          -> decentralized handoff
Subtasks are read-heavy, parallel, then synthesized
                                          -> parallel research pattern
Output quality justifies adversarial review
                                          -> generator + critic (debate)
```

Mandatory records for any multi-agent design: communication mechanism (shared state vs message passing), context isolation strategy, failure containment (what happens when one agent errors mid-task), and the token cost multiplier accepted [knowledge/multi-agent-orchestration.md].

## Tree 6: autonomy tier and human oversight

Classify every tool/action the system can take [knowledge/security-governance.md]:

```
Tier 0: read-only, no side effects        -> autonomous, logged
Tier 1: reversible writes (drafts, tickets) -> autonomous with audit trail
Tier 2: user-visible or hard-to-reverse actions (send, publish, modify
        records)                           -> human approval gate or
                                             constrained allowlist
Tier 3: irreversible or high-blast-radius (payments, deletion,
        access-control changes)            -> human approval always;
                                             consider not giving the
                                             agent this tool at all
```

The design must list every tool with its tier and the enforcement mechanism (not just policy text: an actual gate in the architecture).

## Tree 7: memory tier

```
Single-turn or short sessions, no personalization -> no memory beyond
                                                     the conversation
Long sessions that outgrow context                -> compaction and/or
                                                     structured note-taking
Cross-session continuity required                 -> persistent memory store
                                                     (file, structured DB, or
                                                     vector; see context-memory)
Multi-tenant memory                               -> per-tenant isolation,
                                                     TTL and retention policy,
                                                     PII scrubbing before write
```

## Gate checklist (run before the design is emitted)

1. Tree 1 walked; non-AI fallback stated.
2. Escalation ladder: final rung stated with justification for every climb; anti-escalation rule checked.
3. If rung 2+: workflow pattern(s) named and mapped to the subtask structure.
4. Knowledge strategy chosen via Tree 4; if RAG, permission-aware retrieval addressed for enterprise data.
5. If rung 4: topology, communication, failure containment, and cost multiplier recorded.
6. Every tool classified by autonomy tier with an enforcement mechanism.
7. Memory tier chosen; retention and tenant isolation addressed if applicable.
8. NFRs stated with numbers (or explicitly flagged assumptions) before component selection [knowledge/enterprise-architecture.md].
9. Evaluation plan exists with gates tied to rollout phases [knowledge/evaluation.md].
10. Every architectural claim carries a citation to a knowledge document or a dated live source.
11. Domain harm assessed (what happens if the system is wrong or abused) and the guardrails scaled to that harm, not to company size [knowledge/security-governance.md].
12. Weight class (lightweight or enterprise) chosen and stated; the document's depth matches it, so a small design is not padded with enterprise ceremony and an enterprise design is not thinned.
13. If input or output is voice, image, video, or any non-text modality, the modality-specific concerns are addressed (voice: architecture, latency budget, turn-taking; multimodal: grounding and visual-hallucination eval) [knowledge/voice-and-multimodal.md].

## Citations

- Anthropic, Building Effective Agents: https://www.anthropic.com/research/building-effective-agents
- Anthropic, How we built our multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
- OpenAI, A Practical Guide to Building Agents: https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- Selamy, Customer-Facing GenAI System Design Interview Loop: https://selamy.dev/posts/customer-facing-genai-system-design-interview-loop/
- Cross-references: knowledge/building-effective-agents.md, knowledge/rag-patterns.md, knowledge/multi-agent-orchestration.md, knowledge/security-governance.md, knowledge/context-memory.md, knowledge/enterprise-architecture.md, knowledge/evaluation.md, knowledge/latency-cost-reliability.md
