# Model-platform primitives for agentic design

Purpose: this document grounds design decisions in the concrete mechanics the model platform gives you, so that other documents can assert "cache the stable prefix" or "return structured errors" and point here for the primary evidence. It covers the six primitives an agentic design actually rests on: tool use and the tool-result loop, structured outputs and constrained decoding, extended and interleaved thinking, prompt caching, the agent SDK layer and its declarative-versus-code-first axis, and safety classifiers as a drop-in guardrail component. The stance: these are not tutorials but load-bearing constraints, and a design that ignores the platform's actual contract (thinking blocks that must be replayed, prefixes that must be byte-stable, schemas that must be closed) fails in ways that read as model unreliability but are integration defects.

## Principles

### Tool use is a typed request-response loop, not a side channel

A client tool is defined by three fields the model reasons over: `name`, `description`, and an `input_schema` expressed as JSON Schema with typed properties and a `required` list [Anthropic, Tool Use]. OpenAI's shape is identical: a function has `name`, `description`, and a `parameters` JSON Schema [OpenAI, Function Calling]. The loop is fixed and worth internalizing because every agent framework is a wrapper over it: you send the request with `tools`; the model returns `stop_reason: "tool_use"` and one or more `tool_use` blocks (each with an `id`, `name`, and `input`); your code executes and sends back a `tool_result` block carrying the matching `tool_use_id` and `content`; the model consumes the result and either answers or calls again [Anthropic, Tool Use]. OpenAI mirrors this with a `tool_calls` array answered by `role: "tool"` messages keyed on `tool_call_id` [OpenAI, Function Calling].

The loop distinguishes where code runs: client tools (your functions, plus Anthropic-schema tools like `bash` and `text_editor`) execute in your application and you must return the `tool_result`, while server tools (web search, code execution) run on the provider's infrastructure and return results inline [Anthropic, Tool Use]. This where-it-runs distinction is the same client-versus-agent-side split framed in knowledge/building-effective-agents.md, and it determines your security surface: only client-tool execution sits inside your trust boundary.

Design implications that follow directly from the contract:

- The `description` is the primary control surface. The model decides whether and how to call a tool from its description, so descriptions are prompt engineering: state what the tool does, when to use it, when not to, and give an example argument [Anthropic, Tool Use]. This is the platform-level basis for the tool-quality requirements in knowledge/interoperability-observability.md.
- Whether the model calls a tool at all is steerable but probabilistic. Under the default `auto`, the model calls a tool when the request maps to its described capability and the answer is not already in context, and a system-prompt nudge ("investigate with tools before responding") shifts that boundary [Anthropic, Tool Use]. Do not encode hard preconditions in prose; enforce them with `tool_choice` or at the tool boundary.
- Tool definitions are billed input on every turn. The `tools` parameter (names, descriptions, schemas) plus a tool-use system prompt are added to input tokens each request; Anthropic publishes the per-model system-prompt overhead (for example roughly 290 tokens for Claude Opus 4.8 under `auto`, more under forced choice) [Anthropic, Tool Use]. A sprawling tool inventory is a standing per-turn cost, which is why it belongs in the cached prefix (below).
- Missing-parameter behavior is model-dependent. A more capable model tends to recognize a missing required parameter and ask; a lighter model may silently infer a plausible value [Anthropic, Tool Use]. Do not rely on the model to refuse under-specified calls; validate at the tool boundary.
- Error contracts drive self-correction. Anthropic's loop signals failure by returning a `tool_result` with `is_error` set rather than a stack trace [Anthropic, Tool Use]; a structured, actionable error lets the model retry in one step instead of looping. This is the platform primitive behind the error-contract guidance in knowledge/interoperability-observability.md.
- Idempotency is your responsibility, not the platform's. The loop will re-issue a call after a timeout or on a retry, so mutating tools need the idempotency keys and dedup discipline in knowledge/latency-cost-reliability.md; the API does not deduplicate side effects for you.

