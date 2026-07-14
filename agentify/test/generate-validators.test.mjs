import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');

test('validator freshness check accepts CRLF checkouts', () => {
  // The scratch dir must live inside skillRoot so the copied generate-validators
  // script can resolve ajv from skillRoot/node_modules. cli.test.mjs excludes
  // .validator-check-* when it copies skillRoot, so the parallel runs do not race.
  const scratch = fs.mkdtempSync(path.join(skillRoot, '.validator-check-'));
  try {
    fs.mkdirSync(path.join(scratch, 'scripts'));
    fs.mkdirSync(path.join(scratch, 'renderers', 'shared'), { recursive: true });
    fs.cpSync(path.join(skillRoot, 'schemas'), path.join(scratch, 'schemas'), { recursive: true });
    fs.copyFileSync(
      path.join(skillRoot, 'scripts', 'generate-validators.mjs'),
      path.join(scratch, 'scripts', 'generate-validators.mjs'),
    );

    const validator = fs.readFileSync(
      path.join(skillRoot, 'renderers', 'shared', 'generated-validators.mjs'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(scratch, 'renderers', 'shared', 'generated-validators.mjs'),
      validator.replace(/\r\n?|\n/g, '\r\n'),
    );

    const result = spawnSync(process.execPath, [
      path.join(scratch, 'scripts', 'generate-validators.mjs'),
      '--check',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
