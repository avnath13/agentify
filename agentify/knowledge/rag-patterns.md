# RAG patterns: paradigms, retrieval design, and when not to use it

This document grounds retrieval design decisions in generated architectures. It covers the three RAG paradigms and what each adds, the concrete retrieval design choices (chunking, embeddings, hybrid search, reranking, query optimization), the indexing pipeline including the enterprise-critical concern of permission-aware retrieval, agentic RAG and its escalation criteria, the RAG versus fine-tuning versus long-context decision, and the evaluation hooks a design must expose. Every RAG component in a generated design must be justified against a failure mode listed here, not added by default.

## Principles

### The three paradigms: each adds machinery to fix a named failure

Naive RAG is the baseline Retrieve-Read pipeline [Gao et al., RAG Survey]:

- Index: segment documents into chunks, encode with an embedding model, store vectors in a database.
- Retrieve: embed the query, fetch top-k chunks by similarity.
- Generate: stuff retrieved chunks plus the query into the prompt.
- Documented failures: retrieval precision (irrelevant chunks in, relevant chunks missed), hallucination when context is insufficient, and redundancy when similar chunks repeat [Gao et al., RAG Survey].

Advanced RAG keeps the linear pipeline but adds optimization stages [Gao et al., RAG Survey]:

- Pre-retrieval: finer-grained indexing, metadata attachment, and query optimization (rewriting, expansion, routing).
- Post-retrieval: reranking retrieved chunks and compressing context to cut noise before generation.
- Choose it when naive retrieval quality is the measured bottleneck; it fixes precision without changing the architecture.

Modular RAG breaks the pipeline into substitutable modules and reconfigurable flows [Gao et al., RAG Survey]:

- New modules: search over diverse sources (SQL, web, vector), memory, routing, predict, task adapters.
- New patterns: Rewrite-Retrieve-Read, Generate-Read, iterative retrieval, recursive retrieval, adaptive retrieval where the system decides whether and how to retrieve per query.
- Choose it when one retrieval strategy cannot serve all query types, for example a mix of SQL-answerable, document-answerable, and no-retrieval-needed queries.

### Chunking: the highest-leverage cheap decision

- Fixed-size chunking commonly uses 100, 256, or 512 tokens per chunk. Larger chunks preserve context but admit noise; smaller chunks reduce noise but can break semantic completeness [Gao et al., RAG Survey].
- Practical default for enterprise documents: start at 256 to 512 tokens with 10 to 20 percent overlap, then tune against retrieval evals rather than intuition.
- Sliding window and recursive splits enable layered retrieval across iterations [Gao et al., RAG Survey].
- Small-to-big: retrieve on small units (sentences) for precision, then expand to the surrounding window before generation so the LLM sees complete context [Gao et al., RAG Survey]. This decouples retrieval granularity from generation granularity and is usually the right answer when both precision and completeness matter.
- Respect structural boundaries: never split tables, code blocks, or contract clauses mid-unit; parse structure before chunking.
- Attach metadata at chunk time (source, author, date, tenant, access-control list, section heading). Metadata is what makes filtering, freshness ranking, and permission-aware retrieval possible later; it cannot be retrofitted cheaply.

### Embedding model selection

- Select on retrieval benchmarks for the target domain and language, not general popularity.
- Sparse retrieval complements dense: sparse models improve zero-shot behavior on rare entities and exact terminology where dense embeddings blur distinctions [Gao et al., RAG Survey].
- For specialized domains (legal, pharma, internal jargon), plan an embedding fine-tuning or adapter step, or lean harder on hybrid search and reranking to compensate.
- Record the embedding model and dimension in the design. It determines index size, re-embedding cost on model upgrades, and whether the corpus must be re-indexed when the model changes. Version the index by embedding model so a migration can run side by side.

### Hybrid search and reranking

- Hybrid search combines dense vector retrieval with sparse lexical retrieval (BM25), fusing complementary relevance signals; sparse handles exact identifiers, acronyms, and rare entities that dense retrieval misses [Gao et al., RAG Survey].
- For enterprise corpora full of product codes, ticket numbers, and internal names, hybrid is the default, not an optimization.
- Reranking reorders a deliberately over-fetched candidate set: retrieve top 20 to 50, rerank, keep top 3 to 10 for generation. Rerankers see query and chunk together (cross-encoders such as BERT-family models, Cohere, and BGE rerankers, or an LLM as reranker), recovering precision that bi-encoder retrieval loses [Gao et al., RAG Survey].
- Context compression cuts noise further when budgets are tight: LLMLingua-style small-model token pruning, RECOMP-style trained condensers, or a filter-then-rerank split where a small model filters and a large model reorders hard cases [Gao et al., RAG Survey].

