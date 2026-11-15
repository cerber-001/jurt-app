import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: [['text', { skipFull: false }]],
    },
  },
  // JSX для .tsx-файлов (rounds.tsx) — как в приложении: Preact
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
})
