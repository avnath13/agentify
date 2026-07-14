# Multi-agent orchestration: topologies, coordination, and economics

This document governs the decision to use more than one agent and, when that decision survives scrutiny, the design of the resulting system. It states the single-agent-first principle and the burden of proof for escalation, catalogs topologies and communication mechanisms with their tradeoffs, names the coordination failure modes that dominate multi-agent incidents, and quantifies the token economics that make multi-agent an order-of-magnitude cost decision. Multi-agent is rung 4 of the escalation ladder in [knowledge/decision-trees.md]; nothing here applies until rungs 0 through 3 have been justified.

## Principles

### Single agent first: the burden of proof

Both major practitioner guides converge on the same rule: maximize a single agent's capabilities before adding more agents, and add complexity only when it demonstrably improves outcomes on evaluations [OpenAI, Practical Guide; Anthropic, Building Effective Agents]. The OpenAI guide names two legitimate splitting triggers [OpenAI, Practical Guide]:

- Complex logic: prompts with many conditional branches that make templates unmaintainable. Consider a routing workflow before full multi-agent.
- Tool overload: the problem is not raw tool count but similarity and overlap. Teams run more than 15 well-differentiated tools in one agent successfully, while others struggle with fewer than 10 overlapping ones. Fix tool descriptions and remove overlap before splitting; splitting an agent to escape bad tool design just distributes the bad design.

The burden of proof from production experience: the working set exceeds one context window, subtasks are genuinely parallelizable and read-heavy, or privilege boundaries require isolation [Anthropic, multi-agent research system]. A design that cannot name which of these applies stays at rung 3.

### Topologies

Manager (orchestrator-workers):

- A central LLM decomposes the task at runtime and delegates to workers via tool calls; workers do not talk to each other; the manager synthesizes results and owns the user interaction [OpenAI, Practical Guide; Anthropic, Building Effective Agents].
- Distinct from parallelization workflows because subtasks are not predefined; the orchestrator determines them from the specific input [Anthropic, Building Effective Agents].
- The default multi-agent topology: single point of control, simplest to trace and debug. Costs: the hub is a single point of failure and a synthesis bottleneck [Tran et al., Multi-Agent Collaboration Mechanisms].

Decentralized handoff:

- Peer agents transfer execution to one another based on specialization; the receiving agent takes over the conversation and state entirely [OpenAI, Practical Guide].
- Suits triage flows: an intake agent assesses and routes to sales, support, or orders, then gets out of the way, so one specialist owns the interaction end to end [OpenAI, Practical Guide].
- Decentralized structures scale and avoid hub failure but pay higher communication overhead and lose the single audit point [Tran et al., Multi-Agent Collaboration Mechanisms].

Hierarchical:

- Agents in layers with distinct roles and authority; strategic decisions at the top, specialized execution below, interaction mostly between adjacent layers [Tran et al., Multi-Agent Collaboration Mechanisms].
- Buys low bottleneck and resource offloading at the price of latency and cascading failures when a lower layer dies [Tran et al., Multi-Agent Collaboration Mechanisms]. Justified only at a scale where one manager saturates.

Debate and ensemble:

- Communication paradigms divide into cooperative, debate, and competitive [Guo et al., LLM-based Multi-Agents]. In debate, agents present competing viewpoints, critique alternatives, and converge on consensus; in ensembles, diverse attempts are aggregated by voting.
- Competition promotes robustness and surfaces errors a single generator misses, at the cost of multiplying inference per output and requiring conflict-resolution machinery [Tran et al., Multi-Agent Collaboration Mechanisms].
- Use for high-stakes outputs with objective quality criteria and a fixed round budget, not as a general quality spray.

Parallel research (orchestrator plus parallel searchers):

- The production-proven specialization of manager for read-heavy work: a lead agent plans, spawns 3 to 5 subagents in parallel, each with its own context window and 3 or more simultaneous tool calls, each acting as an intelligent filter that returns condensed findings for synthesis [Anthropic, multi-agent research system].
- Cut research time by up to 90 percent on complex queries; an Opus-class lead with Sonnet-class subagents outperformed single-agent Opus by 90.2 percent on an internal research eval [Anthropic, multi-agent research system].

### Communication mechanisms

Message passing:

- Agents exchange information through defined channels: direct messages, or a shared publish-subscribe message pool as in MetaGPT [Guo et al., LLM-based Multi-Agents; Tran et al., Multi-Agent Collaboration Mechanisms].
- Explicit, traceable, and bounded, but every hop is lossy: each agent summarizes, and details die in transit.

