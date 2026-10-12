// Copies the web app (one folder up) into www/ so Capacitor can bundle it inside the iPhone app.
// The web app stays the single source of truth: edit ../index.html, never www/.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(here, '..', 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) cpSync(join(root, f), join(out, f));
cpSync(join(root, 'icons'), join(out, 'icons'), { recursive: true });
cpSync(join(root, 'sounds', 'fluff-chime.wav'), join(out, 'fluff-chime.wav')); // notification sound
console.log('Copied the web app into', out);
