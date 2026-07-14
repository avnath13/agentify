# The GenAI system design loop

Purpose: this document turns customer-facing GenAI system design into a repeatable ten-step procedure, based on Selamy's interview answer spine for customer-facing GenAI roles [Selamy, GenAI Interview Loop], with each step's architecture content grounded in Chip Huyen's generative AI platform components [Huyen, GenAI Platform] and the a16z reference LLM app stack [a16z, Emerging Architectures]. Walk the steps in order for every design. Each step lists what to do, the questions to ask, and what a strong vs weak answer looks like; the strong/weak contrasts also power interview mode.

## Principles

### The loop at a glance

The ten-step spine, verbatim from the source [Selamy, GenAI Interview Loop]:

1. Clarify the customer situation.
2. Name requirements and non-requirements.
3. Choose the simplest useful AI pattern.
4. Design retrieval, orchestration, tools, and state.
5. Protect the data and identity boundaries.
6. Evaluate groundedness and answer quality.
7. Operate for latency, reliability, and cost.
8. Troubleshoot failures with evidence.
9. Turn field pain into product feedback.
10. Make a recommendation the customer can actually adopt.

The organizing insight: "the right answer is rarely 'use RAG' or 'add an agent.' Sometimes the right answer is RAG. Sometimes it is a guarded tool workflow. Sometimes it is fine-tuning, human review, a deterministic automation, a better search product, or a smaller first release." The exercise tests whether you can tell the difference [Selamy, GenAI Interview Loop]. The loop covers discovery, requirements, RAG, retrieval quality, tool calling, IAM, PII, tenant isolation, evaluation, observability, cost, troubleshooting, and product judgment, not just boxes and arrows [Selamy, GenAI Interview Loop].

### Step 1: clarify the customer situation

Ask before proposing anything; discovery precedes architecture [Selamy, GenAI Interview Loop]. Questions: Who are the users and what task are they failing at today? What is the current workaround and its cost? What does the data estate actually look like (formats, systems, owners, volume, freshness, quality)? Is knowledge permissioned, and by what identity system? What has already been tried? What does the customer believe they want vs what problem they have? The real enterprise loop includes "messy enterprise data, permissioned knowledge, ambiguous requirements, changing customer constraints" [Selamy, GenAI Interview Loop].

Strong: leads with 5 to 8 targeted discovery questions, names the messy-data and permissions risks unprompted, restates the problem in the customer's business terms. Weak: accepts "we want a chatbot over our docs" at face value and starts drawing an architecture.

### Step 2: name requirements and non-requirements

Convert discovery into explicit, numbered requirements and, just as importantly, non-requirements that scope the first release down [Selamy, GenAI Interview Loop]. Questions: What accuracy or groundedness bar makes this trustworthy enough to ship? What latency budget (interactive vs batch)? What request volume and growth? What data may the system read, and what must it never touch? What actions may it take, if any? What compliance regimes apply? What is explicitly out of scope for v1?

Strong: separates hard constraints (tenant isolation, PII handling) from tunable targets (latency, cost per query), and names non-requirements ("no write actions in v1") that shrink risk. Weak: a vague list of desirables with no numbers, no security constraints, and no scope boundary.

### Step 3: choose the simplest useful AI pattern

Resist defaulting to trendy architectures; candidate patterns include RAG, a guarded tool workflow, fine-tuning, human review, deterministic automation, better search, or a smaller first release [Selamy, GenAI Interview Loop]. The a16z stack's core design pattern supports the default: use models off the shelf and control behavior through prompting and conditioning on private contextual data (in-context learning), reserving fine-tuning for later [a16z, Emerging Architectures]. Questions: Does step 2's accuracy bar actually require generation, or would better retrieval or search satisfy users? Is the knowledge dynamic (favors RAG) or a stable style/format problem (favors fine-tuning)? Are actions required, and are they reversible?

Strong: names two or three candidate patterns, kills them against the requirements from step 2, and justifies the survivor; sometimes recommends no LLM at all. Weak: jumps to "RAG plus an agent" regardless of requirements, or proposes fine-tuning for a knowledge-freshness problem.

### Step 4: design retrieval, orchestration, tools, and state

