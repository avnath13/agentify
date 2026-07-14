---
title: Fridge-to-Recipe Assistant
subtitle: A design that suggests catalog recipes from free-text fridge contents and builds a shopping list
mode: production
date: 2026-07-14
---

## 1. Executive summary

Users type what is in their fridge as free text, and the feature suggests a few recipes they can actually make from a vetted 12,000 recipe catalog, then builds an in-app shopping list for the missing items. The right architecture is Rung 1 on the escalation ladder: one small language model call that extracts a structured ingredient list from the free text, wrapped in deterministic code that does the matching, the diet and allergy filtering, and the shopping-list diff. There is no agent, no workflow of chained model calls, and no vector RAG, because recipe selection is a set-coverage query over structured tags, not a semantic-similarity problem, and because allergen safety must be exact rather than fuzzy. The two decisions that shaped everything are keeping recipe selection deterministic (so recipes come from the catalog and are never invented) and making the allergen filter a hard, fail-closed database filter that the model never touches. At an assumed 100,000 requests per month the model cost is roughly 105 dollars per month on a small model with a sub 1.5 second interactive latency budget, and rollout is crawl-walk-run gated on a 100 percent allergen-safety eval before any allergy-restricted user is enabled.

## 2. Requirements and NFRs

Functional requirements, as user-visible behaviors:

- A user enters fridge contents as free text (for example "half an onion, leftover roast chicken, a can of chickpeas, some rice").
- The system returns a small ranked set of recipes drawn only from the catalog that the user can mostly make with those ingredients, honoring the diet and allergy settings in their profile.
- For a chosen recipe, the system builds an in-app shopping list of the ingredients the user did not list.
- Recipes and their content are shown from the catalog record, never generated.

Explicit non-goals for v1:

- No recipe generation or invention of any kind.
- No voice, image, or barcode input (text only).
- No payments, grocery ordering, or external sends (the shopping list stays in-app).
- No cross-user or social features, no meal planning across days.

NFRs (numbers the design is sized to):

| NFR | Target | Basis |
|---|---|---|
| Scale | 20,000 MAU; assumed 100,000 feature requests per month (about 3,300 per day, low concurrency) | request rate is an assumption, see below |
| Latency | p95 end to end under 1.5 s (interactive) | single serial model hop dominates |
| Availability | 99.5 percent for the feature; degrades to a manual ingredient picker, never hard-down | seed-stage consumer app |
| Cost ceiling | model spend a small fraction of infra; low hundreds of dollars per month at base load | budget-conscious, seed stage |
| Compliance | none named | stakeholder confirmed no compliance regime |
| Team and timeline | 3 engineers, ship in about one quarter | stakeholder supplied |

<div class="callout assumption">
<span class="callout-label">Assumptions to validate</span>
Request volume of 100,000 per month is assumed at roughly 5 feature uses per MAU per month; the real number should be measured in beta and the cost math rescaled. Diet and allergy data already exists in the user profile. The catalog's 12,000 recipes have structured but not normalized ingredient lists and can be enriched offline with a canonical ingredient vocabulary and allergen tags. Text is the only input modality for v1.
</div>

## 3. Decision record

<div class="callout decision">
<span class="callout-label">Weight class</span>
LIGHTWEIGHT. The design lands at Rung 1 (a single augmented model call), uses only Tier 0 and Tier 1 tools, holds per-user data with no multi-tenant retrieval store, and carries no compliance regime. Per the SKILL.md right-sizing rule, sections 1 to 4, 6, 9, and 11 are written in full; sections 5, 7, 8, 10, 12, and 13 are short form, with the domain-safety treatment in section 8 kept at full depth because the domain touches allergens.
</div>

Every decision tree from knowledge/decision-trees.md was walked in order.

**Tree 1: do you need generative AI at all.** Partly. The task is not deterministic at the input boundary: free-text fridge contents ("some scallions, half a rotisserie chicken") require natural-language understanding to become a canonical ingredient list. But the core downstream need is finding recipes in an existing catalog, not generating them, so per Tree 1 the answer is to improve search first and add generation only where synthesis over unstructured input is required, which here is only the extraction step [knowledge/decision-trees.md, Tree 1; knowledge/rag-patterns.md, "retrieval theater"]. Non-AI fallback: a structured ingredient typeahead or multi-select picker with zero model calls; this is a real product option and also the degradation path (section 12). We use a model only because the product requires free-text entry. Recipes are found, never generated.

