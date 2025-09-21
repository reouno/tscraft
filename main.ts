// main.ts
// Use the global THREE loaded via CDN in index.html
declare const THREE: any;

// --- Basic setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // clearer sky blue
scene.fog = new THREE.Fog(0x87ceeb, 25, 110);

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
const hemi = new THREE.HemisphereLight(0xf5faff, 0xe6ddcc, 0.9);
scene.add(hemi);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 3);
scene.add(dirLight);

// --- World / ground ---
const GROUND_SIZE = 64; // visual ground
const groundGeometry = new THREE.BoxGeometry(GROUND_SIZE, 1, GROUND_SIZE);

function makeGrassTileTexture(options?: {
  size?: number;
  base?: string;
  light?: string;
  dark?: string;
  blade?: string;
  speckle?: number;
  tileRepeat?: number;
  seed?: number;
}) {
  const size = options?.size ?? 32;
  const base = options?.base ?? '#2f6b22'; // deeper green
  const light = options?.light ?? '#4f9a36';
  const dark = options?.dark ?? '#235019';
  const blade = options?.blade ?? '#3e7f2a';
  const speckle = options?.speckle ?? 0.10;
  const tileRepeat = options?.tileRepeat ?? 16;
  let seed = options?.seed ?? 777;

  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // base fill
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // speckled patches
  const count = Math.floor(size * size * speckle);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    ctx.fillStyle = rnd() < 0.5 ? light : dark;
    const drawAt = (dx: number, dy: number) => ctx.fillRect(dx, dy, 1, 1);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) drawAt(x + ox, y + oy);
    }
  }

  // sparse short blades (1x2 or 2x1 pixels)
  for (let i = 0; i < Math.floor(size * 0.6); i++) {
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    ctx.fillStyle = blade;
    const vert = rnd() < 0.5;
    const drawAt = (dx: number, dy: number) => ctx.fillRect(dx, dy, vert ? 1 : 2, vert ? 2 : 1);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) drawAt(x + ox, y + oy);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(tileRepeat, tileRepeat);
  tex.needsUpdate = true;
  return tex;
}

const groundTexture = makeGrassTileTexture({ tileRepeat: 16 });
const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1, metalness: 0 });
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
window.addEventListener('keydown', (e: KeyboardEvent) => {
  keys[e.code] = true;
  if (e.code === 'Digit1') currentBlockType = 'dirt';
  if (e.code === 'Digit2') currentBlockType = 'stone';
  if (e.code === 'Digit3') currentBlockType = 'oak';
  if (e.code === 'KeyE') exportWorld();
  if (e.code === 'KeyI') ensureImportInput().click();
  if (e.code === 'KeyC') clearSavedWorld();
});
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
  material?: any;
  userData?: { key?: string; type?: string };
};

const blocks = new Map<string, BlockMesh>();
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

function makeDirtTileTexture(options?: {
  size?: number;
  base?: string;
  light?: string;
  dark?: string;
  speckle?: number; // 0..1 density
  border?: string;
  borderWidth?: number;
  seed?: number;
  tileRepeat?: number;
}) {
  const size = options?.size ?? 32;
  const base = options?.base ?? '#4a2f1a'; // darker brown
  const light = options?.light ?? '#6e5030';
  const dark = options?.dark ?? '#2b1a0e';
  const speckle = options?.speckle ?? 0.12;
  const border = options?.border ?? '#000000';
  const borderWidth = options?.borderWidth ?? 0; // no border by default
  let seed = options?.seed ?? 1337;
  const tileRepeat = options?.tileRepeat ?? 2;

  function rnd() {
    // simple LCG
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // base fill
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // speckles (tileable by wrapping draw calls)
  const count = Math.floor(size * size * speckle);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    ctx.fillStyle = rnd() < 0.5 ? light : dark;
    const drawAt = (dx: number, dy: number) => {
      ctx.fillRect(dx, dy, 1, 1);
    };
    // draw with wrapped copies so edges match
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        drawAt(x + ox, y + oy);
      }
    }
  }

  // subtle inner border to make block edges visible
  if (borderWidth > 0) {
    ctx.strokeStyle = border;
    ctx.lineWidth = borderWidth;
    const inset = borderWidth / 2;
    ctx.strokeRect(inset, inset, size - borderWidth, size - borderWidth);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(tileRepeat, tileRepeat);
  tex.needsUpdate = true;
  return tex;
}

