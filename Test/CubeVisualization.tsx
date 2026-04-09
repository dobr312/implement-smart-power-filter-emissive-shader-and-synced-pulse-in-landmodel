import type { ModifierInstance } from "@/types/backendTypes";
import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import React, {
  Suspense,
  createRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import CanvasLoader from "./CanvasLoader";
import LandModel from "./LandModel";
import ModsLayer from "./ModsLayer";

interface CubeVisualizationProps {
  biome?: string;
  /** Installed mods for the current land — drives 3D mod placement */
  installedMods?: ModifierInstance[];
  /** Current land ID — used as seed for deterministic anchor assignment */
  landId?: bigint;
}

const BIOME_MODEL_MAP: Record<string, string> = {
  FOREST_VALLEY:
    "https://raw.githubusercontent.com/dobr312/cyberland/main/public/models/FOREST_VALLEY_KTX2.glb",
  ISLAND_ARCHIPELAGO:
    "https://raw.githubusercontent.com/dobr312/cyberland/main/public/models/ISLAND_ARCHIPELAGO.glb",
  SNOW_PEAK:
    "https://raw.githubusercontent.com/dobr312/cyberland/main/public/models/SNOW_PEAK.glb",
  DESERT_DUNE:
    "https://raw.githubusercontent.com/dobr312/cyberland/main/public/models/DESERT_DUNE.glb",
  VOLCANIC_CRAG:
    "https://raw.githubusercontent.com/dobr312/cyberland/main/public/models/VOLCANIC_CRAG.glb",
  MYTHIC_VOID:
    "https://raw.githubusercontent.com/dobr312/cyberland/main/public/models/MYTHIC_VOID.glb",
  MYTHIC_AETHER:
    "https://raw.githubusercontent.com/dobr312/cyberland/main/public/models/MYTHIC_AETHER.glb",
};

const COMPOSITE_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const COMPOSITE_FRAGMENT = `
  uniform sampler2D baseTexture;
  uniform sampler2D bloomTexture;
  uniform vec2 resolution;
  uniform float exposure;
  uniform float time;
  varying vec2 vUv;

  float getLuma(vec3 v) { return dot(v, vec3(0.299, 0.587, 0.114)); }

  vec3 toneMapACES(vec3 color) {
    float tA = 2.51; float tB = 0.03; float tC = 2.43;
    float tD = 0.59; float tE = 0.14;
    vec3 x = color * exposure;
    return clamp((x * (tA * x + tB)) / (x * (tC * x + tD) + tE), 0.0, 1.0);
  }

  void main() {
    vec2 texel = 1.0 / max(resolution, vec2(1.0));
    vec3 center = texture2D(baseTexture, vUv).rgb;
    vec3 bloomRGB = texture2D(bloomTexture, vUv).rgb;

    float lumaC = getLuma(center);
    float lumaL = getLuma(texture2D(baseTexture, vUv - vec2(texel.x, 0.0)).rgb);
    float lumaR = getLuma(texture2D(baseTexture, vUv + vec2(texel.x, 0.0)).rgb);
    float lumaU = getLuma(texture2D(baseTexture, vUv - vec2(0.0, texel.y)).rgb);
    float lumaD = getLuma(texture2D(baseTexture, vUv + vec2(0.0, texel.y)).rgb);
    float sharpness = 0.12;
    float edge = 4.0 * lumaC - lumaL - lumaR - lumaU - lumaD;
    edge = clamp(edge, -0.08, 0.08);
    float sharpLimiter = clamp(1.0 - pow(lumaC, 2.0), 0.0, 1.0);
    vec3 baseRGB = center + (edge * sharpness * sharpLimiter);

    vec3 color = baseRGB + bloomRGB;
    gl_FragColor = vec4(toneMapACES(color), 1.0);
  }
`;

const keyLightRef = createRef<THREE.DirectionalLight>();
const sunLightRef = createRef<THREE.DirectionalLight>();

// ── Three.js scene internals ─────────────────────────────────────────────────────────────────

function CameraLayerSetup() {
  const { camera } = useThree();

  useEffect(() => {
    camera.layers.enable(0);
    camera.layers.enable(1);
  }, [camera]);

  return null;
}

function KeyLightSync() {
  useFrame(({ camera }) => {
    if (keyLightRef.current) {
      keyLightRef.current.position.set(
        camera.position.x + -10,
        camera.position.y + 20,
        camera.position.z + -25,
      );
    }
  });

  return (
    <directionalLight
      ref={keyLightRef}
      name="KeyLight"
      intensity={Math.PI * 1.0}
      color="#ffffff"
    />
  );
}

function SunLightSync() {
  return (
    <directionalLight
      ref={sunLightRef}
      name="SunLight"
      position={[5, 12, 25]}
      intensity={Math.PI * 0.4}
      color="#ffecd4"
    />
  );
}

const BackgroundSphere = () => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 1.0, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float time;
    uniform vec2 resolution;

    #define NUM_OCTAVES 6

    float random(vec2 pos) {
        return fract(sin(dot(pos.xy, vec2(13.9898, 78.233))) * 43758.5453123);
    }

    float noise(vec2 pos) {
        vec2 i = floor(pos);
        vec2 f = fract(pos);
        float a = random(i + vec2(0.0, 0.0));
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 pos) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
        for (int i = 0; i < NUM_OCTAVES; i++) {
            float dir = mod(float(i), 2.0) > 0.5 ? 1.0 : -1.0;
            v += a * noise(pos - 0.05 * dir * time * 0.2);
            pos = rot * pos * 2.0 + shift;
            a *= 0.5;
        }
        return v;
    }

    void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        
        vec3 c1 = vec3(0.2, 0.4, 0.9);
        vec3 c2 = vec3(1.0, 0.1, 0.6);
        vec3 c3 = vec3(0.3, 0.0, 0.5);
        vec3 c4 = vec3(0.0, 0.0, 0.02);

        float time2 = time * 0.2;
        vec2 q = vec2(fbm(p + 0.0 * time2), fbm(p + vec2(1.0)));
        vec2 r = vec2(fbm(p + q + vec2(1.7, 1.2) + 0.15 * time2), fbm(p + q + vec2(8.3, 2.8) + 0.126 * time2));
        float f = fbm(p + r);

        vec3 color = mix(c1, c2, clamp(f * 1.2, 0.0, 1.0));
        color = mix(color, c3, clamp(length(q) * 1.1, 0.0, 1.0));
        
        float blackMask = smoothstep(0.2, 0.8, length(r.x) * 0.7);
        color = mix(color, c4, blackMask);

        color = (f * f * f * 1.5 + 0.5 * f) * color;
        
        gl_FragColor = vec4(pow(color, vec3(2.0)) * 5.0, 1.0);
    }
  `;

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
    }),
    [],
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.getElapsedTime();
      const canvas = state.gl.domElement;
      materialRef.current.uniforms.resolution.value.set(
        canvas.width,
        canvas.height,
      );
    }
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1000}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
        transparent={false}
      />
    </mesh>
  );
};

function SceneSetup() {
  const { scene } = useThree();

  useEffect(() => {
    scene.background = null;
    scene.fog = new THREE.FogExp2(0x05010a, 0.0015);
  }, [scene]);

  return null;
}

function SelectiveBloomEffect() {
  const { gl, scene, camera, size } = useThree();

  const bloomComposerRef = useRef<EffectComposer | null>(null);
  const finalComposerRef = useRef<EffectComposer | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const compositePassRef = useRef<ShaderPass | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: size used only for initial bloom setup
  useEffect(() => {
    gl.setClearAlpha(1);

    const bloomComposer = new EffectComposer(gl);
    bloomComposer.renderToScreen = false;
    bloomComposerRef.current = bloomComposer;

    const bloomRenderPass = new RenderPass(scene, camera);
    bloomComposer.addPass(bloomRenderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.width / 2, size.height / 2),
      0.85,
      0.18,
      0.4,
    );
    if ("luminanceSmoothing" in bloomPass) {
      (bloomPass as any).luminanceSmoothing = 0.1;
    }
    bloomPassRef.current = bloomPass;
    bloomComposer.addPass(bloomPass);

    const finalComposer = new EffectComposer(gl);
    finalComposer.renderToScreen = true;
    finalComposerRef.current = finalComposer;

    const finalRenderPass = new RenderPass(scene, camera);
    finalComposer.addPass(finalRenderPass);

    const compositePass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: bloomComposer.renderTarget2.texture },
          exposure: { value: 1.4 },
          resolution: { value: new THREE.Vector2() },
          time: { value: 0.0 },
        },
        vertexShader: COMPOSITE_VERTEX,
        fragmentShader: COMPOSITE_FRAGMENT,
        defines: {},
      }),
      "baseTexture",
    );
    compositePass.needsSwap = true;
    compositePassRef.current = compositePass;
    finalComposer.addPass(compositePass);

    return () => {
      bloomPassRef.current?.dispose();
      bloomPassRef.current = null;
      bloomComposerRef.current?.dispose();
      bloomComposerRef.current = null;
      finalComposerRef.current?.dispose();
      finalComposerRef.current = null;
      compositePassRef.current = null;
    };
  }, [gl, scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bloomComposerRef.current) {
      bloomComposerRef.current.setSize(size.width, size.height);
    }
    if (finalComposerRef.current) {
      finalComposerRef.current.setSize(size.width, size.height);
    }
    if (bloomPassRef.current) {
      bloomPassRef.current.resolution.set(size.width / 2, size.height / 2);
    }
  }, [size.width, size.height]);

  useFrame((state) => {
    if (!bloomComposerRef.current || !finalComposerRef.current) return;

    const bloomComposer = bloomComposerRef.current;
    const finalComposer = finalComposerRef.current;

    const keyLight =
      keyLightRef.current ??
      (scene.getObjectByName("KeyLight") as THREE.DirectionalLight | null);
    const sunLight =
      sunLightRef.current ??
      (scene.getObjectByName("SunLight") as THREE.DirectionalLight | null);

    const pKey = keyLight?.intensity ?? 0;
    const pSun = sunLight?.intensity ?? 0;

    if (keyLight) keyLight.intensity = 0;
    if (sunLight) sunLight.intensity = 0;

    const savedEnv = scene.environment;
    scene.environment = null;

    camera.layers.set(1);
    bloomComposer.render();

    if (keyLight) keyLight.intensity = pKey;
    if (sunLight) sunLight.intensity = pSun;
    scene.environment = savedEnv;

    camera.layers.enable(0);
    camera.layers.enable(1);

    const mat = compositePassRef.current?.material as
      | THREE.ShaderMaterial
      | undefined;
    if (mat?.uniforms) {
      mat.uniforms.resolution.value.set(
        state.size.width * state.viewport.dpr,
        state.size.height * state.viewport.dpr,
      );
      mat.uniforms.bloomTexture.value = bloomComposer.renderTarget2.texture;
      mat.uniforms.time.value = state.clock.elapsedTime;
    }

    finalComposer.render();
  }, 1);

  return null;
}

export default function CubeVisualization({
  biome,
  installedMods,
  landId,
}: CubeVisualizationProps) {
  const modelUrl = useMemo(() => {
    if (!biome) return null;
    const url = BIOME_MODEL_MAP[biome];
    return url || null;
  }, [biome]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Anchor positions extracted from the land GLB by LandModel
  const [anchorPositions, setAnchorPositions] = useState<
    Map<string, THREE.Vector3>
  >(new Map());

  const handleAnchorsReady = useCallback(
    (positions: Map<string, THREE.Vector3>) => {
      setAnchorPositions(positions);
    },
    [],
  );

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen toggle error:", error);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  if (!modelUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-cyan-400">
        3D model unavailable
      </div>
    );
  }

  const hasMods =
    installedMods && installedMods.length > 0 && landId !== undefined;

  return (
    <div ref={containerRef} className="relative w-full h-full group">
      {/* Biome Portal loader — shown while scene initialises */}
      <CanvasLoader modelUrl={modelUrl} />

      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: false,
          ...({ dithering: true } as any),
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.setClearAlpha(1);
        }}
      >
        <Suspense fallback={null}>
          <SceneSetup />
          <CameraLayerSetup />
          <BackgroundSphere />
          <LandModel
            modelUrl={modelUrl}
            biome={biome}
            onAnchorsReady={handleAnchorsReady}
          />
          {/* ModsLayer is lazy — only mounts tiers that have installed mods */}
          {hasMods && (
            <ModsLayer
              installedMods={installedMods!}
              anchorPositions={anchorPositions}
              landId={landId!}
            />
          )}
          <Environment
            files="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/artist_workshop_1k.hdr"
            environmentIntensity={1.5}
            blur={0}
          />
          <hemisphereLight
            intensity={0.3}
            color="#f7f7f7"
            groundColor="#3a3a3a"
          />
          <KeyLightSync />
          <SunLightSync />
          <OrbitControls makeDefault />
          <SelectiveBloomEffect />
        </Suspense>
      </Canvas>

      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute bottom-4 right-4 z-50 opacity-0 group-hover:opacity-100 p-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-white transition-all hover:bg-black/60 active:scale-95"
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <title>Exit fullscreen</title>
            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <title>Enter fullscreen</title>
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
        )}
      </button>
    </div>
  );
}
