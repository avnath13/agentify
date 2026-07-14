# Enterprise architecture for agentic systems

This document grounds the non-functional side of every agentify design: the NFR checklist that must be filled in before any component is drawn, the discipline that forces every component to justify its existence, multi-tenancy and capacity math patterns, disaster recovery for stateful agent workloads, and cost governance. It synthesizes the AWS Well-Architected Generative AI Lens, the Azure Well-Architected AI workload guidance, and the Google Cloud Well-Architected AI and ML perspective into decision rules an architect can apply directly [AWS, Generative AI Lens] [Azure, AI Workloads] [Google Cloud, AI and ML Perspective].

## Principles

### Anchor on the three cloud well-architected frameworks

All three hyperscaler frameworks converge on the same pillar set applied to GenAI: operational excellence, security, reliability, performance efficiency, cost optimization, and (AWS, Google) sustainability [AWS, Generative AI Lens] [Google Cloud, AI and ML Perspective]. The GenAI-specific deltas that matter for agentic designs:

- Operational excellence: achieve consistent model output quality, maintain traceability of prompts, models, and outputs, and automate lifecycle management. Treat prompts, model versions, and evaluation datasets as versioned deployment artifacts [AWS, Generative AI Lens].
- Security: protect model endpoints, mitigate harmful outputs and "excessive agency" (agents with more permissions than the task needs), secure prompts, and audit all invocations [AWS, Generative AI Lens]. Google adds zero trust, shift-left security, and its Secure AI Framework for the model supply chain [Google Cloud, AI and ML Perspective].
- Reliability: handle throughput requirements explicitly, implement observability, handle failures gracefully, version all artifacts, and verify completion of distributed computation (directly relevant to multi-step agent chains) [AWS, Generative AI Lens].
- Performance efficiency: capture and improve model performance over time, optimize compute, and improve data retrieval performance (retrieval is usually the second-largest latency contributor after generation) [AWS, Generative AI Lens].
- Cost optimization: select cost-optimized models, balance cost and performance of inference, engineer prompts for cost, and optimize vector stores and agent workflows. Note that agent workflows are called out by name: loops multiply token spend [AWS, Generative AI Lens].
- Azure's central framing: AI workloads replace deterministic logic with nondeterministic behavior, so design must add evaluation, grounding data design, and GenAIOps as first-class design areas, and adopt an experimental mindset with iterative refinement cycles [Azure, AI Workloads].
- Azure's build-vs-buy rule: prefer a managed model API unless data control, unique customization, or compliance forces a custom or self-hosted model; custom models demand skilled teams and ongoing maintenance that most workloads cannot justify [Azure, AI Workloads].

### The NFR checklist: fill this in before drawing components

A design that does not state these numbers is not a design. Extract or propose a value for every row, mark proposals as assumptions to validate.

| NFR | Question to ask | Example target (customer-facing support agent) |
|---|---|---|
| Throughput, request | Peak RPS and burst factor? | 15 model calls/s peak, 3x burst over average |
| Throughput, sessions | Peak concurrent sessions? | 1,200 concurrent streaming sessions |
| Throughput, tokens | Peak TPM vs provider quota? | 3.9M TPM, provisioned capacity required |
| Latency, TTFT | First token at p50/p95? | 500 ms / 1.5 s |
| Latency, total | Full response at p95/p99? | 10 s / 20 s |
| Availability | Which tier, with error budget? | 99.9 percent monthly, 43.8 min budget |
| RTO/RPO | Per state class? | Session RPO under 1 min, index RTO 4 h |
| Cost, per request | Ceiling per conversation/task? | $0.30 per resolved conversation |
| Cost, per month | Hard budget with alerts? | $50k/month, alerts at 50/80/100 percent |
| Compliance | Which regimes bind? | SOC 2 + GDPR; EU AI Act transparency tier |

