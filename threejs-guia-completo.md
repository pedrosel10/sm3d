# Three.js — Guia Completo de Boas Práticas, Código, Efeitos e Bibliotecas

---

## 1. SETUP INICIAL OBRIGATÓRIO

### Renderer com configurações profissionais

```js
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('canvas'),
  antialias: true,           // bordas suaves
  alpha: true,               // fundo transparente
  powerPreference: 'high-performance'
})

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // nunca acima de 2
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping  // aspecto cinematográfico
renderer.toneMappingExposure = 1.2
renderer.outputColorSpace = THREE.SRGBColorSpace    // obrigatório no r152+
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap    // sombras suaves
```

**Por que cada configuração importa:**
- `antialias: true` — elimina serrilhado nas bordas dos objetos
- `setPixelRatio máx 2` — telas com DPR 3 ou 4 não ganham qualidade visível mas triplicam o custo de render
- `ACESFilmicToneMapping` — simula resposta de câmera de cinema, cores muito mais naturais
- `SRGBColorSpace` — sem isso as texturas aparecem com cores erradas/lavadas
- `PCFSoftShadowMap` — sombras com borda suave em vez de pixelada

---

### Camera + resize responsivo

```js
const camera = new THREE.PerspectiveCamera(
  75,                                     // FOV: 60–80 é o mais natural
  window.innerWidth / window.innerHeight, // aspect ratio
  0.1,                                    // near: não coloque muito pequeno
  1000                                    // far: só o necessário
)
camera.position.set(0, 2, 5)

// Resize — SEMPRE implementar
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})
```

**Atenção:** Mantenha `near` acima de 0.01. Valores muito pequenos causam z-fighting (cintilação em superfícies próximas sobrepostas).

---

### Loop de animação com delta time

```js
const clock = new THREE.Clock()

const animate = () => {
  const delta = clock.getDelta()         // tempo entre frames em segundos
  const elapsed = clock.getElapsedTime() // tempo total decorrido

  // CORRETO — velocidade independente de FPS:
  mesh.rotation.y += delta * 0.5

  // ERRADO — velocidade varia com FPS do dispositivo:
  // mesh.rotation.y += 0.01

  controls.update()                      // necessário com enableDamping
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()
```

---

### OrbitControls com damping

```js
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true      // movimento inercial suave
controls.dampingFactor = 0.05
controls.enableZoom = true
controls.minDistance = 2
controls.maxDistance = 20
controls.maxPolarAngle = Math.PI / 2 // impede rotacionar abaixo do chão
```

---

## 2. ILUMINAÇÃO PROFISSIONAL

### Combinação completa de luzes

```js
// Luz ambiente — ilumina tudo uniformemente, sem sombra
const ambient = new THREE.AmbientLight(0xffffff, 0.2)
scene.add(ambient)

// Luz hemisférica — gradiente céu/chão, muito natural
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x404040, 0.8)
scene.add(hemi)

// Luz direcional — simula o sol, projeta sombras
const dirLight = new THREE.DirectionalLight(0xfff5e4, 2.5)
dirLight.position.set(5, 10, 5)
dirLight.castShadow = true
dirLight.shadow.mapSize.set(2048, 2048) // qualidade da sombra
dirLight.shadow.camera.near = 0.1
dirLight.shadow.camera.far = 50
dirLight.shadow.camera.left = -10
dirLight.shadow.camera.right = 10
dirLight.shadow.camera.top = 10
dirLight.shadow.camera.bottom = -10
dirLight.shadow.bias = -0.001          // remove shadow acne (manchas)
scene.add(dirLight)

// Point light — lâmpadas, luzes pontuais
const pointLight = new THREE.PointLight(0x00aaff, 2, 20, 2)
pointLight.position.set(0, 3, 0)
pointLight.castShadow = true
scene.add(pointLight)
```

### Environment Map HDR (reflexos realistas)

