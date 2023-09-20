// /Users/den/Projects/ilchishin/neemata/packages/client/node_modules/@neemata/common/index.js
var concat = function(...buffers) {
  const totalLength = buffers.filter(Boolean).reduce((acc, buffer) => acc + buffer.byteLength, 0);
  let offset = 0;
  const final = new ArrayBuffer(totalLength);
  const view = new Uint8Array(final);
  for (const buffer of buffers) {
    view.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return final;
};

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
var decodeBigNumber = (buf, viewClass) => {
  return Number(new viewClass(buf.slice(0, viewClass.BYTES_PER_ELEMENT))[0]);
};
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

// node:events
var x = function(t) {
  console && console.warn && console.warn(t);
};
var o = function() {
  o.init.call(this);
};
var v = function(t) {
  if (typeof t != "function")
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof t);
};
var m = function(t) {
  return t._maxListeners === undefined ? o.defaultMaxListeners : t._maxListeners;
};
var y = function(t, e, n, r) {
  var i, f, s;
  if (v(n), f = t._events, f === undefined ? (f = t._events = Object.create(null), t._eventsCount = 0) : (f.newListener !== undefined && (t.emit("newListener", e, n.listener ? n.listener : n), f = t._events), s = f[e]), s === undefined)
    s = f[e] = n, ++t._eventsCount;
  else if (typeof s == "function" ? s = f[e] = r ? [n, s] : [s, n] : r ? s.unshift(n) : s.push(n), i = m(t), i > 0 && s.length > i && !s.warned) {
    s.warned = true;
    var u = new Error("Possible EventEmitter memory leak detected. " + s.length + " " + String(e) + " listeners added. Use emitter.setMaxListeners() to increase limit");
    u.name = "MaxListenersExceededWarning", u.emitter = t, u.type = e, u.count = s.length, x(u);
  }
  return t;
};
var C = function() {
  if (!this.fired)
    return this.target.removeListener(this.type, this.wrapFn), this.fired = true, arguments.length === 0 ? this.listener.call(this.target) : this.listener.apply(this.target, arguments);
};
var g = function(t, e, n) {
  var r = { fired: false, wrapFn: undefined, target: t, type: e, listener: n }, i = C.bind(r);
  return i.listener = n, r.wrapFn = i, i;
};
var _ = function(t, e, n) {
  var r = t._events;
  if (r === undefined)
    return [];
  var i = r[e];
  return i === undefined ? [] : typeof i == "function" ? n ? [i.listener || i] : [i] : n ? R(i) : b(i, i.length);
};
var w = function(t) {
  var e = this._events;
  if (e !== undefined) {
    var n = e[t];
    if (typeof n == "function")
      return 1;
    if (n !== undefined)
      return n.length;
  }
  return 0;
};
var b = function(t, e) {
  for (var n = new Array(e), r = 0;r < e; ++r)
    n[r] = t[r];
  return n;
};
var j = function(t, e) {
  for (;e + 1 < t.length; e++)
    t[e] = t[e + 1];
  t.pop();
};
var R = function(t) {
  for (var e = new Array(t.length), n = 0;n < e.length; ++n)
    e[n] = t[n].listener || t[n];
  return e;
};
var a = typeof Reflect == "object" ? Reflect : null;
var d = a && typeof a.apply == "function" ? a.apply : function(e, n, r) {
  return Function.prototype.apply.call(e, n, r);
};
var l;
a && typeof a.ownKeys == "function" ? l = a.ownKeys : Object.getOwnPropertySymbols ? l = function(e) {
  return Object.getOwnPropertyNames(e).concat(Object.getOwnPropertySymbols(e));
} : l = function(e) {
  return Object.getOwnPropertyNames(e);
};
var L = Number.isNaN || function(e) {
  return e !== e;
};
o.EventEmitter = o;
o.prototype._events = undefined;
o.prototype._eventsCount = 0;
o.prototype._maxListeners = undefined;
var h = 10;
Object.defineProperty(o, "defaultMaxListeners", { enumerable: true, get: function() {
  return h;
}, set: function(t) {
  if (typeof t != "number" || t < 0 || L(t))
    throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + t + ".");
  h = t;
} });
o.init = function() {
  (this._events === undefined || this._events === Object.getPrototypeOf(this)._events) && (this._events = Object.create(null), this._eventsCount = 0), this._maxListeners = this._maxListeners || undefined;
};
o.prototype.setMaxListeners = function(e) {
  if (typeof e != "number" || e < 0 || L(e))
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + e + ".");
  return this._maxListeners = e, this;
};
o.prototype.getMaxListeners = function() {
  return m(this);
};
o.prototype.emit = function(e) {
  for (var n = [], r = 1;r < arguments.length; r++)
    n.push(arguments[r]);
  var i = e === "error", f = this._events;
  if (f !== undefined)
    i = i && f.error === undefined;
  else if (!i)
    return false;
  if (i) {
    var s;
    if (n.length > 0 && (s = n[0]), s instanceof Error)
      throw s;
    var u = new Error("Unhandled error." + (s ? " (" + s.message + ")" : ""));
    throw u.context = s, u;
  }
  var c = f[e];
  if (c === undefined)
    return false;
  if (typeof c == "function")
    d(c, this, n);
  else
    for (var p = c.length, O = b(c, p), r = 0;r < p; ++r)
      d(O[r], this, n);
  return true;
};
o.prototype.addListener = function(e, n) {
  return y(this, e, n, false);
};
o.prototype.on = o.prototype.addListener;
o.prototype.prependListener = function(e, n) {
  return y(this, e, n, true);
};
o.prototype.once = function(e, n) {
  return v(n), this.on(e, g(this, e, n)), this;
};
o.prototype.prependOnceListener = function(e, n) {
  return v(n), this.prependListener(e, g(this, e, n)), this;
};
o.prototype.removeListener = function(e, n) {
  var r, i, f, s, u;
  if (v(n), i = this._events, i === undefined)
    return this;
  if (r = i[e], r === undefined)
    return this;
  if (r === n || r.listener === n)
    --this._eventsCount === 0 ? this._events = Object.create(null) : (delete i[e], i.removeListener && this.emit("removeListener", e, r.listener || n));
  else if (typeof r != "function") {
    for (f = -1, s = r.length - 1;s >= 0; s--)
      if (r[s] === n || r[s].listener === n) {
        u = r[s].listener, f = s;
        break;
      }
    if (f < 0)
      return this;
    f === 0 ? r.shift() : j(r, f), r.length === 1 && (i[e] = r[0]), i.removeListener !== undefined && this.emit("removeListener", e, u || n);
  }
  return this;
};
o.prototype.off = o.prototype.removeListener;
o.prototype.removeAllListeners = function(e) {
  var n, r, i;
  if (r = this._events, r === undefined)
    return this;
  if (r.removeListener === undefined)
    return arguments.length === 0 ? (this._events = Object.create(null), this._eventsCount = 0) : r[e] !== undefined && (--this._eventsCount === 0 ? this._events = Object.create(null) : delete r[e]), this;
  if (arguments.length === 0) {
    var f = Object.keys(r), s;
    for (i = 0;i < f.length; ++i)
      s = f[i], s !== "removeListener" && this.removeAllListeners(s);
    return this.removeAllListeners("removeListener"), this._events = Object.create(null), this._eventsCount = 0, this;
  }
  if (n = r[e], typeof n == "function")
    this.removeListener(e, n);
  else if (n !== undefined)
    for (i = n.length - 1;i >= 0; i--)
      this.removeListener(e, n[i]);
  return this;
};
o.prototype.listeners = function(e) {
  return _(this, e, true);
};
o.prototype.rawListeners = function(e) {
  return _(this, e, false);
};
o.listenerCount = function(t, e) {
  return typeof t.listenerCount == "function" ? t.listenerCount(e) : w.call(t, e);
};
o.prototype.listenerCount = w;
o.prototype.eventNames = function() {
  return this._eventsCount > 0 ? l(this._events) : [];
};
var P = o.prototype;

