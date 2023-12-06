#!/usr/bin/env node --loader tsx/esm --watch --no-warnings

process.env.NEEMATA_WATCH = '1'

import('./start.mjs')