```js
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { PMREMGenerator } from 'three'

const pmrem = new PMREMGenerator(renderer)
pmrem.compileEquirectangularShader()

new RGBELoader().load('ambiente.hdr', (texture) => {
  const envMap = pmrem.fromEquirectangular(texture).texture
  scene.environment = envMap  // reflexos em todos os materiais
  scene.background = envMap   // fundo HDR
  texture.dispose()
  pmrem.dispose()
})

// Alternativa rápida sem arquivo externo:
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
const env = pmrem.fromScene(new RoomEnvironment()).texture
scene.environment = env
```

---

## 3. MATERIAIS

### MeshStandardMaterial (PBR — Physically Based Rendering)

```js
const material = new THREE.MeshStandardMaterial({
  color: 0x88ccff,
  metalness: 0.8,      // 0 = plástico, 1 = metal
  roughness: 0.2,      // 0 = espelho, 1 = fosco
  map: colorTexture,
  normalMap: normalTexture,    // detalhes de superfície
  roughnessMap: roughTex,
  metalnessMap: metalTex,
  aoMap: aoTexture,            // oclusão ambiente
  envMapIntensity: 1.5,        // intensidade do environment map
})
```

### MeshPhysicalMaterial (vidro, água, pele)

```js
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0,
  roughness: 0,
  transmission: 1.0,     // transparência física (vidro)
  thickness: 0.5,        // espessura para refração
  ior: 1.5,              // índice de refração (vidro = 1.5)
  transparent: true,
})
```

### ShaderMaterial — efeitos customizados

```js
const shaderMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime:  { value: 0.0 },
    uColor: { value: new THREE.Color('#00aaff') },
    uMouse: { value: new THREE.Vector2(0, 0) }
  },
  vertexShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying float vElevation;

    void main() {
      vUv = uv;
      vec3 pos = position;
      
      // Ondulação de superfície
      float wave = sin(pos.x * 3.0 + uTime) * sin(pos.z * 3.0 + uTime) * 0.1;
      pos.y += wave;
      vElevation = wave;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying vec2 vUv;
    varying float vElevation;

    void main() {
      // Gradiente baseado na elevação
      vec3 color = mix(uColor * 0.5, uColor, vElevation + 0.5);
      float alpha = smoothstep(0.0, 0.1, vUv.x) * smoothstep(0.0, 0.1, 1.0 - vUv.x);
      gl_FragColor = vec4(color, alpha);
    }
  `,
  transparent: true,
  side: THREE.DoubleSide
})

// No loop de animação — atualizar uniforms
shaderMat.uniforms.uTime.value = elapsed
shaderMat.uniforms.uMouse.value.set(mouseX, mouseY)
```

---

## 4. TEXTURAS — CONFIGURAÇÃO E OTIMIZAÇÃO

```js
const loader = new THREE.TextureLoader()
const texture = loader.load(
  'textura.jpg',
  (tex) => console.log('Carregada'),  // onLoad
  undefined,                           // onProgress
  (err) => console.error(err)          // onError
)

// SEMPRE configurar filtros
texture.magFilter = THREE.LinearFilter
texture.minFilter = THREE.LinearMipmapLinearFilter
texture.generateMipmaps = true

// Repetição
texture.wrapS = THREE.RepeatWrapping
texture.wrapT = THREE.RepeatWrapping
texture.repeat.set(4, 4)

// Anisotropia — melhora qualidade em ângulos oblíquos
const maxAniso = renderer.capabilities.getMaxAnisotropy()
texture.anisotropy = maxAniso  // geralmente 16

