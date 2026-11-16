// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

/**
 * REQ-SEC-002: APIs that turn strings into markup or code are banned everywhere.
 * Untrusted text (C2PA, IPTC/XMP) may only reach the DOM through Angular {{ }} interpolation.
 */
const bannedSyntax = [
  {
    selector:
      'MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML|srcdoc)$/], MemberExpression[property.value=/^(innerHTML|outerHTML|insertAdjacentHTML|srcdoc)$/]',
    message: 'REQ-SEC-002: innerHTML, outerHTML, insertAdjacentHTML and srcdoc are banned.',
  },
  {
    selector:
      'Property[key.name=/^(innerHTML|outerHTML)$/], Property[key.value=/innerHTML|outerHTML/]',
    message: 'REQ-SEC-002: binding innerHTML or outerHTML is banned.',
  },
  {
    selector:
      'MemberExpression[property.name=/^bypassSecurityTrust/], MemberExpression[property.value=/^bypassSecurityTrust/]',
    message: 'REQ-SEC-002: DomSanitizer.bypassSecurityTrust* is banned.',
  },
  {
    selector: 'CallExpression[callee.name="Function"], NewExpression[callee.name="Function"]',
    message: 'REQ-SEC-002: the Function constructor is banned.',
  },
  {
    selector:
      'CallExpression[callee.object.name="document"][callee.property.name=/^(write|writeln)$/]',
    message: 'REQ-SEC-002: document.write is banned.',
  },
  {
    selector:
      'CallExpression[callee.name=/^(setTimeout|setInterval)$/][arguments.0.type=/^(Literal|TemplateLiteral)$/]',
    message: 'REQ-SEC-002: string arguments to setTimeout/setInterval are banned.',
  },
];

const bannedRules = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-restricted-syntax': ['error', ...bannedSyntax],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.angular/**',
      '**/coverage/**',
      '**/vendor/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: bannedRules,
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.strict, ...tseslint.configs.stylistic],
    rules: {
      ...bannedRules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['extension/projects/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'aid', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'aid', style: 'camelCase' },
      ],
    },
  },
  {
    files: ['extension/projects/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'BoundAttribute[name=/^(innerHTML|outerHTML|srcdoc)$/]',
          message: 'REQ-SEC-002: [innerHTML], [outerHTML] and [srcdoc] bindings are banned.',
        },
        {
          selector: 'TextAttribute[name=/^(innerHTML|outerHTML|srcdoc)$/]',
          message: 'REQ-SEC-002: innerHTML, outerHTML and srcdoc attributes are banned.',
        },
      ],
    },
  },
);