**Throughput**
- Requests per second: average and peak (peak-to-average ratios of 3-5x are typical for business-hours workloads). State the burst factor.
- Concurrent sessions: an agent session holds context and often a streaming connection; concurrency, not RPS, sizes memory and connection pools.
- Token throughput: tokens per minute (TPM) is the binding constraint on managed model APIs, not RPS. Compute it (see capacity math) and compare against provider quota tiers; reliability planning must "handle throughput requirements" explicitly [AWS, Generative AI Lens].

**Latency**
- Split time-to-first-token (TTFT) from total completion time. TTFT is the perceived-responsiveness metric for streaming UX; total time gates non-streaming and agent-internal steps (see latency-cost-reliability.md).
- Set targets at percentiles, never averages: averages hide a bimodal tail; "people typically prefer a slightly slower system to one with high variance in response time" [Google SRE, SLOs].
- Reference targets for interactive chat agents: TTFT p50 under 500 ms, p95 under 1.5 s; full response p95 under 10 s; single tool-call round-trip p95 under 3 s. For async/batch agents: p95 completion in minutes, with progress events every few seconds.
- Remember that per-step percentiles compound in chains: a 10-step agent chain has roughly a 9.6 percent chance of hitting at least one per-step p99 event (1 - 0.99^10), so per-step targets must be tighter than the end-to-end target (quantified in latency-cost-reliability.md) [Dean and Barroso, The Tail at Scale].

**Availability**

| Tier | Downtime per month | What it demands |
|---|---|---|
| 99.5 percent | about 3.65 hours | Single region, multi-AZ, restart-based recovery |
| 99.9 percent | about 43.8 minutes | Multi-AZ, health-checked LB, tested manual regional failover, provider fallback for extended provider outages |
| 99.99 percent | about 4.4 minutes | Multi-region active-active or hot standby, automated data-plane failover, no single-region stateful dependency, multi-provider model routing |

- A 99.9 percent model provider SLA cannot underpin a 99.99 percent system promise: your availability is capped by the weakest serial dependency, so 99.99 requires multi-provider routing or a downgraded promise [AWS, DR Whitepaper].
- Failover paths that depend on control-plane operations (resizing, redeploying) are weaker than data-plane paths (DNS health checks, pre-provisioned capacity); prefer data-plane failover for the availability number you actually promise [AWS, DR Whitepaper].
- Publish an SLO below demonstrated capability and manage an error budget; consistent overachievement creates dependencies on unpromised behavior [Google SRE, SLOs].

**RTO/RPO for stateful agent workloads**
- Classify state before setting targets: conversation/session state (highest churn), long-term memory stores, vector indexes (rebuildable from source), tool-side transactional state (often the true system of record).
- Typical enterprise targets: conversation state RPO under 1 minute (continuous replication), memory stores RPO under 15 minutes, vector indexes RPO of hours (rebuildable) but RTO must account for rebuild time, which can be hours at scale.
- Map targets to the four DR strategies: backup and restore (RTO hours), pilot light (RTO tens of minutes), warm standby (RTO minutes), multi-site active-active (RTO near zero, but data corruption events still imply a nonzero recovery point) [AWS, DR Whitepaper].

**Cost ceilings**
- Per-request ceiling: state a cost-per-conversation or cost-per-task budget (for example, under $0.30 per resolved support conversation) and derive the token budget from it. Cost-per-token and cost-per-inference are the units of account for AI FinOps [FinOps Foundation, FinOps for AI].
- Per-month ceiling: a hard budget with alerting at 50/80/100 percent; AI forecasting is less predictable than traditional cloud spend, so budgets need frequent revision during early phases [FinOps Foundation, FinOps for AI].

