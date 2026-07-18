---
title: Invoice Approval Router
subtitle: A design that routes structured invoices to the right approver by amount, vendor, and department rules
mode: production
date: 2026-07-18
---

## 1. Executive summary

Incoming invoices carry structured fields already (amount, vendor id, department), and the routing policy is a set of known, stable rules, so this is a deterministic classification problem, not a generative one. The right architecture is Rung 0 on the escalation ladder: a deterministic rules engine that evaluates the fields against a versioned rule table and assigns each invoice to an approver, with an exceptions queue to a human for anything no rule matches. You do not need generative AI, and you do not need any model call at all, because the inputs are already structured and the mapping from fields to approver is an explicit, auditable policy rather than a judgment over unstructured text [knowledge/decision-trees.md, Tree 1]. The one decision that shapes everything is keeping the routing logic deterministic and data-driven, so every routing decision is exact, explainable, reproducible, and cheap. At 2000 invoices per day the compute cost is a rounding error (a small always-on service, dollars per month), latency per invoice is single-digit milliseconds, and rollout is a shadow-then-cutover against the current manual routing with the human exceptions path live from day one.

## 2. Requirements and NFRs

Functional requirements, as system-visible behaviors:

- Accept an invoice record with structured fields (at least amount, vendor id, department) from the upstream feed.
- Evaluate the record against the routing rule set and assign it to exactly one approver (or approver group).
- When no rule matches, or a required field is missing or malformed, route the invoice to a human exceptions queue rather than guessing.
- Record every routing decision (input fields, matched rule id, chosen approver, timestamp) in an immutable audit log.

Explicit non-goals for v1:

- No approval or payment: the system routes an invoice to an approver; a human approves. It never approves, pays, or posts to the ledger.
- No generative AI, no free-text understanding, no model call of any kind (the fields are already structured).
- No vendor master data cleanup or OCR: upstream systems deliver clean structured fields.
- No learned or probabilistic scoring of approvers.

NFRs (numbers the design is sized to):

| NFR | Target | Basis |
|---|---|---|
| Load | 2000 invoices/day (about 0.02/s average; assume peaks under 5/s) | stakeholder supplied; peak is an assumption |
| Latency | p95 routing decision under 50 ms (batch-tolerant; not user-interactive) | rule evaluation over a few fields |
| Availability | 99.9 percent; on outage, invoices queue upstream and drain, none dropped | AP is time-sensitive but tolerant of minutes |
| Cost ceiling | low tens of dollars per month of compute; no per-request model cost | deterministic compute only |
| Compliance | none named by the stakeholder; treated as financial-controls sensitive (see section 8) | assumption, flagged |
| Team and timeline | assume a small team, ship in weeks | assumption, flagged |

<div class="callout assumption">
<span class="callout-label">Assumptions to validate</span>
Peak arrival rate (assumed under 5 per second) should be confirmed against the upstream batch schedule; it does not change the architecture at any plausible value. Compliance regime is assumed to be internal financial controls (segregation of duties, an audit trail) rather than a named external regime; confirm whether SOX or an equivalent applies, since it only tightens the audit and access requirements already in the design. The rule set is assumed to be expressible as ordered predicate rules over the three fields; if approver selection actually needs data the fields do not carry, that is a data problem to solve upstream, not a reason to add a model.
</div>

## 3. Decision record

<div class="callout decision">
<span class="callout-label">Weight class</span>
LIGHTWEIGHT. The design lands at Rung 0 (deterministic code, no model), uses only Tier 0 and Tier 1 tools, holds ordinary per-record application data with no multi-tenant retrieval store, and carries no named compliance regime. Per the SKILL.md right-sizing rule, sections 1 to 4, 6, 9, and 11 are written in full; sections 5, 7, 8, 10, 12, and 13 are short form, with the domain-safety treatment in section 8 kept at full depth because the domain touches money and financial controls. This is the shortest document the skill produces, because the honest answer is that no AI is required.
</div>

Every decision tree from knowledge/decision-trees.md was walked in order.

