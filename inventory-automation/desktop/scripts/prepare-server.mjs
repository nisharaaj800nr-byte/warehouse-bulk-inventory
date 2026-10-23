import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.resolve(here, '../../server');
const out = path.resolve(here, '../server-runtime');

if (!fs.existsSync(path.join(server, 'dist', 'index.js'))) {
  console.error('Server build not found. Run "npm run build" in the server folder first.');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(server, 'dist'), path.join(out, 'dist'), { recursive: true });
fs.copyFileSync(path.join(server, 'package.json'), path.join(out, 'package.json'));
fs.copyFileSync(path.join(server, 'package-lock.json'), path.join(out, 'package-lock.json'));
fs.cpSync(path.join(server, 'public'), path.join(out, 'public'), { recursive: true });

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npmCmd, ['ci', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: out,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
console.log('server runtime ready:', out);