**Compliance regimes**
- SOC 2: audit trails for every model invocation and tool call, access controls, change management on prompts and models. Log metadata, not raw PII, to inference logs [AWS, Multi-Tenant GenAI Scenario].
- GDPR: data residency (pin model endpoints and stores to region), right to erasure must reach conversation logs, memory stores, and embeddings (vectors can leak source data and must be encrypted and deletable per subject) [AWS, Multi-Tenant GenAI Scenario].
- HIPAA: a BAA with the model provider is a hard gate on provider choice; PHI must not enter providers without one; de-identification or silo-model tenancy for covered workloads.
- EU AI Act: classify the use case. Prohibited practices (social scoring, manipulative techniques) are banned; high-risk uses (recruitment, credit, education, law enforcement) require risk management systems, data governance, technical documentation, and human oversight; chatbots carry transparency duties (users must know they are talking to AI); GPAI models above 10^25 FLOPs training compute carry systemic-risk obligations on the provider [EU AI Act, High-Level Summary]. For agentic systems, human oversight requirements often translate to approval gates on consequential tool actions.

### Component justification discipline

Every component in a generated architecture must carry four attributes. A component missing any of them is either underspecified or should be deleted.

1. Requirement trace: the NFR or functional requirement that forces its existence. "We might need it" is not a trace. This operationalizes aligning every resource with business value [Google Cloud, AI and ML Perspective].
2. Scaling model: horizontal or vertical, stateless or stateful. Prefer stateless horizontally scaled services (an LLM gateway is stateless and scales horizontally without disruption [AWS, Multi-Tenant GenAI Scenario]); isolate state into purpose-built stores (session store, memory store, vector index). Leverage horizontal scalability and elasticity by design [Google Cloud, AI and ML Perspective].
3. Failure mode and fallback: what breaks, what the blast radius is, and the degraded path. Handle failures gracefully: fallback model, cached response, queued retry, or an honest "unavailable" with criticality-based shedding [AWS, Generative AI Lens] [Google SRE, Handling Overload].
4. Concrete technology examples: at least one managed and one self-hosted candidate (for example: gateway = LiteLLM, Bedrock, or Azure API Management; vector store = pgvector, Qdrant, OpenSearch, Pinecone; session store = Redis/ElastiCache, DynamoDB), so the design is actionable rather than abstract [AWS, Multi-Tenant GenAI Scenario].

Reference component set for an enterprise agent platform, each of which must be justified per the above: edge/WAF, LLM gateway (routing, quotas, caching, cost metering), agent runtime/orchestrator, tool layer, retrieval stack (embedder, vector store, reranker), session and memory stores, guardrails, evaluation pipeline, observability stack [AWS, Multi-Tenant GenAI Scenario].

Example justification rows (the format every emitted component should follow):

| Component | Requirement trace | Scaling model | Failure mode and fallback | Tech examples |
|---|---|---|---|---|
| LLM gateway | Multi-provider NFR; per-tenant quotas; cost metering | Stateless, horizontal | Gateway down: whole system down; run N replicas behind LB, health-checked | LiteLLM, Bedrock, Azure APIM |
| Vector store | RAG grounding; p95 retrieval under 800 ms at 8M vectors | Stateful, vertical then sharded | Index unavailable: degrade to keyword search or answer without retrieval, flagged | pgvector, Qdrant, OpenSearch |
| Session store | Multi-turn context; session RPO under 1 min | Stateful, horizontal (partitioned) | Loss drops active conversations; cross-region replication | Redis/ElastiCache, DynamoDB |
| Guardrails | EU AI Act transparency; brand and safety policy | Stateless, horizontal | Guardrail service down: fail closed for output filters, fail open only for advisory checks | Bedrock Guardrails, Llama Guard, custom classifiers |

### Multi-tenancy patterns for AI workloads

Three isolation models, per the AWS SaaS Lens [AWS, SaaS Lens]:
- Silo: dedicated resources per tenant (dedicated model endpoints, vector collections, KMS keys). Choose for regulated tenants (HIPAA, strict data residency), premium tiers, or hard noisy-neighbor guarantees. Highest cost and operational surface.
- Pool: shared resources with logical isolation (tenant ID on every row/vector/log, enforced by policy such as ABAC or row-level security). Best economics; isolation is only as strong as the enforcement code.
- Bridge: mixed mode. Steer individual services by regulatory profile and noisy-neighbor sensitivity: pool the stateless gateway and agent runtime, silo the data-bearing stores for tenants that require it [AWS, SaaS Lens].

