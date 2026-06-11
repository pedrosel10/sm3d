import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const canvas = document.getElementById('app-canvas')
const loaderEl = document.getElementById('loader')

// ── Cena ─────────────────────────────────────────────────────────────
const scene = new THREE.Scene()

// ── Câmera ───────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(0.9, -1.65, 3.5) // Posição padrão Desktop

// ── Renderizador (QUALIDADE MÁXIMA) ──────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true, // Fundo transparente para ver a cor do CSS
  powerPreference: "high-performance" // Força o uso da GPU dedicada
})
// Removemos a limitação de "Math.min" para usar o pixelRatio nativo (ex: 3x em iPhones e MacBooks Retina)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap // Melhor suavização de sombras
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2

// ── Controles (Orbit) ────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.target.set(0, 0, 0)

// ── HDR (Reflexos) ───────────────────────────────────────────────────
const rgbeLoader = new RGBELoader()
rgbeLoader.load('./ferndale_studio_01_1k.hdr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping
  scene.environment = texture
})

// ── Iluminação Manual (Fallback) ─────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.15)
scene.add(ambientLight)

const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
keyLight.position.set(-1.5, 3.5, 6)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(4096, 4096) // Sombras em 4K
keyLight.shadow.bias = -0.0026
keyLight.shadow.normalBias = 0.04
keyLight.shadow.radius = 3.5
scene.add(keyLight)

// ── Texturas ─────────────────────────────────────────────────────────
const textureLoader = new THREE.TextureLoader()
const baseColorMap = textureLoader.load('./logo_basecolor.jpg')
const normalMap = textureLoader.load('./logo_normal.jpg')
const rmMap = textureLoader.load('./logo_rm.jpg')

baseColorMap.flipY = false
baseColorMap.colorSpace = THREE.SRGBColorSpace
normalMap.flipY = false
rmMap.flipY = false

// Maximiza a nitidez das texturas quando vistas de ângulo (Anisotropia)
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
baseColorMap.anisotropy = maxAnisotropy
normalMap.anisotropy = maxAnisotropy
rmMap.anisotropy = maxAnisotropy

// ── Carregador do Modelo (GLTF + Draco) ──────────────────────────────
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

gltfLoader.load(
  './smlogo3d.glb',
  (gltf) => {
    const root = gltf.scene

    // Extrair câmeras do GLB
    const glbCameras = []
    const glbLights = []
    
    root.traverse((child) => {
      if (child.isCamera) glbCameras.push(child)
      if (child.isLight) glbLights.push(child)
    })

    if (glbCameras.length > 0) {
      const glbCam = glbCameras[0]
      glbCam.updateMatrixWorld(true)
      camera.copy(glbCam)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      
      // Aplicar overrides exatos do site
      camera.position.z = 3.5
      const baseFov = 30
      camera.fov = Math.atan( Math.tan( baseFov * Math.PI / 360 ) * (1.7777 / camera.aspect) ) * 360 / Math.PI
      camera.updateProjectionMatrix()
    }
    
    // Configurar luzes do modelo
    if (glbLights.length > 0) {
      // O site principal MANTÉM a keyLight e a ambientLight ligadas,
      // ele só adiciona as luzes do GLB por cima.
      glbLights.forEach(light => {
        // A luz interna é uma PointLight (luz de ponto). 
        // A luz externa branca é uma SpotLight. Então filtramos apenas pela PointLight.
        if (light.isPointLight) {
          // Deixa a luz interna consideravelmente mais forte
          light.intensity *= 4.0;
          
          // Clona a luz para o lado oposto
          const oppositeLight = light.clone();
          oppositeLight.position.x *= -1; // Inverte no eixo X
          oppositeLight.position.z *= -1; // Inverte no eixo Z

          // Adiciona a nova luz no mesmo grupo da original
          light.parent.add(oppositeLight);
        }

        if (light.isDirectionalLight || light.isSpotLight) {
          light.castShadow = true
          light.shadow.mapSize.set(4096, 4096) // Sombras do GLB em 4K
          light.shadow.bias = -0.0002
          light.shadow.normalBias = 0.02
          light.shadow.radius = 3.0
        }
      })
    }

    // Aplicar materiais em TODAS as malhas (mesma lógica do main.js)
    root.traverse((child) => {
      if (child.isMesh) {
        const nameLower = (child.name || '').toLowerCase()
        const isBackgroundMesh = nameLower.includes('fundo') || nameLower.includes('plane') || nameLower.includes('background')

        if (!isBackgroundMesh) {
          child.castShadow = true
          child.receiveShadow = true
          
          if (child.material) {
            // Em vez de checar por nome, aplica direto
            const newMat = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color('#001e57'),
              map: baseColorMap,
              normalMap: normalMap,
              normalScale: new THREE.Vector2(2.0, 2.0),
              roughnessMap: rmMap,
              metalnessMap: rmMap,
              metalness: 1.0,
              roughness: 0.2,
              clearcoat: 1.0,
              clearcoatRoughness: 0.0,
              emissive: new THREE.Color('#000000'),
              shadowSide: THREE.FrontSide
            })
            // Se for um array de materiais
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose())
              child.material = [newMat]
            } else {
              child.material.dispose()
              child.material = newMat
            }
          }
        }
      }
    })

    // Não mover a engrenagem matematicamente. 
    // Deixa ela na posição original do arquivo 3D assim como no site principal.
    scene.add(root)
    
    // Atualiza o target do controle de orbita para o centro da tela
    controls.target.set(0, 0, 0)
    controls.update()

    loaderEl.style.display = 'none'
  },
  undefined,
  (err) => {
    console.error(err)
    loaderEl.innerText = 'Erro ao carregar a engrenagem.'
  }
)

// ── Redimensionamento ────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ── Loop de Animação ─────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}
animate()
