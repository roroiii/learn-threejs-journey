import gsap from 'gsap';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Debug GUI
 */
const gui = new GUI({
  width: 320,
  title: '天線輻射圖案控制',
  closeFolders: false,
});

window.addEventListener('keydown', (event) => {
  if (event.key == 'h') gui.show(gui._hidden);
});

/**
 * 天線參數物件
 */
const antennaParams = {
  mainBeamWidth: 1.2,
  sideLobeLevel: 0.3,
  beamDirection: 0,
  elevationAngle: 0,
  frequency: 2.4, // GHz
  gain: 8, // dBi
  polarization: 'vertical',
  wireframe: false,
  opacity: 0.9,
  autoRotate: false,
  colorScheme: 'rainbow', // 可選 'rainbow', 'thermal', 'plasma', 'electric', 'fire'
};

/**
 * 顏色方案 - 參考範例檔案的明亮效果
 */
const colorSchemes = {
  rainbow: (intensity) => {
    // 使用HSL創造明亮不受光線影響的顏色
    const hue = intensity * 0.7; // 從紅(0)到紫(0.83) - 完整光譜
    const saturation = 1.0; // 最高飽和度
    const lightness = 0.3; // 固定亮度確保鮮豔
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
  thermal: (intensity) => {
    // 熱力圖：黑->藍->青->綠->黃->紅->白
    let hue, saturation, lightness;
    if (intensity < 0.25) {
      // 黑到藍
      hue = 0.67; // 藍色
      saturation = 1.0;
      lightness = intensity * 2; // 0 到 0.5
    } else if (intensity < 0.5) {
      // 藍到青
      hue = 0.67 - ((intensity - 0.25) * 0.17) / 0.25; // 藍(0.67)到青(0.5)
      saturation = 1.0;
      lightness = 0.5;
    } else if (intensity < 0.75) {
      // 青到黃
      hue = 0.5 - ((intensity - 0.5) * 0.33) / 0.25; // 青(0.5)到黃(0.17)
      saturation = 1.0;
      lightness = 0.5;
    } else {
      // 黃到紅
      hue = 0.17 - ((intensity - 0.75) * 0.17) / 0.25; // 黃(0.17)到紅(0)
      saturation = 1.0;
      lightness = 0.5 + (intensity - 0.75) * 2; // 0.5到1
    }
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
  plasma: (intensity) => {
    // 等離子效果：紫->藍->青->綠
    const hue = 0.83 - intensity * 0.5; // 從紫(0.83)到綠(0.33)
    const saturation = 1.0;
    const lightness = 0.3 + intensity * 0.4; // 動態亮度
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
  electric: (intensity) => {
    // 電氣效果：深藍->藍->青->白
    const hue = 0.67 - intensity * 0.17; // 藍到青
    const saturation = 1.0 - intensity * 0.3; // 逐漸去飽和
    const lightness = 0.2 + intensity * 0.6; // 從暗到亮
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
  fire: (intensity) => {
    // 火焰效果：黑->紅->橙->黃->白
    let hue, saturation, lightness;
    if (intensity < 0.33) {
      // 黑到紅
      hue = 0; // 純紅
      saturation = 1.0;
      lightness = intensity * 1.5; // 0到0.5
    } else if (intensity < 0.66) {
      // 紅到橙
      hue = ((intensity - 0.33) * 0.08) / 0.33; // 紅(0)到橙(0.08)
      saturation = 1.0;
      lightness = 0.5;
    } else {
      // 橙到黃到白
      hue = 0.08 + ((intensity - 0.66) * 0.09) / 0.34; // 橙(0.08)到黃(0.17)
      saturation = 1.0 - ((intensity - 0.66) * 0.5) / 0.34; // 逐漸去飽和
      lightness = 0.5 + ((intensity - 0.66) * 0.5) / 0.34; // 變亮
    }
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
};

/**
 * Base
 */
const canvas = document.querySelector('canvas.webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

/**
 * 變數宣告
 */
let beamMesh = null;
let wireframeMesh = null;
let animationId = null;

/**
 * 天線方向圖計算函數 - 熱氣球形狀 (一個主瓣 + 一個旁瓣)
 */
function calculateAntennaPattern(theta, phi) {
  const { mainBeamWidth, sideLobeLevel, beamDirection, elevationAngle, gain } = antennaParams;

  // 轉換角度為弧度
  const beamDirRad = (beamDirection * Math.PI) / 180;
  const elevRad = (elevationAngle * Math.PI) / 180;

  // 主瓣方向 (向上，theta = 0)
  const mainBeamTheta = Math.PI / 2 - elevRad;
  const mainBeamPhi = beamDirRad;

  // 計算與主瓣方向的角度差
  const thetaDiff = Math.abs(theta - mainBeamTheta);
  const phiDiff = Math.abs(phi - mainBeamPhi);
  const phiDiffNormalized = Math.min(phiDiff, 2 * Math.PI - phiDiff);

  // 主瓣計算 (熱氣球的上半部)
  const mainBeamAngle = Math.sqrt(thetaDiff * thetaDiff + phiDiffNormalized * phiDiffNormalized);
  let mainBeamIntensity = 0;

  if (mainBeamAngle < mainBeamWidth) {
    // 使用高斯函數創建平滑的主瓣
    mainBeamIntensity = Math.exp(-Math.pow(mainBeamAngle / (mainBeamWidth * 0.5), 2));
  }

  // 旁瓣計算 (熱氣球的下半部 - 反向)
  const sideLobeTheta = Math.PI - mainBeamTheta; // 相對方向
  const sideLobePhi = mainBeamPhi + Math.PI; // 相對方向

  const sideLobePhiNormalized = sideLobePhi > 2 * Math.PI ? sideLobePhi - 2 * Math.PI : sideLobePhi;
  const sideLobePhiDiff = Math.abs(phi - sideLobePhiNormalized);
  const sideLobePhiDiffNorm = Math.min(sideLobePhiDiff, 2 * Math.PI - sideLobePhiDiff);

  const sideLobeThetaDiff = Math.abs(theta - sideLobeTheta);
  const sideLobeAngle = Math.sqrt(sideLobeThetaDiff * sideLobeThetaDiff + sideLobePhiDiffNorm * sideLobePhiDiffNorm);

  let sideLobeIntensity = 0;
  if (sideLobeAngle < mainBeamWidth * 1.5) {
    // 旁瓣較寬但強度較低
    sideLobeIntensity = sideLobeLevel * Math.exp(-Math.pow(sideLobeAngle / (mainBeamWidth * 0.8), 2));
  }

  // 合併主瓣和旁瓣
  let totalIntensity = Math.max(mainBeamIntensity, sideLobeIntensity);

  // 應用增益
  totalIntensity *= Math.pow(10, gain / 20) * 0.4;

  // 確保有最小值，形成熱氣球的基本形狀
  const baseIntensity = 0.05;
  totalIntensity = Math.max(baseIntensity, totalIntensity);

  return Math.min(1, totalIntensity);
}

/**
 * 創建天線輻射圖案幾何體
 */
function createBeamPatternGeometry() {
  const phiSegments = 64; // 方位角分割數
  const thetaSegments = 32; // 仰角分割數

  const vertices = [];
  const colors = [];
  const indices = [];

  // 生成頂點
  for (let i = 0; i <= thetaSegments; i++) {
    const theta = (i / thetaSegments) * Math.PI; // 0 到 π

    for (let j = 0; j <= phiSegments; j++) {
      const phi = (j / phiSegments) * Math.PI * 2; // 0 到 2π

      // 計算輻射強度
      const intensity = calculateAntennaPattern(theta, phi);

      // 將球座標轉換為笛卡爾座標，半徑由強度決定
      const radius = intensity * 2.5 + 0.1; // 最小半徑避免塌陷
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.cos(theta);
      const z = radius * Math.sin(theta) * Math.sin(phi);

      vertices.push(x, y, z);

      // 使用選定的顏色方案，確保顏色鮮豔
      const color = colorSchemes[antennaParams.colorScheme](intensity);
      colors.push(color.r, color.g, color.b);
    }
  }

  // 生成三角形索引
  for (let i = 0; i < thetaSegments; i++) {
    for (let j = 0; j < phiSegments; j++) {
      const a = i * (phiSegments + 1) + j;
      const b = a + phiSegments + 1;
      const c = a + 1;
      const d = b + 1;

      // 兩個三角形組成一個四邊形
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * 創建天線輻射圖案網格
 */
function createBeamPatternMesh() {
  // 移除舊的網格
  if (beamMesh) {
    scene.remove(beamMesh);
    beamMesh.geometry.dispose();
    beamMesh.material.dispose();
  }
  if (wireframeMesh) {
    scene.remove(wireframeMesh);
    wireframeMesh.geometry.dispose();
    wireframeMesh.material.dispose();
  }

  const geometry = createBeamPatternGeometry();

  // 主要材質 - 使用不受光線影響的材質，參考範例檔案
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: antennaParams.opacity,
    side: THREE.DoubleSide,
  });

  // 線框材質
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.2,
  });

  beamMesh = new THREE.Mesh(geometry.clone(), material);
  wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMaterial);

  scene.add(beamMesh);

  if (antennaParams.wireframe) {
    scene.add(wireframeMesh);
  }
}

/**
 * 更新輻射圖案
 */
function updateBeamPattern() {
  createBeamPatternMesh();
}

/**
 * 設置 GUI 控制項
 */
function setupGUI() {
  // 天線參數資料夾
  const antennaFolder = gui.addFolder('天線參數');

  antennaFolder
    .add(antennaParams, 'mainBeamWidth')
    .min(0.5)
    .max(3.0)
    .step(0.1)
    .name('主瓣寬度')
    .onChange(updateBeamPattern);

  antennaFolder
    .add(antennaParams, 'sideLobeLevel')
    .min(0.1)
    .max(0.8)
    .step(0.05)
    .name('旁瓣強度')
    .onChange(updateBeamPattern);

  antennaFolder
    .add(antennaParams, 'beamDirection')
    .min(0)
    .max(360)
    .step(5)
    .name('方位角 (度)')
    .onChange(updateBeamPattern);

  antennaFolder
    .add(antennaParams, 'elevationAngle')
    .min(-90)
    .max(90)
    .step(5)
    .name('仰角 (度)')
    .onChange(updateBeamPattern);

  antennaFolder.add(antennaParams, 'gain').min(0).max(30).step(1).name('增益 (dBi)').onChange(updateBeamPattern);

  antennaFolder
    .add(antennaParams, 'frequency')
    .min(0.1)
    .max(10)
    .step(0.1)
    .name('頻率 (GHz)')
    .onChange(updateBeamPattern);

  // 視覺效果資料夾
  const visualFolder = gui.addFolder('視覺效果');

  visualFolder
    .add(antennaParams, 'wireframe')
    .name('顯示線框')
    .onChange(() => {
      if (antennaParams.wireframe) {
        scene.add(wireframeMesh);
      } else {
        scene.remove(wireframeMesh);
      }
    });

  visualFolder
    .add(antennaParams, 'opacity')
    .min(0.1)
    .max(1.0)
    .step(0.1)
    .name('透明度')
    .onChange(() => {
      if (beamMesh) {
        beamMesh.material.opacity = antennaParams.opacity;
      }
    });

  visualFolder
    .add(antennaParams, 'colorScheme', ['rainbow', 'thermal', 'plasma', 'electric', 'fire'])
    .name('顏色方案')
    .onChange(updateBeamPattern);

  visualFolder.add(antennaParams, 'autoRotate').name('自動旋轉');

  // 控制按鈕資料夾
  const controlsFolder = gui.addFolder('控制');

  const actions = {
    resetView: () => {
      gsap.to(camera.position, {
        duration: 1,
        x: 5,
        y: 5,
        z: 5,
        onUpdate: () => {
          controls.update();
        },
      });
    },
    spin: () => {
      if (beamMesh) {
        gsap.to(beamMesh.rotation, {
          duration: 2,
          y: beamMesh.rotation.y + Math.PI * 2,
        });
        if (wireframeMesh) {
          gsap.to(wireframeMesh.rotation, {
            duration: 2,
            y: wireframeMesh.rotation.y + Math.PI * 2,
          });
        }
      }
    },
    exportData: () => {
      console.log('天線參數:', antennaParams);
      // 可以在這裡添加匯出功能
    },
  };

  controlsFolder.add(actions, 'resetView').name('重設視角');
  controlsFolder.add(actions, 'spin').name('旋轉一圈');
  controlsFolder.add(actions, 'exportData').name('匯出參數');
}

/**
 * 場景設置
 */
function setupScene() {
  // 簡化燈光設置 - 減少光線影響
  const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambientLight);

  // 添加座標軸
  const axesHelper = new THREE.AxesHelper(4);
  scene.add(axesHelper);

  // 添加網格
  const gridHelper = new THREE.GridHelper(10, 20, 0x333333, 0x111111);
  scene.add(gridHelper);

  // 創建初始天線輻射圖案
  createBeamPatternMesh();
}

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener('resize', () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
camera.position.set(5, 5, 5);
scene.add(camera);

/**
 * Controls
 */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/**
 * 初始化
 */
function init() {
  setupScene();
  setupGUI();
}

/**
 * Animation loop
 */
const clock = new THREE.Clock();

function tick() {
  const elapsedTime = clock.getElapsedTime();

  // 自動旋轉
  if (antennaParams.autoRotate && beamMesh) {
    beamMesh.rotation.y = elapsedTime * 0.2;
    if (wireframeMesh) {
      wireframeMesh.rotation.y = elapsedTime * 0.2;
    }
  }

  // 更新控制器
  controls.update();

  // 渲染
  renderer.render(scene, camera);

  // 下一幀
  animationId = window.requestAnimationFrame(tick);
}

// 啟動應用程式
init();
tick();

/**
 * 清理函數 (可選)
 */
window.addEventListener('beforeunload', () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  gui.destroy();
});
