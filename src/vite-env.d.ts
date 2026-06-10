/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time flag to enable the office-tools (办公神器) module. Defaults to disabled. */
  readonly VITE_ENABLE_OFFICE_TOOLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