// Carregar múltiplas texturas de uma vez
const manager = new THREE.LoadingManager(
  () => console.log('Tudo carregado'),
  (url, loaded, total) => console.log(`${loaded}/${total} — ${url}`)
)
const texLoader = new THREE.TextureLoader(manager)
```

**Regras de ouro para texturas:**
- Sempre use potência de 2: 256, 512, 1024, 2048, 4096
- Prefira `.webp` para difuse/cor (menor tamanho)
- Prefira `.ktx2` para compressão GPU (Basis Universal)
- Normal maps: sempre `.png` (sem artefatos de compressão)
- Comprima com `squoosh.app`, `sharp` ou `@ktx2-transform`
- Nunca carregue texturas dentro do loop `animate()`

---

## 5. PERFORMANCE

### Dispose — evitar memory leak

```js
// SEMPRE chamar ao remover objetos da cena
function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      // Liberar geometria da GPU
      child.geometry.dispose()

      // Liberar materiais e texturas
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material]

      materials.forEach((mat) => {
        mat.map?.dispose()
        mat.normalMap?.dispose()
        mat.roughnessMap?.dispose()
        mat.metalnessMap?.dispose()
        mat.aoMap?.dispose()
        mat.emissiveMap?.dispose()
        mat.envMap?.dispose()
        mat.dispose()
      })
    }
  })
  scene.remove(obj)
}
```

### InstancedMesh — 1 draw call para muitos objetos

```js
// Em vez de 1000 meshes separados, use InstancedMesh
const count = 1000
const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
const material = new THREE.MeshStandardMaterial({ color: 0x88ccff })
const instancedMesh = new THREE.InstancedMesh(geometry, material, count)

const matrix = new THREE.Matrix4()
const color = new THREE.Color()

for (let i = 0; i < count; i++) {
  // Posição aleatória
  matrix.setPosition(
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20
  )
  instancedMesh.setMatrixAt(i, matrix)

  // Cor por instância
  color.setHSL(Math.random(), 0.7, 0.5)
  instancedMesh.setColorAt(i, color)
}

instancedMesh.instanceMatrix.needsUpdate = true
instancedMesh.instanceColor.needsUpdate = true
scene.add(instancedMesh)
```

### Level of Detail (LOD)

```js
const lod = new THREE.LOD()

// Modelo detalhado (perto)
const highGeo = new THREE.IcosahedronGeometry(1, 10)
lod.addLevel(new THREE.Mesh(highGeo, mat), 0)

// Médio (distância média)
const midGeo = new THREE.IcosahedronGeometry(1, 4)
lod.addLevel(new THREE.Mesh(midGeo, mat), 10)

// Baixo (longe)
const lowGeo = new THREE.IcosahedronGeometry(1, 1)
lod.addLevel(new THREE.Mesh(lowGeo, mat), 30)

scene.add(lod)
// No loop: lod.update(camera) — automático se usar autoUpdate
```

### Geometrias reutilizadas

```js
// ERRADO — cria nova geometria a cada frame
function animate() {
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat)) // NUNCA FAÇA ISSO
}

// CORRETO — criar uma vez, reutilizar
const sharedGeometry = new THREE.BoxGeometry()
const sharedMaterial = new THREE.MeshStandardMaterial()

// Múltiplos objetos com a mesma geometria e material
for (let i = 0; i < 50; i++) {
  const mesh = new THREE.Mesh(sharedGeometry, sharedMaterial)
  mesh.position.set(Math.random() * 10, 0, Math.random() * 10)
  scene.add(mesh)
}
```

### Frustum Culling e visibilidade

```js
// Desativar culling só quando necessário (objetos que aparecem fora da câmera)
mesh.frustumCulled = false // padrão é true — não altere sem necessidade

// Esconder objetos sem removê-los
mesh.visible = false  // não renderiza mas permanece na cena

