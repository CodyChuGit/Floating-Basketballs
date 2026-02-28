// physics.js — Custom sphere collision & dynamics engine
// Zero-dependency physics for N balls in a spherical boundary.
// Pipeline: Unified pair loop → Iterative solver → Integration → Idle diffusion
// Perf: distanceToSquared() everywhere, manual normalization reuses sqrt, precomputed thresholds.

import * as THREE from 'three'

// --- Constants ---
export const DEFAULT_BALL_RADIUS = 3.5
export const BOUNDARY_RADIUS = 40
export const SUB_STEPS = 2         // physics sub-steps per frame
export const SOLVER_ITERATIONS = 6 // collision refinement passes per sub-step
export const CAMERA_SAFE_RADIUS = 12
export const RESTITUTION = 0.85    // bounce elasticity (1=perfect, 0=dead)

export class PhysicsSimulator {
    constructor(count, ballRadius) {
        this.count = count
        this.BALL_RADIUS = ballRadius || DEFAULT_BALL_RADIUS

        // Soft repulsion shell — pushes nearby balls before they collide
        this.AURA_RADIUS = this.BALL_RADIUS * 2.5
        this.AURA_RADIUS_SQ = this.AURA_RADIUS * this.AURA_RADIUS

        // Hard collision threshold
        this.MIN_DIST = this.BALL_RADIUS * 2 + 0.05
        this.MIN_DIST_SQ = this.MIN_DIST * this.MIN_DIST

        // Precomputed per-step constants (avoids recalculating in hot loop)
        this.dampingFactor = Math.pow(0.99, 1 / SUB_STEPS)
        this.maxSpeed = 0.4 / SUB_STEPS
        this.maxSpeedSq = this.maxSpeed * this.maxSpeed
        this.edgeDist = BOUNDARY_RADIUS - this.BALL_RADIUS
        this.edgeDistSq = this.edgeDist * this.edgeDist
        this.cameraSafeRadiusSq = CAMERA_SAFE_RADIUS * CAMERA_SAFE_RADIUS

        this.particles = []
        this.tempVec = new THREE.Vector3() // reusable scratch vector (zero GC pressure)
        this.initParticles()
    }

