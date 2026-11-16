#!/usr/bin/env node
// Sets a task's status in its frontmatter and on the board in tasks/README.md.
// Usage: node scripts/task.mjs TASK-001 <todo|in-progress|done|blocked> [--tick-all]
// --tick-all also ticks every acceptance criterion checkbox in the task file.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [id, status] = process.argv.slice(2);
const statuses = ['todo', 'in-progress', 'done', 'blocked'];
if (!/^TASK-\d{3}$/.test(id ?? '') || !statuses.includes(status)) {
  console.error(
    'Usage: node scripts/task.mjs TASK-001 <todo|in-progress|done|blocked> [--tick-all]',
  );
  process.exit(1);
}

const taskDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tasks');
const file = readdirSync(taskDir).find((f) => f.startsWith(`${id}-`));
if (!file) {
  console.error(`No task file for ${id}`);
  process.exit(1);
}

const taskPath = join(taskDir, file);
let task = readFileSync(taskPath, 'utf8').replace(/^status:.*$/m, `status: ${status}`);
if (process.argv.includes('--tick-all')) task = task.replaceAll('- [ ]', '- [x]');
writeFileSync(taskPath, task);

const boardPath = join(taskDir, 'README.md');
const board = readFileSync(boardPath, 'utf8')
  .split('\n')
  .map((line) =>
    line.startsWith(`| [${id}]`) ? line.replace(/\| [a-z-]+ \|\s*$/, `| ${status} |`) : line,
  )
  .join('\n');
writeFileSync(boardPath, board);
console.log(`${id}: ${status}`);
