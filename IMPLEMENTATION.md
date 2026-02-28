# Wilson Ball — Complete Implementation Spec

This document contains the exact technical specifications, state mechanics, and algorithms required for an agentic AI to recreate the Wilson Ball 3D application from scratch.

## 1. Core Stack & Dependencies

- **Framework:** React 18 + Vite
- **Renderer:** Three.js (`three` ^0.160.0)
- **Declarative WebGL:** React Three Fiber (`@react-three/fiber` ^8.15.0)
- **Helpers:** Drei (`@react-three/drei` ^9.96.0)
- **Effects:** Postprocessing (`@react-three/postprocessing` ^2.16.0)
- **Assets:** Single GLTF file (`/Ball.gltf`), compressed textures (.webp, .jpg).

## 2. Directory Structure & Files

The project consists of exactly 6 files:

1. `index.html`: Entry point, meta tags, and pure CSS preloader.
2. `src/main.jsx`: Standard React strict-mode root.
3. `src/App.css`: Minimal global styles (light/dark mode background, 100vh canvas).
4. `src/ManyBalls.jsx`: Main application orchestrating canvas, state, lighting, effects, and instanced mesh rendering.
5. `src/physics.js`: Pure JavaScript bespoke physics simulation class.
6. `vite.config.js`: Vite build configuration + Netlify host rules.

## 3. Global App State (`App` component)

The `App` component acts as the root orchestrator. It manages the following state:

- **Performance Mode (`isLowPower`):** Boolean. Defaults to `true` if `?compat` is in URL or WebGL is missing. Toggled via the **"M"** key.
- **Wireframe Mode (`isPrimitive`):** Boolean. Defaults to `isLowPower`. Toggled via the **"P"** key.
- **Dark Mode (`isDarkMode`):** Boolean. Initialized via `window.matchMedia('(prefers-color-scheme: dark)')`. Listens to OS changes unless manually overridden via the **"L"** key (which sets `themeOverride` to true).
- **Effects State (`effects`):** Object mapping `['Vignette', 'Shadows', 'Bloom', 'Noise', 'Environment']` to booleans. Toggled iteratively via the **"O"** key, cycling through disabling each effect in that order before re-enabling all.
- **Browser/Device Detection:**
    - `isSafari`: Caps Canvas `dpr` to `1.0` (instead of `1.5`) due to Safari Retina fragment shader throttling.
    - `isIOS`: Renders top/bottom CSS `linear-gradient` overlays matching the background color to blend the Canvas into Safari's browser chrome.

## 4. Canvas & Rendering (`ManyBalls.jsx`)

The `<Canvas>` setup utilizes strict WebGL parameters to optimize memory:
- `gl={{ antialias: true, powerPreference: isLowPower ? 'low-power' : 'high-performance', preserveDrawingBuffer: false, stencil: false, depth: true }}`
- **Lighting Rig:** All intensities are hardcoded per mode/theme to avoid runtime multipliers:
    - `ambientLight` — High-perf: `0.0125` (Dark), `0` (Light). Compat: `0.25` (Dark), `0.45` (Light).
    - `directionalLight` — High-perf: `2.5` (Dark), `3.0` (Light). Compat: `2.75` (Dark), `2.5` (Light).
    - `pointLight` 1 — Base fill: `0.25` (Dark), `0.1` (Light).
    - `pointLight` 2 — High-perf accent: `0.05` (Dark), `0.02` (Light).
    - `Environment` map (city preset) is enabled in **both** themes, with `environmentIntensity` set to `0.06` (6%) in Dark Mode and `0.4` (40%) in Light Mode.
    - Shadows: `4096x4096` map with a tight `+/- 55` unit frustum and `shadow-bias: -0.002` in high-perf.
- **Visual Sun:** A sphere mesh with an `emissive` material (`intensity: 17` in high-perf; or `meshBasicMaterial` with `toneMapped={false}` combining `#fff5e0` in dark compat and `#ffffff` in light compat). It is overlaid with a `<Billboard>` containing a custom `THREE.ShaderMaterial`. This procedural shader calculates a mathematically perfect radial gradient in 32-bit float precision per-pixel on the GPU, avoiding the color banding and dithering artifacts inherent to 8-bit Canvas Textures. It also injects a microscopic high-frequency noise dither (`fract(sin(...) * ...)`) to guarantee flawless visual falloff on consumer monitors. The billboard scales to `[70, 70, 1]` in high-perf, `[40, 40, 1]` in dark compat, and `[80, 80, 1]` in light compat to blend seamlessly.
- **Postprocessing:** `EffectComposer` is wrapped in an `if (!isLowPower)`. The composer uses `multisampling={4}` and `disableNormalPass` to save memory. Effects included: `Bloom` (threshold 1.2), `Noise` (opacity 0.022 / 2.2%), `Vignette` (darkness adjusts dynamically based on `isDarkMode`).
- **Compatibility Mode Saturation:** In `isLowPower` mode, a CSS `filter: saturate(0.8)` is applied to the Canvas element to reduce oversaturated colors from the simplified lighting.

### 4.1 Recreating the Basketballs (InstancedMesh)

