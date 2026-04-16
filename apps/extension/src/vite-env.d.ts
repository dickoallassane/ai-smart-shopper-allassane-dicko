/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ShopFriend web API (no trailing slash), e.g. `http://localhost:3000` */
  readonly VITE_SHOPFRIEND_API_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
