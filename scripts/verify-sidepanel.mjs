import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, '.output/chrome-mv3/manifest.json');
const contentPath = resolve(root, 'entrypoints/content.ts');
const backgroundPath = resolve(root, 'entrypoints/background.ts');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const permissions = new Set(manifest.permissions || []);

assert(manifest.side_panel?.default_path === 'sidepanel.html', 'manifest must expose sidepanel.html as the default side panel');
assert(permissions.has('sidePanel'), 'manifest must include the sidePanel permission');
assert(!manifest.action?.default_popup, 'extension action must not register a popup because the action click opens the side panel');

const contentSource = await readFile(contentPath, 'utf8');
assert(!contentSource.includes('mountAssistant();'), 'content script must not mount the floating assistant panel by default');

const backgroundSource = await readFile(backgroundPath, 'utf8');
assert(backgroundSource.includes('openPanelOnActionClick'), 'background must open the side panel from the extension action');

console.log('Side panel verification passed.');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
