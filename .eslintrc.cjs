module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react/jsx-no-target-blank': 'off',
    'react/prop-types': 'off',
    'react/no-unknown-property': ['error', { ignore: ['args', 'position', 'rotation', 'intensity', 'castShadow', 'receiveShadow', 'visible', 'shadow-mapSize', 'shadow-camera-left', 'shadow-camera-right', 'shadow-camera-top', 'shadow-camera-bottom', 'shadow-bias', 'attach', 'toneMapped', 'emissive', 'emissiveIntensity', 'material'] }],
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}
