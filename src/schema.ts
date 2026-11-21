export type Scalar = 'f32' | 'i32' | 'u32'

export type Type =
  | { kind: 'scalar'; scalar: Scalar }
  | { kind: 'vec'; n: 2 | 3 | 4; scalar: Scalar }
  | { kind: 'mat'; cols: 2 | 3 | 4; rows: 2 | 3 | 4 }
  | { kind: 'array'; len: number; of: Type }
  | { kind: 'struct'; name: string; fields: readonly Field[] }

export type Field = {
  name: string
  type: Type
  align?: number
  size?: number
}

const KEYWORDS = new Set([
  'alias',
  'array',
  'atomic',
  'bool',
  'break',
  'case',
  'const',
  'continue',
  'default',
  'discard',
  'else',
  'enable',
  'f16',
  'f32',
  'false',
  'fn',
  'for',
  'i32',
  'if',
  'let',
  'loop',
  'mat2x2',
  'mat2x3',
  'mat2x4',
  'mat3x2',
  'mat3x3',
  'mat3x4',
  'mat4x2',
  'mat4x3',
  'mat4x4',
  'override',
  'requires',
  'return',
  'struct',
  'switch',
  'true',
  'u32',
  'var',
  'vec2',
  'vec2f',
  'vec2h',
  'vec2i',
  'vec2u',
  'vec3',
  'vec3f',
  'vec3h',
  'vec3i',
  'vec3u',
  'vec4',
  'vec4f',
  'vec4h',
  'vec4i',
  'vec4u',
  'while',
])

export const f32: Type = { kind: 'scalar', scalar: 'f32' }
export const i32: Type = { kind: 'scalar', scalar: 'i32' }
export const u32: Type = { kind: 'scalar', scalar: 'u32' }

export const vec2f: Type = { kind: 'vec', n: 2, scalar: 'f32' }
export const vec3f: Type = { kind: 'vec', n: 3, scalar: 'f32' }
export const vec4f: Type = { kind: 'vec', n: 4, scalar: 'f32' }
export const vec2i: Type = { kind: 'vec', n: 2, scalar: 'i32' }
export const vec3i: Type = { kind: 'vec', n: 3, scalar: 'i32' }
export const vec4i: Type = { kind: 'vec', n: 4, scalar: 'i32' }
export const vec2u: Type = { kind: 'vec', n: 2, scalar: 'u32' }
export const vec3u: Type = { kind: 'vec', n: 3, scalar: 'u32' }
export const vec4u: Type = { kind: 'vec', n: 4, scalar: 'u32' }

export const mat2x2: Type = { kind: 'mat', cols: 2, rows: 2 }
export const mat2x3: Type = { kind: 'mat', cols: 2, rows: 3 }
export const mat2x4: Type = { kind: 'mat', cols: 2, rows: 4 }
export const mat3x2: Type = { kind: 'mat', cols: 3, rows: 2 }
export const mat3x3: Type = { kind: 'mat', cols: 3, rows: 3 }
export const mat3x4: Type = { kind: 'mat', cols: 3, rows: 4 }
export const mat4x2: Type = { kind: 'mat', cols: 4, rows: 2 }
export const mat4x3: Type = { kind: 'mat', cols: 4, rows: 3 }
export const mat4x4: Type = { kind: 'mat', cols: 4, rows: 4 }

function fail(message: string): never {
  throw new Error(`wgsl-layout: ${message}`)
}

function roundUp(k: number, n: number): number {
  // bitwise and truncates to 32 bits in js.
  return Math.ceil(n / k) * k
}

function alignOfVec(n: 2 | 3 | 4): number {
  if (n === 2) {
    return 8
  }
  if (n === 3) {
    // vec3 lines up on 16 bytes and stores 12. the next f32 may use the leftover 4. wgsl 14.4.1.
    return 16
  }
  return 16
}

function sizeOfVec(n: 2 | 3 | 4): number {
  return n * 4
}

export function alignOf(type: Type): number {
  switch (type.kind) {
    case 'scalar':
      return 4
    case 'vec':
      return alignOfVec(type.n)
    case 'mat':
      return alignOfVec(type.rows)
    case 'array':
      return alignOf(type.of)
    case 'struct': {
      let max = 0
      for (const item of type.fields) {
        const align = item.align ?? alignOf(item.type)
        if (align > max) {
          max = align
        }
      }
      return max
    }
    default:
      return unreachable(type)
  }
}

export function sizeOf(type: Type): number {
  switch (type.kind) {
    case 'scalar':
      return 4
    case 'vec':
      return sizeOfVec(type.n)
    case 'mat':
      return type.cols * roundUp(alignOfVec(type.rows), sizeOfVec(type.rows))
    case 'array':
      return type.len * roundUp(alignOf(type.of), sizeOf(type.of))
    case 'struct': {
      let offset = 0
      let max = 0
      for (const item of type.fields) {
        const align = item.align ?? alignOf(item.type)
        const size = item.size ?? sizeOf(item.type)
        if (align > max) {
          max = align
        }
        offset = roundUp(align, offset) + size
      }
      return roundUp(max, offset)
    }
    default:
      return unreachable(type)
  }
}

function unreachable(type: never): never {
  return fail(`unknown type ${JSON.stringify(type)}`)
}

function checkName(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    fail(`invalid name "${name}"`)
  }
  if (KEYWORDS.has(name)) {
    fail(`name "${name}" is reserved`)
  }
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
}

function checkAlign(align: number, natural: number): void {
  if (!isPowerOfTwo(align) || align < natural) {
    fail(`align ${align} is below ${natural} or is not a power of two`)
  }
}

function checkSize(size: number, natural: number): void {
  if (!Number.isInteger(size) || size < natural) {
    fail(`size ${size} is below ${natural}`)
  }
}

function walk(type: Type, stack: Set<Type>, names: Map<string, Type>): void {
  if (type.kind === 'array') {
    if (type.of.kind === 'array') {
      fail('array of arrays is not allowed')
    }
    walk(type.of, stack, names)
    return
  }
  if (type.kind !== 'struct') {
    return
  }
  const previous = names.get(type.name)
  if (previous !== undefined && previous !== type) {
    fail(`two structs named "${type.name}"`)
  }
  names.set(type.name, type)
  if (stack.has(type)) {
    fail(`struct "${type.name}" contains itself`)
  }
  stack.add(type)
  for (const item of type.fields) {
    walk(item.type, stack, names)
  }
  stack.delete(type)
}

export function array(of: Type, len: number): Type {
  if (of.kind === 'array') {
    fail('array of arrays is not allowed')
  }
  if (!Number.isInteger(len) || len < 1) {
    fail('array length must be an integer of at least 1')
  }
  return { kind: 'array', len, of }
}

export function field(
  name: string,
  type: Type,
  opts?: { readonly align?: number; readonly size?: number },
): Field {
  checkName(name)
  const result: Field = { name, type }
  if (opts?.align !== undefined) {
    checkAlign(opts.align, alignOf(type))
    result.align = opts.align
  }
  if (opts?.size !== undefined) {
    checkSize(opts.size, sizeOf(type))
    result.size = opts.size
  }
  return result
}

export function struct(name: string, fields: readonly Field[]): Type {
  checkName(name)
  if (fields.length === 0) {
    fail('struct has no fields')
  }
  const copy = fields.slice()
  const seen = new Set<string>()
  for (const item of copy) {
    if (seen.has(item.name)) {
      fail(`duplicate field "${item.name}"`)
    }
    seen.add(item.name)
  }
  const type: Type = { kind: 'struct', name, fields: copy }
  walk(type, new Set(), new Map())
  return type
}
