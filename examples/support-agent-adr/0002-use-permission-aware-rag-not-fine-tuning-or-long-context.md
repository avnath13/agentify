# 2. Use permission-aware RAG, not fine-tuning or long context

Date: 2026-07-14

## Status

Accepted

## Context

The knowledge base changes weekly and is tier-gated, and past tickets carry PII, so retrieval must run under the caller identity.

## Decision

Advanced RAG with entitlement filtering applied before ranking.

## Consequences

Retrieval stays current and safe per tenant. Rejected fine-tuning (facts change weekly) and long context (2,000 pages exceed a sane per-call budget).
