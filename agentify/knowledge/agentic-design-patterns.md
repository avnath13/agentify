# Agentic design patterns

Purpose: this document grounds pattern selection at the level of the individual agentic loop. It covers Andrew Ng's four agentic design patterns (Reflection, Tool Use, Planning, Multi-Agent Collaboration), the benchmark evidence that agentic iteration can matter more than model generation, the maturity ranking across the four, how the patterns compose, and what each costs in tokens and latency. Use it together with building-effective-agents.md: that document decides how much autonomy to grant; this one decides which quality-improving loops to wrap around the model.

## Principles

### The core evidence: iteration beats model upgrades on some tasks

Ng's motivating result, on the HumanEval coding benchmark [Ng, Agentic Workflows]:

- GPT-3.5 zero-shot: 48.1 percent correct
- GPT-4 zero-shot: 67.0 percent correct
- GPT-3.5 wrapped in an iterative agent workflow: up to 95.1 percent correct

His reading: "the improvement from GPT-3.5 to GPT-4 is dwarfed by incorporating an iterative agent workflow," and agentic workflows may drive more progress than the next generation of foundation models [Ng, Agentic Workflows]. Design implication for architects: before recommending a bigger model to close an accuracy gap, cost out an agentic loop on the current model; before recommending an agentic loop, remember the numbers above bought accuracy with multiple inference passes, so budget tokens and latency accordingly.

### Pattern 1: Reflection

The LLM examines its own work and improves it [Ng, Agentic Workflows]. Mechanics: generate an output, then prompt the same model to "check the code carefully for correctness, style, and efficiency" and give constructive criticism, then feed the criticism back for a revision; repeat as needed [Ng, Reflection]. Two strengthening moves:

- **Grounded reflection**: give the critic tools, such as running the code against unit tests or web-searching claims, so criticism is anchored in evidence rather than self-assessment [Ng, Reflection]. This is the highest-leverage variant; ungrounded self-critique can converge on confident restatements.
- **Generator-critic split**: implement as two agents, one prompted to generate and one prompted to criticize, whose dialogue drives improvement [Ng, Reflection].

Evidence base: Self-Refine (Madaan et al., 2023) on iterative self-feedback, Reflexion (Shinn et al., 2023) on verbal reinforcement, CRITIC (Gou et al., 2024) on tool-interactive critiquing [Ng, Reflection]. Anthropic's evaluator-optimizer workflow is the same pattern with the developer owning the loop, and carries the applicability condition: use it when clear evaluation criteria exist and iteration measurably helps [Anthropic, Building Effective Agents].

Cost profile: multiplies inference count by the number of critique-revise rounds, typically 2x to 4x tokens and wall-clock latency for one to two rounds. Cheap to pilot, easy to cap (fixed round limit), and the critic can be a smaller model than the generator.

### Pattern 2: Tool use

The LLM is given functions (web search, code execution, calendar, email, image generation) and is fine-tuned or prompted (perhaps few-shot) to emit a structured call string, for example `{tool: web-search, query: "coffee maker reviews"}`, which a post-processing layer detects, executes, and returns as added context [Ng, Tool Use]. Two design notes with architectural weight:

- **Computation belongs in tools**: arithmetic, date math, and data lookup via a code interpreter or API beat generation from weights on both accuracy and auditability [Ng, Tool Use].
- **Tool selection at scale**: with hundreds of tools you cannot put every description in context; use heuristics to select a relevant subset per request, analogous to RAG over documents [Ng, Tool Use]. This is the same problem OpenAI frames as tool overload, where overlapping tools degrade selection well before raw count does [OpenAI, Practical Guide to Building Agents].

Evidence base: Gorilla (Patil et al., 2023) on massive API connection, MM-REACT (Yang et al., 2023) on multimodal action, Chain-of-Abstraction (Gao et al., 2024) on efficient tool reasoning [Ng, Tool Use].

