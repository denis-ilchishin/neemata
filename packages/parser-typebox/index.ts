import { BaseParser } from '@neemata/application'
import { TSchema } from '@sinclair/typebox'
import { Value, ValueError } from '@sinclair/typebox/value'

export class TypeboxParserError extends Error {
  constructor(
    readonly data: ValueError[],
    message?: string,
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

export class TypeboxParser extends BaseParser {
  parse(schema: TSchema, data: any) {
    if (Value.Check(schema, data)) {
      return Value.Cast(schema, data)
    }

    throw new TypeboxParserError(Array.from(Value.Errors(schema, data)))
  }

  toJsonSchema(schema: TSchema) {
    return schema
  }
}
