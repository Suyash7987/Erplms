const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'prisma/migrations/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'warn',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Architecture rule: routes -> controller -> service -> Prisma.
    files: ['src/**/*.routes.js', 'src/**/*.controller.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='require'][arguments.0.value=/prisma/]",
          message: 'Routes and controllers must not use Prisma directly. Call a service instead.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: { globals: { ...globals.jest } },
  },
  prettier,
];
