# Reasoning eval

The skill's value is its design reasoning (does it de-escalate correctly, apply the right pattern, size the design to the problem, flag domain harm), not the diagram engine. This directory is a lightweight harness that guards that reasoning against regressions from `SKILL.md` and knowledge-base edits.

## What is here

- `cases.jsonl`: one case per line. Each has a `prompt`, canned stakeholder `answers` (so a run is reproducible), and an `expect` block: the escalation `rung`, `weightClass`, concepts that `mustMention`, and over-engineering markers that `mustNot` appear. Some cases also carry a `design` path to a committed example so they run automatically.
- `check.mjs`: grades a produced design against a case, and validates the case file. It does not call a model.

## How to run it

The skill is model-driven, so producing a design is a manual or agent step:

1. Pick a case from `cases.jsonl`. Run the skill on its `prompt`, answering its clarifying questions with the case's `answers`.
2. Save the produced design (the `.design.html` or the `.design.md` source).
3. Grade it: `node eval/check.mjs <case-id> path/to/design.html`

Automated checks (run in CI):

```bash
node eval/check.mjs --validate   # every case is well-formed
node eval/check.mjs --seeded     # every case with a committed design still meets its expectations
```

`--seeded` guards the gallery: if an example design is edited in a way that drops its expected decisions, CI fails.

## Adding a case

Add a line to `cases.jsonl` with a new `id`, the `prompt`, the `answers` you would give, and an `expect` block. Keep `mustMention` to concepts the design genuinely should contain, and `mustNot` to over-engineering markers (for example a lightweight design should not recommend a "vector database"). To seed it for automatic checking, generate the design, commit it, and add its path as `design`.

## Limitations

This is substring and rung matching, not semantic grading, so it catches gross regressions (the skill started recommending an agent where it should not, or dropped domain-harm analysis) rather than subtle quality drift. A model-graded eval is future work.
