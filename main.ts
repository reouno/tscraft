// main.ts
// Use the global THREE loaded via CDN in index.html
declare const THREE: any;

// --- Basic setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe9ff); // softer sky
scene.fog = new THREE.Fog(0xcfe9ff, 20, 90);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
// Fill the window cleanly
document.body.style.margin = '0';
renderer.domElement.style.display = 'block';

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Soft lighting
const hemi = new THREE.HemisphereLight(0xf0f8ff, 0xece5d8, 0.8);
scene.add(hemi);

// --- World / ground ---
const GROUND_SIZE = 64; // visual ground
const groundGeometry = new THREE.BoxGeometry(GROUND_SIZE, 1, GROUND_SIZE);
const groundMaterial = new THREE.MeshLambertMaterial({ color: 0xb7e0a5 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.5; // top at y = 0
ground.name = 'GROUND';
scene.add(ground);

// --- Crosshair ---
function addCrosshair() {
  const css = document.createElement('style');
  css.textContent = `
  .crosshair { position: fixed; left: 50%; top: 50%; width: 20px; height: 20px; pointer-events:none; transform: translate(-50%, -50%); }
  .crosshair::before, .crosshair::after { content: ''; position: absolute; background: rgba(0,0,0,0.45); }
  .crosshair::before { left: 50%; top: 0; width: 1px; height: 100%; transform: translateX(-50%); }
  .crosshair::after { top: 50%; left: 0; height: 1px; width: 100%; transform: translateY(-50%); }
  `;
  document.head.appendChild(css);
  const div = document.createElement('div');
  div.className = 'crosshair';
  document.body.appendChild(div);
}
addCrosshair();

// --- Player / controls ---
const player = {
  x: 0,
  y: 1.6, // feet at y, head around y+1.6 (player height 1.8)
  z: 5,
  vy: 0,
  onGround: false,
  yaw: 0,
  pitch: 0,
};
const PLAYER_RADIUS = 0.3;
const PLAYER_HEIGHT = 1.8;
const HEAD_OFFSET = 1.6;
const GRAVITY = -20;
const MOVE_SPEED = 4.5; // m/s
const SPRINT_MULT = 1.5;
const JUMP_VELOCITY = 8.0;

const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e: KeyboardEvent) => (keys[e.code] = true));
window.addEventListener('keyup', (e: KeyboardEvent) => (keys[e.code] = false));

// Pointer Lock
const havePointerLock = 'pointerLockElement' in document;
document.body.addEventListener('click', () => {
  if (havePointerLock && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  // no-op: could update UI if needed
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  const sensitivity = 0.0025;
  player.yaw -= e.movementX * sensitivity;
  player.pitch -= e.movementY * sensitivity;
  const maxPitch = Math.PI / 2 - 0.01;
  if (player.pitch > maxPitch) player.pitch = maxPitch;
  if (player.pitch < -maxPitch) player.pitch = -maxPitch;
});

// Prevent context menu for right click actions
window.addEventListener('contextmenu', (e) => e.preventDefault());

// --- Blocks & world data ---
type IVec3 = { x: number; y: number; z: number };
function keyOf(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}
function parseKey(k: string): IVec3 {
  const [x, y, z] = k.split(',').map((n) => parseInt(n, 10));
  return { x, y, z };
}

// Minimal structural types to avoid relying on THREE types
type Vec3Like = { x: number; y: number; z: number };
type AABB = { min: Vec3Like; max: Vec3Like };
type BlockMesh = {
  position: { set(x: number, y: number, z: number): void };
  userData?: { key?: string };
};

const blocks = new Map<string, BlockMesh>();
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const blockMaterial = new THREE.MeshLambertMaterial({ color: 0xd9bfa3 }); // soft dirt-like

const worldGroup = new THREE.Group();
scene.add(worldGroup);

function addBlock(x: number, y: number, z: number) {
  const k = keyOf(x, y, z);
  if (blocks.has(k)) return;
  const mesh = new THREE.Mesh(blockGeometry, blockMaterial);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5); // center of voxel
  mesh.userData.key = k;
  worldGroup.add(mesh);
  blocks.set(k, mesh);
}

function removeBlockAtKey(k: string) {
  const m = blocks.get(k);
  if (!m) return;
  worldGroup.remove(m);
  // Note: geometry/material are shared; do not dispose here
  blocks.delete(k);
}

// --- Raycast / interaction ---
const raycaster = new THREE.Raycaster();

let hoverBlockKey: string | null = null;
let previewPlacePos: IVec3 | null = null;

// Highlight mesh (wireframe cube)
const highlightGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001));
const highlightMat = new THREE.LineBasicMaterial({ color: 0xffd54f });
const highlight = new THREE.LineSegments(highlightGeo, highlightMat);
highlight.visible = false;
scene.add(highlight);

function updateRaycast() {
  // Cast from camera center
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const candidates = [ground, ...worldGroup.children];
  const intersects = raycaster.intersectObjects(candidates, false);
  hoverBlockKey = null;
  previewPlacePos = null;
  highlight.visible = false;

  if (!intersects.length) return;
  const hit = intersects[0];
  if (hit.distance > 5) return; // reach limit

  const n = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
  const p = hit.point.clone();

  // If we hit a block, highlight it for removal
  const obj = hit.object as { userData?: { key?: string } };
  if (obj.userData && obj.userData.key) {
    hoverBlockKey = obj.userData.key;
    const { x, y, z } = parseKey(hoverBlockKey);
    highlight.position.set(x + 0.5, y + 0.5, z + 0.5);
    highlight.visible = true;
  }

  // Compute placement preview (adjacent to the face)
  const place = p.add(n.clone().multiplyScalar(0.5)).floor();
  previewPlacePos = { x: place.x, y: place.y, z: place.z };
}

