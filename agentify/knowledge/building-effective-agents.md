# Building effective agents

Purpose: this document grounds the single most consequential decision in agentic system design, how much autonomy to grant the LLM. It synthesizes Anthropic's workflow and agent patterns, OpenAI's practical guidance on single-agent vs multi-agent orchestration and layered guardrails, and Google's cognitive architecture framing (model, tools, orchestration layer). Consult it whenever selecting an orchestration pattern, and apply the escalation ladder before committing to any design that includes the word "agent".

## Principles

### Workflows vs agents: the fundamental split

Agentic systems divide into two architecturally distinct families [Anthropic, Building Effective Agents]:

- **Workflows**: LLMs and tools orchestrated through predetermined code paths. The developer owns control flow; the model fills in steps. Predictable, testable, bounded cost.
- **Agents**: the LLM dynamically directs its own process and tool usage, deciding what to do next based on environment feedback in a loop. Flexible, but latency, cost, and error rates are open-ended.

OpenAI's operational definition sharpens the boundary: an agent "leverages an LLM to manage workflow execution and make decisions," recognizes completion, corrects its own actions, and halts and returns control to the user on failure. Applications that embed LLMs but do not let them control execution (simple chatbots, single-turn classifiers) are not agents [OpenAI, Practical Guide to Building Agents]. Anthropic's core advice: agentic systems trade latency and cost for task performance, and you should find the simplest solution possible, adding complexity only when demonstrably needed [Anthropic, Building Effective Agents].

Google frames the same divide as agents vs models: a bare model gives a single inference bounded by training data, with no native tools, session history, or logic layer; an agent adds tool-extended knowledge, managed multi-turn session state, natively integrated tools, and a native cognitive architecture running reasoning frameworks such as CoT or ReAct [Google, Agents Whitepaper].

### When an agent adds value at all

OpenAI's deployment experience yields three concrete qualification criteria; prioritize workflows that have resisted conventional automation [OpenAI, Practical Guide to Building Agents]:

1. **Complex decision-making**: nuanced judgment, exceptions, context-sensitive calls (example: refund approval in customer service).
2. **Difficult-to-maintain rules**: rulesets so large and intricate that updates are costly and error-prone (example: vendor security reviews).
3. **Heavy reliance on unstructured data**: interpreting natural language, extracting meaning from documents, conversational interaction (example: processing a home insurance claim).

If the use case does not clearly meet these criteria, "a deterministic solution may suffice" [OpenAI, Practical Guide to Building Agents]. The fraud-analysis contrast makes the distinction concrete: a rules engine flags transactions against preset criteria like a checklist; an agent works like a seasoned investigator, weighing context and subtle patterns even when no explicit rule is violated [OpenAI, Practical Guide to Building Agents].

### The augmented LLM building block

Every pattern below composes one primitive: an LLM augmented with retrieval, tools, and memory, where the model itself generates search queries, selects tools, and decides what to persist [Anthropic, Building Effective Agents]. Two implementation requirements: tailor the augmentations to the specific use case, and give the model a clean, well-documented interface to each one.

Google's Agents whitepaper generalizes this into a three-part cognitive architecture [Google, Agents Whitepaper]:

1. **Model**: the central decision maker, prompted with reasoning frameworks such as ReAct, Chain-of-Thought, or Tree-of-Thoughts. It is typically not trained on the specific tool configuration it will run with, so tool descriptions and examples carry the load.
2. **Tools**: the bridge to the outside world. Three types with different execution locations:
   - **Extensions**: agent-side execution. The agent calls the external API directly; built-in examples let the model select the right extension at runtime [Google, Agents Whitepaper].
   - **Functions**: client-side execution. The model outputs a function name and arguments but does not make the live call; the application executes it. Choose functions when APIs must be called from another layer (middleware, front end), when security or network restrictions prevent the agent from reaching the API, when human-in-the-loop review or batch timing sits between decision and execution, or when you want to stub APIs during development [Google, Agents Whitepaper].
   - **Data stores**: typically vector databases backing RAG, giving the agent access to dynamic data in its original format without retraining [Google, Agents Whitepaper].
3. **Orchestration layer**: the cyclical process governing how the agent takes in information, reasons, and decides the next action until a stopping condition. Its complexity varies from simple loops to multi-step planning [Google, Agents Whitepaper].