// Renderização sob demanda — só renderiza quando houver mudança
import { invalidate, useFrame } from '@react-three/fiber'
// Em R3F: frameloop="demand" no Canvas
```

---

## 6. POST-PROCESSING (EFEITOS DE CÂMERA)

### Setup do EffectComposer

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'

const composer = new EffectComposer(renderer)

// 1. Render Pass — sempre primeiro
composer.addPass(new RenderPass(scene, camera))

// 2. Bloom — brilho em luzes e objetos emissivos
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8,   // strength: intensidade
  0.4,   // radius: espalhamento
  0.85   // threshold: só objetos mais brilhantes que isso brilham
)
composer.addPass(bloom)

// 3. Depth of Field — desfoque fora do foco
const bokeh = new BokehPass(scene, camera, {
  focus: 5.0,     // distância do foco
  aperture: 0.025,
  maxblur: 0.01
})
composer.addPass(bokeh)

// 4. Film grain — ruído cinematic
const film = new FilmPass(0.35, 0.025, 648, false)
composer.addPass(film)

// 5. Vignette — escurecimento das bordas
const vignette = new ShaderPass(VignetteShader)
vignette.uniforms.offset.value = 0.5
vignette.uniforms.darkness.value = 0.8
composer.addPass(vignette)

// 6. SMAA — anti-aliasing de qualidade (sempre por último)
const smaa = new SMAAPass(window.innerWidth, window.innerHeight)
composer.addPass(smaa)

// No loop: composer.render() ao invés de renderer.render()
const animate = () => {
  composer.render()  // substitui renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

// Resize do composer
window.addEventListener('resize', () => {
  composer.setSize(window.innerWidth, window.innerHeight)
  bloom.resolution.set(window.innerWidth, window.innerHeight)
})
```

### Bloom seletivo (só em objetos específicos)

```js
// Técnica: renderizar em duas passagens
// Objetos com emissive intenso ativam o bloom

material.emissive = new THREE.Color('#00ffaa')
material.emissiveIntensity = 2.0  // acima do threshold = brilha

// Ou usar camadas (layers)
const BLOOM_LAYER = 1
bloomLayer = new THREE.Layers()
bloomLayer.set(BLOOM_LAYER)

// Apenas objetos nessa layer recebem bloom
neonMesh.layers.enable(BLOOM_LAYER)
```

---

## 7. PARTÍCULAS

### BufferGeometry customizada (melhor performance)

```js
const count = 10000
const positions = new Float32Array(count * 3)
const colors = new Float32Array(count * 3)
const scales = new Float32Array(count)

for (let i = 0; i < count; i++) {
  // Distribuição esférica
  const radius = Math.random() * 10
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)

  positions[i * 3]     = radius * Math.sin(phi) * Math.cos(theta)
  positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
  positions[i * 3 + 2] = radius * Math.cos(phi)

  // Cores com gradiente
  const color = new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.8, 0.6)
  colors[i * 3]     = color.r
  colors[i * 3 + 1] = color.g
  colors[i * 3 + 2] = color.b

  scales[i] = Math.random()
}

const geometry = new THREE.BufferGeometry()
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))

const particlesMat = new THREE.PointsMaterial({
  size: 0.05,
  sizeAttenuation: true,
  vertexColors: true,
  blending: THREE.AdditiveBlending,  // soma as cores (efeito glow)
  depthWrite: false,                  // evita artefatos de transparência
  transparent: true,
  alphaMap: particleTexture,
})

const particles = new THREE.Points(geometry, particlesMat)
scene.add(particles)
```

---

## 8. CARREGAMENTO DE MODELOS 3D

### GLTFLoader com Draco e KTX2

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

// Draco — compressão de geometria (reduz até 90% o tamanho)
const draco = new DRACOLoader()
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

// KTX2 — compressão de texturas na GPU
const ktx2 = new KTX2Loader()
  .setTranscoderPath('three/addons/libs/basis/')
  .detectSupport(renderer)

const loader = new GLTFLoader()
loader.setDRACOLoader(draco)
loader.setKTX2Loader(ktx2)
loader.setMeshoptDecoder(MeshoptDecoder)

