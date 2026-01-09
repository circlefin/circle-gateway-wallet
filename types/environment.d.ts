namespace NodeJS {
  interface ProcessEnv {
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: string
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string

    // Circle
    CIRCLE_API_KEY: string
    CIRCLE_ENTITY_SECRET: string
  }
}