### Query optimization

The user's literal query is often the wrong retrieval key. Named techniques, in escalating cost order [Gao et al., RAG Survey]:

- Query rewriting: a model rewrites the query for retrieval (the Rewrite-Retrieve-Read pattern).
- Query expansion: generate multiple parallel queries, or decompose into sub-queries via least-to-most prompting for multi-part questions.
- Step-back prompting: abstract the query to a higher-level concept question and retrieve on both.
- HyDE: generate a hypothetical answer document and retrieve by answer-to-answer similarity instead of query-to-document similarity. Effective when queries and documents use very different vocabularies; counterproductive when the model hallucinates a wrong hypothesis in unfamiliar domains.
- Query routing: metadata-based or semantic routing to different indexes or retrieval strategies per query type.

Designs should name which of these they use and why. Each adds one model call of latency to the retrieval path, so the latency budget must absorb it [knowledge/latency-cost-reliability.md].

### Named retrieval techniques worth reaching for

Beyond the Advanced RAG staples above, four named techniques target specific failure modes. Reach for one only when the failure it fixes is the measured bottleneck.

- Contextual Retrieval: prepend a short chunk-specific context blurb (50 to 100 tokens, generated per chunk) before embedding, and index the same contextualized text under BM25. This is a direct upgrade to the doc's chunking plus hybrid-search guidance, fixing the context loss that isolated chunks suffer. Contextual embeddings plus contextual BM25 cut the top-20 retrieval failure rate by 49 percent (5.7 to 2.9 percent), and by 67 percent (5.7 to 1.9 percent) with reranking added [Anthropic, Contextual Retrieval]. When to apply: recall on a large corpus is the bottleneck and chunks read as ambiguous out of context.
- GraphRAG: extract entities and relationships into a knowledge graph, cluster it into communities (Leiden), and precompute community summaries, then answer with global search over those summaries for corpus-wide questions and local search for entity-specific ones [Microsoft, GraphRAG]. It answers global sensemaking and multi-hop questions that flat top-k chunk retrieval cannot, since the answer is spread across fragments no single chunk holds [Microsoft, GraphRAG Blog]. This is the authoritative anchor for the graph-based agentic RAG variants named above. When to apply: questions are global (themes across the whole corpus) or multi-hop across entities, and flat retrieval answers them poorly. It carries graph-construction and summarization cost, so do not reach for it on straightforward lookup corpora.
- Late chunking: run the long-context embedding model (for example an 8192-token model) over the full document first, then mean-pool the token embeddings within each chunk boundary, so every chunk vector is conditioned on surrounding document context. It is training-free and reuses existing models, differing from naive chunking only in ordering: embed then split, not split then embed [Jina, Late Chunking]. Gains grow with document length [Günther et al., Late Chunking]. When to apply: chunk-level context loss hurts (pronouns, references, and terms that only resolve document-wide) but you do not want the per-chunk generation cost of Contextual Retrieval.
- Late interaction (ColBERT): encode query and document into per-token multi-vector representations and score by summing each query token's best match against document tokens (MaxSim), preserving fine-grained term matching that single-vector dense retrieval averages away [Khattab and Zaharia, ColBERT]. Document vectors precompute offline, but the index stores one vector per token, so storage and retrieval cost rise sharply versus one vector per chunk. When to apply: you need higher recall than single-vector dense gives and can afford the multi-vector index.

### Indexing pipeline: ingestion, freshness, and permission-aware retrieval

A production RAG design must show the write path, not just the read path:

- Ingestion: parse (including tables, images, and layout for PDFs), chunk, enrich with metadata, embed, upsert. Parsing quality bounds everything downstream; budget for it explicitly.
- Freshness: batch re-index is rarely acceptable for operational data. Design incremental updates driven by source-system change events (webhooks, change data capture) with document-level upserts. Record the acceptable staleness window as an NFR; it decides between event-driven and scheduled ingestion.
- Deletion: when a source document is deleted or an employee loses access, stale chunks answering from it are a compliance incident, not a quality bug. Deletes must propagate to the index with a bounded lag.
- Permission-aware retrieval: enterprise corpora are permissioned per user, group, and tenant. The caller's identity must propagate to the retriever, and results must be filtered by entitlements at query time (metadata ACL filters or per-tenant indexes), never by post-hoc prompt instructions. An LLM told to ignore documents the user cannot see will eventually fail; the retriever must never return them. This is the single most commonly missed requirement in enterprise RAG designs [knowledge/security-governance.md].
- ACL freshness is its own pipeline: permission changes in the source system must reach the index metadata on a bounded lag, or revoked users keep reading through the cache of old entitlements.