AI-specific tenancy controls:
- Onboard each tenant through the gateway with a virtual key, then attach per-tenant rate limits, provisioning tiers, and token quotas enforced with a combination of in-memory and persistent controls [AWS, Multi-Tenant GenAI Scenario].
- Noisy-neighbor control must be token-denominated, not request-denominated: one tenant sending 100k-token prompts consumes two orders of magnitude more capacity per request than another. Enforce TPM quotas per tenant and shed or queue lower-criticality traffic first [Google SRE, Handling Overload].
- Quotas may deliberately oversubscribe total capacity because tenants rarely peak simultaneously; enforce with real-time aggregated usage [Google SRE, Handling Overload].
- Cost attribution: log tenant ID, model ID, input tokens, and output tokens on every invocation at the gateway; on AWS, application inference profiles tag Bedrock usage so per-tenant cost lands directly in cost reports [AWS, Inference Profiles Blog]. Per-tenant cost is also the input for chargeback/showback (see cost governance).
- Isolate tenant data everywhere it settles: separate vector collections or metadata-filtered namespaces, per-tenant encryption keys for fine-tuned weights and embeddings (embeddings can be reverse-engineered toward source data) [AWS, Multi-Tenant GenAI Scenario].

### Capacity math patterns

Do the back-of-envelope before selecting infrastructure. Quick reference:

```
tokens_per_call      = system_prompt + tool_defs + history + retrieved_context + output
tokens_per_task      = sum over agent steps (history grows per step unless compacted)
TPM_peak             = peak_calls_per_sec x tokens_per_call x 60
monthly_model_cost   = (input_tokens x input_price + output_tokens x output_price) / 1M
effective_input_cost = uncached_fraction x base + cached_fraction x 0.1 x base
vector_RAM_bytes     = num_vectors x dimensions x 4 x 1.5
embed_ingest_hours   = total_tokens / (embedding_TPM_limit x 60)
```

The recurring formulas, with sources and caveats:

- Tokens per request = system prompt + tool definitions + conversation history + retrieved context + output. Agent chains multiply this: total tokens per task = sum over steps, and history grows per step, so an N-step agent is superlinear in N unless context is compacted.
- Token throughput: TPM = peak requests/s x tokens per request x 60. Compare against provider quota; if within 2x of quota, plan provisioned throughput, quota increase, or multi-provider spillover now.
- GPU/self-hosted inference: throughput per GPU is measured in output tokens/s at a batch size; required GPUs = peak output tokens/s divided by per-GPU tokens/s, plus headroom (target under 70 percent utilization at peak). Illustrative shape: if a benchmarked serving stack yields 1,500 output tokens/s per GPU for your model at your context length, and peak demand is 15 calls/s x 300 output tokens = 4,500 output tokens/s, you need 3 GPUs at 100 percent or 5 for 70 percent headroom, before redundancy. Validate against measured benchmarks per model, engine, and context length rather than datasheet numbers; frameworks direct you to test rather than trust estimates [Qdrant, Capacity Planning] [Google Cloud, AI and ML Perspective].
- Memory-first GPU check for self-hosting: model weights at FP16 need roughly 2 bytes per parameter (a 70B model needs about 140 GB before KV cache), which sets the minimum GPU count and interconnect before any throughput math; purpose-built accelerators (TPU, Trainium, Inferentia) can shift the cost curve materially where supported [Google Cloud, AI and ML Perspective] [AWS, Multi-Tenant GenAI Scenario].
- Embedding pipeline: total tokens = documents x chunks per doc x tokens per chunk. Embedding is cheap relative to generation (roughly $100 to embed 1 million items at 2023 ada-002 pricing of $0.0004 per 1k tokens; modern models are in the same order) [Huyen, LLM Engineering]. The binding constraint is usually the embedding API rate limit, which sets ingest wall-clock time, not cost.
- Vector DB sizing: memory bytes = number_of_vectors x dimensions x 4 x 1.5, where 1.5 covers index and metadata overhead; 1M vectors at 1,024 dims is roughly 5.7 GB RAM [Qdrant, Capacity Planning]. Quantization cuts this 4-30x at a recall cost.

