# Wilson Ball — Implementation Reference

This document serves as the technical reference for the Wilson Ball 3D application architecture, rendering loop, and bespoke physics engine.

## 1. System Architecture

The application is a pure client-side React single-page application (SPA) with no backend. Key libraries:
- **React & Vite**: Application shell and build pipeline.
- **Three.js & React Three Fiber (@react-three/fiber)**: WebGL renderer wrapper.
- **Drei (@react-three/drei)**: Ecosystem helpers (`useGLTF`, `OrbitControls`, `Environment`, `useProgress`).
- **Postprocessing (@react-three/postprocessing)**: Full-screen post-processing effects (Bloom, Vignette, Noise).

### 1.1 Loading Lifecycle (`index.html` → `Loader`)
To guarantee an instant first-paint, an HTML/CSS-only preloader (`<div id="preloader">`) is embedded directly in `index.html`. 
Inside React, the `Loader` component hooks into Three.js's `useProgress()` and waits for the 3D assets to reach 100%. Once downloaded, it simply applies a `.fade-out` CSS class to the native HTML element, bridging the gap between raw CSS loading and WebGL hydration seamlessly.

## 2. Rendering Optimization (`Basketballs` inside `ManyBalls.jsx`)

Rendering 80 unique physical objects with 6-pass collision physics plus cinematic post-processing requires extreme optimization to maintain 60 FPS on mobile.

### 2.1 InstancedMesh
Instead of creating 80 `Mesh` components, the system uses a single `Three.InstancedMesh`. This allows WebGL to render all 80 balls in a **single draw call**. The React `useFrame` loop dynamically writes 80 transformation matrices (position/rotation) per frame to animate them.

### 2.2 Geometry Centering
Asset bounding boxes from GLTF files are rarely perfectly centered at `[0,0,0]`. The `centeredGeo` `useMemo` block clones the loaded geometry and manually translates it based on its bounding sphere. Without this, the invisible physics collision sphere would not align with the visible mesh.

### 2.3 GPU Resource Management
When components remount or the user cycles High Performance / High Compatibility mode, React garbage-collects the JS objects, but WebGL keeps Geometries, Materials, and Textures in VRAM, causing memory leaks (up to 1.4GB in early versions). 
- Every manually created or cloned `Three.*` object employs an explicit `useEffect(() => () => .dispose())` cleanup.
- `THREE.Cache.enabled = true` prevents the browser from redundantly re-parsing binary buffers across remounts.

### 2.4 Device Detection & Tiers
- **High Performance (Default)**: 80 balls, PCFSoftShadows, Bloom, Vignette, Noise, HDRI Environment mapping.
- **High Compatibility (Low Power)**: 40 balls, hard shadows, basic materials, no post-processing.
- **Safari Retina Protection**: Safari severely throttles computationally heavy fragment shaders. `dpr` (Device Pixel Ratio) is hard-capped to `1.0` if `isSafari` to prevent dropped frames on Retina screens (where DPR is typically `2.0` or `3.0`).

## 3. The Custom Physics Engine (`physics.js`)

A bespoke O(n²) particle system with 6-pass iterative constraints, written with zero dependencies for maximum control and efficiency.

### 3.1 Setup
- Variables like `maxSpeedSq`, `dampingFactor`, and `edgeDistSq` are precomputed once in the constructor to avoid hundreds of redundant math operations per frame.
- An array of particle objects acts as the state.
- `tempVec` (a `THREE.Vector3`) is instantiated once and reused for all vector math to eliminate per-frame garbage collection pauses.

### 3.2 Pass 1: Unified Pair Loop (Soft Aura & Hard Collision)
Every sub-step iterates over all unique pairs of balls:
1. `distanceToSquared()` is used first. `Math.sqrt()` is only called if a pair actually interacts.
2. The vector delta is normalized manually using the already-computed distance to avoid another `sqrt()`.
3. If they overlap (`dist < MIN_DIST`), they are pushed apart (Hard Collision) and their velocities receive an elastic impulse response.
4. If they don't overlap but are close (`dist < AURA_RADIUS`), they receive a gentle quadratic push (Soft Aura) to divert them before colliding.

### 3.3 Pass 2: Iterative Solver
Dense clusters of balls cause "interpenetration" where moving Ball A away from Ball B pushes it into Ball C.
The solver iterates 6 additional times per sub-step, repeating *only* the Hard Collision calculation, ensuring all overlaps are forcefully resolved before rendering.

### 3.4 Pass 3: Integration
Constraints only calculate and apply *impulses* to velocities. In Pass 3:
1. Velocity is multiplied by air resistance (`dampingFactor`).
2. Speed is clamped via `lengthSq() > maxSpeedSq`.
3. Velocity is added to Position. 
Doing this *after* all constraints guarantees positions are mathematically stable.

### 3.5 Pass 4: Idle Diffusion
If the system settles and kinetic energy drops below a threshold, a mutual repulsion is applied to all pairs. This slowly pushes the balls outward until they evenly fill the invisible boundary volume, creating a visually pleasing layout instead of a clumped mass at the center of the sphere.

---
*Generated during optimization audit. Do not remove this file; consult it before modifying the physics pipeline or rendering loop parameters.*