### Agentic RAG: when retrieval itself needs an agent

Agentic RAG embeds autonomous agents in the retrieval pipeline, applying the four agentic design patterns (reflection, planning, tool use, multi-agent collaboration) to retrieval itself [Singh et al., Agentic RAG Survey]. The architecture ladder, in escalating complexity [Singh et al., Agentic RAG Survey]:

- Single-agent router: one agent picks among retrieval sources (vector store, SQL, web API) per query. The cheapest agentic step; often all that is needed.
- Corrective RAG: dedicated steps for context retrieval, relevance evaluation, query refinement, external fallback retrieval (such as web search), and response synthesis; the system iterates when retrieved documents score below a relevance threshold.
- Adaptive RAG: a classifier routes by query complexity: bypass retrieval for trivial queries, single-step retrieval for simple ones, multi-step iterative retrieval for complex ones.
- Multi-agent and hierarchical RAG: specialized retrieval agents per source with a coordinator, or tiers where upper agents prioritize sources and delegate. Adds coordination complexity and data-integration overhead.
- Graph-based (Agent-G, GeAR): combine graph knowledge bases with document retrieval for multi-hop entity relationship questions, with critic modules validating results.

Traditional RAG suffices for isolated, straightforward retrieval tasks; agentic RAG is warranted for multi-hop reasoning, heterogeneous sources needing dynamic strategy selection, or iterative self-correction requirements [Singh et al., Agentic RAG Survey]. Apply the same escalation discipline as the agent ladder in [knowledge/decision-trees.md]: each agentic layer adds reasoning latency, computational overhead under high query volume, and less predictable outcomes that are harder to evaluate [Singh et al., Agentic RAG Survey].

### When RAG is not the answer

RAG versus alternatives is a decision about knowledge dynamics, not fashion [Gao et al., RAG Survey]:

- Prompt engineering or long context: knowledge is stable, bounded, and fits in context. Modern models handle 200k+ tokens, but RAG still wins on inference cost and latency by loading only what is needed [Gao et al., RAG Survey]. Long context plus prompt caching beats RAG for a small stable corpus queried repeatedly.
- RAG: knowledge is large, changes frequently, is per-tenant or permissioned, or requires citation of sources. RAG offers real-time knowledge updates and interpretability, since retrieved evidence can be shown [Gao et al., RAG Survey].
- Fine-tuning: the need is behavioral (tone, format, domain dialect, structured output habits), not factual. RAG consistently outperforms unsupervised fine-tuning for injecting knowledge, including entirely new information [Gao et al., RAG Survey]. Fine-tuning does not solve freshness and complicates governance: knowledge baked into weights cannot be deleted per-document, which matters for right-to-erasure obligations.
- Combine when both needs exist: fine-tune for behavior, RAG for facts [Gao et al., RAG Survey].
- Robustness caveat regardless of choice: RAG systems degrade on noisy or adversarial retrieved context; retrieval quality, grounding fidelity, and noise robustness are coupled failure surfaces to test, not assume [Sharma, RAG Comprehensive Survey].

### Default starting parameters

Starting points for a first design iteration, to be tuned against evals, never shipped untested:

| Parameter | Default | Rationale |
|---|---|---|
| Chunk size | 256 to 512 tokens | within the common 100 to 512 range surveyed [Gao et al., RAG Survey] |
| Chunk overlap | 10 to 20 percent | preserves boundary context in fixed-size splits |
| Retrieval unit | sentence, expanded small-to-big | precision at retrieval, completeness at generation [Gao et al., RAG Survey] |
| Candidate fetch | top 20 to 50 | enough recall headroom for the reranker |
| Post-rerank k | 3 to 10 | keeps generation context high-signal |
| Retrieval mode | hybrid dense plus BM25 | complementary signals; exact-match coverage [Gao et al., RAG Survey] |
| Reranker | cross-encoder (BGE or Cohere class) | query-chunk joint scoring [Gao et al., RAG Survey] |
| Metadata | source, date, tenant, ACL, section | enables filtering and permission-aware retrieval |

### Evaluation hooks

A RAG design must expose measurement points, because retrieval and generation fail independently [Gao et al., RAG Survey]:

