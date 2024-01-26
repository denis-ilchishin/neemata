import { Async, BaseParser } from '@neemata/application'
import { ZodErrorMap, ZodSchema, any } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ZodParser extends BaseParser {
  constructor(
    private readonly customErrorMap?: (context: any) => Async<ZodErrorMap>,
  ) {
    super()
  }

  async parse(schema: ZodSchema, data: any, context: any) {
    const errorMap = await this.customErrorMap?.(context)
    return await schema.parseAsync(data, { errorMap })
  }

  toJsonSchema(schema: ZodSchema) {
    return zodToJsonSchema(schema ?? any().optional(), { $refStrategy: 'seen' })
  }
}