    // Rejection-sample non-overlapping positions within the boundary
    initParticles() {
        const minDist = this.BALL_RADIUS * 2.1
        const minDistSq = minDist * minDist
        const pos = new THREE.Vector3()

        for (let i = 0; i < this.count; i++) {
            let attempts = 0
            do {
                pos.set(
                    (Math.random() - 0.5) * BOUNDARY_RADIUS * 1.5,
                    (Math.random() - 0.5) * BOUNDARY_RADIUS * 1.5,
                    (Math.random() - 0.5) * BOUNDARY_RADIUS * 1.5
                )
                if (++attempts > 200) break
            } while (this.particles.some(p => p.position.distanceToSquared(pos) < minDistSq))

            this.particles.push({
                position: pos.clone(),
                velocity: new THREE.Vector3(0, 0, 0),
                rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
                rotVel: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.02,
                    (Math.random() - 0.5) * 0.02,
                    (Math.random() - 0.5) * 0.02
                ),
            })
        }
    }

    // Advance one frame. cameraPosition must be in InstancedMesh local space.
    step(cameraPosition) {
        for (let step = 0; step < SUB_STEPS; step++) {
            let totalKE = 0

            // --- PASS 1: Unified pair loop (aura + hard collisions in one O(n²) sweep) ---
            for (let i = 0; i < this.count; i++) {
                const p = this.particles[i]
                if (step === 0) totalKE += p.velocity.lengthSq()

                for (let j = i + 1; j < this.count; j++) {
                    const p2 = this.particles[j]
                    const distSq = p.position.distanceToSquared(p2.position)
                    if (distSq >= this.AURA_RADIUS_SQ || distSq < 0.000001) continue

                    const dist = Math.sqrt(distSq)
                    // Manual normalize: reuse dist to skip redundant sqrt
                    this.tempVec.copy(p.position).sub(p2.position)
                    this.tempVec.x /= dist
                    this.tempVec.y /= dist
                    this.tempVec.z /= dist

                    if (dist < this.MIN_DIST) {
                        // Hard collision — 55% overcorrection prevents persistent contact
                        const correction = (this.MIN_DIST - dist) * 0.55
                        p.position.addScaledVector(this.tempVec, correction)
                        p2.position.addScaledVector(this.tempVec, -correction)
                        const relVel = p.velocity.dot(this.tempVec) - p2.velocity.dot(this.tempVec)
                        if (relVel < 0) {
                            const impulse = Math.max(0.005 / SUB_STEPS, -relVel * (1 + RESTITUTION)) * 0.5
                            p.velocity.addScaledVector(this.tempVec, impulse)
                            p2.velocity.addScaledVector(this.tempVec, -impulse)
                        }
                    } else {
                        // Soft aura — quadratic push prevents future collisions
                        const t = (this.AURA_RADIUS - dist) / this.AURA_RADIUS
                        const pushForce = t * t * 0.01 / SUB_STEPS
                        p.velocity.addScaledVector(this.tempVec, pushForce)
                        p2.velocity.addScaledVector(this.tempVec, -pushForce)
                    }
                }

                // Boundary containment
                const distFromCenterSq = p.position.lengthSq()
                if (distFromCenterSq > this.edgeDistSq) {
                    this.tempVec.copy(p.position).normalize()
                    const dot = p.velocity.dot(this.tempVec)
                    if (dot > 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.8)
                    p.position.setLength(this.edgeDist)
                }

                // Camera forcefield — invisible sphere that ejects balls
                const distToCamSq = p.position.distanceToSquared(cameraPosition)
                if (distToCamSq < this.cameraSafeRadiusSq) {
                    const distToCam = Math.sqrt(distToCamSq)
                    this.tempVec.copy(p.position).sub(cameraPosition).normalize()
                    p.position.addScaledVector(this.tempVec, CAMERA_SAFE_RADIUS - distToCam)
                    const dot = p.velocity.dot(this.tempVec)
                    if (dot < 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.5)
                    p.velocity.addScaledVector(this.tempVec, 0.05)
                }
            }

            // --- PASS 2: Iterative solver (hard collisions + boundary + camera only) ---
            for (let iter = 1; iter < SOLVER_ITERATIONS; iter++) {
                for (let i = 0; i < this.count; i++) {
                    const p = this.particles[i]
                    for (let j = i + 1; j < this.count; j++) {
                        const p2 = this.particles[j]
                        const distSq = p.position.distanceToSquared(p2.position)
                        if (distSq < this.MIN_DIST_SQ && distSq > 0.000001) {
                            const dist = Math.sqrt(distSq)
                            this.tempVec.copy(p.position).sub(p2.position)
                            this.tempVec.x /= dist
                            this.tempVec.y /= dist
                            this.tempVec.z /= dist
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
                    // Re-enforce boundary
                    const distFromCenterSq = p.position.lengthSq()
                    if (distFromCenterSq > this.edgeDistSq) {
                        this.tempVec.copy(p.position).normalize()
                        const dot = p.velocity.dot(this.tempVec)
                        if (dot > 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.8)
                        p.position.setLength(this.edgeDist)
                    }
                    // Re-enforce camera forcefield
                    const distToCamSq = p.position.distanceToSquared(cameraPosition)
                    if (distToCamSq < this.cameraSafeRadiusSq) {
                        const distToCam = Math.sqrt(distToCamSq)
                        this.tempVec.copy(p.position).sub(cameraPosition).normalize()
                        p.position.addScaledVector(this.tempVec, CAMERA_SAFE_RADIUS - distToCam)
                        const dot = p.velocity.dot(this.tempVec)
                        if (dot < 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.5)
                        p.velocity.addScaledVector(this.tempVec, 0.05)
                    }
                }
            }

            // --- PASS 3: Integration (damping + speed clamp + position update) ---
            for (let i = 0; i < this.count; i++) {
                const p = this.particles[i]
                p.velocity.multiplyScalar(this.dampingFactor)
                if (p.velocity.lengthSq() > this.maxSpeedSq) p.velocity.setLength(this.maxSpeed)
                p.position.add(p.velocity)
            }

            // --- PASS 4: Idle diffusion (gentle mutual repulsion when settled) ---
            const ENERGY_THRESHOLD = 0.05
            if (step === SUB_STEPS - 1 && totalKE < ENERGY_THRESHOLD) {
                const force = (ENERGY_THRESHOLD - totalKE) * 0.003
                const maxR = BOUNDARY_RADIUS * 0.75
                const maxRSq = maxR * maxR
                for (let i = 0; i < this.count; i++) {
                    const p = this.particles[i]
                    for (let j = i + 1; j < this.count; j++) {
                        const p2 = this.particles[j]
                        const distSq = p.position.distanceToSquared(p2.position)
                        if (distSq > this.MIN_DIST_SQ && distSq < maxRSq) {
                            const dist = Math.sqrt(distSq)
                            this.tempVec.copy(p.position).sub(p2.position)
                            this.tempVec.x /= dist
                            this.tempVec.y /= dist
                            this.tempVec.z /= dist
                            const push = force * (1 - dist / maxR)
                            p.velocity.addScaledVector(this.tempVec, push)
                            p2.velocity.addScaledVector(this.tempVec, -push)
                        }
                    }
                }
            }
        }
    }

    // Sync physics → InstancedMesh transforms. Called once per frame after step().
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
