export async function onRequestGet(context) {
  const { env } = context;
  const dados = await calcomFetch('bookings?limit=100', env);
  return json((dados.bookings || []).map(b => ({
    calcom_booking_uid: b.uid,
    paciente_nome: (b.attendees && b.attendees[0] && b.attendees[0].name) || '—',
    paciente_email: (b.attendees && b.attendees[0] && b.attendees[0].email) || '',
    data_hora: b.startTime,
    dentista: (b.user && b.user.name) || '—',
    cadeira_sala: 'Cal.com',
    procedimento: b.title || 'Consulta',
    origem: 'calcom'
  })));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const dados = await request.json();
  if (!env.CALCOM_EVENT_TYPE_ID) return json({ erro: 'CALCOM_EVENT_TYPE_ID não configurado' }, 500);
  const payload = {
    eventTypeId: Number(env.CALCOM_EVENT_TYPE_ID),
    start: dados.data_hora,
    responses: { name: dados.paciente_nome, email: dados.paciente_email || 'paciente@exemplo.com' },
    metadata: { clinica_id: dados.clinica_id || null, dentista: dados.dentista || '', cadeira_sala: dados.cadeira_sala || '', procedimento: dados.procedimento || '' }
  };
  const criado = await calcomFetch('bookings', env, { method: 'POST', body: JSON.stringify(payload) });
  return json({ ok: true, booking: criado.booking || criado }, 201);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const uid = url.searchParams.get('uid');
  if (!uid) return json({ erro: 'uid obrigatório' }, 400);
  let idParaCancelar = uid;
  if (!/^\d+$/.test(uid)) {
    const dados = await calcomFetch('bookings?limit=100', env);
    const achado = (dados.bookings || []).find(b => b.uid === uid);
    if (achado) idParaCancelar = achado.id;
  }
  const dados = await calcomFetch(`bookings/${idParaCancelar}`, env, { method: 'DELETE' });
  return json({ ok: true, dados });
}

async function calcomFetch(rota, env, opcoes = {}) {
  const res = await fetch(`https://api.cal.com/v1/${rota}?apiKey=${env.CALCOM_API_KEY}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Cal.com ' + res.status + ': ' + JSON.stringify(dados));
  return dados;
}
function json(dado, status = 200) {
  return new Response(JSON.stringify(dado), { status, headers: { 'Content-Type': 'application/json' } });
}
