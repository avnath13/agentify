# Evaluation: eval-driven development for GenAI and agentic systems

This document grounds the evaluation plan of every generated design. It covers eval-driven development, offline eval construction (golden datasets, component-level metrics), LLM-as-judge design with bias mitigations, agent-specific evaluation including reliability under repetition, online evaluation, and the eval gates a system must pass on its way from shadow deployment to general availability. The core stance: an eval suite is part of the system architecture, not a QA afterthought, and the design must specify it with the same rigor as the retrieval or orchestration layer.

## Principles

### Build the eval before the system

Define success as an executable eval before the capability exists, then iterate the system until it passes. Anthropic's agent eval guidance is explicit: define success early, measure it clearly, iterate continuously; evals built early surface unstated expectations and replace reactive production debugging with confident iteration [Anthropic, Demystifying Evals]. OpenAI frames the same loop as behavior-driven development for LLM apps: describe the task as an eval, run it against test inputs, analyze and iterate [OpenAI, Evals Guide].

A complete design must therefore specify, at minimum:

- The eval harness and where it runs (locally during development, in CI on every prompt or model change, on a schedule in production).
- The golden dataset: source, initial size, stratification scheme, refresh cadence.
- Per-component metrics with numeric pass thresholds, separated by pipeline stage.
- Judge design (mode, rubric, model family) and the human calibration plan.
- Rollout gates: which metrics must pass at which threshold before each promotion stage.
- The online monitoring and trace-to-eval feedback plan.

A design missing any of these is incomplete.

### Golden dataset design

- Size: start small. 20 to 50 tasks drawn from real failures is sufficient in early development, because early changes have large effect sizes that small samples can detect [Anthropic, Demystifying Evals]. Grow toward hundreds of cases as the system matures and effect sizes shrink.
- Sourcing: pull cases from manual checks done during development, bug tracker entries, support queue issues, and (after launch) production traces. Real usage beats synthetic invention [Anthropic, Demystifying Evals].
- Ground truth: every case carries a human-verified expected output or a checkable success condition, with a defined schema so runs are comparable over time [OpenAI, Evals Guide].
- Unambiguous grading: design tasks that two experts would grade identically; ambiguity in the task spec becomes noise in the metric [Anthropic, Demystifying Evals].
- Stratification: partition the dataset by intent category, difficulty, language, tenant or persona, and known risk areas (injection attempts, out-of-scope requests, PII-bearing inputs). Report per-stratum scores; an aggregate average hides regressions in a minority stratum.
- Negative cases: include inputs where the correct behavior is refusal, clarification, or escalation. A suite containing only happy paths certifies an over-eager system.
- Versioning: version the dataset alongside prompts and system config, so any historical score can be reproduced against the exact cases and ground truth it was computed on [OpenAI, Evals Guide].
- Refresh cadence: review the dataset each release cycle. Add cases for every production incident, retire cases the system has saturated (persistent 100 percent) into a smaller regression set, and re-verify ground truth when underlying data or policy changes.

### Component-level evals: score retrieval and generation separately

End-to-end scores cannot localize a failure. For RAG systems, evaluate the retriever and the generator independently, with distinct metrics and thresholds:

Retrieval metrics (run against the retriever alone, using labeled query-to-evidence pairs):

- recall@k: did the needed evidence appear anywhere in the top k results. The primary retrieval health metric; if evidence is absent, no generator can be faithful.
- MRR (mean reciprocal rank): how high the first relevant chunk ranks, which matters because models weight early context more heavily.
- Context precision: RAGAS computes this as mean precision@k weighted by the relevance of the item at each rank, so an irrelevant chunk ranked first hurts far more than one ranked last; relevance can be judged by an LLM against a reference, by string similarity, or by chunk ID match [RAGAS, Context Precision].
- Context recall: what fraction of the claims in the reference answer are attributable to the retrieved context [RAGAS, Metrics].

Generation metrics (run against the generator with retrieval held fixed):

- Faithfulness: RAGAS decomposes the response into atomic claims, verifies each against the retrieved context, and scores supported claims divided by total claims [RAGAS, Faithfulness].
- Response relevancy: alignment between the generated answer and the user's question; evasive or off-topic answers score low even when faithful [RAGAS, Metrics].
- Noise sensitivity: resilience of the generator to irrelevant retrieved chunks [RAGAS, Metrics].
- Cheaper production path: RAGAS supports a trained hallucination classifier (Vectara HHEM) in place of LLM-based claim verification for high-volume checking [RAGAS, Faithfulness].

The TruLens RAG Triad is the minimal component decomposition and a useful design checklist: context relevance catches retrieval failures, groundedness catches generation hallucinations (each claim in the response is independently checked for supporting evidence in the retrieved context), and answer relevance catches responses that pass both yet fail to address the question. Passing all three verifies the system is hallucination-free up to the limit of its knowledge base [TruLens, RAG Triad]. A design should name which triad leg each proposed metric covers.

### LLM-as-judge design and bias mitigation

LLM judges make open-ended outputs measurable at scale, but they are biased instruments that must be engineered [Li et al., LLMs-as-Judges Survey].