OpenAI's parallel taxonomy for tools is worth carrying into designs: **data tools** (retrieve context: query databases, read documents, search the web), **action tools** (change state: send email, update a CRM, hand off a ticket), and **orchestration tools** (agents exposed as tools to other agents) [OpenAI, Practical Guide to Building Agents]. Action tools always warrant guardrail and approval analysis; data tools usually do not. For legacy systems without APIs, computer-use models operating through the UI substitute for tool integration [OpenAI, Practical Guide to Building Agents].

### Model selection and instruction design

Model choice is per-task, not per-system: simple retrieval or intent classification can run on smaller, faster models while decisions like refund approval justify the most capable one [OpenAI, Practical Guide to Building Agents]. The documented procedure:

1. Set up evals to establish a performance baseline.
2. Prototype every task with the best available model to hit the accuracy target without prematurely capping capability.
3. Swap in smaller models where evals show they still pass, optimizing cost and latency last [OpenAI, Practical Guide to Building Agents].

Instruction design best practices from the same deployments [OpenAI, Practical Guide to Building Agents]:

- **Use existing documents**: convert operating procedures, support scripts, and policy docs into LLM-friendly routines; in customer service, routines map roughly to knowledge-base articles.
- **Break down tasks**: smaller, clearer steps from dense resources reduce ambiguity.
- **Define clear actions**: every routine step corresponds to a specific action or output, down to the wording of user-facing messages.
- **Capture edge cases**: anticipate incomplete information and unexpected questions with conditional branches, such as an alternative step when a required field is missing.

A capable reasoning model can auto-convert policy documents into numbered agent instructions, which makes instruction maintenance a pipeline rather than a hand-crafting exercise [OpenAI, Practical Guide to Building Agents].

### The five workflow patterns

Use these when control flow can live in code [Anthropic, Building Effective Agents]:

1. **Prompt chaining**: decompose into fixed sequential steps, each LLM call consuming the previous output, with optional programmatic gates between steps. Use when the task decomposes cleanly into fixed subtasks and you trade latency for per-step accuracy. Examples: generate marketing copy then translate it; write an outline, validate it in code, then write the document.
2. **Routing**: classify the input, dispatch to a specialized downstream prompt, model, or workflow. Use when inputs fall into distinct categories that are better handled separately and classification is reliable. Examples: customer service triage (general vs refund vs technical); sending easy queries to a small fast model and hard ones to a frontier model, a direct cost lever.
3. **Parallelization**: run LLM calls simultaneously and aggregate. Two variants: **sectioning** (independent subtasks in parallel, e.g. one call answers while another screens for policy violations) and **voting** (same task run several times for diverse answers, e.g. code vulnerability review with multiple prompts flagging on any hit). Use for speed, or when multiple perspectives raise confidence.
4. **Orchestrator-workers**: a central LLM dynamically decomposes the task, delegates to worker LLMs, and synthesizes results. Differs from parallelization because subtasks are not known in advance; the orchestrator decides them per input. Examples: code changes spanning an unpredictable set of files; multi-source research.
5. **Evaluator-optimizer**: one LLM generates, another critiques in a loop. Use when clear evaluation criteria exist and iteration measurably helps, roughly when a human editor would improve the draft. Examples: literary translation; iterative search that decides whether another round is needed.

Note the boundary case: orchestrator-workers is a workflow with an agentic core. It is the last stop before a full agent and often delivers most of the benefit at a fraction of the unpredictability.

### Single agent before multi-agent

When you do need an agent, OpenAI's field guidance is unambiguous: maximize a single agent's capability first. A single agent with incrementally added tools keeps complexity manageable and evaluation tractable; every orchestration approach reduces to a run loop with exit conditions (a final-output tool call, a plain response with no tool calls, an error, or a max-turn ceiling) [OpenAI, Practical Guide to Building Agents]. Before splitting, try prompt templates with policy variables rather than maintaining many near-duplicate prompts.

Split into multiple agents only on evidence of failure, with two concrete triggers [OpenAI, Practical Guide to Building Agents]:

- **Complex logic**: prompts with many conditional branches (if-then-else) that no longer scale as templates.
- **Tool overload**: not raw count but similarity. Some implementations run more than 15 well-defined, distinct tools cleanly while others struggle with fewer than 10 overlapping ones. Split only after better names, parameters, and descriptions fail to fix tool selection.

### Multi-agent: manager pattern vs decentralized handoffs

Two broadly applicable multi-agent topologies [OpenAI, Practical Guide to Building Agents]:

- **Manager (agents as tools)**: a central manager agent invokes specialized agents via tool calls and synthesizes results into one coherent interaction. The manager keeps context and owns the user relationship. Ideal when exactly one agent should control execution and face the user. Modeled as a graph whose edges are tool calls.
- **Decentralized (handoffs)**: peer agents transfer execution one way, passing the latest conversation state; the receiving agent takes over the user interaction entirely. Ideal for triage flows where a specialist should fully own the task and the original agent need not stay involved. Edges are handoffs, optionally with a handoff back.

Selection rule: if results must be synthesized into a single answer or one agent must retain the user session, use manager. If the task should be fully transferred (classic contact-center triage), use handoffs. Anthropic's orchestrator-workers is the workflow-shaped cousin of the manager pattern; prefer it when the set of specialists is fixed enough to encode.

One framework-selection note with architectural consequences: declarative graph frameworks require every branch, loop, and conditional defined upfront, which aids visual clarity but becomes cumbersome as workflows grow dynamic and can demand learning a DSL; code-first approaches express the same logic in ordinary programming constructs without pre-defining the whole graph [OpenAI, Practical Guide to Building Agents]. Whichever is chosen, keep components flexible, composable, and driven by clear, well-structured prompts [OpenAI, Practical Guide to Building Agents].

### Guardrails as layered defense

Treat guardrails as a layered mechanism, not a single filter: no single guardrail suffices, and resilient agents combine LLM-based checks, rules-based checks, and moderation, running concurrently with the main agent (optimistic execution) and raising exceptions on breach [OpenAI, Practical Guide to Building Agents]. The catalog:

- **Relevance classifier**: flags off-topic queries to keep the agent in scope.
- **Safety classifier**: detects jailbreaks and prompt injections (e.g. role-play attempts to extract the system prompt).
- **PII filter**: vets model output for unnecessary personal data exposure.
- **Moderation**: flags hate, harassment, violence.
- **Rules-based protections**: deterministic blocklists, input length limits, regex filters for known threats such as SQL injection.
- **Output validation**: brand and policy alignment checks on responses.
- **Tool safeguards**: rate every tool low, medium, or high risk on read-only vs write, reversibility, permissions, and financial impact; high-risk tools trigger extra checks or human escalation before execution [OpenAI, Practical Guide to Building Agents].

Plan human intervention from day one with two triggers: exceeding failure thresholds (retries, misunderstood intent) and high-risk actions (canceling orders, large refunds, payments) until confidence is earned [OpenAI, Practical Guide to Building Agents]. Guardrails complement, never replace, authentication, authorization, and access controls.

### Design principles for any agentic system

Three principles from production deployments [Anthropic, Building Effective Agents]:

1. **Simplicity**: minimize moving parts; avoid framework abstractions that obscure prompts and control flow.
2. **Transparency**: explicitly show the agent's planning steps and reasoning to users and developers; this is also what makes failures debuggable.
3. **Agent-computer interface (ACI) craft**: invest in tool definitions as seriously as in a human UI. Include usage examples, edge cases, format requirements, clear boundaries between tools, obvious parameter names, and argument formats the model cannot easily get wrong. Poor tool docs are the most common silent killer of agent reliability [Anthropic, Building Effective Agents].

### The escalation ladder

Apply in order. Each rung is justified only by explicit failure of the rung below.

1. **Deterministic code, no LLM.** If rules are enumerable, stable, and maintainable, ship software. OpenAI's own criteria imply this default: agents pay off only for nuanced judgment, unmaintainable rulesets, or heavy unstructured-data interpretation; otherwise "a deterministic solution may suffice" [OpenAI, Practical Guide to Building Agents]. Escalate when rules require judgment, exceptions dominate, or the ruleset has become too costly to maintain.
2. **Single augmented LLM call.** One call with retrieval and in-context examples; Anthropic reports this is often enough [Anthropic, Building Effective Agents]. Escalate when one call measurably cannot hit the accuracy target even with good retrieval and few-shot examples.
3. **Workflow patterns.** Pick from the five patterns above; the task structure dictates which (fixed sequence: chaining; distinct categories: routing; independent parts or confidence stacking: parallelization; input-dependent decomposition: orchestrator-workers; iterative quality: evaluator-optimizer). Escalate when the number and sequence of steps cannot be predicted or hardcoded at all.
4. **Single agent.** Open-ended problems, model decisions trustworthy, sandboxed testing feasible, and stopping conditions defined (max turns, final-output tool) [Anthropic, Building Effective Agents; OpenAI, Practical Guide to Building Agents]. Escalate only on the two evidence-based triggers: unscalable conditional prompt logic or overlapping-tool confusion that better descriptions cannot fix.
5. **Multi-agent.** Choose manager for central control and synthesis, decentralized handoffs for full task transfer. Never start here.

