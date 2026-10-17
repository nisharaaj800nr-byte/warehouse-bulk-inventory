import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the built React panel into server/public so the server can serve the
 * UI and the API from one origin. Run through `npm run build:panel`.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../../app/dist');
const destination = path.resolve(here, '../public');

if (!fs.existsSync(source)) {
  console.error(`Panel build not found at ${source}. Run "npm --prefix ../app run build" first.`);
  process.exit(1);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true });

console.log(`panel copied: ${source} -> ${destination}`);
