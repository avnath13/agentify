# Section templates

Scaffolds for every section of a generated design document. Each template lists required content, the knowledge documents to consult, and what distinguishes a passing section from a failing one. In interview mode, append the three interview blocks (Strong answer, Interviewer probes, Tradeoffs to voice) to each section.

Style for all sections: plain confident prose, quantified wherever possible, citations inline as [knowledge/<doc>.md] or [live-sourced YYYY-MM-DD: <url>]. No em dashes.

**Proportionality.** These are the full-depth requirements, calibrated for an enterprise design. For a lightweight design (SKILL.md "Right-sizing": Rung 0 to 1, Tier 0 to 1 tools, per-user data, no compliance regime), write sections 5, 7, 8, 10, 12, and 13 in short form (a few lines each) and do not manufacture content to fill them. Sections 1 to 4, 6, 9, and 11 stay in full at any size. Domain safety (below, in section 8) is assessed at full depth regardless of size. Marking a section "not applicable" with a one-line reason is a valid, encouraged outcome, not a failure.

## 1. Executive summary

Five sentences maximum: the problem, the recommended architecture in one phrase (including the escalation-ladder rung, e.g. "a routed workflow with retrieval, not an autonomous agent"), the one or two decisions that most shaped the design, the headline cost and latency envelope, the rollout posture.
Fails if: it reads as a feature list, names components before the problem, or hides the rung.

## 2. Requirements and NFRs

Consult: knowledge/enterprise-architecture.md (NFR checklist), knowledge/genai-sysdesign-loop.md.
Required: functional requirements as user-visible behaviors; explicit non-goals; NFR table with numbers (load, p50/p95/p99 latency, availability, RTO/RPO if stateful, cost ceiling per request and per month, compliance regime); an Assumptions subsection flagging every value the user did not supply.
Fails if: any NFR is an adjective ("fast", "scalable") instead of a number or an explicitly flagged assumption.

## 3. Decision record

Consult: knowledge/decision-trees.md (all trees, in order).
Required: one entry per tree walked: the question, the answer, the justification, the citation, and the strongest rejected alternative with the reason it lost. The escalation ladder entry must show each rung climbed and why the rung below was insufficient.
Fails if: any tree is skipped, any escalation lacks written justification, or rejected alternatives are missing (a decision record with no losers is a rationalization, not a decision).

## 4. System architecture

Consult: knowledge/building-effective-agents.md, knowledge/enterprise-architecture.md.
Required: the component inventory as a table: component, requirement it serves, scaling model (horizontal/vertical, stateless/stateful), failure mode and fallback, concrete technology example (category plus a named instance, e.g. "managed vector database with hybrid search, e.g. OpenSearch or pgvector"). Reference the architecture diagram. Identify trust boundaries.
Fails if: any component lacks one of the five fields, or a component serves no stated requirement.

## 5. Data and retrieval

