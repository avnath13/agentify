# Security and governance for agentic systems

This document grounds the security and governance layer of every generated design. It provides a threat model specific to LLM and agentic systems, a layered guardrail architecture, identity and least-privilege rules, tenant isolation and PII handling requirements, audit trail specifications, autonomy risk tiers with approval gates, and a mapping to the NIST AI Risk Management Framework across the system lifecycle. The core stance: an agent is a confused deputy by construction (it follows any instructions that reach its context), so security comes from architecture (privilege limits, isolation, gates), not from hoping the model behaves.

## Principles

### Threat model: attack surfaces of an agentic system

Enumerate every channel through which untrusted content can reach the model, because the model cannot reliably distinguish legitimate instructions from malicious ones embedded in content it processes [Willison, Lethal Trifecta; OWASP, LLM Top 10 2025].

- User input: direct prompt injection and jailbreaks (LLM01) [OWASP, LLM Top 10 2025].
- Retrieved content: indirect injection via documents, web pages, emails, and RAG corpora; a poisoned document can redirect the agent's goal (ASI01, Agent Goal Hijack) [OWASP, Agentic Top 10 2026]. Vector stores add embedding-layer risks: poisoning and cross-tenant leakage (LLM08) [OWASP, LLM Top 10 2025].
- Tool outputs: any API response, file content, or scraped page the agent reads is an injection vector, not just "data."
- Inter-agent messages: in multi-agent systems, one compromised agent can inject instructions into peers; unauthenticated or unencrypted agent channels enable spoofing and replay (ASI07) [OWASP, Agentic Top 10 2026].
- Memory: long-term memory and RAG stores persist across sessions, so a single poisoning event biases all future decisions (ASI06, Memory and Context Poisoning) [OWASP, Agentic Top 10 2026].
- Supply chain: models, MCP servers, tools, and prompt templates loaded at runtime from third parties (LLM03; ASI04) [OWASP, LLM Top 10 2025; OWASP, Agentic Top 10 2026].

### The lethal trifecta rule

An agent that combines all three of the following capabilities is exfiltration-vulnerable by design [Willison, Lethal Trifecta]:

1. Access to private data (documents, email, databases, credentials in scope).
2. Exposure to untrusted content (web pages, inbound messages, user uploads, third-party API responses).
3. An external communication channel (web requests, outbound email or messages, writable public resources).

Detection-based defenses are insufficient: 95 percent detection is a failing grade in security, because attackers iterate until they find the 5 percent [Willison, Lethal Trifecta]. The architectural fix is to never combine all three legs in one agent context:

- Split capabilities across isolated agents so no single context holds all three legs.
- Remove the exfiltration channel (no unrestricted web fetch, no arbitrary outbound send) from any context that holds private data.
- Constrain the channel instead of removing it where business needs demand: allowlisted domains, templated messages to pre-approved recipients, no attacker-controllable content in URLs.

Every generated design must state which trifecta legs each agent holds and how the third leg is severed. This analysis is per agent context, not per system: tool composition by end users (for example through MCP) can silently assemble the trifecta from individually safe tools [Willison, Lethal Trifecta].

### The OWASP risk registers

Design against both lists; the LLM list covers the model application layer, the agentic list covers autonomy, identity, and multi-agent behavior.

OWASP Top 10 for LLM Applications 2025 [OWASP, LLM Top 10 2025]:

- LLM01 Prompt Injection: user or content-borne instructions alter behavior. Mitigate with input validation, privilege limits, and output monitoring; assume it cannot be fully prevented and constrain what a hijacked agent can do.
- LLM02 Sensitive Information Disclosure: leakage of PII, secrets, or proprietary data through outputs. Mitigate with data classification, access controls, and redaction at both ingestion and output.
- LLM03 Supply Chain: compromised models, datasets, plugins, and serving dependencies. Mitigate with vendor assessment, component signing and verification, and allowlists.
- LLM04 Data and Model Poisoning: corrupted pre-training, fine-tuning, or embedding data. Mitigate with data provenance tracking, source verification, and anomaly detection on training and index pipelines.
- LLM05 Improper Output Handling: model output passed unsanitized into interpreters, browsers, shells, or SQL. Treat model output as untrusted input to downstream systems; encode, parameterize, sandbox.
- LLM06 Excessive Agency: more tools, permissions, or autonomy than the task needs. Mitigate with minimal tool surface, least privilege, and human approval for consequential actions.
- LLM07 System Prompt Leakage: never place secrets or access-control logic in the system prompt; assume it is extractable and enforce controls outside the model.
- LLM08 Vector and Embedding Weaknesses: poisoning and unauthorized access in RAG stores. Mitigate with per-tenant partitioning and access controls enforced at retrieval time.
- LLM09 Misinformation: confabulated content relied on as fact. Mitigate with groundedness controls, source attribution, and user-facing disclaimers (see knowledge/evaluation.md).
- LLM10 Unbounded Consumption: cost and denial-of-service via unmetered inference. Mitigate with rate limits, quotas, step budgets, and budget alarms.