**Tree 2: the escalation ladder.** Final rung: Rung 1 (single augmented model call).

| Rung | Verdict | Why |
|---|---|---|
| Rung 0, deterministic only | Rejected for the input parse | Free-text-to-ingredients needs language judgment. The deterministic picker remains a valid fallback and product alternative. |
| Rung 1, single augmented model call | Chosen | One model call extracts a structured ingredient list; deterministic code does normalization, matching, filtering, and the list diff around it. Exactly one model step. |
| Rung 2, workflow | Rejected | There is only one model step; the surrounding steps are plain code, not orchestrated model steps, so there is no multi-step model workflow to build. Adding model steps (model re-ranking, model-written shopping lists) would add latency, cost, and a hallucination surface for no measured gain (anti-escalation rule) [knowledge/decision-trees.md, Tree 2]. |
| Rung 3, single agent | Rejected | The path is fully predetermined (extract, normalize, match, filter, diff). Nothing depends on open-ended tool selection or iterative exploration [knowledge/building-effective-agents.md]. |
| Rung 4, multi-agent | Rejected | No parallel read-heavy decomposition, no privilege separation need, no context-window pressure. |

**Tree 3: workflow pattern selection.** Not applicable: the design is Rung 1, not Rung 2, so there is no workflow pattern to select.

**Tree 4: knowledge strategy.** Chosen: structured query, no RAG, no fine-tuning, no long-context stuffing. The system needs knowledge beyond the model (the 12,000 recipe catalog), but that knowledge is accessed by a structured ingredient-to-recipe inverted index with deterministic coverage ranking and hard diet and allergen filters, not by semantic vector similarity [knowledge/decision-trees.md, Tree 4; knowledge/rag-patterns.md, "when RAG is not the answer"].

- Vector RAG over recipe text is the strongest rejected alternative. It loses because a "which recipes can I make" query is a set-coverage and filtering problem that is exact and explainable with structured tags, whereas embeddings make it fuzzier and less auditable, and because allergen filtering must be an exact match on tags, never a similarity score. Adding a vector store here would be retrieval theater: latency, cost, and a new failure surface for no gain [knowledge/rag-patterns.md].
- Fine-tuning is rejected: the need is neither stylistic nor behavioral, and baking a catalog into weights blocks per-recipe deletion and freshness [knowledge/rag-patterns.md, RAG vs fine-tuning].
- Long context is rejected: there is no reason to stuff 12,000 recipes into a prompt when a deterministic query is cheaper and exact.
- Nuance: ingredient normalization (mapping "scallion" to "green onion") may use a small precomputed lexical plus embedding synonym map built offline over the few-thousand-term ingredient vocabulary. That is a static lookup table, not query-time retrieval over the recipe corpus, and it does not make this a RAG system.

**Tree 5: multi-agent topology.** Not applicable: not Rung 4.

**Tree 6: autonomy tiers.** All tools are Tier 0 or Tier 1; there is no Tier 2 or Tier 3 action anywhere. Full table in section 6. The consequential control (allergen and diet filtering) is a read-only Tier 0 decision but is safety-critical and is enforced in code, fail-closed, never in the prompt [knowledge/security-governance.md, tool-layer enforcement].

**Tree 7: memory tier.** No agent memory. The interaction is single-turn (type fridge, get recipes), so per Tree 7 there is no memory beyond the request. Diet and allergy settings and the shopping list are ordinary per-user application state (a profile row, a list table), not a conversational or agent memory store, and there is no multi-tenant memory isolation problem [knowledge/decision-trees.md, Tree 7].

## 4. System architecture

The request path is a straight deterministic pipeline with exactly one model call near the front. The model extracts; code decides. The architecture diagram places the model extractor deliberately outside the deterministic safety boundary, so the allergen decision is made by code over the catalog tags and the user profile, never by the model.