loader.load(
  'modelo.glb',
  (gltf) => {
    const model = gltf.scene
    
    // Ativar sombras em todos os meshes
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        // Melhorar qualidade das sombras
        child.material.shadowSide = THREE.FrontSide
      }
    })
    
    // Animações
    const mixer = new THREE.AnimationMixer(model)
    gltf.animations.forEach((clip) => {
      const action = mixer.clipAction(clip)
      action.play()
    })
    
    scene.add(model)
  },
  (progress) => {
    const pct = (progress.loaded / progress.total * 100).toFixed(0)
    console.log(`Carregando: ${pct}%`)
  },
  (error) => console.error('Erro ao carregar modelo:', error)
)
```

---

## 9. ANIMAÇÃO COM GSAP + SCROLL

### Instalação e setup

```bash
npm install gsap
```

```js
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)
```

### Animação de câmera com scroll

```js
// Timeline de câmera ao rolar a página
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: 'bottom top',
    scrub: 1.5,      // 1.5 = delay suave entre scroll e câmera
    pin: true
  }
})

tl.to(camera.position, { x: 5, y: 3, z: 2, duration: 1 }, 0)
tl.to(mesh.rotation, { y: Math.PI, duration: 1 }, 0)

// Atualizar lookAt no tick do GSAP
gsap.ticker.add(() => {
  camera.lookAt(targetPoint)
})

// Animação de entrada em objeto 3D
gsap.from(mesh.scale, {
  x: 0, y: 0, z: 0,
  duration: 1.5,
  ease: 'elastic.out(1, 0.5)',
  delay: 0.3
})

// Hover suave
mesh.addEventListener('click', () => {
  gsap.to(mesh.rotation, {
    y: mesh.rotation.y + Math.PI * 2,
    duration: 1.5,
    ease: 'power2.inOut'
  })
})
```

---

## 10. REACT THREE FIBER — STACK MODERNA

### Instalação completa

```bash
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
npm install @react-three/rapier   # física
npm install gsap @gsap/react       # animações
npm install leva                   # debug GUI
npm install r3f-perf               # monitor de performance
```

### Estrutura de componente

```jsx
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { 
  Environment, Float, Stars, Text, 
  MeshReflectorMaterial, MeshTransmissionMaterial,
  OrbitControls, Sparkles, Cloud, Sky,
  useGLTF, useAnimations, Html, Loader
} from '@react-three/drei'
import { 
  EffectComposer, Bloom, Vignette, 
  ChromaticAberration, Noise, SMAA 
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Suspense, useRef } from 'react'

// Componente de objeto 3D
function RotatingBox() {
  const ref = useRef()
  
  useFrame((state, delta) => {
    ref.current.rotation.y += delta * 0.5   // delta time correto
    ref.current.position.y = Math.sin(state.clock.elapsedTime) * 0.2
  })

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={ref} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color="#00aaff"
          metalness={0.8}
          roughness={0.1}
        />
      </mesh>
    </Float>
  )
}

// Chão com reflexo
function ReflectiveFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <MeshReflectorMaterial
        blur={[300, 100]}
        resolution={1024}
        mixBlur={1}
        mixStrength={80}
        roughness={1}
        depthScale={1.2}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#101010"
        metalness={0.8}
      />
    </mesh>
  )
}

// App principal
export default function App() {
  return (
    <>
      <Canvas
        camera={{ fov: 75, position: [0, 2, 5], near: 0.1, far: 1000 }}
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        dpr={[1, 2]}  // pixel ratio adaptativo
      >
        <Suspense fallback={null}>
          {/* Iluminação */}
          <ambientLight intensity={0.2} />
          <directionalLight 
            position={[5, 10, 5]} 
            intensity={2.5} 
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.001}
          />
          
          {/* Ambiente */}
          <Environment preset="studio" />
          <Stars radius={100} depth={50} count={5000} factor={4} />
          <Sparkles count={100} scale={10} size={1} speed={0.3} />
          
          {/* Objetos */}
          <RotatingBox />
          <ReflectiveFloor />
          
          {/* Controls */}
          <OrbitControls 
            enableDamping
            dampingFactor={0.05}
            maxPolarAngle={Math.PI / 2}
          />
          
          {/* Post-processing */}
          <EffectComposer>
            <Bloom 
              luminanceThreshold={0.8} 
              intensity={1.2} 
              radius={0.8}
            />
            <Vignette offset={0.5} darkness={0.5} />
            <Noise opacity={0.02} />
            <ChromaticAberration offset={[0.001, 0.001]} />
            <SMAA />
          </EffectComposer>
        </Suspense>
      </Canvas>
      <Loader />  {/* Loading screen automático */}
    </>
  )
}
```

### Carregando modelos GLTF no R3F

```jsx
import { useGLTF, useAnimations } from '@react-three/drei'

