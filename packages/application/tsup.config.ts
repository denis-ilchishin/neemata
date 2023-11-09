import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts', 'lib/**/*.ts'],
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  minify: false,
  format: 'cjs',
  bundle: false,
  platform: 'node',
  target: 'node18',
})