Consult: knowledge/rag-patterns.md.
Required (when retrieval exists): source inventory with freshness needs; ingestion pipeline (chunking strategy with sizes, embedding model class, index type); query path (hybrid search, reranking, query rewriting as justified); permission-aware retrieval design (how the caller's entitlements filter results, this is mandatory for enterprise data); freshness/reindexing strategy; the RAG paradigm chosen (naive/advanced/modular/agentic) with justification.
If no retrieval: one paragraph stating why (per decision tree 4).

## 6. Tools and integrations

Consult: knowledge/interoperability-observability.md, knowledge/security-governance.md.
Required: tool inventory table: tool, interface (MCP server vs native function), input/output contract quality notes, autonomy tier (0 to 3), enforcement gate for tier 2+ (the architectural mechanism, not a policy statement), idempotency/retry safety.
Fails if: any tier 2+ tool lacks a concrete gate, or tiers are missing.

## 7. State and memory

Consult: knowledge/context-memory.md.
Required: the memory tier chosen (per decision tree 7) and why; conversation state handling (compaction threshold, summarization approach); persistent memory design if applicable (store type, what is saved, retrieval trigger, TTL/retention, per-tenant isolation, PII scrubbing); checkpointing for long-running tasks.

## 8. Security, identity, and guardrails

Consult: knowledge/security-governance.md.
Required (always, at any size): a domain-harm statement naming the worst outcome if the system is wrong or abused (safety, financial, legal, discrimination, privacy, reputational), and a guardrail stack sized to that harm. A tiny app that touches health, money, legal, children, or physical safety still needs strong output guardrails.
Required (enterprise weight class): threat model naming the attack surfaces present in THIS design; layered guardrail stack (input, model-based, rules, output handling, human gates) mapped to the specific OWASP risks they mitigate; identity propagation design (the agent acts with the user's permissions; state how); tenant isolation; audit trail (what is logged, retention); the autonomy tier table cross-referenced from section 6.
Lightweight weight class: the domain-harm statement plus the guardrails that harm demands, identity propagation in one line, and skip tenant isolation and the full OWASP and NIST mapping unless a requirement pulls them in.
Fails if: domain harm is unstated, guardrails are generic ("add guardrails") rather than mapped to the harm or named threats, or (enterprise) identity propagation is unaddressed while shared data access exists.

## 9. Evaluation plan

Consult: knowledge/evaluation.md.
Required: golden dataset plan (size, stratification, source, refresh); component-level metrics (retrieval and generation separately when RAG exists); end-to-end metrics including agent-specific ones (task completion, tool-call correctness; pass^k when reliability matters); LLM-as-judge design with named bias mitigations; online evaluation (shadow, canary, A/B); the gate table: which scores unlock which rollout phase.
Fails if: evaluation is an afterthought paragraph, or gates are not tied to rollout phases.

## 10. Observability

Consult: knowledge/interoperability-observability.md.
Required: tracing design (full reasoning chain as spans: LLM calls, tool calls, retrievals; OpenTelemetry GenAI conventions); metrics (token and cost per request, latency percentiles per stage, error and guardrail-trigger rates, eval-score drift); dashboards and alerts with thresholds; how production traces feed the eval set.

## 11. Scale and cost analysis

Consult: knowledge/enterprise-architecture.md (capacity math), knowledge/latency-cost-reliability.md.
Required: back-of-envelope math shown, not asserted: tokens per request (broken into prompt, retrieved context, tools, output), requests per day, model pricing (live-sourced with date), cost per request and per month; latency budget per pipeline stage summing to the SLO, with tail-latency note for multi-step chains; the 10x scenario: what breaks first, what changes (caching tiers, model routing, capacity); cache ROI estimate when caching is recommended.
Fails if: numbers are absent or the 10x scenario is missing.

## 12. Failure modes and degradation

Consult: knowledge/latency-cost-reliability.md, knowledge/multi-agent-orchestration.md (if multi-agent).
Required: failure inventory (provider outage, tool failure, retrieval degradation, guardrail false positives, runaway loops); degradation ladder (full service -> reduced -> static fallback -> fail closed for tier 2+ actions); retry/timeout budgets; loop bounds; incident signals that page a human.

## 13. Rollout plan

Consult: knowledge/evaluation.md (gates), knowledge/genai-sysdesign-loop.md (adoption step).
Required: crawl/walk/run phases with scope per phase (users, autonomy tiers enabled, data sources connected); the eval gate that unlocks each promotion; feedback capture and how field signals become eval cases and design revisions.

## 14. References

Two groups: knowledge base documents cited (with the primary sources they carry), and live-sourced citations with retrieval dates. Every citation used in the body appears here. No orphan references.

## Interview mode blocks (appended per section)

- **Strong answer**: two or three sentences: what a senior candidate states proactively in this section.
- **Interviewer probes**: the two or three follow-ups this section invites, with one-line answers.
- **Tradeoffs to voice**: the tension a candidate should name out loud (e.g. recall vs latency, autonomy vs blast radius, cost vs quality), and the position taken.
