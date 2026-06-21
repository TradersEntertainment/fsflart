/* ============================================================
   3D VIRTUAL GALLERY — Fırça İzleri
   Three.js Museum Walk-Through
   ============================================================ */
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─── Config ────────────────────────────────────────
const ROOM = { width: 28, height: 5, depth: 40 };
const WALL_COLOR = 0xf5f0e8;
const FLOOR_COLOR = 0x3d2b1f;
const CEILING_COLOR = 0xe8e0d0;
const FRAME_COLOR = 0x2c1a0a;
const PAINTING_HEIGHT = 1.8;
const WALK_SPEED = 5;
const EYE_HEIGHT = 1.65;
const MAX_SPOTLIGHTS = 50; // Every painting gets a spotlight

// ─── Audio System ──────────────────────────────────
let audioListener = null;
let bgmSound = null;


function initAudio() {
  if (audioListener) return; // already initialized
  audioListener = new THREE.AudioListener();
  camera.add(audioListener);

  bgmSound = new THREE.Audio(audioListener);
  const audioLoader = new THREE.AudioLoader();
  audioLoader.load('assets/music.ogg', (buffer) => {
    bgmSound.setBuffer(buffer);
    bgmSound.setLoop(true);
    bgmSound.setVolume(0.15); // soft classical music
    bgmSound.play();
  });
}

function playFootstep() {
  if (!audioListener || !audioListener.context) return;
  const ctx = audioListener.context;
  if (ctx.state !== 'running') return;
  
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  // A dull thud for footstep
  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, t);
  osc.frequency.exponentialRampToValueAtTime(10, t + 0.1);
  
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(t);
  osc.stop(t + 0.1);
}
// ─── State ─────────────────────────────────────────
let camera, scene, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const clock = new THREE.Clock();
let bobTime = 0; // For head bobbing effect
const paintingMeshes = [];
let artworks = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);

// ─── Mobile Detection ──────────────────────────────
const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1);
let mobileActive = false;

// Touch look state
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
let touchLookId = null;
let touchLookPrev = { x: 0, y: 0 };
const LOOK_SENSITIVITY = 0.004;

// Joystick state
let joystickActive = false;
let joystickInput = { x: 0, y: 0 };

// ─── DOM ───────────────────────────────────────────
const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-fill');
const loadingText = document.getElementById('loading-text');
const startOverlay = document.getElementById('start-overlay');
const hud = document.getElementById('hud');
const crosshair = document.getElementById('crosshair');
const panel = document.getElementById('artwork-panel');
const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
const joystickBase = document.getElementById('joystick-base');
const mobileHint = document.getElementById('mobile-hint');

// ─── Room Size Calculator ──────────────────────────
function getSpacing(count) {
  // Tighter spacing for larger collections
  if (count <= 8) return 4.5;
  if (count <= 15) return 4.0;
  if (count <= 25) return 3.5;
  return 3.0;
}

const CORRIDOR_WIDTH = 12;
const CORRIDOR_DEPTH = 10;
let ROOM_OFFSET_X = 0;
let mainArtworks = [];
let specialArtworks = [];

function calculateRoom(count1, count2) {
  const maxCount = Math.max(count1, count2, 1);
  if (maxCount === 0) { ROOM.width = 18; ROOM.depth = 15; return; }

  const spacing = getSpacing(maxCount);

  // Use 4 walls for large collections
  const useAllWalls = maxCount > 12;
  const wallCount = useAllWalls ? 4 : (maxCount > 2 ? 3 : 2);
  const perWall = Math.ceil(maxCount / wallCount);
  const sidePerWall = Math.ceil(maxCount / wallCount);
  
  const neededDepth = Math.max(15, (sidePerWall + 1) * spacing + 4);
  ROOM.depth = Math.min(70, neededDepth);

  const neededWidth = Math.max(18, (perWall + 1) * spacing + 4);
  ROOM.width = Math.min(50, neededWidth);

  ROOM_OFFSET_X = ROOM.width + CORRIDOR_WIDTH;
}

// ─── Init ──────────────────────────────────────────
let sharedPlayerModel = null;
let playerAnimations = null;

function loadPlayerModel() {
  const loader = new GLTFLoader();
  loader.load('assets/Robot.glb', (gltf) => {
    sharedPlayerModel = gltf.scene;
    playerAnimations = gltf.animations;
    
    // Optimize shadows and material
    sharedPlayerModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    // Scale Robot up as needed
    sharedPlayerModel.scale.set(0.4, 0.4, 0.4);
  });
}

async function init() {
  try {
    const res = await fetch('/api/artworks');
    const allArtworks = await res.json();
    mainArtworks = allArtworks.filter(a => (a.exhibition || '2025-2026') === '2025-2026');
    specialArtworks = allArtworks.filter(a => a.exhibition === 'ozel-koleksiyon');
    artworks = allArtworks;
  } catch {
    artworks = []; mainArtworks = []; specialArtworks = [];
  }

  // Dynamic room sizing
  calculateRoom(mainArtworks.length, specialArtworks.length);

  loadPlayerModel();

  updateLoading(10, 'Sahne oluşturuluyor…');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  const fogDensity = Math.max(0.008, 0.02 - artworks.length * 0.0003);
  scene.fog = new THREE.FogExp2(0x1a1a1a, fogDensity);

  // Camera
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);
  
  const urlParams = new URLSearchParams(window.location.search);
  const targetExhibition = urlParams.get('exhibition');
  if (targetExhibition === 'ozel-koleksiyon') {
    camera.position.set(ROOM_OFFSET_X, EYE_HEIGHT, ROOM.depth / 2 - 3);
  } else {
    camera.position.set(0, EYE_HEIGHT, ROOM.depth / 2 - 3);
  }

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  document.body.appendChild(renderer.domElement);

  updateLoading(20, 'Işıklar yerleştiriliyor…');
  controls = new PointerLockControls(camera, document.body);
  createLights();

  updateLoading(30, 'Odalar inşa ediliyor…');
  createRoom(0, true);
  createRoom(ROOM_OFFSET_X, false);
  createCorridor();
  createSkybox();
  createDust();

  updateLoading(50, 'Eserler asılıyor…');
  await createPaintings(mainArtworks, 0);
  await createPaintings(specialArtworks, ROOM_OFFSET_X);

  updateLoading(90, 'Son rötuşlar…');
  createDecorations(0);
  createDecorations(ROOM_OFFSET_X);

  updateLoading(100, 'Hazır!');

  // Events
  setupEvents();

  // Hide loading, show start
  setTimeout(() => {
    loadingScreen.classList.add('fade-out');
    startOverlay.classList.remove('hidden');
    if (isMobile) {
      document.getElementById('start-click-text').textContent = 'Dokunarak başlayın';
    }
    setTimeout(() => loadingScreen.style.display = 'none', 600);
  }, 500);

  // Start render loop
  animate();
}

