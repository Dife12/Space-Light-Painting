// Initialize Three.js scene with Bloom effect
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5; // Set camera position
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Bloom effect setup
const renderScene = new THREE.RenderPass(scene, camera);
const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, 0.4, 0.85
);
bloomPass.threshold = 0;
bloomPass.strength = 1.5;
bloomPass.radius = 0.5;

const composer = new THREE.EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// Create finger tips (both using same cyan color)
const fingerGeometry = new THREE.SphereGeometry(0.1, 32, 32);
const fingerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });

const thumb = new THREE.Mesh(fingerGeometry, fingerMaterial);
scene.add(thumb);
thumb.visible = false;

const indexFinger = new THREE.Mesh(fingerGeometry, fingerMaterial.clone());
scene.add(indexFinger);
indexFinger.visible = false;

// Trail settings
const CYAN = 0x00ffff;
let isDrawing = false;
let currentTrail = null;
let trailPoints = [];
const trails = [];
const PINCH_THRESHOLD = 0.4; // Increased threshold for better usability

// Create hand skeleton lines
const handLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 })
);
scene.add(handLines);

// Request camera access and set up MediaPipe HandLandmarker
const video = document.getElementById('video');

async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    
    // Safe play with error handling
    video.play().catch(e => console.warn("Video play interrupted:", e));
    
    // Wait for video stream to be ready
    video.addEventListener('loadeddata', async () => {
      // Initialize and start hand tracking
      const handTrackingReady = await initHandTracking();
      
      if (handTrackingReady) {
        function processFrame() {
          if (!isTrackingActive || !video.srcObject) return;
          
          hands.send({ image: video })
            .catch(err => {
              console.error('Hand tracking error:', err);
              isTrackingActive = false;
            });
            
          if (isTrackingActive) {
            requestAnimationFrame(processFrame);
          }
        }
        
        processFrame();
      }
    });
  } catch (err) {
    console.error("Error accessing camera:", err);
  }
}

let isTrackingActive = true;
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`
});

// Initialize MediaPipe hands
async function initHandTracking() {
  try {
    await hands.initialize();
    await hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    return true;
  } catch (err) {
    console.error('Failed to initialize hand tracking:', err);
    isTrackingActive = false;
    return false;
  }
}

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const thumbTip = landmarks[4]; // Thumb tip (node 4)
        const indexTip = landmarks[8]; // Index finger tip (node 8)
        
        // Calculate visible area at z=0 plane
        const distance = camera.position.z;
        const vFov = (camera.fov * Math.PI) / 180;
        const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
        const visibleWidth = visibleHeight * camera.aspect;
        
        // Map finger coordinates to visible area and flip x-axis for mirror effect
        const thumbX = -(thumbTip.x - 0.5) * visibleWidth;
        const thumbY = -(thumbTip.y - 0.5) * visibleHeight;
        
        const indexX = -(indexTip.x - 0.5) * visibleWidth;
        const indexY = -(indexTip.y - 0.5) * visibleHeight;
        
        thumb.position.set(thumbX, thumbY, 0);
        thumb.visible = true;
        
        indexFinger.position.set(indexX, indexY, 0);
        indexFinger.visible = true;
        
        // Check pinch distance
        const pinchDistance = Math.sqrt(
            Math.pow(thumbX - indexX, 2) + 
            Math.pow(thumbY - indexY, 2)
        );
        
        // Start/stop drawing based on pinch distance
        if (pinchDistance < PINCH_THRESHOLD) {
            const midX = (thumbX + indexX) / 2;
            const midY = (thumbY + indexY) / 2;
            
            const newPoint = new THREE.Vector3(midX, midY, 0);
            
            // Calculate 3D distance between fingers
            const thumbPos = thumb.position;
            const indexPos = indexFinger.position;
            const pinchDistance = thumbPos.distanceTo(indexPos);
            
            // Debug log pinch distance (uncomment if needed)
            // console.log('Pinch distance:', pinchDistance);
            
            if (pinchDistance < PINCH_THRESHOLD) {
                if (!isDrawing) {
                    // Start new trail segment
                    isDrawing = true;
                    trailPoints = [newPoint];
                    
                    // Create new trail material (always cyan)
                    const trailMaterial = new THREE.MeshBasicMaterial({
                        color: CYAN,
                        transparent: true,
                        opacity: 0.8
                    });
                    
                    // Create new trail object (will be updated when we have enough points)
                    currentTrail = new THREE.Mesh(
                        new THREE.BufferGeometry(),
                        trailMaterial
                    );
                    scene.add(currentTrail);
                    trails.push(currentTrail);
                } else {
                    // Continue current trail - only add point if it's sufficiently far from last point
                    if (trailPoints.length === 0 ||
                        newPoint.distanceTo(trailPoints[trailPoints.length - 1]) > 0.03) {
                        trailPoints.push(newPoint);
                        
                        // Update trail geometry only if we have enough points
                        if (trailPoints.length >= 2) {
                            const curve = new THREE.CatmullRomCurve3(trailPoints);
                            currentTrail.geometry.dispose();
                            currentTrail.geometry = new THREE.TubeGeometry(
                                curve,
                                Math.min(100, trailPoints.length * 2),
                                0.05,
                                8,
                                false
                            );
                        }
                    }
                }
            } else {
                // Not pinching - reset drawing state
                if (isDrawing) {
                    isDrawing = false;
                    currentTrail = null;
                    trailPoints = [];
                }
            }
        } else {
            isDrawing = false;
        }
        
        // Update hand skeleton
        const connections = [
            [0,1,2,3,4],       // Thumb
            [0,5,6,7,8],       // Index
            [0,9,10,11,12],    // Middle
            [0,13,14,15,16],   // Ring
            [0,17,18,19,20],   // Pinky
            [5,9,13,17,0]      // Palm
        ];
        
        const positions = [];
        connections.forEach(connection => {
            for (let i = 0; i < connection.length - 1; i++) {
                const start = landmarks[connection[i]];
                const end = landmarks[connection[i+1]];
                
                positions.push(
                    -(start.x - 0.5) * visibleWidth,
                    -(start.y - 0.5) * visibleHeight,
                    0,
                    -(end.x - 0.5) * visibleWidth,
                    -(end.y - 0.5) * visibleHeight,
                    0
                );
            }
        });
        
        handLines.geometry.setAttribute('position', 
            new THREE.Float32BufferAttribute(positions, 3));
    } else {
        thumb.visible = false;
        indexFinger.visible = false;
        isDrawing = false;
    }
});

// Clear all trails
window.clearAllTrails = () => {
    trails.forEach(trail => {
        scene.remove(trail);
        trail.geometry.dispose();
        trail.material.dispose();
    });
    trails.length = 0;
};

// Set trail color
window.setTrailColor = (color) => {
    trailColor = color;
};

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize camera when DOM is ready
window.addEventListener('DOMContentLoaded', initCamera);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}

animate();