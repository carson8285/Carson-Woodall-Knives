import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

class KnifeViewer {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0.35, 2.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 4.0;
    this.controls.target.set(0, 0.20, 0);

    // Lights
    const dir = new THREE.DirectionalLight(0xffffff, 0.35);
    dir.position.set(3, 6, 3);
    this.scene.add(dir);

    // Environment
    new RGBELoader().load(
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr',
      (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = hdr;
      }
    );

    this.loader = new GLTFLoader();
    this.current = null;
    this.currentUrl = null;

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  disposeCurrent() {
    if (!this.current) return;

    this.scene.remove(this.current);
    this.current.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose?.());
      }
    });
    this.current = null;
  }

  // Promise-based loader
  loadModel(url) {
    if (!url) return Promise.resolve(false);
    if (url === this.currentUrl) return Promise.resolve(false);

    this.currentUrl = url;
    this.disposeCurrent();

    console.log('GLB loadModel():', url);

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.current = gltf.scene;
          this.scene.add(this.current);

          // ---- RESET TRANSFORMS ----
          this.current.position.set(0, 0, 0);
          this.current.rotation.set(0, 0, 0);
          this.current.scale.set(1, 1, 1);
          this.current.updateWorldMatrix(true, true);

          // ---- 1) CENTER FIRST ----
          let box = new THREE.Box3().setFromObject(this.current);
          let center = box.getCenter(new THREE.Vector3());
          this.current.position.sub(center);
          this.current.updateWorldMatrix(true, true);

          // ---- 2) SCALE TO A TARGET SIZE ----
          box = new THREE.Box3().setFromObject(this.current);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          const targetMaxDim = 1.2;
          const s = targetMaxDim / (maxDim || 1);
          this.current.scale.setScalar(s);
          this.current.updateWorldMatrix(true, true);

          // ---- 3) RE-CENTER AGAIN ----
          box = new THREE.Box3().setFromObject(this.current);
          center = box.getCenter(new THREE.Vector3());
          this.current.position.sub(center);
          this.current.updateWorldMatrix(true, true);

          // ---- 4) SET ORBIT TARGET ----
          box = new THREE.Box3().setFromObject(this.current);
          const finalSize = box.getSize(new THREE.Vector3());
          this.controls.target.set(0, finalSize.y * 0.12, 0);
          this.controls.update();

          // ---- 5) PLACE CAMERA ----
          const dist = targetMaxDim * 1.8;
          this.camera.position.set(0, finalSize.y * 0.20, dist);
          this.camera.lookAt(this.controls.target);

          resolve(true);
        },
        undefined,
        (err) => {
          console.error('GLB load error:', err, url);
          reject(err);
        }
      );
    });
  }

  // Builder hook: try modelUrl, then fallbackModelUrl
  applyState(state) {
    const primary = state?.modelUrl;
    const fallback = state?.fallbackModelUrl;

    if (!primary) return Promise.resolve(false);

    return this.loadModel(primary).catch((err) => {
      console.warn('Primary failed, trying fallback:', fallback, err);
      if (fallback) return this.loadModel(fallback);
      throw err;
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

const container = document.getElementById('knifeViewer');
const viewer = new KnifeViewer(container);
window.KnifeViewer = viewer;
