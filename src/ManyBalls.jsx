// ManyBalls.jsx — Main application component
// Orchestrates: loading screen, instanced basketball rendering, physics,
// post-processing (Bloom/Noise/Vignette), light/dark mode, Safari optimization,
// and keyboard-driven effects cycling.

import { useMemo, Suspense, useRef, useState, useEffect } from 'react'
import './App.css'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF, useProgress, Billboard } from '@react-three/drei'
import { Bloom, Noise, Vignette, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import { PhysicsSimulator } from './physics.js'

THREE.Cache.enabled = true // reuse decoded textures across mounts

// Effects that can be cycled via "O" key (order matters)
const EFFECT_NAMES = ['Bloom', 'Noise', 'Vignette', 'Shadows', 'Environment']
const ALL_EFFECTS_ON = { Bloom: true, Noise: true, Vignette: true, Shadows: true, Environment: true }

// --- Loader ---
// Bridges the native HTML #preloader (visible before JS loads) with React's
// asset loading. Fades out and removes the DOM element once assets are ready.
function Loader() {
  const { progress } = useProgress()
  useEffect(() => {
    if (progress >= 100) {
      const el = document.getElementById('preloader')
      if (!el) return
      el.classList.add('fade-out')
      const t = setTimeout(() => el.remove(), 1200)
      return () => clearTimeout(t)
    }
  }, [progress])
  return null
}

// --- Basketballs ---
// Renders N balls via InstancedMesh. Physics drives positions each frame.
// Two meshes exist in parallel: textured (default) and wireframe (diagnostic "P" key).
function Basketballs({ count = 80, isPrimitive, isDarkMode }) {
  const { nodes, materials } = useGLTF('/Ball.gltf')
  const { gl } = useThree()
  const meshRef = useRef()
  const primRef = useRef()

  // Max anisotropic filtering — sharpens textures at oblique angles
  useEffect(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy()
    Object.values(materials).forEach(mat => {
      if (mat.map) mat.map.anisotropy = maxAniso
      if (mat.normalMap) {
        mat.normalMap.anisotropy = maxAniso
        mat.normalScale.set(0.7, 0.7) // soften to prevent shimmering
      }
      if (mat.roughnessMap) mat.roughnessMap.anisotropy = maxAniso
    })
  }, [materials, gl])

  // Center GLTF geometry at origin so physics sphere aligns with mesh
  const centeredGeo = useMemo(() => {
    const geo = nodes.Object_2.geometry.clone()
    geo.computeBoundingSphere()
    const c = geo.boundingSphere.center
    geo.translate(-c.x, -c.y, -c.z)
    geo.computeBoundingSphere()
    return geo
  }, [nodes])

  useEffect(() => () => centeredGeo.dispose(), [centeredGeo])

  const radius = centeredGeo.boundingSphere.radius
  const physics = useMemo(() => new PhysicsSimulator(count, radius), [count, radius])
  const tempMatrix = useMemo(() => new THREE.Matrix4(), [])
  const localCamPos = useMemo(() => new THREE.Vector3(), [])

  // Per-frame: transform camera to local space, step physics, sync instances
  useFrame((state) => {
    if (!meshRef.current && !primRef.current) return
    localCamPos.copy(state.camera.position)
    meshRef.current.worldToLocal(localCamPos)
    physics.step(localCamPos)
    physics.updateInstances(meshRef, primRef, tempMatrix)
  })

  // Wireframe diagnostic sphere (matches collision radius exactly)
  const primGeo = useMemo(() => new THREE.SphereGeometry(radius, 12, 12), [radius])
  const primMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: isDarkMode ? '#fff' : '#000', wireframe: true, transparent: true, opacity: 0.8,
  }), [isDarkMode])

  useEffect(() => () => { primGeo.dispose(); primMat.dispose() }, [primGeo, primMat])

  return (
    <>
      <instancedMesh castShadow receiveShadow visible={!isPrimitive} ref={meshRef}
        args={[centeredGeo, materials.Basketball_size6, count]} rotation={[-Math.PI / 2, 0, 0]} />
      <instancedMesh castShadow receiveShadow visible={isPrimitive} ref={primRef}
        args={[primGeo, primMat, count]} rotation={[-Math.PI / 2, 0, 0]} />
    </>
  )
}

