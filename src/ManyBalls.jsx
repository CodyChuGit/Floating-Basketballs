import { useState, useEffect, Suspense } from 'react'
import './App.css'
import { DepthOfField } from '@react-three/postprocessing'

import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import Ball from '../public/Ball.jsx'

function App() {
  const [ballPositions, setBallPositions] = useState([])
  const [ballRotation, setBallRotation] = useState([0, 0, 0])

  useEffect(() => {
    // Generate random positions for the balls
    const generateRandomPositions = () => {
      const positions = []
      const radius = 2 // Radius of the balls

      for (let i = 0; i < 240; i++) {
        let position
        let overlapping = true

        // Generate a position until it doesn't overlap with existing positions
        while (overlapping) {
          const x = Math.random() * 120 - 60 // Random x position between -30 and 30
          const y = Math.random() * 120 - 60 // Random y position between -30 and 30
          const z = Math.random() * 120 - 60 // Random z position between -30 and 30
          position = [x, y, z]

          // Check for overlapping positions
          overlapping = positions.some(existingPosition => {
            const distance = Math.sqrt(
              Math.pow(existingPosition[0] - position[0], 2) +
              Math.pow(existingPosition[1] - position[1], 2) +
              Math.pow(existingPosition[2] - position[2], 2)
            )
            return distance < radius * 6 // Check if the distance is less than the sum of the radii
          })
        }

        positions.push(position)
      }

      setBallPositions(positions)
    }

    generateRandomPositions()
  }, [])
  useEffect(() => {
    const rotationInterval = setInterval(() => {
      setBallRotation(prevRotation => [prevRotation[0], prevRotation[1] + 0.005, prevRotation[2]])
    }, 16)

    return () => {
      clearInterval(rotationInterval)
    }
  }, [])
  return (
    <>
      <Canvas camera={{ position: [0, 0, 10] }}>
        <ambientLight intensity={0.6} />
        <OrbitControls enableZoom={false} enablePan={false} enableRotate={true} rotateSpeed={0.1} autoRotate={true} dampingFactor={0.1} />
        <Suspense fallback={null}>
          {ballPositions.map((position, index) => (
            <Ball key={index} position={position} rotation={ballRotatio} />
          ))}
        </Suspense>
        <Environment preset="apartment" blur={0.8} />
      </Canvas>
    </>
  )
}

export default App