![Figure 1. Request path: one extraction model call, then deterministic normalization, matching, fail-closed allergen filtering, and the in-app shopping list. The offline Catalog Normalizer builds the vocabulary and allergen tags. The dashed box is the deterministic safety path that excludes the language model.](recipe-assistant.architecture.html)

| Component | Requirement it serves | Scaling model | Failure mode and fallback | Technology example |
|---|---|---|---|---|
| Input validation | Reject oversized or malformed input; injection scan (OWASP LLM01) | Stateless, horizontal | On reject, ask the user to rephrase; cheap and fast | length and pattern checks in the app tier |
| Ingredient Extractor (model) | Turn free-text fridge contents into a schema-constrained ingredient list | Stateless call to a provider; horizontal | On timeout or provider outage, fall back to the manual ingredient picker (Rung 0 path) | small model, e.g. Claude Haiku 4.5 or GPT-5-mini, JSON schema output |
| Ingredient Normalizer | Map extracted terms to canonical ingredient ids (synonyms, plurals) | Stateless; in-memory vocab | Unmapped term is passed through as low-confidence and excluded from allergen assumptions | deterministic lexical plus precomputed synonym map |
| Recipe Matcher | Rank catalog recipes by ingredient coverage | Stateless compute over an in-memory index | If the index is unavailable, serve cached popular recipes for the listed staples | ingredient-to-recipe inverted index (in-process or Postgres GIN) |
| Allergen / Diet Filter | Exclude recipes that violate the user's allergies or diet | Stateless; reads profile and catalog tags | Fail-closed: unknown or incomplete allergen status is excluded for allergy-restricted users | code filter over normalized allergen and diet tags |
| Output Guardrail | Ensure only catalog recipes are shown and attach the allergen disclaimer | Stateless | Strips any non-catalog content by construction | template renderer keyed on recipe id |
| Shopping List Builder | Compute recipe ingredients minus fridge ingredients | Stateless | On error, show the recipe without the list rather than a wrong list | deterministic set diff, allergen-filtered |
| Recipe Catalog | Source of truth for recipes and allergen and diet tags | Read-heavy; replicas and cache | Read replica or cache; catalog is small (12k rows) | relational store, e.g. Postgres |
| User Profile | Diet and allergy settings | Read-heavy; per-user | Existing app store and authz | relational store |
| Ingredient Vocab | Canonical vocabulary and synonym map | Read-only; tiny | Rebuilt by the offline job | table or in-memory map |
| Catalog Normalizer (offline) | Build the vocabulary, the index, and per-recipe allergen and diet tags | Batch, runs on catalog change | If a recipe cannot be tagged, quarantine it from allergy-restricted users | offline batch job, optional model assist with human review |
| Eval Suite | Gate extraction quality and, at 100 percent, allergen-filter safety | Offline and CI | Blocks promotion on failure | code graders plus a small labeled set |

Trust boundary: the dashed security group in Figure 1 wraps the Recipe Matcher, the Allergen and Diet Filter, the User Profile, and the Recipe Catalog. The language model sits outside it. This is the load-bearing architectural choice: allergen safety is a deterministic function of catalog tags and the user profile, so a model error can affect which recipes are suggested for relevance but cannot cause an allergen to slip past the filter.

## 5. Data and retrieval

Short form: there is no query-time retrieval layer and no vector store (see Tree 4). The real data work is a one-time and then occasional offline build, and it is the main engineering task of this feature.

- Catalog Normalizer (offline): parse the 12,000 structured-but-not-normalized ingredient lists into a canonical ingredient vocabulary; build the ingredient-to-recipe inverted index used by the Matcher; tag every recipe with allergen classes and diet flags with per-recipe provenance.
- Allergen tagging must cover the regulated major allergen classes (for example the FDA big-9 and the EU 14) as a data requirement. Any recipe that cannot be confidently tagged is quarantined from allergy-restricted users rather than shown optimistically (this is what makes the section 8 fail-closed rule real).
- Freshness: the catalog changes infrequently, so a batch re-normalize on catalog updates is sufficient; there is no intra-day freshness NFR and no delete-propagation pipeline to design at this size.
- Chunking, embeddings, hybrid search, and reranking are not applicable because there is no vector index.

## 6. Tools and integrations