Shared state:

- Agents read and write a common store (blackboard, task ledger, filesystem), supporting a collective belief state and avoiding n-squared messaging [Tran et al., Multi-Agent Collaboration Mechanisms].
- Demands concurrency discipline (who may write what, when) and makes it easy for agents to act on stale reads.

Coordination strategy families [Tran et al., Multi-Agent Collaboration Mechanisms]:

- Rule-based: predefined interaction rules; consistent and fair, but low adaptability and rule count explodes with complexity.
- Role-based: predefined roles and standard operating procedures (MetaGPT); modular and reusable, but rigid, and performance hinges on inter-agent communication quality.
- Model-based: probabilistic and adaptive to uncertainty; robust in dynamic environments but complex to implement and debug.
- Static architectures fix the agent graph at design time; dynamic ones reconfigure at runtime (DyLAN ranks and deactivates underperforming agents mid-execution). Enterprise designs should default to static, role-based, message-passing configurations: they are auditable.

Production constraints worth copying [Anthropic, multi-agent research system]:

- Run subagents synchronously at first: the lead waits for completion. Asynchronous coordination adds state-consistency and result-coordination complexity that was not worth it even at Anthropic's scale.
- Treat delegation as a contract: every subagent task needs an objective, an output format, guidance on tools and sources, and clear task boundaries. Vague delegation caused duplicated work and wrong interpretations.

### Coordination failure modes

These recur across surveys and production reports and must be designed against, not discovered:

- Context divergence: agents proceed from inconsistent views of the task because context does not transfer fully across hops; each summary drops details the next agent needed.
- Duplicated work: overlapping subtask boundaries; observed in production as subagents running near-identical searches until delegation prompts specified explicit boundaries [Anthropic, multi-agent research system].
- Effort miscalibration: early versions spawned 50 or more subagents for simple queries and searched endlessly for nonexistent sources; fixed with explicit scaling rules (simple fact-finding: 1 agent, 3 to 10 tool calls; direct comparisons: 2 to 4 subagents, 10 to 15 calls each; complex research: 10 or more subagents with divided responsibilities) [Anthropic, multi-agent research system].
- Error and hallucination cascades: one agent's fabrication becomes the next agent's ground truth; cooperative networks amplify single-agent failures [Guo et al., LLM-based Multi-Agents; Tran et al., Multi-Agent Collaboration Mechanisms].
- Deadlock and distraction: agents waiting on each other, or excessive agent-to-agent updates crowding out task progress [Anthropic, multi-agent research system].
- Termination failure: agents continuing after sufficient results exist, burning tokens past the point of value [Anthropic, multi-agent research system].
- Hub failure: in centralized topologies the coordinator is a single point of failure; in hierarchical ones, edge failures cascade upward [Tran et al., Multi-Agent Collaboration Mechanisms].

Mandatory mitigations in any rung-4 design: explicit task boundaries per agent, effort budgets (max subagents, max tool calls), a termination criterion, failure containment (checkpoint and resume rather than restart, letting the model adapt to tool failures), and full production tracing of decision patterns [Anthropic, multi-agent research system].

### Token and cost economics

Measured in production [Anthropic, multi-agent research system]:

- Agents use about 4x more tokens than chat interactions; multi-agent systems use about 15x more tokens than chat.
- Token usage alone explained 80 percent of performance variance in the research eval: multi-agent buys performance largely by spending more tokens across more context windows in parallel.

Design consequences:

- Multi-agent requires tasks whose value justifies roughly an order of magnitude higher inference spend [Anthropic, multi-agent research system].
- The cheaper first lever for a struggling single agent is more tokens in one context (better retrieval, extended thinking), not more agents.
- Mixed model tiers change the equation: put the expensive model where synthesis happens and cheap models where filtering happens; the Opus-lead-Sonnet-workers configuration beat single-agent Opus while containing cost [Anthropic, multi-agent research system].
- Latency is not automatically better: parallel subagents cut wall-clock time for parallelizable work by up to 90 percent, but every serial coordination hop adds a full model round trip [Anthropic, multi-agent research system].

### When multi-agent genuinely wins, and loses

Wins [Anthropic, multi-agent research system; OpenAI, Practical Guide]:

- Breadth-first, parallelizable, read-heavy work: research, due diligence, large-corpus review.
- Working sets exceeding a single context window: subagents act as context partitions, each returning a distilled summary [knowledge/context-memory.md].
- Privilege separation: different agents hold different credentials and tool access, so a compromised or confused agent has a bounded blast radius [knowledge/security-governance.md].
- Heavy tool surfaces that split cleanly by domain.

