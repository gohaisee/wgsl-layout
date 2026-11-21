export type BufferViews = {
  f32: Float32Array
  i32: Int32Array
  u32: Uint32Array
}

type Words = Float32Array | Int32Array | Uint32Array

function fail(message: string): never {
  throw new Error(`wgsl-layout: ${message}`)
}

function checkOffset(view: Words, byteOffset: number, bytes: number): void {
  if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset % 4 !== 0) {
    fail('offset must be a non-negative multiple of 4')
  }
  if (byteOffset + bytes > view.byteLength) {
    fail('offset is outside the buffer')
  }
}

export function views(buffer: ArrayBufferLike): BufferViews {
  return {
    f32: new Float32Array(buffer),
    i32: new Int32Array(buffer),
    u32: new Uint32Array(buffer),
  }
}

export function readF32(view: Float32Array, byteOffset: number): number {
  checkOffset(view, byteOffset, 4)
  const value = view[byteOffset / 4]
  if (value === undefined) {
    fail('offset is outside the buffer')
  }
  return value
}

export function writeF32(view: Float32Array, byteOffset: number, value: number): void {
  checkOffset(view, byteOffset, 4)
  view[byteOffset / 4] = value
}

export function readI32(view: Int32Array, byteOffset: number): number {
  checkOffset(view, byteOffset, 4)
  const value = view[byteOffset / 4]
  if (value === undefined) {
    fail('offset is outside the buffer')
  }
  return value
}

// typed arrays wrap the same way the gpu load does. do not clamp.
export function writeI32(view: Int32Array, byteOffset: number, value: number): void {
  checkOffset(view, byteOffset, 4)
  view[byteOffset / 4] = value
}

export function readU32(view: Uint32Array, byteOffset: number): number {
  checkOffset(view, byteOffset, 4)
  const value = view[byteOffset / 4]
  if (value === undefined) {
    fail('offset is outside the buffer')
  }
  return value
}

export function writeU32(view: Uint32Array, byteOffset: number, value: number): void {
  checkOffset(view, byteOffset, 4)
  view[byteOffset / 4] = value
}

function columnAlign(rows: 2 | 3 | 4): number {
  return rows === 2 ? 8 : 16
}

export function readVec<T extends Words>(view: T, byteOffset: number, n: 2 | 3 | 4, out: T): T {
  checkOffset(view, byteOffset, n * 4)
  if (out.length < n) {
    fail(`output is shorter than ${n}`)
  }
  const base = byteOffset / 4
  for (let i = 0; i < n; i++) {
    const value = view[base + i]
    if (value === undefined) {
      fail('offset is outside the buffer')
    }
    out[i] = value
  }
  return out
}

// do not write the padding bytes. a neighbor may live there.
export function writeVec<T extends Words>(view: T, byteOffset: number, n: 2 | 3 | 4, src: T): void {
  checkOffset(view, byteOffset, n * 4)
  if (src.length < n) {
    fail(`source is shorter than ${n}`)
  }
  const base = byteOffset / 4
  for (let i = 0; i < n; i++) {
    const value = src[i]
    if (value === undefined) {
      fail(`source is shorter than ${n}`)
    }
    view[base + i] = value
  }
}

export function readMat(
  view: Float32Array,
  byteOffset: number,
  cols: 2 | 3 | 4,
  rows: 2 | 3 | 4,
  out: Float32Array,
): Float32Array {
  const span = (cols - 1) * columnAlign(rows) + rows * 4
  checkOffset(view, byteOffset, span)
  if (out.length < cols * rows) {
    fail('output is shorter than the matrix')
  }
  let k = 0
  for (let c = 0; c < cols; c++) {
    const base = (byteOffset + c * columnAlign(rows)) / 4
    for (let r = 0; r < rows; r++) {
      const value = view[base + r]
      if (value === undefined) {
        fail('offset is outside the buffer')
      }
      out[k] = value
      k += 1
    }
  }
  return out
}

// do not write the padding bytes. a neighbor may live there.
export function writeMat(
  view: Float32Array,
  byteOffset: number,
  cols: 2 | 3 | 4,
  rows: 2 | 3 | 4,
  src: Float32Array,
): void {
  const span = (cols - 1) * columnAlign(rows) + rows * 4
  checkOffset(view, byteOffset, span)
  if (src.length < cols * rows) {
    fail('source is shorter than the matrix')
  }
  let k = 0
  for (let c = 0; c < cols; c++) {
    const base = (byteOffset + c * columnAlign(rows)) / 4
    for (let r = 0; r < rows; r++) {
      const value = src[k]
      if (value === undefined) {
        fail('source is shorter than the matrix')
      }
      view[base + r] = value
      k += 1
    }
  }
}