Now, and only now, the architecture. Cover the a16z three stages: data preprocessing and embedding (chunking, embedding, vector storage), prompt construction and retrieval, and prompt execution and inference with logging, caching, and validation around it [a16z, Emerging Architectures]. Retrieval design choices with named options [Huyen, GenAI Platform]:

- Term-based retrieval (BM25, Elasticsearch) is cheap and strong on exact terminology; embedding-based retrieval (ANN over vectors) handles paraphrase; hybrid search uses cheap retrieval for candidates then expensive reranking.
- Query rewriting reformulates ambiguous user queries before retrieval.
- Tabular data wants text-to-SQL, not chunk embedding.
- Chunking, embeddings, hybrid search, metadata filters, reranking, freshness, and recall are the levers of retrieval quality [Selamy, GenAI Interview Loop].

Tool calling and state: define which tools are read-only vs write, where approval gates sit, and how workflow state persists across turns [Selamy, GenAI Interview Loop]. Write actions vastly expand capability and risk, and require safeguards against prompt injection and unauthorized modification [Huyen, GenAI Platform]. Economics belong in this step: long-context brute force loses to retrieval because context cost grows quadratically; a GPT-4-class query over 10,000 pages would cost hundreds of dollars, which is why retrieval, and counterintuitively embeddings, stay important even as windows grow [a16z, Emerging Architectures].

Component completeness check against the a16z reference stack: data pipelines and document loaders, embedding model, vector database (fully hosted, open-source single-node, local library, or a pgvector-style OLTP extension, by scale and ops appetite), prompt construction with few-shot examples, orchestration, LLM cache, logging and LLM ops, validation and injection defense, and app hosting [a16z, Emerging Architectures]. Every box the design includes must trace to a requirement from step 2; every box it omits should be a conscious omission.

Strong: names concrete retrieval choices with tradeoffs (hybrid plus rerank, metadata filters for permissions and freshness), separates read tools from write tools with gates on writes, and states where state lives. Weak: a single "vector DB plus LLM" box, no chunking or reranking discussion, tools with no risk distinction.

### Step 5: protect the data and identity boundaries

Security is a design step, not a review afterthought: identity propagation, least privilege, PII handling, audit logs, and isolation boundaries [Selamy, GenAI Interview Loop]. Input guardrails address sensitive-data leakage (detect and block or reversibly mask PII) and jailbreaks; output guardrails catch PII leakage, hallucinated or toxic content, and off-brand responses before they reach the user [Huyen, GenAI Platform]. Questions: Whose identity does a retrieval query run under, the end user's or a service account's? How do document ACLs get enforced at retrieval time, not just at ingestion? What is the tenant isolation model (per-tenant index vs filtered shared index)? What is logged for audit, and who can read those logs (they contain prompts)?

Strong: retrieval is permission-aware under the end user's identity, PII is masked before the model sees it, tenant isolation is stated with its tradeoff, audit covers prompt, retrieved context, and response. Weak: "we'll add auth" as a single bullet, ACL checks only at ingestion time, no answer for what happens when a user asks about a document they cannot open.

### Step 6: evaluate groundedness and answer quality

The evaluation kit: golden sets, groundedness checks, refusal quality, regression tests, and human review [Selamy, GenAI Interview Loop]. Model quality metrics to track: hallucination rate, context relevance and precision (retrieval quality measured separately from generation quality), empty or malformatted responses [Huyen, GenAI Platform]. Questions: What does a golden set of 50 to 200 real questions with vetted answers look like for this customer, and who curates it? How is groundedness scored (claim supported by retrieved context)? Is refusal quality measured (the system should decline when retrieval is empty or the question is out of scope)? What gates a prompt or model change (regression run on the golden set)?

The evaluation matrix, as a minimum grid to fill per design [Selamy, GenAI Interview Loop; Huyen, GenAI Platform]:

| Dimension | Question it answers | Method |
|---|---|---|
| Retrieval quality | Did the right context come back? | Context relevance and precision against the golden set |
| Groundedness | Is every claim supported by retrieved context? | Groundedness checks, hallucination rate |
| Refusal quality | Does it decline when it should? | Out-of-scope and empty-retrieval cases in the golden set |
| Format and safety | Is the output well-formed and policy-clean? | Malformatted-response rate, output guardrail hit rate |
| Regression | Did this change make anything worse? | Golden-set rerun gating every prompt, model, or index change |
| Real-world quality | Do production answers hold up? | Human review of sampled traffic, daily manual inspection [Huyen, GenAI Platform] |

