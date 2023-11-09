#!/usr/bin/env node --loader tsx/esm --no-warnings
import { compile } from 'json-schema-to-typescript'
import fsp from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const toBool = [() => true, () => false]
const { values } = parseArgs({
  options: {
    url: {
      type: 'string',
    },
    output: {
      type: 'string',
    },
  },
})

const { url } = values
const output = resolve(values.output)
const outpurDir = dirname(output)

const dirExists = await fsp.access(outpurDir).then(...toBool)
if (!dirExists) await fsp.mkdir(dirname(output), { recursive: true })

const { response: schemas } = await fetch(url).then((res) => res.json())

/**@type {(...args: any[]) => import('json-schema-to-typescript').JSONSchema} */
const metadataSchema = (metadata) => {
  const keys = Object.keys(metadata)
  const properties = {}
  for (const key of keys) {
    const type = typeof metadata
    const oneOf = [metadata[key]]
    properties[key] = { type, oneOf }
  }
  return {
    type: 'object',
    properties,
    required: keys,
    additionalProperties: false,
  }
}

/**@type {(...args: any[]) => import('json-schema-to-typescript').JSONSchema} */
const procedureSchema = (input, output, metadata) => {
  const required = new Set(['metadata', 'output', 'input'])

  // "zod-to-json-schema" .optinal() workaround
  const isZodToJsonSchemaOptional = (schema) => {
    return typeof schema.not === 'object' && !Object.keys(schema.not).length
  }
  if (input.anyOf) {
    if (input.anyOf.some(isZodToJsonSchemaOptional)) required.delete('input')
    const index = input.anyOf.findIndex(isZodToJsonSchemaOptional)
    if (index !== -1) input.anyOf.splice(index, 1)
  }
  if (output.anyOf) {
    if (output.anyOf.some(isZodToJsonSchemaOptional)) required.delete('output')
    const index = output.anyOf.findIndex(isZodToJsonSchemaOptional)
    if (index !== -1) output.anyOf.splice(index, 1)
  }

  return {
    properties: {
      input,
      output,
      metadata: metadataSchema(metadata),
    },
    required: Array.from(required),
    additionalProperties: false,
  }
}

/**@type {import('json-schema-to-typescript').JSONSchema} */
const proceduresSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
  required: [],
}
for (const [procedure, { input, output, metadata }] of Object.entries(
  schemas
)) {
  proceduresSchema.properties[procedure] = procedureSchema(
    input,
    output,
    metadata
  )
  proceduresSchema.required = [...proceduresSchema.required, procedure]
}

const result = await compile(proceduresSchema, 'Api')
await fsp.writeFile(
  output,
  result.replace('interface Api', 'interface Api<Stream = any>')
)
