import assert from 'node:assert/strict'
import { test } from 'node:test'
import { array, f32, field, mat3x3, struct, vec2f, vec3f } from '../src/schema.ts'
import { wgsl } from '../src/wgsl.ts'

function structA() {
  return struct('A', [field('u', f32), field('v', f32), field('w', vec2f), field('x', f32)])
}

test('struct A prints fields in order', () => {
  assert.equal(
    wgsl(structA()),
    `struct A {
  u: f32,
  v: f32,
  w: vec2<f32>,
  x: f32
}
`,
  )
})

test('align and size attributes are printed', () => {
  const inner = struct('A', [
    field('u', f32),
    field('v', f32),
    field('w', vec2f),
    field('x', f32, { size: 16 }),
  ])
  const text = wgsl(
    struct('B', [field('e', inner, { align: 16 }), field('n', f32, { align: 16, size: 16 })]),
  )
  assert.equal(
    text,
    `struct A {
  u: f32,
  v: f32,
  w: vec2<f32>,
  @size(16) x: f32
}

struct B {
  @align(16) e: A,
  @align(16) @size(16) n: f32
}
`,
  )
})

test('a shared struct is printed once', () => {
  const inner = struct('A', [field('x', f32)])
  const text = wgsl(struct('B', [field('p', inner), field('q', inner)]))
  assert.equal(text.split('struct A').length - 1, 1)
  assert.equal(
    text,
    `struct A {
  x: f32
}

struct B {
  p: A,
  q: A
}
`,
  )
})

test('array prints as array<vec3<f32>, 8>', () => {
  assert.equal(
    wgsl(struct('S', [field('values', array(vec3f, 8))])),
    `struct S {
  values: array<vec3<f32>, 8>
}
`,
  )
})

test('mat3x3 prints as mat3x3<f32>', () => {
  assert.equal(
    wgsl(struct('S', [field('m', mat3x3)])),
    `struct S {
  m: mat3x3<f32>
}
`,
  )
})

test('printed text does not mention offsets', () => {
  const text = wgsl(structA())
  assert.equal(text.indexOf('offset'), -1)
})
