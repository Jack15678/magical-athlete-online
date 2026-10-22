import { LatheGeometry, MeshPhysicalMaterial, MeshStandardMaterial, Vector2 } from 'three';

/** The existing GLB palette remains the source of every character's identity. */
function toySurface(source: MeshStandardMaterial, lowQuality: boolean) {
  const paper = source.name === 'toy-paper' || source.name === 'toy-sw-paper';
  const ink = source.name === 'toy-ink' || source.name === 'toy-sw-ink' || source.name === 'toy-sw-dark';
  const material = lowQuality ? source.clone() : new MeshPhysicalMaterial({
    color: source.color,
    side: source.side,
    vertexColors: source.vertexColors,
    flatShading: source.flatShading,
    clearcoat: paper ? .08 : ink ? .28 : .16,
    clearcoatRoughness: .52,
    specularIntensity: .65,
  });
  material.name = `${source.name}-${lowQuality ? 'matte' : 'satin'}`;
  material.roughness = paper ? .64 : ink ? .38 : .5;
  material.metalness = 0;
  return material;
}

/** Cache ownership is independent of mounted racers, like useGLTF's geometry cache. */
export class ToyResourceCache {
  private palette = new WeakMap<MeshStandardMaterial, Map<boolean, MeshStandardMaterial>>();
  private materials = new Set<MeshStandardMaterial>();
  private bases = new Map<boolean, { body: LatheGeometry; cap: LatheGeometry }>();
  private ownership = new Map<string, MeshStandardMaterial>();

  characterMaterial(source: MeshStandardMaterial, lowQuality: boolean) {
    let variants = this.palette.get(source);
    if (!variants) { variants = new Map(); this.palette.set(source, variants); }
    let material = variants.get(lowQuality);
    if (!material) {
      material = toySurface(source, lowQuality);
      variants.set(lowQuality, material);
      this.materials.add(material);
    }
    return material;
  }

  baseGeometry(lowQuality: boolean) {
    let geometry = this.bases.get(lowQuality);
    if (!geometry) {
      // A turned, radiused profile gives the ownership band a soft rim without
      // adding separate trim meshes. Both quality tiers keep the same silhouette.
      const lathe = (profile: [number, number][]) => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), lowQuality ? 12 : 24);
      geometry = {
        body: lathe([[0, 0], [.278, 0], [.305, .009], [.323, .027], [.33, .048], [.33, .078], [.321, .1], [.303, .115], [0, .115]]),
        cap: lathe([[0, .113], [.258, .113], [.277, .118], [.286, .129], [.286, .145], [.277, .157], [.257, .162], [0, .162]]),
      };
      this.bases.set(lowQuality, geometry);
    }
    return geometry;
  }

  baseMaterial(color: string, lowQuality: boolean, cap = false) {
    const key = `${cap ? 'cap' : color}:${lowQuality}`;
    let material = this.ownership.get(key);
    if (!material) {
      material = lowQuality ? new MeshStandardMaterial() : new MeshPhysicalMaterial({ clearcoat: cap ? .08 : .18, clearcoatRoughness: .55, specularIntensity: .65 });
      material.color.set(cap ? '#fff6df' : color);
      material.roughness = cap ? .66 : .5;
      material.metalness = 0;
      material.name = `ownership-${key}`;
      this.ownership.set(key, material);
      this.materials.add(material);
    }
    return material;
  }

  /** Only the cache owner may release shared resources; never dispose GLB inputs. */
  dispose() {
    this.materials.forEach(material => material.dispose());
    this.bases.forEach(({ body, cap }) => { body.dispose(); cap.dispose(); });
    this.materials.clear(); this.bases.clear(); this.ownership.clear();
    this.palette = new WeakMap();
  }
}

export const toyResources = new ToyResourceCache();

// Keep resources while useGLTF keeps its source scene cached. A hot replacement
// owns a new cache and must release the previous module's GPU resources.
(import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot?.dispose(() => toyResources.dispose());
