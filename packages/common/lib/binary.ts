const utf8decoder = new TextDecoder()
const utf8encoder = new TextEncoder()

export type BinaryTypes = {
  Int8: number
  Int16: number
  Int32: number
  Uint8: number
  Uint16: number
  Uint32: number
  Float32: number
  Float64: number
  BigInt64: bigint
  BigUint64: bigint
}

export const encodeNumber = <T extends keyof BinaryTypes>(
  value: BinaryTypes[T],
  type: T,
  littleEndian = false,
) => {
  const bytesNeeded = globalThis[`${type}Array`].BYTES_PER_ELEMENT
  const ab = new ArrayBuffer(bytesNeeded)
  const dv = new DataView(ab)
  dv[`set${type}`](0, value as never, littleEndian)
  return ab
}

export const decodeNumber = <T extends keyof BinaryTypes>(
  buffer: ArrayBuffer,
  type: T,
  offset = 0,
  littleEndian = false,
): BinaryTypes[T] => {
  const view = new DataView(buffer)
  return view[`get${type}`](offset, littleEndian) as BinaryTypes[T]
}

export const encodeText = (text: string) => utf8encoder.encode(text)
export const decodeText = (buffer: ArrayBuffer) => utf8decoder.decode(buffer)
export const concat = (...buffers: ArrayBuffer[]) => {
  const totalLength = buffers.reduce(
    (acc, buffer) => acc + buffer.byteLength,
    0,
  )
  const view = new Uint8Array(totalLength)
  let offset = 0
  for (const buffer of buffers) {
    view.set(new Uint8Array(buffer), offset)
    offset += buffer.byteLength
  }
  return view.buffer
}