// Pré-carregar fora do componente (importante!)
useGLTF.preload('/modelo.glb')

function Model() {
  const group = useRef()
  const { scene, animations } = useGLTF('/modelo.glb')
  const { actions, names } = useAnimations(animations, group)

  useEffect(() => {
    actions[names[0]]?.play()  // Tocar primeira animação
  }, [actions, names])

  return <primitive ref={group} object={scene} />
}
```

### Leva — Debug GUI

```jsx
import { useControls } from 'leva'

function DebugSphere() {
  const { color, radius, metalness, roughness } = useControls('Esfera', {
    color: '#00aaff',
    radius: { value: 1, min: 0.1, max: 5, step: 0.1 },
    metalness: { value: 0.8, min: 0, max: 1 },
    roughness: { value: 0.2, min: 0, max: 1 },
  })

  return (
    <mesh>
      <sphereGeometry args={[radius, 32, 32]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  )
}
```

---

## 11. FÍSICA COM RAPIER

```jsx
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'

function PhysicsScene() {
  return (
    <Physics gravity={[0, -9.81, 0]}>
      {/* Cubo que cai */}
      <RigidBody position={[0, 5, 0]} restitution={0.8} friction={0.5}>
        <mesh castShadow>
          <boxGeometry />
          <meshStandardMaterial color="orange" />
        </mesh>
      </RigidBody>

      {/* Chão */}
      <RigidBody type="fixed">
        <CuboidCollider args={[10, 0.1, 10]} />
      </RigidBody>
    </Physics>
  )
}
```

---

## 12. RAYCASTING — MOUSE INTERACTION

```js
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

window.addEventListener('mousemove', (e) => {
  // Normalizar coordenadas do mouse (-1 a 1)
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
})

// No loop de animação
raycaster.setFromCamera(mouse, camera)
const intersects = raycaster.intersectObjects(scene.children, true) // recursive

if (intersects.length > 0) {
  const hit = intersects[0]
  hit.object.material.color.set('#ff0000')  // mudar cor ao hover
  
  // Ponto exato de interseção
  console.log(hit.point)  // Vector3
  console.log(hit.distance)  // distância
}

// Em R3F — muito mais simples com eventos
<mesh
  onClick={(e) => {
    e.stopPropagation()
    console.log('Clicado!', e.point)
  }}
  onPointerOver={(e) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
  }}
  onPointerOut={() => {
    document.body.style.cursor = 'auto'
  }}
>
```

---

## 13. ACESSIBILIDADE E UX

```html
<!-- Canvas com aria -->
<canvas 
  aria-label="Cena 3D interativa mostrando produto"
  role="img"
></canvas>

<!-- Fallback quando WebGL não suportado -->
<canvas id="three-canvas"></canvas>
<noscript>
  <img src="preview-static.jpg" alt="Visualização do produto" />
</noscript>
```

```js
// Verificar suporte WebGL
function checkWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch (e) {
    return false
  }
}

if (!checkWebGL()) {
  document.getElementById('fallback').style.display = 'block'
  return
}

// Respeitar preferência de movimento reduzido
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

if (!prefersReducedMotion) {
  // Animações completas
  mesh.rotation.y += delta * 0.5
} else {
  // Sem rotação automática
  mesh.rotation.y = 0
}

// Adaptar qualidade para mobile
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
if (isMobile) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  // Usar geometrias mais simples
  // Desativar sombras
  renderer.shadowMap.enabled = false
}
```

---

## 14. LOADING SCREEN PROFISSIONAL

```js
// Vanilla JS
const manager = new THREE.LoadingManager()
const progressBar = document.getElementById('progress')
const loadingScreen = document.getElementById('loading')

