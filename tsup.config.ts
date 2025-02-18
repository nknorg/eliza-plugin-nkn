import {defineConfig} from 'tsup'

export default defineConfig({
    format: ['esm'],
    entry: ['src/index.ts'],
    outDir: 'dist',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    external: [
        'dotenv', // Externalize dotenv to prevent bundling
        'fs', // Externalize fs to use Node.js built-in module
        'path', // Externalize other built-ins if necessary
        '@reflink/reflink',
        '@node-llama-cpp',
        'https',
        'http',
        'agentkeepalive',
        '@elizaos/core',
    ],
})