**Worked example.** Support agent, 10,000 conversations/day, 6 turns each, 3 model calls per turn (plan, tool, respond) = 180,000 calls/day. Business-hours traffic (10 h) with 3x peak factor: average 5 calls/s, peak 15 calls/s. Tokens per call: 4,000 input (1,500 system + prompt-cached tools, 1,500 history, 1,000 retrieval), 300 output. Peak token load = 15 x 4,300 x 60 = about 3.9M TPM: above many default API quotas, so provisioned capacity or multi-provider routing is a day-one requirement, not an optimization. Daily tokens: 720M input, 54M output. At $3 per 1M input and $15 per 1M output: $2,160 + $810 = about $2,970/day, roughly $89k/month, or $0.30 per conversation. With 80 percent of input tokens served from prompt cache at 0.1x price [Anthropic, Prompt Caching], input cost falls to about $605/day and the total to about $1,415/day (roughly $42k/month), a 52 percent reduction. Knowledge base: 2M documents x 4 chunks = 8M vectors at 1,024 dims = about 49 GB RAM [Qdrant, Capacity Planning]: one large node or a two-node cluster with quantization.

**What changes at 10x** (100,000 conversations/day):
- Provider quotas become the hard wall: about 39M TPM peak requires provisioned throughput contracts, multi-region endpoints, and multi-provider spillover as capacity (not just resilience) measures.
- Cost scales linearly to about $420k/month unless attacked structurally: model tiering (route simple turns to a small model), aggressive caching, context compaction, and fine-tuning a small model for the dominant intents flips from optional to mandatory economics [FrugalGPT] [FinOps Foundation, FinOps for AI].
- The vector store crosses single-node RAM (about 490 GB): shard, quantize, or move to disk-backed indexes; re-embedding the corpus becomes a scheduled pipeline with its own throughput plan [Qdrant, Capacity Planning].
- Observability volume (traces of every step of every agent run) becomes its own capacity problem: sample non-error traces, retain full traces for failures and evals.

### Disaster recovery for agentic systems

State inventory decides everything. For each class, choose replication and a DR strategy [AWS, DR Whitepaper]:

| State class | Examples | Replication | Target RPO | RTO note |
|---|---|---|---|---|
| Conversation/session | Active dialogs, streaming context | Continuous cross-region (global tables, Redis global datastore analogs) | Under 1 minute | Loss is user-visible mid-conversation |
| Long-term memory | User preferences, agent memory | Asynchronous replication | Under 15 minutes | Degraded personalization tolerable briefly |
| Vector indexes | Embedded knowledge base | Snapshot replication, or rebuild from source | Hours acceptable | Rebuild time can be hours at scale; budget it in RTO or replicate snapshots |
| Prompts, model pins, evals, guardrail configs | Versioned artifacts | Deploy via IaC to every region | Zero (in git) | Recovery region must run identical behavior [AWS, Generative AI Lens] |
| Tool-side transactional | Tickets, orders, refunds | Owned by downstream systems of record | Their DR plan | Agent needs idempotent, resumable interactions (see latency-cost-reliability.md) |

Strategy selection: active-passive (pilot light or warm standby) fits most agent workloads at 99.9 percent; multi-site active-active is justified at 99.99 percent and pairs naturally with read-local routing of sessions; prefer data-plane-only failover operations and manually initiated but fully scripted failover to avoid false-positive failovers [AWS, DR Whitepaper].

