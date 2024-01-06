import { register } from 'node:module'

register(new URL('./swc-loader.mjs', import.meta.url).toString())
