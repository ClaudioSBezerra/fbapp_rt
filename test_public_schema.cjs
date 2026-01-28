// Test script for public schema access
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ysbaqjkedlchrvgizabw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYmFxamtlZGxjaHJ2Z2l6YWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NTM5ODYsImV4cCI6MjA4NDUyOTk4Nn0.5iRPaNwHHl7Itkj4nUfib1uzBFoDrF4m-7d1KR3hbhc';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: {
    schema: 'public'
  }
});

async function testPublicSchema() {
  console.log('🧪 Testing public schema access...');
  
  try {
    // Test a simple query to see what's available
    try {
      const { data: tables, error: tablesError } = await supabase
        .from('pg_tables')
        .select('tablename')
        .eq('schemaname', 'public')
        .limit(10);
      
      if (tablesError) {
        console.log('❌ Error listing tables:', tablesError.message);
      } else {
        console.log('📋 Public tables:', tables);
      }
    } catch (e) {
      console.log('📋 Cannot access pg_tables, trying alternative...');
    }
    
    // Test basic connection with a simple query
    const { data, error } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public').limit(5);
    
    if (error) {
      console.log('❌ Error accessing information_schema:', error.message);
    } else {
      console.log('✅ Successfully connected to public schema');
      console.log('📋 Sample tables:', data);
    }
    
  } catch (e) {
    console.log('💥 Connection error:', e.message);
  }
}

testPublicSchema();