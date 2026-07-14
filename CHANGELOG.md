# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `agentify assemble` command: the design document deliverable is now a real tool. The skill writes the design as markdown and assembles a self-contained, themed `design.html` (with embedded diagrams and an em-dash guard), instead of hand-editing HTML. `doctor` verifies the deliverable path ships, and the full render-then-assemble flow is proven to run from the extracted skill package with no repo access.
- Knowledge-base accuracy audit: load-bearing claims spot-checked against primary sources (nearly all verified exactly); corrected the LLMs-as-Judges survey author, the Anthropic prompt-cache minimum, and one voice-latency share claim.

- Domain-harm discovery: the clarify step now asks what happens if the system is wrong or abused (safety, financial, legal, discrimination, privacy, reputational), and the guardrail stack is scaled to that harm rather than to company size. Backed in `knowledge/genai-sysdesign-loop.md` and enforced by a new gate-checklist item. Surfaced by a cold run whose honest answer needed strong allergen guardrails at tiny scale.
- Right-sizing: SKILL.md now classifies a design as lightweight or enterprise from the decision outcome and sizes the document to match, so a small per-user feature is not padded with tenant-isolation, DR, and full OWASP and NIST ceremony. Section templates and the gate checklist updated to match; "not applicable, with reason" is now an encouraged outcome.
- Voice and multimodal knowledge doc (`knowledge/voice-and-multimodal.md`): cascaded vs speech-to-speech architecture, the conversational latency budget, turn-taking (VAD, endpointing, barge-in), multimodal input and RAG, visual hallucination, and audio-native evaluation, grounded in OpenAI, LiveKit, ElevenLabs, the voice-agent testing literature, and arXiv multimodal surveys. Wired into the index, sources, gate checklist, and the modality clarify dimension. Prompted by the question of whether the skill covers voice and multimodal agents (it now grounds them rather than winging it).
- Interview-mode discoverability: when no mode is specified, the skill now makes a single one-line offer of interview mode in its first reply, so the mode is discoverable without nagging production users.
- Two more gallery examples, both generated through the real render-then-assemble pipeline: a lightweight consumer recipe assistant (demonstrates right-sizing producing a short Rung 1 design) and a drive-through voice agent (demonstrates the voice knowledge doc and the new speech nodes).
- `asr` and `tts` agent-native diagram component types for voice-channel speech I/O, and a README Features section.
- The reasoning eval now seeds five committed designs; the assembler gained tag-balanced raw-HTML passthrough (multi-paragraph callouts and interview `<details>` blocks survive blank lines) and a figure-count confirmation.

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