Strong: evaluates retrieval and generation separately, includes refusal and out-of-scope cases in the golden set, wires evals into the deployment gate, plans human review for a sample of production traffic. Weak: "we'll look at some outputs," a demo-day vibe check, or a single end-to-end accuracy number that cannot localize failures.

### Step 7: operate for latency, reliability, and cost

What to monitor once live: tokens, latency, retrieval, tools, failures, and spend [Selamy, GenAI Interview Loop]. The operating components, in Huyen's recommended adoption order after RAG and guardrails [Huyen, GenAI Platform]:

- **Model router**: an intent classifier routes queries to specialized handlers and cheaper models, and screens out-of-scope queries before spending frontier-model tokens. The economics are large: at the time of the a16z survey, the smaller production model was roughly 50x cheaper than the frontier model [a16z, Emerging Architectures].
- **Model gateway**: one unified interface to all models, centralizing credentials, rate limits, cost tracking, fallback policies on provider failure, and load balancing [Huyen, GenAI Platform].
- **Caching tiers**: prompt cache for shared prefixes (system prompts, long documents), exact cache for identical requests, semantic cache for similar requests; semantic caching risks serving wrong answers on mistaken similarity matches and only pays off at high hit rates [Huyen, GenAI Platform].
- **Observability**: system metrics (throughput, uptime) plus model metrics (hallucination rate, latency as TTFT and per-token timings, length metrics as cost drivers); logs of every configuration, query, and intermediate step; traces that show each component's duration and cost per request [Huyen, GenAI Platform].

Strong: states a latency budget and shows which components fit inside it, routes cheap queries to cheap models, adds fallbacks at the gateway, and names the three or four dashboards day-2 operations will watch. Weak: no cost-per-query estimate, one model for everything, semantic cache proposed as a free win with no false-hit discussion.

### Step 8: troubleshoot failures with evidence

Debug bad GenAI systems without guessing [Selamy, GenAI Interview Loop]. The evidence comes from step 7's instrumentation: traces pinpoint the exact failing component and its latency and cost contribution; logs of intermediate steps let you replay a bad answer; daily manual inspection of production data is explicitly recommended practice [Huyen, GenAI Platform]. Diagnostic ordering, by symptom:

| Symptom | First evidence to pull | Likely component |
|---|---|---|
| Wrong or made-up answer | Retrieved chunks for that request | Retrieval (wrong context) vs grounding (right context, ignored) |
| Right document exists, not cited | Retrieval scores, filters, index freshness | Chunking, embeddings, metadata filters, stale index |
| Off-topic or blocked response | Router decision, guardrail logs | Intent classifier misroute or guardrail false positive [Huyen, GenAI Platform] |
| Wrong action taken | Tool call log with arguments | Tool selection or tool schema ambiguity |
| Slow | Trace: which span dominates | Retrieval hop, model TTFT, retry loops [Huyen, GenAI Platform] |
| Expensive | Length metrics (query, context, response), cache hit rate | Context stuffing, retries, missing routing to smaller models [Huyen, GenAI Platform] |

Strong: asks for a trace before proposing a fix, distinguishes retrieval vs generation vs orchestration failures, and changes one variable at a time against the regression set from step 6. Weak: reflexively swaps the model or rewrites the system prompt with no evidence of where the failure lives.

### Step 9: turn field pain into product feedback

Connect customer pain to platform capabilities and product feedback [Selamy, GenAI Interview Loop]. Questions: Which failures are this customer's data problem vs a gap every customer will hit? What recurring workaround should become a platform feature? What does the observability data say customers actually ask for? This step is what distinguishes a field engineer's design from a textbook one: the design should name what it could not solve cleanly and route that upstream.

Strong: two or three concrete, generalized feedback items tied to observed evidence. Weak: skipping the step, or feedback phrased as this customer's one-off complaint.

### Step 10: make a recommendation the customer can actually adopt

