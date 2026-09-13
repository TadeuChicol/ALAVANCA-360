export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const evento = body.triggerEvent;
  const p = body.payload || {};
  const uid = p.uid || p.bookingUid || null;
  const start = p.startTime || null;
  if (!uid || !start) return json({ ok: false, motivo: 'uid/startTime ausente' });

  const paciente = (p.attendees && p.attendees[0] && p.attendees[0].name) || p.responses?.name || 'Paciente Cal.com';
  const email = (p.attendees && p.attendees[0] && p.attendees[0].email) || p.responses?.email || '';
  const titulo = p.title || 'Consulta Odontológica';

  if (evento === 'BOOKING_CANCELLED') {
    await supabaseDelete(env, 'calcom_booking_uid', uid);
    return json({ ok: true, acao: 'cancelado' });
  }
  await upsertSupabase(env, {
    clinica_id: env.CLINICA_ID || null,
    paciente_nome: paciente,
    paciente_email: email,
    data_hora: start,
    dentista: '(agendado via Cal.com)',
    cadeira_sala: 'Cal.com',
    procedimento: titulo,
    calcom_booking_uid: uid,
    origem: 'calcom',
    status: 'ativo'
  });
  return json({ ok: true, acao: evento === 'BOOKING_RESCHEDULED' ? 'reagendado' : 'criado' });
}

async function upsertSupabase(env, registro) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/agendamentos?on_conflict=calcom_booking_uid`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(registro)
  });
  if (!res.ok) throw new Error('Supabase upsert: ' + res.status + ' ' + (await res.text()));
}
async function supabaseDelete(env, coluna, valor) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/agendamentos?${coluna}=eq.${encodeURIComponent(valor)}`, {
    method: 'DELETE',
    headers: { 'apikey': env.SUPABASE_SERVICE_ROLE, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE }
  });
  if (!res.ok) throw new Error('Supabase delete: ' + res.status + ' ' + (await res.text()));
}
function json(dado, status = 200) {
  return new Response(JSON.stringify(dado), { status, headers: { 'Content-Type': 'application/json' } });
}
