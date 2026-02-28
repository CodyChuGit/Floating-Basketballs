# React Floating Basketballs Component

A high-performance interactive 3D website rendering basketballs organically floating in space. 

**[View Live Demo](https://wilsonballs.netlify.app)**

---

## 🏀 The Experience

Step into a beautifully rendered, physics-driven 3D environment where dozens of basketballs float, collide, and drift in a zero-gravity space. 

We set out to create an experience that feels incredibly tactile, polished, and—most importantly—alive. 
- **Stunning Visuals:** Utilizing a cinematic post-processing pipeline, the scene features rich Bloom effects, subtle film grain Noise, and Vignetting. A custom procedural sun glow and environmental reflections (HDRI) bring the tactile texture of every Wilson basketball to life.
- **Bespoke Physics Engine:** Under the hood is a custom-built, multi-pass collision and dynamics engine optimized for smooth interactions. It handles soft repulsive auras, dense cluster collisions, and ambient micro-gravity diffusion, all carefully tuned to maintain 60FPS.
- **Seamless OS Integration:** Designed mobile-first, the app automatically syncs with your device's native Light or Dark mode. On iOS Safari, we utilize native meta tags and CSS gradient Edge Fades to seamlessly blend the 3D scene directly into the Safari browser chrome, creating the illusion of an infinite, borderless viewport.

## 🕹️ Interactive Controls

Take control of the scene with full interactive support:

- **Rotate/Orbit:** Click and drag (or swipe on touch screens) to orbit the camera seamlessly around the floating cluster.
- **Zoom In/Out:** Scroll the mouse wheel (or pinch to zoom on touch screens) to dive deep into the cluster or pull back for a wide view. *Watch out—the camera features a physics forcefield that pushes basketballs out of the way before you clip through them!*
- **Diagnostic Wireframe Mode:** Press "**P**" on your keyboard to toggle Primitive/Wireframe view. This reveals the highly optimized rendering skeleton and the exact collision spheres the physics engine uses to calculate bounces. (Wireframe lines automatically adapt to black or white based on your Light/Dark mode).

## 💡 Performance Features

- **Algorithmic Optimizations:** The physics engine uses squared distances (`distanceToSquared()`) and single-pass unified loops to eliminate thousands of costly `Math.sqrt()` operations per frame.
- **Asset Compression:** All normal maps and roughness maps were optimized to `JPEG` and `.webp` where appropriate, dropping payload sizes by nearly 90% without sacrificing visual fidelity.
- **Hardware Tiering:** The app detects capabilities instantly on load. Devices without advanced WebGL or specific browsers (like iOS Safari) are funneled into a tailored experience with DPR (Device Pixel Ratio) capping, reduced ball counts, and stripped-down rendering effects to guarantee butter-smooth framerates.

## 🛠️ Tech Stack

- **React** + **Vite**
- **Three.js** + **React Three Fiber**
- **React Three Drei** (for environment and controls)
- **React Three Postprocessing** (for cinematic effects)

## 🎨 Asset Credits

Special thanks to the 3D asset creator:
- **Author**: Lassi Kaukonen ([thesidekick](https://sketchfab.com/thesidekick))
- **License**: [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/)
- **Source**: [Basketball 3D Model](https://sketchfab.com/3d-models/basketball-8d17cb0964334a6cbe4b0e293c238956)
- **Title**: Basketball

---

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build
```
