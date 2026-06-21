/* ============================================================
   3D VIRTUAL GALLERY — Fırça İzleri
   Three.js Museum Walk-Through
   ============================================================ */
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ─── Config ────────────────────────────────────────
const ROOM = { width: 28, height: 5, depth: 40 };
const WALL_COLOR = 0xf5f0e8;
const FLOOR_COLOR = 0x3d2b1f;
const CEILING_COLOR = 0xe8e0d0;
const FRAME_COLOR = 0x2c1a0a;
const PAINTING_HEIGHT = 1.8;
const PAINTING_SPACING = 5.5;
const WALK_SPEED = 5;
const EYE_HEIGHT = 1.65;

// ─── State ─────────────────────────────────────────
let camera, scene, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const clock = new THREE.Clock();
const paintingMeshes = [];
let artworks = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);

// ─── DOM ───────────────────────────────────────────
const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-fill');
const loadingText = document.getElementById('loading-text');
const startOverlay = document.getElementById('start-overlay');
const hud = document.getElementById('hud');
const crosshair = document.getElementById('crosshair');
const panel = document.getElementById('artwork-panel');

// ─── Init ──────────────────────────────────────────
async function init() {
  // Fetch artworks
  try {
    const res = await fetch('/api/artworks');
    artworks = await res.json();
  } catch {
    artworks = [];
  }

  updateLoading(10, 'Sahne oluşturuluyor…');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  scene.fog = new THREE.FogExp2(0x1a1a1a, 0.015);

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
function createLights() {
  // Ambient
  scene.add(new THREE.AmbientLight(0xfff5e6, 0.3));

  // Main ceiling light
  const ceilingLight = new THREE.PointLight(0xfff0d6, 0.5, 50);
  ceilingLight.position.set(0, ROOM.height - 0.5, 0);
  scene.add(ceilingLight);

  // Spotlights for paintings (will be added per painting)
}

function addPaintingSpotlight(x, y, z, targetX, targetZ) {
  const spot = new THREE.SpotLight(0xfff5e6, 2.5, 12, Math.PI / 6, 0.6, 1.5);
  spot.position.set(x, y, z);
  spot.target.position.set(targetX, EYE_HEIGHT, targetZ);
  spot.castShadow = true;
  scene.add(spot);
  scene.add(spot.target);
}

// ─── Room ──────────────────────────────────────────
function createRoom() {
  const texLoader = new THREE.TextureLoader();

  // Floor
  const floorGeo = new THREE.PlaneGeometry(ROOM.width, ROOM.depth);
  const floorMat = new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR,
    roughness: 0.7,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling
  const ceilGeo = new THREE.PlaneGeometry(ROOM.width, ROOM.depth);
  const ceilMat = new THREE.MeshStandardMaterial({ color: CEILING_COLOR, roughness: 0.9 });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.height;
  scene.add(ceil);

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

// ─── Paintings ─────────────────────────────────────
async function createPaintings() {
  const loader = new THREE.TextureLoader();
  const count = artworks.length;
  const halfCount = Math.ceil(count / 2);

  for (let i = 0; i < count; i++) {
    const artwork = artworks[i];
    const isLeft = i < halfCount;
    const idx = isLeft ? i : i - halfCount;
    const totalOnSide = isLeft ? halfCount : count - halfCount;

    // Distribute evenly
    const startZ = -(totalOnSide - 1) * PAINTING_SPACING / 2;
    const z = startZ + idx * PAINTING_SPACING;

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

          if (isLeft) {
            group.position.set(-ROOM.width / 2 + 0.05, EYE_HEIGHT + 0.2, z);
            group.rotation.y = Math.PI / 2;
            addPaintingSpotlight(-ROOM.width / 2 + 2, ROOM.height - 0.3, z, -ROOM.width / 2, z);
          } else {
            group.position.set(ROOM.width / 2 - 0.05, EYE_HEIGHT + 0.2, z);
            group.rotation.y = -Math.PI / 2;
            addPaintingSpotlight(ROOM.width / 2 - 2, ROOM.height - 0.3, z, ROOM.width / 2, z);
          }

          scene.add(group);

          // Store for raycasting
          canvasMesh.userData = { artworkId: artwork.id, artwork };
          paintingMeshes.push(canvasMesh);

          updateLoading(50 + Math.round(40 * (i + 1) / count), `Eser asılıyor: ${i + 1}/${count}`);
          resolve();
        },
        undefined,
        () => resolve() // skip failed loads
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
  // Pointer lock
  startOverlay.addEventListener('click', () => {
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

  // Movement
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

  // Click on paintings
  renderer.domElement.addEventListener('click', onPaintingClick);

  // Close panel
  document.getElementById('panel-close').addEventListener('click', () => {
    panel.classList.remove('open');
    controls.lock();
  });

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function onPaintingClick() {
  if (!controls.isLocked) return;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(paintingMeshes);

  if (intersects.length > 0 && intersects[0].distance < 6) {
    const artwork = intersects[0].object.userData.artwork;
    if (artwork) showArtworkPanel(artwork);
  }
}

function showArtworkPanel(artwork) {
  controls.unlock();
  document.getElementById('panel-overline').textContent = artwork.techniqueLabel || '';
  document.getElementById('panel-title').textContent = artwork.title;
  document.getElementById('panel-artist').textContent = `${artwork.artist} · ${artwork.grade}`;
  document.getElementById('panel-image').src = artwork.image;
  document.getElementById('panel-technique').textContent = artwork.techniqueLabel || '';
  document.getElementById('panel-dimensions').textContent = artwork.dimensions || '';
  document.getElementById('panel-desc').textContent = artwork.description || '';
  panel.classList.add('open');
}

// ─── Animation Loop ────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  if (controls.isLocked) {
    const delta = clock.getDelta();
    const damping = 8;

    velocity.x -= velocity.x * damping * delta;
    velocity.z -= velocity.z * damping * delta;

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (moveForward || moveBackward) velocity.z -= direction.z * WALK_SPEED * delta * 10;
    if (moveLeft || moveRight) velocity.x -= direction.x * WALK_SPEED * delta * 10;

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);

    // Clamp to room bounds
    const margin = 1;
    camera.position.x = Math.max(-ROOM.width / 2 + margin, Math.min(ROOM.width / 2 - margin, camera.position.x));
    camera.position.z = Math.max(-ROOM.depth / 2 + margin, Math.min(ROOM.depth / 2 - margin, camera.position.z));
    camera.position.y = EYE_HEIGHT;
  }

  renderer.render(scene, camera);
}

// ─── Start ─────────────────────────────────────────
init();