function updateLoading(pct, text) {
  loadingFill.style.width = pct + '%';
  loadingText.textContent = text;
}

// ─── Lights ────────────────────────────────────────
let spotlightCount = 0;

function createLights() {
  // Ambient — brighter for larger rooms
  const ambientIntensity = Math.min(0.5, 0.25 + artworks.length * 0.008);
  scene.add(new THREE.AmbientLight(0xfff5e6, ambientIntensity));

  // Multiple ceiling lights spread across both rooms
  const lightsX = Math.max(1, Math.ceil(ROOM.width / 16));
  const lightsZ = Math.max(1, Math.ceil(ROOM.depth / 16));
  
  [0, ROOM_OFFSET_X].forEach(offsetX => {
    for (let ix = 0; ix < lightsX; ix++) {
      for (let iz = 0; iz < lightsZ; iz++) {
        const px = offsetX + (ix / Math.max(1, lightsX - 1) - 0.5) * (ROOM.width * 0.7);
        const pz = (iz / Math.max(1, lightsZ - 1) - 0.5) * (ROOM.depth * 0.7);
        const light = new THREE.PointLight(0xfff0d6, 0.4, ROOM.depth);
        light.position.set(lightsX === 1 ? offsetX : px, ROOM.height - 0.5, lightsZ === 1 ? 0 : pz);
        scene.add(light);
      }
    }
  });

  // Corridor light
  const cLight = new THREE.PointLight(0xfff0d6, 0.6, 20);
  cLight.position.set(ROOM_OFFSET_X / 2, ROOM.height - 0.5, 0);
  scene.add(cLight);
}

function addPaintingSpotlight(x, y, z, targetX, targetZ) {
  if (spotlightCount < MAX_SPOTLIGHTS) {
    // Dramatic cone spotlight
    const spot = new THREE.SpotLight(0xfff5e6, 2.5, 12, Math.PI / 6, 0.6, 1.5);
    spot.position.set(x, y, z);
    spot.target.position.set(targetX, EYE_HEIGHT, targetZ);
    // Shadow disabled for performance since there are many lights
    spot.castShadow = false; 
    scene.add(spot);
    scene.add(spot.target);
    spotlightCount++;
  } else {
    // Cheaper point light for performance
    const light = new THREE.PointLight(0xfff5e6, 1.5, 8);
    light.position.set(x, y, z);
    scene.add(light);
  }
}