Scoring mode. Pick one mode per metric and keep it fixed:

- Pointwise (score each output alone against a rubric): simple, works for absolute gates and trend tracking.
- Pairwise (compare two outputs, pick the better): mirrors human judgment; preferred when differences are subtle and hard to quantify.
- Listwise (rank a candidate set): for holistic comparisons across many variants.
- These modes are not mutually consistent: pointwise scores do not reliably convert to pairwise preferences, and judges violate transitivity in pairwise chains (A beats B and B beats C does not guarantee A beats C) [Li et al., LLMs-as-Judges Survey].

Rubric prompting. Give the judge explicit criteria (linguistic quality, content accuracy, task-specific dimensions such as completeness or informativeness), a defined scale with anchored descriptions per level, and few-shot graded examples, which measurably improve alignment with human expectations. Isolate one dimension per judge rather than one judge scoring everything, and require the judge to produce an explanation, which improves both transparency and accuracy [Li et al., LLMs-as-Judges Survey; Anthropic, Demystifying Evals].

Known biases and mitigations:

- Position bias (preferring the first or last candidate in pairwise prompts): swap positions and average, or randomize order across the dataset [Li et al., LLMs-as-Judges Survey].
- Verbosity bias (preferring longer answers regardless of quality): control length in rubric instructions and check score-length correlation during calibration [Li et al., LLMs-as-Judges Survey].
- Self-preference bias (a judge favoring outputs from its own model family): use a judge from a different model family than the system under test, or a multi-judge ensemble [Li et al., LLMs-as-Judges Survey].
- Additional documented biases include authority, bandwagon, sentiment, token, overconfidence, and distraction biases; multi-LLM ensembles, chain-of-thought prompting, and probability calibration reduce their impact [Li et al., LLMs-as-Judges Survey].

Calibration and operations. Regularly grade a sample with human experts and measure judge-human agreement; a judge without a measured agreement rate is an unvalidated metric [Anthropic, Demystifying Evals]. Version-pin the judge model and rubric, and re-baseline all historical comparisons when either changes, since a judge upgrade silently shifts every score. Reserve human graders for calibrating judges and for genuinely subjective domains.

Grader selection order. Prefer the cheapest grader that measures the criterion: deterministic code graders (fast, reproducible, brittle to valid alternatives) for objective checks, LLM judges (flexible, costly, needing calibration) for open-ended quality, humans (gold standard, unscalable) for calibration and subjective domains [Anthropic, Demystifying Evals]. Budget judge cost explicitly: a judged eval suite is itself an inference workload that scales with dataset size and release frequency.

### Agent-specific evaluation

Agents add tool use, multi-turn state, and non-determinism; the eval design must cover all three.

- Task completion (outcome grading): grade what the agent produced, not the path it took, so valid alternative solutions are not penalized. Use deterministic code graders where the end state is checkable (database row written, ticket closed, test suite passes) [Anthropic, Demystifying Evals].
- Tool-call correctness: separately assert that the right tool was called with schema-valid, semantically correct arguments, and that policy-restricted tools were not called. This is a component-level eval for the action layer, analogous to retrieval metrics for the knowledge layer.
- Trajectory evaluation: read transcripts (the full record of outputs, tool calls, and reasoning) regularly. Transcript review is how you discover unfair graders, rejected-but-valid solutions, and silent failure patterns that outcome metrics miss [Anthropic, Demystifying Evals].
- Reliability under repetition: report pass^k (probability that all k independent trials succeed), not just pass@1 or pass@k (at least one of k succeeds); the two diverge sharply as k grows [Anthropic, Demystifying Evals]. tau-bench, which simulates dynamic conversations between an LLM-simulated user and a tool-using agent bound by domain policy, found that state-of-the-art function-calling agents succeed on fewer than 50 percent of tasks, and consistency is worse: pass^8 fell below 25 percent in the retail domain [Yao et al., tau-bench]. For enterprise workflows that run thousands of times, pass^k at a realistic k is the honest reliability number; a design targeting unattended automation must state its pass^k target explicitly.
- Rule adherence: tau-bench's second finding is that agents fail to follow domain policy consistently; include eval cases where the correct behavior is refusal or escalation, not task completion [Yao et al., tau-bench].
- Statistical rigor: run multiple trials per case for non-deterministic agents and compare distributions, not single runs; treat differences within run-to-run noise as ties rather than wins.

### Online evaluation

Offline evals bound quality before exposure; online evaluation measures it under real traffic.

- Shadow deployment: run the new system on live inputs without serving its outputs; compare against the incumbent on judge scores, cost, and latency. Zero user risk, no behavioral feedback.
- Canary release: serve a small traffic slice (1 to 5 percent) with automated rollback triggers tied to eval metrics, error rates, and guardrail trigger rates.
- A/B testing: randomized assignment with predefined success metrics (task completion, deflection, CSAT, downstream conversion) for changes whose value shows only in user behavior.
- Human feedback loops: capture explicit signals (thumbs, ratings, agent-handoff reasons) and implicit signals (retries, abandonment, copy events, edits to generated output). Route flagged interactions into a human review queue and, from there, into the golden dataset [Anthropic, Demystifying Evals].
- Operational health as quality proxy: guardrail trigger rate, human-escalation rate, and steps-per-task distribution are online early-warning signals that move before judge scores do (see knowledge/interoperability-observability.md).