// --- App ---
function App() {
  const sunRef = useRef()

  // Performance mode: auto-detect or manual ?compat override
  const [isLowPower, setIsLowPower] = useState(() =>
    window.location.search.includes('compat') || !window.WebGLRenderingContext
  )

  // Browser detection (Safari needs DPR cap; iOS needs edge fades)
  const isSafari = useMemo(() => {
    const ua = navigator.userAgent
    return ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')
  }, [])
  const isIOS = useMemo(() => {
    const ua = navigator.userAgent
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
  }, [])

  const [isPrimitive, setIsPrimitive] = useState(isLowPower)

  // Effects state — each toggleable via "O" key cycling
  const [effects, setEffects] = useState(ALL_EFFECTS_ON)
  const [effectIdx, setEffectIdx] = useState(0)
  const [showEffectsHUD, setShowEffectsHUD] = useState(false)

  // Theme — follows OS preference unless user presses "L" to override
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (window.matchMedia) return window.matchMedia('(prefers-color-scheme: dark)').matches
    return true
  })
  const [themeOverride, setThemeOverride] = useState(false)

  useEffect(() => {
    if (themeOverride) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setIsDarkMode(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [themeOverride])

  // Keyboard shortcuts: L=theme, M=mode, P=wireframe, O=effects cycle
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase()
      if (k === 'l') { setIsDarkMode(v => !v); setThemeOverride(true) }
      else if (k === 'm') setIsLowPower(v => !v)
      else if (k === 'p') setIsPrimitive(v => !v)
      else if (k === 'o') {
        setShowEffectsHUD(true)
        setEffectIdx(prev => {
          const next = prev + 1
          if (next > EFFECT_NAMES.length) {
            setEffects(ALL_EFFECTS_ON)
            setShowEffectsHUD(false)
            return 0
          }
          setEffects(cur => ({ ...cur, [EFFECT_NAMES[next - 1]]: false }))
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Shader material for the sun's glow — mathematically perfect, resolution independent
  const glowMaterial = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        // Calculate distance from center (0.0 at center, 0.5 at edges)
        float dist = distance(vUv, vec2(0.5));
        
        // Invert to get strength (1.0 at center, 0.0 at edges)
        float strength = max(0.0, 1.0 - dist * 2.0);
        
        // Exponential falloff for softer edges
        float alpha = pow(strength, 1.5);
        
        // Beautiful multi-stop color curve
        vec3 col = vec3(0.0);
        if (strength > 0.8) {
          col = mix(vec3(1.0, 0.94, 0.78), vec3(1.0), (strength - 0.8) * 5.0);
        } else if (strength > 0.4) {
          col = mix(vec3(1.0, 0.7, 0.39), vec3(1.0, 0.94, 0.78), (strength - 0.4) * 2.5);
        } else {
          col = mix(vec3(0.0), vec3(1.0, 0.7, 0.39), strength * 2.5);
        }
        
        // Microscopic noise dither to eliminate banding on 8-bit monitors
        float noise = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        
        // Pre-multiply alpha for additive blending
        gl_FragColor = vec4(col * alpha + noise, alpha);
      }
    `
  }), [])

  useEffect(() => () => glowMaterial.dispose(), [glowMaterial])

  const bg = isDarkMode ? '#020202' : '#f0f0f0'

  return (
    <div style={{ width: '100vw', height: '100vh', background: bg, position: 'relative', overflow: 'hidden' }}>
      <Loader />

      {/* iOS Safari edge fades — blend scene into browser chrome */}
      {isIOS && (
        <>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '10vh',
            pointerEvents: 'none', zIndex: 1, background: `linear-gradient(to bottom, ${bg}, transparent)`
          }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, width: '100%', height: '10vh',
            pointerEvents: 'none', zIndex: 1, background: `linear-gradient(to top, ${bg}, transparent)`
          }} />
        </>
      )}

      {/* Three.js Canvas — DPR capped to 1.0 on Safari (Retina perf), 1.5 elsewhere */}
      <Canvas
        dpr={[1, isSafari ? 1.0 : 1.5]}
        shadows={effects.Shadows ? 'soft' : false}
        camera={{ position: [0, 20, 90], fov: 45 }}
        gl={{
          antialias: true, powerPreference: isLowPower ? 'low-power' : 'high-performance',
          preserveDrawingBuffer: false, stencil: false, depth: true
        }}
      >
        <color attach="background" args={[bg]} />

        {/* Lighting rig */}
        <ambientLight intensity={isLowPower ? 0.8 : 0.01} />
        <directionalLight position={[50, 100, 50]} intensity={isLowPower ? 0.4 : 1.0}
          castShadow={!isLowPower && effects.Shadows}
          shadow-mapSize={[1024, 1024]} shadow-camera-left={-70} shadow-camera-right={70}
          shadow-camera-top={70} shadow-camera-bottom={-70} shadow-bias={-0.001} />

        {/* Sun mesh + additive glow sprite */}
        <group position={[50, 100, 50]}>
          <mesh ref={sunRef}>
            <sphereGeometry args={[5, isLowPower ? 8 : 16, isLowPower ? 8 : 16]} />
            {isLowPower
              ? <meshBasicMaterial color="#ffffff" />
              : <meshStandardMaterial color="#ffffff" emissive="#fff9e6" emissiveIntensity={17} toneMapped={false} />
            }
          </mesh>
          {!isLowPower && (
            <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
              <mesh material={glowMaterial} scale={[70, 70, 1]}>
                <planeGeometry args={[1, 1]} />
              </mesh>
            </Billboard>
          )}
        </group>

        <pointLight position={[-40, -40, -40]} intensity={0.12} color="#ffffff" />
        {!isLowPower && <pointLight position={[40, 40, 80]} intensity={0.04} color="#ffeedd" />}

        {/* Camera controls */}
        <OrbitControls enableZoom zoomSpeed={0.3} enablePan={false} enableRotate
          rotateSpeed={0.3} autoRotate autoRotateSpeed={-0.64} minDistance={35} maxDistance={63} />

        <Suspense fallback={null}>
          <Basketballs count={isLowPower ? 40 : 80} isPrimitive={isPrimitive} isDarkMode={isDarkMode} />
          {!isLowPower && effects.Environment && <Environment preset="city" blur={0.5} />}
        </Suspense>

        {/* Post-processing — only in high-perf mode, each effect individually toggleable */}
        {!isLowPower && (effects.Bloom || effects.Noise || effects.Vignette) && (
          <EffectComposer disableNormalPass multisampling={4}>
            {effects.Bloom && <Bloom luminanceThreshold={1.2} mipmapBlur intensity={0.85} radius={0.5} />}
            {effects.Noise && <Noise opacity={0.02} />}
            {effects.Vignette && <Vignette eskil={false} offset={0.35} darkness={isDarkMode ? 0.65 : 0.38} />}
          </EffectComposer>
        )}
      </Canvas>

      {/* Effects HUD — visible when cycling with "O" */}
      {showEffectsHUD && !isLowPower && (
        <div style={{
          position: 'absolute', top: 20, right: 20,
          color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
          pointerEvents: 'none', fontSize: '11px', zIndex: 10,
          fontFamily: 'monospace', lineHeight: 1.8
        }}>
          {EFFECT_NAMES.map(n => <div key={n}>{effects[n] ? '☑' : '☐'} {n}</div>)}
          <div style={{ marginTop: 4, opacity: 0.4, fontSize: '9px' }}>[O] cycle effects</div>
        </div>
      )}

      {/* Diagnostic label (wireframe mode only) */}
      {isPrimitive && (
        <div style={{
          position: 'absolute', bottom: 20, right: 20, color: isDarkMode ? '#fff' : '#000',
          opacity: 0.3, pointerEvents: 'none', fontSize: '10px', zIndex: 10,
          textAlign: 'right', lineHeight: 1.6
        }}>
          {isLowPower ? 'High Compatibility Mode' : 'High Performance Mode'}<br />
          [L] Theme · [M] Mode · [P] Wireframe · [O] Effects
        </div>
      )}
    </div>
  )
}

export default App
