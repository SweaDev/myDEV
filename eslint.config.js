import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

const HTML_SINKS = ['innerHTML', 'outerHTML', 'insertAdjacentHTML'];

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: {
      'no-unsanitized/property': 'error',
      'no-unsanitized/method': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        ...HTML_SINKS.map((property) => ({
          property,
          message: 'HTML string sinks are banned (SEC-3). Use core/dom.ts.',
        })),
        { object: 'document', property: 'write', message: 'document.write is banned (SEC-3).' },
        { object: 'document', property: 'writeln', message: 'document.writeln is banned (SEC-3).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[computed=true][property.value=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]',
          message: 'HTML string sinks are banned (SEC-3). Use core/dom.ts.',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'new Function is banned (SEC-2).',
        },
      ],
    },
  },
);
