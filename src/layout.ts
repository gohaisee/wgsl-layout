import type { Type } from './schema.ts'

export type Space = 'uniform' | 'storage'

export type Member = {
  name: string
  offset: number
  align: number
  size: number
  elementStride: number | null
  type: Type
}

export type Layout = {
  align: number
  size: number
  requiredAlign: number
  elementStride: number | null
  fields: readonly Member[]
}

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
      // a column starts on the vec alignment, not on the packed size. mat3x3 columns are 16 bytes apart.
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
      // size stays 4. only requiredalign becomes 16 in uniform.
      return roundUp(max, offset)
    }
    default:
      return unreachable(type)
  }
}

function unreachable(type: never): never {
  return fail(`unknown type ${JSON.stringify(type)}`)
}

function elementStrideOf(type: Type): number | null {
  if (type.kind !== 'array') {
    return null
  }
  return roundUp(alignOf(type.of), sizeOf(type.of))
}

function requiredAlign(type: Type, space: Space): number {
  const natural = alignOf(type)
  if (space === 'storage') {
    return natural
  }
  if (type.kind === 'array' || type.kind === 'struct') {
    return roundUp(16, natural)
  }
  return natural
}

function membersOf(type: Extract<Type, { kind: 'struct' }>): Member[] {
  const fields: Member[] = []
  let offset = 0
  for (const item of type.fields) {
    const align = item.align ?? alignOf(item.type)
    const size = item.size ?? sizeOf(item.type)
    offset = roundUp(align, offset)
    fields.push({
      name: item.name,
      offset,
      align,
      size,
      elementStride: elementStrideOf(item.type),
      type: item.type,
    })
    offset += size
  }
  return fields
}

function layoutOf(type: Type, space: Space): Layout {
  return {
    align: alignOf(type),
    size: sizeOf(type),
    requiredAlign: requiredAlign(type, space),
    elementStride: elementStrideOf(type),
    fields: type.kind === 'struct' ? membersOf(type) : [],
  }
}

function checkUniform(type: Type, laid: Layout): void {
  // a bad uniform layout is an error. the shader will not insert this padding for us.
  if (type.kind === 'array') {
    const stride = laid.elementStride
    if (stride === null || stride % 16 !== 0) {
      fail(
        `array stride ${stride ?? 0} is not a multiple of 16. wrap the element in a struct with @size(16), or use storage.`,
      )
    }
    if (type.of.kind === 'struct' || type.of.kind === 'array') {
      checkUniform(type.of, layoutOf(type.of, 'uniform'))
    }
    return
  }
  if (type.kind !== 'struct') {
    return
  }
  const fields = laid.fields
  for (let i = 0; i < fields.length; i++) {
    const member = fields[i]
    if (member === undefined) {
      continue
    }
    const memberType = member.type
    if (memberType.kind === 'array' || memberType.kind === 'struct') {
      const need = requiredAlign(memberType, 'uniform')
      if (member.offset % need !== 0) {
        fail(`field "${member.name}" offset ${member.offset} is not a multiple of ${need}`)
      }
    }
    if (memberType.kind === 'array') {
      const stride = member.elementStride
      if (stride === null || stride % 16 !== 0) {
        fail(
          `field "${member.name}" array stride ${stride ?? 0} is not a multiple of 16. wrap the element in a struct with @size(16), or use storage.`,
        )
      }
      if (memberType.of.kind === 'struct' || memberType.of.kind === 'array') {
        checkUniform(memberType.of, layoutOf(memberType.of, 'uniform'))
      }
    }
    if (memberType.kind === 'struct') {
      const next = fields[i + 1]
      if (next !== undefined) {
        const gap = next.offset - member.offset
        const minGap = roundUp(16, sizeOf(memberType))
        if (gap < minGap) {
          fail(
            `field "${member.name}" needs ${minGap} bytes before the next field in uniform, gap is ${gap}`,
          )
        }
      }
      checkUniform(memberType, layoutOf(memberType, 'uniform'))
    }
  }
}

function freezeLayout(result: Layout): Layout {
  for (const member of result.fields) {
    Object.freeze(member)
  }
  Object.freeze(result.fields)
  return Object.freeze(result)
}

export function layout(type: Type, space: Space): Layout {
  const result = layoutOf(type, space)
  if (space === 'uniform') {
    checkUniform(type, result)
  }
  return freezeLayout(result)
}
