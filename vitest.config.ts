import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles .vue files so components can be rendered to strings in tests.
  plugins: [vue()],
  test: {
    include: ['apps/web/src/**/*.test.ts', 'apps/web/*.test.ts', 'packages/**/*.test.ts'],
    // Used only by `npm run test:coverage`; scoria reads coverage/lcov.info.
    coverage: {
      provider: 'v8',
      // lcovonly: scoria reads only lcov.info. The HTML report's scripts once made madge fail; .madgerc fixes that (Issue #44).
      reporter: ['lcovonly', 'text-summary'],
      reportsDirectory: 'coverage',
      // Implementation files only; tool configs (vite/vitest/eslint) are left out.
      include: [
        'apps/web/src/**/*.{ts,vue}',
        'apps/web/vite-plugin-settings.ts',
        'apps/web/vite-plugin-snapshot.ts',
        'packages/*/src/**/*.ts',
        'packages/collector/collector.config.ts',
        'guild.settings.ts',
        'assets/*/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.test-util.ts', '**/*.d.ts'],
    },
  },
});