OWASP Top 10 for Agentic Applications 2026 [OWASP, Agentic Top 10 2026]:

- ASI01 Agent Goal Hijack: poisoned content the agent reads (a tool output, a retrieved document, an email, an external page) rewrites what the agent is trying to do. Mitigate with content sanitization, explicit goal verification, trajectory anomaly detection, and audit trails for decision pathways.
- ASI02 Tool Misuse and Exploitation: legitimate tools weaponized via ambiguous instructions or excessive permissions. Mitigate with least-privilege tool access, unambiguous tool naming, runtime argument validation, and usage-pattern monitoring.
- ASI03 Agent Identity and Privilege Abuse: agents operating without distinct governed identities create an attribution gap that enables impersonation and privilege escalation. Mitigate with unique auditable agent identities, per-user delegated permissions, separate privilege contexts, and re-verification of user intent for high-risk operations.
- ASI04 Agentic Supply Chain Compromise: tools, templates, and protocol servers loaded dynamically at runtime from third parties. Mitigate with integrity verification, code signing, sandboxed execution, and allowlists of trusted sources.
- ASI05 Unexpected Code Execution: agent-generated code run unreviewed creates arbitrary command execution paths. Mitigate with sandboxed isolated execution, restricted command sets, static and dynamic analysis, and review gates.
- ASI06 Memory and Context Poisoning: persistent corruption of long-term memory or RAG permanently biases future decisions across sessions. Mitigate with write access controls on memory, provenance tags, integrity checks, memory audit logs, and periodic consistency review.
- ASI07 Insecure Inter-Agent Communication: spoofing, interception, and replay between agents. Mitigate with mutual authentication, encryption, message signing, and identity validation before processing any peer message.
- ASI08 Cascading Agent Failures: one compromised or malfunctioning agent propagates faults through interconnected agents. Mitigate with circuit breakers, isolation and quarantine procedures, rate limits and sanity checks on inter-agent data, and graceful degradation design.
- ASI09 Human-Agent Trust Exploitation: agents (or attackers through them) leverage anthropomorphic confidence and fabricated explanations to get harmful actions approved. Mitigate with uncertainty display, dual-approval workflows for high-risk actions, and approval UX that shows the real action, not the agent's summary of it.
- ASI10 Rogue Agents: misaligned or compromised agents acting as insider threats, potentially self-replicating or optimizing proxy goals. Mitigate with continuous behavioral monitoring, constrained self-modification, and authorization controls on agent spawning.

### Layered guardrail architecture

No single guardrail is sufficient; specify defense in depth with each layer named in the design:

1. Input validation: schema and length checks, allowlisted formats, known-attack pattern filters (rules and regex) on user input before it reaches the model. Cheap, fast, catches the unsophisticated tier.
2. Classifier guards: small, fast LLM-based or trained classifiers screening inputs for injection attempts and outputs for policy violations, PII, and topic drift. Treat these as risk reduction, never as the security boundary [Willison, Lethal Trifecta].
3. Content provenance separation: mark retrieved and tool-returned content as data in the prompt structure (delimiters, structured message roles), and strip or neutralize instruction-like content where feasible (LLM01 mitigation) [OWASP, LLM Top 10 2025].
4. Output handling: validate and encode model output before it touches any interpreter; parameterized queries, HTML encoding, sandboxed code execution (LLM05, ASI05) [OWASP, LLM Top 10 2025; OWASP, Agentic Top 10 2026].
5. Tool-layer enforcement: authorization checks, argument validation, and rate limits inside the tool implementation, not in the prompt. The prompt is a suggestion; the tool boundary is the control.
6. Human-in-the-loop gates: mandatory approval for consequential actions per the autonomy tiers below (LLM06) [OWASP, LLM Top 10 2025]. Approval requests must show the actual action and raw arguments, since agents can exploit trust with fabricated explanations (ASI09) [OWASP, Agentic Top 10 2026].

Record for each layer: what it blocks, its expected false-positive rate, and where its verdicts are logged. Guardrail trigger rates are a first-class operational metric (see knowledge/interoperability-observability.md).

### Identity and least privilege

