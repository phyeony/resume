/// <reference types="vitest" />
import { existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `vite --mode preview-local`: replace the Firebase-backed modules with their `.local.ts` siblings
 * (localStorage), so the whole app runs offline without sign-in.
 */
const SWAPPED = ['/src/pages/admin/store.ts', '/src/pages/admin/auth.ts', '/src/data/publicStore.ts'];

function localBackend(): Plugin {
  return {
    name: 'local-backend',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || !SWAPPED.some((f) => resolved.id.endsWith(f))) return null;
      const local = resolved.id.replace(/\.ts$/, '.local.ts');
      return existsSync(local) ? local : null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'preview-local' ? [localBackend()] : [])],
  build: { outDir: 'dist' },
  test: { environment: 'node' },
}));
