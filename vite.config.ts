import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import javascriptObfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    plugins: [
      javascriptObfuscator({
        apply: 'build',
        options: {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          disableConsoleOutput: true,
          identifierNamesGenerator: 'hexadecimal',
          log: false,
          renameGlobals: false,
          renameProperties: false,
          reservedStrings: [
            'webgl-canvas', 'ui-container', 'start-screen', 'loading-screen',
            'end-screen', 'game-hud', 'pause-menu', 'history-screen',
            'leaderboard-screen', 'tutorial-screen', 'claim-screen',
            'entry-box', 'score', 'final-score', 'rank-image', 'hidden',
            'silver-trip', 'tDiffuse', 'resolution', 'uBass', 'uMid',
            'uTreble', 'uTime', 'emissive', 'emissiveIntensity', 'vNormal',
            'leftRail', 'rightRail',
          ],
          selfDefending: false,
          simplify: true,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 1,
          transformObjectKeys: false,
        },
      }),
    ],
  };
});