### Parallel tool calls and forcing tool choice

When independent calls have no data dependency, the model can emit several `tool_use` blocks in one assistant turn, and the orchestrator executes them concurrently, then returns all results together [Anthropic, Tool Use]. This is a latency lever (fan out three lookups in one round trip instead of three), but only for genuinely independent calls: dependent steps still serialize and pay per-step latency, which is where the tail-amplification math in knowledge/latency-cost-reliability.md applies.

Control knobs to specify in a design, with the two providers' names side by side:

| Intent | Anthropic | OpenAI |
|---|---|---|
| Model decides | `tool_choice: {"type": "auto"}` | `tool_choice: "auto"` |
| Must call some tool | `{"type": "any"}` | `tool_choice: "required"` |
| Must call a named tool | `{"type": "tool", "name": ...}` | forced function by name |
| Suppress tools | `{"type": "none"}` | `tool_choice: "none"` |
| At most one call per turn | `disable_parallel_tool_use: true` | `parallel_tool_calls: false` |
| Enforce argument schema | `strict: true` on the tool | `strict: true` on the function |

Sources: [Anthropic, Tool Use] [OpenAI, Function Calling].

- Disable parallelism when order or idempotency matters, using the flags above; independent read-only lookups are the case where parallel calls pay off [Anthropic, Tool Use; OpenAI, Function Calling].
- Forcing a tool costs more tool-use system-prompt tokens than `auto` on Anthropic models, a small but real per-request premium [Anthropic, Tool Use].
- Adding `strict: true` constrains arguments to match the schema exactly on both platforms, removing a whole class of malformed-argument retries [Anthropic, Tool Use; OpenAI, Function Calling].

### Structured outputs: enforce a schema when you parse the output

Constrained decoding is a distinct primitive from tool use. JSON mode only guarantees syntactically valid JSON; only Structured Outputs guarantees the output conforms to a supplied schema, by constraining generation at the token level so required keys cannot be omitted and enum values cannot be invented [OpenAI, Structured Outputs]. Enable it with `response_format: {"type": "json_schema", "json_schema": {"strict": true, "schema": ...}}` (Chat Completions) or the `text.format` equivalent in the Responses API [OpenAI, Structured Outputs]. It is a newer-model feature (gpt-4o-2024-08-06 and later), whereas plain JSON mode is what older models offer, so a design that depends on true schema adherence also pins a model floor [OpenAI, Structured Outputs].

The schema subset is restrictive by design, and the restrictions are the failure modes to design around:

- Every object field must be listed in `required`; optionality is expressed by unioning the type with `null`, never by omission [OpenAI, Structured Outputs; OpenAI, Function Calling]. A schema that leaves fields "optional" the ordinary JSON Schema way will be rejected.
- `additionalProperties: false` is mandatory on every object, and nesting depth and total property counts are capped [OpenAI, Structured Outputs]. Deeply nested or open-ended schemas do not qualify and must be flattened.
- Safety refusals are still possible and arrive in a `refusal` field rather than as schema-shaped content, so parsing code must branch on refusal before trusting the payload [OpenAI, Structured Outputs].

Decision rule: use structured outputs when your code consumes the model's answer as data (extraction, classification, a step that feeds the next stage), and use function-calling tools when the model reaches into your systems [OpenAI, Structured Outputs]. In an agent pipeline this maps cleanly: internal reasoning-to-code handoffs (a router emitting a route label, an extractor emitting fields) should enforce a schema so a downstream parser never sees free text, while external effects go through typed tools. Enforcing a schema also caps output length, which is the total-latency lever in knowledge/latency-cost-reliability.md.

### Extended and interleaved thinking: a budgeted reasoning primitive

Extended thinking has the model emit `thinking` content blocks before its answer; on newer models these are governed by an adaptive effort setting, while Opus 4.5 and earlier take an explicit `budget_tokens` that must be less than `max_tokens` [Anthropic, Extended Thinking]. The design-relevant facts:

