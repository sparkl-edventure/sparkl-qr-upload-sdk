const { defineConfig } = require('tsup');
const fs = require('fs');
const { resolve, dirname } = require('path');

// Function to copy CSS file to dist
async function copyCSS() {
  try {
    const srcPath = resolve(process.cwd(), 'src/styles.css');
    const destPath = resolve(process.cwd(), 'dist/styles.css');
    await fs.promises.mkdir(dirname(destPath), { recursive: true });
    await fs.promises.copyFile(srcPath, destPath);
    console.log('CSS file copied successfully');
  } catch (error) {
    console.error('Error copying CSS file:', error);
  }
}

module.exports = defineConfig({
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
  
  // Configure esbuild to handle CSS and images
  esbuildOptions(options) {
    options.loader = {
      ...(options.loader || {}),
      '.css': 'css',
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.jpeg': 'dataurl',
      '.gif': 'dataurl',
      '.svg': 'dataurl',
      '.webp': 'dataurl'
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