function makeStoneTileTexture(options?: {
  size?: number;
  base?: string;
  light?: string;
  dark?: string;
  speckle?: number;
  seed?: number;
  tileRepeat?: number;
}) {
  const size = options?.size ?? 32;
  const base = options?.base ?? '#7a7a7a';
  const light = options?.light ?? '#9a9a9a';
  const dark = options?.dark ?? '#5a5a5a';
  const speckle = options?.speckle ?? 0.0; // we will draw blobs instead
  let seed = options?.seed ?? 4242;
  const tileRepeat = options?.tileRepeat ?? 2;

  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // draw simple cobblestone blobs
  const blobs = Math.floor((size * size) * 0.015);
  for (let i = 0; i < blobs; i++) {
    const cx = rnd() * size;
    const cy = rnd() * size;
    const r = 1.8 + rnd() * 2.5; // radius 1.8..4.3 px
    // pick shade
    const t = rnd();
    const fill = t < 0.33 ? light : t < 0.66 ? base : dark;
    const stroke = '#4c4c4c';
    // draw with wrapping to keep tileable
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(tileRepeat, tileRepeat);
  tex.needsUpdate = true;
  return tex;
}

function makeOakPlanksTexture(options?: {
  size?: number;
  base?: string;
  light?: string;
  dark?: string;
  seams?: string;
  seed?: number;
  tileRepeat?: number;
}) {
  const size = options?.size ?? 32;
  const base = options?.base ?? '#b0894a';
  const light = options?.light ?? '#c9a35f';
  const dark = options?.dark ?? '#8a6a3d';
  const seams = options?.seams ?? '#7a5a3a';
  let seed = options?.seed ?? 2024;
  const tileRepeat = options?.tileRepeat ?? 2;

  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // base fill
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // vertical plank seams (3 planks)
  ctx.strokeStyle = seams;
  ctx.lineWidth = 1;
  for (const x of [Math.floor(size / 3), Math.floor((2 * size) / 3)]) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size);
    ctx.stroke();
  }
  // subtle horizontal grain lines
  for (let y = 0; y < size; y += 2) {
    ctx.fillStyle = rnd() < 0.5 ? light : dark;
    ctx.globalAlpha = 0.05;
    ctx.fillRect(0, y, size, 1);
    ctx.globalAlpha = 1.0;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(tileRepeat, tileRepeat);
  tex.needsUpdate = true;
  return tex;
}

// --- Block types registry (simple) ---
type BlockTypeId = 'dirt' | 'stone' | 'oak';
type BlockTypeDef = { id: BlockTypeId; material: any };
const BLOCK_TYPES: Record<BlockTypeId, BlockTypeDef> = {
  dirt: { id: 'dirt', material: new THREE.MeshStandardMaterial({ map: makeDirtTileTexture({ tileRepeat: 2, borderWidth: 0 }), roughness: 1, metalness: 0 }) },
  stone: { id: 'stone', material: new THREE.MeshStandardMaterial({ map: makeStoneTileTexture({ tileRepeat: 2 }), roughness: 1, metalness: 0 }) },
  oak: { id: 'oak', material: new THREE.MeshStandardMaterial({ map: makeOakPlanksTexture({ tileRepeat: 2 }), roughness: 1, metalness: 0 }) },
};

function getBlockMaterial(type: BlockTypeId = 'dirt') {
  return BLOCK_TYPES[type].material;
}

let currentBlockType: BlockTypeId = 'dirt';