// ─── Minecraft Glass Texture Generator ─────────────
function createMinecraftGlassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');

  // Semi-transparent base
  ctx.fillStyle = 'rgba(180, 220, 255, 0.15)';
  ctx.fillRect(0, 0, 16, 16);

  // Borders (light cyan)
  ctx.fillStyle = 'rgba(210, 240, 255, 0.7)';
  ctx.fillRect(0, 0, 16, 1); // top
  ctx.fillRect(0, 15, 16, 1); // bottom
  ctx.fillRect(0, 0, 1, 16); // left
  ctx.fillRect(15, 0, 1, 16); // right

  // Diagonal streaks (classic Minecraft glass look)
  ctx.fillStyle = 'rgba(230, 250, 255, 0.6)';
  // Main streak
  for(let i=0; i<4; i++) ctx.fillRect(2+i, 4+i, 2, 2);
  for(let i=0; i<3; i++) ctx.fillRect(9+i, 11+i, 2, 2);
  // Minor streak
  ctx.fillRect(11, 3, 2, 2);
  ctx.fillRect(13, 5, 2, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // Sharp pixel edges!
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Room ──────────────────────────────────────────
function createRoom(offsetX, isRoom1) {
  const texLoader = new THREE.TextureLoader();

  // Floor (Reflective Marble Effect)
  const floorGeo = new THREE.PlaneGeometry(ROOM.width, ROOM.depth);
  const floorReflector = new Reflector(floorGeo, {
    clipBias: 0.003,
    textureWidth: window.innerWidth > 800 ? 1024 : 512,
    textureHeight: window.innerHeight > 800 ? 1024 : 512,
    color: 0x889999,
  });
  floorReflector.rotation.x = -Math.PI / 2;
  floorReflector.position.x = offsetX;
  scene.add(floorReflector);

  const floorMat = new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(offsetX, 0.01, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling with Massive Deep Recessed Skylight
  const ceilMat = new THREE.MeshStandardMaterial({ color: CEILING_COLOR, roughness: 0.9 });
  const holeWidth = ROOM.width * 0.40;
  const holeDepth = ROOM.depth * 0.40;
  const ceilZLen = (ROOM.depth - holeDepth) / 2;

  const ceil1 = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ceilZLen), ceilMat);
  ceil1.rotation.x = Math.PI / 2; ceil1.position.set(offsetX, ROOM.height, -ROOM.depth/2 + ceilZLen/2); scene.add(ceil1);

  const ceil2 = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ceilZLen), ceilMat);
  ceil2.rotation.x = Math.PI / 2; ceil2.position.set(offsetX, ROOM.height, ROOM.depth/2 - ceilZLen/2); scene.add(ceil2);

  const ceilXLen = (ROOM.width - holeWidth) / 2;
  const ceil3 = new THREE.Mesh(new THREE.PlaneGeometry(ceilXLen, holeDepth), ceilMat);
  ceil3.rotation.x = Math.PI / 2; ceil3.position.set(offsetX - ROOM.width/2 + ceilXLen/2, ROOM.height, 0); scene.add(ceil3);

  const ceil4 = new THREE.Mesh(new THREE.PlaneGeometry(ceilXLen, holeDepth), ceilMat);
  ceil4.rotation.x = Math.PI / 2; ceil4.position.set(offsetX + ROOM.width/2 - ceilXLen/2, ROOM.height, 0); scene.add(ceil4);

  // Skylight Glass
  const mcGlassTex = createMinecraftGlassTexture();
  mcGlassTex.repeat.set(Math.ceil(holeWidth / 1.5), Math.ceil(holeDepth / 1.5));
  const glassGeo = new THREE.PlaneGeometry(holeWidth, holeDepth);
  const glassMat = new THREE.MeshBasicMaterial({ map: mcGlassTex, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  const glassPane = new THREE.Mesh(glassGeo, glassMat);
  glassPane.rotation.x = Math.PI / 2; glassPane.position.set(offsetX, ROOM.height, 0); scene.add(glassPane);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.85 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 0.6 });
  const skirtH = 0.12;

  // Left wall
  if (isRoom1) {
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.depth, ROOM.height), wallMat);
    leftWall.position.set(offsetX - ROOM.width / 2, ROOM.height / 2, 0);
    leftWall.rotation.y = Math.PI / 2; scene.add(leftWall);

    const ls = new THREE.Mesh(new THREE.BoxGeometry(0.02, skirtH, ROOM.depth), skirtMat);
    ls.position.set(offsetX - ROOM.width / 2 + 0.01, skirtH / 2, 0); scene.add(ls);
  } else {
    // Room 2 left wall has a hole for the corridor
    const w = (ROOM.depth - CORRIDOR_DEPTH) / 2;
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.height), wallMat);
    w1.position.set(offsetX - ROOM.width / 2, ROOM.height / 2, -ROOM.depth/2 + w/2);
    w1.rotation.y = Math.PI / 2; scene.add(w1);

    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.height), wallMat);
    w2.position.set(offsetX - ROOM.width / 2, ROOM.height / 2, ROOM.depth/2 - w/2);
    w2.rotation.y = Math.PI / 2; scene.add(w2);
  }

  // Right wall
  if (!isRoom1) {
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.depth, ROOM.height), wallMat);
    rightWall.position.set(offsetX + ROOM.width / 2, ROOM.height / 2, 0);
    rightWall.rotation.y = -Math.PI / 2; scene.add(rightWall);

    const rs = new THREE.Mesh(new THREE.BoxGeometry(0.02, skirtH, ROOM.depth), skirtMat);
    rs.position.set(offsetX + ROOM.width / 2 - 0.01, skirtH / 2, 0); scene.add(rs);
  } else {
    // Room 1 right wall has a hole for the corridor
    const w = (ROOM.depth - CORRIDOR_DEPTH) / 2;
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.height), wallMat);
    w1.position.set(offsetX + ROOM.width / 2, ROOM.height / 2, -ROOM.depth/2 + w/2);
    w1.rotation.y = -Math.PI / 2; scene.add(w1);

    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.height), wallMat);
    w2.position.set(offsetX + ROOM.width / 2, ROOM.height / 2, ROOM.depth/2 - w/2);
    w2.rotation.y = -Math.PI / 2; scene.add(w2);
  }

  // Back wall
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), wallMat);
  backWall.position.set(offsetX, ROOM.height / 2, -ROOM.depth / 2); scene.add(backWall);

  // Front wall
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), wallMat);
  frontWall.position.set(offsetX, ROOM.height / 2, ROOM.depth / 2);
  frontWall.rotation.y = Math.PI; scene.add(frontWall);
}

function createCorridor() {
  const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.85 });
  const floorMat = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 0.2, metalness: 0.1 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: CEILING_COLOR, roughness: 0.9 });
  
  const midX = ROOM_OFFSET_X / 2;
  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDTH, CORRIDOR_DEPTH), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(midX, 0.01, 0); scene.add(floor);
  
  // Ceil
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDTH, CORRIDOR_DEPTH), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(midX, ROOM.height, 0); scene.add(ceil);

  // Front wall of corridor
  const fw = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDTH, ROOM.height), wallMat);
  fw.position.set(midX, ROOM.height/2, CORRIDOR_DEPTH/2); fw.rotation.y = Math.PI; scene.add(fw);
  
  // Back wall of corridor
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDTH, ROOM.height), wallMat);
  bw.position.set(midX, ROOM.height/2, -CORRIDOR_DEPTH/2); scene.add(bw);

  // ─── Corridor Signs ───
  function createSign(text, isRightArrow) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Transparent background for wall-painted look
    ctx.clearRect(0, 0, 1024, 256);
    
    // Elegant, flat black text
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'normal 70px "Times New Roman", serif'; // Daha şık ve ince bir görünüm
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw text and elegant thin arrows
    // ⟶ and ⟵ are more elegant than thick arrows
    const arrow = isRightArrow ? '⟶' : '⟵';
    const displayText = isRightArrow ? `${text}  ${arrow}` : `${arrow}  ${text}`;
    ctx.fillText(displayText, 512, 128);

    const tex = new THREE.CanvasTexture(canvas);
    // Transparent material
    const mat = new THREE.MeshStandardMaterial({ 
      map: tex, 
      transparent: true,
      roughness: 0.8,
      depthWrite: false // prevents z-fighting issues with the wall
    });
    const geo = new THREE.PlaneGeometry(6, 1.5);
    return new THREE.Mesh(geo, mat);
  }

  // Sign on Back Wall (Z = -CORRIDOR_DEPTH/2)
  const signBack = createSign('FSFL Özel Koleksiyon', true);
  // Extremely close to wall (0.01) to look painted
  signBack.position.set(midX, EYE_HEIGHT + 0.5, -CORRIDOR_DEPTH/2 + 0.01);
  scene.add(signBack);

  // Let's verify: Stand in corridor. Look at Front Wall (+Z).
  // +X (Room 2) is on your left.
  // -X (Room 1) is on your right.
  // So the Front Wall sign should be: `2025-2026 Sergisi ➔`
  const signFront = createSign('2025-2026 Sergisi', true);
  signFront.position.set(midX, EYE_HEIGHT + 0.5, CORRIDOR_DEPTH/2 - 0.05);
  signFront.rotation.y = Math.PI; // Face inward
  scene.add(signFront);
}

