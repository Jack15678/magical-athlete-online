# 3D toy racer assets

The existing React application uses React Three Fiber. The asset work follows the requested [React Three Fiber game skill](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/react-three-fiber-game/SKILL.md) and [web 3D asset pipeline skill](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/web-3d-asset-pipeline/SKILL.md).

`scripts/generate-3d-assets.mjs` is the editable source for 36 original geometric toy sculptures, continuing the silhouettes and colors of `src/client/avatars.tsx`. No game artwork is traced or embedded. Each character has a distinct mesh silhouette: the banana crescent, rabbit ears, house on legs, brain, blimp, shoe, frog, rocket, ruler, fish, heart, paired cats/twins, crown and wheel are geometry rather than billboard portraits. Faces also have real volume.

## Runtime contract

- Asset: `public/models/toy-racers.glb`, glTF 2.0 with Meshopt compression; 465,736 bytes for all 36 sculptures.
- Stable node names: `toy_${characterId}`; all 36 rule-engine character IDs are present.
- Units: metres; +Y up; +Z is the face direction; origin is the ground centre. Authored figure height is at most 1.015 units, with width and depth at most 0.59 units. The ownership base in the React component makes the overall height at most 1.1 and footprint 0.6 units.
- Ten shared PBR plastic materials, no textures, no skinning, no external image requests. Character submeshes are merged by material into 3–6 draws per model. The whole set contains 76,270 triangles (usually about 2,100 per character; maximum 4,224). Geometry and materials are shared between instances by the GLTF loader cache.
- Dynamic key/fill light and contact shadows are supplied by the board scene. The character wrapper casts shadows at normal quality; low quality disables model shadow casting.
- Character collision and gameplay come entirely from the rule engine. These are presentation meshes; no physics colliders or collision-authoritative data is shipped.
- Each small token is already low-poly; no texture/mesh LOD downloads are needed. Low quality reduces ring segments and shadows. Animation is applied to the parent group rather than deforming the model.

```tsx
import { ToyCharacter } from './scene/ToyCharacter.js';

<ToyCharacter characterId="hare" color="#e36b60" lowQuality={false} />
```

The wrapper has its own Suspense fallback, ground-level ownership base and contrasting ring. Keep player name/seat badges in the accessible overlay. The runtime loads the GLB with Drei `useGLTF`, whose bundled Meshopt decoder is enabled. No decoder CDN is required for this asset. The application's CSP must allow `'wasm-unsafe-eval'` in `script-src` for the bundled decoder's WebAssembly initialization.

## Rebuild and optimize

Generate deterministic, texture-free source meshes:

```sh
node scripts/generate-3d-assets.mjs
```

Then use glTF Transform 4.5.1 without flattening away the character roots:

```sh
pnpm --package=@gltf-transform/cli dlx gltf-transform dedup public/models/toy-racers.glb public/models/toy-racers.glb
pnpm --package=@gltf-transform/cli dlx gltf-transform prune public/models/toy-racers.glb public/models/toy-racers.glb
pnpm --package=@gltf-transform/cli dlx gltf-transform meshopt public/models/toy-racers.glb public/models/toy-racers.glb
pnpm --package=@gltf-transform/cli dlx gltf-transform validate public/models/toy-racers.glb
```

Alternatively pass the absolute path of an installed glTF Transform `bin/cli.js` to the generator; it performs those four steps and records the compressed size in the manifest:

```sh
node scripts/generate-3d-assets.mjs --optimizer /absolute/path/to/@gltf-transform/cli/bin/cli.js
```

The checked-in `toy-racers.manifest.json` records every character's dimensions, draw count and triangle count. The indexed uncompressed asset is about 1.53 MiB; material/accessor deduplication and Meshopt reduce it to about 455 KiB. Do not replace it with the raw generated export before release.

## Verified

The export script checks ground pivots and every model's dimensions using precise mesh bounds. The optimized file was also decoded through Three.js `GLTFLoader` with `MeshoptDecoder`: all 36 roots loaded with their expected names, pivot tolerance below 0.001 units, width/depth below 0.601 and figure height below 1.101 units. TypeScript checking passes.

glTF Transform's validator reports zero errors and zero warnings. Its informational messages state that the validator does not inspect the Meshopt extension itself and that its buffer can appear unused; the successful runtime decoder and bounds check cover this extension path. Browser visual verification is performed with the integrated board scene.