Cost profile: each tool round trip adds one inference plus external call latency; token cost grows with tool schemas and returned payloads in context. Mitigations: subset tool selection, response truncation and filtering, and caching of stable tool results.

### Pattern 3: Planning

The LLM autonomously decides the sequence of steps to accomplish a larger task, outputting structured instructions for which tools or models to invoke in what order; Ng's example is HuggingGPT decomposing an image request into pose detection then pose-to-image rendering [Ng, Planning]. The applicability boundary is decisive: many workflows have decompositions you can fix in advance (where reflection-style deterministic sequences suffice), and planning is only necessary when the decomposition cannot be predetermined [Ng, Planning].

Ng's explicit maturity caveat: Reflection and Tool Use work reliably, but "Planning is a less mature technology, and I find it hard to predict in advance what it will do" [Ng, Planning]. For enterprise designs, this argues for planning with structure: plans as reviewable artifacts, plan validation gates, bounded replanning, or Anthropic's orchestrator-workers shape where a central model plans but code owns dispatch and synthesis [Anthropic, Building Effective Agents].

Evidence base: Chain-of-Thought (Wei et al., 2022), HuggingGPT (Shen et al., 2023), planning survey (Huang et al., 2024) [Ng, Planning].

Cost profile: a planning call up front plus N execution calls plus optional replanning; variance is the real cost, since step count is unbounded unless capped. Always pair with max-step limits and per-run budget alarms.

### Pattern 4: Multi-agent collaboration

Multiple agents (often the same LLM prompted into different roles: software engineer, product manager, designer, QA) split tasks, discuss, and debate to outperform a single agent [Ng, Agentic Workflows]. ChatDev runs a virtual software company this way [Ng, Multi-Agent]. Ng gives three reasons it helps [Ng, Multi-Agent]:

1. It works empirically; teams report good results and ablations show multiple agents beating one.
2. Focus: even with long context windows, prompting the model to do one thing at a time gives better performance.
3. Abstraction: it gives developers a decomposition framework analogous to a manager assigning specialists.

Frameworks cited: AutoGen, Crew AI, LangGraph; papers: ChatDev (Qian et al., 2023), AutoGen (Wu et al., 2023), MetaGPT (Hong et al., 2023) [Ng, Multi-Agent]. Caveat mirrors planning: output quality is "hard to predict, especially when allowing agents to interact freely" [Ng, Multi-Agent]. Topology selection (central manager vs peer handoffs) is covered in building-effective-agents.md; the enterprise default is constrained interaction graphs, not free-form debate [OpenAI, Practical Guide to Building Agents].

Cost profile: the most expensive pattern. Every inter-agent message is an inference, and shared context is re-serialized into each agent's window, so token cost grows superlinearly with agent count and conversation length. Reserve for tasks where decomposition-by-role demonstrably beats a single well-tooled agent.

### Maturity ranking and default ordering

From Ng's own caveats: Reflection and Tool Use are reliable technologies to adopt now; Planning and Multi-Agent Collaboration are promising but produce less predictable results [Ng, Planning; Ng, Multi-Agent]. Default adoption order for an enterprise design: Tool Use (usually mandatory for grounding and action), then Reflection where quality bars justify the token multiple, then Planning only for genuinely non-predeterminable decompositions, then Multi-Agent only on evidence a single agent fails.

Summary table for pattern selection:

| Pattern | Mechanism | Maturity [Ng] | Typical cost multiple | Needs an oracle? | Nearest workflow analog [Anthropic] |
|---|---|---|---|---|---|
| Reflection | Generate, critique, revise loop | Reliable | 2x to 4x per capped round set | Strongly benefits (tests, retrieval) | Evaluator-optimizer |
| Tool use | Model emits structured calls, runtime executes | Reliable | +1 inference per round trip plus schema tokens | No | Augmented LLM (the base block) |
| Planning | Model decides step sequence at runtime | Less mature, hard to predict | Plan + N steps, high variance | Helps for plan validation | Orchestrator-workers |
| Multi-agent | Role-split agents converse and divide work | Less mature, hard to predict when free-form | Superlinear in agents and turns | Helps for synthesis quality | Orchestrator-workers / manager pattern |

