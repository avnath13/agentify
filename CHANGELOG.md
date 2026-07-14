# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Domain-harm discovery: the clarify step now asks what happens if the system is wrong or abused (safety, financial, legal, discrimination, privacy, reputational), and the guardrail stack is scaled to that harm rather than to company size. Backed in `knowledge/genai-sysdesign-loop.md` and enforced by a new gate-checklist item. Surfaced by a cold run whose honest answer needed strong allergen guardrails at tiny scale.
- Right-sizing: SKILL.md now classifies a design as lightweight or enterprise from the decision outcome and sizes the document to match, so a small per-user feature is not padded with tenant-isolation, DR, and full OWASP and NIST ceremony. Section templates and the gate checklist updated to match; "not applicable, with reason" is now an encouraged outcome.

## [0.1.0] - 2026-07-14

First tagged release. The skill, knowledge base, extended diagram engine, and a flagship gallery example are in place; the packaged skill runs standalone with no install step.

### Added

- Repository scaffolding: license, contributing guide, code of conduct, CI.
- Vendored diagram engine from Archify v2.10.0 (MIT): five renderers (architecture, workflow, sequence, dataflow, lifecycle), JSON schemas, standalone validators, CLI, post-render checks, and full test suite.
- Knowledge base (`agentify/knowledge/`): 14 documents grounded in primary sources (vendor agent guides, cloud well-architected frameworks, seven arXiv surveys, OWASP, NIST, MCP, OpenTelemetry, RAGAS/TruLens), synthesized into seven executable decision trees with a final gate checklist, plus full source provenance with retrieval dates.
- Skill definition (`SKILL.md`): enterprise AI solutions architect persona, seven-step design loop (intake, clarify, decide, design, diagram, render, self-check), production and interview modes, non-negotiable grounding rules.
- Section templates with per-section pass/fail bars for all fourteen design document sections.
- Eleven agent-native diagram component types (`agent`, `llm-router`, `model-gateway`, `retriever`, `vector-store`, `memory-state`, `guardrail`, `eval-loop`, `human-review`, `tool`, `queue`) across schema, renderers, and themes, documented in `schemas/README.md`.
- Self-contained design document template (`templates/design-doc.html`): generated TOC, theme toggle, callouts, interview-mode blocks, diagram slots that theme embedded SVGs, print styles.
- Flagship gallery example: a complete enterprise support agent design document with two embedded agent-native diagrams.
- Comprehensive README, and a `build-zip` script producing an install-free distributable that passes `doctor` standalone.

### Changed

- Renamed the CLI binary from `archify.mjs` to `agentify.mjs`; package renamed to `agentify` at version 0.1.0 with version sync across template and manifest.
- Replaced all em dashes across vendored files with colons or hyphens (project style rule; goldens re-rendered accordingly).

### Fixed

- Parallel test race between the validator freshness test's scratch directory and the CLI test's skill-tree copy (excluded `.validator-check-*` from the copy).