function createSkybox() {
  const texLoader = new THREE.TextureLoader();
  const skyWidth = (ROOM.width * 2 + CORRIDOR_WIDTH) * 3.0; // 500% scale essentially
  const skyDepth = ROOM.depth * 5.0;
  const skyTex = texLoader.load('images/starry_sky_ai.png');
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.wrapS = THREE.MirroredRepeatWrapping;
  skyTex.wrapT = THREE.MirroredRepeatWrapping;
  skyTex.repeat.set(15, 15); // scaled up for massive sky
  
  const skyGeo = new THREE.PlaneGeometry(skyWidth, skyDepth);
  const midX = ROOM_OFFSET_X / 2;
  
  const skylightBase = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex, color: 0x444455 }));
  skylightBase.rotation.x = Math.PI / 2; skylightBase.position.set(midX, ROOM.height + 3.5, 0); scene.add(skylightBase);

  const skylightGlow = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex, color: 0xffeebb, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.45 }));
  skylightGlow.rotation.x = Math.PI / 2; skylightGlow.position.set(midX, ROOM.height + 3.49, 0); scene.add(skylightGlow);
}

// ─── Particles ─────────────────────────────────────
let dustParticles;
function createDust() {
  const particleCount = 100; // Even lighter amount for subtle effect
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(particleCount * 3);
  for(let i=0; i<particleCount; i++) {
    pos[i*3] = (Math.random() - 0.5) * ROOM.width; // x
    pos[i*3+1] = Math.random() * ROOM.height; // y
    pos[i*3+2] = (Math.random() - 0.5) * ROOM.depth; // z
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffeebb,
    size: 0.04,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending
  });
  dustParticles = new THREE.Points(geo, mat);
  scene.add(dustParticles);
}

// ─── Paintings ─────────────────────────────────────
async function createPaintings(list, offsetX) {
  const loader = new THREE.TextureLoader();
  const count = list.length;
  if (count === 0) return;
  const spacing = getSpacing(count);

  // ── Wall assignment plan ──
  const sideCapacity = Math.max(1, Math.floor((ROOM.depth - 4) / spacing));
  const widthCapacity = Math.max(1, Math.floor((ROOM.width - 4) / spacing));
  const frontCapacity = Math.max(0, Math.floor((ROOM.width - 8) / spacing)); 

  let leftCount, rightCount, backCount, frontCount = 0;
  if (count <= 2) {
    leftCount = 1;
    rightCount = count > 1 ? 1 : 0;
    backCount = 0;
  } else if (count <= 4) {
    backCount = 1;
    leftCount = Math.ceil((count - 1) / 2);
    rightCount = count - 1 - leftCount;
  } else if (count <= 12) {
    backCount = Math.min(widthCapacity, Math.max(1, Math.floor(count / 3)));
    const sideTotal = count - backCount;
    leftCount = Math.ceil(sideTotal / 2);
    rightCount = sideTotal - leftCount;
  } else {
    const perWall = Math.ceil(count / 4);
    leftCount = Math.min(sideCapacity, perWall);
    rightCount = Math.min(sideCapacity, perWall);
    backCount = Math.min(widthCapacity, perWall);
    frontCount = Math.min(frontCapacity, count - leftCount - rightCount - backCount);
    let remaining = count - leftCount - rightCount - backCount - frontCount;
    while (remaining > 0) {
      if (leftCount < sideCapacity) { leftCount++; remaining--; }
      if (remaining > 0 && rightCount < sideCapacity) { rightCount++; remaining--; }
      if (remaining > 0 && backCount < widthCapacity) { backCount++; remaining--; }
      if (remaining <= 0) break;
      break;
    }
  }

  const placements = [];
  let artIdx = 0;
  for (let i = 0; i < leftCount; i++) placements.push({ wall: 'left', idx: i, total: leftCount, artIdx: artIdx++ });
  for (let i = 0; i < rightCount; i++) placements.push({ wall: 'right', idx: i, total: rightCount, artIdx: artIdx++ });
  for (let i = 0; i < backCount; i++) placements.push({ wall: 'back', idx: i, total: backCount, artIdx: artIdx++ });
  for (let i = 0; i < frontCount; i++) placements.push({ wall: 'front', idx: i, total: frontCount, artIdx: artIdx++ });

  for (const p of placements) {
    const artwork = list[p.artIdx];
    if (!artwork) continue;

    await new Promise((resolve) => {
      loader.load(
        artwork.image,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          const aspect = tex.image.width / tex.image.height;
          const pw = PAINTING_HEIGHT * aspect;
          const ph = PAINTING_HEIGHT;

          // Frame
          const framePad = 0.08;
          const frameDepth = 0.04;
          const frameGeo = new THREE.BoxGeometry(pw + framePad * 2, ph + framePad * 2, frameDepth);
          const frameMat = new THREE.MeshStandardMaterial({ color: FRAME_COLOR, roughness: 0.4, metalness: 0.3 });
          const frame = new THREE.Mesh(frameGeo, frameMat);
          frame.castShadow = true;

          // Canvas
          const canvasGeo = new THREE.PlaneGeometry(pw, ph);
          const canvasMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
          const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
          canvasMesh.position.z = frameDepth / 2 + 0.001;

          const group = new THREE.Group();
          group.add(frame);
          group.add(canvasMesh);

          // Name plate
          createNamePlate(group, artwork, pw);

          let startZ = -(p.total - 1) * spacing / 2;
          let z = startZ + p.idx * spacing;
          let startX = -(p.total - 1) * spacing / 2;
          let x = startX + p.idx * spacing;

          // Push artworks out of the corridor hole
          const isHoleRight = (offsetX === 0 && p.wall === 'right');
          const isHoleLeft = (offsetX !== 0 && p.wall === 'left');
          if ((isHoleRight || isHoleLeft) && Math.abs(z) < (CORRIDOR_DEPTH/2 + pw/2 + 0.5)) {
            z = (z < 0) ? -CORRIDOR_DEPTH/2 - pw/2 - 0.5 : CORRIDOR_DEPTH/2 + pw/2 + 0.5;
          }

          if (p.wall === 'left') {
            group.position.set(offsetX - ROOM.width / 2 + 0.05, EYE_HEIGHT + 0.2, z);
            group.rotation.y = Math.PI / 2;
            addPaintingSpotlight(offsetX - ROOM.width / 2 + 2, ROOM.height - 0.3, z, offsetX - ROOM.width / 2, z);
          } else if (p.wall === 'right') {
            group.position.set(offsetX + ROOM.width / 2 - 0.05, EYE_HEIGHT + 0.2, z);
            group.rotation.y = -Math.PI / 2;
            addPaintingSpotlight(offsetX + ROOM.width / 2 - 2, ROOM.height - 0.3, z, offsetX + ROOM.width / 2, z);
          } else if (p.wall === 'back') {
            group.position.set(offsetX + x, EYE_HEIGHT + 0.2, -ROOM.depth / 2 + 0.05);
            group.rotation.y = 0;
            addPaintingSpotlight(offsetX + x, ROOM.height - 0.3, -ROOM.depth / 2 + 2, offsetX + x, -ROOM.depth / 2);
          } else if (p.wall === 'front') {
            group.position.set(offsetX + x, EYE_HEIGHT + 0.2, ROOM.depth / 2 - 0.05);
            group.rotation.y = Math.PI;
            addPaintingSpotlight(offsetX + x, ROOM.height - 0.3, ROOM.depth / 2 - 2, offsetX + x, ROOM.depth / 2);
          }

          scene.add(group);

          // Store for raycasting
          canvasMesh.userData = { artworkId: artwork.id, artwork };
          paintingMeshes.push(canvasMesh);

          updateLoading(50 + Math.round(40 * (p.artIdx + 1) / count), `Eser asılıyor: ${p.artIdx + 1}/${count}`);
          resolve();
        },
        undefined,
        () => resolve()
      );
    });
  }
}