Loses [Anthropic, multi-agent research system]:

- Sequentially dependent tasks where each step needs the previous step's full context; most coding tasks fall here.
- Domains requiring all agents to share the same evolving context.
- Tight latency budgets that cannot absorb coordination hops.
- Low-value-per-query workloads where 15x token cost can never pay back.

For the losing cases, a single agent with compaction and structured memory [knowledge/context-memory.md] or a workflow pattern [knowledge/decision-trees.md, Tree 3] is the correct design.

## When to apply

- If a single agent with a well-designed toolset meets evals, then stop at rung 3 and record the eval evidence.
- If the prompt has become an unmaintainable tangle of conditional branches, then split by domain [OpenAI, Practical Guide]; consider a routing workflow before full multi-agent.
- If tools overlap and confuse the agent, then fix descriptions and prune overlap first; split only if confusion persists across clean, distinct tool groups [OpenAI, Practical Guide].
- If subtasks are parallelizable, read-heavy, and independent, then orchestrator plus parallel workers with explicit boundaries and effort budgets [Anthropic, multi-agent research system].
- If one specialist should own the user interaction after triage, then decentralized handoff [OpenAI, Practical Guide].
- If a single agent must control flow and synthesize all results, then manager pattern [OpenAI, Practical Guide].
- If output stakes justify adversarial review and criteria are objective, then generator plus critic or debate, with a fixed round budget [Guo et al., LLM-based Multi-Agents].
- If privilege boundaries differ across task phases, then separate agents per privilege domain even when one agent could do the work [knowledge/security-governance.md].
- If the task is sequentially dependent or latency-critical, then do not use multi-agent; use a single agent or workflow.
- If subagent work is filtering and the lead's work is synthesis, then tier the models: expensive lead, cheap workers [Anthropic, multi-agent research system].
- For any rung-4 design, record: topology, communication mechanism (message passing vs shared state), per-agent task boundaries and effort budgets, termination criteria, failure containment, and the accepted token multiplier.

## Common failure modes

- Multi-agent by default: choosing agents-as-microservices for organizational aesthetics, paying 15x tokens for work a single agent does better [Anthropic, multi-agent research system].
- Vague delegation: subagent prompts without objective, output format, tool guidance, and boundaries, producing duplicated and divergent work [Anthropic, multi-agent research system].
- Unbounded spawning: no cap on subagent count or tool calls, so simple queries fan out to dozens of agents [Anthropic, multi-agent research system].
- Lossy hop chains: three or more summarization hops between evidence and final answer, so citations cannot be traced and details are gone.
- Hallucination laundering: downstream agents treating upstream agent output as verified fact; cascades amplify single-agent errors [Guo et al., LLM-based Multi-Agents].
- Shared-state races: two agents writing the same plan document or record without ownership rules, silently overwriting each other.
- Restart-on-failure: rerunning an entire multi-agent job when one agent errors mid-task instead of checkpointing and resuming, multiplying cost and latency [Anthropic, multi-agent research system].
- No tracing: without full decision-pattern tracing, coordination bugs are unreproducible and undebuggable [Anthropic, multi-agent research system].
- Debate without criteria: adversarial rounds on subjective outputs converge on verbosity, not quality.
- Deploy-time breakage: code updates shipped to all agents at once break long-running processes mid-flight; use gradual (rainbow) rollouts across agent versions [Anthropic, multi-agent research system].
- Ignoring evaluation gaps: multi-agent behavior is emergent, and per-agent benchmarks miss coordination failures; evals must cover end-to-end tasks, and LLM judges with rubric criteria plus human spot checks catch what automation misses [Anthropic, multi-agent research system; Guo et al., LLM-based Multi-Agents; knowledge/evaluation.md].

## Citations

- Tran et al., Multi-Agent Collaboration Mechanisms: A Survey of LLMs. https://arxiv.org/abs/2501.06322
- Guo et al., LLM-based Multi-Agents: Large Language Model based Multi-Agents: A Survey of Progress and Challenges. https://arxiv.org/abs/2402.01680
- OpenAI, A Practical Guide to Building Agents. https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- Anthropic, Building Effective Agents. https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, multi-agent research system: How we built our multi-agent research system. https://www.anthropic.com/engineering/multi-agent-research-system
- Cross-references: knowledge/decision-trees.md, knowledge/context-memory.md, knowledge/security-governance.md, knowledge/evaluation.md
