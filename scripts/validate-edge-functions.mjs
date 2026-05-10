import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('supabase/functions');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      files.push(...await walk(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function validateImportBlocks(filePath, source) {
  const problems = [];
  const lines = source.split(/\r?\n/);
  let importBlockStart = null;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trimStart();

    if (importBlockStart !== null) {
      if (trimmed.startsWith('import ')) {
        problems.push({
          filePath,
          line: index + 1,
          message: 'Nested import statement inside an unfinished import block.',
        });
      }
      if (/}\s+from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed)) {
        importBlockStart = null;
      }
      continue;
    }

    if (/^import\s*{\s*$/.test(trimmed)) {
      importBlockStart = index + 1;
    }
  }

  if (importBlockStart !== null) {
    problems.push({
      filePath,
      line: importBlockStart,
      message: 'Unclosed multi-line import block.',
    });
  }

  return problems;
}

const files = await walk(ROOT);
const problems = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  problems.push(...validateImportBlocks(path.relative(process.cwd(), file), source));
}

if (problems.length > 0) {
  console.error('Edge function validation failed: malformed import syntax found.');
  for (const problem of problems) {
    console.error(`- ${problem.filePath}:${problem.line} — ${problem.message}`);
  }
  process.exit(1);
}

console.log(`Edge function validation passed for ${files.length} source files.`);
