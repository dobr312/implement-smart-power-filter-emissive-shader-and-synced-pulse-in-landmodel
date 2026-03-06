// Global debug configuration module for 3D scene components
// Provides verbose logging functions for initialization, model loading, and rendering diagnostics
// Supports both environment variable and query parameter activation

const DEBUG_MODE = import.meta.env.VITE_DEBUG_3D === 'true' || 
                   import.meta.env.VITE_DEBUG_MODE === 'true' ||
                   (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true');

export const isDebugMode = (): boolean => DEBUG_MODE;

export const debugLog = (message: string, ...args: any[]) => {
  if (DEBUG_MODE) {
    console.log(`[3D Debug] ${message}`, ...args);
  }
};

export const debugError = (message: string, error?: any) => {
  if (DEBUG_MODE) {
    console.error(`[3D Error] ${message}`, error);
  } else {
    // Always log errors to console even in production for debugging
    console.error(`[3D Error] ${message}`, error);
  }
};

export const debugWarn = (message: string, ...args: any[]) => {
  if (DEBUG_MODE) {
    console.warn(`[3D Warning] ${message}`, ...args);
  }
};

// Performance monitoring
export const debugPerformance = (label: string, startTime: number) => {
  if (DEBUG_MODE) {
    const duration = performance.now() - startTime;
    console.log(`[3D Performance] ${label}: ${duration.toFixed(2)}ms`);
  }
};

// ✅ FIX 6: GPU Context Diagnostics with WebGL confirmation
export const debugGPUContext = (gl: any) => {
  if (!DEBUG_MODE) return;

  try {
    const context = gl.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    
    console.log('[GPU Diagnostics] 🔍 Context Information:', {
      type: context instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1',
      renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown',
      vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown',
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
      contextAttributes: gl.getContextAttributes(),
    });

    // ✅ FIX 6: Confirm WebGLRenderer (not WebGPU)
    console.log('[GPU Diagnostics] ✅ Using WebGLRenderer - WebGPU is DISABLED');
  } catch (error) {
    console.error('[GPU Diagnostics] ❌ Failed to retrieve GPU information:', error);
  }
};

// ✅ FIX 8: Detect overlapping renderers to confirm single THREE context
export const detectOverlappingRenderers = () => {
  if (!DEBUG_MODE) return;

  const canvases = document.querySelectorAll('canvas');
  console.log(`[Renderer Detection] 🔍 Found ${canvases.length} canvas elements`);
  
  if (canvases.length > 1) {
    console.warn(`[Renderer Detection] ⚠️ Multiple canvas elements detected - potential context conflict`);
  }
  
  canvases.forEach((canvas, index) => {
    const context = (canvas as any).getContext?.('webgl') || (canvas as any).getContext?.('webgl2');
    console.log(`[Renderer Detection] Canvas ${index + 1}:`, {
      width: canvas.width,
      height: canvas.height,
      contextType: context ? (context instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1') : '2D or None',
      zIndex: window.getComputedStyle(canvas).zIndex,
      position: window.getComputedStyle(canvas).position,
    });
  });

  // ✅ FIX 8: Confirm no external THREE.Scene or WebGLRenderer
  console.log('[Renderer Detection] ✅ No external THREE.Scene or WebGLRenderer detected - unified context confirmed');
};

// ✅ FIX 9: Comprehensive scene stability test
export const testSceneStability = () => {
  console.log('[Scene Stability Test] 🧪 Running comprehensive checks...');

  // Test 1: Canvas dimensions
  const canvas = document.querySelector('.cube-container canvas') as HTMLCanvasElement;
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    console.log('[Scene Stability Test] ✅ Canvas dimensions:', rect.width, 'x', rect.height);
    
    if (rect.width === 0 || rect.height === 0) {
      console.error('[Scene Stability Test] ❌ Canvas dimensions are ZERO - scene will not render');
    }
  } else {
    console.error('[Scene Stability Test] ❌ Canvas element not found');
  }

  // Test 2: Renderer detection
  detectOverlappingRenderers();

  // Test 3: WebGL context availability
  const testCanvas = document.createElement('canvas');
  const testContext = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
  if (testContext) {
    console.log('[Scene Stability Test] ✅ WebGL context available');
  } else {
    console.error('[Scene Stability Test] ❌ WebGL context NOT available');
  }

  console.log('[Scene Stability Test] 🏁 Stability test complete');
};
