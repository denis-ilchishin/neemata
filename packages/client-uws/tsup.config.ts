import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts'],
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  minify: false,
  bundle: false,
  format: ['cjs', 'esm'],
  platform: 'neutral',
  external: ['events'],
})