- Retrieval metrics: context relevance (precision and specificity of retrieved chunks), hit rate, MRR, NDCG.
- Generation metrics: answer faithfulness (consistency with retrieved context, no contradiction) and answer relevance (directly addresses the question).
- Robustness abilities: noise robustness (question-related but uninformative documents), negative rejection (refuse when evidence is absent), information integration (multi-document synthesis), counterfactual robustness (flag known inaccuracies in sources) [Gao et al., RAG Survey].
- Tooling: RAGAS, ARES, and TruLens automate the quality-score triad with LLM judges; benchmarks RGB and RECALL target the robustness abilities [Gao et al., RAG Survey].
- Instrumentation: log retrieved chunk IDs and scores with every generation so failures can be attributed to retrieval or generation from traces [knowledge/interoperability-observability.md]. Tie thresholds to rollout gates [knowledge/evaluation.md].

## When to apply

- If the system needs no knowledge beyond training data, then no RAG. Walk Tree 4 in [knowledge/decision-trees.md] first.
- If the corpus is small, stable, and repeatedly queried, then long context plus prompt caching over RAG.
- If knowledge is large, fresh, per-tenant, or permissioned, then RAG, and permission-aware retrieval is mandatory, not optional.
- If the need is style or format, then fine-tuning for behavior, optionally combined with RAG for facts.
- If naive RAG evals show precision failures, then Advanced RAG additions in this order: hybrid search, reranking, query rewriting, before touching chunk strategy exotica.
- If queries mix types needing different strategies, then Modular RAG with routing.
- If queries require multi-hop reasoning, heterogeneous sources, or self-correcting retrieval, then agentic RAG, starting at single-agent router and escalating only on measured failure.
- If the corpus contains exact identifiers (SKUs, ticket IDs, names), then hybrid dense plus BM25 is the default.
- If both precision and answer completeness matter, then small-to-big retrieval.
- If answers must cite evidence for audit or trust, then RAG over fine-tuning, with chunk IDs carried through to the response.
- If sources change intra-day, then event-driven incremental indexing with delete and ACL propagation; state the staleness NFR with a number.

## Common failure modes

- Permission leakage: retriever returns documents the caller cannot see, and the design relies on prompt instructions to suppress them. Filter at the retriever with propagated identity.
- Stale index: no delete or update propagation; the system confidently answers from removed or superseded documents.
- Stale ACLs: permissions revoked in the source system but not in index metadata, so access lingers.
- Chunking by page or fixed size splitting tables and clause boundaries, destroying the semantics the retriever needs.
- Retrieval theater: RAG added to a system whose knowledge fits in a cached prompt, adding latency, cost, and a new failure surface for nothing.
- Top-k stuffing: raising k to fix recall, which buries the answer in noise; models degrade on irrelevant context [Sharma, RAG Comprehensive Survey]. Fix precision with reranking instead.
- No negative rejection: the system never says "not in the corpus," so hallucinations inherit RAG's credibility.
- Agentic RAG by default: multi-agent retrieval for queries a single router handles, paying coordination overhead and latency for no measured gain [Singh et al., Agentic RAG Survey].
- Evaluating only end-to-end answer quality, so retrieval and generation failures cannot be separated or fixed independently.
- HyDE in unfamiliar domains: the hypothetical document hallucinates, and retrieval anchors on the hallucination.
- Embedding model upgraded without re-indexing, silently degrading similarity scores across the corpus.

## Citations

- Gao et al., RAG Survey: Retrieval-Augmented Generation for Large Language Models: A Survey. https://arxiv.org/abs/2312.10997
- Singh et al., Agentic RAG Survey: Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG. https://arxiv.org/abs/2501.09136
- Sharma, RAG Comprehensive Survey: Retrieval-Augmented Generation: A Comprehensive Survey of Architectures, Enhancements, and Robustness Frontiers. https://arxiv.org/abs/2506.00054
- Anthropic, Contextual Retrieval: Introducing Contextual Retrieval. https://www.anthropic.com/engineering/contextual-retrieval
- Microsoft, GraphRAG: GraphRAG documentation. https://microsoft.github.io/graphrag/
- Microsoft, GraphRAG Blog: GraphRAG: Unlocking LLM discovery on narrative private data. https://www.microsoft.com/en-us/research/blog/graphrag-unlocking-llm-discovery-on-narrative-private-data/
- Jina, Late Chunking: Late Chunking in Long-Context Embedding Models. https://jina.ai/news/late-chunking-in-long-context-embedding-models/
- Günther et al., Late Chunking: Late Chunking: Contextual Chunk Embeddings Using Long-Context Embedding Models. https://arxiv.org/abs/2409.04701
- Khattab and Zaharia, ColBERT: ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT. https://arxiv.org/abs/2004.12832
- Cross-references: knowledge/decision-trees.md, knowledge/security-governance.md, knowledge/interoperability-observability.md, knowledge/evaluation.md, knowledge/latency-cost-reliability.md
