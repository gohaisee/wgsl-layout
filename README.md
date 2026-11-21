# wgsl-layout

```ts
import { f32, field, layout, struct, vec3f } from 'wgsl-layout'

const light = struct('Light', [
  field('pos', vec3f),
  field('radius', f32),
])

const laid = layout(light, 'storage')
```

`pos` is at byte 0. `radius` is at byte 12. The struct is 16 bytes.

`array(f32, 4)` is 16 bytes in storage. The same array throws in uniform, because its stride is 4 and a uniform array must step by a multiple of 16.

The numbers come from WGSL 14.4. A vec3 lines up on 16 bytes and stores 12.
