/**
 * ============================================================================
 * ManyBalls.jsx — Main Application Component
 * ============================================================================
 *
 * The primary React component that orchestrates the entire 3D basketball
 * simulation. It manages:
 *
 *   - Loading screen with animated bouncing ball
 *   - InstancedMesh rendering of 80 basketballs (40 in compat mode)
 *   - Custom physics simulation (see physics.js)
 *   - Post-processing pipeline (Bloom, Noise, Vignette)
 *   - Light/Dark mode detection and seamless Safari iOS integration
 *   - Performance-tiered rendering (High Performance vs High Compatibility)
 *
 * ============================================================================
 */

import { useMemo, Suspense, useRef, useState, useEffect } from 'react'
import './App.css'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { Bloom, Noise, Vignette, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import { PhysicsSimulator } from './physics.js'

// Enable Three.js global asset caching to reuse buffers
THREE.Cache.enabled = true


// ==========================================================================
// Loader — Bridges the native HTML preloader with React's asset loading
// ==========================================================================

/**
 * This component does NOT render any visible UI of its own. Instead, it
 * monitors Three.js asset loading progress via useProgress() and controls
 * the native HTML preloader element (#preloader) that is already visible
 * in index.html from the moment the page loads — zero JS dependency.
 *
 * Once all 3D assets are loaded (progress >= 100%), it fades out the
 * HTML preloader and removes it from the DOM after the transition completes.
 */
function Loader() {
  const { progress } = useProgress()

  useEffect(() => {
    if (progress >= 100) {
      const preloader = document.getElementById('preloader')
      if (!preloader) return

      // Add the CSS fade-out class (1s transition defined in index.html)
      preloader.classList.add('fade-out')

      // Remove the element from the DOM after the transition finishes
      const cleanup = setTimeout(() => preloader.remove(), 1200)
      return () => clearTimeout(cleanup)
    }
  }, [progress])

  // This component renders nothing — the preloader lives in index.html
  return null
}


// ==========================================================================
// Basketballs — Instanced 3D basketball renderer with physics
// ==========================================================================

/**
 * Renders N basketballs using Three.js InstancedMesh for maximum performance.
 * Each ball's position is driven by the PhysicsSimulator every frame.
 *
 * Two InstancedMeshes are maintained in parallel:
 *   1. Textured mesh — The full basketball with PBR materials
 *   2. Wireframe mesh — A diagnostic view toggled via the "P" key
 *
 * @param {number} count — Number of basketball instances to render.
 * @param {boolean} lowPower — Whether High Compatibility Mode is active.
 * @param {boolean} isPrimitive — Whether wireframe diagnostic view is active.
 * @param {function} setIsPrimitive — State setter for toggling wireframe view.
 */
function Basketballs({ count = 80, lowPower = false, isPrimitive, isDarkMode }) {
  const { nodes, materials } = useGLTF('/Ball.gltf')
  const { gl } = useThree()
  const meshRef = useRef()
  const primRef = useRef()

  // -----------------------------------------------------------------------
  // Texture Quality Enhancement
  // Apply maximum anisotropic filtering to all material texture maps.
  // This dramatically improves texture clarity at grazing angles and
  // reduces moiré patterns on the basketball's curved surfaces.
  // -----------------------------------------------------------------------
  useEffect(() => {
    Object.values(materials).forEach(material => {
      if (material.map) material.map.anisotropy = gl.capabilities.getMaxAnisotropy()
      if (material.normalMap) {
        material.normalMap.anisotropy = gl.capabilities.getMaxAnisotropy()
        material.normalScale.set(0.7, 0.7) // Soften specular highlights to prevent shimmering
      }
      if (material.roughnessMap) material.roughnessMap.anisotropy = gl.capabilities.getMaxAnisotropy()
    })
  }, [materials, gl])

  // -----------------------------------------------------------------------
  // Geometry Centering
  // Clone the GLTF geometry and re-center it at the origin so that the
  // physics collision sphere perfectly aligns with the visible mesh.
  // Without this, bounding box offsets cause balls to "hover" off-center.
  // -----------------------------------------------------------------------
  const centeredGeo = useMemo(() => {
    const geo = nodes.Object_2.geometry.clone()
    geo.computeBoundingSphere()
    const { center } = geo.boundingSphere
    geo.translate(-center.x, -center.y, -center.z)
    geo.computeBoundingSphere()
    return geo
  }, [nodes])

  // Manually dispose of clones when centeredGeo changes or unmounts
  useEffect(() => {
    return () => centeredGeo.dispose()
  }, [centeredGeo])

  const actualRadius = centeredGeo.boundingSphere.radius

  // -----------------------------------------------------------------------
  // Physics Engine Initialization
  // Create the simulator once with the correct ball count and radius.
  // The tempMatrix and localCameraPos are reusable objects to avoid
  // per-frame garbage collection pressure.
  // -----------------------------------------------------------------------
  const physics = useMemo(() => new PhysicsSimulator(count, actualRadius), [count, actualRadius])
  const tempMatrix = useMemo(() => new THREE.Matrix4(), [])
  const localCameraPos = useMemo(() => new THREE.Vector3(), [])

  // -----------------------------------------------------------------------
  // Per-Frame Physics Update (runs every requestAnimationFrame)
  // Maps the camera's world position into the InstancedMesh's local space,
  // then advances the physics simulation and syncs visual transforms.
  // -----------------------------------------------------------------------
  useFrame((state) => {
    if (!meshRef.current && !primRef.current) return

    // Transform camera position from world space to the InstancedMesh's
    // local space (accounting for the -90° X rotation)
    localCameraPos.copy(state.camera.position)
    meshRef.current.worldToLocal(localCameraPos)

    physics.step(localCameraPos)
    physics.updateInstances(meshRef, primRef, tempMatrix)
  })

  // Wireframe diagnostic geometry — matches the collision sphere size exactly
  const primitiveGeo = useMemo(() => {
    const r = centeredGeo.boundingSphere.radius
    return new THREE.SphereGeometry(r, 12, 12)
  }, [centeredGeo])

  const primitiveMat = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: isDarkMode ? '#ffffff' : '#000000',
      wireframe: true,
      transparent: true,
      opacity: 0.8
    })
  }, [isDarkMode])

  // Ensure diagnostic objects are disposed from GPU memory
  useEffect(() => {
    return () => {
      primitiveGeo.dispose()
      primitiveMat.dispose()
    }
  }, [primitiveGeo, primitiveMat])

  return (
    <>
      {/* Primary textured basketball instances */}
      <instancedMesh castShadow receiveShadow visible={!isPrimitive} ref={meshRef} args={[centeredGeo, materials.Basketball_size6, count]} rotation={[-Math.PI / 2, 0, 0]} />
      {/* Wireframe diagnostic instances (toggled via "P" key) */}
      <instancedMesh castShadow receiveShadow visible={isPrimitive} ref={primRef} args={[primitiveGeo, primitiveMat, count]} rotation={[-Math.PI / 2, 0, 0]} />
    </>
  )
}


