import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
  settings: { react: { version: '19.2.0' } },
  rules: {},
  },
  {
    ignores: ['.expo', 'web-build', 'cache', 'dist', '**/out-tsc'],
  },
];
