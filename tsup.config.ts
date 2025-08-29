import { defineConfig } from 'tsup';
import { promises as fs } from 'fs';
import path from 'path';

// Function to copy CSS file to dist
async function copyCSS() {
  try {
    const srcPath = path.resolve(__dirname, 'src/styles.css');
    const destPath = path.resolve(__dirname, 'dist/styles.css');
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(srcPath, destPath);
    console.log('CSS file copied successfully');
  } catch (error) {
    console.error('Error copying CSS file:', error);
  }
}

export default defineConfig({
  // Entry points
  entry: ['src/index.ts'],
  
  // Output formats
  format: ['esm', 'cjs'],
  
  // TypeScript support
  dts: {
    entry: 'src/index.ts',
    resolve: true
  },
  tsconfig: './tsconfig.json',
  
  // Source maps for debugging
  sourcemap: true,
  
  // Clean output directory before build
  clean: true,
  
  // Minification
  minify: true,
  
  // Tree shaking
  treeshake: true,
  
  // Target environment
  target: 'es2020',
  
  // External dependencies (won't be bundled)
  external: ['react', 'react-dom'],
  
  // Configure esbuild to handle CSS
  esbuildOptions(options) {
    options.loader = {
      ...(options.loader || {}),
      '.css': 'css'
    };
  },
  
  // On success hook - only copy CSS
  onSuccess: copyCSS,
  
  // Watch mode (for development)
  watch: process.env.NODE_ENV === 'development',
  
  // Environment variables
  env: {
    NODE_ENV: process.env.NODE_ENV || 'production',
  },
  
  // Banner
  banner: {
    js: '// QR Upload SDK\n',
  },
});
