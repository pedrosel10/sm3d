import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb', '**/*.hdr'],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'ENGRENAGEM 3D/index.html')
      }
    }
  }
})
