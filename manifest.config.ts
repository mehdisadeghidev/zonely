import { readFileSync } from 'node:fs';
import { defineManifest } from '@crxjs/vite-plugin';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const icons = {
  16: 'icons/icon16.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png'
};

export default defineManifest({
  manifest_version: 3,
  name: 'Zonely',
  version,
  description: 'Automatically changes browser timezone to match your IP location.',
  permissions: ['storage', 'alarms', 'webNavigation', 'tabs'],
  host_permissions: ['https://freeipapi.com/*', 'https://ipwho.is/*', '<all_urls>'],
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_start',
      all_frames: true
    }
  ],
  action: { default_popup: 'src/popup/index.html', default_icon: icons },
  options_page: 'src/options/index.html',
  icons
});
