// A single catch-all keeps the existing Express route definitions available as
// Vercel Functions without exposing OpenAI or Supabase credentials to Vite.
export { default } from '../server.js';
