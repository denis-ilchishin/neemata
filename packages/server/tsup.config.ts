import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.js'],
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  minify: false,
  format: 'cjs',
})
