const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ysbaqjkedlchrvgizabw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYmFxamtlZGxjaHJ2Z2l6YWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NTM5ODYsImV4cCI6MjA4NDUyOTk4Nn0.5iRPaNwHHl7Itkj4nUfib1uzBFoDrF4m-7d1KR3hbhc';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: {
    schema: 'public'
  }
});

async function simpleTest() {
  console.log('🧪 Simple connection test...');
  
  try {
    // Test basic connection - try to select from a common table
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log('❌ Error accessing profiles:', error.message);
      
      // Try other common table names
      const commonTables = ['users', 'companies', 'tenants', 'auth.users', 'companies'];
      
      for (const tableName of commonTables) {
        try {
          const { data: tableData, error: tableError } = await supabase
            .from(tableName)
            .select('*')
            .limit(1);
          
          if (tableError) {
            console.log(`❌ Table ${tableName}: ${tableError.message}`);
          } else {
            console.log(`✅ Found table ${tableName} with data:`, tableData);
            return;
          }
        } catch (e) {
          console.log(`❌ Exception accessing ${tableName}: ${e.message}`);
        }
      }
      
      console.log('📋 No common tables found. The public schema might be empty.');
      
    } else {
      console.log('✅ Successfully accessed profiles table:', data);
    }
    
  } catch (e) {
    console.log('💥 Connection error:', e.message);
  }
}

simpleTest();