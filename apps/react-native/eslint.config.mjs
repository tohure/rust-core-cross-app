import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    extends: fixupConfigRules(compat.extends('@react-native', 'prettier')),
    plugins: { prettier },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'prettier/prettier': 'error',
    },
  },
  {
    // Todo lo que produce `ubrn` queda fuera del lint: no se edita a mano, así que un error de
    // formato ahí no es accionable — la siguiente regeneración lo reescribe igual. Es el mismo
    // criterio con que el repo los mantiene en `.gitignore`. `src/index.tsx` **no** entra acá:
    // ese sí es nuestro desde la Task 8.
    ignores: [
      'node_modules/',
      'lib/',
      'src/generated/',
      'src/generated-napi/',
      'src/generated-wasm/',
      'src/bindings.tsx',
      'src/NativeCoreFinanciero.ts',
    ],
  },
]);
