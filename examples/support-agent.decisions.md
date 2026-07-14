---
title: Enterprise Support Agent
date: 2026-07-14
---

## Build a single tool-using agent, not a workflow or multi-agent system
Status: Accepted
Context: Some turns need retrieval, some a subscription lookup, some a ticket write, in an order that depends on the user's question. The path cannot be predetermined, which is the criterion for an agent rather than a fixed workflow.
Decision: A single agent (Rung 3) behind an intent router, with the billing actions as tightly gated deterministic tools.
Consequences: More flexible than a workflow at the cost of some predictability. Rejected a multi-agent system: three non-overlapping tools and one coherent task do not justify the roughly tenfold token cost.

## Use permission-aware RAG, not fine-tuning or long context
Status: Accepted
Context: The knowledge base changes weekly and is tier-gated, and past tickets carry PII, so retrieval must run under the caller identity.
Decision: Advanced RAG with entitlement filtering applied before ranking.
Consequences: Retrieval stays current and safe per tenant. Rejected fine-tuning (facts change weekly) and long context (2,000 pages exceed a sane per-call budget).

## Cap autonomy at tier 1, with billing actions out of scope
Status: Accepted
Context: Reads and reversible ticket writes are safe to automate, but billing and deletion are high blast-radius.
Decision: Tier 0 reads and tier 1 ticket writes are autonomous with an audit trail; no billing, refund, or delete tool exists in the registry.
Consequences: The agent cannot take a consequential financial action even if it decides to, because the tool is absent by construction.

## Hold session state, no long-term memory at launch
Status: Accepted
Context: The interaction is multi-turn within a session, but no cross-session personalization is required for v1.
Decision: Session state with compaction, and no persistent user memory.
Consequences: Smaller PII surface and simpler operations. Personalization can be added later as a scoped, governed store.
