#!/usr/bin/env node --import tsx/esm --watch --no-warnings

process.env.NEEMATA_WATCH = '1'

import('./start.mjs')
