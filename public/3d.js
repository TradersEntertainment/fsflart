/* ============================================================
   3D VIRTUAL GALLERY — Fırça İzleri
   Three.js Museum Walk-Through
   ============================================================ */
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

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

function calculateRoom(count) {
  if (count === 0) { ROOM.width = 18; ROOM.depth = 15; return; }

  const spacing = getSpacing(count);

  // Use 4 walls for large collections: left, right, back, front (with entrance gap)
  const useAllWalls = count > 12;
  const wallCount = useAllWalls ? 4 : (count > 2 ? 3 : 2);

  // Evenly distribute across walls
  const perWall = Math.ceil(count / wallCount);

  // Side walls (left/right) determine depth
  const sidePerWall = Math.ceil(count / wallCount);
  const neededDepth = Math.max(15, (sidePerWall + 1) * spacing + 4);
  ROOM.depth = Math.min(70, neededDepth);

  // Width walls (back/front) need enough space
  const neededWidth = Math.max(18, (perWall + 1) * spacing + 4);
  ROOM.width = Math.min(50, neededWidth);
}

// ─── Init ──────────────────────────────────────────
async function init() {
  // Fetch artworks
  try {
    const res = await fetch('/api/artworks');
    const allArtworks = await res.json();
    
    // Filter by exhibition if specified in URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetExhibition = urlParams.get('exhibition');
    
    if (targetExhibition) {
      artworks = allArtworks.filter(a => (a.exhibition || '2025-2026') === targetExhibition);
    } else {
      artworks = allArtworks;
    }
  } catch {
    artworks = [];
  }

  // Dynamic room sizing
  calculateRoom(artworks.length);

  updateLoading(10, 'Sahne oluşturuluyor…');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  const fogDensity = Math.max(0.008, 0.02 - artworks.length * 0.0003);
  scene.fog = new THREE.FogExp2(0x1a1a1a, fogDensity);

  // Camera
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, EYE_HEIGHT, ROOM.depth / 2 - 3);

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

  // Controls
  controls = new PointerLockControls(camera, document.body);

  // Lights
  createLights();
  updateLoading(30, 'Galeri inşa ediliyor…');

  // Room
  createRoom();
  updateLoading(50, 'Eserler asılıyor…');

  // Paintings
  await createPaintings();
  updateLoading(90, 'Son rötuşlar…');

  // Decorations
  createDecorations();
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

  // Multiple ceiling lights spread across room
  const lightsX = Math.max(1, Math.ceil(ROOM.width / 16));
  const lightsZ = Math.max(1, Math.ceil(ROOM.depth / 16));
  for (let ix = 0; ix < lightsX; ix++) {
    for (let iz = 0; iz < lightsZ; iz++) {
      const px = (ix / Math.max(1, lightsX - 1) - 0.5) * (ROOM.width * 0.7);
      const pz = (iz / Math.max(1, lightsZ - 1) - 0.5) * (ROOM.depth * 0.7);
      const light = new THREE.PointLight(0xfff0d6, 0.4, ROOM.depth);
      light.position.set(lightsX === 1 ? 0 : px, ROOM.height - 0.5, lightsZ === 1 ? 0 : pz);
      scene.add(light);
    }
  }
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

