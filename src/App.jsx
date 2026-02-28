import { useMemo, Suspense, useRef } from 'react'
import './App.css'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF, Instances, Instance } from '@react-three/drei'
import { Bloom, Noise, Vignette, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'

// High-performance ball component using Instancing
function Basketballs({ count = 100 }) {
  const { nodes, materials } = useGLTF('/Ball.gltf')

  // Generate random positions and rotations only once
  const ballData = useMemo(() => {
    return Array.from({ length: count }, () => ({
      position: [
        Math.random() * 80 - 40,
        Math.random() * 80 - 40,
        Math.random() * 80 - 40
      ],
      rotation: [
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      ],
      speed: Math.random() * 0.01 + 0.002
    }))
  }, [count])

  return (
    <Instances range={count} geometry={nodes.Object_2.geometry} material={materials.Basketball_size6}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {ballData.map((data, i) => (
          <IndividualBall key={i} {...data} />
        ))}
      </group>
    </Instances>
  )
}

function IndividualBall({ position, rotation, speed }) {
  const ref = useRef()
  const originalPos = useMemo(() => new THREE.Vector3(...position), [position])
  const vec = new THREE.Vector3()

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y += speed

      // Collision avoidance math: Push balls away from camera
      const dist = ref.current.position.distanceTo(state.camera.position)
      const threshold = 12 // Distance at which balls start dodging

      if (dist < threshold) {
        // Calculate direction from camera to ball
        vec.copy(ref.current.position).sub(state.camera.position).normalize()

        // Push force gets stronger as camera gets closer
        const force = (threshold - dist) * 0.15
        ref.current.position.addScaledVector(vec, force)
      }

      // Smoothly return to original position
      ref.current.position.lerp(originalPos, 0.05)
    }
  })
  return <Instance ref={ref} position={position} rotation={rotation} />
}

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050505' }}>
      <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
        <color attach="background" args={['#050505']} />

        {/* Cinematic Lighting */}
        <ambientLight intensity={0.2} />
        <spotLight position={[10, 20, 10]} angle={0.15} penumbra={1} intensity={2} />
        <pointLight position={[-10, -10, -10]} intensity={1.5} color="#ff0055" />
        <pointLight position={[10, -10, 20]} intensity={1} color="#0088ff" />

        <OrbitControls
          enableZoom={true}
          enablePan={false}
          enableRotate={true}
          rotateSpeed={0.5}
          minDistance={5}
          maxDistance={90}
          makeDefault
        />

        <Suspense fallback={null}>
          <Basketballs count={150} />
          <Environment preset="city" blur={0.8} />
        </Suspense>

        <EffectComposer disableNormalPass>
          <Bloom
            luminanceThreshold={1}
            mipmapBlur
            intensity={0.8}
            radius={0.4}
          />
          <Noise opacity={0.04} />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}

export default App