Provider outage fallback is the DR case unique to LLM systems: a gateway with latency-aware, error-based fallback routing redirects to alternative model endpoints when the primary fails or hits rate limits [AWS, Multi-Tenant GenAI Scenario]. Requirements: pre-negotiated capacity on the secondary, prompt/eval parity testing per model (a fallback that produces garbage is an outage with extra steps), and output-quality monitoring during fallback. Cross-provider behavioral drift means fallback pairs must be evaluated as first-class release artifacts [AWS, Generative AI Lens].

### Cost governance and FinOps for LLM workloads

- Unit economics first: define cost-per-inference, cost-per-conversation, and cost-per-resolved-task, and report them against business value, not just raw spend [FinOps Foundation, FinOps for AI].
- Token budgets: cap tokens per request, per session, and per tenant per month at the gateway; enforce with quotas and throttling plus anomaly detection to catch runaway agent loops before the invoice does [FinOps Foundation, FinOps for AI] [AWS, Multi-Tenant GenAI Scenario].
- Caching ROI: prompt caching reads cost about 0.1x base input price versus 1.25x for a 5-minute cache write (Anthropic), so a cached prefix pays for itself on the second hit; OpenAI applies cached-input discounts automatically for prompts of 1,024 tokens or more [Anthropic, Prompt Caching] [OpenAI, Prompt Caching]. Structure prompts static-first to maximize hit rate; measure cache_read tokens as a first-class FinOps metric. Semantic/request caching at the gateway (for example ElastiCache-backed) additionally eliminates whole calls [AWS, Multi-Tenant GenAI Scenario].
- Model tiering: route simple queries to cheap models and escalate on failure. LLM cascades can match top-model performance with up to 98 percent cost reduction on suitable workloads; provider prices differ by up to two orders of magnitude, so routing is the single largest cost lever [FrugalGPT]. Prompt engineering for cost (shorter prompts, fewer examples once cached) is the second [AWS, Generative AI Lens].
- Cost observability: per-tenant, per-model, per-feature token metering at the gateway; tagging that separates dev/test/prod; showback before chargeback to build cost awareness without friction [FinOps Foundation, FinOps for AI] [AWS, Inference Profiles Blog].
- Budget process: expect low forecast accuracy in early (crawl/walk) phases; use flexible, frequently revised budgets with spend alerts rather than rigid annual commitments; move to provisioned throughput once demand is predictable to make spend plannable [FinOps Foundation, FinOps for AI] [AWS, Multi-Tenant GenAI Scenario].

## When to apply

- Apply the NFR checklist in the clarify stage of every design; any enterprise or production-labeled request must produce explicit numbers for throughput, latency percentiles, availability tier, RTO/RPO, cost ceiling, and compliance regime before pattern selection.
- Apply component justification to every emitted diagram: a component without a requirement trace, scaling model, failure mode, and tech example gets fixed or cut.
- Apply multi-tenancy patterns whenever the system serves multiple customers, business units, or lines of business; internal single-team tools can skip to pool-by-default with cost tagging.
- Apply capacity math whenever throughput exceeds hobby scale (roughly over 1 RPS peak or over 100k model calls/month) or when self-hosting or vector stores over 1M vectors are on the table.
- Apply the DR section when availability targets exceed 99.9 percent, when the agent holds durable state, or when the customer names RTO/RPO; apply provider-fallback design for any customer-facing production agent.
- Apply cost governance from day one for any workload with a monthly budget over roughly $5k or with multi-tenant chargeback needs; below that, per-request cost estimation and a spend alert suffice.

## Common failure modes

