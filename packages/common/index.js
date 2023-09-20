// lib/api.ts
class ApiError extends Error {
  code;
  data;
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
  get message() {
    return this.code + super.message;
  }
  toString() {
    return `${this.code} ${this.message}`;
  }
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.data
    };
  }
}
var STREAM_ID_PREFIX = "neemata:stream:";
// lib/binary.ts
function concat(...buffers) {
  const totalLength = buffers.filter(Boolean).reduce((acc, buffer) => acc + buffer.byteLength, 0);
  let offset = 0;
  const final = new ArrayBuffer(totalLength);
  const view = new Uint8Array(final);
  for (const buffer of buffers) {
    view.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return final;
}
var textEncoder = new TextEncoder;
var textDecoder = new TextDecoder;
var encodeText = (val) => textEncoder.encode(val);
var decodeText = (buf) => textDecoder.decode(buf);
var encodeNumber = (val, viewClass) => {
  const buffer = new ArrayBuffer(viewClass.BYTES_PER_ELEMENT);
  const view = new viewClass(buffer);
  view.set(new viewClass([val]), 0);
  return buffer;
};
var decodeNumber = (buf, viewClass) => {
  return new viewClass(buf.slice(0, viewClass.BYTES_PER_ELEMENT))[0];
};
var encodeBigNumber = (val, viewClass) => {
  const buffer = new ArrayBuffer(viewClass.BYTES_PER_ELEMENT);
  const view = new viewClass(buffer);
  view.set(new viewClass([BigInt(val)]), 0);
  return buffer;
};
var decodeBigNumber = (buf, viewClass) => {
  return Number(new viewClass(buf.slice(0, viewClass.BYTES_PER_ELEMENT))[0]);
};
var StreamsPayloadView = Uint32Array;
// lib/enums.ts
var ErrorCode = Object.freeze({
  ValidationError: "VALIDATION_ERROR",
  BadRequest: "BAD_REQUEST",
  NotFound: "NOT_FOUND",
  Forbidden: "FORBIDDEN",
  Unauthorized: "UNAUTHORIZED",
  InternalServerError: "INTERNAL_SERVER_ERROR",
  RequestTimeout: "REQUEST_TIMEOUT",
  GatewayTimeout: "GATEWAY_TIMEOUT",
  ServiceUnavailable: "SERVICE_UNAVAILABLE",
  ClientRequestError: "CLIENT_REQUEST_ERROR",
  StreamAborted: "STREAM_ABORTED",
  StreamNotFound: "STREAM_NOT_FOUND",
  StreamAlreadyInitalized: "STREAM_ALREADY_INITALIZED"
});
var MessageType = Object.freeze({
  RPC: 1,
  STREAM_TERMINATE: 2,
  STREAM_PUSH: 3,
  STREAM_PULL: 4,
  STREAM_END: 5
});
export {
  encodeText,
  encodeNumber,
  encodeBigNumber,
  decodeText,
  decodeNumber,
  decodeBigNumber,
  concat,
  StreamsPayloadView,
  STREAM_ID_PREFIX,
  MessageType,
  ErrorCode,
  ApiError
};
