const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://lfrkfthmlxrotqfrdmwq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmcmtmdGhtbHhyb3RxZnJkbXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NTM5MDEsImV4cCI6MjA4NDUyOTkwMX0.jBXVs1b4CcBvYjgR1ovz8OoO_JE55_Xz3GSFKHkF7IY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data: session } = await supabase.auth.signInWithPassword({
    email: 'claudio@trae.ai', // Guessing/Need a user. Wait, I can't guess.
    // If I can't sign in, I can't read 'empresas' if RLS protects it.
  });
  
  // Try reading without auth (maybe some are public or I can't)
  const { data, error } = await supabase
    .from('empresas')
    .select('id, nome')
    .limit(1);

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Empresa:", data);
  }
}

main();
