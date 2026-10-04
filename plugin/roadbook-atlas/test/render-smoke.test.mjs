#!/usr/bin/env node
/**
 * Roadbook Atlas — archify vendor smoke test.
 *
 * Renders one minimal spec per diagram type through the VENDORED archify CLI and asserts
 * that every run succeeds and produces a real artifact. This is the regression guard for
 * the vendored tree at `skills/roadbook-atlas/vendor/archify/`: if a file goes missing, an
 * import escapes the skill directory, or the CLI starts depending on something outside the
 * repo, this fails.
 *
 * Plain Node ESM. No test framework, no dependencies, no network, no Chrome.
 *
 *   cd plugin/roadbook-atlas
 *   node test/render-smoke.test.mjs
 *
 * Exit status is 0 only when all five types render. Prints one line per type and a final
 * `SUMMARY ok=N fail=M` line.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const CLI = path.join(PLUGIN_ROOT, 'skills', 'roadbook-atlas', 'vendor', 'archify', 'bin', 'archify.mjs');

/** Minimum artifact size. Real renders are ~623-627 KB; well under 100 KB means broken. */
const MIN_ARTIFACT_BYTES = 100 * 1024;
const QUALITY = 'showcase';

const SPECS = {
  architecture: {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Atlas Smoke Architecture',
      subtitle: 'minimal five-type render proof',
      visual_preset: 'signal-flow',
      animation: 'trace',
    },
    layout: { mode: 'grid', cols: 4 },
    components: [
      { id: 'web', type: 'frontend', label: 'Web App', row: 0, col: 0 },
      { id: 'api', type: 'backend', label: 'Atlas API', row: 0, col: 1 },
      { id: 'worker', type: 'backend', label: 'Render Worker', row: 0, col: 2 },
      { id: 'cdn', type: 'external', label: 'Artifact CDN', row: 0, col: 3 },
    ],
    connections: [
      { from: 'web', to: 'api', label: 'submit', variant: 'emphasis', labelDy: -50 },
      { from: 'api', to: 'worker', label: 'enqueue', variant: 'dashed', labelDy: -50 },
      { from: 'worker', to: 'cdn', label: 'publish', labelDy: -50 },
    ],
    cards: [{ dot: 'cyan', title: 'Scope', items: ['one request path'] }],
  },

  workflow: {
    schema_version: 1,
    diagram_type: 'workflow',
    meta: { title: 'Atlas Smoke Workflow', visual_preset: 'signal-flow', animation: 'trace' },
    lanes: [
      { id: 'author', label: 'Author' },
      { id: 'atlas', label: 'Atlas Runtime' },
    ],
    nodes: [
      { id: 'draft', lane: 'author', col: 0, type: 'frontend', label: 'Draft spec' },
      { id: 'validate', lane: 'atlas', col: 0, type: 'backend', label: 'Validate' },
      { id: 'render', lane: 'atlas', col: 3, type: 'backend', label: 'Render HTML' },
      { id: 'notify', lane: 'author', col: 3, type: 'frontend', label: 'Notify author' },
    ],
    edges: [
      { from: 'draft', to: 'validate', label: 'submit', role: 'main', labelDx: 40 },
      { from: 'validate', to: 'render', label: 'render job', role: 'main' },
      { from: 'render', to: 'notify', label: 'ready', role: 'return', labelDx: 40 },
    ],
    cards: [{ dot: 'emerald', title: 'Scope', items: ['two lanes'] }],
  },

  sequence: {
    schema_version: 1,
    diagram_type: 'sequence',
    meta: { title: 'Atlas Smoke Sequence', visual_preset: 'signal-flow', animation: 'trace' },
    participants: [
      { id: 'client', type: 'frontend', label: 'Client' },
      { id: 'api', type: 'backend', label: 'Atlas API' },
      { id: 'store', type: 'database', label: 'Spec Store' },
    ],
    messages: [
      { from: 'client', to: 'api', y: 200, label: 'POST /specs', variant: 'emphasis' },
      { from: 'api', to: 'store', y: 260, label: 'insert spec' },
      { from: 'store', to: 'api', y: 320, label: 'spec id', variant: 'return' },
      { from: 'api', to: 'client', y: 380, label: '201 created', variant: 'return' },
    ],
    cards: [{ dot: 'cyan', title: 'Scope', items: ['one round trip'] }],
  },

  dataflow: {
    schema_version: 1,
    diagram_type: 'dataflow',
    meta: { title: 'Atlas Smoke Dataflow', visual_preset: 'signal-flow', animation: 'trace' },
    stages: [{ label: 'Ingest' }, { label: 'Transform' }, { label: 'Publish' }],
    nodes: [
      { id: 'raw', type: 'external', label: 'Raw Spec', stage: 0, row: 0 },
      { id: 'parse', type: 'backend', label: 'Parse', stage: 1, row: 0 },
      { id: 'html', type: 'backend', label: 'Render HTML', stage: 2, row: 0 },
    ],
    flows: [
      { from: 'raw', to: 'parse', label: 'json', classification: 'spec' },
      { from: 'parse', to: 'html', label: 'IR', classification: 'intermediate' },
    ],
    cards: [{ dot: 'amber', title: 'Scope', items: ['three stages'] }],
  },

  lifecycle: {
    schema_version: 1,
    diagram_type: 'lifecycle',
    meta: { title: 'Atlas Smoke Lifecycle', visual_preset: 'signal-flow', animation: 'trace' },
    lanes: [
      { id: 'main', label: 'Render job' },
      { id: 'terminal', label: 'Outcome' },
    ],
    states: [
      { id: 'queued', type: 'start', label: 'Queued', lane: 'main', col: 0, step: '01' },
      { id: 'running', type: 'active', label: 'Running', lane: 'main', col: 1, step: '02' },
      { id: 'checking', type: 'decision', label: 'Checks pass?', lane: 'main', col: 2, step: '03' },
      { id: 'done', type: 'success', label: 'Delivered', lane: 'main', col: 4 },
      { id: 'failed', type: 'failure', label: 'Failed', lane: 'terminal', col: 2 },
    ],
    transitions: [
      { from: 'queued', to: 'running' },
      { from: 'running', to: 'checking' },
      { from: 'checking', to: 'done' },
      { from: 'checking', to: 'failed', route: 'drop' },
    ],
    cards: [{ dot: 'rose', title: 'Scope', items: ['two lanes'] }],
  },
};

