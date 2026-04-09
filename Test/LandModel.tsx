import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

// Anchor beacon names are [crlmk]_NN (e.g. c_01, r_15, k_01)
const ANCHOR_PATTERN = /^[crlmk]_\d{2}$/;

interface LandModelProps {
  modelUrl: string;
  biome?: string;
  /** Called once after the model loads with a map of anchor name → world position */
  onAnchorsReady?: (positions: Map<string, THREE.Vector3>) => void;
}

export default function LandModel({
  modelUrl,
  biome,
  onAnchorsReady,
}: LandModelProps) {
  const { gl, camera } = useThree();
  const fittedRef = useRef(false);
  const group = useRef<THREE.Group>(null);

  // Cached list of emissive materials — rebuilt every time modelUrl changes
  const emissiveMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // Reset state when biome/model changes so emissive init runs again for new model
  // biome-ignore lint/correctness/useExhaustiveDependencies: modelUrl is the reset trigger, refs don't need to be deps
  useEffect(() => {
    fittedRef.current = false;
    emissiveMaterialsRef.current = [];
  }, [modelUrl]);

  const ktx2Loader = useMemo(() => {
    const loader = new KTX2Loader();
    loader.setTranscoderPath(
      "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/libs/basis/",
    );
    loader.detectSupport(gl);
    return loader;
  }, [gl]);

  const gltf = useLoader(GLTFLoader, modelUrl, (loader) => {
    loader.setKTX2Loader(ktx2Loader);
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: modelUrl included intentionally — new model = full re-init
  useEffect(() => {
    if (!gltf || !gltf.scene) return;

    gltf.scene.updateMatrixWorld();
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
    const landType = biome || "DEFAULT";
    const settings: Record<string, { env: number; emissive: number }> = {
      MYTHIC_VOID: { env: 3.0, emissive: 1.2 },
      ISLAND_ARCHIPELAGO: { env: 3.0, emissive: 1.6 },
      DESERT_DUNE: { env: 1.0, emissive: 1.05 },
      VOLCANIC_CRAG: { env: 1.5, emissive: 1.8 },
      FOREST_VALLEY: { env: 1.0, emissive: 1.0 },
      SNOW_PEAK: { env: 1.0, emissive: 1.0 },
      MYTHIC_AETHER: { env: 1.0, emissive: 1.5 },
      DEFAULT: { env: 1.0, emissive: 1.0 },
    };
    const config = settings[landType] || settings.DEFAULT;

    // Rebuild emissive cache for this model
    emissiveMaterialsRef.current = [];

    if (gltf.scene?.isObject3D) {
      gltf.scene.traverse((obj: any) => {
        if (obj.isMesh && obj.material) {
          obj.frustumCulled = true;
          const materials = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          let hasEmissiveMap = false;
          for (const m of materials as THREE.MeshStandardMaterial[]) {
            m.dithering = true;
            m.envMapIntensity = config.env;
            if (m.emissiveMap) {
              hasEmissiveMap = true;
              m.emissive = new THREE.Color(0xffffff);
              m.toneMapped = false;
              m.userData.baseEmissive = config.emissive;
              emissiveMaterialsRef.current.push(m);
            } else {
              m.emissive = new THREE.Color(0x000000);
              m.userData.baseEmissive = 0.0;
            }
            const textures = [
              m.map,
              m.emissiveMap,
              m.normalMap,
              m.metalnessMap,
              m.roughnessMap,
            ];
            for (const tex of textures) {
              if (tex) {
                tex.anisotropy = maxAnisotropy;
                tex.needsUpdate = true;
              }
            }
          }
          if (hasEmissiveMap) {
            obj.layers.enable(1);
          }
        }
      });
    }

    if (!fittedRef.current && camera instanceof THREE.PerspectiveCamera) {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5;
      camera.position.set(center.x, center.y, center.z + cameraZ);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      fittedRef.current = true;
    }

    if (onAnchorsReady) {
      const anchors = new Map<string, THREE.Vector3>();
      const worldPos = new THREE.Vector3();
      gltf.scene.traverse((obj: THREE.Object3D) => {
        if (ANCHOR_PATTERN.test(obj.name)) {
          obj.getWorldPosition(worldPos);
          anchors.set(obj.name, worldPos.clone());
        }
      });
      if (anchors.size > 0) {
        onAnchorsReady(anchors);
      }
    }
  }, [gltf, gl, camera, modelUrl, biome, onAnchorsReady]);

  // Pulse: iterates only cached emissive materials, no traverse
  useFrame((state) => {
    const mats = emissiveMaterialsRef.current;
    if (mats.length === 0) return;
    const sin = Math.sin(state.clock.elapsedTime * 0.8);
    for (const m of mats) {
      const baseIntensity: number = m.userData.baseEmissive ?? 1.0;
      m.emissiveIntensity = baseIntensity * (1.0 + sin * 0.15);
    }
  });

  return (
    <group ref={group}>
      <primitive object={gltf.scene} />
    </group>
  );
}
