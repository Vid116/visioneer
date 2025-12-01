import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run tests in sequence to avoid database conflicts
    sequence: {
      hooks: 'stack',
    },
    // Coverage settings (optional)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/memory/**', 'src/retrieval/**'],
      exclude: ['node_modules', 'tests'],
    },
  },
});