- You pay for the full thinking, always. Billing counts the full thinking tokens generated, not the summarized or omitted text you receive; a `display` of `"summarized"` or `"omitted"` changes latency and what you see, never cost [Anthropic, Extended Thinking]. Thinking is therefore a cost and latency dial, and belongs in the routing decision: reserve large reasoning budgets for genuinely hard steps (planning, multi-constraint synthesis) and keep cheap steps (classification, extraction) thin, consistent with the routing guidance in knowledge/latency-cost-reliability.md.
- Thinking blocks are stateful and must be replayed verbatim. During tool use you must pass the unmodified `thinking` block (and any `redacted_thinking` block) from the last assistant turn back with the `tool_result`; the sequence cannot be rearranged or edited, or the API returns a 400 `invalid_request_error` [Anthropic, Extended Thinking]. The `signature` field carries the encrypted full thinking for multi-turn continuity even when the visible thinking is omitted [Anthropic, Extended Thinking]. Any orchestration layer that reconstructs history (summarization, context compaction, a home-grown agent loop) must preserve these blocks intact, which is a real constraint on context-management code.
- Interleaved thinking is what makes tool loops reason. It lets the model think between tool calls, using each intermediate result to decide the next action rather than committing to a plan up front; it is automatic with adaptive thinking on current models and gated behind the `interleaved-thinking-2025-05-14` beta header on Opus 4.5 and earlier [Anthropic, Extended Thinking]. Under interleaved thinking `budget_tokens` may exceed `max_tokens` because it is the budget across all thinking blocks in the turn [Anthropic, Extended Thinking].
- Thinking narrows tool_choice. With thinking enabled, tool use supports only `tool_choice` of `auto` or `none`; `any` or a forced tool errors, and you cannot toggle thinking mid-turn [Anthropic, Extended Thinking]. A design that both forces a specific tool and wants reasoning has to choose one.
- Display mode is a latency knob, not a cost or quality one. On current models the default is `"omitted"` (empty thinking text, signature retained), which starts streaming the answer sooner; `"summarized"` streams a readable summary first [Anthropic, Extended Thinking]. On Opus 4.5+ and Sonnet 4.6+ thinking blocks are retained and count toward input tokens when cached, so thinking interacts with the caching economics above [Anthropic, Extended Thinking].

This is the platform realization of the augmented-LLM building block in knowledge/building-effective-agents.md: reasoning, tools, and their interleaving are one budgeted mechanism, not separate features.

### Prompt caching: design the cacheable prefix deliberately

Prompt caching stores the model's internal state for a prompt prefix so it is not recomputed on the next request that shares it. You mark cacheable spans with `cache_control: {"type": "ephemeral"}` breakpoints (up to four), and the cache is built in the fixed order `tools`, then `system`, then `messages`, a hierarchy where a change at one level invalidates that level and everything after it [Anthropic, Prompt Caching]. The economics are decisive for agent loops:

- Read is cheap, write is a small premium: cache-read tokens cost 0.1x base input (a 90 percent discount), a 5-minute-TTL write costs 1.25x and a 1-hour write 2x base input [Anthropic, Prompt Caching]. The break-even and agent-loop hit-rate math is worked in knowledge/latency-cost-reliability.md; the primitive is what makes it true.
- There is a minimum cacheable length, model-dependent (for example 1,024 tokens on Claude Opus 4.8 and Sonnet, higher on some models); shorter prefixes are silently not cached, with no error [Anthropic, Prompt Caching].
- Usage is observable via `cache_creation_input_tokens` and `cache_read_input_tokens`, and `input_tokens` counts only tokens after the last breakpoint [Anthropic, Prompt Caching]. Track cache-read share as a first-class metric (knowledge/interoperability-observability.md).
- Caching can be automatic (a single request-level `cache_control`) or explicit (per-block breakpoints for fine control), and cache matching looks back a bounded window of 20 blocks per breakpoint, so a long, growing conversation needs multiple breakpoints to keep hitting [Anthropic, Prompt Caching].
- The default TTL is five minutes and refreshes on every hit, so a steadily-used prefix stays warm indefinitely; the 1-hour TTL at 2x write cost suits bursty traffic with gaps longer than five minutes [Anthropic, Prompt Caching].

