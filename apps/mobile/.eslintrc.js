module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  settings: {
    react: { version: 'detect' },
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier', // deve ser o último — desativa regras que conflitam com Prettier
  ],
  plugins: [
    'react',
    'react-hooks',
    'react-native',
    '@typescript-eslint',
    'i18next',
  ],
  rules: {
    // ── i18n obrigatório ───────────────────────────────────────────────────
    // Proibe strings hardcoded em atributos de texto de componentes JSX.
    // Toda string visível ao usuário DEVE usar o hook useTranslation().
    'i18next/no-literal-string': [
      'error',
      {
        mode: 'jsx-only',
        'jsx-components': {
          include: ['Text', 'Button', 'Pressable', 'TouchableOpacity'],
        },
        'jsx-attributes': {
          include: ['title', 'placeholder', 'label', 'accessibilityLabel'],
        },
        message: 'Use i18n: import { useTranslation } from "react-i18next"',
      },
    ],

    // ── React Native ────────────────────────────────────────────────────────
    'react-native/no-unused-styles': 'warn',
    'react-native/no-inline-styles': 'warn',
    'react-native/no-color-literals': 'error', // cores apenas via tokens
    'react-native/no-raw-text': ['error', { skip: ['Skeleton'] }],

    // ── TypeScript ──────────────────────────────────────────────────────────
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // ── React ───────────────────────────────────────────────────────────────
    'react/prop-types': 'off', // TypeScript já cobre isso
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  env: {
    es2022: true,
    node: true,
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.expo/',
    'babel.config.js',
    '*.config.js',
    '**/*.d.ts', // arquivos de declaração de tipo não precisam ser lintados
  ],
};
