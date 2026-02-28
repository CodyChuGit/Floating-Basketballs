import * as THREE from 'three'

// Constants
export const DEFAULT_BALL_RADIUS = 3.5
export const BOUNDARY_RADIUS = 40
export const SUB_STEPS = 2
export const SOLVER_ITERATIONS = 6 // Lean for max framerate
export const CAMERA_SAFE_RADIUS = 12 // Tight radius for close viewing
export const RESTITUTION = 0.85

export class PhysicsSimulator {
    constructor(count, ballRadius) {
        this.count = count
        this.BALL_RADIUS = ballRadius || DEFAULT_BALL_RADIUS
        this.AURA_RADIUS = this.BALL_RADIUS * 2.5
        this.MIN_DIST = this.BALL_RADIUS * 2 + 0.05
        this.particles = []
        this.tempVec = new THREE.Vector3()
        this.initParticles()
    }

    initParticles() {
        const minDist = this.BALL_RADIUS * 2.1
        let pos = new THREE.Vector3()

        for (let i = 0; i < this.count; i++) {
            let attempts = 0
            do {
                pos.set(
                    (Math.random() - 0.5) * BOUNDARY_RADIUS * 1.5,
                    (Math.random() - 0.5) * BOUNDARY_RADIUS * 1.5,
                    (Math.random() - 0.5) * BOUNDARY_RADIUS * 1.5
                )
                attempts++
                if (attempts > 200) break
            } while (this.particles.some(p => p.position.distanceTo(pos) < minDist))

            this.particles.push({
                position: pos.clone(),
                velocity: new THREE.Vector3(0, 0, 0),
                rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
                rotVel: new THREE.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02),
            })
        }
    }

    step(cameraPosition) {
        for (let step = 0; step < SUB_STEPS; step++) {
            // --- PART 1: Soft repulsion aura ---
            for (let i = 0; i < this.count; i++) {
                const p = this.particles[i]
                for (let j = i + 1; j < this.count; j++) {
                    const p2 = this.particles[j]
                    const dist = p.position.distanceTo(p2.position)
                    if (dist < this.AURA_RADIUS && dist > 0.001) {
                        this.tempVec.copy(p.position).sub(p2.position).normalize()
                        const pushForce = Math.pow((this.AURA_RADIUS - dist) / this.AURA_RADIUS, 2) * 0.01 / SUB_STEPS
                        p.velocity.addScaledVector(this.tempVec, pushForce)
                        p2.velocity.addScaledVector(this.tempVec, -pushForce)
                    }
                }
            }

            // --- PART 2: Multi-pass collision solver (BEFORE integration) ---
            let totalKineticEnergy = 0

            for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
                for (let i = 0; i < this.count; i++) {
                    const p = this.particles[i]

                    if (iter === 0 && step === 0) {
                        totalKineticEnergy += p.velocity.lengthSq()
                    }

                    // 2A. Ball-to-ball hard collision
                    for (let j = i + 1; j < this.count; j++) {
                        const p2 = this.particles[j]
                        const dist = p.position.distanceTo(p2.position)

                        if (dist < this.MIN_DIST && dist > 0.0001) {
                            this.tempVec.copy(p.position).sub(p2.position).normalize()
                            // Push apart by FULL overlap (0.55 each side for slight over-correction)
                            const correction = (this.MIN_DIST - dist) * 0.55
                            p.position.addScaledVector(this.tempVec, correction)
                            p2.position.addScaledVector(this.tempVec, -correction)

                            const relVel = p.velocity.dot(this.tempVec) - p2.velocity.dot(this.tempVec)
                            if (relVel < 0) {
                                const impulse = Math.max(0.005 / SUB_STEPS, -relVel * (1 + RESTITUTION)) * 0.5
                                p.velocity.addScaledVector(this.tempVec, impulse)
                                p2.velocity.addScaledVector(this.tempVec, -impulse)
                            }
                        }
                    }

                    // 2B. Boundary containment
                    const distFromCenter = p.position.length()
                    const edgeDist = BOUNDARY_RADIUS - this.BALL_RADIUS
                    if (distFromCenter > edgeDist) {
                        this.tempVec.copy(p.position).normalize()
                        const dot = p.velocity.dot(this.tempVec)
                        if (dot > 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.8)
                        p.position.setLength(edgeDist)
                    }

                    // 2C. Camera forcefield (Processed LAST)
                    const distToCam = p.position.distanceTo(cameraPosition)
                    if (distToCam < CAMERA_SAFE_RADIUS) {
                        this.tempVec.copy(p.position).sub(cameraPosition).normalize()
                        p.position.addScaledVector(this.tempVec, CAMERA_SAFE_RADIUS - distToCam)
                        const dot = p.velocity.dot(this.tempVec)
                        if (dot < 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.5)
                        p.velocity.addScaledVector(this.tempVec, 0.05)
                    }
                }
            }

            // --- PART 2.5: Final hard enforcement pass (guarantees zero overlap) ---
            for (let i = 0; i < this.count; i++) {
                const p = this.particles[i]
                for (let j = i + 1; j < this.count; j++) {
                    const p2 = this.particles[j]
                    const dist = p.position.distanceTo(p2.position)
                    if (dist < this.MIN_DIST && dist > 0.0001) {
                        this.tempVec.copy(p.position).sub(p2.position).normalize()
                        const correction = (this.MIN_DIST - dist) * 0.5
                        p.position.addScaledVector(this.tempVec, correction)
                        p2.position.addScaledVector(this.tempVec, -correction)
                    }
                }
            }

            // --- PART 3: Integration (AFTER collision so positions are clean) ---
            for (let i = 0; i < this.count; i++) {
                const p = this.particles[i]
                p.velocity.multiplyScalar(Math.pow(0.99, 1 / SUB_STEPS))
                const maxSpeed = 0.4 / SUB_STEPS
                if (p.velocity.length() > maxSpeed) p.velocity.setLength(maxSpeed)
                p.position.add(p.velocity)
            }

            // --- PART 4: Inactive Homogeneous Diffusion ---
            const ENERGY_THRESHOLD = 0.05
            if (step === SUB_STEPS - 1 && totalKineticEnergy < ENERGY_THRESHOLD) {
                const diffusionForce = (ENERGY_THRESHOLD - totalKineticEnergy) * 0.003
                const MAX_INFLUENCE_RADIUS = BOUNDARY_RADIUS * 0.75

                for (let i = 0; i < this.count; i++) {
                    const p = this.particles[i]
                    for (let j = i + 1; j < this.count; j++) {
                        const p2 = this.particles[j]
                        const dist = p.position.distanceTo(p2.position)
                        if (dist > this.MIN_DIST && dist < MAX_INFLUENCE_RADIUS) {
                            this.tempVec.copy(p.position).sub(p2.position).normalize()
                            const falloff = 1 - (dist / MAX_INFLUENCE_RADIUS)
                            const push = diffusionForce * falloff
                            p.velocity.addScaledVector(this.tempVec, push)
                            p2.velocity.addScaledVector(this.tempVec, -push)
                        }
                    }
                }
            }
        }
    }

    updateInstances(meshRef, primRef, tempMatrix) {
        for (let i = 0; i < this.count; i++) {
            const p = this.particles[i]
            p.rotation.x += p.rotVel.x
            p.rotation.y += p.rotVel.y
            p.rotation.z += p.rotVel.z
            tempMatrix.makeRotationFromEuler(p.rotation)
            tempMatrix.setPosition(p.position)
            if (meshRef.current) meshRef.current.setMatrixAt(i, tempMatrix)
            if (primRef.current) primRef.current.setMatrixAt(i, tempMatrix)
        }
        if (meshRef.current) meshRef.current.instanceMatrix.needsUpdate = true
        if (primRef.current) primRef.current.instanceMatrix.needsUpdate = true
    }
}
