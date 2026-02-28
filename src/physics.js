/**
 * ============================================================================
 * physics.js — Bespoke Multi-Pass Collision & Dynamics Engine
 * ============================================================================
 *
 * A lightweight, high-performance physics simulator purpose-built for the
 * Wilson Ball 3D scene. It manages N spherical bodies inside a bounded
 * volume, resolving collisions, enforcing boundaries, and simulating
 * ambient micro-gravity diffusion — all in pure JavaScript with zero
 * external physics library dependencies.
 *
 * ARCHITECTURE OVERVIEW:
 *
 *   1. UNIFIED PAIR LOOP — A single O(n²) sweep handles soft repulsion
 *      auras AND hard ball-to-ball collisions in one pass, eliminating
 *      redundant distance calculations.
 *
 *   2. ITERATIVE SOLVER — Additional solver passes (SOLVER_ITERATIONS)
 *      re-enforce collision constraints for stability in dense clusters.
 *
 *   3. INTEGRATION — Velocities are damped and clamped, then applied to
 *      positions AFTER all constraint solving is complete. This prevents
 *      balls from being moved into overlapping states.
 *
 *   4. HOMOGENEOUS DIFFUSION — When the system's kinetic energy drops
 *      below a threshold (balls stop moving), a gentle mutual repulsion
 *      pushes all balls apart uniformly, filling the volume evenly.
 *
 * PERFORMANCE NOTES:
 *   - All distance checks use distanceToSquared() to avoid sqrt() unless
 *     an actual interaction is detected.
 *   - Pre-computed squared thresholds (AURA_RADIUS_SQ, MIN_DIST_SQ) are
 *     used for all hot-path comparisons.
 *   - Manual vector normalization reuses the already-computed distance,
 *     avoiding a redundant sqrt() from THREE.Vector3.normalize().
 *
 * ============================================================================
 */

import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Simulation Constants
// ---------------------------------------------------------------------------

/** Default ball collision radius (units). Overridden by actual GLTF bounding sphere at runtime. */
export const DEFAULT_BALL_RADIUS = 3.5

/** Radius of the invisible spherical boundary that contains all balls. */
export const BOUNDARY_RADIUS = 40

/** Number of physics sub-steps per animation frame. Higher = more accurate but slower. */
export const SUB_STEPS = 2

/** Number of iterative constraint-solving passes per sub-step. Prevents interpenetration in dense clusters. */
export const SOLVER_ITERATIONS = 6

/** Minimum distance between the camera and any ball. Prevents balls from clipping into the viewer. */
export const CAMERA_SAFE_RADIUS = 12

/** Coefficient of restitution for ball-to-ball bounces. 1.0 = perfectly elastic, 0.0 = perfectly inelastic. */
export const RESTITUTION = 0.85


// ---------------------------------------------------------------------------
// PhysicsSimulator Class
// ---------------------------------------------------------------------------

export class PhysicsSimulator {

    /**
     * Create a new physics simulator.
     * @param {number} count — Number of balls to simulate.
     * @param {number} ballRadius — Collision radius per ball (from GLTF bounding sphere).
     */
    constructor(count, ballRadius) {
        this.count = count
        this.BALL_RADIUS = ballRadius || DEFAULT_BALL_RADIUS

        // Soft repulsion aura: a larger invisible shell around each ball that
        // gently pushes nearby balls away before they actually collide.
        this.AURA_RADIUS = this.BALL_RADIUS * 2.5
        this.AURA_RADIUS_SQ = this.AURA_RADIUS * this.AURA_RADIUS

        // Hard collision distance: balls closer than this are physically overlapping
        // and must be forcefully separated.
        this.MIN_DIST = this.BALL_RADIUS * 2 + 0.05
        this.MIN_DIST_SQ = this.MIN_DIST * this.MIN_DIST

        // Particle state array — each entry holds position, velocity, rotation, etc.
        this.particles = []

        // Reusable scratch vector to avoid per-frame allocations (GC pressure).
        this.tempVec = new THREE.Vector3()

        this.initParticles()
    }