Every action the system can take, with its autonomy tier and the enforcement gate. No tool exceeds Tier 1, which is the core evidence for the lightweight weight class [knowledge/security-governance.md, autonomy tiers].

| Tool | Interface | Autonomy tier | Enforcement gate | Idempotency and retry |
|---|---|---|---|---|
| Extract ingredients (model call) | Native function, JSON schema output | Tier 0, read-only | Output is schema-validated; the model can only emit an ingredient list, never recipe content or an action | Pure function of input; safe to retry |
| Query recipe index | Internal service call | Tier 0, read-only | Runs as the signed-in user; read-only | Idempotent |
| Apply allergen and diet filter | Internal code, over profile and catalog tags | Tier 0, read-only decision (safety-critical) | Hard filter in the service layer, fail-closed; not expressible by the model | Idempotent |
| Write to shopping list | Internal service call to the user's own list | Tier 1, reversible write | Runs as the signed-in user; item-level undo; no external effect, no payment | Use a stable idempotency key per (user, recipe) to avoid duplicate adds on retry |

There are no send, publish, purchase, deletion, or access-control tools, so there is no Tier 2 or Tier 3 gate to build.

## 7. State and memory

Short form: no agent memory (Tree 7). The interaction is single-turn. Diet and allergy settings live in the existing per-user profile; the shopping list is an ordinary per-user table with undo. There is no conversation to compact, no cross-session agent memory store, and no multi-tenant memory isolation concern. If the product later adds "remember what I cooked," that becomes a per-user application feature, still not agent memory.

## 8. Security, identity, and guardrails

Short form on general security, full depth on domain safety, because the domain touches allergens.

**Domain-harm statement.** The worst realistic outcome is physical harm: a user with a food allergy is shown, or told to shop for, a recipe containing their allergen, leading to an allergic reaction. A secondary harm is trust and reputational: violating a declared diet (for example serving a meat recipe to a user set to vegetarian, or ignoring a religious restriction). These harms are independent of the company's size or traffic, so the guardrails are sized to the harm, not to 20,000 MAU [SKILL.md rule 8; knowledge/security-governance.md].

Guardrail stack, sized to that harm:

- Deterministic allergen and diet filtering as the security boundary. Filtering is a hard database filter on normalized allergen and diet tags, applied in code, and the language model makes zero allergen-safety decisions. The model only extracts what is in the fridge. This is shown architecturally by placing the extractor outside the deterministic safety boundary in Figure 1.
- Fail-closed. For a user with a declared allergy, any recipe whose allergen status is incomplete or unknown is excluded, never shown optimistically. This makes allergen-tag completeness a data-prep gate (section 5) rather than a runtime hope.
- No invented recipes, by construction. The model's only output is a schema-constrained JSON list of fridge ingredients; recipe content shown to the user is rendered from the catalog record by id, so the model never authors a recipe or an ingredient. This satisfies the "recipes must come from the vetted catalog" requirement and directly mitigates LLM09 Misinformation [knowledge/security-governance.md].
- Shopping-list safety. The Shopping List Builder applies the same allergen and diet filter, so it can never tell an allergic user to buy their allergen even if a fridge parse was wrong.
- Output disclaimer. Because brand and label variation and cross-contamination are outside the app's knowledge, every suggestion and shopping-list item carries a plain disclaimer to always read the product label and that this is not a medical guarantee. This is a labeled safety control, not medical or legal advice.
- Extraction-error containment. A fridge mis-parse mostly affects recipe relevance (suggesting something the user cannot quite make), not allergen exposure, because allergen safety derives from the recipe's own tags and the profile, not from the fridge parse.

<div class="callout risk">
<span class="callout-label">The one rule that must not be broken</span>
The language model is never on the allergen-safety decision path. If a future change routes filtering, ranking on allergens, or recipe text through the model, the fail-closed guarantee is void. Any such change must re-open this section and the section 9 safety gate.
</div>

General security, short form:

- Identity propagation (one line): every request runs as the signed-in user; profile and shopping-list access are enforced by the app's existing per-user authorization; there is no shared or multi-tenant retrieval store to isolate.
- Lethal-trifecta analysis (one line): the extractor holds at most one leg (untrusted user text). It has no access to other users' private data and no external communication channel, so it cannot be turned into an exfiltration path [knowledge/security-governance.md, lethal trifecta].
- Input guardrail: a length and prompt-injection scan on the free-text field is cheap insurance, but the stakes are low because the extractor is a single Tier-0 call with no tools and no private data in context.