- Designing components before requirements: an architecture with a reranker, a fine-tuning pipeline, and a multi-agent mesh but no stated RPS, latency percentile, or cost ceiling. Every component must trace to a number.
- Averages instead of percentiles: an SLO of "average latency 2 s" that hides a p99 of 40 s in agent chains [Google SRE, SLOs] [Dean and Barroso, The Tail at Scale].
- Request-based quotas in a token-based world: per-tenant RPS limits that let one tenant's long prompts starve everyone; quotas must be token-denominated [Google SRE, Handling Overload].
- Claiming 99.99 percent on a single provider and single region: your availability is capped by your weakest serial dependency; multi-provider routing or the honest 99.9 percent tier are the options [AWS, DR Whitepaper].
- Forgetting embeddings and logs in GDPR erasure and DR scope: vectors and conversation logs are personal data and are state; both must be deletable per subject and replicated per RPO [AWS, Multi-Tenant GenAI Scenario].
- Fallback models that were never evaluated: failover to a model whose outputs fail the task turns a partial outage into silent quality failure; evaluate fallback pairs as release artifacts [AWS, Generative AI Lens].
- Untested DR: a failover plan that depends on control-plane operations or has never been exercised will miss its RTO; test recovery procedures regularly [AWS, DR Whitepaper] [Google Cloud, AI and ML Perspective].
- Cost discovered on the invoice: no per-tenant metering, no anomaly detection, and an agent loop that retried itself into five figures; gateway metering plus budget alerts are mandatory plumbing [FinOps Foundation, FinOps for AI].
- Silo-everything or pool-everything dogma: siloing every tenant destroys the economics; pooling regulated tenants destroys the compliance story; the bridge model exists because service-by-service decisions are the norm [AWS, SaaS Lens].

## Citations

- [AWS, Generative AI Lens] AWS Well-Architected Framework, Generative AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/generative-ai-lens.html
- [AWS, Multi-Tenant GenAI Scenario] AWS Generative AI Lens, Multi-tenant generative AI platform scenario. https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/multi-tenant-generative-ai-platform-scenario.html
- [AWS, SaaS Lens] AWS Well-Architected SaaS Lens, Silo, Pool, and Bridge Models. https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html
- [AWS, DR Whitepaper] Disaster Recovery of Workloads on AWS: Recovery in the Cloud, Disaster recovery options in the cloud. https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html
- [AWS, Inference Profiles Blog] Manage multi-tenant Amazon Bedrock costs using application inference profiles. https://aws.amazon.com/blogs/machine-learning/manage-multi-tenant-amazon-bedrock-costs-using-application-inference-profiles/
- [Azure, AI Workloads] Microsoft Azure Well-Architected Framework, AI workloads on Azure. https://learn.microsoft.com/en-us/azure/well-architected/ai/get-started
- [Google Cloud, AI and ML Perspective] Google Cloud Well-Architected Framework: AI and ML perspective. https://docs.cloud.google.com/architecture/framework/perspectives/ai-ml
- [Google SRE, SLOs] Google SRE Book, Service Level Objectives. https://sre.google/sre-book/service-level-objectives/
- [Google SRE, Handling Overload] Google SRE Book, Handling Overload. https://sre.google/sre-book/handling-overload/
- [Dean and Barroso, The Tail at Scale] Dean, J. and Barroso, L.A., The Tail at Scale, CACM 2013. https://www.barroso.org/publications/TheTailAtScale.pdf
- [Anthropic, Prompt Caching] Anthropic documentation, Prompt caching. https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
- [OpenAI, Prompt Caching] OpenAI documentation, Prompt caching. https://developers.openai.com/api/docs/guides/prompt-caching
- [FrugalGPT] Chen, L., Zaharia, M., Zou, J., FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance. https://arxiv.org/abs/2305.05176
- [FinOps Foundation, FinOps for AI] FinOps Foundation, FinOps for AI Overview. https://www.finops.org/wg/finops-for-ai-overview/
- [Qdrant, Capacity Planning] Qdrant documentation, Capacity Planning. https://qdrant.tech/documentation/capacity-planning/
- [Huyen, LLM Engineering] Huyen, C., Building LLM applications for production. https://huyenchip.com/2023/04/11/llm-engineering.html
- [EU AI Act, High-Level Summary] EU Artificial Intelligence Act, High-level summary. https://artificialintelligenceact.eu/high-level-summary/
