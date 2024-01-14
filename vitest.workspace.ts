import tsconfigPaths from 'vite-tsconfig-paths'
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    plugins: [tsconfigPaths()],
    test: {
      include: ['**/*.spec.ts'],
    },
  },
])
