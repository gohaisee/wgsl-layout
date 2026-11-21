import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as api from '../src/index.ts'
import { array, f32, field, struct, vec4f } from '../src/schema.ts'

test('empty struct throws', () => {
  assert.throws(() => struct('S', []), /wgsl-layout: struct has no fields/)
})

test('duplicate field throws', () => {
  assert.throws(
    () => struct('S', [field('a', f32), field('a', f32)]),
    /wgsl-layout: duplicate field "a"/,
  )
})

test('field named struct throws', () => {
  assert.throws(() => field('struct', f32), /wgsl-layout: name "struct" is reserved/)
})

test('field named position is kept', () => {
  const item = field('position', f32)
  assert.equal(item.name, 'position')
})

test('name 1pos throws', () => {
  assert.throws(() => field('1pos', f32), /wgsl-layout: invalid name "1pos"/)
})

test('array length 0 throws', () => {
  assert.throws(() => array(f32, 0), /wgsl-layout: array length/)
})

test('array length 1.5 throws', () => {
  assert.throws(() => array(f32, 1.5), /wgsl-layout: array length/)
})

test('array of arrays throws', () => {
  assert.throws(() => array(array(f32, 2), 2), /wgsl-layout: array of arrays is not allowed/)
})

test('align 3 throws', () => {
  assert.throws(() => field('a', f32, { align: 3 }), /wgsl-layout: align 3/)
})

test('align 8 on vec4 throws', () => {
  assert.throws(() => field('a', vec4f, { align: 8 }), /wgsl-layout: align 8/)
})

test('align 32 on f32 is kept', () => {
  const item = field('a', f32, { align: 32 })
  assert.equal(item.align, 32)
})

test('size 2 on f32 throws', () => {
  assert.throws(() => field('a', f32, { size: 2 }), /wgsl-layout: size 2/)
})

test('size 12 on f32 is kept', () => {
  const item = field('a', f32, { size: 12 })
  assert.equal(item.size, 12)
})

test('struct inside itself throws', () => {
  const self = field('self', f32)
  const node = struct('Node', [self])
  self.type = node
  assert.throws(
    () => struct('Outer', [field('inner', node)]),
    /wgsl-layout: struct "Node" contains itself/,
  )
})

test('two structs named A in one tree throw', () => {
  const first = struct('A', [field('x', f32)])
  const second = struct('A', [field('y', f32)])
  assert.throws(
    () => struct('B', [field('p', first), field('q', second)]),
    /wgsl-layout: two structs named "A"/,
  )
})

test('the public entry lays out, prints and writes', () => {
  const type = api.struct('Light', [api.field('pos', api.vec3f), api.field('radius', api.f32)])
  const laid = api.layout(type, 'storage')
  const text = api.wgsl(type)
  assert.equal(laid.size, 16)
  assert.notEqual(text.indexOf('radius: f32'), -1)
  const radius = laid.fields.find((item) => item.name === 'radius')
  if (radius === undefined) {
    throw new Error('missing radius')
  }
  const view = api.views(new ArrayBuffer(laid.size))
  api.writeF32(view.f32, radius.offset, 1.5)
  assert.equal(api.readF32(view.f32, radius.offset), 1.5)
})

test('push after struct does not add a field', () => {
  const fields = [field('a', f32)]
  const type = struct('S', fields)
  fields.push(field('b', f32))
  assert.equal(type.kind, 'struct')
  if (type.kind === 'struct') {
    assert.equal(type.fields.length, 1)
    assert.equal(type.fields[0]?.name, 'a')
  }
})