function createNamePlate(group, artwork, paintingWidth) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 80;

  ctx.fillStyle = '#1a1815';
  ctx.fillRect(0, 0, 512, 80);
  ctx.fillStyle = '#c9a96e';
  ctx.fillRect(0, 0, 512, 2);

  ctx.fillStyle = '#f5f0e8';
  ctx.font = 'bold 22px serif';
  ctx.textAlign = 'center';
  ctx.fillText(artwork.title, 256, 32);

  ctx.fillStyle = '#a09080';
  ctx.font = 'italic 16px serif';
  ctx.fillText(`${artwork.artist} · ${artwork.grade}`, 256, 58);

  const tex = new THREE.CanvasTexture(canvas);
  const plateGeo = new THREE.PlaneGeometry(paintingWidth * 0.7, paintingWidth * 0.7 * (80 / 512));
  const plateMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.y = -(PAINTING_HEIGHT / 2 + 0.18);
  plate.position.z = 0.025;
  group.add(plate);
}

// ─── Decorations ───────────────────────────────────
function createDecorations(offsetX) {
  // Gallery benches
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 0.6, metalness: 0.1 });
  const benchGeo = new THREE.BoxGeometry(2, 0.45, 0.6);

  [-8, 0, 8].forEach((z) => {
    if (Math.abs(z) > ROOM.depth/2 - 2) return;
    const bench = new THREE.Mesh(benchGeo, benchMat);
    bench.position.set(offsetX, 0.225, z);
    bench.castShadow = true;
    bench.receiveShadow = true;
    scene.add(bench);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.06, 0.45, 0.06);
    [[-0.9, -0.25], [-0.9, 0.25], [0.9, -0.25], [0.9, 0.25]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, benchMat);
      leg.position.set(lx, 0.225, lz);
      bench.add(leg);
    });
  });

  // Ceiling track lights
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.8 });
  [-1, 1].forEach((side) => {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, ROOM.depth * 0.85), trackMat);
    track.position.set(offsetX + side * (ROOM.width / 2 - 2.5), ROOM.height - 0.15, 0);
    scene.add(track);
  });
}

// ─── Events ────────────────────────────────────────
function setupEvents() {
  if (isMobile) {
    setupMobileEvents();
  } else {
    setupDesktopEvents();
  }

  // Close panel (shared)
  document.getElementById('panel-close').addEventListener('click', () => {
    panel.classList.remove('open');
    if (isMobile) {
      mobileActive = true;
      joystickZone.style.display = 'block';
      mobileHint.style.display = 'block';
    } else {
      controls.lock();
    }
  });

  // Resize (shared)
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ─── Desktop Events ────────────────────────────────
function setupDesktopEvents() {
  startOverlay.addEventListener('click', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    initAudio();
    controls.lock();
  });

  controls.addEventListener('lock', () => {
    startOverlay.classList.add('hidden');
    hud.style.display = '';
    crosshair.style.display = '';
  });

  controls.addEventListener('unlock', () => {
    if (!panel.classList.contains('open')) {
      startOverlay.classList.remove('hidden');
    }
    hud.style.display = 'none';
    crosshair.style.display = 'none';
  });

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': moveForward = true; break;
      case 'KeyS': case 'ArrowDown': moveBackward = true; break;
      case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
      case 'KeyD': case 'ArrowRight': moveRight = true; break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': moveForward = false; break;
      case 'KeyS': case 'ArrowDown': moveBackward = false; break;
      case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
      case 'KeyD': case 'ArrowRight': moveRight = false; break;
    }
  });

  // PC click: Use document-level 'click' which fires reliably under PointerLock
  document.addEventListener('click', (e) => {
    if (!controls.isLocked) return;
    
    // When pointer is locked, the center of the screen (0,0) is always the target
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(paintingMeshes);
    if (intersects.length > 0 && intersects[0].distance < 15) {
      const artwork = intersects[0].object.userData.artwork;
      if (artwork) showArtworkPanel(artwork);
    }
  });
}

