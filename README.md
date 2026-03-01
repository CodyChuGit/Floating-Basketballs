# React Floating Basketballs

An interactive 3D basketball simulation built with React, Three.js, and a custom physics engine. 80 basketballs float, collide, and drift in zero-gravity space with real-time post-processing and OS-native theme integration.

**[Live Demo →](https://wilsonballs.netlify.app)**

---

## ✨ Highlights

- **Custom Physics Engine** — Bespoke multi-pass collision solver with soft repulsion auras, iterative constraint solving, and idle-state homogeneous diffusion. Zero external physics dependencies.
- **Cinematic Post-Processing** — Bloom, film grain noise, vignette, HDRI environment reflections, and soft shadows — all individually toggleable at runtime.
- **OS Theme Sync** — Automatically follows system light/dark mode. On iOS Safari, CSS gradient edge fades blend the 3D scene seamlessly into browser chrome.
- **Performance Tiering** — Auto-detects hardware capabilities. Safari gets DPR capping; low-end devices get reduced ball count and stripped effects. Manual override via `?compat` URL param or `M` key.
- **Memory Managed** — All manually created Three.js geometries, materials, and textures are explicitly `dispose()`d on unmount. Asset caching enabled globally.

## 🕹️ Controls

| Input | Action |
|---|---|
| **Drag / Swipe** | Orbit camera |
| **Scroll / Pinch** | Zoom (camera has a physics forcefield — balls dodge you) |
| **P** | Toggle wireframe diagnostic view |
| **L** | Toggle light/dark mode (overrides OS) |
| **M** | Toggle High Performance ↔ High Compatibility mode |
| **O** | Cycle through disabling effects one by one (Vignette → Shadows → Bloom → Noise → Environment → all back on) |

## ⚡ Architecture

```
index.html          Inline preloader (renders before JS, zero-dependency)
├── main.jsx        React entry point
├── App.jsx   App component: Canvas, lighting, controls, post-processing, keyboard shortcuts
├── physics.js      Custom collision engine (O(n²) pair loop, 6-pass iterative solver, idle diffusion)
├── App.css         Global styles (light/dark background, canvas sizing)
├── vite.config.js  Build config + Netlify host allowlist
└── netlify.toml    Security headers (CSP, HSTS, X-Frame-Options, etc.)
```

### Physics Pipeline (per frame)
1. **Unified pair loop** — Soft aura repulsion + hard collision in one O(n²) sweep. Overlapping pairs are cached for Pass 2.
2. **Iterative solver** — 6 refinement passes re-evaluate *only* the specific pairs cached in Pass 1, avoiding $O(n^2)$ redundant checks.
3. **Integration** — Velocity damping, speed clamping, position update
4. **Idle diffusion** — Gentle mutual repulsion when kinetic energy drops, filling the volume evenly

### Performance Optimizations
- **Scalar Math Unrolling:** Eliminated `THREE.Vector3` function-call overhead in the physics hot-paths in favor of raw scalar math (`dx = p.x - p2.x`), preventing thousands of object allocations per frame.
- **Pass 1 Collision Caching:** Eliminates ~38,000 redundant distance calculations per frame by caching touching pairs for the iterative solver.
- **Vite Bundle Splitting:** `manualChunks` isolate the monolithic Three.js and React vendor dependencies into dedicated parallel-loading files, shrinking the core app logic to `~13KB` and drastically accelerating boot time.
- **Asset Compression:** 3D model textures were converted to WebP, slashing payload bandwidth by >50% while preserving 1024x1024 resolution.
- `InstancedMesh` for 80 balls on a single draw call.
- `THREE.Cache.enabled` + explicit `dispose()` on all GPU resources.
- EffectComposer `multisampling={4}` with native WebGL antialiasing.

## 🛠️ Tech Stack

- React + Vite
- Three.js + React Three Fiber + Drei + Postprocessing
- Netlify (hosting + security headers)

## 🚀 Run Locally

```bash
npm install
npm run dev       # dev server at localhost:5173
npm run build     # production build → dist/
```

## 🎨 Credits

3D basketball model by **Lassi Kaukonen** ([thesidekick](https://sketchfab.com/thesidekick))
- License: [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/)
- Source: [Basketball on Sketchfab](https://sketchfab.com/3d-models/basketball-8d17cb0964334a6cbe4b0e293c238956)