## 9. Evaluation plan

The eval suite is part of the architecture, and its safety stratum is a hard gate. Most grading here is deterministic code, which is preferred over model judges wherever the end state is checkable [knowledge/evaluation.md, grader selection order].

Golden datasets:

- Extraction set: 50 to 150 real free-text fridge inputs from beta, each with a human-labeled canonical ingredient list. Stratify by messiness (typos, quantities, brand names, non-food noise), and include negative cases (empty input, gibberish, non-food text). Refresh each release; every reported miss becomes a case.
- Allergen-safety set: the critical stratum. Curated (recipe, allergy-profile) pairs with ground-truth safe or unsafe labels, including recipes with incomplete tags to exercise fail-closed behavior.

Component metrics:

- Extraction: ingredient precision, recall, and F1 against labels; normalization accuracy (does "scallion" resolve to green onion); hallucinated-ingredient rate (ingredients not present in the input), which must be effectively zero.
- Matching: makeability precision at k (are the top recipes actually makeable from the listed ingredients).
- Allergen filter: recall on unsafe recipes must be 1.0 (no allergen recipe ever reaches an allergy-restricted user); the false-exclusion rate is tracked because over-filtering hurts UX, but over-filtering is safe and under-filtering is not.

End-to-end metrics: task success (the user gets at least one makeable, safe recipe) and shopping-list correctness (missing items equal recipe minus fridge, with no allergen items). Model-as-judge is used only for soft extraction quality if code graders are insufficient, in pointwise mode with a cross-family judge and position and verbosity mitigations [knowledge/evaluation.md, LLM-as-judge].

Gate table:

| Promotion | Gate |
|---|---|
| To shadow | Extraction F1 at or above threshold on every stratum; hallucinated-ingredient rate near zero; allergen-safety recall at 100 percent |
| Shadow to canary | Shadow non-inferior to the manual-picker baseline on task success; no new failure classes in transcript review; latency and cost within budget |
| Canary to GA | Canary stable over the window; zero allergen escapes observed in canary; allergy-restricted users enabled only after catalog allergen-tag coverage meets its threshold |
| Post-GA | Every allergen incident or "could not make this" report becomes a golden case before any fix ships |

## 10. Observability

Short form. Trace each request as spans: input hash, extracted ingredient list, matched recipe ids, the allergen-filter verdict and reason, and latency per stage, following OpenTelemetry GenAI conventions [knowledge/interoperability-observability.md]. Metrics and alerts that matter at this size: extraction hallucination rate, p95 latency, model error and timeout rate, cost per day, and an allergen-tag-coverage regression alarm (a sudden change in exclusion rate usually means the offline tagging regressed). Sampled and flagged traces feed the golden set (section 9).

## 11. Scale and cost analysis

Back-of-envelope, shown rather than asserted. One model call per request; everything else is cheap deterministic compute.

Tokens per request (extraction only): system prompt and schema about 350 input tokens, user fridge text about 100 input tokens (about 450 input), JSON ingredient list about 120 output tokens.

Model pricing, live-sourced 2026-07-14:

- Claude Haiku 4.5: 1.00 dollar per million input tokens, 5.00 dollars per million output tokens [live-sourced 2026-07-14: https://platform.claude.com/docs/en/about-claude/pricing].
- GPT-5-mini: 0.25 dollar per million input tokens, 2.00 dollars per million output tokens [live-sourced 2026-07-14: https://developers.openai.com/api/docs/pricing].

Cost per request:

| Model | Input cost | Output cost | Per request | At 100k per month | At 10x (1M per month) |
|---|---|---|---|---|---|
| Claude Haiku 4.5 | 450 x 1.00/1M = 0.00045 | 120 x 5.00/1M = 0.00060 | about 0.00105 dollar | about 105 dollars | about 1,050 dollars |
| GPT-5-mini | 450 x 0.25/1M = 0.000113 | 120 x 2.00/1M = 0.00024 | about 0.00035 dollar | about 35 dollars | about 350 dollars |

Recommendation: start on a small model; either option is comfortably within a budget-conscious seed-stage envelope. GPT-5-mini is the cheaper lever if spend becomes a concern.

Latency budget summing to the p95 under 1.5 s SLO: input validation under 5 ms, model extraction p95 about 1,000 ms (the dominant term), normalizer under 30 ms, matcher under 50 ms over an in-memory index, allergen and diet filter under 10 ms, shopping-list diff under 10 ms, output assembly under 20 ms, for about 1.13 s at p95 with headroom. There is a single serial model hop, so there is no tail-latency multiplication across chained model calls [knowledge/latency-cost-reliability.md].

Prompt caching ROI: the system prompt is only about 350 tokens, so caching saves on the order of 30 dollars per month at base load on Haiku and is not worth the added complexity yet; revisit if the prompt grows or volume rises. Batch pricing does not apply because the path is interactive.

The 10x scenario: model cost scales linearly and stays modest (table above). What breaks first is not cost but request throughput on the Matcher; the mitigation is to keep the 12,000-recipe inverted index in memory (a few megabytes) so matching is CPU-bound and scales horizontally on stateless app servers, and to cache popular staple-set results. The offline Catalog Normalizer scales with catalog size, not traffic, so 10x traffic does not touch it.

## 12. Failure modes and degradation

Short form. Degradation ladder: full service, then reduced, then the deterministic fallback, never hard-down.

- Model provider outage or timeout: fall back to the manual ingredient picker (the Rung 0 path), so the user selects ingredients from a list and the deterministic matcher still works. The feature degrades to manual entry, it does not go down.
- Low-confidence extraction: show the parsed ingredients for the user to confirm or edit before matching.
- Allergen-tag gap for an allergy-restricted user: fail-closed exclusion (section 8), which reduces suggestions rather than risking exposure.
- Model call budget: a hard timeout (for example 3 s) on the extraction call, then the fallback picker. There are no loops to bound because there is no agent.
- Incident signal that pages a human: any confirmed allergen escape, or the allergen-filter exclusion rate changing sharply (a likely tagging regression).

## 13. Rollout plan

Short form, crawl-walk-run, gated by the section 9 evals.

- Crawl: internal and closed beta, text input only, shopping-list writes behind a flag. Promote only when extraction evals pass and the allergen-safety gate is at 100 percent.
- Walk: 5 percent canary with an allergen-escape monitor and the manual-picker fallback always available.
- Run: general availability. Enable allergy-restricted users only after catalog allergen-tag coverage meets its threshold. Capture thumbs, a "could not make this" signal, and any allergen report, route them to review, and feed them into the golden set so the suite ratchets forward.

## 14. References

Knowledge base documents cited (each carries its primary sources):

- knowledge/decision-trees.md (Trees 1, 2, 4, 6, 7 and the gate checklist; carries Anthropic Building Effective Agents, OpenAI Practical Guide, Selamy GenAI loop).
- knowledge/building-effective-agents.md (escalation ladder, workflow versus agent).
- knowledge/rag-patterns.md (RAG versus alternatives, retrieval theater, RAG versus fine-tuning; carries Gao et al. RAG Survey).
- knowledge/security-governance.md (autonomy tiers, tool-layer enforcement, lethal trifecta, LLM09; carries OWASP LLM Top 10 2025, OWASP Agentic Top 10 2026, Willison, NIST AI 600-1).
- knowledge/evaluation.md (golden datasets, grader selection, model-as-judge, rollout gates; carries Anthropic Demystifying Evals, RAGAS, tau-bench).
- knowledge/interoperability-observability.md (OpenTelemetry GenAI tracing).
- knowledge/latency-cost-reliability.md (latency budget, tail latency, caching ROI).

Live-sourced citations (retrieved 2026-07-14):

- Anthropic Claude pricing (Haiku 4.5 at 1.00 and 5.00 dollars per million input and output tokens): https://platform.claude.com/docs/en/about-claude/pricing
- OpenAI API pricing (GPT-5-mini at 0.25 and 2.00 dollars per million input and output tokens): https://developers.openai.com/api/docs/pricing