The design rule: put the stable, high-volume material at the front (the system prompt, the full tool inventory, few-shot examples, and any retrieved corpus that is constant across the turn) and the volatile material (the user turn, timestamps, request IDs) last, so the prefix is byte-stable and hits repeatedly [Anthropic, Prompt Caching]. Anything per-request placed inside the cached span drops the hit rate to zero. Agent loops are the ideal case because every iteration resends the same tools and system prompt; this is exactly why the tool inventory, though billed every turn, is nearly free once cached. OpenAI's prompt caching is automatic on eligible prompts and rewards a consistent prefix and cache key; the same static-first structure applies, and the provider comparison lives in knowledge/latency-cost-reliability.md.

### Agent SDKs and the declarative-versus-code-first choice

Above the raw API sit orchestration frameworks that trade control for convenience along a spectrum, and the choice is architectural because it determines what you can inspect and eval.

- OpenAI Agents SDK is a lightweight, Python-first framework over four primitives: Agents (instructions plus tools in a built-in loop), handoffs (one agent delegating to a specialist), guardrails, and Sessions, orchestrated by a Runner [OpenAI, Agents SDK]. Its notable design point is that guardrails "run input validation and safety checks in parallel with agent execution, and fail fast when checks do not pass" [OpenAI, Agents SDK], so a cheap validator can race the expensive agent turn rather than adding serial latency, which fits the input-guardrail budget in knowledge/latency-cost-reliability.md.
- Google ADK is a code-first, enterprise-scale framework built on hierarchical multi-agent composition [Google, ADK]. It distinguishes an `LlmAgent` (reasoning-driven) from workflow agents that impose deterministic control flow (sequential, parallel, and loop), lets you weave deterministic code with model reasoning, exposes Function, MCP, and OpenAPI tools, and is model-agnostic (Gemini, Gemma, Claude, local models) and deployment-agnostic [Google, ADK]. The workflow-agent types are the platform expression of the workflows-versus-agents split in knowledge/building-effective-agents.md: use a deterministic sequential or loop agent where control flow is known, an LlmAgent where it is not.
- The code-agent axis: Hugging Face smolagents' `CodeAgent` has the model write its actions as executable Python rather than emitting JSON tool calls, which the authors argue yields natural composability (function nesting, loops, conditionals) and fewer steps, at the cost of requiring sandboxed execution; a `ToolCallingAgent` keeps the JSON paradigm where preferred [HuggingFace, smolagents]. This is one end of a real design axis: JSON tool calls are auditable and constrainable but verbose across steps, while code actions are expressive and compact but expand the execution-security surface (they demand the sandboxing controls in knowledge/security-governance.md).

Positioned on the declarative-to-code axis:

| Framework | Orchestration surface | Action encoding | Notable primitive |
|---|---|---|---|
| OpenAI Agents SDK | Lightweight code-first Python, Runner-driven loop | JSON tool calls | Guardrails run in parallel with the agent turn and fail fast [OpenAI, Agents SDK] |
| Google ADK | Code-first, hierarchical multi-agent | JSON tool calls | Deterministic workflow agents (sequential, parallel, loop) alongside LlmAgent [Google, ADK] |
| Hugging Face smolagents | Minimal Python library | Model-authored Python (CodeAgent) or JSON (ToolCallingAgent) | Code actions for native composability, requiring a sandbox [HuggingFace, smolagents] |

Framework-opacity risk applies to all of them. Every framework assembles the prompt, the tool schemas, the context window, and the retry and handoff logic on your behalf, and the more declarative the surface, the less visible that assembly is. A design that adopts a framework must still meet the full-chain tracing requirement in knowledge/interoperability-observability.md: if you cannot see the exact prompt, tool result, and thinking blocks the framework sent, you cannot debug a failure or promote it into an eval. Prefer frameworks that expose their traces, and pin framework versions since a framework upgrade can silently change prompt assembly and shift behavior the same way a prompt edit does.