const TYPES = Object.keys(SPECS);

function human(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function lastLines(text, count = 6) {
  const lines = String(text || '').trim().split('\n').filter(Boolean);
  return lines.slice(-count).join('\n');
}

function renderOne(type, spec, workDir) {
  const specPath = path.join(workDir, `${type}.json`);
  const outPath = path.join(workDir, `${type}.html`);
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);

  const args = [CLI, 'deliver', type, specPath, outPath, '--quality', QUALITY, '--json'];
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120_000 });

  if (run.error) {
    return { ok: false, detail: `spawn failed: ${run.error.message}` };
  }
  if (run.status !== 0) {
    return {
      ok: false,
      detail: `exit ${run.status}; ${lastLines(run.stderr) || lastLines(run.stdout) || 'no output'}`,
    };
  }

  let receipt = null;
  try {
    receipt = JSON.parse(String(run.stdout).trim());
  } catch {
    // A receipt we cannot parse is not fatal by itself - the artifact check below decides.
  }
  if (receipt && receipt.ok === false) {
    return { ok: false, detail: `receipt ok=false: ${receipt.error || 'unknown error'}` };
  }

  let bytes;
  try {
    bytes = fs.statSync(outPath).size;
  } catch {
    return { ok: false, detail: `exit 0 but no artifact at ${outPath}` };
  }
  if (bytes <= MIN_ARTIFACT_BYTES) {
    return { ok: false, detail: `artifact only ${human(bytes)}, expected > ${human(MIN_ARTIFACT_BYTES)}` };
  }

  const checks = receipt?.validation
    ? `${receipt.validation.checksPassed}/${receipt.validation.checkCount} checks, ` +
      `composition ${receipt.validation.compositionProfile}:${receipt.validation.compositionStatus}`
    : 'no receipt';
  const sha = receipt?.artifact?.sha256 ? ` sha256 ${receipt.artifact.sha256.slice(0, 12)}` : '';
  return { ok: true, bytes, receipt, detail: `${human(bytes)}  ${checks}${sha}` };
}

function main() {
  console.log('archify vendor smoke test');
  console.log(`  cli    ${CLI}`);
  console.log(`  node   ${process.version}`);
  console.log(`  root   ${PLUGIN_ROOT}`);
  console.log('');

  if (!fs.existsSync(CLI)) {
    console.error(`FAIL  vendored CLI not found at ${CLI}`);
    console.log('SUMMARY ok=0 fail=' + TYPES.length);
    process.exitCode = 1;
    return;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-render-smoke-'));
  console.log(`  work   ${workDir}`);
  console.log('');

  let ok = 0;
  let fail = 0;
  let failureDetail = null;

  for (const type of TYPES) {
    const result = renderOne(type, SPECS[type], workDir);
    if (result.ok) {
      ok += 1;
      console.log(`ok    ${type.padEnd(12)} ${result.detail}`);
    } else {
      fail += 1;
      failureDetail ??= `${type}: ${result.detail}`;
      console.log(`FAIL  ${type.padEnd(12)} ${result.detail}`);
    }
  }

  console.log('');
  if (fail === 0) {
    // Only clean up when everything passed; a failure leaves the specs and stderr behind
    // so the broken input can be inspected.
    fs.rmSync(workDir, { recursive: true, force: true });
  } else {
    console.log(`kept work dir for inspection: ${workDir}`);
  }

  console.log(`SUMMARY ok=${ok} fail=${fail}`);
  if (fail > 0) {
    if (failureDetail) console.error(`first failure: ${failureDetail}`);
    process.exitCode = 1;
  }
}

main();
