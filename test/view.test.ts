import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  readF32,
  readI32,
  readMat,
  readU32,
  readVec,
  views,
  writeF32,
  writeI32,
  writeMat,
  writeU32,
  writeVec,
} from '../src/view.ts'

function buffer(bytes: number) {
  return views(new ArrayBuffer(bytes))
}

test('writeF32 and readF32 roundtrip 1.5', () => {
  const view = buffer(4)
  writeF32(view.f32, 0, 1.5)
  assert.equal(readF32(view.f32, 0), 1.5)
})

test('minus zero roundtrips', () => {
  const view = buffer(4)
  writeF32(view.f32, 0, -0)
  assert.equal(Object.is(readF32(view.f32, 0), -0), true)
})

test('NaN roundtrips', () => {
  const view = buffer(4)
  writeF32(view.f32, 0, Number.NaN)
  assert.equal(Number.isNaN(readF32(view.f32, 0)), true)
})

test('vec3 write leaves the next float alone', () => {
  const view = buffer(16)
  writeF32(view.f32, 12, 7)
  writeVec(view.f32, 0, 3, new Float32Array([1, 2, 3]))
  assert.equal(readF32(view.f32, 12), 7)
})

test('mat3x3 write leaves column padding alone', () => {
  const view = buffer(48)
  writeF32(view.f32, 12, 7)
  writeF32(view.f32, 28, 8)
  writeF32(view.f32, 44, 9)
  writeMat(view.f32, 0, 3, 3, new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))
  assert.equal(readF32(view.f32, 12), 7)
  assert.equal(readF32(view.f32, 28), 8)
  assert.equal(readF32(view.f32, 44), 9)
})

test('mat3x3 read returns nine column major numbers', () => {
  const view = buffer(48)
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  writeMat(view.f32, 0, 3, 3, new Float32Array(numbers))
  writeF32(view.f32, 12, 99)
  writeF32(view.f32, 28, 99)
  writeF32(view.f32, 44, 99)
  const out = new Float32Array(9)
  readMat(view.f32, 0, 3, 3, out)
  assert.deepEqual(Array.from(out), numbers)
})

test('i32 keeps its min and max', () => {
  const view = buffer(4)
  writeI32(view.i32, 0, -2147483648)
  assert.equal(readI32(view.i32, 0), -2147483648)
  writeI32(view.i32, 0, 2147483647)
  assert.equal(readI32(view.i32, 0), 2147483647)
})

test('u32 keeps 4294967295', () => {
  const view = buffer(4)
  writeU32(view.u32, 0, 4294967295)
  assert.equal(readU32(view.u32, 0), 4294967295)
})

test('u32 write of -1 reads back as 4294967295', () => {
  const view = buffer(4)
  writeU32(view.u32, 0, -1)
  assert.equal(readU32(view.u32, 0), 4294967295)
})

test('offset 2 throws', () => {
  const view = buffer(8)
  assert.throws(() => writeF32(view.f32, 2, 1), /multiple of 4/)
})

test('negative offset throws', () => {
  const view = buffer(8)
  assert.throws(() => writeF32(view.f32, -4, 1), /multiple of 4/)
})

test('write past the end throws', () => {
  const view = buffer(4)
  assert.throws(() => writeF32(view.f32, 4, 1), /outside the buffer/)
})

test('short output throws', () => {
  const view = buffer(16)
  assert.throws(() => readVec(view.f32, 0, 3, new Float32Array(2)), /shorter than 3/)
})

test('readVec returns the same output array', () => {
  const view = buffer(16)
  const out = new Float32Array(3)
  assert.equal(readVec(view.f32, 0, 3, out), out)
})

test('shared buffer roundtrips', () => {
  const shared = new SharedArrayBuffer(8)
  const view = views(shared)
  writeF32(view.f32, 0, 1.5)
  assert.equal(readF32(view.f32, 0), 1.5)
})

test('two writes are visible through a little endian data view', () => {
  const raw = new ArrayBuffer(8)
  const view = views(raw)
  writeF32(view.f32, 0, 1.5)
  writeF32(view.f32, 4, 2.5)
  const data = new DataView(raw)
  assert.equal(data.getFloat32(0, true), 1.5)
  assert.equal(data.getFloat32(4, true), 2.5)
})
