#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMATS = new Set(['json', 'toon', 'yaml', 'md', 'jsonl']);

function usage() {
  console.log(`Usage:
  npm run read:exe -- <path-to-exe> [options]
  npm run read:exe:deep -- <path-to-exe> [options]

Reads a PE executable with REA without executing it. The normal command uses the
provider-neutral artifact inspector; the deep command adds the Ghidra overview.

Options:
  --format <json|toon|yaml|md|jsonl>  Output format (default: json)
  --out <file>                        Write output to a file instead of stdout
  -h, --help                          Show this help

Examples:
  npm run read:exe -- "C:\\Program Files\\Snapleaf\\Snapleaf.exe"
  npm run read:exe:deep -- "C:\\Program Files\\Snapleaf\\Snapleaf.exe" --out analysis/snapleaf-inspect.json

Requires rea-agents: npm install --global rea-agents`);
}

function fail(message) {
  console.error(`read-exe: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { help: false, deep: false, format: 'json', out: null, paths: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--deep') {
      options.deep = true;
    } else if (arg === '--') {
      options.paths.push(...argv.slice(index + 1));
      break;
    } else if (arg === '--format') {
      options.format = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--format=')) {
      options.format = arg.slice('--format='.length);
    } else if (arg === '--out') {
      options.out = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--out=')) {
      options.out = arg.slice('--out='.length);
    } else if (arg.startsWith('--')) {
      fail(`Unknown option: ${arg}`);
    } else {
      options.paths.push(arg);
    }
  }

  return options;
}

function moduleRoots() {
  const roots = [path.join(root, 'node_modules')];
  if (process.env.AppData) roots.push(path.join(process.env.AppData, 'npm', 'node_modules'));
  if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'npm', 'node_modules'));
  roots.push(path.join(os.homedir(), '.npm-global', 'lib', 'node_modules'));
  if (process.platform !== 'win32') {
    roots.push('/usr/local/lib/node_modules', '/usr/lib/node_modules');
  }
  return roots;
}

function resolveReaCli() {
  for (const modulesRoot of moduleRoots()) {
    const script = path.join(modulesRoot, 'rea-agents', 'scripts', 'rea.mjs');
    if (existsSync(script)) return { kind: 'node', script };
  }

  // Fall back to the shell shim on PATH if the global install is in an unusual place.
  return process.platform === 'win32'
    ? { kind: 'cmd' }
    : { kind: 'bin', command: 'rea' };
}

function quoteWindowsArg(value) {
  if (/^[\w./:\\-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function runRea(cli, args, env) {
  const options = {
    cwd: root,
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  };

  if (cli.kind === 'node') {
    return spawnSync(process.execPath, [cli.script, ...args], options);
  }
  if (cli.kind === 'cmd') {
    const commandLine = ['rea.cmd', ...args].map(quoteWindowsArg).join(' ');
    return spawnSync('cmd.exe', ['/d', '/s', '/c', commandLine], options);
  }
  return spawnSync(cli.command, args, options);
}

function analysisEnv() {
  const env = { ...process.env };
  const ghidra = path.join(root, 'tools', 'ghidra_12.1.4_PUBLIC');
  if (existsSync(ghidra)) env.GHIDRA_INSTALL_DIR = ghidra;
  if (!env.JAVA_HOME) {
    const javaHome = 'C:\\Program Files\\Microsoft\\jdk-21.0.13.21-hotspot';
    if (existsSync(javaHome)) env.JAVA_HOME = javaHome;
  }
  env.REA_ANALYSIS_PROVIDER = env.REA_ANALYSIS_PROVIDER || 'ghidra';
  return env;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  usage();
  process.exit(0);
}

if (!FORMATS.has(options.format)) {
  fail(`Unsupported format: ${options.format}`);
}
if (options.paths.length !== 1) {
  usage();
  fail('Provide exactly one executable path');
}

const target = path.resolve(options.paths[0]);
if (!existsSync(target) || !statSync(target).isFile()) {
  fail(`Not a file: ${target}`);
}

const args = options.deep
  ? ['inspect', target, '--provider', 'ghidra', '--format', options.format]
  : ['inspect-artifact', target, '--format', options.format];

const result = runRea(resolveReaCli(), args, analysisEnv());
if (result.error) {
  fail(`Could not start REA: ${result.error.message}. Install it with npm install --global rea-agents.`);
}

if (result.stdout) {
  if (options.out) {
    const outPath = path.resolve(options.out);
    writeFileSync(outPath, result.stdout, 'utf8');
    console.error(`read-exe: wrote ${outPath}`);
  } else {
    process.stdout.write(result.stdout);
  }
}
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);
