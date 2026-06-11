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

// ── Renderizador ─────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true // Fundo transparente para ver a cor do CSS
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
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
keyLight.shadow.mapSize.set(1024, 1024)
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
    
    // Se o modelo trouxer luzes (como no site), remove a luz direcional manual
    if (glbLights.length > 0) {
      scene.remove(keyLight)
      glbLights.forEach(light => {
        if (light.isDirectionalLight || light.isSpotLight) {
          light.castShadow = true
          light.shadow.mapSize.set(2048, 2048)
          light.shadow.bias = -0.0002
          light.shadow.normalBias = 0.02
          light.shadow.radius = 3.0
        }
      })
    }

    // Lógica de Materiais idêntica ao main.js
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true

        if (child.material && child.material.name === 'Logo Material') {
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
          child.material.dispose()
          child.material = newMat
        }
      }
    })

    // Centralizar engrenagem na visão do OrbitControls
    const box = new THREE.Box3().setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    root.position.x -= center.x
    root.position.y -= center.y
    root.position.z -= center.z

    scene.add(root)
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
