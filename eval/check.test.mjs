// Unit tests for the reasoning-eval grader (eval/check.mjs).
//
// The mustNot semantics are the load-bearing part: the section templates
// require designs to name rejected alternatives, so the grader must fail a
// design that recommends a marker while passing one that rejects it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDesign, findMustNotViolation, stripHtml, loadCases, validateCases } from './check.mjs';

const mustNotCase = (markers) => ({ id: 't', prompt: 'p', expect: { mustNot: markers } });

test('mustNot flags a recommended marker', () => {
  const failures = checkDesign(mustNotCase(['vector database']),
    'Store the recipe embeddings in a vector database and query at runtime.');
  assert.equal(failures.length, 1);
  assert.match(failures[0], /vector database/);
});

test('mustNot does not flag a rejected alternative', () => {
  const texts = [
    'We rejected a vector database: the 12k-recipe catalog fits in memory.',
    'Structured filtering beats retrieval here, so no vector database is needed.',
    'Use SQL filters instead of a vector database.',
    'A vector database would be overkill at this scale.',
  ];
  for (const t of texts) {
    assert.deepEqual(checkDesign(mustNotCase(['vector database']), t), [], t);
  }
});

test('mustNot does not flag a rejected alternative in a decision-record table', () => {
  const html = '<table><tr><td>Vector database</td><td>Rejected: the catalog is structured and small.</td></tr></table>';
  assert.deepEqual(checkDesign(mustNotCase(['vector database']), html), []);
});

test('mustNot is whole-word by default', () => {
  assert.deepEqual(checkDesign(mustNotCase(['agent']),
    'Generated with Agentify. The pipeline uses deterministic rules.'), []);
  assert.equal(checkDesign(mustNotCase(['agent']),
    'Deploy an agent with a planning loop for this.').length, 1);
});

test('a trailing * makes a mustNot entry a stem', () => {
  assert.equal(checkDesign(mustNotCase(['diagnos*']),
    'The feature provides a likely diagnosis for the symptoms.').length, 1);
  assert.deepEqual(checkDesign(mustNotCase(['diagnos*']),
    'The feature does not diagnose; it gives general guidance.'), []);
});

test('mustNot ignores markup, style, and script text', () => {
  const html = '<style>.agent-card { color: red; }</style><script>const agent = 1;</script>' +
    '<p class="agent">A deterministic rules engine routes each invoice.</p>';
  assert.deepEqual(checkDesign(mustNotCase(['agent']), html), []);
});

test('mustNot spans markup and whitespace inside a phrase', () => {
  const html = '<p>Persist embeddings in a <em>vector\n  database</em> for retrieval.</p>';
  assert.equal(checkDesign(mustNotCase(['vector database']), html).length, 1);
});

test('mustMention remains substring/stem matching', () => {
  const c = { id: 't', prompt: 'p', expect: { mustMention: ['escalat', 'guardrail'] } };
  assert.deepEqual(checkDesign(c, 'Escalation to a human agent; input guardrails apply.'), []);
  assert.equal(checkDesign(c, 'No relevant concepts here.').length, 2);
});

test('rung and weight class expectations unchanged', () => {
  const c = { id: 't', prompt: 'p', expect: { rung: 1, weightClass: 'lightweight' } };
  assert.deepEqual(checkDesign(c, 'This is a lightweight design at Rung 1.'), []);
  assert.equal(checkDesign(c, 'This is an enterprise design at Rung 3.').length, 2);
});

test('findMustNotViolation returns a context snippet', () => {
  const hit = findMustNotViolation('The design deploys an autonomous agent for triage.', 'autonomous agent');
  assert.ok(hit && hit.includes('autonomous agent'));
  assert.equal(findMustNotViolation('No such marker here.', 'autonomous agent'), null);
});

test('stripHtml decodes entities and collapses whitespace', () => {
  assert.equal(stripHtml('<p>a &amp; b\n\n  c&nbsp;&lt;d&gt;</p>').trim(), 'a & b c <d>');
});

test('committed cases.jsonl is well-formed', () => {
  const cases = loadCases();
  assert.ok(cases.length >= 13);
  assert.equal(validateCases(cases), 0);
});