### Hallucination and groundedness controls

Confabulation (confidently stated false content) is a named GenAI risk requiring pre-deployment measurement and ongoing management [NIST, AI 600-1]. Controls to specify:

- A faithfulness or groundedness metric with a hard threshold enforced in CI [RAGAS, Faithfulness; TruLens, RAG Triad].
- Citation requirements in the output contract so every claim is traceable to a retrieved source.
- Refusal or escalation behavior when retrieval returns nothing sufficiently relevant, verified by negative eval cases.
- An online groundedness sampler scoring a fraction of production responses to detect drift.

### Eval gates in rollout

Make promotion criteria explicit and mechanical:

- Before shadow: offline golden dataset pass rate meets threshold on every stratum; component metrics (retrieval recall@k, faithfulness) meet floors; safety and injection suites pass at 100 percent; judge calibrated against a human-graded sample.
- Shadow to canary: shadow scores non-inferior to incumbent; cost and latency within budget; no new failure classes found in transcript review.
- Canary to GA: canary metrics stable for a predefined window; guardrail trigger rate and human-escalation rate within bounds; pass^k measured on repeated canary tasks meets the reliability target [Yao et al., tau-bench]; rollback rehearsed.
- Post-GA: every regression or incident becomes a golden dataset case before the fix ships, so the suite ratchets forward [Anthropic, Demystifying Evals].

### Observability-eval integration

Production tracing and evaluation form one loop. Traces that capture full prompt, retrieval, tool-call, and response chains (see knowledge/interoperability-observability.md) are the raw material for new eval cases: sample failed or low-scored traces, strip PII per retention policy, attach ground truth, and add them to the golden dataset. Run cheap online judges (groundedness, relevance) on sampled traces and alert on score drift, which usually signals data drift, prompt regression, or upstream model changes before users report them [Anthropic, Demystifying Evals; TruLens, RAG Triad].

## When to apply

- Every design: name the eval harness, the golden dataset source and size, per-component metrics, and rollout gates. No design ships without this section.
- RAG-centric systems: mandate the RAG Triad or the equivalent RAGAS metric set, with retrieval and generation scored separately [TruLens, RAG Triad; RAGAS, Metrics].
- Agentic systems (rung 3 and above on the escalation ladder): add tool-call correctness, trajectory review, policy-adherence cases, and pass^k reliability targets [Yao et al., tau-bench].
- Open-ended generation without checkable ground truth: use calibrated LLM judges in pairwise mode against a baseline, with position swapping and cross-family judges [Li et al., LLMs-as-Judges Survey].
- High-stakes or regulated domains: raise the human grading fraction, require 100 percent pass on safety strata, and tie gates to the governance controls in knowledge/security-governance.md [NIST, AI 600-1].

## Common failure modes

- Building the system first and retrofitting evals, so the eval encodes what the system does rather than what it should do [Anthropic, Demystifying Evals].
- One aggregate accuracy number over an unstratified dataset, hiding regressions in minority intents or languages.
- End-to-end scores only: a retrieval failure and a hallucination look identical, so fixes target the wrong component [TruLens, RAG Triad].
- Uncalibrated LLM judges: no human agreement measurement, same-family judge grading its own model, no position swapping in pairwise prompts [Li et al., LLMs-as-Judges Survey].
- Silently upgrading the judge model or rubric mid-project, invalidating every historical comparison.
- Reporting pass@1 on a demo set and inferring production reliability; tau-bench shows pass^k collapses well below single-trial rates [Yao et al., tau-bench].
- Grading the trajectory instead of the outcome, penalizing valid alternative solutions [Anthropic, Demystifying Evals].
- A happy-path-only dataset with no refusal or escalation cases, certifying a system that never says no.
- A static golden dataset that saturates: scores stay high while production quality drifts, because no production failures flow back into the suite.
- Skipping shadow and canary stages because offline scores look strong; offline datasets never cover the full input distribution.

## Citations

- [Anthropic, Demystifying Evals] Demystifying evals for AI agents. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- [OpenAI, Evals Guide] Evaluating model performance. https://developers.openai.com/api/docs/guides/evals
- [RAGAS, Metrics] Ragas: available metrics overview. https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/
- [RAGAS, Faithfulness] Ragas: faithfulness metric. https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/
- [RAGAS, Context Precision] Ragas: context precision metric. https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/context_precision/
- [TruLens, RAG Triad] TruLens core concepts: RAG Triad. https://www.trulens.org/getting_started/core_concepts/rag_triad/
- [Li et al., LLMs-as-Judges Survey] LLMs-as-Judges: A Comprehensive Survey on LLM-based Evaluation Methods (arXiv:2412.05579). https://arxiv.org/abs/2412.05579
- [Yao et al., tau-bench] tau-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains (arXiv:2406.12045). https://arxiv.org/abs/2406.12045
- [NIST, AI 600-1] Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile (NIST AI 600-1). https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