// ─── Mobile Events ─────────────────────────────────
function setupMobileEvents() {
  // Start touch
  startOverlay.addEventListener('touchstart', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    e.preventDefault();
    initAudio();
    startOverlay.classList.add('hidden');
    mobileActive = true;
    joystickZone.style.display = 'block';
    mobileHint.style.display = 'block';
    euler.setFromQuaternion(camera.quaternion);
  });

  // Joystick
  let joystickTouchId = null;
  const joystickRect = () => joystickBase.getBoundingClientRect();
  const joystickRadius = 60;
  const knobMax = 38;

  joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.changedTouches[0];
    joystickTouchId = t.identifier;
    joystickActive = true;
    joystickKnob.classList.add('active');
    updateJoystick(t);
  });

  joystickBase.addEventListener('touchmove', (e) => {
    e.preventDefault();
    e.stopPropagation();
    for (const t of e.changedTouches) {
      if (t.identifier === joystickTouchId) {
        updateJoystick(t);
        break;
      }
    }
  });

  const resetJoystick = () => {
    joystickTouchId = null;
    joystickActive = false;
    joystickInput = { x: 0, y: 0 };
    joystickKnob.style.transform = 'translate(-50%, -50%)';
    joystickKnob.classList.remove('active');
  };

  joystickBase.addEventListener('touchend', resetJoystick);
  joystickBase.addEventListener('touchcancel', resetJoystick);

  function updateJoystick(touch) {
    const rect = joystickRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > knobMax) {
      dx = (dx / dist) * knobMax;
      dy = (dy / dist) * knobMax;
    }
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joystickInput = { x: dx / knobMax, y: dy / knobMax };
  }

  // Touch look (right half of screen, i.e. not joystick)
  renderer.domElement.style.touchAction = 'none'; // Prevent native browser actions like pull-to-refresh
  
  renderer.domElement.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!mobileActive) return;
    for (const t of e.changedTouches) {
      // Ignore touches on joystick area
      if (t.clientX < 180 && t.clientY > window.innerHeight - 180) continue;
      if (touchLookId === null) {
        touchLookId = t.identifier;
        touchLookPrev = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });

  renderer.domElement.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!mobileActive || touchLookId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === touchLookId) {
        const dx = t.clientX - touchLookPrev.x;
        const dy = t.clientY - touchLookPrev.y;
        euler.y -= dx * LOOK_SENSITIVITY;
        euler.x -= dy * LOOK_SENSITIVITY;
        euler.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, euler.x));
        camera.quaternion.setFromEuler(euler);
        touchLookPrev = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });

  const releaseLook = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchLookId) {
        touchLookId = null;
      }
    }
  };
  renderer.domElement.addEventListener('touchend', releaseLook, { passive: true });
  renderer.domElement.addEventListener('touchcancel', releaseLook, { passive: true });

  // Tap to inspect painting (short tap detection)
  let tapStart = 0;
  let tapPos = { x: 0, y: 0 };
  renderer.domElement.addEventListener('touchstart', (e) => {
    tapStart = Date.now();
    tapPos = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  }, { passive: true });

  renderer.domElement.addEventListener('touchend', (e) => {
    if (!mobileActive) return;
    const elapsed = Date.now() - tapStart;
    const t = e.changedTouches[0];
    const moved = Math.abs(t.clientX - tapPos.x) + Math.abs(t.clientY - tapPos.y);
    if (elapsed < 300 && moved < 20) {
      // Short tap — check painting hit
      const nx = (t.clientX / window.innerWidth) * 2 - 1;
      const ny = -(t.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const intersects = raycaster.intersectObjects(paintingMeshes);
      if (intersects.length > 0 && intersects[0].distance < 15) {
        const artwork = intersects[0].object.userData.artwork;
        if (artwork) {
          mobileActive = false;
          joystickZone.style.display = 'none';
          mobileHint.style.display = 'none';
          showArtworkPanel(artwork);
        }
      }
    }
  }, { passive: true });
}

let currentSlide = 0;
let totalSlides = 0;

function showArtworkPanel(artwork) {
  if (!isMobile) controls.unlock();
  document.getElementById('panel-overline').textContent = artwork.techniqueLabel || '';
  document.getElementById('panel-title').textContent = artwork.title;
  document.getElementById('panel-artist').textContent = `${artwork.artist} · ${artwork.grade}`;
  document.getElementById('panel-technique').textContent = artwork.techniqueLabel || '';
  document.getElementById('panel-dimensions').textContent = artwork.dimensions || '';
  document.getElementById('panel-desc').textContent = artwork.description || '';
  
  // Setup Carousel
  const track = document.getElementById('carousel-track');
  const dotsContainer = document.getElementById('carousel-dots');
  
  // Gather images
  const images = [];
  if (artwork.image) images.push(artwork.image);
  if (artwork.image2) images.push(artwork.image2);
  if (artwork.image3) images.push(artwork.image3);
  
  totalSlides = images.length;
  currentSlide = 0;
  
  track.innerHTML = images.map(src => `<div class="carousel-slide"><img src="${src}" alt="" /></div>`).join('');
  
  if (totalSlides > 1) {
    dotsContainer.innerHTML = images.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}"></div>`).join('');
    dotsContainer.style.display = 'flex';
  } else {
    dotsContainer.style.display = 'none';
  }
  
  updateCarousel();
  
  // Reset sheet visibility
  document.getElementById('panel-content').classList.remove('hidden');
  
  // Show hint briefly
  const hint = document.getElementById('carousel-hint');
  if (hint) {
    hint.style.opacity = '1';
    setTimeout(() => { hint.style.opacity = '0'; }, 3000);
  }
  
  panel.classList.add('open');
}

function updateCarousel() {
  const track = document.getElementById('carousel-track');
  track.style.transform = `translateX(-${currentSlide * 100}%)`;
  
  const dots = document.querySelectorAll('.dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === currentSlide);
  });
}

// Carousel Interactions (Swipe & Click)
const carouselContainer = document.getElementById('carousel-container');
let swipeStartX = 0;
let swipeCurrentX = 0;
let isSwiping = false;

carouselContainer.addEventListener('touchstart', (e) => {
  swipeStartX = e.touches[0].clientX;
  isSwiping = true;
});

carouselContainer.addEventListener('touchmove', (e) => {
  if (!isSwiping) return;
  swipeCurrentX = e.touches[0].clientX;
});

carouselContainer.addEventListener('touchend', (e) => {
  if (!isSwiping) return;
  isSwiping = false;
  const diffX = swipeStartX - (swipeCurrentX || swipeStartX);
  
  if (Math.abs(diffX) > 50) {
    // Swipe
    if (diffX > 0 && currentSlide < totalSlides - 1) {
      currentSlide++; // swipe left
    } else if (diffX < 0 && currentSlide > 0) {
      currentSlide--; // swipe right
    }
    updateCarousel();
  } else if (Math.abs(diffX) < 10) {
    // Tap -> toggle bottom sheet
    document.getElementById('panel-content').classList.toggle('hidden');
  }
  swipeCurrentX = 0;
});

