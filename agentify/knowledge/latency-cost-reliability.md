# Latency, cost, and reliability engineering for LLM pipelines

This document supplies the serving-layer engineering that turns an agent design into a production system: streaming and time-to-first-token as the UX lever, the caching tier stack and its economics, model routing and cascades, cross-provider fallbacks with idempotency discipline, rate limiting and load shedding, SLO design under tail latency amplification, and reliability bounds for agent loops. Use it together with the NFR checklist in enterprise-architecture.md: that document sets the targets, this one shows how to hit them.

## Principles

### Streaming and time-to-first-token as the UX lever

LLM latency is dominated by output length: input tokens are processed in parallel while output tokens generate sequentially, so a 20-token answer and a 500-token answer from the same prompt differ by an order of magnitude in completion time [Huyen, LLM Engineering]. Two consequences:

- Split every latency SLO into time-to-first-token (TTFT) and total completion time. TTFT is what users perceive as responsiveness; stream every user-facing generation so perceived latency approaches TTFT rather than total time.
- Attack the two independently. TTFT is cut by prompt caching (cached prefixes significantly reduce TTFT because the prefix is not reprocessed [Anthropic, Prompt Caching]), smaller prompts, and warmer routing; total time is cut by constraining output length (max tokens, terse formats, structured output) and by choosing faster models for long generations.
- Inside agent chains, intermediate steps have no user watching, so streaming buys nothing there; bound intermediate outputs aggressively (classification steps should emit tokens, not essays) because sequential output generation is the cost you pay at every step [Huyen, LLM Engineering].
- Pre-warm caches for latency-sensitive paths (for example, load the system prompt and tool definitions into cache at session start) [Anthropic, Prompt Caching].

### Caching tiers and their economics

Order the tiers by specificity; each has distinct hit-rate economics.

| Tier | What is cached | Saves | Typical hit rate | Chief risk |
|---|---|---|---|---|
| Exact-match response | Full response per normalized request | Whole model call | Low for free text, high for programmatic calls | Staleness after prompt/model change |
| Semantic response | Response served on embedding similarity | Whole model call | Workload-dependent; meaningful only for repetitive query distributions | False hits: wrong or cross-tenant answer |
| Provider prompt/prefix | KV state of shared prompt prefix | about 90 percent of cached input cost plus TTFT | Above 90 percent on static prefixes in agent loops | Dynamic content breaking the prefix |

1. Exact-match response cache: hash of normalized request to stored response. Near-zero serving cost on hit, but hit rates are low for free-text inputs; valuable for repeated programmatic calls (identical classification or extraction requests). Invalidate on prompt or model version change.
2. Semantic cache: embed the query, serve a stored response when a prior query is within a similarity threshold. Eliminates whole model calls and is deployed at the gateway (for example Redis/ElastiCache-backed semantic and request-level caching, which significantly reduces redundant provider calls for repetitive prompt structures) [AWS, Multi-Tenant GenAI Scenario]. The risk is false hits: a wrong answer served confidently. Gate by conservative thresholds, scope caches per tenant and per task, and exclude personalized or time-sensitive intents.
3. Prompt/prefix caching at the provider: caches the KV state of a shared prompt prefix so it is not reprocessed. Provider mechanics differ enough to affect design:

| Property | Anthropic | OpenAI |
|---|---|---|
| Activation | Explicit cache_control breakpoints or request-level automatic | Automatic on eligible prompts |
| Minimum prefix | Model-dependent, roughly 512-4,096 tokens | 1,024 tokens |
| Write cost | 1.25x base input (5-min TTL), 2x (1-hour TTL) | Free on older models; 1.25x on newer ones |
| Read cost | 0.1x base input (90 percent discount) | Discounted cached-input rate |
| Retention | 5 minutes (refreshes on hit) or 1 hour | Minutes by default, extended options; routing improved by consistent prompt_cache_key |

   Sources: [Anthropic, Prompt Caching] [OpenAI, Prompt Caching].
4. Structure prompts for the cache: static content first (system prompt, tool definitions, few-shot examples), dynamic content last; never place per-request values (timestamps, request IDs) inside the cached prefix [OpenAI, Prompt Caching] [Anthropic, Prompt Caching].

Break-even math for prefix caching: a 5-minute-TTL write costs 0.25x extra, and each read saves 0.9x, so caching pays for itself on the first reuse within the TTL; at N reads per write the effective input price for the cached portion is (1.25 + 0.1N)/(N+1) of base, approaching the 90 percent discount as hit rate rises [Anthropic, Prompt Caching]. Agent loops are the ideal case: every iteration resends the same system prompt and tool definitions, so multi-step agents should see cache hit rates above 90 percent on the static prefix, making cache_read tokens a core observability metric [Anthropic, Prompt Caching].