function playerAABBAt(px: number, py: number, pz: number): AABB {
  return {
    min: new THREE.Vector3(px - PLAYER_RADIUS, py, pz - PLAYER_RADIUS),
    max: new THREE.Vector3(px + PLAYER_RADIUS, py + PLAYER_HEIGHT, pz + PLAYER_RADIUS),
  };
}

function aabbIntersects(a: AABB, b: AABB) {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}

function willCollideWithPlayer(x: number, y: number, z: number) {
  const blockAABB = {
    min: new THREE.Vector3(x, y, z),
    max: new THREE.Vector3(x + 1, y + 1, z + 1),
  };
  const aabb = playerAABBAt(player.x, player.y, player.z);
  return aabbIntersects(aabb, blockAABB);
}

function tryPlaceBlock() {
  if (!previewPlacePos) return;
  const { x, y, z } = previewPlacePos;
  // Limit world bounds (optional small world)
  const MAX = 32;
  if (Math.abs(x) > MAX || Math.abs(z) > MAX || y < 0 || y > 32) return;
  if (willCollideWithPlayer(x, y, z)) return;
  addBlock(x, y, z);
}

function tryRemoveBlock() {
  if (!hoverBlockKey) return;
  removeBlockAtKey(hoverBlockKey);
}

window.addEventListener('mousedown', (e: MouseEvent) => {
  if (document.pointerLockElement !== renderer.domElement) return; // interact only when locked
  if (e.button === 0) {
    tryRemoveBlock();
  } else if (e.button === 2) {
    tryPlaceBlock();
  }
});

// --- Movement & physics ---
// (Optional) Nearby blocks helper could be added for optimization when needed

function collideY(newY: number) {
  // Ground collision
  if (newY < 0) {
    player.onGround = true;
    player.vy = 0;
    return 0;
  }
  player.onGround = false;
  // Blocks
  const aabb = playerAABBAt(player.x, newY, player.z);
  for (const k of blocks.keys()) {
    const { x, y, z } = parseKey(k);
    const blockAABB = { min: new THREE.Vector3(x, y, z), max: new THREE.Vector3(x + 1, y + 1, z + 1) };
    if (!aabbIntersects(aabb, blockAABB)) continue;
    // resolve by snapping above/below
    if (player.vy > 0) {
      newY = y - PLAYER_HEIGHT; // hit ceiling
    } else {
      newY = y + 1; // land on top
      player.onGround = true;
    }
    player.vy = 0;
    return newY;
  }
  return newY;
}

function collideX(newX: number) {
  const aabb = playerAABBAt(newX, player.y, player.z);
  for (const k of blocks.keys()) {
    const { x, y, z } = parseKey(k);
    const blockAABB = { min: new THREE.Vector3(x, y, z), max: new THREE.Vector3(x + 1, y + 1, z + 1) };
    if (!aabbIntersects(aabb, blockAABB)) continue;
    if (newX > player.x) newX = x - PLAYER_RADIUS; else newX = x + 1 + PLAYER_RADIUS;
  }
  return newX;
}

function collideZ(newZ: number) {
  const aabb = playerAABBAt(player.x, player.y, newZ);
  for (const k of blocks.keys()) {
    const { x, y, z } = parseKey(k);
    const blockAABB = { min: new THREE.Vector3(x, y, z), max: new THREE.Vector3(x + 1, y + 1, z + 1) };
    if (!aabbIntersects(aabb, blockAABB)) continue;
    if (newZ > player.z) newZ = z - PLAYER_RADIUS; else newZ = z + 1 + PLAYER_RADIUS;
  }
  return newZ;
}

// --- Initial setup ---
camera.position.set(player.x, player.y + HEAD_OFFSET, player.z);
camera.lookAt(0, 0, 0);

// Place one starter block for reference
addBlock(0, 0, 0);

// --- Main loop ---
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // Movement input
  let moveX = 0, moveZ = 0;
  if (keys['KeyW']) moveZ += 1; // forward
  if (keys['KeyS']) moveZ -= 1; // backward
  if (keys['KeyA']) moveX -= 1;
  if (keys['KeyD']) moveX += 1;
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = MOVE_SPEED * (sprint ? SPRINT_MULT : 1);

  // Camera orientation -> world directions
  const yaw = player.yaw;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  let wish = new THREE.Vector3();
  wish.addScaledVector(forward, moveZ).addScaledVector(right, moveX);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * dt);

  // Horizontal move with collision
  let newX = player.x + wish.x;
  let newZ = player.z + wish.z;
  newX = collideX(newX);
  newZ = collideZ(newZ);
  player.x = newX;
  player.z = newZ;

  // Jump
  if (keys['Space'] && player.onGround) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
  }
  // Gravity
  player.vy += GRAVITY * dt;
  let newY = player.y + player.vy * dt;
  newY = collideY(newY);
  player.y = newY;

  // Update camera pose
  camera.position.set(player.x, player.y + HEAD_OFFSET, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  // Update interaction preview
  updateRaycast();
  if (previewPlacePos && !willCollideWithPlayer(previewPlacePos.x, previewPlacePos.y, previewPlacePos.z)) {
    highlight.visible = true;
    highlight.position.set(previewPlacePos.x + 0.5, previewPlacePos.y + 0.5, previewPlacePos.z + 0.5);
  }

  renderer.render(scene, camera);
}
animate();
