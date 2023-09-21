import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts'],
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  minify: true,
  format: 'esm',
  bundle: true,
  noExternal: ['events'],
  platform: 'browser',
})
