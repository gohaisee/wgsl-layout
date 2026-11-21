# wgsl-layout

this counts where each field sits in a webgpu uniform or storage buffer, and prints the matching wgsl struct.

js and the shader do not share one idea of a struct. a `vec3<f32>` stores 12 bytes and lines up on 16. the next `f32` is allowed to use the leftover 4, at byte 12. if you write four floats for the vector, you wipe that `f32`. an `array<f32, N>` steps by 4. in a storage buffer that is legal. in a uniform buffer the stride must be a multiple of 16, so the same array is a shader error. counting `offset + 12` by hand is how those two disagree.

```ts
import {
  array,
  f32,
  field,
  layout,
  readF32,
  struct,
  vec3f,
  views,
  wgsl,
  writeF32,
  writeVec,
} from 'wgsl-layout'

const light = struct('Light', [
  field('pos', vec3f),
  field('radius', f32),
])

const laid = layout(light, 'storage')
const pos = laid.fields.find((item) => item.name === 'pos')
const radius = laid.fields.find((item) => item.name === 'radius')
if (pos === undefined || radius === undefined) {
  throw new Error('missing field')
}

const raw = new ArrayBuffer(laid.size)
const view = views(raw)
writeVec(view.f32, pos.offset, 3, new Float32Array([1, 2, 3]))
writeF32(view.f32, radius.offset, 4)

console.log(pos.offset, radius.offset, laid.size)
console.log(readF32(view.f32, radius.offset))
console.log(wgsl(light))
```

that run printed:

```
0 12 16
4
struct Light {
  pos: vec3<f32>,
  radius: f32
}
```

`pos` is at byte 0. `radius` is at byte 12. the struct is 16 bytes. the write of three floats left `radius` alone, and the read returned 4.

`array(f32, 4)` in storage is 16 bytes. the same field in uniform throws:

```
wgsl-layout: field "values" array stride 4 is not a multiple of 16. wrap the element in a struct with @size(16), or use storage.
```

the numbers follow wgsl 14.4. the library does not invent padding the shader will not insert.
