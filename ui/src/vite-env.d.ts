/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_EXTENSION_ID?: string;
  readonly VITE_API_URL?: string;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.worker.min.mjs?url' {
  const src: string;
  export default src;
}

declare module '*.mjs?url' {
  const src: string;
  export default src;
}

declare module '*.js?url' {
  const src: string;
  export default src;
}