// ─── Room ──────────────────────────────────────────
function createRoom() {
  const texLoader = new THREE.TextureLoader();

  // Floor (Reflective Marble Effect)
  const floorGeo = new THREE.PlaneGeometry(ROOM.width, ROOM.depth);
  
  // The actual mirror reflector
  const floorReflector = new Reflector(floorGeo, {
    clipBias: 0.003,
    textureWidth: window.innerWidth > 800 ? 1024 : 512, // Optimize for mobile
    textureHeight: window.innerHeight > 800 ? 1024 : 512,
    color: 0x889999, // slight tint to the reflection
  });
  floorReflector.rotation.x = -Math.PI / 2;
  scene.add(floorReflector);

  // An overlay to make it look like a material (marble/wood) rather than a pure mirror
  const floorMat = new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR,
    roughness: 0.2, // very smooth
    metalness: 0.1,
    transparent: true,
    opacity: 0.85, // let 15% of the reflection bleed through
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01; // slightly above reflector to avoid Z-fighting
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling with Skylight
  const ceilGeo = new THREE.PlaneGeometry(ROOM.width, ROOM.depth);
  const ceilMat = new THREE.MeshStandardMaterial({ color: CEILING_COLOR, roughness: 0.9 });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.height;
  scene.add(ceil);

  // Architectural Skylight (Van Gogh Starry Night)
  const skyWidth = Math.min(6, ROOM.width * 0.4);
  const skyDepth = Math.max(10, ROOM.depth * 0.6);
  const skyGeo = new THREE.PlaneGeometry(skyWidth, skyDepth);
  
  const skyTex = texLoader.load('images/famous_starrynight.png');
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.wrapT = THREE.RepeatWrapping;
  skyTex.repeat.set(2, 4); // Tile slightly to make it look like a continuous sky

  const skyMat = new THREE.MeshBasicMaterial({ 
    map: skyTex, 
    transparent: true, 
    opacity: 0.9 
  });
  const skylight = new THREE.Mesh(skyGeo, skyMat);
  skylight.rotation.x = Math.PI / 2;
  skylight.position.y = ROOM.height - 0.01;
  scene.add(skylight);

  // Atmospheric Dust Particles
  createDust();

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.85 });

  // Left wall
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.depth, ROOM.height), wallMat);
  leftWall.position.set(-ROOM.width / 2, ROOM.height / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);

  // Right wall
  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.depth, ROOM.height), wallMat);
  rightWall.position.set(ROOM.width / 2, ROOM.height / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);

  // Back wall
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), wallMat);
  backWall.position.set(0, ROOM.height / 2, -ROOM.depth / 2);
  scene.add(backWall);

  // Front wall
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), wallMat);
  frontWall.position.set(0, ROOM.height / 2, ROOM.depth / 2);
  frontWall.rotation.y = Math.PI;
  scene.add(frontWall);

  // Baseboard / skirting
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 0.6 });
  const skirtH = 0.12;
  // Left
  const ls = new THREE.Mesh(new THREE.BoxGeometry(0.02, skirtH, ROOM.depth), skirtMat);
  ls.position.set(-ROOM.width / 2 + 0.01, skirtH / 2, 0);
  scene.add(ls);
  // Right
  const rs = ls.clone();
  rs.position.x = ROOM.width / 2 - 0.01;
  scene.add(rs);
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
async function createPaintings() {
  const loader = new THREE.TextureLoader();
  const count = artworks.length;
  if (count === 0) return;
  const spacing = getSpacing(count);

  // ── Wall assignment plan ──
  // Walls: left, right, back, front (front has entrance gap)
  const sideCapacity = Math.max(1, Math.floor((ROOM.depth - 4) / spacing));
  const widthCapacity = Math.max(1, Math.floor((ROOM.width - 4) / spacing));
  const frontCapacity = Math.max(0, Math.floor((ROOM.width - 8) / spacing)); // entrance gap

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
    // 3 walls
    backCount = Math.min(widthCapacity, Math.max(1, Math.floor(count / 3)));
    const sideTotal = count - backCount;
    leftCount = Math.ceil(sideTotal / 2);
    rightCount = sideTotal - leftCount;
  } else {
    // 4 walls for large collections
    const perWall = Math.ceil(count / 4);
    leftCount = Math.min(sideCapacity, perWall);
    rightCount = Math.min(sideCapacity, perWall);
    backCount = Math.min(widthCapacity, perWall);
    frontCount = Math.min(frontCapacity, count - leftCount - rightCount - backCount);
    // Redistribute overflow back to sides
    let remaining = count - leftCount - rightCount - backCount - frontCount;
    while (remaining > 0) {
      if (leftCount < sideCapacity) { leftCount++; remaining--; }
      if (remaining > 0 && rightCount < sideCapacity) { rightCount++; remaining--; }
      if (remaining > 0 && backCount < widthCapacity) { backCount++; remaining--; }
      if (remaining <= 0) break;
      // Safety valve
      break;
    }
  }

  // Build placement list: { wall, index, total }
  const placements = [];
  let artIdx = 0;

  // Left wall
  for (let i = 0; i < leftCount; i++) {
    placements.push({ wall: 'left', idx: i, total: leftCount, artIdx: artIdx++ });
  }
  // Right wall
  for (let i = 0; i < rightCount; i++) {
    placements.push({ wall: 'right', idx: i, total: rightCount, artIdx: artIdx++ });
  }
  // Back wall
  for (let i = 0; i < backCount; i++) {
    placements.push({ wall: 'back', idx: i, total: backCount, artIdx: artIdx++ });
  }
  // Front wall (offset from center for entrance gap)
  for (let i = 0; i < frontCount; i++) {
    placements.push({ wall: 'front', idx: i, total: frontCount, artIdx: artIdx++ });
  }

  // ── Place each painting ──
  for (const p of placements) {
    const artwork = artworks[p.artIdx];
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

          // ── Position based on wall ──
          if (p.wall === 'left') {
            const startZ = -(p.total - 1) * spacing / 2;
            const z = startZ + p.idx * spacing;
            group.position.set(-ROOM.width / 2 + 0.05, EYE_HEIGHT + 0.2, z);
            group.rotation.y = Math.PI / 2;
            addPaintingSpotlight(-ROOM.width / 2 + 2, ROOM.height - 0.3, z, -ROOM.width / 2, z);
          } else if (p.wall === 'right') {
            const startZ = -(p.total - 1) * spacing / 2;
            const z = startZ + p.idx * spacing;
            group.position.set(ROOM.width / 2 - 0.05, EYE_HEIGHT + 0.2, z);
            group.rotation.y = -Math.PI / 2;
            addPaintingSpotlight(ROOM.width / 2 - 2, ROOM.height - 0.3, z, ROOM.width / 2, z);
          } else if (p.wall === 'back') {
            const startX = -(p.total - 1) * spacing / 2;
            const x = startX + p.idx * spacing;
            group.position.set(x, EYE_HEIGHT + 0.2, -ROOM.depth / 2 + 0.05);
            group.rotation.y = 0;
            addPaintingSpotlight(x, ROOM.height - 0.3, -ROOM.depth / 2 + 2, x, -ROOM.depth / 2);
          } else if (p.wall === 'front') {
            // Front wall — offset paintings to sides, leaving center entrance clear
            const startX = -(p.total - 1) * spacing / 2;
            const x = startX + p.idx * spacing;
            group.position.set(x, EYE_HEIGHT + 0.2, ROOM.depth / 2 - 0.05);
            group.rotation.y = Math.PI;
            addPaintingSpotlight(x, ROOM.height - 0.3, ROOM.depth / 2 - 2, x, ROOM.depth / 2);
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
function createDecorations() {
  // Gallery benches
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 0.6, metalness: 0.1 });
  const benchGeo = new THREE.BoxGeometry(2, 0.45, 0.6);

  [-8, 0, 8].forEach((z) => {
    const bench = new THREE.Mesh(benchGeo, benchMat);
    bench.position.set(0, 0.225, z);
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
    track.position.set(side * (ROOM.width / 2 - 2.5), ROOM.height - 0.15, 0);
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

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    if (!controls.isLocked) return;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(paintingMeshes);
    if (intersects.length > 0 && intersects[0].distance < 25) {
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
  renderer.domElement.addEventListener('touchstart', (e) => {
    if (!mobileActive) return;
    for (const t of e.changedTouches) {
      // Ignore touches on joystick area
      if (t.clientX < 180 && t.clientY > window.innerHeight - 180) continue;
      if (touchLookId === null) {
        touchLookId = t.identifier;
        touchLookPrev = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: true });

  renderer.domElement.addEventListener('touchmove', (e) => {
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
  }, { passive: true });

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
    camera.position.x = Math.max(-ROOM.width / 2 + margin, Math.min(ROOM.width / 2 - margin, camera.position.x));
    camera.position.z = Math.max(-ROOM.depth / 2 + margin, Math.min(ROOM.depth / 2 - margin, camera.position.z));
    
    // Head Bobbing
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (speed > 1.0) {
      bobTime += delta * 12; // bob speed
      camera.position.y = EYE_HEIGHT + Math.sin(bobTime) * 0.06; // bob amplitude
    } else {
      // Smoothly return to eye height
      camera.position.y += (EYE_HEIGHT - camera.position.y) * 0.1;
      bobTime = 0;
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

    if (typeof updatePlayers === 'function') updatePlayers();

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

  // Body — capsule shape
  const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.7, 4, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = -0.3;
  group.add(body);

  // Head — sphere
  const headGeo = new THREE.SphereGeometry(0.18, 8, 8);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf5e6d0, roughness: 0.7 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 0.35;
  group.add(head);

  // Direction indicator (small nose)
  const noseGeo = new THREE.ConeGeometry(0.06, 0.12, 4);
  const noseMat = new THREE.MeshStandardMaterial({ color });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.3, 0.2);
  group.add(nose);

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
function updatePlayers() {
  const time = Date.now() * 0.005;
  otherPlayers.forEach((player) => {
    if (player.targetPos) {
      const dx = player.targetPos.x - player.mesh.position.x;
      const dz = player.targetPos.z - player.mesh.position.z;
      const speed = Math.sqrt(dx*dx + dz*dz);
      
      player.mesh.position.x += dx * 0.15;
      player.mesh.position.z += dz * 0.15;
      
      // Bobbing
      let yTarget = player.targetPos.y;
      if (speed > 0.01) {
        yTarget += Math.sin(time) * 0.05;
      }
      player.mesh.position.y += (yTarget - player.mesh.position.y) * 0.15;
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
}, 1000);
