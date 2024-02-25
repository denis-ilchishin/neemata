import { esbuildPluginFilePathExtensions } from 'esbuild-plugin-file-path-extensions'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./index.ts', './lib/**/*'],
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  minify: false,
  bundle: true,
  format: ['cjs', 'esm'],
  platform: 'neutral',
  external: ['events'],
  esbuildPlugins: [
    esbuildPluginFilePathExtensions({
      esmExtension: 'mjs',
      esm: ({ format }) => (format === 'esm' ? true : false),
    }),
  ],
})
