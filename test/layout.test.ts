import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layout, type Layout, type Member } from '../src/layout.ts'
import { array, f32, field, i32, mat2x2, mat3x2, mat3x3, mat4x4, struct, vec2f, vec3f } from '../src/schema.ts'

function at(laid: Layout, name: string): Member {
  const found = laid.fields.find((item) => item.name === name)
  if (found === undefined) {
    throw new Error(`missing ${name}`)
  }
  return found
}

function structA() {
  return struct('A', [field('u', f32), field('v', f32), field('w', vec2f), field('x', f32)])
}

function structB(inner: ReturnType<typeof structA>) {
  return struct('B', [
    field('a', vec2f),
    field('b', vec3f),
    field('c', f32),
    field('d', f32),
    field('e', inner),
    field('f', vec3f),
    field('g', array(inner, 3)),
    field('h', i32),
  ])
}

test('struct A matches the storage example', () => {
  const laid = layout(structA(), 'storage')
  assert.equal(laid.align, 8)
  assert.equal(laid.size, 24)
  assert.equal(at(laid, 'u').offset, 0)
  assert.equal(at(laid, 'v').offset, 4)
  assert.equal(at(laid, 'w').offset, 8)
  assert.equal(at(laid, 'x').offset, 16)
})

test('struct B matches the storage example', () => {
  const laid = layout(structB(structA()), 'storage')
  assert.equal(laid.align, 16)
  assert.equal(laid.size, 160)
  assert.equal(at(laid, 'a').offset, 0)
  assert.equal(at(laid, 'b').offset, 16)
  assert.equal(at(laid, 'c').offset, 28)
  assert.equal(at(laid, 'd').offset, 32)
  assert.equal(at(laid, 'e').offset, 40)
  assert.equal(at(laid, 'f').offset, 64)
  assert.equal(at(laid, 'g').offset, 80)
  assert.equal(at(laid, 'g').elementStride, 24)
  assert.equal(at(laid, 'h').offset, 152)
})

test('vec3 then f32 packs into 16 bytes', () => {
  const laid = layout(struct('S', [field('pos', vec3f), field('radius', f32)]), 'storage')
  assert.equal(at(laid, 'pos').offset, 0)
  assert.equal(at(laid, 'radius').offset, 12)
  assert.equal(laid.align, 16)
  assert.equal(laid.size, 16)
})

test('two vec3 fields start 16 bytes apart', () => {
  const laid = layout(struct('S', [field('a', vec3f), field('b', vec3f)]), 'storage')
  assert.equal(at(laid, 'b').offset, 16)
})

test('array of 8 f32 has stride 4 and size 32', () => {
  const laid = layout(array(f32, 8), 'storage')
  assert.equal(laid.align, 4)
  assert.equal(laid.elementStride, 4)
  assert.equal(laid.size, 32)
})

test('array of 8 vec3 has stride 16 and size 128', () => {
  const laid = layout(array(vec3f, 8), 'storage')
  assert.equal(laid.elementStride, 16)
  assert.equal(laid.size, 128)
})

test('mat4x4 is 16 by 64', () => {
  const laid = layout(mat4x4, 'storage')
  assert.equal(laid.align, 16)
  assert.equal(laid.size, 64)
})

test('mat3x3 is 16 by 48', () => {
  const laid = layout(mat3x3, 'storage')
  assert.equal(laid.align, 16)
  assert.equal(laid.size, 48)
})

test('mat2x2 is 8 by 16', () => {
  const laid = layout(mat2x2, 'storage')
  assert.equal(laid.align, 8)
  assert.equal(laid.size, 16)
})

test('mat3x2 is 8 by 24', () => {
  const laid = layout(mat3x2, 'storage')
  assert.equal(laid.align, 8)
  assert.equal(laid.size, 24)
})

test('explicit align and size match the uniform example', () => {
  const inner = struct('A', [
    field('u', f32),
    field('v', f32),
    field('w', vec2f),
    field('x', f32, { size: 16 }),
  ])
  const laid = layout(
    struct('B', [
      field('a', vec2f),
      field('b', vec3f),
      field('c', f32),
      field('d', f32),
      field('e', inner, { align: 16 }),
      field('f', vec3f),
      field('g', array(inner, 3)),
      field('h', i32),
    ]),
    'uniform',
  )
  assert.equal(laid.size, 208)
  assert.equal(at(laid, 'e').offset, 48)
  assert.equal(at(laid, 'h').offset, 192)
})

test('layout does not change the schema', () => {
  const item = field('x', f32, { align: 32 })
  const type = struct('S', [item])
  layout(type, 'storage')
  assert.equal(item.align, 32)
  if (type.kind !== 'struct') {
    throw new Error('expected a struct')
  }
  assert.equal(type.fields[0], item)
})

test('layout result is frozen', () => {
  const laid = layout(struct('S', [field('x', f32)]), 'storage')
  assert.throws(() => {
    laid.size = 0
  })
})

test('one f32 stays 4 bytes in both spaces', () => {
  const type = struct('S', [field('x', f32)])
  const storage = layout(type, 'storage')
  const uniform = layout(type, 'uniform')
  assert.equal(storage.size, 4)
  assert.equal(uniform.size, 4)
  assert.equal(storage.requiredAlign, 4)
  assert.equal(uniform.requiredAlign, 16)
})

test('uniform array of f32 throws and names the field', () => {
  const type = struct('S', [field('values', array(f32, 4))])
  assert.throws(() => layout(type, 'uniform'), /field "values" array stride 4 is not a multiple of 16/)
  assert.throws(() => layout(type, 'uniform'), /@size\(16\)/)
  assert.throws(() => layout(type, 'uniform'), /storage/)
})

test('uniform array of vec3 is legal', () => {
  const laid = layout(struct('S', [field('values', array(vec3f, 2))]), 'uniform')
  assert.equal(at(laid, 'values').elementStride, 16)
})

test('uniform array of vec2 throws', () => {
  const type = struct('S', [field('values', array(vec2f, 2))])
  assert.throws(() => layout(type, 'uniform'), /field "values"/)
})

test('uniform struct member too close to the next field throws', () => {
  const inner = struct('Inner', [field('x', f32)])
  const type = struct('Outer', [field('inner', inner), field('y', f32)])
  assert.throws(() => layout(type, 'uniform'), /field "inner"/)
})

test('uniform align 16 on the field after a struct is legal', () => {
  const inner = struct('Inner', [field('x', f32)])
  const laid = layout(
    struct('Outer', [field('inner', inner), field('y', f32, { align: 16 })]),
    'uniform',
  )
  assert.equal(at(laid, 'y').offset, 16)
})

test('uniform struct that only holds a small struct stays 4 bytes', () => {
  const inner = struct('Inner', [field('x', f32)])
  const laid = layout(struct('Outer', [field('inner', inner)]), 'uniform')
  assert.equal(laid.size, 4)
})

test('storage array of 4 f32 is 16 bytes', () => {
  const laid = layout(struct('S', [field('values', array(f32, 4))]), 'storage')
  assert.equal(at(laid, 'values').size, 16)
})

test('custom size 6 pushes the next f32 to 8', () => {
  const laid = layout(struct('S', [field('a', f32, { size: 6 }), field('b', f32)]), 'storage')
  assert.equal(at(laid, 'b').offset, 8)
  assert.equal(laid.size, 12)
})
