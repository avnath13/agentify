# 3. Cap autonomy at tier 1, with billing actions out of scope

Date: 2026-07-14

## Status

Accepted

## Context

Reads and reversible ticket writes are safe to automate, but billing and deletion are high blast-radius.

## Decision

Tier 0 reads and tier 1 ticket writes are autonomous with an audit trail; no billing, refund, or delete tool exists in the registry.

## Consequences

The agent cannot take a consequential financial action even if it decides to, because the tool is absent by construction.
