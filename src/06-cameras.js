import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Base
 */
// Canvas
const canvas = document.querySelector('canvas.webgl');

// Sizes
const sizes = {
  width: 800,
  height: 600,
};

// Scene
const scene = new THREE.Scene();

// Geometry
const geometry = new THREE.BufferGeometry();
const positions = [];
const colors = [];
const indices = [];

const thetaSteps = 80;
const phiSteps = 80;

for (let i = 0; i <= thetaSteps; i++) {
  const theta = ((i / thetaSteps) * Math.PI) / 2; // θ: 0 ~ π

  for (let j = 0; j <= phiSteps; j++) {
    const phi = (j / phiSteps) * 2 * Math.PI; // φ: 0 ~ 2π

    const gain = Math.pow(Math.cos(theta), 10); // 天線增益
    const r = 2 * gain;

    const x = r * Math.sin(theta) * Math.cos(phi);
    const y = r * Math.sin(theta) * Math.sin(phi);
    const z = r * Math.cos(theta);

    positions.push(x, y, z);

    // 顏色可以根據 gain 設定 (例如用 HSL 映射)
    const color = new THREE.Color().setHSL(gain, 0.9, 0.5);
    colors.push(color.r, color.g, color.b);
  }
}

// AxesHelper
const axesHelper = new THREE.AxesHelper(3);
scene.add(axesHelper);

// 建立索引資料（讓每個區塊形成兩個三角形）
for (let i = 0; i < thetaSteps; i++) {
  for (let j = 0; j < phiSteps; j++) {
    const a = i * (phiSteps + 1) + j;
    const b = a + phiSteps + 1;

    indices.push(a, b, a + 1); // triangle 1
    indices.push(b, b + 1, a + 1); // triangle 2
  }
}

// 加入資料到 geometry
geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
geometry.setIndex(indices);
geometry.computeVertexNormals();

// Material
const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  side: THREE.DoubleSide,
  flatShading: false,
  transparent: true,
  opacity: 0.8,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 5, 5);
scene.add(ambientLight, directionalLight);

// Add a plane to represent the reflection surface (xy-plane)
const planeGeometry = new THREE.PlaneGeometry(4, 4);
const planeMaterial = new THREE.MeshBasicMaterial({
  color: 0xaaaaaa,
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
});
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.position.set(0, 0, 0);
scene.add(plane);

// Camera
const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
camera.position.set(5, 5, 5);
camera.lookAt(mesh.position);
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas: canvas });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Animate
const clock = new THREE.Clock();

const tick = () => {
  const elapsedTime = clock.getElapsedTime();

  // 可加點動態效果
  // mesh.rotation.y = elapsedTime * 0.1;
  mesh.scale.set(1 + Math.sin(elapsedTime) * 0.02, 1 + Math.sin(elapsedTime) * 0.02, 1 + Math.sin(elapsedTime) * 0.02);

  controls.update();
  renderer.render(scene, camera);
  window.requestAnimationFrame(tick);
};

tick();
