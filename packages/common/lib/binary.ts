export type ViewConstructor =
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor

const textEncoder = new global.TextEncoder()
const textDecoder = new global.TextDecoder()

export function concat(...buffers: ArrayBuffer[]) {
  const totalLength = buffers
    .filter(Boolean)
    .reduce((acc, buffer) => acc + buffer.byteLength, 0)
  let offset = 0
  const final = new ArrayBuffer(totalLength)
  const view = new Uint8Array(final)
  for (const buffer of buffers) {
    view.set(new Uint8Array(buffer), offset)
    offset += buffer.byteLength
  }
  return final
}

export const encodeText = (val: string) => textEncoder.encode(val)
export const decodeText = (buf: ArrayBuffer) => textDecoder.decode(buf)

export const encodeNumber = (val: number, viewClass: ViewConstructor) => {
  const buffer = new ArrayBuffer(viewClass.BYTES_PER_ELEMENT)
  const view = new viewClass(buffer)
  view.set(new viewClass([val]), 0)
  return buffer
}

export const decodeNumber = (buf: ArrayBuffer, viewClass: ViewConstructor) => {
  return new viewClass(buf.slice(0, viewClass.BYTES_PER_ELEMENT))[0]
}

export const encodeBigNumber = (
  val: number,
  viewClass: BigInt64ArrayConstructor | BigUint64ArrayConstructor
) => {
  const buffer = new ArrayBuffer(viewClass.BYTES_PER_ELEMENT)
  const view = new viewClass(buffer)
  view.set(new viewClass([BigInt(val)]), 0)
  return buffer
}

export const decodeBigNumber = (
  buf: ArrayBuffer,
  viewClass: BigInt64ArrayConstructor | BigUint64ArrayConstructor
) => {
  return Number(new viewClass(buf.slice(0, viewClass.BYTES_PER_ELEMENT))[0])
}

export const StreamsPayloadView = Uint32Array
