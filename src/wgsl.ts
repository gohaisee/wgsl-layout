import type { Type } from './schema.ts'

function typeText(type: Type): string {
  switch (type.kind) {
    case 'scalar':
      return type.scalar
    case 'vec':
      return `vec${type.n}<${type.scalar}>`
    case 'mat':
      return `mat${type.cols}x${type.rows}<f32>`
    case 'array':
      return `array<${typeText(type.of)}, ${type.len}>`
    case 'struct':
      return type.name
    default:
      return unreachable(type)
  }
}

function unreachable(type: never): never {
  throw new Error(`wgsl-layout: unknown type ${JSON.stringify(type)}`)
}

function render(type: Extract<Type, { kind: 'struct' }>): string {
  const lines = [`struct ${type.name} {`]
  const fields = type.fields
  for (let i = 0; i < fields.length; i++) {
    const item = fields[i]
    if (item === undefined) {
      continue
    }
    const bits: string[] = []
    if (item.align !== undefined) {
      bits.push(`@align(${item.align})`)
    }
    if (item.size !== undefined) {
      bits.push(`@size(${item.size})`)
    }
    const attr = bits.length > 0 ? `${bits.join(' ')} ` : ''
    const comma = i === fields.length - 1 ? '' : ','
    lines.push(`  ${attr}${item.name}: ${typeText(item.type)}${comma}`)
  }
  lines.push('}')
  return lines.join('\n')
}

function collect(type: Type, seen: Set<Type>, out: string[]): void {
  if (type.kind === 'array') {
    collect(type.of, seen, out)
    return
  }
  if (type.kind !== 'struct' || seen.has(type)) {
    return
  }
  seen.add(type)
  for (const item of type.fields) {
    collect(item.type, seen, out)
  }
  out.push(render(type))
}

export function wgsl(type: Type): string {
  const out: string[] = []
  collect(type, new Set(), out)
  if (out.length === 0) {
    return ''
  }
  return `${out.join('\n\n')}\n`
}