### Safety classifiers as a platform primitive

A guardrail layer does not have to be bespoke. Meta's Llama Guard 4 is a purpose-built safety classifier you can drop into the guardrail stack: a natively multimodal 12-billion-parameter dense model that classifies content in both LLM inputs (prompt classification) and LLM responses (response classification), generating a `safe`/`unsafe` verdict plus the violated category codes when unsafe [Meta, Llama Guard 4]. It scores against the MLCommons hazards taxonomy of fourteen categories, S1 through S14 (Violent Crimes, Non-Violent Crimes, Sex-Related Crimes, Child Sexual Exploitation, Defamation, Specialized Advice, Privacy, Intellectual Property, Indiscriminate Weapons, Hate, Suicide and Self-Harm, Sexual Content, Elections, and Code Interpreter Abuse), and handles text and mixed text-and-image prompts [Meta, Llama Guard 4].

Design guidance:

- Place it at both boundaries. It is trained to run on the input and on the output, which maps onto the input-filter and output-handler layers of the defense-in-depth architecture in knowledge/security-governance.md.
- It is risk reduction, never the security boundary. A classifier is probabilistic; 95 percent detection is a failing grade against an adversary who iterates, so a classifier verdict constrains but never replaces the architectural controls (privilege limits, isolation, breaking the lethal trifecta) in knowledge/security-governance.md.
- Log its verdicts with the trace. Route the category codes into the guardrail-verdict trail and the guardrail-trigger-rate dashboard in knowledge/interoperability-observability.md so a spike is attributable, and budget its latency as an advisory or policy check per knowledge/latency-cost-reliability.md.
- The taxonomy is a starting point, not your policy. The fourteen categories are general-purpose; enterprise deployments usually need domain policies (regulatory disclosure, tenant confidentiality) layered on top.

## When to apply

- Every tool-using design: specify the tool contract (name, typed `input_schema`, `strict` conformance, structured `is_error` results) and whether parallel calls are enabled or disabled per idempotency needs [Anthropic, Tool Use; OpenAI, Function Calling].
- Any step whose output your code parses: enforce a closed JSON Schema with structured outputs rather than parsing free text, branch on the refusal path, and confirm the target model supports constrained decoding rather than only JSON mode [OpenAI, Structured Outputs].
- Latency-sensitive multi-tool steps: allow parallel tool calls for genuinely independent lookups to collapse round trips, but disable them where ordering or a shared side effect makes concurrency unsafe [Anthropic, Tool Use; OpenAI, Function Calling].
- Reasoning-heavy steps: set the thinking budget or effort per step, reserve large budgets for hard steps only, and verify the orchestration layer replays thinking blocks verbatim through tool loops [Anthropic, Extended Thinking].
- Any multi-turn or agentic workload above the model's minimum cacheable length: design the static-first cached prefix (tools, system, corpus) and track cache-read share; it is the default, not an optimization [Anthropic, Prompt Caching].
- Framework selection: choose along the declarative-to-code-first and JSON-versus-code-action axes deliberately, and only adopt a framework whose trace output satisfies the observability requirement [OpenAI, Agents SDK; Google, ADK; HuggingFace, smolagents].
- Multimodal or high-volume content-safety requirements: name a specific input/output classifier such as Llama Guard 4 in the guardrail stack, at both boundaries, rather than leaving "add moderation" unspecified [Meta, Llama Guard 4].
- Cost-sensitive designs at scale: fold the tool inventory and system prompt into the cached prefix and pick per-step thinking budgets before assuming a model is too expensive; caching and thinking are the two largest platform-level cost dials [Anthropic, Prompt Caching; Anthropic, Extended Thinking].

## Common failure modes

