import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { parseWebBuildMode } from './src/build-mode.js';

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const rawMode = Object.prototype.hasOwnProperty.call(process.env, 'VITE_CRUCIBLE_MODE')
    ? process.env.VITE_CRUCIBLE_MODE
    : fileEnv.VITE_CRUCIBLE_MODE;
  const buildMode = parseWebBuildMode(rawMode);

  return {
    plugins: [react()],
    define: {
      __CRUCIBLE_BUILD_MODE__: JSON.stringify(buildMode)
    }
  };
});
