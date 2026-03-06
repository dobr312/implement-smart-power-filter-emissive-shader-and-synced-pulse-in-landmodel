# Specification

## Summary
**Goal:** Implement a complete integrated render pipeline in `CubeVisualization.tsx` with ACES tonemapping, sharpening, glints, and correct multi-composer layer rendering.

**Planned changes:**
- Configure the global renderer in `onCreated`: set `gl.toneMapping = THREE.NoToneMapping`, `gl.autoClear = false`, `gl.setClearColor(0x000000, 1.0)`, without changing `gl.outputColorSpace` or `gl.toneMappingExposure`
- Set `UnrealBloomPass` parameters to intensity `0.8`, radius `0.65`, threshold `0.1`, and conditionally apply `luminanceSmoothing = 0.1` if the property exists
- Set `bloomComposer.renderToScreen = false` and `finalComposer.renderToScreen = true`; initialize `bloomTexture` as `new THREE.Texture()` to prevent startup crashes
- Replace the composite shader fragment with a full ACES tonemapping + sharpening (strength `0.15`) + glints (threshold `2.5`, strength `3.0`) implementation using NaN-safe resolution division; remove `HueSaturationPass` from all composer chains; ensure `CompositePass` is the final pass in `finalComposer`
- Implement a robust `useFrame` render loop: guard rendering when canvas size is zero, render bloom on layer 1, render final pass on layers 0+1, update resolution uniform per frame using DPR-adjusted pixel dimensions, and assign `bloomTexture` from `readBuffer.texture`
- Configure `BackgroundSphere` with `layers={0}` and `renderOrder={-1000}`; update its fragment shader to use NaN-safe resolution normalization
- Change the `Suspense` fallback from `null` to `<color attach="background" args={["#000000"]} />` for an opaque black canvas during loading

**User-visible outcome:** The 3D cube visualization renders with a stable black background, correct bloom layering, ACES-tonemapped colors, subtle sharpening and glint highlights, and no transparent flash or NaN artifacts during load or resize.