    /**
     * Initialize all particles with random non-overlapping positions within the boundary.
     * Uses rejection sampling: generate a random position, check it doesn't overlap
     * any existing particle, and retry if it does (up to 200 attempts per ball).
     */
    initParticles() {
        const minDist = this.BALL_RADIUS * 2.1
        const minDistSq = minDist * minDist
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

    /**
     * Advance the simulation by one frame.
     * Called once per requestAnimationFrame from the React render loop.
     *
     * @param {THREE.Vector3} cameraPosition — The camera's current position in
     *   the InstancedMesh's local coordinate space.
     */
    step(cameraPosition) {
        const cameraSafeRadiusSq = CAMERA_SAFE_RADIUS * CAMERA_SAFE_RADIUS
        const edgeDist = BOUNDARY_RADIUS - this.BALL_RADIUS

        for (let step = 0; step < SUB_STEPS; step++) {
            let totalKineticEnergy = 0

            // =================================================================
            // PASS 1: UNIFIED PAIR LOOP
            // Handles soft repulsion aura + hard ball-to-ball collisions in a
            // single O(n²) sweep. This replaces 3 formerly separate loops.
            // =================================================================
            for (let i = 0; i < this.count; i++) {
                const p = this.particles[i]

                // Accumulate kinetic energy on the first sub-step only
                // (used later to trigger idle diffusion)
                if (step === 0) {
                    totalKineticEnergy += p.velocity.lengthSq()
                }

                for (let j = i + 1; j < this.count; j++) {
                    const p2 = this.particles[j]

                    // Fast squared-distance check — avoids sqrt() for distant pairs
                    const distSq = p.position.distanceToSquared(p2.position)

                    // Skip pairs outside the aura radius (no interaction possible)
                    if (distSq >= this.AURA_RADIUS_SQ || distSq < 0.000001) continue

                    // Only compute sqrt() when we know an interaction will occur
                    const dist = Math.sqrt(distSq)

                    // Manual normalization: reuse the distance we already computed
                    // instead of calling .normalize() which would sqrt() again
                    this.tempVec.copy(p.position).sub(p2.position)
                    this.tempVec.x /= dist
                    this.tempVec.y /= dist
                    this.tempVec.z /= dist

                    if (dist < this.MIN_DIST) {
                        // ---------------------------------------------------------
                        // HARD COLLISION: Balls are overlapping!
                        // Push them apart by 55% of the overlap on each side
                        // (slight over-correction prevents persistent contact)
                        // ---------------------------------------------------------
                        const correction = (this.MIN_DIST - dist) * 0.55
                        p.position.addScaledVector(this.tempVec, correction)
                        p2.position.addScaledVector(this.tempVec, -correction)

                        // Apply impulse-based velocity response
                        const relVel = p.velocity.dot(this.tempVec) - p2.velocity.dot(this.tempVec)
                        if (relVel < 0) {
                            const impulse = Math.max(0.005 / SUB_STEPS, -relVel * (1 + RESTITUTION)) * 0.5
                            p.velocity.addScaledVector(this.tempVec, impulse)
                            p2.velocity.addScaledVector(this.tempVec, -impulse)
                        }
                    } else {
                        // ---------------------------------------------------------
                        // SOFT AURA REPULSION: Balls are close but not overlapping.
                        // Apply a gentle quadratic push to prevent future collisions.
                        // ---------------------------------------------------------
                        const pushForce = Math.pow((this.AURA_RADIUS - dist) / this.AURA_RADIUS, 2) * 0.01 / SUB_STEPS
                        p.velocity.addScaledVector(this.tempVec, pushForce)
                        p2.velocity.addScaledVector(this.tempVec, -pushForce)
                    }
                }

                // ---------------------------------------------------------
                // BOUNDARY CONTAINMENT: Keep ball inside the spherical volume
                // If a ball crosses the boundary, reflect its velocity inward
                // and clamp its position to the edge.
                // ---------------------------------------------------------
                const distFromCenterSq = p.position.lengthSq()
                if (distFromCenterSq > edgeDist * edgeDist) {
                    const distFromCenter = Math.sqrt(distFromCenterSq)
                    this.tempVec.copy(p.position).normalize()
                    const dot = p.velocity.dot(this.tempVec)
                    if (dot > 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.8)
                    p.position.setLength(edgeDist)
                }

                // ---------------------------------------------------------
                // CAMERA FORCEFIELD: Prevent balls from clipping into the viewer.
                // This acts as an invisible rigid sphere around the camera that
                // forcefully ejects any ball entering its radius.
                // ---------------------------------------------------------
                const distToCamSq = p.position.distanceToSquared(cameraPosition)
                if (distToCamSq < cameraSafeRadiusSq) {
                    const distToCam = Math.sqrt(distToCamSq)
                    this.tempVec.copy(p.position).sub(cameraPosition).normalize()
                    p.position.addScaledVector(this.tempVec, CAMERA_SAFE_RADIUS - distToCam)
                    const dot = p.velocity.dot(this.tempVec)
                    if (dot < 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.5)
                    p.velocity.addScaledVector(this.tempVec, 0.05)
                }
            }

            // =================================================================
            // PASS 2: ITERATIVE COLLISION REFINEMENT
            // Additional solver passes tighten collision constraints in dense
            // clusters where a single pass is insufficient. Each pass only
            // handles hard collisions + boundary + camera (no aura needed).
            // =================================================================
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

                    // Re-enforce boundary containment after each solver pass
                    const distFromCenterSq = p.position.lengthSq()
                    if (distFromCenterSq > edgeDist * edgeDist) {
                        this.tempVec.copy(p.position).normalize()
                        const dot = p.velocity.dot(this.tempVec)
                        if (dot > 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.8)
                        p.position.setLength(edgeDist)
                    }

                    // Re-enforce camera forcefield after each solver pass
                    const distToCamSq = p.position.distanceToSquared(cameraPosition)
                    if (distToCamSq < cameraSafeRadiusSq) {
                        const distToCam = Math.sqrt(distToCamSq)
                        this.tempVec.copy(p.position).sub(cameraPosition).normalize()
                        p.position.addScaledVector(this.tempVec, CAMERA_SAFE_RADIUS - distToCam)
                        const dot = p.velocity.dot(this.tempVec)
                        if (dot < 0) p.velocity.addScaledVector(this.tempVec, -dot * 1.5)
                        p.velocity.addScaledVector(this.tempVec, 0.05)
                    }
                }
            }

            // =================================================================
            // PASS 3: VELOCITY INTEGRATION
            // Apply damping (air resistance), clamp maximum speed, and then
            // move each ball along its velocity vector. This happens AFTER all
            // collision solving so positions are guaranteed clean.
            // =================================================================
            const dampingFactor = Math.pow(0.99, 1 / SUB_STEPS)
            const maxSpeed = 0.4 / SUB_STEPS
            for (let i = 0; i < this.count; i++) {
                const p = this.particles[i]
                p.velocity.multiplyScalar(dampingFactor)
                if (p.velocity.lengthSq() > maxSpeed * maxSpeed) p.velocity.setLength(maxSpeed)
                p.position.add(p.velocity)
            }

            // =================================================================
            // PASS 4: HOMOGENEOUS DIFFUSION (Idle State)
            // When the simulation settles (total kinetic energy < threshold),
            // apply a gentle mutual repulsion between ALL ball pairs. This
            // causes the cluster to expand uniformly and fill the boundary
            // volume evenly, creating a visually pleasing distribution.
            // =================================================================
            const ENERGY_THRESHOLD = 0.05
            if (step === SUB_STEPS - 1 && totalKineticEnergy < ENERGY_THRESHOLD) {
                const diffusionForce = (ENERGY_THRESHOLD - totalKineticEnergy) * 0.003
                const MAX_INFLUENCE_RADIUS = BOUNDARY_RADIUS * 0.75
                const MAX_INFLUENCE_RADIUS_SQ = MAX_INFLUENCE_RADIUS * MAX_INFLUENCE_RADIUS

                for (let i = 0; i < this.count; i++) {
                    const p = this.particles[i]
                    for (let j = i + 1; j < this.count; j++) {
                        const p2 = this.particles[j]
                        const distSq = p.position.distanceToSquared(p2.position)
                        if (distSq > this.MIN_DIST_SQ && distSq < MAX_INFLUENCE_RADIUS_SQ) {
                            const dist = Math.sqrt(distSq)
                            this.tempVec.copy(p.position).sub(p2.position)
                            this.tempVec.x /= dist
                            this.tempVec.y /= dist
                            this.tempVec.z /= dist
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

    /**
     * Sync physics state to the visual InstancedMesh transforms.
     * Updates the transformation matrix of each instanced ball to reflect its
     * current position and rotation. Called once per frame after step().
     *
     * @param {React.RefObject} meshRef — Ref to the textured InstancedMesh.
     * @param {React.RefObject} primRef — Ref to the wireframe InstancedMesh.
     * @param {THREE.Matrix4} tempMatrix — Reusable scratch matrix.
     */
    updateInstances(meshRef, primRef, tempMatrix) {
        for (let i = 0; i < this.count; i++) {
            const p = this.particles[i]

            // Advance rotation (purely visual, not physics-driven)
            p.rotation.x += p.rotVel.x
            p.rotation.y += p.rotVel.y
            p.rotation.z += p.rotVel.z

            // Build the transform matrix: rotation + position
            tempMatrix.makeRotationFromEuler(p.rotation)
            tempMatrix.setPosition(p.position)

            // Write to both the textured and wireframe instanced meshes
            if (meshRef.current) meshRef.current.setMatrixAt(i, tempMatrix)
            if (primRef.current) primRef.current.setMatrixAt(i, tempMatrix)
        }

        // Flag the instance matrices as dirty so Three.js uploads them to the GPU
        if (meshRef.current) meshRef.current.instanceMatrix.needsUpdate = true
        if (primRef.current) primRef.current.instanceMatrix.needsUpdate = true
    }
}