// index.ts
var STREAM_ID_KEY = Symbol();
var nextStreamId = 1;
var nextCallId = 1;
var nextReconnect = 0;
var calls = new Map;
var streams = new Map;
var internalEvents = {
  [MessageType.RPC]: Symbol(),
  [MessageType.STREAM_PULL]: Symbol(),
  [MessageType.STREAM_END]: Symbol(),
  [MessageType.STREAM_PUSH]: Symbol(),
  [MessageType.STREAM_TERMINATE]: Symbol()
};
var createClient = (options) => {
  let ws;
  let isHealthy = false;
  let isConnected = false;
  let autoreconnect = options.autoreconnect ?? true;
  const emitter = new o;
  const httpUrl = new URL(`${options.https ? "https" : "http"}://${options.host}`, options.basePath);
  const wsUrl = new URL(options.basePath ?? "/", `${options.https ? "wss" : "ws"}://${options.host}`);
  const healthCheck = async () => {
    while (!isHealthy) {
      try {
        const { ok } = await fetch(httpUrl + "health");
        isHealthy = ok;
      } catch (e) {
      }
      nextReconnect = Math.min(nextReconnect + 1, 10);
      await new Promise((r) => setTimeout(r, nextReconnect * 1000));
    }
    emitter.emit("healthy");
  };
  const connect = async () => {
    autoreconnect = options.autoreconnect ?? true;
    await healthCheck();
    ws = new WebSocket(wsUrl + "api");
    ws.binaryType = "arraybuffer";
    ws.onmessage = (event) => {
      const buffer = event.data;
      const type = decodeNumber(buffer, Uint8Array);
      emitter.emit(internalEvents[type], ws, buffer.slice(Uint8Array.BYTES_PER_ELEMENT));
    };
    ws.onopen = (event) => {
      isConnected = true;
      emitter.emit("connect");
      nextReconnect = 0;
    };
    ws.onclose = (event) => {
      isConnected = false;
      isHealthy = false;
      emitter.emit("disconnect");
      clear();
      if (autoreconnect)
        connect();
    };
    ws.onerror = (event) => {
      isHealthy = false;
    };
    await forEvent(emitter, "connect");
    return client;
  };
  const disconnect = () => {
    autoreconnect = false;
    ws.close(1000);
    return forEvent(emitter, "disconnect");
  };
  const clear = (error) => {
    for (const call of calls.values()) {
      const [, reject, timer] = call;
      clearTimeout(timer);
      reject(error);
    }
    calls.clear();
    for (const stream of streams.values())
      stream.destroy(error);
    streams.clear();
  };
  const send = async (type, payload) => {
    if (!isConnected)
      await forEvent(emitter, "connect");
    ws.send(concat(encodeNumber(type, Uint8Array), payload));
  };
  const rpc = (procedure, payload, timeout = options.timeout) => {
    const callId = nextCallId++;
    const streams2 = [];
    const callPayload = encodeText(JSON.stringify({ callId, procedure, payload }, (key, value) => {
      if (value && typeof value[STREAM_ID_KEY] === "number") {
        const id = value[STREAM_ID_KEY];
        const meta = value.meta;
        streams2.push({ id, ...meta });
        return STREAM_ID_PREFIX + id;
      }
      return value;
    }));
    const streamsPayload = encodeText(JSON.stringify(streams2));
    const streamDataLength = encodeNumber(streamsPayload.byteLength, Uint32Array);
    send(MessageType.RPC, concat(streamDataLength, streamsPayload, callPayload));
    const timer = setTimeout(() => {
      const call = calls.get(callId);
      if (call) {
        const [, reject] = call;
        reject(new ApiError(ErrorCode.RequestTimeout, "Request timeout"));
        calls.delete(callId);
      }
    }, timeout || 15000);
    return new Promise((res, rej) => calls.set(callId, [res, rej, timer]));
  };
  emitter.on(internalEvents[MessageType.STREAM_PULL], (ws2, buffer) => {
    const id = decodeNumber(buffer.slice(0, Uint32Array.BYTES_PER_ELEMENT), Uint32Array);
    const received = decodeBigNumber(buffer.slice(Uint32Array.BYTES_PER_ELEMENT, BigUint64Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT), BigUint64Array);
    const stream = streams.get(id);
    stream.push(received);
  });
  emitter.on(internalEvents[MessageType.RPC], (ws2, buffer) => {
    const { callId, response, error } = JSON.parse(decodeText(buffer));
    const call = calls.get(callId);
    if (call) {
      const [resolve, reject, timer] = call;
      clearTimeout(timer);
      calls.delete(callId);
      if (error)
        reject(new ApiError(error.code, error.message, error.data));
      else
        resolve(response);
    }
  });
  const client = Object.assign(emitter, {
    connect,
    disconnect,
    rpc,
    createStream: createStream.bind(undefined, send)
  });
  return client;
};
var createStream = (send, file) => {
  const emitter = new o;
  const reader = file.stream().getReader();
  const id = nextStreamId++;
  const meta = {
    name: file.name,
    size: file.size,
    type: file.type
  };
  let paused = true;
  let processed = 0;
  const flow = async () => {
    if (paused)
      await forEvent(emitter, "resume");
  };
  const push = async (received) => {
    if (!processed && paused && !received) {
      resume();
      emitter.emit("start");
    }
    processed += received;
    try {
      await flow();
      const { done, value } = await reader.read();
      if (done) {
        send(MessageType.STREAM_END, encodeNumber(id, Uint32Array));
        reader.cancel();
        emitter.emit("end");
      } else {
        send(MessageType.STREAM_PUSH, concat(encodeNumber(id, Uint32Array), value));
        emitter.emit("progress", meta.size, received);
      }
    } catch (e) {
      send(MessageType.STREAM_TERMINATE, encodeNumber(id, Uint32Array));
      destroy(e);
    }
  };
  const destroy = (error) => {
    streams.delete(id);
    reader.cancel(error);
    if (error)
      emitter.emit("error", error);
    emitter.emit("close");
  };
  const pause = () => {
    paused = true;
    emitter.emit("pause");
  };
  const resume = () => {
    paused = false;
    emitter.emit("resume");
  };
  const stream = {
    id,
    meta,
    push,
    destroy
  };
  streams.set(id, stream);
  return Object.assign(emitter, { [STREAM_ID_KEY]: id, meta, pause, resume });
};
var forEvent = (emitter, event) => new Promise((r) => emitter.once(event, r));
export {
  createClient
};
