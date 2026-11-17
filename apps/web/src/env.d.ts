/// <reference types="vite/client" />

// Lets type-aware ESLint (plain tsserver) resolve .vue imports; vue-tsc uses the real SFC types.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}

/** The short hash of the running commit, from vite.config.ts `define` (Issue #281); null when git cannot tell. */
declare const __COMMIT_HASH__: string | null;