**Tree 1: do you need generative AI at all.** No. The first gate asks whether the task is deterministic with well-defined inputs and outputs. It is: the inputs are structured fields (amount, vendor id, department), and the output is one approver selected by known, stable rules. The tree says to stop at deterministic automation and not introduce any model [knowledge/decision-trees.md, Tree 1]. There is no unstructured input to interpret and no content to generate, so the second and third gates (search, tolerate non-determinism) are never reached. The non-AI path is the whole design: a rules engine. Stated plainly, you do not need generative AI here, and adding it would make routing slower, costlier, less auditable, and non-deterministic for zero benefit.

**Tree 2: the escalation ladder.** Final rung: Rung 0 (deterministic code, no model).

| Rung | Verdict | Why |
|---|---|---|
| Rung 0, deterministic only | Chosen | The fields are structured and the rules are explicit and stable, so a rule table plus an evaluator produces an exact, reproducible approver assignment. This is the floor of the ladder and the task never leaves it [knowledge/decision-trees.md, Tree 2]. |
| Rung 1, single augmented model call | Rejected | The 0-to-1 criterion is that the task requires understanding or generating natural language, or judgment over unstructured input. None of that is present, so a model call is unjustified and would only add latency, cost, and a non-deterministic failure surface [knowledge/building-effective-agents.md, escalation ladder]. |
| Rung 2, workflow | Rejected | There are no model steps to orchestrate; the flow is plain code (validate, match, dispatch, log). |
| Rung 3, single agent | Rejected. You do not need an agent: the path is fully predetermined and nothing depends on open-ended tool selection or iterative exploration, so there is no open-ended decision for a loop to make [knowledge/building-effective-agents.md]. |
| Rung 4, multi-agent | Rejected. There is no agentic behavior to add and no decomposition, so nothing multi-agent is warranted. |

Anti-escalation check: a deterministic rules engine delivers 100 percent of the value at the lowest cost and the highest predictability, so the anti-escalation rule forbids climbing above Rung 0 [knowledge/decision-trees.md, Tree 2, anti-escalation rule].

**Tree 3: workflow pattern selection.** Not applicable: the design is Rung 0, so there is no LLM workflow pattern to select.

**Tree 4: knowledge strategy.** Not applicable in the retrieval sense, and no vector store. The system needs no knowledge beyond its own rule table and approver directory, both of which are ordinary structured data it owns. A vector database is explicitly rejected: routing is an exact predicate match over structured fields, not a semantic-similarity search, so embeddings would make an exact decision fuzzy, slower, and unauditable for no gain [knowledge/decision-trees.md, Tree 4; knowledge/rag-patterns.md, when RAG is not the answer]. Fine-tuning and long context are moot because there is no model.

**Tree 5: multi-agent topology.** Not applicable: not Rung 4.

**Tree 6: autonomy tiers.** Every action is Tier 0 or Tier 1. Reading fields, evaluating rules, and looking up an approver are Tier 0 (read-only). Assigning an invoice to an approver's queue and writing the audit record are Tier 1 (reversible, internal writes, no external effect and no payment). There is no Tier 2 or Tier 3 action because the system never approves, sends money, or changes access. Full table in section 6 [knowledge/security-governance.md, autonomy tiers].

**Tree 7: memory tier.** No memory beyond the record. Each invoice is routed independently with no cross-invoice state and no personalization, so per Tree 7 there is no memory store to design. The rule table, approver directory, and audit log are ordinary application data, not a conversational or agent memory store [knowledge/decision-trees.md, Tree 7].

## 4. System architecture

The request path is a short deterministic pipeline: validate the fields, evaluate the rules, look up the approver, dispatch, and log. No model sits anywhere in it. The architecture diagram wraps the decision core in a boundary to make the load-bearing point visual: the routing decision is a pure function of structured fields and a versioned rule table, so it is exact and reproducible.

