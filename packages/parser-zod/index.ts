import { BaseParser } from '@neemata/application'
import { ZodSchema, any } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ZodParser extends BaseParser {
  parse(schema: ZodSchema, data: any) {
    return schema.parseAsync(data)
  }

  toJsonSchema(schema: ZodSchema) {
    return zodToJsonSchema(schema ?? any().optional(), { $refStrategy: 'seen' })
  }
}
