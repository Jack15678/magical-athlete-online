import { build } from 'vite';

// Dedicated review build only. Production builds contain no camera override.
// Keep the real scene, shaders, rules and assets intact; expose observability
// from the same R3F store that renders the screenshots.
await build({
  plugins: [{
    name: 'art-qa-camera-observability',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/src\/client\/scene\/(?:Board3D|CameraRig)\.tsx$/.test(id.replaceAll('\\', '/'))) return;
      const anchor = code.match(/const frame = cameraFrame\([^;]*\);/)?.[0];
      if (!anchor) return;
      return code.replace(anchor, `${anchor}
  const qaGl = useThree(s => s.gl);
  useEffect(() => {
    const api = {
      getCamera: () => ({ position: camera.position.toArray(), target: controls.current?.target.toArray(), zoom: (camera as THREE.OrthographicCamera).zoom, up: camera.up.toArray() }),
      setCamera: (pose: { position: number[]; target: number[]; zoom: number; up: number[] }) => { userDrag.current = true; camera.position.fromArray(pose.position); camera.up.fromArray(pose.up); controls.current?.target.fromArray(pose.target); (camera as THREE.OrthographicCamera).zoom = pose.zoom; camera.updateProjectionMatrix(); controls.current?.update(); invalidate(); },
      render: () => { invalidate(); },
      stats: () => { const ctx = qaGl.getContext(); const debug = ctx.getExtension('WEBGL_debug_renderer_info'); return { renderedFrames: qaGl.info.render.frame, calls: qaGl.info.render.calls, triangles: qaGl.info.render.triangles, geometries: qaGl.info.memory.geometries, textures: qaGl.info.memory.textures, renderer: debug ? ctx.getParameter(debug.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER), pixelRatio: qaGl.getPixelRatio(), shadows: qaGl.shadowMap.enabled, toneMapping: qaGl.toneMapping, exposure: qaGl.toneMappingExposure, colorSpace: qaGl.outputColorSpace }; }
    };
    (window as unknown as { __ART_QA_SCENE__?: typeof api }).__ART_QA_SCENE__ = api;
    return () => { delete (window as unknown as { __ART_QA_SCENE__?: typeof api }).__ART_QA_SCENE__; };
  }, [camera, qaGl, invalidate]);`);
    },
  }],
});