manager.onProgress = (url, loaded, total) => {
  progressBar.style.width = `${(loaded / total * 100)}%`
}

manager.onLoad = () => {
  gsap.to(loadingScreen, {
    opacity: 0,
    duration: 1,
    onComplete: () => loadingScreen.remove()
  })
  animate()  // iniciar render só após carregar tudo
}
```

```jsx
// React Three Fiber — automático com Suspense
import { Loader } from '@react-three/drei'

<Canvas>
  <Suspense fallback={null}>
    <Model />
  </Suspense>
</Canvas>
<Loader
  containerStyles={{ background: 'black' }}
  innerStyles={{ background: '#00aaff' }}
  barStyles={{ background: 'white' }}
  dataStyles={{ color: 'white' }}
  dataInterpolation={(p) => `${p.toFixed(0)}%`}
/>
```

---

## 15. ESTRUTURA DE PROJETO RECOMENDADA

```
src/
├── components/
│   ├── Scene.jsx          # Canvas + setup
│   ├── Lights.jsx         # Iluminação
│   ├── PostProcessing.jsx # Efeitos de câmera
│   └── models/
│       └── Product.jsx    # Modelos individuais
├── hooks/
│   ├── useScrollCamera.js # Câmera com scroll
│   └── useMouseParallax.js
├── shaders/
│   ├── water/
│   │   ├── vertex.glsl
│   │   └── fragment.glsl
│   └── particles/
│       ├── vertex.glsl
│       └── fragment.glsl
├── utils/
│   ├── dispose.js         # Helper de dispose
│   └── isMobile.js
└── App.jsx
```

---

## 16. STACK FINAL RECOMENDADA (2024–2025)

```
Vite + React + TypeScript
  ├── three                          — motor 3D
  ├── @react-three/fiber             — renderer declarativo React
  ├── @react-three/drei              — 100+ helpers prontos
  ├── @react-three/postprocessing    — efeitos declarativos
  ├── @react-three/rapier            — física WASM (Rapier.rs)
  ├── gsap + @gsap/react             — animações e scroll
  ├── leva                           — debug GUI em dev
  └── r3f-perf                       — monitor FPS/draw calls em dev
```

---

## 17. CHECKLIST RÁPIDO — ANTES DE PUBLICAR

### Setup
- [ ] `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`
- [ ] `renderer.outputColorSpace = THREE.SRGBColorSpace`
- [ ] `renderer.toneMapping = THREE.ACESFilmicToneMapping`
- [ ] Resize handler com `camera.updateProjectionMatrix()`
- [ ] Delta time em todas as animações
- [ ] Dispose em todos os objetos removidos

### Visual
- [ ] Environment map HDR para reflexos
- [ ] `shadowMap.type = PCFSoftShadowMap`
- [ ] `shadow.mapSize = [2048, 2048]`
- [ ] `shadow.bias = -0.001` (sem shadow acne)
- [ ] Bloom para luzes emissivas
- [ ] Anti-aliasing (SMAA ou MSAA)

### Performance
- [ ] InstancedMesh para objetos repetidos
- [ ] Texturas em potência de 2
- [ ] Texturas comprimidas (.webp, .ktx2)
- [ ] Draco para modelos .glb
- [ ] LOD para geometrias complexas
- [ ] Stats.js / r3f-perf durante dev — FPS estável acima de 50

### UX
- [ ] `aria-label` no canvas
- [ ] Fallback para WebGL não suportado
- [ ] Loading screen com progresso
- [ ] `prefers-reduced-motion` respeitado
- [ ] Geometrias simplificadas no mobile
- [ ] `enableDamping: true` nos controls

---

*Guia gerado com base nas melhores práticas da comunidade Three.js, documentação oficial e padrões da indústria em 2024–2025.*
