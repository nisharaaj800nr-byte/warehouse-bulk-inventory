import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../../server/public');
const destination = path.resolve(here, '../panel');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error(`Panel build not found at ${source}. Run "npm run build:panel" in the server folder first.`);
  process.exit(1);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true });

console.log(`panel copied into desktop shell: ${destination}`);