To render 80 items in a single draw call:
1. `useGLTF('/Ball.gltf')` unzips the mesh and materials.
2. **Texture Fixes:** All material `map`, `normalMap`, and `roughnessMap` anisotropic values are set to `gl.capabilities.getMaxAnisotropy()`. `normalScale` is softened to `[0.7, 0.7]` to prevent specular shimmering.
3. **Geometry Centering (CRITICAL):** GLTF pivots rarely lie at exact geometric centers. The mesh geometry is cloned, `computeBoundingSphere` is called, and the geometry is translated by `-boundingSphere.center`. This guarantees the physics collision radius maps perfectly 1:1 with the visual mesh bounding box.
4. **InstancedMesh Initialization:** `<instancedMesh args={[geometry, material, 80]}>`. A secondary wireframe `instancedMesh` runs concurrently (visible depending on `isPrimitive`), built using a `THREE.SphereGeometry` matched perfectly to the centered bounding sphere radius. Wireframe segment density: `24×24` in high-perf, `12×12` in compatibility mode.
5. **Memory Management:** Cloned geometries and generated textures are explicitly destroyed on unmount using `useEffect(() => () => resource.dispose(), [resource])`. Global caching is active (`THREE.Cache.enabled = true`).

## 5. Custom Physics Engine (`physics.js`)

The core physics loop is purely mathematical, relying on manually injected updates via the `useFrame` loop. The engine is instantiated once as `new PhysicsSimulator(count, radius)`. 

On every frame:
1. The world camera position is transformed into the InstancedMesh's local space.
2. `physics.step(localCamPos)` is invoked.
3. `physics.updateInstances(meshRef, primRef)` writes the updated positions/rotations out to the `THREE.InstancedMesh` matrices and marks them `needsUpdate = true`.

### 5.1 Simulation Constants & Thresholds
- `BOUNDARY_RADIUS: 40` (Invisible bounding sphere)
- `CAMERA_SAFE_RADIUS: 12` (Prevents balls clipping into the camera)
- `RESTITUTION: 0.85` (Elasticity of bounces)
- `SUB_STEPS: 2` (Logic iterations per frame)
- `SOLVER_ITERATIONS: 6` (Constraint tightness per sub-step)
- `AURA_RADIUS_SQ: (radius * 2.5)²` 
- `MIN_DIST_SQ: (radius * 2 + 0.05)²`
- Variables like `maxSpeedSq` and `dampingFactor` (air resistance) are precomputed in the constructor.

### 5.2 The 4-Pass Algorithm
The engine processes the particle array `particles[]` containing `position`, `velocity`, `rotation` (Euler), and `rotVel` (spin).

**Pass 1: Unified Pair Loop (O(n²))**
Iterates every unique pair `i` and `j > i`.
1. Calculates `distSq = p1.pos.distanceToSquared(p2.pos)`.
2. If `distSq > AURA_RADIUS_SQ`, `continue` (no interaction).
3. If `distSq < MIN_DIST_SQ`, an overlapping **Hard Collision** has occurred. The distance is normalized (`sqrt` is evaluated here). Balls are forcefully pushed out of each other (Position correction = `55%` of penetration depth each). An impulse is applied to velocities using the dot product of their relative velocity and the normalized axis.
4. If distance is between Hard and Aura, a **Soft Repulsion** applies. A quadratic falloff equation applies a gentle velocity push.
5. Handles boundary containment (balls crossing `BOUNDARY_RADIUS` are pushed back and velocity inverted).
6. Handles Camera forcefield (balls closer to `cameraPosition` than `CAMERA_SAFE_RADIUS` are pushed away).

**Pass 2: Iterative Solver**
Loops `SOLVER_ITERATIONS` times over the entire set, re-evaluating *only* Hard Collisions, Boundary, and Camera constraints. This prevents overlapping "clumps" of balls where moving A pushes B into C.

**Pass 3: Integration**
1. Each ball's `velocity` is multiplied by `dampingFactor`.
2. If `velocity.lengthSq() > maxSpeedSq`, velocity is clamped to `maxSpeed`.
3. `velocity` is added to `position`. (Applying velocities *after* all constraints guarantees mathematical stability).

**Pass 4: Idle Diffusion**
Calculates the Total Kinetic Energy (sum of all `velocity.lengthSq()`). If the system has "settled" (KE < `0.05`) on the final sub-step, a uniform pair-loop adds a tiny repulsive velocity `push = force * (1 - dist / maxRadi)` to all pairs within a `BOUNDARY_RADIUS * 0.75` radius. This slowly pushes the clustered balls apart until they evenly fill the invisible boundary volume.

## 6. Real-Time Interactions

- **Scene Orbit:** Utilizes Drei's `<OrbitControls>` configured to auto-rotate outward, with pan disabled, zoom bounded (`minDistance=35`, `maxDistance=63`), and damping enabled.
- **Native Loading:** The `index.html` inline `<style>` and `div#preloader` contain a CSS-animated `loading-ball.webp` that renders instantly. The `Loader` component hooks into WebGL asset progress and removes the HTML element when WebGL is fully hydrated, avoiding any white flash.
- **Mode-Specific Lighting:** The `<Environment />` component (city preset) is active in both themes. Dark Mode uses `environmentIntensity: 0.06` (6%) for subtle reflections. Light Mode uses `environmentIntensity: 0.4` (40%). All other lighting values are explicitly defined per-theme in the component's JSX without runtime scaling multipliers.
