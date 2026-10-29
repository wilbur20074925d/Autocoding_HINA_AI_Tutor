/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_ZENMUX_API_KEY?: string;
  readonly VITE_KIMI_API_KEY?: string;
  readonly VITE_MOONSHOT_API_KEY?: string;
  readonly VITE_KIMI_API_BASE?: string;
  readonly VITE_KIMI_LABEL_MODEL?: string;
  readonly VITE_KIMI_MODEL?: string;
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_HINA_LABEL_EDGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
