import { useState, useEffect, Suspense } from 'react'
import './App.css'

import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import Ball from '../public/Ball.jsx'
import { EffectComposer, DepthOfField } from '@react-three/postprocessing';


function App() {
  const [balls, setBalls] = useState([])
  const numBalls = 100 // Number of balls

  useEffect(() => {
    const generateRandomPosition = () => {
      return [
        Math.random() * 100 - 50, // Random x position between -5 and 5
        Math.random() * 100 - 50, // Random y position between -5 and 5
        Math.random() * 100 - 50  // Random z position between -5 and 5
      ]
    }

    const generateRandomRotation = () => {
      return [
        Math.random() * Math.PI * 2, // Random rotation around x-axis
        Math.random() * Math.PI * 2, // Random rotation around y-axis
        Math.random() * Math.PI * 2  // Random rotation around z-axis
      ]
    }

    const checkCollision = (newBallPosition) => {
      for (const ball of balls) {
        const distance = Math.sqrt(
          Math.pow(newBallPosition[0] - ball.position[0], 2) +
          Math.pow(newBallPosition[1] - ball.position[1], 2) +
          Math.pow(newBallPosition[2] - ball.position[2], 2)
        )
        if (distance < 6) { // Adjust the collision threshold as needed
          return true // Collision detected
        }
      }
      return false // No collision detected
    }

    const checkCameraCollision = (newBallPosition) => {
      const distance = Math.sqrt(
        Math.pow(newBallPosition[0], 2) +
        Math.pow(newBallPosition[1], 2) +
        Math.pow(newBallPosition[2], 2)
      )
      if (distance < .5) { // Adjust the collision threshold as needed
        return true // Collision detected
      }
      return false // No collision detected
    }

    const newBalls = Array.from({ length: numBalls }, () => {
      let newPosition = generateRandomPosition()
      while (checkCollision(newPosition) || checkCameraCollision(newPosition)) {
        newPosition = generateRandomPosition()
      }
      return {
        position: newPosition,
        rotation: generateRandomRotation()
      }
    })

    setBalls(newBalls)
  }, [numBalls])

  useEffect(() => {
    const rotationInterval = setInterval(() => {
      setBalls(prevBalls => {
        return prevBalls.map(ball => ({
          ...ball,
          rotation: [ball.rotation[0], ball.rotation[1] + 0.005, ball.rotation[2]]
        }))
      })
    }, 16)

    return () => {
      clearInterval(rotationInterval)
    }
  }, [])

  return (
    <>
      <Canvas camera={{ position: [0, 0, 3]}} >
        <ambientLight intensity={0.6} />
        <OrbitControls enableZoom={false} enablePan={false} enableRotate={true} rotateSpeed={.3} autoRotate={false} autoRotateSpeed={1} dampingFactor={0.1} />
        <Suspense fallback={null}>
          {balls.map((ball, index) => (
            <Ball key={index} position={ball.position} rotation={ball.rotation} />
          ))}
        </Suspense>
        <Environment preset="city" blur={0.8} />
        <EffectComposer>
     
    </EffectComposer>
      </Canvas>
    </>
  )
}

export default App
