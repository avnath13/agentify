# 1. Build a single tool-using agent, not a workflow or multi-agent system

Date: 2026-07-14

## Status

Accepted

## Context

Some turns need retrieval, some a subscription lookup, some a ticket write, in an order that depends on the user's question. The path cannot be predetermined, which is the criterion for an agent rather than a fixed workflow.

## Decision

A single agent (Rung 3) behind an intent router, with the billing actions as tightly gated deterministic tools.

## Consequences

More flexible than a workflow at the cost of some predictability. Rejected a multi-agent system: three non-overlapping tools and one coherent task do not justify the roughly tenfold token cost.
