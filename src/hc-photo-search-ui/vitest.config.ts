/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: './src/setupTests.ts',
    },
})
