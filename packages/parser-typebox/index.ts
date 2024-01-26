import { BaseParser } from '@neematajs/application'
import { TSchema } from '@sinclair/typebox'
import { Value, ValueError } from '@sinclair/typebox/value'

export class TypeboxParserError extends Error {
  constructor(
    readonly data: ValueError[],
    message?: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export class TypeboxParser extends BaseParser {
  constructor(private readonly checkBeforeCast = true) {
    super()
  }

  parse(schema: TSchema, data: any) {
    if (this.checkBeforeCast && !Value.Check(schema, data)) {
      throw new TypeboxParserError(Array.from(Value.Errors(schema, data)))
    }

    return Value.Cast(schema, data)
  }

  toJsonSchema(schema: TSchema) {
    return schema
  }
}
