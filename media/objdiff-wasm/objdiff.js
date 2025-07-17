import { log } from './wasi-logging.js';
const base64Compile = (str) => WebAssembly.compile(Uint8Array.from(atob(str), (b) => b.charCodeAt(0)));
function clampGuest(i, min, max) {
  if (i < min || i > max) throw new TypeError(`must be between ${min} and ${max}`);
  return i;
}
class ComponentError extends Error {
  constructor(value) {
    const enumerable = 'string' != typeof value;
    super(enumerable ? `${String(value)} (see error.payload)` : value);
    Object.defineProperty(this, 'payload', {
      value,
      enumerable,
    });
  }
}
let dv = new DataView(new ArrayBuffer());
const dataView = (mem) => (dv.buffer === mem.buffer ? dv : (dv = new DataView(mem.buffer)));
const emptyFunc = () => {};
const fetchCompile = (url) => fetch(url).then(WebAssembly.compileStreaming);
function finalizationRegistryCreate(unregister) {
  if ('undefined' == typeof FinalizationRegistry)
    return {
      unregister() {},
    };
  return new FinalizationRegistry(unregister);
}
const handleTables = [];
const instantiateCore = WebAssembly.instantiate;
const T_FLAG = 1073741824;
function rscTableCreateOwn(table, rep) {
  const free = table[0] & ~T_FLAG;
  if (0 === free) {
    table.push(0);
    table.push(rep | T_FLAG);
    return (table.length >> 1) - 1;
  }
  table[0] = table[free << 1];
  table[free << 1] = 0;
  table[(free << 1) + 1] = rep | T_FLAG;
  return free;
}
function rscTableRemove(table, handle) {
  const scope = table[handle << 1];
  const val = table[(handle << 1) + 1];
  const own = (val & T_FLAG) !== 0;
  const rep = val & ~T_FLAG;
  if (0 === val || (scope & T_FLAG) !== 0) throw new TypeError('Invalid handle');
  table[handle << 1] = table[0] | T_FLAG;
  table[0] = handle | T_FLAG;
  return {
    rep,
    scope,
    own,
  };
}
const symbolRscHandle = Symbol('handle');
const symbolDispose = Symbol.dispose || Symbol.for('dispose');
function toUint32(val) {
  return val >>> 0;
}
const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();
let utf8EncodedLen = 0;
function utf8Encode(s, realloc, memory) {
  if ('string' != typeof s) throw new TypeError('expected a string');
  if (0 === s.length) {
    utf8EncodedLen = 0;
    return 1;
  }
  let buf = utf8Encoder.encode(s);
  let ptr = realloc(0, 0, 1, buf.length);
  new Uint8Array(memory.buffer).set(buf, ptr);
  utf8EncodedLen = buf.length;
  return ptr;
}
let exports0;
let exports1;
let memory0;
function trampoline3(arg0, arg1, arg2, arg3, arg4) {
  let enum0;
  switch (arg0) {
    case 0:
      enum0 = 'trace';
      break;
    case 1:
      enum0 = 'debug';
      break;
    case 2:
      enum0 = 'info';
      break;
    case 3:
      enum0 = 'warn';
      break;
    case 4:
      enum0 = 'error';
      break;
    case 5:
      enum0 = 'critical';
      break;
    default:
      throw new TypeError('invalid discriminant specified for Level');
  }
  var ptr1 = arg1;
  var len1 = arg2;
  var result1 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr1, len1));
  var ptr2 = arg3;
  var len2 = arg4;
  var result2 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr2, len2));
  log(enum0, result1, result2);
}
let exports2;
let postReturn0;
let realloc0;
let postReturn1;
let postReturn2;
let postReturn3;
let postReturn4;
let postReturn5;
let postReturn6;
let postReturn7;
let postReturn8;
const handleTable0 = [T_FLAG, 0];
const finalizationRegistry0 = finalizationRegistryCreate((handle) => {
  const { rep } = rscTableRemove(handleTable0, handle);
  exports0['3'](rep);
});
handleTables[0] = handleTable0;
const trampoline0 = rscTableCreateOwn.bind(null, handleTable0);
const handleTable1 = [T_FLAG, 0];
const finalizationRegistry1 = finalizationRegistryCreate((handle) => {
  const { rep } = rscTableRemove(handleTable1, handle);
  exports0['2'](rep);
});
handleTables[1] = handleTable1;
const trampoline1 = rscTableCreateOwn.bind(null, handleTable1);
const handleTable2 = [T_FLAG, 0];
const finalizationRegistry2 = finalizationRegistryCreate((handle) => {
  const { rep } = rscTableRemove(handleTable2, handle);
  exports0['1'](rep);
});
handleTables[2] = handleTable2;
const trampoline2 = rscTableCreateOwn.bind(null, handleTable2);
let exports1Init;
function init(arg0) {
  var val0 = arg0;
  let enum0;
  switch (val0) {
    case 'trace':
      enum0 = 0;
      break;
    case 'debug':
      enum0 = 1;
      break;
    case 'info':
      enum0 = 2;
      break;
    case 'warn':
      enum0 = 3;
      break;
    case 'error':
      enum0 = 4;
      break;
    case 'critical':
      enum0 = 5;
      break;
    default:
      if (arg0 instanceof Error) console.error(arg0);
      throw new TypeError(`"${val0}" is not one of the cases of level`);
  }
  exports1Init(enum0);
}
let exports1Version;
function version() {
  const ret = exports1Version();
  var ptr0 = dataView(memory0).getInt32(ret + 0, true);
  var len0 = dataView(memory0).getInt32(ret + 4, true);
  var result0 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr0, len0));
  const retVal = result0;
  postReturn0(ret);
  return retVal;
}
let diffConstructorDiffConfig;
class DiffConfig {
  constructor() {
    const ret = diffConstructorDiffConfig();
    var handle1 = ret;
    var rsc0 = new.target === DiffConfig ? this : Object.create(DiffConfig.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, {
      writable: true,
      value: handle1,
    });
    finalizationRegistry2.register(rsc0, handle1, rsc0);
    Object.defineProperty(rsc0, symbolDispose, {
      writable: true,
      value: function () {
        finalizationRegistry2.unregister(rsc0);
        rscTableRemove(handleTable2, handle1);
        rsc0[symbolDispose] = emptyFunc;
        rsc0[symbolRscHandle] = void 0;
        exports0['1'](handleTable2[(handle1 << 1) + 1] & ~T_FLAG);
      },
    });
    return rsc0;
  }
}
let diffMethodDiffConfigSetProperty;
DiffConfig.prototype.setProperty = function (arg1, arg2) {
  var handle1 = this[symbolRscHandle];
  if (!handle1 || (handleTable2[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "DiffConfig" resource.');
  var handle0 = handleTable2[(handle1 << 1) + 1] & ~T_FLAG;
  var ptr2 = utf8Encode(arg1, realloc0, memory0);
  var len2 = utf8EncodedLen;
  var ptr3 = utf8Encode(arg2, realloc0, memory0);
  var len3 = utf8EncodedLen;
  const ret = diffMethodDiffConfigSetProperty(handle0, ptr2, len2, ptr3, len3);
  let variant5;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0:
      variant5 = {
        tag: 'ok',
        val: void 0,
      };
      break;
    case 1:
      var ptr4 = dataView(memory0).getInt32(ret + 4, true);
      var len4 = dataView(memory0).getInt32(ret + 8, true);
      var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
      variant5 = {
        tag: 'err',
        val: result4,
      };
      break;
    default:
      throw new TypeError('invalid variant discriminant for expected');
  }
  const retVal = variant5;
  postReturn1(ret);
  if ('object' == typeof retVal && 'err' === retVal.tag) throw new ComponentError(retVal.val);
  return retVal.val;
};
let diffMethodDiffConfigGetProperty;
DiffConfig.prototype.getProperty = function (arg1) {
  var handle1 = this[symbolRscHandle];
  if (!handle1 || (handleTable2[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "DiffConfig" resource.');
  var handle0 = handleTable2[(handle1 << 1) + 1] & ~T_FLAG;
  var ptr2 = utf8Encode(arg1, realloc0, memory0);
  var len2 = utf8EncodedLen;
  const ret = diffMethodDiffConfigGetProperty(handle0, ptr2, len2);
  let variant5;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0:
      var ptr3 = dataView(memory0).getInt32(ret + 4, true);
      var len3 = dataView(memory0).getInt32(ret + 8, true);
      var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
      variant5 = {
        tag: 'ok',
        val: result3,
      };
      break;
    case 1:
      var ptr4 = dataView(memory0).getInt32(ret + 4, true);
      var len4 = dataView(memory0).getInt32(ret + 8, true);
      var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
      variant5 = {
        tag: 'err',
        val: result4,
      };
      break;
    default:
      throw new TypeError('invalid variant discriminant for expected');
  }
  const retVal = variant5;
  postReturn2(ret);
  if ('object' == typeof retVal && 'err' === retVal.tag) throw new ComponentError(retVal.val);
  return retVal.val;
};
let diffStaticObjectParse;
class Object$1 {
  constructor() {
    throw new Error('"Object$1" resource does not define a constructor');
  }
}
Object$1.parse = function (arg0, arg1) {
  var val0 = arg0;
  var len0 = val0.byteLength;
  var ptr0 = realloc0(0, 0, 1, +len0);
  var src0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, +len0);
  new Uint8Array(memory0.buffer, ptr0, +len0).set(src0);
  var handle2 = arg1[symbolRscHandle];
  if (!handle2 || (handleTable2[(handle2 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "DiffConfig" resource.');
  var handle1 = handleTable2[(handle2 << 1) + 1] & ~T_FLAG;
  const ret = diffStaticObjectParse(ptr0, len0, handle1);
  let variant6;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0:
      var handle4 = dataView(memory0).getInt32(ret + 4, true);
      var rsc3 = new.target === Object$1 ? this : Object.create(Object$1.prototype);
      Object.defineProperty(rsc3, symbolRscHandle, {
        writable: true,
        value: handle4,
      });
      finalizationRegistry1.register(rsc3, handle4, rsc3);
      Object.defineProperty(rsc3, symbolDispose, {
        writable: true,
        value: function () {
          finalizationRegistry1.unregister(rsc3);
          rscTableRemove(handleTable1, handle4);
          rsc3[symbolDispose] = emptyFunc;
          rsc3[symbolRscHandle] = void 0;
          exports0['2'](handleTable1[(handle4 << 1) + 1] & ~T_FLAG);
        },
      });
      variant6 = {
        tag: 'ok',
        val: rsc3,
      };
      break;
    case 1:
      var ptr5 = dataView(memory0).getInt32(ret + 4, true);
      var len5 = dataView(memory0).getInt32(ret + 8, true);
      var result5 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr5, len5));
      variant6 = {
        tag: 'err',
        val: result5,
      };
      break;
    default:
      throw new TypeError('invalid variant discriminant for expected');
  }
  const retVal = variant6;
  postReturn1(ret);
  if ('object' == typeof retVal && 'err' === retVal.tag) throw new ComponentError(retVal.val);
  return retVal.val;
};
let diffMethodObjectHash;
Object$1.prototype.hash = function () {
  var handle1 = this[symbolRscHandle];
  if (!handle1 || (handleTable1[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "Object" resource.');
  var handle0 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  const ret = diffMethodObjectHash(handle0);
  return BigInt.asUintN(64, ret);
};
let diffMethodObjectDiffFindSymbol;
class ObjectDiff {
  constructor() {
    throw new Error('"ObjectDiff" resource does not define a constructor');
  }
}
ObjectDiff.prototype.findSymbol = function (arg1, arg2) {
  var handle1 = this[symbolRscHandle];
  if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "ObjectDiff" resource.');
  var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var ptr2 = utf8Encode(arg1, realloc0, memory0);
  var len2 = utf8EncodedLen;
  var variant4 = arg2;
  let variant4_0;
  let variant4_1;
  let variant4_2;
  if (null == variant4) {
    variant4_0 = 0;
    variant4_1 = 0;
    variant4_2 = 0;
  } else {
    const e = variant4;
    var ptr3 = utf8Encode(e, realloc0, memory0);
    var len3 = utf8EncodedLen;
    variant4_0 = 1;
    variant4_1 = ptr3;
    variant4_2 = len3;
  }
  const ret = diffMethodObjectDiffFindSymbol(handle0, ptr2, len2, variant4_0, variant4_1, variant4_2);
  let variant15;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0:
      variant15 = void 0;
      break;
    case 1: {
      var ptr5 = dataView(memory0).getInt32(ret + 12, true);
      var len5 = dataView(memory0).getInt32(ret + 16, true);
      var result5 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr5, len5));
      let variant7;
      switch (dataView(memory0).getUint8(ret + 20, true)) {
        case 0:
          variant7 = void 0;
          break;
        case 1:
          var ptr6 = dataView(memory0).getInt32(ret + 24, true);
          var len6 = dataView(memory0).getInt32(ret + 28, true);
          var result6 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr6, len6));
          variant7 = result6;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      let enum8;
      switch (dataView(memory0).getUint8(ret + 48, true)) {
        case 0:
          enum8 = 'unknown';
          break;
        case 1:
          enum8 = 'function';
          break;
        case 2:
          enum8 = 'object';
          break;
        case 3:
          enum8 = 'section';
          break;
        default:
          throw new TypeError('invalid discriminant specified for SymbolKind');
      }
      let variant9;
      switch (dataView(memory0).getUint8(ret + 52, true)) {
        case 0:
          variant9 = void 0;
          break;
        case 1:
          variant9 = dataView(memory0).getInt32(ret + 56, true) >>> 0;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      let variant11;
      switch (dataView(memory0).getUint8(ret + 60, true)) {
        case 0:
          variant11 = void 0;
          break;
        case 1:
          var ptr10 = dataView(memory0).getInt32(ret + 64, true);
          var len10 = dataView(memory0).getInt32(ret + 68, true);
          var result10 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr10, len10));
          variant11 = result10;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      if ((4294967040 & dataView(memory0).getUint8(ret + 72, true)) !== 0)
        throw new TypeError('flags have extraneous bits set');
      var flags12 = {
        global: Boolean(1 & dataView(memory0).getUint8(ret + 72, true)),
        local: Boolean(2 & dataView(memory0).getUint8(ret + 72, true)),
        weak: Boolean(4 & dataView(memory0).getUint8(ret + 72, true)),
        common: Boolean(8 & dataView(memory0).getUint8(ret + 72, true)),
        hidden: Boolean(16 & dataView(memory0).getUint8(ret + 72, true)),
        hasExtra: Boolean(32 & dataView(memory0).getUint8(ret + 72, true)),
        sizeInferred: Boolean(64 & dataView(memory0).getUint8(ret + 72, true)),
        ignored: Boolean(128 & dataView(memory0).getUint8(ret + 72, true)),
      };
      let variant13;
      switch (dataView(memory0).getUint8(ret + 76, true)) {
        case 0:
          variant13 = void 0;
          break;
        case 1:
          variant13 = dataView(memory0).getInt32(ret + 80, true) >>> 0;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      let variant14;
      switch (dataView(memory0).getUint8(ret + 88, true)) {
        case 0:
          variant14 = void 0;
          break;
        case 1:
          variant14 = BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 96, true));
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      variant15 = {
        id: dataView(memory0).getInt32(ret + 8, true) >>> 0,
        name: result5,
        demangledName: variant7,
        address: BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 32, true)),
        size: BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 40, true)),
        kind: enum8,
        section: variant9,
        sectionName: variant11,
        flags: flags12,
        align: variant13,
        virtualAddress: variant14,
      };
      break;
    }
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  const retVal = variant15;
  postReturn3(ret);
  return retVal;
};
let diffMethodObjectDiffGetSymbol;
ObjectDiff.prototype.getSymbol = function (arg1) {
  var handle1 = this[symbolRscHandle];
  if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "ObjectDiff" resource.');
  var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  const ret = diffMethodObjectDiffGetSymbol(handle0, toUint32(arg1));
  let variant12;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0:
      variant12 = void 0;
      break;
    case 1: {
      var ptr2 = dataView(memory0).getInt32(ret + 12, true);
      var len2 = dataView(memory0).getInt32(ret + 16, true);
      var result2 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      let variant4;
      switch (dataView(memory0).getUint8(ret + 20, true)) {
        case 0:
          variant4 = void 0;
          break;
        case 1:
          var ptr3 = dataView(memory0).getInt32(ret + 24, true);
          var len3 = dataView(memory0).getInt32(ret + 28, true);
          var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
          variant4 = result3;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      let enum5;
      switch (dataView(memory0).getUint8(ret + 48, true)) {
        case 0:
          enum5 = 'unknown';
          break;
        case 1:
          enum5 = 'function';
          break;
        case 2:
          enum5 = 'object';
          break;
        case 3:
          enum5 = 'section';
          break;
        default:
          throw new TypeError('invalid discriminant specified for SymbolKind');
      }
      let variant6;
      switch (dataView(memory0).getUint8(ret + 52, true)) {
        case 0:
          variant6 = void 0;
          break;
        case 1:
          variant6 = dataView(memory0).getInt32(ret + 56, true) >>> 0;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      let variant8;
      switch (dataView(memory0).getUint8(ret + 60, true)) {
        case 0:
          variant8 = void 0;
          break;
        case 1:
          var ptr7 = dataView(memory0).getInt32(ret + 64, true);
          var len7 = dataView(memory0).getInt32(ret + 68, true);
          var result7 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr7, len7));
          variant8 = result7;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      if ((4294967040 & dataView(memory0).getUint8(ret + 72, true)) !== 0)
        throw new TypeError('flags have extraneous bits set');
      var flags9 = {
        global: Boolean(1 & dataView(memory0).getUint8(ret + 72, true)),
        local: Boolean(2 & dataView(memory0).getUint8(ret + 72, true)),
        weak: Boolean(4 & dataView(memory0).getUint8(ret + 72, true)),
        common: Boolean(8 & dataView(memory0).getUint8(ret + 72, true)),
        hidden: Boolean(16 & dataView(memory0).getUint8(ret + 72, true)),
        hasExtra: Boolean(32 & dataView(memory0).getUint8(ret + 72, true)),
        sizeInferred: Boolean(64 & dataView(memory0).getUint8(ret + 72, true)),
        ignored: Boolean(128 & dataView(memory0).getUint8(ret + 72, true)),
      };
      let variant10;
      switch (dataView(memory0).getUint8(ret + 76, true)) {
        case 0:
          variant10 = void 0;
          break;
        case 1:
          variant10 = dataView(memory0).getInt32(ret + 80, true) >>> 0;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      let variant11;
      switch (dataView(memory0).getUint8(ret + 88, true)) {
        case 0:
          variant11 = void 0;
          break;
        case 1:
          variant11 = BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 96, true));
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      variant12 = {
        id: dataView(memory0).getInt32(ret + 8, true) >>> 0,
        name: result2,
        demangledName: variant4,
        address: BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 32, true)),
        size: BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 40, true)),
        kind: enum5,
        section: variant6,
        sectionName: variant8,
        flags: flags9,
        align: variant10,
        virtualAddress: variant11,
      };
      break;
    }
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  const retVal = variant12;
  postReturn3(ret);
  return retVal;
};
let diffRunDiff;
function runDiff(arg0, arg1, arg2, arg3) {
  var variant2 = arg0;
  let variant2_0;
  let variant2_1;
  if (null == variant2) {
    variant2_0 = 0;
    variant2_1 = 0;
  } else {
    const e = variant2;
    var handle1 = e[symbolRscHandle];
    if (!handle1 || (handleTable1[(handle1 << 1) + 1] & T_FLAG) === 0)
      throw new TypeError('Resource error: Not a valid "Object" resource.');
    var handle0 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
    variant2_0 = 1;
    variant2_1 = handle0;
  }
  var variant5 = arg1;
  let variant5_0;
  let variant5_1;
  if (null == variant5) {
    variant5_0 = 0;
    variant5_1 = 0;
  } else {
    const e = variant5;
    var handle4 = e[symbolRscHandle];
    if (!handle4 || (handleTable1[(handle4 << 1) + 1] & T_FLAG) === 0)
      throw new TypeError('Resource error: Not a valid "Object" resource.');
    var handle3 = handleTable1[(handle4 << 1) + 1] & ~T_FLAG;
    variant5_0 = 1;
    variant5_1 = handle3;
  }
  var handle7 = arg2[symbolRscHandle];
  if (!handle7 || (handleTable2[(handle7 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "DiffConfig" resource.');
  var handle6 = handleTable2[(handle7 << 1) + 1] & ~T_FLAG;
  var { mappings: v8_0, selectingLeft: v8_1, selectingRight: v8_2 } = arg3;
  var vec12 = v8_0;
  var len12 = vec12.length;
  var result12 = realloc0(0, 0, 4, 16 * len12);
  for (let i = 0; i < vec12.length; i++) {
    const e = vec12[i];
    const base = result12 + 16 * i;
    var [tuple9_0, tuple9_1] = e;
    var ptr10 = utf8Encode(tuple9_0, realloc0, memory0);
    var len10 = utf8EncodedLen;
    dataView(memory0).setInt32(base + 4, len10, true);
    dataView(memory0).setInt32(base + 0, ptr10, true);
    var ptr11 = utf8Encode(tuple9_1, realloc0, memory0);
    var len11 = utf8EncodedLen;
    dataView(memory0).setInt32(base + 12, len11, true);
    dataView(memory0).setInt32(base + 8, ptr11, true);
  }
  var variant14 = v8_1;
  let variant14_0;
  let variant14_1;
  let variant14_2;
  if (null == variant14) {
    variant14_0 = 0;
    variant14_1 = 0;
    variant14_2 = 0;
  } else {
    const e = variant14;
    var ptr13 = utf8Encode(e, realloc0, memory0);
    var len13 = utf8EncodedLen;
    variant14_0 = 1;
    variant14_1 = ptr13;
    variant14_2 = len13;
  }
  var variant16 = v8_2;
  let variant16_0;
  let variant16_1;
  let variant16_2;
  if (null == variant16) {
    variant16_0 = 0;
    variant16_1 = 0;
    variant16_2 = 0;
  } else {
    const e = variant16;
    var ptr15 = utf8Encode(e, realloc0, memory0);
    var len15 = utf8EncodedLen;
    variant16_0 = 1;
    variant16_1 = ptr15;
    variant16_2 = len15;
  }
  const ret = diffRunDiff(
    variant2_0,
    variant2_1,
    variant5_0,
    variant5_1,
    handle6,
    result12,
    len12,
    variant14_0,
    variant14_1,
    variant14_2,
    variant16_0,
    variant16_1,
    variant16_2,
  );
  let variant24;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      let variant19;
      switch (dataView(memory0).getUint8(ret + 4, true)) {
        case 0:
          variant19 = void 0;
          break;
        case 1:
          var handle18 = dataView(memory0).getInt32(ret + 8, true);
          var rsc17 = new.target === ObjectDiff ? this : Object.create(ObjectDiff.prototype);
          Object.defineProperty(rsc17, symbolRscHandle, {
            writable: true,
            value: handle18,
          });
          finalizationRegistry0.register(rsc17, handle18, rsc17);
          Object.defineProperty(rsc17, symbolDispose, {
            writable: true,
            value: function () {
              finalizationRegistry0.unregister(rsc17);
              rscTableRemove(handleTable0, handle18);
              rsc17[symbolDispose] = emptyFunc;
              rsc17[symbolRscHandle] = void 0;
              exports0['3'](handleTable0[(handle18 << 1) + 1] & ~T_FLAG);
            },
          });
          variant19 = rsc17;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      let variant22;
      switch (dataView(memory0).getUint8(ret + 12, true)) {
        case 0:
          variant22 = void 0;
          break;
        case 1:
          var handle21 = dataView(memory0).getInt32(ret + 16, true);
          var rsc20 = new.target === ObjectDiff ? this : Object.create(ObjectDiff.prototype);
          Object.defineProperty(rsc20, symbolRscHandle, {
            writable: true,
            value: handle21,
          });
          finalizationRegistry0.register(rsc20, handle21, rsc20);
          Object.defineProperty(rsc20, symbolDispose, {
            writable: true,
            value: function () {
              finalizationRegistry0.unregister(rsc20);
              rscTableRemove(handleTable0, handle21);
              rsc20[symbolDispose] = emptyFunc;
              rsc20[symbolRscHandle] = void 0;
              exports0['3'](handleTable0[(handle21 << 1) + 1] & ~T_FLAG);
            },
          });
          variant22 = rsc20;
          break;
        default:
          throw new TypeError('invalid variant discriminant for option');
      }
      variant24 = {
        tag: 'ok',
        val: {
          left: variant19,
          right: variant22,
        },
      };
      break;
    }
    case 1:
      var ptr23 = dataView(memory0).getInt32(ret + 4, true);
      var len23 = dataView(memory0).getInt32(ret + 8, true);
      var result23 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr23, len23));
      variant24 = {
        tag: 'err',
        val: result23,
      };
      break;
    default:
      throw new TypeError('invalid variant discriminant for expected');
  }
  const retVal = variant24;
  postReturn1(ret);
  if ('object' == typeof retVal && 'err' === retVal.tag) throw new ComponentError(retVal.val);
  return retVal.val;
}
let displayDisplaySections;
function displaySections(arg0, arg1, arg2) {
  var handle1 = arg0[symbolRscHandle];
  if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "ObjectDiff" resource.');
  var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var { regex: v2_0, mapping: v2_1 } = arg1;
  var variant4 = v2_0;
  let variant4_0;
  let variant4_1;
  let variant4_2;
  if (null == variant4) {
    variant4_0 = 0;
    variant4_1 = 0;
    variant4_2 = 0;
  } else {
    const e = variant4;
    var ptr3 = utf8Encode(e, realloc0, memory0);
    var len3 = utf8EncodedLen;
    variant4_0 = 1;
    variant4_1 = ptr3;
    variant4_2 = len3;
  }
  var variant5 = v2_1;
  let variant5_0;
  let variant5_1;
  if (null == variant5) {
    variant5_0 = 0;
    variant5_1 = 0;
  } else {
    const e = variant5;
    variant5_0 = 1;
    variant5_1 = toUint32(e);
  }
  var { showHiddenSymbols: v6_0, showMappedSymbols: v6_1, reverseFnOrder: v6_2 } = arg2;
  const ret = displayDisplaySections(
    handle0,
    variant4_0,
    variant4_1,
    variant4_2,
    variant5_0,
    variant5_1,
    v6_0 ? 1 : 0,
    v6_1 ? 1 : 0,
    v6_2 ? 1 : 0,
  );
  var len11 = dataView(memory0).getInt32(ret + 4, true);
  var base11 = dataView(memory0).getInt32(ret + 0, true);
  var result11 = [];
  for (let i = 0; i < len11; i++) {
    const base = base11 + 40 * i;
    var ptr7 = dataView(memory0).getInt32(base + 0, true);
    var len7 = dataView(memory0).getInt32(base + 4, true);
    var result7 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr7, len7));
    var ptr8 = dataView(memory0).getInt32(base + 8, true);
    var len8 = dataView(memory0).getInt32(base + 12, true);
    var result8 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr8, len8));
    let variant9;
    switch (dataView(memory0).getUint8(base + 24, true)) {
      case 0:
        variant9 = void 0;
        break;
      case 1:
        variant9 = dataView(memory0).getFloat32(base + 28, true);
        break;
      default:
        throw new TypeError('invalid variant discriminant for option');
    }
    var ptr10 = dataView(memory0).getInt32(base + 32, true);
    var len10 = dataView(memory0).getInt32(base + 36, true);
    var result10 = new Uint32Array(memory0.buffer.slice(ptr10, ptr10 + 4 * len10));
    result11.push({
      id: result7,
      name: result8,
      size: BigInt.asUintN(64, dataView(memory0).getBigInt64(base + 16, true)),
      matchPercent: variant9,
      symbols: result10,
    });
  }
  const retVal = result11;
  postReturn4(ret);
  return retVal;
}
let displayDisplaySymbol;
function displaySymbol(arg0, arg1) {
  var handle1 = arg0[symbolRscHandle];
  if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "ObjectDiff" resource.');
  var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  const ret = displayDisplaySymbol(handle0, toUint32(arg1));
  var ptr2 = dataView(memory0).getInt32(ret + 4, true);
  var len2 = dataView(memory0).getInt32(ret + 8, true);
  var result2 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr2, len2));
  let variant4;
  switch (dataView(memory0).getUint8(ret + 12, true)) {
    case 0:
      variant4 = void 0;
      break;
    case 1:
      var ptr3 = dataView(memory0).getInt32(ret + 16, true);
      var len3 = dataView(memory0).getInt32(ret + 20, true);
      var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
      variant4 = result3;
      break;
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  let enum5;
  switch (dataView(memory0).getUint8(ret + 40, true)) {
    case 0:
      enum5 = 'unknown';
      break;
    case 1:
      enum5 = 'function';
      break;
    case 2:
      enum5 = 'object';
      break;
    case 3:
      enum5 = 'section';
      break;
    default:
      throw new TypeError('invalid discriminant specified for SymbolKind');
  }
  let variant6;
  switch (dataView(memory0).getUint8(ret + 44, true)) {
    case 0:
      variant6 = void 0;
      break;
    case 1:
      variant6 = dataView(memory0).getInt32(ret + 48, true) >>> 0;
      break;
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  let variant8;
  switch (dataView(memory0).getUint8(ret + 52, true)) {
    case 0:
      variant8 = void 0;
      break;
    case 1:
      var ptr7 = dataView(memory0).getInt32(ret + 56, true);
      var len7 = dataView(memory0).getInt32(ret + 60, true);
      var result7 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr7, len7));
      variant8 = result7;
      break;
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  if ((4294967040 & dataView(memory0).getUint8(ret + 64, true)) !== 0)
    throw new TypeError('flags have extraneous bits set');
  var flags9 = {
    global: Boolean(1 & dataView(memory0).getUint8(ret + 64, true)),
    local: Boolean(2 & dataView(memory0).getUint8(ret + 64, true)),
    weak: Boolean(4 & dataView(memory0).getUint8(ret + 64, true)),
    common: Boolean(8 & dataView(memory0).getUint8(ret + 64, true)),
    hidden: Boolean(16 & dataView(memory0).getUint8(ret + 64, true)),
    hasExtra: Boolean(32 & dataView(memory0).getUint8(ret + 64, true)),
    sizeInferred: Boolean(64 & dataView(memory0).getUint8(ret + 64, true)),
    ignored: Boolean(128 & dataView(memory0).getUint8(ret + 64, true)),
  };
  let variant10;
  switch (dataView(memory0).getUint8(ret + 68, true)) {
    case 0:
      variant10 = void 0;
      break;
    case 1:
      variant10 = dataView(memory0).getInt32(ret + 72, true) >>> 0;
      break;
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  let variant11;
  switch (dataView(memory0).getUint8(ret + 80, true)) {
    case 0:
      variant11 = void 0;
      break;
    case 1:
      variant11 = BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 88, true));
      break;
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  let variant12;
  switch (dataView(memory0).getUint8(ret + 96, true)) {
    case 0:
      variant12 = void 0;
      break;
    case 1:
      variant12 = dataView(memory0).getInt32(ret + 100, true) >>> 0;
      break;
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  let variant13;
  switch (dataView(memory0).getUint8(ret + 104, true)) {
    case 0:
      variant13 = void 0;
      break;
    case 1:
      variant13 = dataView(memory0).getFloat32(ret + 108, true);
      break;
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  let variant14;
  switch (dataView(memory0).getUint8(ret + 112, true)) {
    case 0:
      variant14 = void 0;
      break;
    case 1:
      variant14 = [
        BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 120, true)),
        BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 128, true)),
      ];
      break;
    default:
      throw new TypeError('invalid variant discriminant for option');
  }
  const retVal = {
    info: {
      id: dataView(memory0).getInt32(ret + 0, true) >>> 0,
      name: result2,
      demangledName: variant4,
      address: BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 24, true)),
      size: BigInt.asUintN(64, dataView(memory0).getBigInt64(ret + 32, true)),
      kind: enum5,
      section: variant6,
      sectionName: variant8,
      flags: flags9,
      align: variant10,
      virtualAddress: variant11,
    },
    targetSymbol: variant12,
    matchPercent: variant13,
    diffScore: variant14,
    rowCount: dataView(memory0).getInt32(ret + 136, true) >>> 0,
  };
  postReturn5(ret);
  return retVal;
}
let displayDisplayInstructionRow;
function displayInstructionRow(arg0, arg1, arg2, arg3) {
  var handle1 = arg0[symbolRscHandle];
  if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "ObjectDiff" resource.');
  var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var handle3 = arg3[symbolRscHandle];
  if (!handle3 || (handleTable2[(handle3 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "DiffConfig" resource.');
  var handle2 = handleTable2[(handle3 << 1) + 1] & ~T_FLAG;
  const ret = displayDisplayInstructionRow(handle0, toUint32(arg1), toUint32(arg2), handle2);
  var len12 = dataView(memory0).getInt32(ret + 4, true);
  var base12 = dataView(memory0).getInt32(ret + 0, true);
  var result12 = [];
  for (let i = 0; i < len12; i++) {
    const base = base12 + 40 * i;
    let variant10;
    switch (dataView(memory0).getUint8(base + 0, true)) {
      case 0:
        var ptr4 = dataView(memory0).getInt32(base + 8, true);
        var len4 = dataView(memory0).getInt32(base + 12, true);
        var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
        variant10 = {
          tag: 'basic',
          val: result4,
        };
        break;
      case 1:
        variant10 = {
          tag: 'line',
          val: dataView(memory0).getInt32(base + 8, true) >>> 0,
        };
        break;
      case 2:
        variant10 = {
          tag: 'address',
          val: BigInt.asUintN(64, dataView(memory0).getBigInt64(base + 8, true)),
        };
        break;
      case 3:
        var ptr5 = dataView(memory0).getInt32(base + 8, true);
        var len5 = dataView(memory0).getInt32(base + 12, true);
        var result5 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr5, len5));
        variant10 = {
          tag: 'opcode',
          val: {
            mnemonic: result5,
            opcode: clampGuest(dataView(memory0).getUint16(base + 16, true), 0, 65535),
          },
        };
        break;
      case 4:
        variant10 = {
          tag: 'signed',
          val: dataView(memory0).getBigInt64(base + 8, true),
        };
        break;
      case 5:
        variant10 = {
          tag: 'unsigned',
          val: BigInt.asUintN(64, dataView(memory0).getBigInt64(base + 8, true)),
        };
        break;
      case 6:
        var ptr6 = dataView(memory0).getInt32(base + 8, true);
        var len6 = dataView(memory0).getInt32(base + 12, true);
        var result6 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr6, len6));
        variant10 = {
          tag: 'opaque',
          val: result6,
        };
        break;
      case 7:
        variant10 = {
          tag: 'branch-dest',
          val: BigInt.asUintN(64, dataView(memory0).getBigInt64(base + 8, true)),
        };
        break;
      case 8: {
        var ptr7 = dataView(memory0).getInt32(base + 8, true);
        var len7 = dataView(memory0).getInt32(base + 12, true);
        var result7 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr7, len7));
        let variant9;
        switch (dataView(memory0).getUint8(base + 16, true)) {
          case 0:
            variant9 = void 0;
            break;
          case 1:
            var ptr8 = dataView(memory0).getInt32(base + 20, true);
            var len8 = dataView(memory0).getInt32(base + 24, true);
            var result8 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr8, len8));
            variant9 = result8;
            break;
          default:
            throw new TypeError('invalid variant discriminant for option');
        }
        variant10 = {
          tag: 'symbol',
          val: {
            name: result7,
            demangledName: variant9,
          },
        };
        break;
      }
      case 9:
        variant10 = {
          tag: 'addend',
          val: dataView(memory0).getBigInt64(base + 8, true),
        };
        break;
      case 10:
        variant10 = {
          tag: 'spacing',
          val: clampGuest(dataView(memory0).getUint8(base + 8, true), 0, 255),
        };
        break;
      case 11:
        variant10 = {
          tag: 'eol',
        };
        break;
      default:
        throw new TypeError('invalid variant discriminant for DiffText');
    }
    let variant11;
    switch (dataView(memory0).getUint8(base + 32, true)) {
      case 0:
        variant11 = {
          tag: 'normal',
        };
        break;
      case 1:
        variant11 = {
          tag: 'dim',
        };
        break;
      case 2:
        variant11 = {
          tag: 'bright',
        };
        break;
      case 3:
        variant11 = {
          tag: 'replace',
        };
        break;
      case 4:
        variant11 = {
          tag: 'delete',
        };
        break;
      case 5:
        variant11 = {
          tag: 'insert',
        };
        break;
      case 6:
        variant11 = {
          tag: 'rotating',
          val: clampGuest(dataView(memory0).getUint8(base + 33, true), 0, 255),
        };
        break;
      default:
        throw new TypeError('invalid variant discriminant for DiffTextColor');
    }
    result12.push({
      text: variant10,
      color: variant11,
      padTo: clampGuest(dataView(memory0).getUint8(base + 34, true), 0, 255),
    });
  }
  let enum13;
  switch (dataView(memory0).getUint8(ret + 8, true)) {
    case 0:
      enum13 = 'none';
      break;
    case 1:
      enum13 = 'op-mismatch';
      break;
    case 2:
      enum13 = 'arg-mismatch';
      break;
    case 3:
      enum13 = 'replace';
      break;
    case 4:
      enum13 = 'insert';
      break;
    case 5:
      enum13 = 'delete';
      break;
    default:
      throw new TypeError('invalid discriminant specified for InstructionDiffKind');
  }
  const retVal = {
    segments: result12,
    diffKind: enum13,
  };
  postReturn6(ret);
  return retVal;
}
let displaySymbolContext;
function symbolContext(arg0, arg1) {
  var handle1 = arg0[symbolRscHandle];
  if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "ObjectDiff" resource.');
  var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  const ret = displaySymbolContext(handle0, toUint32(arg1));
  var len8 = dataView(memory0).getInt32(ret + 4, true);
  var base8 = dataView(memory0).getInt32(ret + 0, true);
  var result8 = [];
  for (let i = 0; i < len8; i++) {
    const base = base8 + 24 * i;
    let variant7;
    switch (dataView(memory0).getUint8(base + 0, true)) {
      case 0: {
        var ptr2 = dataView(memory0).getInt32(base + 4, true);
        var len2 = dataView(memory0).getInt32(base + 8, true);
        var result2 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr2, len2));
        let variant4;
        switch (dataView(memory0).getUint8(base + 12, true)) {
          case 0:
            variant4 = void 0;
            break;
          case 1:
            var ptr3 = dataView(memory0).getInt32(base + 16, true);
            var len3 = dataView(memory0).getInt32(base + 20, true);
            var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
            variant4 = result3;
            break;
          default:
            throw new TypeError('invalid variant discriminant for option');
        }
        variant7 = {
          tag: 'copy',
          val: {
            value: result2,
            label: variant4,
          },
        };
        break;
      }
      case 1: {
        var ptr5 = dataView(memory0).getInt32(base + 4, true);
        var len5 = dataView(memory0).getInt32(base + 8, true);
        var result5 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr5, len5));
        let enum6;
        switch (dataView(memory0).getUint8(base + 16, true)) {
          case 0:
            enum6 = 'normal';
            break;
          case 1:
            enum6 = 'extab';
            break;
          default:
            throw new TypeError('invalid discriminant specified for SymbolNavigationKind');
        }
        variant7 = {
          tag: 'navigate',
          val: {
            label: result5,
            symbol: dataView(memory0).getInt32(base + 12, true) >>> 0,
            kind: enum6,
          },
        };
        break;
      }
      case 2:
        variant7 = {
          tag: 'separator',
        };
        break;
      default:
        throw new TypeError('invalid variant discriminant for ContextItem');
    }
    result8.push(variant7);
  }
  const retVal = result8;
  postReturn7(ret);
  return retVal;
}
let displaySymbolHover;
function symbolHover(arg0, arg1) {
  var handle1 = arg0[symbolRscHandle];
  if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "ObjectDiff" resource.');
  var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  const ret = displaySymbolHover(handle0, toUint32(arg1));
  var len6 = dataView(memory0).getInt32(ret + 4, true);
  var base6 = dataView(memory0).getInt32(ret + 0, true);
  var result6 = [];
  for (let i = 0; i < len6; i++) {
    const base = base6 + 24 * i;
    let variant5;
    switch (dataView(memory0).getUint8(base + 0, true)) {
      case 0: {
        var ptr2 = dataView(memory0).getInt32(base + 4, true);
        var len2 = dataView(memory0).getInt32(base + 8, true);
        var result2 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr2, len2));
        var ptr3 = dataView(memory0).getInt32(base + 12, true);
        var len3 = dataView(memory0).getInt32(base + 16, true);
        var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
        let enum4;
        switch (dataView(memory0).getUint8(base + 20, true)) {
          case 0:
            enum4 = 'normal';
            break;
          case 1:
            enum4 = 'emphasized';
            break;
          case 2:
            enum4 = 'special';
            break;
          case 3:
            enum4 = 'delete';
            break;
          case 4:
            enum4 = 'insert';
            break;
          default:
            throw new TypeError('invalid discriminant specified for HoverItemColor');
        }
        variant5 = {
          tag: 'text',
          val: {
            label: result2,
            value: result3,
            color: enum4,
          },
        };
        break;
      }
      case 1:
        variant5 = {
          tag: 'separator',
        };
        break;
      default:
        throw new TypeError('invalid variant discriminant for HoverItem');
    }
    result6.push(variant5);
  }
  const retVal = result6;
  postReturn8(ret);
  return retVal;
}
let displayInstructionContext;
function instructionContext(arg0, arg1, arg2, arg3) {
  var handle1 = arg0[symbolRscHandle];
  if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "ObjectDiff" resource.');
  var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var handle3 = arg3[symbolRscHandle];
  if (!handle3 || (handleTable2[(handle3 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "DiffConfig" resource.');
  var handle2 = handleTable2[(handle3 << 1) + 1] & ~T_FLAG;
  const ret = displayInstructionContext(handle0, toUint32(arg1), toUint32(arg2), handle2);
  var len10 = dataView(memory0).getInt32(ret + 4, true);
  var base10 = dataView(memory0).getInt32(ret + 0, true);
  var result10 = [];
  for (let i = 0; i < len10; i++) {
    const base = base10 + 24 * i;
    let variant9;
    switch (dataView(memory0).getUint8(base + 0, true)) {
      case 0: {
        var ptr4 = dataView(memory0).getInt32(base + 4, true);
        var len4 = dataView(memory0).getInt32(base + 8, true);
        var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
        let variant6;
        switch (dataView(memory0).getUint8(base + 12, true)) {
          case 0:
            variant6 = void 0;
            break;
          case 1:
            var ptr5 = dataView(memory0).getInt32(base + 16, true);
            var len5 = dataView(memory0).getInt32(base + 20, true);
            var result5 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr5, len5));
            variant6 = result5;
            break;
          default:
            throw new TypeError('invalid variant discriminant for option');
        }
        variant9 = {
          tag: 'copy',
          val: {
            value: result4,
            label: variant6,
          },
        };
        break;
      }
      case 1: {
        var ptr7 = dataView(memory0).getInt32(base + 4, true);
        var len7 = dataView(memory0).getInt32(base + 8, true);
        var result7 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr7, len7));
        let enum8;
        switch (dataView(memory0).getUint8(base + 16, true)) {
          case 0:
            enum8 = 'normal';
            break;
          case 1:
            enum8 = 'extab';
            break;
          default:
            throw new TypeError('invalid discriminant specified for SymbolNavigationKind');
        }
        variant9 = {
          tag: 'navigate',
          val: {
            label: result7,
            symbol: dataView(memory0).getInt32(base + 12, true) >>> 0,
            kind: enum8,
          },
        };
        break;
      }
      case 2:
        variant9 = {
          tag: 'separator',
        };
        break;
      default:
        throw new TypeError('invalid variant discriminant for ContextItem');
    }
    result10.push(variant9);
  }
  const retVal = result10;
  postReturn7(ret);
  return retVal;
}
let displayInstructionHover;
function instructionHover(arg0, arg1, arg2, arg3) {
  var handle1 = arg0[symbolRscHandle];
  if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "ObjectDiff" resource.');
  var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var handle3 = arg3[symbolRscHandle];
  if (!handle3 || (handleTable2[(handle3 << 1) + 1] & T_FLAG) === 0)
    throw new TypeError('Resource error: Not a valid "DiffConfig" resource.');
  var handle2 = handleTable2[(handle3 << 1) + 1] & ~T_FLAG;
  const ret = displayInstructionHover(handle0, toUint32(arg1), toUint32(arg2), handle2);
  var len8 = dataView(memory0).getInt32(ret + 4, true);
  var base8 = dataView(memory0).getInt32(ret + 0, true);
  var result8 = [];
  for (let i = 0; i < len8; i++) {
    const base = base8 + 24 * i;
    let variant7;
    switch (dataView(memory0).getUint8(base + 0, true)) {
      case 0: {
        var ptr4 = dataView(memory0).getInt32(base + 4, true);
        var len4 = dataView(memory0).getInt32(base + 8, true);
        var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
        var ptr5 = dataView(memory0).getInt32(base + 12, true);
        var len5 = dataView(memory0).getInt32(base + 16, true);
        var result5 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr5, len5));
        let enum6;
        switch (dataView(memory0).getUint8(base + 20, true)) {
          case 0:
            enum6 = 'normal';
            break;
          case 1:
            enum6 = 'emphasized';
            break;
          case 2:
            enum6 = 'special';
            break;
          case 3:
            enum6 = 'delete';
            break;
          case 4:
            enum6 = 'insert';
            break;
          default:
            throw new TypeError('invalid discriminant specified for HoverItemColor');
        }
        variant7 = {
          tag: 'text',
          val: {
            label: result4,
            value: result5,
            color: enum6,
          },
        };
        break;
      }
      case 1:
        variant7 = {
          tag: 'separator',
        };
        break;
      default:
        throw new TypeError('invalid variant discriminant for HoverItem');
    }
    result8.push(variant7);
  }
  const retVal = result8;
  postReturn8(ret);
  return retVal;
}
const $init = (() => {
  let gen = (function* () {
    const module0 = fetchCompile(new URL('./objdiff.core.wasm', import.meta.url));
    const module1 = base64Compile(
      'AGFzbQEAAAABDQJgAX8AYAV/f39/fwADBQQBAAAABAUBcAEEBAccBQEwAAABMQABATIAAgEzAAMIJGltcG9ydHMBAAoxBBEAIAAgASACIAMgBEEAEQEACwkAIABBAREAAAsJACAAQQIRAAALCQAgAEEDEQAACwAvCXByb2R1Y2VycwEMcHJvY2Vzc2VkLWJ5AQ13aXQtY29tcG9uZW50BzAuMjI5LjA',
    );
    const module2 = base64Compile(
      'AGFzbQEAAAABDQJgAX8AYAV/f39/fwACJAUAATAAAQABMQAAAAEyAAAAATMAAAAIJGltcG9ydHMBcAEEBAkKAQBBAAsEAAECAwAvCXByb2R1Y2VycwEMcHJvY2Vzc2VkLWJ5AQ13aXQtY29tcG9uZW50BzAuMjI5LjA',
    );
    ({ exports: exports0 } = yield instantiateCore(yield module1));
    ({ exports: exports1 } = yield instantiateCore(yield module0, {
      '[export]objdiff:core/diff': {
        '[resource-new]diff-config': trampoline2,
        '[resource-new]object': trampoline1,
        '[resource-new]object-diff': trampoline0,
      },
      'wasi:logging/logging@0.1.0-draft': {
        log: exports0['0'],
      },
    }));
    memory0 = exports1.memory;
    ({ exports: exports2 } = yield instantiateCore(yield module2, {
      '': {
        $imports: exports0.$imports,
        0: trampoline3,
        1: exports1['objdiff:core/diff#[dtor]diff-config'],
        2: exports1['objdiff:core/diff#[dtor]object'],
        3: exports1['objdiff:core/diff#[dtor]object-diff'],
      },
    }));
    postReturn0 = exports1.cabi_post_version;
    realloc0 = exports1.cabi_realloc;
    postReturn1 = exports1['cabi_post_objdiff:core/diff#[method]diff-config.set-property'];
    postReturn2 = exports1['cabi_post_objdiff:core/diff#[method]diff-config.get-property'];
    postReturn3 = exports1['cabi_post_objdiff:core/diff#[method]object-diff.find-symbol'];
    postReturn4 = exports1['cabi_post_objdiff:core/display#display-sections'];
    postReturn5 = exports1['cabi_post_objdiff:core/display#display-symbol'];
    postReturn6 = exports1['cabi_post_objdiff:core/display#display-instruction-row'];
    postReturn7 = exports1['cabi_post_objdiff:core/display#symbol-context'];
    postReturn8 = exports1['cabi_post_objdiff:core/display#instruction-hover'];
    exports1Init = exports1.init;
    exports1Version = exports1.version;
    diffConstructorDiffConfig = exports1['objdiff:core/diff#[constructor]diff-config'];
    diffMethodDiffConfigSetProperty = exports1['objdiff:core/diff#[method]diff-config.set-property'];
    diffMethodDiffConfigGetProperty = exports1['objdiff:core/diff#[method]diff-config.get-property'];
    diffStaticObjectParse = exports1['objdiff:core/diff#[static]object.parse'];
    diffMethodObjectHash = exports1['objdiff:core/diff#[method]object.hash'];
    diffMethodObjectDiffFindSymbol = exports1['objdiff:core/diff#[method]object-diff.find-symbol'];
    diffMethodObjectDiffGetSymbol = exports1['objdiff:core/diff#[method]object-diff.get-symbol'];
    diffRunDiff = exports1['objdiff:core/diff#run-diff'];
    displayDisplaySections = exports1['objdiff:core/display#display-sections'];
    displayDisplaySymbol = exports1['objdiff:core/display#display-symbol'];
    displayDisplayInstructionRow = exports1['objdiff:core/display#display-instruction-row'];
    displaySymbolContext = exports1['objdiff:core/display#symbol-context'];
    displaySymbolHover = exports1['objdiff:core/display#symbol-hover'];
    displayInstructionContext = exports1['objdiff:core/display#instruction-context'];
    displayInstructionHover = exports1['objdiff:core/display#instruction-hover'];
  })();
  let promise, resolve, reject;
  function runNext(value) {
    try {
      let done;
      do ({ value, done } = gen.next(value));
      while (!(value instanceof Promise) && !done);
      if (done) {
        if (!resolve) return value;
        resolve(value);
      }
      if (!promise) promise = new Promise((_resolve, _reject) => ((resolve = _resolve), (reject = _reject)));
      value.then(runNext, reject);
    } catch (e) {
      if (reject) reject(e);
      else throw e;
    }
  }
  const maybeSyncReturn = runNext(null);
  return promise || maybeSyncReturn;
})();
await $init;
const diff = {
  DiffConfig: DiffConfig,
  Object: Object$1,
  ObjectDiff: ObjectDiff,
  runDiff: runDiff,
};
const display = {
  displayInstructionRow: displayInstructionRow,
  displaySections: displaySections,
  displaySymbol: displaySymbol,
  instructionContext: instructionContext,
  instructionHover: instructionHover,
  symbolContext: symbolContext,
  symbolHover: symbolHover,
};
export { diff, display, init, version };
