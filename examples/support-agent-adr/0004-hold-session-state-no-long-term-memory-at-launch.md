# 4. Hold session state, no long-term memory at launch

Date: 2026-07-14

## Status

Accepted

## Context

The interaction is multi-turn within a session, but no cross-session personalization is required for v1.

## Decision

Session state with compaction, and no persistent user memory.

## Consequences

Smaller PII surface and simpler operations. Personalization can be added later as a scoped, governed store.