![Figure 1. Routing path: field validation, a deterministic rules engine, an approver-directory lookup, dispatch to the approver's queue, and an immutable audit log. Anything with no matching rule (or a malformed field) goes to the exceptions queue and a human analyst. The boundary marks the deterministic decision core, which contains no model.](invoice-approval-router.architecture.html)

| Component | Requirement it serves | Scaling model | Failure mode and fallback | Technology example |
|---|---|---|---|---|
| Invoice Feed | Deliver structured invoice records from upstream | External; push or poll | If upstream is down, nothing arrives; records queue upstream and drain later | ERP or AP system export, message on a bus |
| Field Validation | Reject malformed or incomplete records before routing | Stateless, horizontal | On invalid or missing required field, send to the exceptions queue (fail to human, never guess) | schema check (JSON Schema) in the service tier |
| Rules Engine | Evaluate amount, vendor, and department against the rule table and select the matching rule | Stateless compute over a small in-memory rule set | If evaluation errors or no rule matches, route to the exceptions queue | ordered predicate rules or a decision-table engine, e.g. a small rules library or plain code |
| Approver Directory | Map the matched rule (and department) to a current approver or group | Read-heavy; tiny; cache | If the mapped approver is unknown or inactive, route to exceptions | relational table, e.g. Postgres |
| Routing Dispatcher | Assign the invoice to the chosen approver's queue and notify | Stateless, horizontal | On assign failure, retry with an idempotency key, then exceptions | internal service writing to a work queue |
| Approver Queue | Hold invoices awaiting the assigned approver | Per-approver; durable | Standard durable queue semantics | work queue or a table, e.g. Postgres or SQS |
| Exceptions Queue | Hold invoices no rule matched or that failed validation | Durable | This is itself the fallback path; monitored for depth | durable queue or table |
| AP Analyst (human) | Resolve exceptions by routing them by hand and, over time, propose new rules | Human; staffed to exception volume | Backstop for everything the rules do not cover | existing AP staff and tooling |
| Audit Log | Immutable record of every routing decision for financial controls | Append-only; retained | Write-ahead of the assign; if the log write fails, the assign is not committed | append-only store, e.g. Postgres with an append-only table or an object-store log |

Trust boundary: the security group in Figure 1 wraps Field Validation, the Rules Engine, the Approver Directory, and the Routing Dispatcher. This is the deterministic decision core. Because it contains no model and reads only structured fields plus a versioned rule table, a routing decision cannot be caused by anything other than the stated rules, which is exactly the property financial controls want.

## 5. Data and retrieval

Short form: there is no retrieval layer, no embeddings, and no vector store (Tree 4). The only data the system holds is the routing rule table, the approver directory, and the audit log, all structured and owned by the service.

- The rule set is versioned configuration, not code: each rule has an id, an ordered priority, a predicate over the fields (for example amount thresholds, a vendor allowlist, or a department key), and a target approver or group. Versioning the rule set is what makes a routing decision reproducible after the fact and lets a changed rule be reviewed and rolled back.
- Freshness: rules and the approver directory change occasionally (a new threshold, a staffing change) and are edited through a reviewed change process, not at request time. There is no ingestion pipeline and no reindexing to design.
- Chunking, embeddings, hybrid search, and reranking are all not applicable because there is no unstructured corpus and no similarity search anywhere in the design.

## 6. Tools and integrations

Every action the system can take, with its autonomy tier and enforcement gate. Nothing exceeds Tier 1, which is the core evidence for the lightweight weight class [knowledge/security-governance.md, autonomy tiers].

| Tool | Interface | Autonomy tier | Enforcement gate | Idempotency and retry |
|---|---|---|---|---|
| Read invoice fields | Internal function | Tier 0, read-only | Reads only the structured record delivered by the feed | Pure; safe to retry |
| Evaluate rules | Internal function over the rule table | Tier 0, read-only | Deterministic evaluation; on no match it must route to exceptions, never invent an approver | Pure function of (fields, rule version); reproducible |
| Look up approver | Internal service call | Tier 0, read-only | Reads the approver directory; unknown or inactive approver routes to exceptions | Idempotent |
| Assign to approver queue | Internal service call | Tier 1, reversible internal write | Segregation of duties enforced in the directory (an invoice is never routed to its own submitter as approver); reassignable | Stable idempotency key per invoice id prevents duplicate assignment on retry |
| Write audit record | Append-only internal write | Tier 1, reversible only by compensating entry | Written ahead of committing the assignment; append-only | Idempotency key per (invoice id, decision) prevents duplicate entries |

There are no send-money, post-to-ledger, approve, publish, delete, or access-control tools, so there is no Tier 2 or Tier 3 gate to build. If a future request adds auto-approval under a threshold, that is a Tier 2 or Tier 3 action and must re-open sections 6 and 8.

## 7. State and memory

Short form: no agent memory and no cross-request state (Tree 7). Each invoice is routed independently. The rule table, approver directory, and audit log are ordinary durable application data with a normal backup and retention policy, not a conversational or persistent memory store. There is no session to compact and no multi-tenant memory isolation concern.

## 8. Security, identity, and guardrails

Short form on general security, full depth on domain safety, because the domain touches money and financial controls.

**Domain-harm statement.** The worst realistic outcome is financial and control harm: an invoice routed to the wrong approver, or approved by someone without the authority for that amount, enabling erroneous or fraudulent payment, or a segregation-of-duties breach (a submitter approving their own invoice). A secondary harm is process and audit failure: a routing decision that cannot be explained or reproduced during a financial audit. These harms are independent of company size or traffic, so the guardrails are sized to the harm, not to 2000 invoices per day [SKILL.md rule 8; knowledge/security-governance.md].

Guardrails, sized to that harm:

- Deterministic decision as the control. Routing is a pure function of structured fields and a versioned rule table, evaluated in code. There is no model and no probabilistic scoring, so a routing decision is always exact, explainable by citing the matched rule id, and reproducible from the audit record. This is the primary financial control and is shown architecturally by the deterministic-core boundary in Figure 1.
- Fail to a human, never guess. Any invoice that matches no rule, carries a missing or malformed required field, or maps to an unknown or inactive approver is sent to the exceptions queue for an analyst, not routed on a best guess. Ambiguity resolves to a human, which is the fail-closed posture for a money-adjacent decision.
- Segregation of duties. The approver directory enforces that an invoice is never routed to its own submitter and that the selected approver holds the authority tier the amount requires; this rule lives in the deterministic core, not in a person's discretion.
- No approval or payment authority. The system routes for approval; it never approves, pays, or posts. The blast radius of a wrong routing decision is therefore a misdirected review, caught by the approver and the audit log, not an unauthorized payment.
- Immutable audit trail. Every decision (input fields, matched rule id and version, chosen approver, timestamp) is written append-only, ahead of committing the assignment, so the trail is complete even if the assignment write later fails.

<div class="callout risk">
<span class="callout-label">The one rule that must not be broken</span>
No model and no probabilistic scoring may enter the routing decision, and the system must never gain approval or payment authority. Either change would void the deterministic, auditable, fail-to-human guarantees this design rests on, and must re-open this section and the section 9 gates.
</div>

General security, short form:

- Identity propagation (one line): the service reads only the structured invoice record and its own rule and approver tables; it takes no action on behalf of an end user and has no shared multi-tenant data store to isolate.
- Input validation: field and schema validation on the incoming record is the input guardrail; malformed input routes to exceptions rather than through the rules.

## 9. Evaluation plan

Evaluation here is almost entirely deterministic testing, which is exactly right for a deterministic system: the correct approver for a given invoice is a checkable fact, so code graders are preferred over any model judge [knowledge/evaluation.md, grader selection order].

Golden dataset:

- A labeled set of invoice records paired with the correct approver, built from historical invoices and their known-correct routing. Stratify across the rule dimensions: amount bands (including exactly on each threshold boundary), each major vendor class, each department, and the negative cases (no rule matches, missing field, inactive approver) that must land in the exceptions queue. Refresh whenever a rule changes; every real misroute becomes a case.

Metrics:

- Routing correctness: fraction of records routed to the labeled-correct approver, which must be 100 percent on the covered rule set (a deterministic system either encodes the rule or does not).
- Exceptions behavior: every negative case must route to the exceptions queue, never to a guessed approver (recall on must-exception cases equals 1.0).
- Boundary tests: threshold-edge invoices (an amount exactly at a limit) route as the policy intends; these are the most common source of rule-logic bugs.
- Rule-change safety: a regression suite runs on every rule-set edit, so a new or edited rule cannot silently change the routing of unrelated invoices.

There is no LLM-as-judge because there is no generation to grade; correctness is exact.

Gate table:

| Promotion | Gate |
|---|---|
| To shadow | 100 percent routing correctness on the golden set; all negative cases route to exceptions |
| Shadow to cutover | Shadow routing matches the current manual routing on the live stream within an agreed tolerance, and every disagreement is reviewed and resolved into either a rule fix or a corrected label |
| Post-cutover | Every misroute or new invoice pattern becomes a golden case and, where appropriate, a reviewed rule change before the fix ships |

## 10. Observability

Short form. Trace each invoice with the input field values, the matched rule id and version (or the exception reason), the chosen approver, and the per-stage latency, following standard structured logging [knowledge/interoperability-observability.md]. The metrics that matter at this size: throughput, exception rate (a rising exception rate usually means reality drifted from the rules), routing latency, and any validation-failure spike. Alert on exception-queue depth and on any assignment or audit-write error. Sampled traces and every exception feed the golden set in section 9.

## 11. Scale and cost analysis

Back-of-envelope, shown rather than asserted. There are no model calls, so there is no token cost and no model-pricing table to source; the cost story is deterministic compute plus a small database.

- Work per invoice: validate a handful of fields, evaluate an ordered rule set (tens of rules at most) held in memory, one indexed approver-directory read, one queue write, one append-only audit write. This is microseconds of CPU plus a couple of small database operations, on the order of single-digit milliseconds end to end.
- Volume: 2000 invoices per day is about 0.02 per second on average. Even at a generous assumed peak under 5 per second, a single small stateless instance handles the load with wide headroom; two instances behind a load balancer give the 99.9 percent availability target.
- Cost: the dominant cost is an always-on small service and a small database, on the order of low tens of dollars per month, independent of invoice count at this scale. Per-invoice marginal cost is effectively zero because there is no metered model call. This is the concrete payoff of staying at Rung 0: the cost curve is flat, not per-request.

The 10x scenario (20,000 invoices per day, about 0.23 per second, assumed peaks under 50 per second): nothing structural changes. The Rules Engine is stateless and scales horizontally, so add instances; the rule set is still small and stays in memory. What to watch first is not compute but the audit log and approver-queue write throughput, both ordinary database scaling (indexing, partitioning by date), not an architectural change. There is no caching tier or model-routing decision to make because there is no model in the path.

## 12. Failure modes and degradation

Short form. Degradation ladder: full service, then exceptions-to-human, then queue-and-drain, never a wrong routing and never a dropped invoice.

- No rule matches, or a malformed or missing field: route to the exceptions queue for an analyst (the designed fallback, not an error).
- Approver directory returns an unknown or inactive approver: route to exceptions rather than assign to a stale approver.
- Downstream queue or database write fails: retry with the invoice-id idempotency key; on persistent failure, hold the invoice and page an operator so nothing is lost or double-assigned.
- Upstream feed outage: invoices queue upstream and drain when the feed returns; none are dropped.
- There are no loops to bound and no runaway-cost or model-timeout failure mode, because there is no model and no agent loop in the design.
- Incident signals that page a human: a spike in the exception or validation-failure rate (reality drifting from the rules), exception-queue depth crossing a threshold, or any audit-write failure.

## 13. Rollout plan

Short form, gated by the section 9 evals, and simpler than a crawl-walk-run because there is no autonomy to unlock incrementally.

- Shadow: run the rules engine alongside the current manual routing on the live stream, assigning nothing, and compare its choice to the human routing. Promote only when routing correctness is 100 percent on the golden set and shadow disagreements are all resolved into rule fixes or corrected labels.
- Cutover: enable real routing with the human exceptions path live from the first invoice. Keep manual override available.
- Steady state: every misroute or new invoice pattern becomes a golden case and, where the policy should change, a reviewed and versioned rule edit, so the rule set and its test suite ratchet forward together.

## 14. References

Knowledge base documents cited (each carries its primary sources):

- knowledge/decision-trees.md (Trees 1, 2, 4, 6, 7 and the anti-escalation rule and gate checklist; carries Anthropic Building Effective Agents, OpenAI Practical Guide, Selamy GenAI loop).
- knowledge/building-effective-agents.md (the escalation ladder and the workflow-versus-agent boundary).
- knowledge/rag-patterns.md (when retrieval and a vector store are not the answer).
- knowledge/security-governance.md (autonomy tiers, tool-layer enforcement, audit trail).
- knowledge/evaluation.md (golden datasets, grader selection order, rollout gates).
- knowledge/interoperability-observability.md (structured tracing and debugging from traces).
- knowledge/latency-cost-reliability.md (capacity and the flat deterministic cost curve).

Live-sourced citations: none. This design makes no model call, so there is no model pricing or model-choice claim to source.