- Identity propagation: the agent acts with the requesting user's permissions, not a super-service-account. Every tool call carries the user's identity (token exchange or on-behalf-of delegation), so the database, search index, and APIs enforce their existing ACLs. A super-privileged agent converts any successful injection into a full-privilege breach (ASI03) [OWASP, Agentic Top 10 2026].
- Distinct agent identity: each agent additionally has its own auditable identity, so logs distinguish "user U via agent A" from user U directly, closing the attribution gap [OWASP, Agentic Top 10 2026].
- Scoped tool credentials: each tool gets the narrowest credential that works (read-only keys for read tools, per-resource scopes, short-lived tokens). Never one broad credential shared across the tool suite (LLM06, ASI02) [OWASP, LLM Top 10 2025; OWASP, Agentic Top 10 2026].
- Delegated authorization: for remote tool servers (for example MCP over Streamable HTTP), use OAuth-based token flows rather than static shared secrets [MCP, Architecture].
- Permission-aware retrieval: RAG retrieval filters by the requesting user's document ACLs at query time; embedding stores are not exempt from authorization (LLM08) [OWASP, LLM Top 10 2025].
- Re-verification: for high-risk operations, re-confirm user intent out of band rather than trusting the conversation state, which may be attacker-influenced (ASI03) [OWASP, Agentic Top 10 2026].

### Tenant isolation for AI data

Multi-tenant AI systems must isolate per tenant at every stateful layer:

- Vector stores: separate namespaces or collections per tenant, with tenant ID enforced as a mandatory query filter in the retrieval service, not left to the caller.
- Memory: per-tenant (and usually per-user) memory stores; no shared long-term memory across tenants.
- Caching: prompt caches and semantic caches keyed on tenant; a semantic cache hit across tenants is a data leak.
- Examples and tuning: no cross-tenant few-shot examples; tenant-scoped fine-tunes if fine-tuning on customer data at all.

Cross-tenant leakage through embeddings or shared stores is a named vector-layer risk (LLM08) [OWASP, LLM Top 10 2025].

### PII handling and data residency

Data privacy is a named GAI risk category: generative systems can leak, memorize, or infer personal data beyond what any single input reveals [NIST, AI 600-1]. Specify:

- PII detection and redaction before logging and before sending context to third-party model APIs.
- Data minimization in prompts: send the fields the task needs, not the whole record.
- Residency-aware routing: tenant data processed in-region (for example EU tenant data to EU-hosted inference endpoints) where contract or regulation requires.
- Retention limits on stored prompts, completions, embeddings derived from personal data, and memory, with deletion propagation into vector indexes when a source record is erased.
- A lawful-basis note for any production data reused in evals or fine-tuning, with de-identification as the default.

### Audit trails

For compliance and forensics, log the full decision chain per request:

- Request ID, timestamp, user identity, and agent identity (both, per ASI03) [OWASP, Agentic Top 10 2026].
- Full prompt assembly: system prompt version, retrieved chunk IDs with provenance, conversation context reference.
- Model ID and parameters (model responses can differ across versions; forensics needs the exact pair).
- Complete tool-call sequence with arguments and results.
- Guardrail verdicts at each layer, and any human approvals with approver identity and what was displayed to them.
- Final response as delivered.

Clear audit trails for decision pathways are a first-line mitigation for goal hijack and privilege abuse (ASI01, ASI03) [OWASP, Agentic Top 10 2026], and the incident disclosure processes called for by the GAI profile depend on them [NIST, AI 600-1]. Set retention by regulatory regime (commonly 1 to 7 years), store PII-redacted copies for long retention with a short-lived unredacted tier under stricter access, and make logs append-only with integrity protection.

### Autonomy risk tiers

Classify every tool and action by blast radius, and gate accordingly (LLM06 mitigation: limit agency to what the workflow requires) [OWASP, LLM Top 10 2025]:

- Tier 0, read-only: queries, searches, retrievals. Autonomous, logged.
- Tier 1, reversible writes: draft creation, ticket updates, cart changes. Autonomous with monitoring and undo paths; sample for human review.
- Tier 2, consequential but recoverable: sending external messages, changing records of consequence, purchases within budget. Human approval or a strict policy engine with per-action and per-period limits.
- Tier 3, irreversible or high-impact: payments above threshold, deletions, access-control changes, legal or medical determinations. Mandatory human approval with dual control for the highest impact; the agent prepares, a human executes.

Design rules: the design must place every tool in a tier and state the gate; an unclassified tool defaults to the highest tier its worst-case use implies; approval gates must stay rare enough to remain meaningful, because approval fatigue is exactly what trust exploitation attacks rely on (ASI09) [OWASP, Agentic Top 10 2026].

### Governance mapping: NIST AI RMF across the lifecycle