carouselContainer.addEventListener('mousedown', (e) => {
  swipeStartX = e.clientX;
  isSwiping = true;
});

carouselContainer.addEventListener('mousemove', (e) => {
  if (!isSwiping) return;
  swipeCurrentX = e.clientX;
});

carouselContainer.addEventListener('mouseup', (e) => {
  if (!isSwiping) return;
  isSwiping = false;
  const diffX = swipeStartX - (swipeCurrentX || swipeStartX);
  
  if (Math.abs(diffX) > 50) {
    if (diffX > 0 && currentSlide < totalSlides - 1) {
      currentSlide++;
    } else if (diffX < 0 && currentSlide > 0) {
      currentSlide--;
    }
    updateCarousel();
  } else if (Math.abs(diffX) < 10) {
    document.getElementById('panel-content').classList.toggle('hidden');
  }
  swipeCurrentX = 0;
});


// ─── Animation Loop ────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const isActive = isMobile ? mobileActive : controls.isLocked;

  if (isActive) {
    const damping = 8;
    velocity.x -= velocity.x * damping * delta;
    velocity.z -= velocity.z * damping * delta;

    if (isMobile && joystickActive) {
      // Joystick input → direction relative to camera facing
      velocity.z += joystickInput.y * WALK_SPEED * delta * 10;
      velocity.x += joystickInput.x * WALK_SPEED * delta * 10;

      // Move in camera direction
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      camera.position.addScaledVector(forward, -velocity.z * delta);
      camera.position.addScaledVector(right, velocity.x * delta);
    } else if (!isMobile) {
      direction.z = Number(moveForward) - Number(moveBackward);
      direction.x = Number(moveRight) - Number(moveLeft);
      direction.normalize();

      if (moveForward || moveBackward) velocity.z -= direction.z * WALK_SPEED * delta * 10;
      if (moveLeft || moveRight) velocity.x -= direction.x * WALK_SPEED * delta * 10;

      controls.moveRight(-velocity.x * delta);
      controls.moveForward(-velocity.z * delta);
    }

    // Clamp to room bounds
    const margin = 1;
    let minX, maxX;
    let zVal = camera.position.z;
    let xVal = camera.position.x;
    
    const inCorridorZ = zVal > -CORRIDOR_DEPTH/2 + margin && zVal < CORRIDOR_DEPTH/2 - margin;
    
    if (inCorridorZ) {
       minX = -ROOM.width / 2 + margin;
       maxX = ROOM_OFFSET_X + ROOM.width / 2 - margin;
    } else {
       if (xVal < ROOM_OFFSET_X / 2) {
          minX = -ROOM.width / 2 + margin;
          maxX = ROOM.width / 2 - margin;
       } else {
          minX = ROOM_OFFSET_X - ROOM.width / 2 + margin;
          maxX = ROOM_OFFSET_X + ROOM.width / 2 - margin;
       }
    }
    camera.position.x = Math.max(minX, Math.min(maxX, camera.position.x));
    camera.position.z = Math.max(-ROOM.depth / 2 + margin, Math.min(ROOM.depth / 2 - margin, camera.position.z));
    
    // Head Bobbing & Footsteps
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (speed > 1.0) {
      const prevBob = bobTime;
      bobTime += delta * 12; // bob speed
      camera.position.y = EYE_HEIGHT + Math.sin(bobTime) * 0.06; // bob amplitude
      
      if (Math.floor(prevBob / Math.PI) < Math.floor(bobTime / Math.PI)) {
        playFootstep();
      }
    } else {
      // Smoothly return to eye height
      camera.position.y += (EYE_HEIGHT - camera.position.y) * 0.1;
      bobTime = 0;
    }

    // Crosshair highlight when looking at a painting (interactive hint)
    if (!isMobile && crosshair) {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = raycaster.intersectObjects(paintingMeshes);
      if (hits.length > 0 && hits[0].distance < 15) {
        crosshair.style.borderColor = '#c9a96e';
        crosshair.style.transform = 'translate(-50%, -50%) scale(1.5)';
        crosshair.style.boxShadow = '0 0 8px rgba(201,169,110,0.6)';
      } else {
        crosshair.style.borderColor = 'rgba(255,255,255,0.7)';
        crosshair.style.transform = 'translate(-50%, -50%) scale(1)';
        crosshair.style.boxShadow = 'none';
      }
    }
  }

    if (dustParticles) {
      dustParticles.rotation.y += delta * 0.02;
      const positions = dustParticles.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] -= delta * 0.1; // Fall down slowly
        if (positions[i] < 0) positions[i] = ROOM.height; // Wrap around
      }
      dustParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (typeof updatePlayers === 'function') updatePlayers(delta);

    renderer.render(scene, camera);
}

// ─── Start ─────────────────────────────────────────
init();

// ─── Multiplayer System ────────────────────────────
const otherPlayers = new Map(); // id → { mesh, nameSprite, targetPos, targetRot }
let socket = null;
let myId = null;
let myColor = '#c9a96e';
let lastSendTime = 0;
const SEND_INTERVAL = 100; // ms between position broadcasts

function initMultiplayer() {
  if (typeof io === 'undefined') return; // socket.io not loaded

  socket = io('/gallery');

  socket.on('init', (data) => {
    myId = data.id;
    myColor = data.color;
    // Add existing players
    data.players.forEach((p) => addPlayer(p));
    updateOnlineCount();
  });

  socket.on('player-joined', (p) => {
    addPlayer(p);
    updateOnlineCount();
  });

  socket.on('player-moved', (data) => {
    const player = otherPlayers.get(data.id);
    if (player) {
      player.targetPos = data.position;
      player.targetRot = data.rotation;
    }
  });

  socket.on('player-left', (id) => {
    removePlayer(id);
    updateOnlineCount();
  });
}

function getPlayerName() {
  const input = document.getElementById('player-name');
  return (input?.value || '').trim() || 'Ziyaretçi';
}

function sendName() {
  if (socket) socket.emit('set-name', getPlayerName());
}