### Model routing and cascades

Provider prices differ by up to two orders of magnitude for the same task, so routing is the biggest single cost lever [FrugalGPT]. Patterns, in increasing complexity:

- Static routing by task type: classify each pipeline step at design time and pin cheap models to cheap steps (intent classification, extraction, summarization of short texts) and frontier models to hard steps (planning, complex reasoning, final user-facing synthesis).
- Cascade (small-model-first with escalation): send the query to a cheap model, score the response with a learned or heuristic reliability check, and escalate to the next model only when the score is below threshold. FrugalGPT demonstrated matching the best single model's accuracy with up to 98 percent cost reduction, or improving accuracy 4 percent at equal cost [FrugalGPT].
- Learned routers: predict the target model per query before calling anything, avoiding the cascade's duplicate calls on escalation; requires labeled routing data and periodic recalibration as models change.

Design rules: the scorer is the system; a weak reliability check silently degrades quality, so validate the router against a golden dataset and monitor escalation rate as a drift signal. Account for cascade latency: an escalated request pays both calls in sequence, so cascades suit cost-sensitive, latency-tolerant paths, and the escalation rate must stay low for the economics to hold [FrugalGPT].

Cascade break-even sketch: small model at $0.15 per 1M input tokens, frontier at $3.00, escalation rate e. Every request pays the small model and escalated requests additionally pay the frontier, so the blended input price is 0.15 + e x 3.00. At e = 0.2 the blend is $0.75 (75 percent below frontier-only); at e = 0.5 it is $1.65 (45 percent below); above e = 0.95 the cascade costs more than sending everything to the frontier model directly, and it always costs more latency on escalated requests. Escalation rate is therefore the SLO of the router: alert when it drifts toward your break-even [FrugalGPT].

### Fallbacks, retries, and timeout budgets across providers

- Multi-provider fallback belongs in the gateway: latency-aware, error-based routing that redirects to alternative endpoints when the primary fails or hits rate limits, with least-busy or weighted selection [AWS, Multi-Tenant GenAI Scenario]. Evaluate every fallback pair for output parity before trusting it (see enterprise-architecture.md).
- Retry discipline: cap attempts per request (three is the standard budget) and cap retries as a share of client traffic (roughly 10 percent); when the retry histogram shows system-wide retrying, return "do not retry" errors instead of standard rejections [Google SRE, Handling Overload].
- Retry at exactly one layer. In a stack of gateway, orchestrator, and tool clients, retries at every layer multiply combinatorially (3 x 3 x 3 = 27 attempts from one user action); retry only at the layer immediately above the failure and propagate retryable versus non-retryable signals upward [Google SRE, Handling Overload].
- Idempotency for tool-calling agents is the hard case: a timeout after the provider generated a tool call, or after the tool executed but before the result persisted, means a retry can repeat a side effect (double refund, duplicate email). Rules: give every tool invocation an idempotency key derived from (session, step, tool, arguments); make tool handlers deduplicate on that key; checkpoint agent state after each side-effecting step so recovery resumes rather than replays; classify tools as safe-to-retry (reads) versus at-most-once (writes), and require confirmation or dedup for the latter.
- Timeout budgets per stage: set each stage's timeout from that dependency's observed latency distribution, then verify stages sum within the end-to-end SLO. A stage timeout materially above its own p99 just converts fast failures into slow ones; a stage without a timeout donates its hang to the user. Example decomposition for a 10 s p95 conversational agent turn:

| Stage | Budget (p95) | Timeout | On timeout |
|---|---|---|---|
| Input guardrails | 300 ms | 500 ms | Fail open for advisory checks, closed for policy checks |
| Retrieval (embed + search + rerank) | 800 ms | 1.5 s | Answer without retrieval, flag lower confidence |
| Model call (TTFT sub-budget 1.5 s) | 6 s | 12 s | Retry once on secondary provider, else degrade to short response |
| Tool call | 2 s | 4 s | Return partial result with incompleteness marker |
| Orchestration and output guardrails | 900 ms | n/a | Included in overhead measurement |

### Rate limiting and load shedding

- Enforce token-denominated limits (TPM), not just request counts: request cost varies by orders of magnitude with prompt length, and provider quotas are token-denominated, so the gateway must meter both requests and tokens per tenant [AWS, Multi-Tenant GenAI Scenario].
- Per-customer quotas may oversubscribe total capacity since tenants rarely peak together; enforce with real-time aggregated usage [Google SRE, Handling Overload].
- Shed by criticality: label every request class and reject lowest criticality first under overload; a well-behaved service keeps serving its provisioned rate regardless of how much excess is offered [Google SRE, Handling Overload]. Mapped to an agent platform:

| Criticality (SRE taxonomy) | Agent platform traffic |
|---|---|
| CRITICAL_PLUS | Interactive user turns in paid, user-facing surfaces |
| CRITICAL | Internal copilot turns, synchronous tool calls |
| SHEDDABLE_PLUS | Batch enrichment, scheduled report agents, re-embedding |
| SHEDDABLE | Evaluation runs, speculative pre-computation, cache warming |
- Degrade before rejecting: overload responses can be cheaper-to-compute approximations, which for LLM systems means routing to a smaller model, truncating retrieval depth, or serving from semantic cache before returning 429s [Google SRE, Handling Overload].
- Push rejection to the client: adaptive throttling has clients track accepts versus attempts and preemptively drop excess locally, saving the backend the cost of rejecting [Google SRE, Handling Overload]. Surface provider 429s and Retry-After to internal callers so backpressure propagates instead of amplifying.

### SLO design and tail latency amplification in agent chains

Define SLIs and SLOs at percentiles: averages mask a system where most requests take 50 ms but 5 percent take 20x longer, and high-order percentiles (p99, p99.9) capture the worst-case experience users actually remember [Google SRE, SLOs]. Keep few SLOs, set them from user need rather than current performance, and manage an error budget rather than chasing perfection [Google SRE, SLOs].

Tail amplification is the reason p99 dominates agent design [Dean and Barroso, The Tail at Scale]:

- Parallel fan-out: if each backend answers within its p99 bound 99 percent of the time, a request fanned out to 100 backends finishes within that bound only 0.99^100 = 36.6 percent of the time; even 1-in-10,000 slowness hits 18 percent of requests at large fan-out [Dean and Barroso, The Tail at Scale].
- Serial chains (the agent case): an N-step chain avoids all per-step p99 events with probability 0.99^N, and avoids all per-step p95 events with probability 0.95^N. A 10-step agent turns per-step p99 behavior into roughly a p90 end-to-end event: about one user in ten experiences at least one step's worst-case latency, and the slow steps' excesses add.

| Chain length N | P(no step exceeds its p99) | P(no step exceeds its p95) |
|---|---|---|
| 3 | 97.0 percent | 85.7 percent |
| 5 | 95.1 percent | 77.4 percent |
| 10 | 90.4 percent | 59.9 percent |
| 20 | 81.8 percent | 35.8 percent |

  Read the p95 column as a warning: in a 10-step chain, 40 percent of requests contain at least one per-step p95 excursion, so "each step meets its p95" is compatible with an end-to-end experience users describe as unreliable.
- Budget accordingly: per-step latency targets must be set at roughly the (1 - (1 - target)/N) percentile. To keep end-to-end p99 in a 10-step chain, engineer each step to its p99.9. This is why step count is a first-order architectural decision and why decision-trees.md prefers the fewest-step pattern that meets quality.
- Mitigations transfer from distributed systems: hedged requests (send a duplicate to a second provider after a delay around the p95 mark and take the first response) cut the tail for idempotent read-like calls at a few percent extra load [Dean and Barroso, The Tail at Scale]; for LLM calls, hedging across providers also masks provider-side latency spikes, but only for steps with no side effects.

### Reliability of agent loops

- Bound every loop: a hard max-iteration count per agent run, a wall-clock deadline, and a token budget per run. An unbounded loop is an unbounded invoice and an unbounded latency tail; reliability guidance requires verifying completion of distributed computation rather than assuming it [AWS, Generative AI Lens]. Default bounds by task class, tightened by measurement:

| Task class | Max iterations | Wall clock | Token budget per run |
|---|---|---|---|
| Single-intent chat turn | 5 | 30 s | 50k |
| Multi-tool workflow (support resolution, triage) | 10-15 | 3 min | 200k |
| Deep research or coding task | 25-50 | 30 min | 2M, with checkpoint every step |
- Fail the loop forward: on hitting a bound, return the best partial result with an explicit incompleteness marker or escalate to a human queue; silent truncation reads as a wrong answer.
- Checkpoint long-running agents: persist state (message history, tool results, plan position) after each step to a durable store, keyed by run ID, so a crash or deploy resumes from the last completed step instead of replaying side effects; pair checkpoints with the idempotency keys above. This also enables graceful failure handling and traceability demanded by the well-architected reliability guidance [AWS, Generative AI Lens]. Concrete options: durable-execution engines (Temporal, AWS Step Functions) hosting the agent loop, or framework-native checkpointers (for example LangGraph-style persisted graph state) backed by Postgres or DynamoDB.
- Watchdogs over runs, not just requests: monitor per-run step counts, token spend, and repeated-tool-call patterns (the classic stuck loop calls the same tool with the same arguments); kill and escalate on anomaly rather than letting the max-iteration bound be the only defense.
- Version everything the loop depends on (prompt, model, tool schemas) and record versions in the run trace so incidents are reproducible [AWS, Generative AI Lens].