The AI RMF organizes risk management into four functions: GOVERN (cross-cutting culture, policies, roles, accountability), MAP (context, use case, and risk identification), MEASURE (assessment, testing, and metrics), MANAGE (prioritization, response, and monitoring) [NIST, AI RMF 1.0]. The Generative AI Profile applies these to twelve GAI-specific risk categories, including confabulation, data privacy, information integrity, and information security, with suggested actions clustered around governance, content provenance, pre-deployment testing, and incident disclosure [NIST, AI 600-1].

- Design time (GOVERN, MAP): assign risk ownership and acceptable-use policy; map the use case to the GAI risk categories that apply; classify autonomy tiers; document the threat model and trifecta analysis; define residency and retention policy; decide what the system must never do regardless of instructions.
- Deploy time (MEASURE): pre-deployment testing against the eval gates in knowledge/evaluation.md, including red-team suites for injection, disclosure, and excessive-agency scenarios; measure guardrail efficacy and false-positive rates; verify audit pipeline completeness end to end before GA [NIST, AI 600-1].
- Operate time (MANAGE): monitor guardrail trigger rates and behavioral anomalies; run the incident response and disclosure process; feed incidents back into eval cases and threat model updates; run periodic access reviews and memory integrity reviews [NIST, AI 600-1].

## When to apply

- Every design: threat model with the six attack surfaces, trifecta analysis per agent, autonomy tier table for all tools, audit log specification. These four artifacts are mandatory.
- Systems consuming untrusted content (web, email, uploaded documents, third-party APIs): treat indirect injection as the primary threat; sever the trifecta architecturally [Willison, Lethal Trifecta].
- Multi-agent systems: add ASI07 (authenticated inter-agent channels) and ASI08 (circuit breakers, quarantine, degradation) controls [OWASP, Agentic Top 10 2026].
- Persistent memory or user-writable RAG corpora: add ASI06 controls (write authorization, provenance, memory audits) [OWASP, Agentic Top 10 2026].
- Code-generating or code-executing agents: ASI05 controls (sandboxing, restricted commands, review gates) are mandatory [OWASP, Agentic Top 10 2026].
- Multi-tenant SaaS: the tenant isolation section is mandatory; verify caches and vector stores key on tenant (LLM08) [OWASP, LLM Top 10 2025].
- Regulated industries or high-impact deployments: full NIST mapping with named GOVERN owners, pre-deployment test evidence, and an incident disclosure procedure [NIST, AI 600-1].

## Common failure modes

- Prompt-only security: policies stated in the system prompt with no enforcement at the tool boundary; defeated by the first successful injection (LLM01, LLM06) [OWASP, LLM Top 10 2025].
- The super-service-account agent: one credential with union-of-all-users access, turning any injection into a data breach (ASI03) [OWASP, Agentic Top 10 2026].
- Assembling the lethal trifecta by tool accretion: individually safe tools (read email, browse web, send messages) combined into an exfiltration machine [Willison, Lethal Trifecta].
- Treating tool outputs and retrieved documents as trusted because "they come from our systems"; indirect injection rides on any content channel (ASI01) [OWASP, Agentic Top 10 2026].
- Relying on a guardrail classifier as the security boundary and accepting 95 percent detection as adequate [Willison, Lethal Trifecta].
- Model output piped raw into SQL, shells, or the DOM (LLM05) [OWASP, LLM Top 10 2025].
- Approval fatigue: gating everything at Tier 2 and above so humans rubber-stamp, which ASI09 attacks exploit; tier honestly and keep approvals rare and meaningful [OWASP, Agentic Top 10 2026].
- Approval UX that shows the agent's description of the action instead of the actual arguments, letting a hijacked agent narrate its way past the gate (ASI09) [OWASP, Agentic Top 10 2026].
- Unlogged prompt assembly: the response is logged but not the retrieved chunks and tool arguments, making forensics impossible.
- Memory writes without provenance or authorization, so one poisoned session permanently biases the system (ASI06) [OWASP, Agentic Top 10 2026].
- Governance as a launch-day document: MEASURE and MANAGE never operationalized, so drift, poisoning, and incidents go undetected [NIST, AI 600-1].

## Citations

- [OWASP, LLM Top 10 2025] OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llm-top-10/
- [OWASP, Agentic Top 10 2026] OWASP Top 10 for Agentic Applications 2026. https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- [Willison, Lethal Trifecta] The lethal trifecta for AI agents (Simon Willison, June 2025). https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
- [NIST, AI RMF 1.0] Artificial Intelligence Risk Management Framework (NIST AI 100-1). https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf
- [NIST, AI 600-1] AI RMF: Generative Artificial Intelligence Profile (NIST AI 600-1). https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- [MCP, Architecture] Model Context Protocol: architecture overview. https://modelcontextprotocol.io/docs/learn/architecture