End with a decision, sized to the customer's real capacity to operate it [Selamy, GenAI Interview Loop]. A smaller first release is listed among the right answers for a reason [Selamy, GenAI Interview Loop]; Huyen's ordering supports incremental adoption, starting without orchestration frameworks and adding components as needs arise [Huyen, GenAI Platform]. Questions: What can this team run on-call? What is the phased path (v1 read-only assistant with citations, v2 actions behind approvals)? What are the adoption prerequisites (data cleanup, ACL mapping, eval set curation) and who owns them?

Strong: a phased recommendation with explicit prerequisites, an eval-gated rollout, and a stated criterion for expanding scope. Weak: a maximal architecture with no sequencing, no owner for data quality, and no definition of "safe enough to trust."

## When to apply

- If designing any customer-facing GenAI system, then walk all ten steps in order; steps 1 to 3 before any component is named [Selamy, GenAI Interview Loop].
- If the user or customer has already chosen an architecture ("build me a RAG agent"), then still run steps 1 to 3 and validate or challenge the choice against requirements [Selamy, GenAI Interview Loop].
- If running interview mode, then present each step's questions, elicit the user's answer, and score it against the strong vs weak contrasts above.
- If knowledge is permissioned or multi-tenant, then treat step 5 as a hard gate; no design proceeds with ingestion-time-only ACLs [Selamy, GenAI Interview Loop].
- If the design includes write actions, then approval gates and injection defenses from steps 4 and 5 are mandatory, not optional [Huyen, GenAI Platform].
- If latency or cost targets are tight, then apply step 7's levers in order: routing to smaller models, then caching, then parallelizing or trimming the pipeline [Huyen, GenAI Platform].
- If a stakeholder reports "it's wrong / slow / expensive," then enter at step 8 but verify steps 6 and 7 instrumentation exists first, since evidence-free debugging is guessing [Selamy, GenAI Interview Loop; Huyen, GenAI Platform].

## Common failure modes

- **Architecture before discovery.** Answering "we want an AI assistant over internal documents" with a diagram instead of questions; the loop exists because discovery, requirements, and product judgment are the tested skills, not box-drawing [Selamy, GenAI Interview Loop].
- **Pattern default bias.** Prescribing RAG or agents because they are the salient patterns, when deterministic automation, better search, or a smaller release fits the requirement [Selamy, GenAI Interview Loop].
- **Demo-to-production gap.** Designs that ignore "messy enterprise data, permissioned knowledge... security boundaries, hallucination risk, observability, and cost" work in the demo and fail in operations [Selamy, GenAI Interview Loop].
- **Permission-blind retrieval.** Indexing everything into one store and enforcing ACLs only in the UI; retrieval must run under the requesting identity with tenant isolation designed in [Selamy, GenAI Interview Loop].
- **Evaluation as afterthought.** No golden set, no groundedness or refusal measurement, no regression gate; changes then ship on anecdote [Selamy, GenAI Interview Loop].
- **Conflated failure surfaces.** One end-to-end quality score that cannot distinguish retrieval failures from generation failures from orchestration failures, making step 8 impossible [Huyen, GenAI Platform].
- **Semantic cache overreach.** Adopting similarity-based caching for the cost win while ignoring the documented failure mode of confidently serving a cached answer to a different question [Huyen, GenAI Platform].
- **Orchestrator-first builds.** Reaching for a heavy orchestration framework on day one; the documented recommendation is to start without one and adopt it only when pipeline complexity demands it [Huyen, GenAI Platform].
- **Unadoptable recommendations.** A technically correct design the customer cannot staff, operate, or govern; step 10 exists because adoption capacity is a requirement [Selamy, GenAI Interview Loop].

## Citations

- [Selamy, GenAI Interview Loop]: Patrick Selamy, "Customer-Facing GenAI System Design Is Its Own Interview Loop". https://selamy.dev/posts/customer-facing-genai-system-design-interview-loop/
- [Huyen, GenAI Platform]: Chip Huyen, "Building A Generative AI Platform". https://huyenchip.com/2024/07/25/genai-platform.html
- [a16z, Emerging Architectures]: Matt Bornstein and Rajko Radovanovic, "Emerging Architectures for LLM Applications", Andreessen Horowitz. https://a16z.com/emerging-architectures-for-llm-applications/