## When to apply

- Streaming and TTFT budgets: any user-facing conversational or copilot surface; skip for pure batch pipelines.
- Prefix caching: any workload with a stable system prompt or tool definitions above the model's minimum cacheable size, and all multi-turn or agentic workloads; it is the default, not an optimization [Anthropic, Prompt Caching].
- Semantic caching: high-volume workloads with repetitive query distributions (support FAQs, internal knowledge lookup); avoid for personalized, time-sensitive, or high-stakes answers.
- Cascades and routing: cost-driven designs at scale (monthly model spend above roughly $10k) or latency-driven designs where a small model covers most traffic; skip when a single cheap model already meets quality, or when traffic is too low for router validation data.
- Multi-provider fallback and hedging: production availability targets of 99.9 percent and above; hedge only idempotent steps.
- Tail-amplification math: apply whenever a design chains 3 or more model or tool calls per user interaction, and during SLO negotiation to justify per-step budgets.
- Loop bounds and checkpointing: every autonomous agent loop, no exceptions; checkpointing becomes mandatory once runs exceed roughly a minute or contain side-effecting tools.

## Common failure modes

- One latency number for everything: an SLO that ignores the TTFT versus total-time split, producing a design that streams nothing and feels slow at any average [Huyen, LLM Engineering].
- Cache poisoning by proximity: a semantic cache threshold tuned for hit rate that serves user A an answer generated for user B's subtly different (or tenant-confidential) question; scope and threshold conservatively [AWS, Multi-Tenant GenAI Scenario].
- Dynamic content in the cached prefix: a timestamp in the system prompt drops the provider cache hit rate to zero while the team wonders why costs did not fall [OpenAI, Prompt Caching] [Anthropic, Prompt Caching].
- Cascade with a credulous scorer: the cheap model's answers pass a shallow reliability check, quality drops for weeks, and the eval suite catches it only after users do; validate routers on golden data and alert on escalation-rate drift [FrugalGPT].
- Retries at every layer: gateway, SDK, and orchestrator each retry three times, turning one provider brownout into a 27x self-inflicted DDoS; retry at one layer with a budget [Google SRE, Handling Overload].
- Non-idempotent retry of tool calls: a timeout between tool execution and persistence causes a duplicated side effect on retry; idempotency keys and post-step checkpoints are the fix, not longer timeouts.
- Per-step SLOs copied from the end-to-end SLO: ten steps each allowed the full 10 s p95 mathematically cannot deliver a 10 s p95 chain; decompose the budget [Dean and Barroso, The Tail at Scale].
- Unbounded agent loops: no max iterations, no token budget, no watchdog; the failure is discovered as a five-figure line item or a request that never returns [AWS, Generative AI Lens] [FinOps Foundation, FinOps for AI].
- Load shedding that drops the wrong traffic: batch re-embedding jobs sail through while interactive users get 429s because nothing was labeled with criticality [Google SRE, Handling Overload].

## Citations

- [Huyen, LLM Engineering] Huyen, C., Building LLM applications for production. https://huyenchip.com/2023/04/11/llm-engineering.html
- [Anthropic, Prompt Caching] Anthropic documentation, Prompt caching. https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
- [OpenAI, Prompt Caching] OpenAI documentation, Prompt caching. https://developers.openai.com/api/docs/guides/prompt-caching
- [FrugalGPT] Chen, L., Zaharia, M., Zou, J., FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance. https://arxiv.org/abs/2305.05176
- [Google SRE, SLOs] Google SRE Book, Service Level Objectives. https://sre.google/sre-book/service-level-objectives/
- [Google SRE, Handling Overload] Google SRE Book, Handling Overload. https://sre.google/sre-book/handling-overload/
- [Dean and Barroso, The Tail at Scale] Dean, J. and Barroso, L.A., The Tail at Scale, CACM 2013. https://www.barroso.org/publications/TheTailAtScale.pdf
- [AWS, Multi-Tenant GenAI Scenario] AWS Generative AI Lens, Multi-tenant generative AI platform scenario. https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/multi-tenant-generative-ai-platform-scenario.html
- [AWS, Generative AI Lens] AWS Well-Architected Framework, Generative AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/generative-ai-lens.html
- [FinOps Foundation, FinOps for AI] FinOps Foundation, FinOps for AI Overview. https://www.finops.org/wg/finops-for-ai-overview/
