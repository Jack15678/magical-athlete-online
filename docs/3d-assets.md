# 3D toy racer assets

The existing React application uses React Three Fiber. The asset work follows the requested [React Three Fiber game skill](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/react-three-fiber-game/SKILL.md) and [web 3D asset pipeline skill](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/web-3d-asset-pipeline/SKILL.md).

The 36 original geometric toy sculptures continue the silhouettes and colors of `src/client/avatars.tsx`. Their refined editable Blender source is `assets/blender/toy-racers.blend`; the reproducible pipeline is `scripts/generate-3d-assets.mjs --blender-source` followed by `scripts/refine-blender-models.py`. See [Blender refinement, coverage and verification](./blender-models.md). No game artwork is traced or embedded. Each character has a distinct real mesh silhouette and volumetric face.

## Runtime contract

- Asset: `public/models/toy-racers.glb`, glTF 2.0 with native Blender Meshopt compression. The exact current size, per-character refinement and geometry counts are recorded in [the shipping manifest](../public/models/toy-racers.manifest.json); the complete 36-character pack stays below 2 MiB.
- Stable node names: `toy_${characterId}`; all 36 rule-engine character IDs are present.
- Units: metres; +Y up; +Z is the face direction; origin is the ground centre. Authored figure height is at most 1.015 units, with width and depth at most 0.59 units. The React wrapper places the figure 0.164 above the tile; the complete figure/base height is at most 1.179 and the ownership base diameter is 0.66 units.
- Ten shared PBR plastic materials, no textures, no skinning, no external image requests. Character submeshes are merged by material into at most 8 draws per model. Each figure stays below 10,000 triangles and the complete catalog below 220,000; an eight-racer board therefore has a worst-case character budget below 80,000 triangles. Geometry and materials are shared between instances by the GLTF loader cache.
- Dynamic key/fill light and contact shadows are supplied by the board scene. The character wrapper casts shadows at normal quality; low quality disables model shadow casting.
- Character collision and gameplay come entirely from the rule engine. These are presentation meshes; no physics colliders or collision-authoritative data is shipped.
- Each small token is already low-poly; no texture/mesh LOD downloads are needed. Low quality reduces ring segments and shadows. Animation is applied to the parent group rather than deforming the model.

```tsx
import { ToyCharacter } from './scene/ToyCharacter.js';

<ToyCharacter characterId="hare" color="#e36b60" lowQuality={false} />
```

The wrapper has its own Suspense fallback, ground-level ownership base and contrasting ring. Keep player name/seat badges in the accessible overlay. The runtime loads the GLB with Drei `useGLTF`, whose bundled Meshopt decoder is enabled. No decoder CDN is required for this asset. The application's CSP must allow `'wasm-unsafe-eval'` in `script-src` for the bundled decoder's WebAssembly initialization.

## Rebuild and optimize

Generate the original editable design descriptors, then refine and export them using the installed Blender 5.2:

```sh
node scripts/generate-3d-assets.mjs --blender-source
blender --background --threads 1 --python scripts/refine-blender-models.py
```

Blender exports the final Meshopt-compressed GLB directly and preserves all character roots. Optional independent validation with glTF Transform 4.5.1:

```sh
pnpm --package=@gltf-transform/cli dlx gltf-transform validate public/models/toy-racers.glb
```

The checked-in `toy-racers.manifest.json` records every character's dimensions, draw count, triangle count and actual Blender refinement. The generator without `--blender-source` retains the legacy primitive export for historical comparison; it does not reproduce the new Blender refinement and must not overwrite the shipping export before release.

## Verified

The export script checks ground pivots and every model's dimensions using precise mesh bounds. The optimized file was also decoded through Three.js `GLTFLoader` with `MeshoptDecoder`: all 36 roots loaded with their expected names, pivot tolerance below 0.001 units, width/depth below 0.601 and figure height below 1.101 units. TypeScript checking passes.

The shipping-asset test decodes the actual embedded Meshopt buffers using Three.js, asserts the complete catalog, shared materials, geometry budget and precise ground bounds. Browser visual verification uses the integrated board scene; Blender review renders are separately labeled in [blender-models.md](./blender-models.md).