- Vague tool descriptions and open schemas: the model selects the wrong tool or emits malformed arguments, read as model error when it is an interface defect fixable with a sharper description and `strict: true` [Anthropic, Tool Use; OpenAI, Function Calling].
- Parsing free-text output with a regex where a schema was available: an omitted key or invented enum value breaks the downstream stage, exactly the failure constrained decoding prevents [OpenAI, Structured Outputs].
- Enabling parallel tool calls for steps that actually depend on each other: the model fans out calls whose inputs were meant to come from a prior result, producing stale or inconsistent arguments; serialize them by disabling parallelism [Anthropic, Tool Use].
- Enforcing a schema but forgetting the refusal branch: safety refusals arrive in the `refusal` field, and code that assumes schema-shaped content crashes or mis-parses them [OpenAI, Structured Outputs].
- Stripping or reordering thinking blocks in a custom loop or after summarizing history: a 400 `invalid_request_error`, or silent loss of reasoning continuity across tool calls [Anthropic, Extended Thinking].
- Treating thinking as free: reserving large reasoning budgets on cheap high-volume steps inflates cost and latency because full thinking tokens are always billed [Anthropic, Extended Thinking].
- A timestamp, request ID, or per-user string inside the cached prefix: the hit rate collapses to zero while the team wonders why costs did not fall [Anthropic, Prompt Caching].
- A prefix below the minimum cacheable length: no caching happens and no error is returned, so the missing savings are invisible until someone reads the usage fields [Anthropic, Prompt Caching].
- A conversation that grows past the 20-block lookback with a single breakpoint: cache hits quietly stop once the match falls out of the window, and cost creeps back up [Anthropic, Prompt Caching].
- A schema marked strict but authored with ordinary optional fields or open objects: the request is rejected because Structured Outputs requires all fields in `required` and `additionalProperties: false` [OpenAI, Structured Outputs].
- Adopting an opaque framework and losing the trace: failures cannot be replayed or promoted into evals, and a framework upgrade shifts prompt assembly like an unversioned prompt change [OpenAI, Agents SDK; Google, ADK].
- Shipping code agents without sandboxing: the expressiveness of model-authored Python becomes an arbitrary-execution surface [HuggingFace, smolagents].
- Treating a safety classifier verdict as the security boundary: accepting 95 percent detection as sufficient and skipping the architectural controls the classifier was only ever meant to supplement [Meta, Llama Guard 4].
- Leaving idempotency to the platform: assuming the tool loop deduplicates retried calls, so a timed-out mutation double-books a side effect [Anthropic, Tool Use].
- Forcing a tool while thinking is enabled: the request errors because thinking restricts `tool_choice` to `auto` or `none`, discovered only at runtime [Anthropic, Extended Thinking].

## Citations

- [Anthropic, Tool Use] Anthropic documentation, Tool use with Claude. https://platform.claude.com/docs/en/build-with-claude/tool-use
- [Anthropic, Extended Thinking] Anthropic documentation, Extended thinking. https://platform.claude.com/docs/en/build-with-claude/extended-thinking
- [Anthropic, Prompt Caching] Anthropic documentation, Prompt caching. https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- [OpenAI, Function Calling] OpenAI documentation, Function calling. https://developers.openai.com/api/docs/guides/function-calling
- [OpenAI, Structured Outputs] OpenAI documentation, Structured outputs. https://developers.openai.com/api/docs/guides/structured-outputs
- [OpenAI, Agents SDK] OpenAI Agents SDK (Python) documentation. https://openai.github.io/openai-agents-python/
- [Google, ADK] Google Agent Development Kit documentation. https://google.github.io/adk-docs/
- [HuggingFace, smolagents] Hugging Face smolagents documentation. https://huggingface.co/docs/smolagents/en/index
- [Meta, Llama Guard 4] Meta Llama Guard 4 12B model card. https://github.com/meta-llama/PurpleLlama/blob/main/Llama-Guard4/12B/MODEL_CARD.md
