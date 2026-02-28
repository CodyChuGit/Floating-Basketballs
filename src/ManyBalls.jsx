import { useMemo, Suspense, useRef, useState, useEffect } from 'react'
import './App.css'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF, Html, useProgress } from '@react-three/drei'
import { Bloom, Noise, Vignette, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import { PhysicsSimulator } from './physics.js'

function Loader({ isDarkMode }) {
  const { progress } = useProgress()
  const [isFading, setIsFading] = useState(false)
  const [isHidden, setIsHidden] = useState(false)
  // Only fade out when the 3js scene is FULLY loaded
  useEffect(() => {
    if (progress >= 100 && !isFading) {
      const fade = setTimeout(() => setIsFading(true), 0)
      const hide = setTimeout(() => setIsHidden(true), 1000)
      return () => { clearTimeout(fade); clearTimeout(hide) }
    }
  }, [progress, isFading])

  if (isHidden) return null

  return (
    <div className={`loader-overlay ${isFading ? 'overlay-hidden' : 'overlay-visible'}`} style={{ backgroundColor: isDarkMode ? '#050505' : '#ffffff' }}>
      <div className="loader-container">
        <img src="/loading-ball.png" alt="Loading..." className="bouncing-ball" />
      </div>
    </div>
  )
}


function Basketballs({ count = 80, lowPower = false }) {
  const { nodes, materials } = useGLTF('/Ball.gltf')
  const meshRef = useRef()
  const primRef = useRef()

  const [isPrimitive, setIsPrimitive] = useState(lowPower)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() === 'p') {
        setIsPrimitive(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Clone and CENTER the geometry at origin so physics position == visual center
  const centeredGeo = useMemo(() => {
    const geo = nodes.Object_2.geometry.clone()
    geo.computeBoundingSphere()
    const { center } = geo.boundingSphere
    // Shift all vertices so the bounding sphere center is at (0,0,0)
    geo.translate(-center.x, -center.y, -center.z)
    geo.computeBoundingSphere() // Recompute after centering
    console.log('[Physics] Centered geometry. Radius:', geo.boundingSphere.radius, 'Center:', geo.boundingSphere.center)
    return geo
  }, [nodes])

  const actualRadius = centeredGeo.boundingSphere.radius

  const physics = useMemo(() => new PhysicsSimulator(count, actualRadius), [count, actualRadius])
  const tempMatrix = useMemo(() => new THREE.Matrix4(), [])
  const localCameraPos = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    if (!meshRef.current && !primRef.current) return

    // Map camera world position to the rotated local space of the InstancedMesh
    localCameraPos.copy(state.camera.position)
    meshRef.current.worldToLocal(localCameraPos)

    physics.step(localCameraPos)
    physics.updateInstances(meshRef, primRef, tempMatrix)
  })

  // Primitive geometry & material
  const primitiveGeo = useMemo(() => {
    const r = centeredGeo.boundingSphere.radius
    return new THREE.SphereGeometry(r, 12, 12)
  }, [centeredGeo])
  const primitiveMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.8 }), [])

  return (
    <>
      <instancedMesh castShadow receiveShadow visible={!isPrimitive} ref={meshRef} args={[centeredGeo, materials.Basketball_size6, count]} rotation={[-Math.PI / 2, 0, 0]} />
      <instancedMesh castShadow receiveShadow visible={isPrimitive} ref={primRef} args={[primitiveGeo, primitiveMat, count]} rotation={[-Math.PI / 2, 0, 0]} />
    </>
  )
}

function App() {
  const sunRef = useRef()

  const [isLowPower, setIsLowPower] = useState(() => {
    // Basic detection for low-end hardware or explicit toggle
    return window.location.search.includes('compat') || !window.WebGLRenderingContext
  })

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return true
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => setIsDarkMode(e.matches)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      mediaQuery.addListener(handleChange)
      return () => mediaQuery.removeListener(handleChange)
    }
  }, [])

  // Procedural gradient glow for the sun
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

  return (
    <div style={{ width: '100vw', height: '100vh', background: isDarkMode ? '#050505' : '#ffffff', position: 'relative', overflow: 'hidden' }}>
      <Loader isDarkMode={isDarkMode} />
      <Canvas
        dpr={[1, 1.5]}
        shadows={!isLowPower}
        camera={{ position: [0, 20, 90], fov: 45 }}
        gl={{
          antialias: false,
          powerPreference: isLowPower ? "low-power" : "high-performance"
        }}
      >
        <color attach="background" args={[isDarkMode ? '#020202' : '#f0f0f0']} />

        <ambientLight intensity={isLowPower ? 0.8 : 0.01} />
        <directionalLight
          position={[50, 100, 50]}
          intensity={isLowPower ? 0.5 : 1.2}
          castShadow={!isLowPower}
          shadow-mapSize={[512, 512]}
          shadow-camera-left={-70}
          shadow-camera-right={70}
          shadow-camera-top={70}
          shadow-camera-bottom={-70}
          shadow-bias={-0.0005}
        />

        {/* Visual Sun and Glow Sprite */}
        <group position={[50, 100, 50]}>
          <mesh ref={sunRef}>
            <sphereGeometry args={[5, isLowPower ? 8 : 16, isLowPower ? 8 : 16]} />
            {isLowPower ? (
              <meshBasicMaterial color="#ffffff" />
            ) : (
              <meshStandardMaterial
                color="#ffffff"
                emissive="#fff9e6"
                emissiveIntensity={20}
                toneMapped={false}
              />
            )}
          </mesh>
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
        <pointLight position={[-40, -40, -40]} intensity={0.15} color="#ffffff" castShadow={!isLowPower} shadow-bias={-0.001} />
        {!isLowPower && <pointLight position={[40, 40, 80]} intensity={0.05} color="#ffeedd" />}

        <OrbitControls
          enableZoom={true}
          zoomSpeed={0.3}
          enablePan={false}
          enableRotate={true}
          rotateSpeed={0.3}
          autoRotate={true}
          autoRotateSpeed={-0.4}
          minDistance={35}
          maxDistance={63}
        />

        <Suspense fallback={null}>
          <Basketballs count={isLowPower ? 40 : 80} lowPower={isLowPower} />
          {!isLowPower && <Environment preset="city" blur={0.5} />}
        </Suspense>

        {!isLowPower && (
          <EffectComposer disableNormalPass>
            <Bloom luminanceThreshold={1.2} mipmapBlur intensity={1.0} radius={0.5} />
            <Noise opacity={0.055} />
            <Vignette eskil={false} offset={0.35} darkness={0.54} />
          </EffectComposer>
        )}
      </Canvas>
      <div style={{ position: 'absolute', bottom: 20, right: 20, color: isDarkMode ? 'white' : 'black', opacity: 0.3, pointerEvents: 'none', fontSize: '10px' }}>
        {isLowPower ? 'High Compatibility Mode' : 'High Performance Mode'}
      </div>
    </div>
  )
}

export default App