At every rung, verify the tradeoff Anthropic names explicitly: agentic systems buy task performance with latency, cost, and compounding error, and the purchase must be justified [Anthropic, Building Effective Agents].

## When to apply

- If the task is well-defined with enumerable rules, then stop at rung 1; recommend software, not AI.
- If accuracy misses target on a single call, then improve retrieval and examples before adding any orchestration [Anthropic, Building Effective Agents].
- If subtasks are fixed and sequential, then prompt chaining; if inputs cluster into categories, then routing; if subtasks are independent, then parallelization (sectioning); if you need confidence on a risky judgment, then parallelization (voting); if decomposition depends on the input, then orchestrator-workers; if quality improves with critique against clear criteria, then evaluator-optimizer [Anthropic, Building Effective Agents].
- If steps genuinely cannot be predicted and the model's decisions can be trusted and sandboxed, then a single agent with a run loop, max-turn limits, and layered guardrails [OpenAI, Practical Guide to Building Agents].
- If a single agent fails on complex branching logic or overlapping tools despite good ACI work, then multi-agent: manager when one agent must own the user and synthesize; handoffs when specialists should fully take over [OpenAI, Practical Guide to Building Agents].
- If a tool writes, spends, or is irreversible, then rate its risk and gate high-risk calls with guardrail checks or human approval [OpenAI, Practical Guide to Building Agents].
- If the agent must call APIs it cannot reach directly, or a human review sits between decision and execution, then use client-side function calling rather than agent-side extensions [Google, Agents Whitepaper].
- If cost or latency is the binding constraint, then routing to smaller models for simple queries is the first lever [Anthropic, Building Effective Agents].

## Common failure modes

- **Starting at agent.** Teams reach for autonomous agents when a router plus two chains would hit the accuracy target at a tenth of the cost and latency. The escalation ladder exists because compounding errors in loops multiply: an agent taking 10 dependent steps at 95 percent per-step reliability completes correctly about 60 percent of the time. Anthropic's guidance is to add complexity only when simpler solutions demonstrably fall short [Anthropic, Building Effective Agents].
- **Framework opacity.** Layers of abstraction that hide prompts and responses make failures undebuggable and violate the simplicity and transparency principles [Anthropic, Building Effective Agents].
- **Neglected ACI.** Vague tool descriptions, ambiguous parameter names, and missing edge-case documentation produce wrong-tool selection that gets misdiagnosed as model weakness [Anthropic, Building Effective Agents].
- **Premature multi-agent split.** Splitting for conceptual tidiness rather than the two evidence triggers adds coordination overhead and new failure surfaces; OpenAI notes a single agent with well-differentiated tools frequently outperforms fragile multi-agent graphs [OpenAI, Practical Guide to Building Agents].
- **Tool overlap misread as tool count.** Cutting tools when the actual problem is similarity; fix names, parameters, and descriptions first [OpenAI, Practical Guide to Building Agents].
- **Single guardrail thinking.** One moderation call treated as safety. Layered defense with relevance, safety, PII, rules-based checks, and tool risk ratings is the documented baseline [OpenAI, Practical Guide to Building Agents].
- **No exit conditions.** Run loops without max turns, final-output definitions, or failure-threshold escalation to humans produce runaway cost and stuck sessions [OpenAI, Practical Guide to Building Agents].
- **Wrong tool execution side.** Agent-side extensions used where security boundaries, middleware, or approval steps demand client-side functions, forcing the agent inside the trust boundary [Google, Agents Whitepaper].

## Citations

- [Anthropic, Building Effective Agents]: https://www.anthropic.com/research/building-effective-agents
- [OpenAI, Practical Guide to Building Agents]: https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- [Google, Agents Whitepaper]: Wiesinger, Marlow, Vuskovic, "Agents", Google, September 2024. https://www.kaggle.com/whitepaper-agents (mirror: https://ia800601.us.archive.org/15/items/google-ai-agents-whitepaper/Newwhitepaper_Agents.pdf)