// ==========================================================================
// App — Root application component
// ==========================================================================

function App() {
  const sunRef = useRef()

  // -----------------------------------------------------------------------
  // Performance Mode Detection
  // Automatically enables High Compatibility Mode if:
  //   - The URL contains "?compat" (manual override)
  //   - WebGL is not available in the browser
  // -----------------------------------------------------------------------
  const [isLowPower, setIsLowPower] = useState(() => {
    return window.location.search.includes('compat') || !window.WebGLRenderingContext
  })

  // -----------------------------------------------------------------------
  // Browser Detection
  // Safari requires specific DPR capping and feature stripping for
  // acceptable framerates on Retina displays.
  // -----------------------------------------------------------------------
  const isSafari = useMemo(() => {
    const ua = navigator.userAgent
    return ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')
  }, [])

  // -----------------------------------------------------------------------
  // iOS Detection
  // Used to conditionally render CSS edge gradients that blend
  // the 3D scene into the Safari browser chrome (top/bottom bars).
  // -----------------------------------------------------------------------
  const isIOS = useMemo(() => {
    const ua = navigator.userAgent
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document)
  }, [])

  // -----------------------------------------------------------------------
  // Wireframe Diagnostic Mode
  // Defaults to wireframe in Low Power mode for visual clarity.
  // -----------------------------------------------------------------------
  const [isPrimitive, setIsPrimitive] = useState(isLowPower)

  // -----------------------------------------------------------------------
  // Light/Dark Mode Detection
  // Listens to the OS-level "prefers-color-scheme" media query and
  // hot-swaps the theme in real time if the user changes system settings.
  // -----------------------------------------------------------------------
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return true
  })

  // Track whether the user has manually overridden the theme via "L" key.
  // When overridden, we stop listening to OS-level theme changes.
  const [themeOverridden, setThemeOverridden] = useState(false)

  useEffect(() => {
    if (themeOverridden) return // User has manually set the theme, ignore OS changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => setIsDarkMode(e.matches)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      mediaQuery.addListener(handleChange)
      return () => mediaQuery.removeListener(handleChange)
    }
  }, [themeOverridden])

  // -----------------------------------------------------------------------
  // Keyboard Shortcuts (App-level)
  // "L" — Toggle Light/Dark mode (manual override)
  // "M" — Cycle display modes (High Performance ↔ High Compatibility)
  // "P" — Toggle wireframe diagnostic view
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase()
      if (key === 'l') {
        setIsDarkMode(prev => !prev)
        setThemeOverridden(true)
      } else if (key === 'm') {
        setIsLowPower(prev => !prev)
      } else if (key === 'p') {
        setIsPrimitive(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // -----------------------------------------------------------------------
  // Procedural Sun Glow Texture
  // Generates a radial gradient on an off-screen canvas to create a soft,
  // warm glow effect around the sun. Uses Canvas2D instead of loading an
  // image file, keeping the asset payload minimal.
  // -----------------------------------------------------------------------
  const glowTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.1, 'rgba(255, 240, 200, 0.9)')
    gradient.addColorStop(0.4, 'rgba(255, 180, 100, 0.4)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(canvas)
  }, [])

  // Explicitly dispose of generated glow texture on unmount
  useEffect(() => {
    return () => glowTexture.dispose()
  }, [glowTexture])

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div style={{ width: '100vw', height: '100vh', background: isDarkMode ? '#020202' : '#f0f0f0', position: 'relative', overflow: 'hidden' }}>

      {/* Loading Screen — Fades out once all 3D assets are downloaded */}
      <Loader />

      {/* ----------------------------------------------------------------- */}
      {/* iOS Safari Edge Fades                                             */}
      {/* Two CSS linear-gradient overlays (top + bottom) that blend the    */}
      {/* 3D scene into Safari's browser chrome, creating a seamless        */}
      {/* "infinite screen" effect. Only rendered on iOS devices.           */}
      {/* ----------------------------------------------------------------- */}
      {isIOS && (
        <>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '10vh', pointerEvents: 'none', zIndex: 1,
            background: `linear-gradient(to bottom, ${isDarkMode ? '#020202' : '#f0f0f0'}, transparent)`
          }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, width: '100%', height: '10vh', pointerEvents: 'none', zIndex: 1,
            background: `linear-gradient(to top, ${isDarkMode ? '#020202' : '#f0f0f0'}, transparent)`
          }} />
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Three.js Canvas                                                   */}
      {/* DPR is capped to 1.0 on Safari to prevent Retina fragment shader  */}
      {/* overload, and 1.5 elsewhere for crisp visuals without 4K cost.    */}
      {/* ----------------------------------------------------------------- */}
      <Canvas
        dpr={[1, isSafari ? 1.0 : 1.5]}
        shadows="soft"
        camera={{ position: [0, 20, 90], fov: 45 }}
        gl={{
          antialias: false,
          powerPreference: isLowPower ? "low-power" : "high-performance",
          preserveDrawingBuffer: false,
          stencil: false,
          depth: true
        }}
        onCreated={({ gl }) => {
          // Monitor rendering stats and GPU info
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
          console.log("🎨 Renderer Initialized")
          console.log("Memory info:", gl.info.memory)
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        }}
      >
        {/* Canvas clear color — matches the HTML background for seamlessness */}
        <color attach="background" args={[isDarkMode ? '#020202' : '#f0f0f0']} />

        {/* ----- Lighting Rig ----- */}

        {/* Ambient fill light — very faint in High Performance, brighter in Compat */}
        <ambientLight intensity={isLowPower ? 0.8 : 0.01} />

        {/* Primary directional light — acts as the "sun" for shadows and highlights */}
        <directionalLight
          position={[50, 100, 50]}
          intensity={isLowPower ? 0.4 : 1.0}
          castShadow={!isLowPower}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-70}
          shadow-camera-right={70}
          shadow-camera-top={70}
          shadow-camera-bottom={-70}
          shadow-bias={-0.001}
        />

        {/* Visual Sun and Glow Sprite — positioned at the directional light source */}
        <group position={[50, 100, 50]}>
          <mesh ref={sunRef}>
            <sphereGeometry args={[5, isLowPower ? 8 : 16, isLowPower ? 8 : 16]} />
            {isLowPower ? (
              <meshBasicMaterial color="#ffffff" />
            ) : (
              <meshStandardMaterial
                color="#ffffff"
                emissive="#fff9e6"
                emissiveIntensity={17}
                toneMapped={false}
              />
            )}
          </mesh>
          {/* Additive-blended glow sprite — creates a soft halo around the sun */}
          {!isLowPower && (
            <sprite scale={[70, 70, 1]}>
              <spriteMaterial
                map={glowTexture}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                transparent={true}
              />
            </sprite>
          )}
        </group>

        {/* Back-fill point light — subtle rim lighting from the opposite direction */}
        <pointLight position={[-40, -40, -40]} intensity={0.12} color="#ffffff" />
        {/* Secondary accent light — warm tint for visual depth */}
        {!isLowPower && <pointLight position={[40, 40, 80]} intensity={0.04} color="#ffeedd" />}

        {/* ----- Camera Controls ----- */}
        <OrbitControls
          enableZoom={true}
          zoomSpeed={0.3}
          enablePan={false}
          enableRotate={true}
          rotateSpeed={0.3}
          autoRotate={true}
          autoRotateSpeed={-0.64}
          minDistance={35}
          maxDistance={63}
        />

        {/* ----- Scene Content ----- */}
        <Suspense fallback={null}>
          <Basketballs
            count={isLowPower ? 40 : 80}
            lowPower={isLowPower}
            isPrimitive={isPrimitive}
            isDarkMode={isDarkMode}
          />
          {/* HDR Environment Map — provides realistic reflections on ball surfaces */}
          {!isLowPower && <Environment preset="city" blur={0.5} />}
        </Suspense>

        {/* ----- Post-Processing Pipeline ----- */}
        {/* Only active in High Performance mode; stripped entirely in Compat mode */}
        {!isLowPower && (
          <EffectComposer disableNormalPass multisampling={0}>
            {/* Bloom: Soft glow on bright highlights (sun, specular reflections) */}
            <Bloom luminanceThreshold={1.2} mipmapBlur intensity={0.85} radius={0.5} />
            {/* Noise: Subtle film grain for organic, non-digital feel */}
            <Noise opacity={0.02} />
            {/* Vignette: Cinematic edge darkening — stronger in dark mode */}
            <Vignette eskil={false} offset={0.35} darkness={isDarkMode ? 0.65 : 0.38} />
          </EffectComposer>
        )}
      </Canvas>

      {/* ----- Diagnostic Mode Label & Keyboard Shortcuts ----- */}
      {isPrimitive && (
        <div style={{ position: 'absolute', bottom: 20, right: 20, color: isDarkMode ? 'white' : 'black', opacity: 0.3, pointerEvents: 'none', fontSize: '10px', zIndex: 10, textAlign: 'right', lineHeight: 1.6 }}>
          {isLowPower ? 'High Compatibility Mode' : 'High Performance Mode'}<br />
          [L] Theme · [M] Mode · [P] Wireframe
        </div>
      )}
    </div>
  )
}

export default App
