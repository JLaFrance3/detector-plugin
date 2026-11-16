import { defineConfig } from 'vitest/config';

// Unit tests for framework-free code in src/ (shared logic, service worker, offscreen helpers).
// Angular component tests run through `ng test`.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    globals: true,
    environment: 'node',
    passWithNoTests: true,
  },
});
