# Interoperability and observability for agentic systems

This document grounds two adjacent design decisions: how the system exposes and consumes capabilities (tool interfaces, MCP, agent-to-agent protocols) and how it is instrumented so every production behavior can be traced, debugged, costed, and fed back into evaluation. The core stance: tool interface quality is a first-order driver of agent reliability, standard protocols are how an enterprise avoids N-by-M integration sprawl, and an agentic system without full-chain tracing is undebuggable by construction.

## Principles

### Why standard interfaces matter

Without a standard, every AI application integrates with every data source and tool bilaterally: N applications times M systems means N x M custom integrations, each with its own auth, schema, and failure semantics. A protocol reduces this to N + M: each application implements one client, each system implements one server, and any client can use any server [MCP, Architecture]. Secondary benefits that matter at enterprise scale:

- Vendor portability: capabilities are not locked to one model provider's function-calling format.
- Centralized security review: one server implementation to audit per system instead of one integration per application.
- A single choke point per capability for authorization, rate limiting, and logging.
- Runtime discovery: clients learn what a server offers via list operations instead of compile-time coupling [MCP, Architecture].

### MCP architecture

The Model Context Protocol is an open standard for connecting AI applications to context and capabilities, now under open governance (MCP moved to the Linux Foundation's agentic AI umbrella; the related A2A protocol has been hosted by the Linux Foundation since June 2025) [MCP, Architecture; IBM, A2A Overview].

- Participants: an MCP host (the AI application) creates one MCP client per connection; each client holds a dedicated connection to one MCP server (the program exposing context or actions). Local servers typically serve one client; remote servers serve many [MCP, Architecture].
- Layers: a data layer defining a JSON-RPC 2.0 protocol (lifecycle management, capability negotiation via initialize, primitives, notifications) and a transport layer: stdio for local same-machine servers, Streamable HTTP (POST plus optional server-sent events) for remote servers, with OAuth-based authorization recommended for remote transports [MCP, Architecture].
- Server primitives: tools (executable functions the model can invoke, each with a name, title, description, and JSON Schema inputSchema), resources (contextual data such as files or records), and prompts (reusable interaction templates). Clients discover primitives with */list methods and invoke tools with tools/call; servers push list_changed notifications when their capabilities change, so toolsets can be dynamic [MCP, Architecture].
- Client primitives: sampling (a server requests an LLM completion from the host, staying model-independent), elicitation (a server asks the user for input or confirmation, useful for approval gates), and logging [MCP, Architecture].

Decision rule, MCP server vs native function tools. Expose a capability as an MCP server when:

- It will be consumed by more than one agent or host application.
- It wraps a system owned by another team; the server is the interface contract between teams.
- The toolset changes at runtime and clients need discovery and change notifications.
- Third-party hosts (IDEs, chat clients, other vendors' agents) should be able to reach it.

Keep tools native (in-process function definitions) when they are single-application, latency-critical, or trivially thin wrappers; a protocol hop adds an operational component and a supply-chain surface without integration payoff. Every third-party MCP server is supply-chain surface (ASI04): apply the allowlisting, signing, and sandboxing controls in knowledge/security-governance.md [OWASP, Agentic Top 10 2026].

### Agent-to-agent interoperability

For peer agents owned by different teams or vendors, A2A (Agent2Agent) is the emerging standard: each agent publishes an Agent Card (a JSON document at /.well-known/agent-card.json declaring service endpoints, supported authentication schemes, and skills with input and output modes), and agents exchange tasks over JSON-RPC 2.0 on HTTPS with SSE streaming. The protocol is Apache 2.0 licensed under Linux Foundation governance with a stable v1.0 [IBM, A2A Overview].

Design guidance:

- Use MCP for agent-to-tool and agent-to-context integration; use A2A for agent-to-agent delegation across trust or organizational boundaries [MCP, Architecture; IBM, A2A Overview].
- Inside a single application, direct orchestration (shared process, queue, function calls) is simpler, cheaper, and easier to trace; do not introduce a network protocol between agents you own and deploy together.
- Inter-agent channels require mutual authentication, encryption, and message signing regardless of protocol; unauthenticated agent channels enable spoofing and instruction injection (ASI07) [OWASP, Agentic Top 10 2026].

### Tool interface design quality

Agents fail through their tools more often than through their reasoning; the tool contract is prompt engineering with a schema. Requirements for every tool in a design:

- Unambiguous naming: namespaced, specific names (calculator_arithmetic, weather_current) rather than generic verbs, so the model cannot confuse adjacent tools [MCP, Architecture]. Ambiguous naming is an exploitation vector as well as a reliability problem (ASI02) [OWASP, Agentic Top 10 2026].
- Descriptions written for the model: what the tool does, when to use it, when not to use it, and example arguments. The description is the primary signal the model uses to select and parameterize the tool [MCP, Architecture].
- Typed schemas: JSON Schema for inputs with enums, defaults, required fields, and per-parameter descriptions (including format examples in the description, such as "City name, address, or coordinates"); constrain inputs at the schema rather than validating after the fact [MCP, Architecture].
- Idempotency: retries are inherent to agent loops, so mutating tools should accept idempotency keys or be safely re-invocable; annotate side effects so the orchestrator knows what is retryable and what needs an approval gate.
- Error contracts: return structured, actionable errors ("date must be YYYY-MM-DD, got 14/07/2026") rather than stack traces or bare 500s. A good error message lets the model self-correct in one step instead of looping; distinguish retryable errors from permanent ones.
- Right-sized outputs: return what the model needs, paginated or summarized; dumping raw payloads burns context budget and degrades reasoning (see knowledge/context-memory.md).
- Least privilege per tool: scoped credentials and server-side authorization, per knowledge/security-governance.md.

Treat the tool inventory as a reviewed artifact: name, description quality, schema, idempotency class, error contract, and autonomy tier for every tool.

### Interface versioning and change management

Tool contracts are behavioral dependencies of the model, so changes to them are releases, not refactors:

- A changed tool description or schema can shift tool selection behavior as much as a prompt change; route tool contract changes through the same eval gates as prompt changes (see knowledge/evaluation.md).
- Version tool contracts explicitly and support a deprecation window; agents built against the old contract fail in confusing, non-obvious ways (wrong arguments, abandoned calls) rather than loudly.
- For MCP servers, rely on capability negotiation at initialize and list_changed notifications to communicate change, but treat notification handling as a client requirement to verify, not assume [MCP, Architecture].
- Pin the OTel semantic convention version in instrumentation and record it, since gen_ai.* conventions are still in Development status and attribute names can evolve [OTel, GenAI SemConv].
- Record prompt version, tool contract version, and model version on every trace, which is what makes any production regression attributable to a specific change.

### Observability architecture: trace the full reasoning chain

Adopt the OpenTelemetry GenAI semantic conventions so traces are portable across backends and vendors. The conventions (now maintained in a dedicated OpenTelemetry repository; gen_ai.* attributes are in Development stability status, so pin the convention version in instrumentation) define spans for inference calls, tool executions, and agent operations, plus attribute registries for gen_ai.* and mcp.* [OTel, GenAI SemConv].

Span model. One trace per user request or agent task:

- Root span: the agent invocation or workflow run.
- Child spans: every LLM call, every tool execution, every retrieval, every sub-agent delegation. Nothing the system did should be absent from the tree.
- Inference span naming: "{gen_ai.operation.name} {gen_ai.request.model}" (for example "chat claude-sonnet-4-5"), typically span kind CLIENT [OTel, GenAI SemConv].

Key attributes [OTel, GenAI SemConv]:

- gen_ai.operation.name: chat, text_completion, embeddings, retrieval, execute_tool, and agent operations.
- gen_ai.provider.name: the model provider (openai, anthropic, gcp.vertex_ai, and so on).
- gen_ai.request.model and gen_ai.response.model: record both, since they differ under aliasing and routing.
- gen_ai.usage.input_tokens and gen_ai.usage.output_tokens: the basis for all cost accounting.
- gen_ai.request.temperature, gen_ai.request.top_p, gen_ai.response.finish_reasons: needed to reproduce behavior.
- gen_ai.conversation.id: stitches multi-turn sessions across traces.

Metrics conventions. Alongside spans, the conventions define client metrics: a token usage histogram (gen_ai.client.token.usage, dimensioned by operation, provider, model, and token type) and an operation duration histogram (gen_ai.client.operation.duration) [OTel, GenAI SemConv]. Emit both even where span sampling is reduced, because metrics are the always-on layer that alerting rides on. The registry also namespaces mcp.* attributes, so MCP tool calls can be traced with the same conventions end to end [OTel, GenAI SemConv].

Content capture. Prompts and completions are opt-in attributes precisely because they are large and sensitive; enable capture with PII redaction and truncation, or route full content to a separate restricted store keyed by trace ID [OTel, GenAI SemConv]. The audit trail requirements in knowledge/security-governance.md still demand full-chain capture somewhere; the general-purpose trace backend need not be that place.

Cost tracking. Derive cost per span from token counts and a model price table, then aggregate by user, tenant, feature, and agent. Per-span cost is what makes multi-agent token economics visible (see knowledge/multi-agent-orchestration.md) and feeds the cost governance controls in knowledge/enterprise-architecture.md.

Sampling strategy, given GenAI payload sizes:

- Metrics (token counters, latency and duration histograms): 100 percent.
- Span structure (no content): at or near 100 percent for agentic flows, since failures are rare-path and post-hoc sampling cannot recover an unrecorded trajectory.
- Full content capture: tail-based sampling that keeps 100 percent of errors, guardrail triggers, and outlier-latency traces, plus a small percentage of successes for baseline comparison.

### Debugging workflows from traces

- Trajectory inspection: an agent failure is diagnosed by reading the trace as a transcript: which context went in, which tool was chosen, what the tool returned, where reasoning went wrong. This is the same transcript-reading discipline that evaluation requires [Anthropic, Demystifying Evals].
- Failure replay: because the trace captures prompt assembly, model parameters, tool arguments, and tool results, a failure can be re-run offline with recorded inputs (stubbing tools with recorded outputs) to test a fix deterministically before shipping.
- Trace-to-eval pipeline: failed and low-scored traces are sampled, redacted, labeled, and promoted into the golden dataset, closing the observability-eval loop defined in knowledge/evaluation.md [Anthropic, Demystifying Evals].
- Correlation keys: propagate trace ID into guardrail verdicts, human approval records, and user feedback events, so a complaint or a blocked action joins to its full reasoning chain in one query.
- Session stitching: use gen_ai.conversation.id to reconstruct multi-turn sessions across traces, since many agent failures (context loss, memory poisoning, goal drift) are only visible at session granularity, not within a single request [OTel, GenAI SemConv].

### Dashboards and alerting

Specify these signals in every design:

- Cost: spend per tenant, feature, and agent; tokens-per-request distribution; cost per successful task. Alert on anomalies: a looping agent shows up as a token spike long before an invoice does, and unbounded consumption is a named risk (LLM10) [OWASP, LLM Top 10 2025].
- Latency: p50/p95/p99 end-to-end and per span type (model call vs tool vs retrieval); time-to-first-token for streaming UX; alert on p95 SLO burn (see knowledge/latency-cost-reliability.md).
- Errors and loops: model API error and timeout rates, tool error rates by tool and error class, retry counts, steps-per-task distribution with a hard step-budget alarm.
- Safety: guardrail trigger rates by layer (input filter, classifier, output handler), human-escalation rate, approval rejection rate. A spike is either an attack or a regression; both are page-worthy.
- Quality: online eval scores (groundedness, relevance on sampled traffic) trended per release; alert on drift against the offline baseline (see knowledge/evaluation.md).
- Release attribution: every panel segmented by model version and prompt version, so a canary regression is attributable in one glance.

## When to apply

- Every design: the tool inventory (name, description, schema, idempotency, error contract, autonomy tier per tool) and the observability section (trace model, gen_ai.* conventions, content-capture policy, dashboard signal list) are both mandatory.
- Capabilities shared across teams, applications, or vendors: expose as MCP servers; single-application latency-critical tools stay native [MCP, Architecture].
- Cross-organization or cross-vendor agent delegation: A2A with agent cards and mutual authentication; do not invent a bespoke agent RPC [IBM, A2A Overview].
- Multi-agent systems: per-span cost attribution and step budgets are mandatory, since token amplification and cascading failures are the dominant operational risks (ASI08) [OWASP, Agentic Top 10 2026].
- Regulated deployments: reconcile the opt-in content capture policy with the audit retention requirements in knowledge/security-governance.md at design time, not after the first incident.
- Vendor-neutrality requirements: OTel GenAI conventions plus MCP interfaces are the current portable baseline; name them explicitly in the design rather than a vendor's proprietary equivalent [OTel, GenAI SemConv; MCP, Architecture].

## Common failure modes

- Bespoke integration per tool per application: the N x M sprawl a protocol exists to prevent, discovered when the third application needs the same connector [MCP, Architecture].
- Wrapping every trivial in-process function as an MCP server, adding operational hops and supply-chain surface with no reuse payoff.
- Vague tool descriptions and untyped or catch-all string parameters, producing wrong-tool selection and malformed arguments that look like "model stupidity" but are interface defects [MCP, Architecture].
- Tools that return raw stack traces or bare failures, so the agent loops instead of self-correcting; no idempotency handling, so retries double-book side effects.
- Logging only the final response: no retrieval spans, no tool arguments, no prompt version, making failures unreproducible and forensics impossible.
- Capturing full prompts and completions at 100 percent without redaction: a compliance incident and a storage bill, when opt-in content capture with tail sampling was the designed-for path [OTel, GenAI SemConv].
- No per-span token and cost attribution, so a looping or over-delegating agent is discovered on the monthly invoice (LLM10) [OWASP, LLM Top 10 2025].
- Recording gen_ai.request.model but not gen_ai.response.model, so provider-side routing and aliasing silently confound comparisons [OTel, GenAI SemConv].
- Dashboards without model and prompt version segmentation, so regressions cannot be attributed to a release.
- No trace-to-eval pipeline: production keeps failing in ways the offline suite never learns about [Anthropic, Demystifying Evals].
- Unauthenticated inter-agent channels inside "trusted" networks, leaving spoofing and injection paths open (ASI07) [OWASP, Agentic Top 10 2026].

## Citations

- [MCP, Architecture] Model Context Protocol: architecture overview. https://modelcontextprotocol.io/docs/learn/architecture
- [OTel, GenAI SemConv] OpenTelemetry GenAI semantic conventions (spans, attribute registries). https://github.com/open-telemetry/semantic-conventions-genai and https://opentelemetry.io/docs/specs/semconv/gen-ai/
- [IBM, A2A Overview] What is Agent2Agent (A2A) Protocol? https://www.ibm.com/think/topics/agent2agent-protocol
- [OWASP, Agentic Top 10 2026] OWASP Top 10 for Agentic Applications 2026. https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- [OWASP, LLM Top 10 2025] OWASP Top 10 for LLM Applications 2025. https://genai.owasp.org/llm-top-10/
- [Anthropic, Demystifying Evals] Demystifying evals for AI agents. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
