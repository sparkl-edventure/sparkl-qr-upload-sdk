import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points
  entry: {
    index: 'src/index.ts',
    // Additional entry points can be added here
  },
  
  // Output formats
  format: ['esm', 'cjs'],
  
  // TypeScript support
  dts: true,
  tsconfig: './tsconfig.json',
  
  // Source maps for debugging
  sourcemap: true,
  
  // Clean output directory before build
  clean: true,
  
  // Minification
  minify: true,
  
  // Tree shaking
  treeshake: true,
  
  // Splitting
  splitting: true,
  
  // Target environment
  target: 'es2020',
  
  // External dependencies (won't be bundled)
  external: ['react', 'react-dom'],
  
  // Banner
  banner: {
    js: '// QR Upload SDK - https://github.com/your-org/qr-upload-sdk\n'
  },
  
  // Environment variables
  env: {
    NODE_ENV: 'production',
  },
  
  // Watch mode (for development)
  watch: process.env.NODE_ENV === 'development',
  
  // On success hook
  onSuccess: 'tsc --project tsconfig.json --emitDeclarationOnly --declaration',
});
