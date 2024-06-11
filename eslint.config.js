import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        rules: {
            'indent': ['error', 4],
            'no-unused-vars': 'warn',
            'no-undef': 'warn',
            'prefer-const': 'error',
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
        }
    }
];