// --- Persistence (LocalStorage + JSON export/import) ---
const WORLD_SAVE_KEY = 'world_v1';
let saveTimer: number | null = null;
let allowSaving = true;

type WorldSave = {
  version: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  blocks: Array<[number, number, number, BlockTypeId]>;
};

function serializeWorld(): WorldSave {
  const out: WorldSave = {
    version: 1,
    player: { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch },
    blocks: [],
  };
  for (const k of blocks.keys()) {
    const mesh = blocks.get(k)!;
    const { x, y, z } = parseKey(k);
    const type = (mesh.userData?.type as BlockTypeId) || 'dirt';
    out.blocks.push([x, y, z, type]);
  }
  return out;
}

function applyWorld(save: WorldSave) {
  // clear blocks
  for (const m of Array.from(blocks.values())) {
    worldGroup.remove(m as any);
  }
  blocks.clear();
  for (const [x, y, z, t] of save.blocks) {
    addBlock(x, y, z, t);
  }
  player.x = save.player.x;
  player.y = save.player.y;
  player.z = save.player.z;
  player.yaw = save.player.yaw;
  player.pitch = save.player.pitch;
  camera.position.set(player.x, player.y + HEAD_OFFSET, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

function saveWorld() {
  if (!allowSaving) return;
  try {
    const data = serializeWorld();
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(data));
  } catch {}
}

function scheduleSave() {
  if (!allowSaving) return;
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveWorld();
    saveTimer = null;
  }, 3000);
}

function loadWorld(): boolean {
  try {
    const raw = localStorage.getItem(WORLD_SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as WorldSave;
    if (!data || data.version !== 1) return false;
    applyWorld(data);
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportWorld() {
  const data = serializeWorld();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `world-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;
  downloadBlob(name, blob);
}

let importInput: HTMLInputElement | null = null;
function ensureImportInput() {
  if (importInput) return importInput;
  importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.style.display = 'none';
  document.body.appendChild(importInput);
  importInput.addEventListener('change', () => {
    const f = importInput!.files && importInput!.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        if (json && json.version === 1) {
          applyWorld(json);
          saveWorld();
        }
      } catch {}
      importInput!.value = '';
    };
    reader.readAsText(f);
  });
  return importInput;
}

function clearSavedWorld() {
  const ok = window.confirm('Delete saved data. Are you sure?');
  if (!ok) return;
  try {
    // Prevent any further save writes (e.g., beforeunload or pending timer)
    allowSaving = false;
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    localStorage.removeItem(WORLD_SAVE_KEY);
  } catch {}
  // Reload to reinitialize state cleanly
  window.location.reload();
}

const worldGroup = new THREE.Group();
scene.add(worldGroup);

function addBlock(x: number, y: number, z: number, type: BlockTypeId = 'dirt') {
  const k = keyOf(x, y, z);
  if (blocks.has(k)) return;
  const mesh = new THREE.Mesh(blockGeometry, getBlockMaterial(type));
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5); // center of voxel
  mesh.userData.key = k;
  mesh.userData.type = type;
  worldGroup.add(mesh);
  blocks.set(k, mesh);
  scheduleSave();
}

function removeBlockAtKey(k: string) {
  const m = blocks.get(k);
  if (!m) return;
  worldGroup.remove(m);
  // Note: geometry/material are shared; do not dispose here
  blocks.delete(k);
  scheduleSave();
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
  addBlock(x, y, z, currentBlockType);
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

// Load saved world or place one starter block for reference
const loaded = loadWorld();
if (!loaded) addBlock(0, 0, 0, 'dirt');
window.addEventListener('beforeunload', () => saveWorld());

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

  // Camera orientation -> world directions (robust)
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0; // no vertical movement from look pitch
  if (forward.lengthSq() > 0) forward.normalize();
  // Compute right from current view direction
  const right = new THREE.Vector3().copy(forward).cross(new THREE.Vector3(0, 1, 0)).normalize();

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
