const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testClear() {
  const userId = 'a0681926-1290-46ca-bb1d-5ed747731da1'; // ID do usuário dos logs
  const filialId = 'f5334041-0eba-4f02-8b62-381341d3692d'; // Filial do job recente

  console.log('Testing RPC calls for user:', userId, 'filial:', filialId);

  // 1. Check has_filial_access
  console.log('\nChecking has_filial_access...');
  const { data: hasAccess, error: accessError } = await supabase
    .rpc('has_filial_access', {
      _user_id: userId,
      _filial_id: filialId
    });
  
  if (accessError) {
    console.error('Error checking access:', accessError);
  } else {
    console.log('Has access:', hasAccess);
  }

  if (!hasAccess) {
    console.warn('User does not have access to this filial! RPC calls will likely fail (return 0).');
  }

  // 2. Count records before
  console.log('\nCounting mercadorias before...');
  const { count: countBefore, error: countError } = await supabase
    .from('mercadorias')
    .select('*', { count: 'exact', head: true })
    .eq('filial_id', filialId);
    
  if (countError) console.error('Error counting:', countError);
  else console.log('Count before:', countBefore);

  if (countBefore === 0) {
      console.log('No records to delete. Skipping delete test.');
      return;
  }

  // 3. Try to delete a small batch
  console.log('\nCalling delete_mercadorias_batch RPC...');
  const { data: deletedCount, error: deleteError } = await supabase
    .rpc('delete_mercadorias_batch', {
      _user_id: userId,
      _filial_ids: [filialId],
      _batch_size: 10
    });

  if (deleteError) {
    console.error('RPC Error:', deleteError);
  } else {
    console.log('RPC Success. Deleted count:', deletedCount);
  }

    // 4. Try to delete servicos batch
  console.log('\nCalling delete_servicos_batch RPC...');
  const { data: deletedServicos, error: deleteServicosError } = await supabase
    .rpc('delete_servicos_batch', {
      _user_id: userId,
      _filial_ids: [filialId],
      _batch_size: 10
    });

  if (deleteServicosError) {
    console.error('RPC Servicos Error:', deleteServicosError);
  } else {
    console.log('RPC Servicos Success. Deleted count:', deletedServicos);
  }

  // 5. Try to delete participantes batch
  console.log('\nCalling delete_participantes_batch RPC...');
  const { data: deletedParticipantes, error: deleteParticipantesError } = await supabase
    .rpc('delete_participantes_batch', {
      _user_id: userId,
      _filial_ids: [filialId],
      _batch_size: 10
    });

  if (deleteParticipantesError) {
    console.error('RPC Participantes Error:', deleteParticipantesError);
  } else {
    console.log('RPC Participantes Success. Deleted count:', deletedParticipantes);
  }

  // 6. Try to delete import_jobs batch
  console.log('\nCalling delete_import_jobs_batch RPC...');
  const { data: deletedJobs, error: deleteJobsError } = await supabase
    .rpc('delete_import_jobs_batch', {
      _user_id: userId,
      _batch_size: 10
    });

  if (deleteJobsError) {
    console.error('RPC Jobs Error:', deleteJobsError);
  } else {
    console.log('RPC Jobs Success. Deleted count:', deletedJobs);
  }

  // 7. Try to delete uso_consumo_imobilizado batch
  console.log('\nCalling delete_uso_consumo_imobilizado_batch RPC...');
  const { data: deletedUsoConsumo, error: deleteUsoConsumoError } = await supabase
    .rpc('delete_uso_consumo_imobilizado_batch', {
      _user_id: userId,
      _filial_ids: [filialId],
      _batch_size: 10
    });

  if (deleteUsoConsumoError) {
    console.error('RPC UsoConsumo Error:', deleteUsoConsumoError);
  } else {
    console.log('RPC UsoConsumo Success. Deleted count:', deletedUsoConsumo);
  }
}

testClear();
