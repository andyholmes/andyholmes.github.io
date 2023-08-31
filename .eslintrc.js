module.exports = {
    env: {
        es6: true,
        node: true,
    },
    extends: 'eslint:recommended',
    parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
    },
    rules: {
        indent: ['error', 4],
        'prefer-const': 'error',
        quotes: ['error', 'single'],
        semi: ['error', 'always'],
    },
};
