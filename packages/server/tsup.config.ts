import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.js', 'lib/*'],
  outDir: 'dist',
  splitting: false,
  sourcemap: false,
  minify: false,
  format: 'cjs',
  bundle: false,
  platform: 'node',
  target: 'node18',
})