### Vocabulary mapping across the three canons

Ng's patterns, Anthropic's workflow taxonomy, and OpenAI's orchestration guidance describe overlapping territory with different names; a design document should not treat them as competing options:

- Ng's Tool Use is Anthropic's augmented LLM and the tool layer of OpenAI's model-tools-instructions triad [Ng, Tool Use; Anthropic, Building Effective Agents; OpenAI, Practical Guide to Building Agents].
- Ng's Reflection with a generator-critic split is Anthropic's evaluator-optimizer workflow [Ng, Reflection; Anthropic, Building Effective Agents].
- Ng's Planning, when a central model plans and code dispatches, is Anthropic's orchestrator-workers; when the model also owns execution it is a full agent [Ng, Planning; Anthropic, Building Effective Agents].
- Ng's Multi-Agent Collaboration maps to OpenAI's manager pattern (agents as tools) or decentralized handoffs depending on whether one agent retains control [Ng, Multi-Agent; OpenAI, Practical Guide to Building Agents].

### Composition

The patterns compose, and production systems typically stack them [Ng, Agentic Workflows]:

- **Tool Use inside Reflection**: the critic runs tests or searches to ground its critique (CRITIC's contribution) [Ng, Reflection].
- **Planning over Tool Use**: the plan's steps are tool invocations; HuggingGPT plans across model-as-tool calls [Ng, Planning].
- **Reflection inside Multi-Agent**: the generator-critic pair is the minimal multi-agent system; ChatDev-style role teams add a QA role that is reflection institutionalized [Ng, Reflection; Ng, Multi-Agent].
- **Multi-Agent as managed Planning**: a manager agent that plans and delegates to specialist agents-as-tools merges both patterns under central control, the manager pattern [OpenAI, Practical Guide to Building Agents].

Composition rule of thumb: each added pattern multiplies inference count, so compose top-down from the quality requirement (what error rate is acceptable) rather than bottom-up from capability enthusiasm. A design that stacks all four should be able to point at an evaluation showing each layer's marginal accuracy gain.

### Budgeting and deployment posture per pattern

Ng observes that agentic workflows change the interaction model itself: instead of instant single-response output, tasks are delegated and results collected after minutes, so users must learn to wait, and fast token generation matters because whole loops of intermediate tokens run before anyone sees a result [Ng, Agentic Workflows]. Concrete design consequences:

- **Interactive surfaces**: cap Reflection at one round or run it only on requests flagged high-stakes; show intermediate progress if a Planning loop runs, since transparency of steps is also a debugging requirement [Anthropic, Building Effective Agents].
- **Batch and background surfaces**: the natural home for multi-round Reflection, Planning, and Multi-Agent runs, where the latency multiple is invisible and only the token bill remains.
- **Budget controls that must exist in the design**: per-run maximum steps or turns, per-run token ceiling with alarm, and a defined behavior on budget exhaustion (return best-so-far with a flag, or escalate to a human) [OpenAI, Practical Guide to Building Agents].
- **Model mix**: critics, routers, and plan validators can run on smaller models than generators; establish the baseline with the most capable model, then downgrade components that evals show still pass [OpenAI, Practical Guide to Building Agents].
- **Error compounding**: loops multiply per-step failure probability across steps, which is why every added round must show marginal gain on the eval set rather than being presumed beneficial [Anthropic, Building Effective Agents].

## When to apply

- If output quality is below target and errors are ones the model itself can spot when asked (style, correctness against stated criteria, missing coverage), then add Reflection with one to two capped rounds [Ng, Reflection].
- If a checkable oracle exists (unit tests, schema validators, retrieval for fact-checks), then use grounded reflection with tools rather than pure self-critique [Ng, Reflection].
- If the task needs current information, precise computation, or side effects, then Tool Use is required, not optional [Ng, Tool Use].
- If the tool catalog is large or overlapping, then add per-request tool subset selection, RAG-style [Ng, Tool Use].
- If the step sequence is predictable, then hardcode it as a workflow and do not use Planning [Ng, Planning; Anthropic, Building Effective Agents].
- If decomposition genuinely varies per input, then use Planning with plan visibility, step caps, and budget alarms [Ng, Planning].
- If a single agent with distinct tools fails on focus or instruction-following despite good prompts, then split roles into multiple agents with a constrained topology [Ng, Multi-Agent; OpenAI, Practical Guide to Building Agents].
- If the accuracy gap is large and the model is small, then benchmark an agentic loop on the current model against a model upgrade before deciding; the HumanEval deltas show the loop can win [Ng, Agentic Workflows].
- If latency is user-facing and interactive, then be conservative: every pattern here multiplies inference passes, and Reflection or Planning may need to run asynchronously or be reserved for high-stakes requests.

## Common failure modes

- **Ungrounded reflection theater.** Self-critique without tests or retrieval lets the model approve its own mistakes; the fix documented in CRITIC is tool-grounded critique [Ng, Reflection].
- **Unbounded loops.** Reflection or planning without round caps and budget limits produces cost blowups and latency tails; the loop must have an exit condition owned by code.
- **Planning where a workflow suffices.** Using dynamic planning for a decomposition that is actually fixed adds unpredictability for zero benefit; Ng notes many tasks do not need it and flags planning's immaturity directly [Ng, Planning].
- **Tool prompt bloat.** Injecting every tool schema into every call inflates tokens and degrades selection; subset selection heuristics are the documented remedy [Ng, Tool Use].
- **Free-form agent debate in production.** Unconstrained multi-agent interaction is the configuration Ng singles out as hard to predict; enterprise designs need fixed topologies, turn limits, and a synthesis owner [Ng, Multi-Agent].
- **Role proliferation.** Adding agents for organizational metaphor value (a "CEO agent") rather than measured focus gains; each role multiplies cost and adds a coordination failure surface [Ng, Multi-Agent; OpenAI, Practical Guide to Building Agents].
- **Benchmark overgeneralization.** The 95.1 percent HumanEval result is a coding benchmark with a perfect oracle (tests pass or fail); domains without cheap verifiable feedback should expect smaller agentic gains, and designs should state which oracle the loop closes against [Ng, Agentic Workflows].
- **Stacking all four patterns by default.** Without per-layer eval evidence, composition multiplies cost while masking which layer actually helps; require marginal-gain measurement per pattern [Anthropic, Building Effective Agents].

## Citations

- [Ng, Agentic Workflows]: Andrew Ng, "Four AI Agent Strategies That Improve GPT-4 and GPT-3.5 Performance", The Batch. https://www.deeplearning.ai/the-batch/how-agents-can-improve-llm-performance/
- [Ng, Reflection]: Andrew Ng, "Agentic Design Patterns Part 2: Reflection", The Batch. https://www.deeplearning.ai/the-batch/agentic-design-patterns-part-2-reflection/
- [Ng, Tool Use]: Andrew Ng, "Agentic Design Patterns Part 3: Tool Use", The Batch. https://www.deeplearning.ai/the-batch/agentic-design-patterns-part-3-tool-use/
- [Ng, Planning]: Andrew Ng, "Agentic Design Patterns Part 4: Planning", The Batch. https://www.deeplearning.ai/the-batch/agentic-design-patterns-part-4-planning/
- [Ng, Multi-Agent]: Andrew Ng, "Agentic Design Patterns Part 5: Multi-Agent Collaboration", The Batch. https://www.deeplearning.ai/the-batch/agentic-design-patterns-part-5-multi-agent-collaboration/
- [Anthropic, Building Effective Agents]: https://www.anthropic.com/research/building-effective-agents
- [OpenAI, Practical Guide to Building Agents]: https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
