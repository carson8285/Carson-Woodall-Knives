// viewer.js (type="module")
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const container = document.getElementById("knifeViewer");

// ---- events builder.js uses for the overlay ----
function emitLoading(loading, text = "Loading…") {
  window.dispatchEvent(new CustomEvent("knifeviewer:loading", { detail: { loading, text } }));
}
function emitError(message) {
  window.dispatchEvent(new CustomEvent("knifeviewer:error", { detail: { message } }));
}

// ---- wait for container size, but NEVER forever ----
function waitForSize(el, { min = 20, timeoutMs = 2000 } = {}) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const w = el?.clientWidth ?? 0;
      const h = el?.clientHeight ?? 0;
      if (w >= min && h >= min) return resolve({ w, h, ok: true });
      if (performance.now() - start > timeoutMs) return resolve({ w, h, ok: false });
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function frameObject(camera, controls, object, fit = 1.22) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  const fov = (camera.fov * Math.PI) / 180;
  const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * fit;

  camera.position.set(center.x, center.y, center.z + dist);
  camera.near = Math.max(maxDim / 1000, 0.001);
  camera.far = Math.max(maxDim * 100, 10);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  } else {
    camera.lookAt(center);
  }
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => {
      if (!m) return;
      for (const k in m) {
        const v = m[k];
        if (v && v.isTexture) v.dispose();
      }
      m.dispose?.();
    });
  });
}

let renderer, scene, camera, controls;
let currentModel = null;
let initialized = false;

const gltfLoader = new GLTFLoader();
let loadToken = 0;

// Ready is a *function* that can retry init if first attempt happened during 0×0 layout.
async function ensureInit() {
  if (initialized) return true;

  if (!container) {
    emitError("viewer: #knifeViewer not found");
    return false;
  }

  // Try for a real size, but don’t hang forever.
  let { w, h, ok } = await waitForSize(container, { timeoutMs: 2000 });

  // If still not ok, try one more time after next paint (common after cache clear)
  if (!ok) {
    await new Promise((r) => setTimeout(r, 60));
    ({ w, h, ok } = await waitForSize(container, { timeoutMs: 2000 }));
  }

  // If still 0×0, fall back to window size (so we at least mount the canvas)
  if (!ok) {
    w = Math.max(window.innerWidth, 320);
    h = Math.max(window.innerHeight, 240);
  }

  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 1000);
  camera.position.set(0, 0.2, 2);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);

  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 1.1));

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 3, 4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-3, 1.5, 2);
  scene.add(fill);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 0.4;
  controls.maxDistance = 12;

  const resize = () => {
    if (!container || !renderer || !camera) return;
    const ww = container.clientWidth;
    const hh = container.clientHeight;
    if (ww < 20 || hh < 20) return;
    renderer.setSize(ww, hh, false);
    camera.aspect = ww / hh;
    camera.updateProjectionMatrix();
  };

  const ro = new ResizeObserver(resize);
  ro.observe(container);

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(resize, 80), { passive: true });
  window.visualViewport?.addEventListener("resize", resize, { passive: true });

  // Context loss (mobile + some GPUs)
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    emitError("WebGL context lost. Try refresh if it doesn’t recover.");
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    setTimeout(resize, 80);
  });

  const animate = () => {
    requestAnimationFrame(animate);
    controls?.update?.();
    renderer?.render?.(scene, camera);
  };
  animate();

  // One extra kick after mount helps “first load after cache clear”
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  setTimeout(() => window.dispatchEvent(new Event("resize")), 120);

  initialized = true;
  return true;
}

async function loadModel(url) {
  const token = ++loadToken;
  emitLoading(true, "Loading model…");

  try {
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(url, resolve, undefined, reject);
    });

    // stale request protection
    if (token !== loadToken) return;

    if (currentModel) {
      scene.remove(currentModel);
      disposeObject(currentModel);
      currentModel = null;
    }

    currentModel = gltf.scene;
    scene.add(currentModel);

    frameObject(camera, controls, currentModel, 1.22);
  } catch (err) {
    console.error("Model load failed:", url, err);
    emitError(`Model failed to load: ${url}`);
  } finally {
    // ALWAYS turn off loading for the latest token
    if (token === loadToken) emitLoading(false);
  }
}

// 🔧 IMPORTANT: make sure this matches your actual model filenames/paths
function getModelUrlFromState(state) {
  const knifeId = state?.knife;
  if (!knifeId) return null;

  // Resolves relative to viewer.js location, works on GitHub Pages subpaths
  return new URL(`./assets/models/${knifeId}.glb`, import.meta.url).href;
}


async function applyState(state) {
  const ok = await ensureInit();
  if (!ok) return;

  const url = getModelUrlFromState(state);
  if (!url) return;

  await loadModel(url);
}

// Expose global API
window.KnifeViewer = {
  ready: ensureInit,   // function, not a one-time promise
  applyState
};

// Init after DOM is there
document.addEventListener("DOMContentLoaded", () => {
  ensureInit();
});
