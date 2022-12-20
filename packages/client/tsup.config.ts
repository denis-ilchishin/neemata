import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./index.ts'],
  format: ['esm'],
  dts: {
    resolve: true,
    entry: ['./index.ts'],
    compilerOptions: {
      moduleResolution: 'node',
    },
  },
  sourcemap: true,
  clean: true,
  target: 'es2022',
})
