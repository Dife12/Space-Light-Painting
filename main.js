// Initialize Three.js scene with Bloom effect
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5; // Set camera position
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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

// Add a glowing sphere as the brush tip
const brushGeometry = new THREE.SphereGeometry(0.1, 32, 32);
const brushMaterial = new THREE.MeshBasicMaterial({
  color: 0xaa00ff
});
const brush = new THREE.Mesh(brushGeometry, brushMaterial);
scene.add(brush);
brush.visible = false;

// Function to change brush color
window.setBrushColor = (color) => {
  brushMaterial.color.setHex(color);
};

// Request camera access and set up MediaPipe HandLandmarker
let isCameraInitialized = false;
const video = document.getElementById('video');

async function initCamera() {
  if (isCameraInitialized || !video) return;
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    
    // Safe play with error handling
    video.play().catch(e => console.warn("Video play interrupted:", e));
    
    isCameraInitialized = true;
    
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

// Initialize camera when DOM is ready
window.addEventListener('DOMContentLoaded', initCamera);

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

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
});

// Create hand skeleton lines
const handLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 })
);
scene.add(handLines);

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const indexFingerTip = landmarks[8]; // Index finger tip (node 8)
        
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
                
                // Convert to world coordinates
                const distance = camera.position.z;
                const vFov = (camera.fov * Math.PI) / 180;
                const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
                const visibleWidth = visibleHeight * camera.aspect;
                
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

        // Calculate visible area at z=0 plane
        const distance = camera.position.z;
        const vFov = (camera.fov * Math.PI) / 180;
        const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
        const visibleWidth = visibleHeight * camera.aspect;
        
        // Map finger coordinates to visible area and flip x-axis for mirror effect
        const x = -(indexFingerTip.x - 0.5) * visibleWidth;
        const y = -(indexFingerTip.y - 0.5) * visibleHeight;
        const z = 0;

        brush.position.set(x, y, z);
        brush.visible = true;
    } else {
        brush.visible = false;
    }
});

// Hand tracking is now handled in initCamera()

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});