function sendPosition() {
  if (!socket || !myId) return;
  const now = Date.now();
  if (now - lastSendTime < SEND_INTERVAL) return;
  lastSendTime = now;

  socket.emit('move', {
    position: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    rotation: {
      x: camera.rotation.x,
      y: camera.rotation.y,
    },
  });
}

function addPlayer(data) {
  if (data.id === myId) return;
  if (otherPlayers.has(data.id)) return;

  const color = new THREE.Color(data.color || '#c9a96e');
  const group = new THREE.Group();

  let mixer = null;
  let actionIdle = null;
  let actionWalk = null;
  let currentAction = null;

  if (sharedPlayerModel) {
    const clone = SkeletonUtils.clone(sharedPlayerModel);
    
    // Optional: tint the soldier to match the assigned color
    clone.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        // The soldier texture is already colored, but we can give a slight emissive tint
        child.material.emissive = color;
        child.material.emissiveIntensity = 0.2;
      }
    });

    // Soldier is about 1.6m if scaled 1.1x in init. Adjust Y to plant feet.
    clone.position.y = -EYE_HEIGHT + 0.1; 
    // Wait, soldier might face Z instead of -Z.
    clone.rotation.y = Math.PI; 

    group.add(clone);

    if (playerAnimations && playerAnimations.length > 0) {
      mixer = new THREE.AnimationMixer(clone);
      
      const idleClip = THREE.AnimationClip.findByName(playerAnimations, 'Idle');
      const walkClip = THREE.AnimationClip.findByName(playerAnimations, 'Walking') || THREE.AnimationClip.findByName(playerAnimations, 'Walk') || THREE.AnimationClip.findByName(playerAnimations, 'Run');
      
      if (idleClip) actionIdle = mixer.clipAction(idleClip);
      if (walkClip) actionWalk = mixer.clipAction(walkClip);
      
      if (actionIdle) {
        actionIdle.play();
        currentAction = actionIdle;
      }
    }
  } else {
    // Fallback: Body — capsule shape
    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.7, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -0.3;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf5e6d0, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.35;
    group.add(head);

    const noseGeo = new THREE.ConeGeometry(0.06, 0.12, 4);
    const noseMat = new THREE.MeshStandardMaterial({ color });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.3, 0.2);
    group.add(nose);
  }

  // Name plate (canvas texture)
  const nameSprite = createNameSprite(data.name || 'Ziyaretçi', data.color);
  nameSprite.position.y = 0.7;
  group.add(nameSprite);

  // Set initial position
  group.position.set(
    data.position?.x || 0,
    data.position?.y || EYE_HEIGHT,
    data.position?.z || 15
  );

  scene.add(group);
  otherPlayers.set(data.id, {
    mesh: group,
    nameSprite,
    mixer,
    actionIdle,
    actionWalk,
    currentAction,
    targetPos: data.position || { x: 0, y: EYE_HEIGHT, z: 15 },
    targetRot: data.rotation || { x: 0, y: 0 },
  });
}

function createNameSprite(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Background pill
  ctx.fillStyle = 'rgba(12, 11, 13, 0.75)';
  ctx.beginPath();
  ctx.roundRect(16, 8, 224, 44, 22);
  ctx.fill();

  // Border
  ctx.strokeStyle = color || '#c9a96e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(16, 8, 224, 44, 22);
  ctx.stroke();

  // Text
  ctx.fillStyle = '#f5f0e8';
  ctx.font = '500 20px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.5, 0.38, 1);
  return sprite;
}

function removePlayer(id) {
  const player = otherPlayers.get(id);
  if (player) {
    scene.remove(player.mesh);
    player.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
    otherPlayers.delete(id);
  }
}

function updateOnlineCount() {
  const el = document.getElementById('online-num');
  if (el) el.textContent = otherPlayers.size + 1;
}

// Smooth interpolation for other players — called in animate loop
function updatePlayers(delta) {
  const time = Date.now() * 0.005;
  otherPlayers.forEach((player) => {
    let speed = 0;
    if (player.targetPos) {
      const dx = player.targetPos.x - player.mesh.position.x;
      const dz = player.targetPos.z - player.mesh.position.z;
      speed = Math.sqrt(dx*dx + dz*dz);
      
      player.mesh.position.x += dx * 0.15;
      player.mesh.position.z += dz * 0.15;
      
      // Bobbing only for capsule fallback
      if (!player.mixer) {
        let yTarget = player.targetPos.y;
        if (speed > 0.01) {
          yTarget += Math.sin(time) * 0.05;
        }
        player.mesh.position.y += (yTarget - player.mesh.position.y) * 0.15;
      }
    }

    if (player.targetRot) {
      // Rotate body to face direction
      const targetY = player.targetRot.y || 0;
      let diff = targetY - player.mesh.rotation.y;
      // Shortest path
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      player.mesh.rotation.y += diff * 0.15;
    }

    // Nameplate always faces camera
    if (player.nameSprite) {
      player.nameSprite.lookAt(camera.position);
    }

    // Handle GLTF animations
    if (player.mixer) {
      player.mixer.update(delta || 0.016);
      
      let targetAction = speed > 0.02 ? player.actionWalk : player.actionIdle;
      
      if (targetAction && targetAction !== player.currentAction) {
        targetAction.reset().fadeIn(0.2).play();
        if (player.currentAction) {
          player.currentAction.fadeOut(0.2);
        }
        player.currentAction = targetAction;
      }
    }
  });
}

// Patch: inject multiplayer into the existing flow
const _origSetupDesktop = typeof setupDesktopEvents === 'function' ? setupDesktopEvents : null;
const _origSetupMobile = typeof setupMobileEvents === 'function' ? setupMobileEvents : null;

// Hook into start overlay click to send name
const startOvl = document.getElementById('start-overlay');
if (startOvl) {
  startOvl.addEventListener('click', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    sendName();
  }, true);
  startOvl.addEventListener('touchstart', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    sendName();
  }, true);
}

// Hook into animate loop — override the existing animate
const _origAnimate = animate;
// We can't cleanly override, so we use a secondary loop
function multiplayerLoop() {
  requestAnimationFrame(multiplayerLoop);
  updatePlayers();
  sendPosition();
}

// Init multiplayer after a short delay to let everything load
setTimeout(() => {
  initMultiplayer();
  multiplayerLoop();
}, 2000);

