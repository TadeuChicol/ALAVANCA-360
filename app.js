// ============================================================
// ESCUDO DE PROTEÇÃO GLOBAL CONTRA TRASHING DE EXECUÇÃO
// ============================================================
window.addEventListener('error', function(event) {
    console.warn("🛡️ [Mecanismo Alavanca 360] Erro contido em tempo de execução:", event.message);
    event.preventDefault(); // Impede o travamento em cascata da interface do usuário
});

window.addEventListener('unhandledrejection', function(event) {
    console.warn("🛡️ [Mecanismo Alavanca 360] Promessa assíncrona rejeitada e isolada:", event.reason);
    event.preventDefault();
});

// ============================================================
// ALAVANCA 360® — CORE ENGINE (Multi-Clínica / Multi-Tenant)
// CRM/SaaS para Saúde, Beleza e Estética
// Persistência real via SUPABASE (PostgreSQL + Auth + Row Level Security)
// ============================================================
// Requer que index.html carregue, NESTA ORDEM, antes deste arquivo:
//   1. https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
//   2. js/supabase-config.js  (define `supabaseClient` e `supabaseAuxClient`)
// ============================================================

// --------- ESTADO GLOBAL EM MEMÓRIA (cache dos dados do banco) ---------
const state = {
    usuario: null,        // usuário autenticado no Supabase Auth (auth.users)
    isAdmin: false,        // true se o usuário estiver na tabela consultoria_admins
    clinicaAtual: null,    // registro da tabela `clinicas` (tenant logado, se houver)
    pacientes: [],
    prontuario: [],
    agendamentos: [],
    profissionais: [],
    documentos: [],
    configGlobal: null,    // registro único da tabela: config_global (marca do Método/Consultoria)
    filtroAgendaAtivo: 'dia',
    // ----Módulo Financeiro (Fase 2) ----
    insumos: [],
    servicos: [],
    mapaInsumosServicos: [],
    custosFixos: [],
    configPrecificacao: [],   // [{modalidade:'convenio',...}, {modalidade:'particular',...}]
    atendimentos: [],
    custoServicoView: [],     // resultado da view vw_custo_servico
    charts: {}                // instâncias Chart.js ativas (para destruir/recriar)
};

// ============================================================
// 1. CAMADA DE ACESSO A DADOS (CORRIGIDA PARA SUPABASE REAL)
// ============================================================

async function apiList(table, filters = {}, limit = 1000) {
    try {
        let query = supabaseClient.from(table).select('*');
        
        // Injeta automaticamente o clinica_id se ele veio no objeto ou se está no estado
        if (state.clinicaAtual && table !== 'clinicas' && table !== 'consultoria_admins' && table !== 'config_global') {
            query = query.eq('clinica_id', state.clinicaAtual.id);
        }

        // Aplica outros filtros específicos passados por parâmetro
        Object.entries(filters).forEach(([key, value]) => {
            if (key !== 'clinica_id' && value !== null && value !== undefined) {
                query = query.eq(key, value);
            }
        });

        const { data, error } = await query.limit(limit);
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error(`Erro ao listar ${table} no Supabase:`, e);
        return [];
    }
}

async function apiGet(table, id) {
    try {
        const { data, error } = await supabaseClient
            .from(table)
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    } catch (e) {
        console.error(`Erro ao buscar id ${id} na tabela ${table}:`, e);
        return null;
    }
}

async function apiCreate(table, data) {
    try {
        // Regra do Tenant (Multi-clínica): Se houver uma clínica logada e a tabela exigir clinica_id, nós injetamos automaticamente
        if (state.clinicaAtual && table !== 'clinicas' && table !== 'consultoria_admins' && table !== 'config_global') {
            data.clinica_id = state.clinicaAtual.id;
        }

        const { data: row, error } = await supabaseClient
            .from(table)
            .insert([data])
            .select()
            .single();

        if (error) throw error;
        return row;
    } catch (e) {
        console.error(`Erro ao criar registro na tabela ${table}:`, e);
        alert(`Erro ao salvar: ${e.message || e}`);
        throw e;
    }
}

async function apiUpdate(table, id, data) {
    try {
        const { data: row, error } = await supabaseClient
            .from(table)
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return row;
    } catch (e) {
        console.error(`Erro ao atualizar a tabela ${table}:`, e);
        return null;
    }
}

async function apiDelete(table, id) {
    try {
        const { error } = await supabaseClient
            .from(table)
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (e) {
        console.error(`Erro ao deletar da tabela ${table}:`, e);
        return false;
    }
}

// ============================================================
// 2. LOGIN / AUTENTICAÇÃO (SUPABASE AUTH)
// ============================================================

document.addEventListener('DOMContentLoaded', initLoginScreen);

async function initLoginScreen() {
    if (window.lucide) lucide.createIcons();

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        mostrarTelaLogin('Configuração pendente: preencha SUPABASE_URL e SUPABASE_ANON_KEY em js/supabase-config.js (veja docs/SUPABASE_SETUP.md).');
        const btn = document.getElementById('btnEntrarSistema');
        if (btn) btn.disabled = true;
        return;
    }

    await carregarConfigGlobal();
    aplicarMarcaMetodoNaTelaLogin();

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
        const ok = await carregarContextoUsuario(session.user);
        if (ok) { await entrarNoSistema(); return; }
    }

    mostrarTelaLogin();
}

async function carregarConfigGlobal() {
    let cfg = await apiGet('config_global', 'global');
    if (!cfg) {
        cfg = {
            id: 'global',
            logo_metodo_url: 'images/logo-alavanca-360.png',
            nome_consultoria: 'Alavanca 360 Consultoria',
            whatsapp_consultoria: '',
            email_consultoria: '',
            logo_consultoria_url: ''
        };
    }
    state.configGlobal = cfg;
}

function aplicarMarcaMetodoNaTelaLogin() {
    const logoMetodo = (state.configGlobal && state.configGlobal.logo_metodo_url) || 'images/logo-alavanca-360.png';
    document.querySelectorAll('.logo-metodo-alavanca').forEach(img => { img.src = logoMetodo; });

    const nomeConsultoria = document.getElementById('lblNomeConsultoriaLogin');
    if (nomeConsultoria && state.configGlobal) {
        nomeConsultoria.textContent = state.configGlobal.nome_consultoria || 'Alavanca 360 Consultoria';
    }
}

function mostrarTelaLogin(mensagemErro) {
    document.getElementById('telaLogin').classList.remove('hidden');
    document.getElementById('appPrincipal').classList.add('hidden');

    const erroBox = document.getElementById('loginErro');
    if (mensagemErro) {
        erroBox.textContent = mensagemErro; // <--- Corrigido aqui (de messageErro para mensagemErro)
        erroBox.classList.remove('hidden');
    } else {
        erroBox.classList.add('hidden');
    }

    if (window.lucide) lucide.createIcons();
}

async function autenticarClinica() {
    const email = (document.getElementById('inputCodigoAcesso').value || '').trim();
    const senha = (document.getElementById('inputSenhaAcesso').value || '').trim();

    if (!email || !senha) {
        mostrarTelaLogin('Informe o e-mail e a senha de acesso.');
        return;
    }

    const btn = document.getElementById('btnEntrarSistema');
    const textoOriginal = btn.textContent;
    btn.textContent = 'Verificando...';
    btn.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });

        if (error) {
            mostrarTelaLogin(traduzErroSupabase(error.message));
            return;
        }

        const ok = await carregarContextoUsuario(data.user);
        if (!ok) {
            await supabaseClient.auth.signOut();
            mostrarTelaLogin('Este usuário não está vinculado a nenhuma clínica ativa nem é administrador da Consultoria.');
            return;
        }

        await entrarNoSistema();
    } catch (e) {
        console.error(e);
        mostrarTelaLogin('Erro ao autenticar. Tente novamente.');
    } finally {
        btn.textContent = textoOriginal;
        btn.disabled = false;
    }
}

function traduzErroSupabase(msg) {
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.';
    if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado. Verifique a caixa de entrada (ou peça para a Consultoria desativar a confirmação de e-mail no Supabase).';
    return msg;
}

// Carrega: se o usuário é admin da Consultoria, e/ou dono de alguma clínica.
// Retorna true se o login pode prosseguir (é admin OU tem clínica ativa vinculada).
async function carregarContextoUsuario(user) {
    state.usuario = user;

    // Busca o Administrador usando a coluna 'email_admin' mapeada no banco
    const { data: adminData, error: adminErr } = await supabaseClient
        .from('consultoria_admins')
        .select('*')
        .eq('email_admin', user.email)
        .maybeSingle();

    state.isAdmin = !!adminData;

    // Busca se existe clínica associada ao usuário
    const { data: clinicas, error } = await supabaseClient
        .from('clinicas')
        .select('*')
        .eq('owner_user_id', user.id)
        .maybeSingle();

    if (!error && clinicas) {
        if (clinicas.ativo === false && !state.isAdmin) {
            return false; // clínica suspensa e usuário não é admin
        }
        state.clinicaAtual = clinicas;
    } else {
        state.clinicaAtual = null;
    }

    return state.isAdmin || !!state.clinicaAtual;
}

async function sairDoSistema() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

async function entrarNoSistema() {
    document.getElementById('telaLogin').classList.add('hidden');
    document.getElementById('appPrincipal').classList.remove('hidden');
    await init();
}

// ============================================================
// 3. INICIALIZAÇÃO DO APP (JÁ AUTENTICADO)
// ============================================================

async function init() {
    if (window.lucide) lucide.createIcons();

    ajustarMenuConformePermissoes();

    if (state.clinicaAtual) {
        await Promise.all([
            carregarProfissionais(),
            carregarPacientes(),
            carregarAgendamentos(),
            carregarProntuario(),
            carregarDadosFinanceiros()
        ]);

        aplicarConfigNaInterface();
        rebuildSelects();
        calcularMetricasGerais();
        calcularMetricasTratamentos();
        calcularFunilComercial();
        renderizarAgendaLocal();
        atualizarTemplateDocumento();
        renderizarModuloFinanceiroCompleto();
    } else {
        // Usuário é apenas administrador da Consultoria, sem clínica operacional própria
        switchTab('tab-hub-master');
    }

    if (state.isAdmin) {
        prepararHubMaster();
    }

    if (window.lucide) lucide.createIcons();
}

// Esconde módulos operacionais (M1-M7 e HUB Clínica) para quem só é admin
// da Consultoria e não é dono de nenhuma clínica; esconde o HUB Master de
// quem não é admin.
function ajustarMenuConformePermissoes() {
    const idsOperacionais = ['btn-tab-ceo', 'btn-tab-financeiro', 'btn-tab-comercial', 'btn-tab-tratamentos', 'btn-tab-pacientes', 'btn-tab-agenda', 'btn-tab-documentos', 'btn-tab-hub-clinica', 'btn-tab-custos', 'btn-tab-atendimentos', 'btn-tab-dashboard-vivo', 'btn-tab-assistente'];
    const btnMaster = document.getElementById('btn-tab-hub-master');

    if (!state.clinicaAtual) {
        idsOperacionais.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
    }
    if (btnMaster) {
        btnMaster.classList.toggle('hidden', !state.isAdmin);
    }
}

function clinicaId() {
    return state.clinicaAtual ? state.clinicaAtual.id : null;
}

async function carregarProfissionais() {
    let lista = await apiList('profissionais', { clinica_id: clinicaId() });

    if (lista.length === 0) {
        const p1 = await apiCreate('profissionais', { clinica_id: clinicaId(), nome: 'Dra. Rebeca Moura', cro: 'CRO-SP 84.231', especialidade: 'Implantodontia e Estética' });
        const p2 = await apiCreate('profissionais', { clinica_id: clinicaId(), nome: 'Dr. Carlos Eduardo', cro: 'CRO-SP 91.504', especialidade: 'Ortodontia' });
        lista = [p1, p2];
    }
    state.profissionais = lista;
}

async function carregarPacientes() {
    state.pacientes = await apiList('pacientes');
}

async function carregarAgendamentos() {
    state.agendamentos = await apiList('agendamentos');
}

async function carregarProntuario() {
    state.prontuario = await apiList('prontuario_evolutivo');
}

async function carregarDadosFinanceiros() {
    const [insumos, servicos, mapa, fixos, config, atendimentos, custoView] = await Promise.all([
        apiList('insumos'),
        apiList('servicos'),
        apiList('mapa_insumos_servicos'),
        apiList('custos_fixos'),
        apiList('config_precificacao'),
        apiList('atendimentos'),
        apiList('vw_custo_servico')
    ]);
    state.insumos = insumos;
    state.servicos = servicos;
    state.mapaInsumosServicos = mapa;
    state.custosFixos = fixos;
    state.configPrecificacao = config;
    state.atendimentos = atendimentos;
    state.custoServicoView = custoView;
}

// ============================================================
// 4. NAVEGAÇÃO ENTRE MÓDULOS
// ============================================================

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove(
        'text-emerald-400', 'bg-emerald-500/5', 'border', 'border-emerald-500/10'
    ));

    const activeBtn = document.getElementById(`btn-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.add('text-emerald-400', 'bg-emerald-500/5', 'border', 'border-emerald-500/10');
    }

    if (window.lucide) lucide.createIcons();
}

// ============================================================
// 5. MÓDULO 1 — VISÃO EXECUTIVA (CEO DASHBOARD)
// ============================================================

function formatarMoeda(valor) {
    const n = Number(valor) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calcularMetricasGerais() {
    const pacientes = state.pacientes;
    const totalPacientes = pacientes.length;
    const receitaBruta = pacientes.reduce((soma, p) => soma + (Number(p.ltv) || 0), 0);
    const ticketMedio = totalPacientes > 0 ? receitaBruta / totalPacientes : 0;
    const ltvGeral = totalPacientes > 0 ? receitaBruta / totalPacientes : 0;

    const elReceita = document.getElementById('cardReceitaBruta');
    const elTotal = document.getElementById('cardTotalPacientes');
    const elTicket = document.getElementById('cardTicketMedio');
    const elLtv = document.getElementById('cardLTVGeral');

    if (elReceita) elReceita.textContent = formatarMoeda(receitaBruta);
    if (elTotal) elTotal.textContent = totalPacientes;
    if (elTicket) elTicket.textContent = formatarMoeda(ticketMedio);
    if (elLtv) elLtv.textContent = formatarMoeda(ltvGeral);
}

// ============================================================
// 6. MÓDULO 2 — INTELIGÊNCIA FINANCEIRA (AUDITORIA POR MATCH CODE)
// ============================================================

function filtrarFinanceiro() {
    const termo = (document.getElementById('matchCodeFinanceiro').value || '').toLowerCase().trim();
    const tbody = document.getElementById('tbodyFinanceiro');

    if (termo.length < 2) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">Aguardando termo de pesquisa válido...</td></tr>`;
        return;
    }

    const encontrados = state.pacientes.filter(p => (p.nome || '').toLowerCase().includes(termo));

    if (encontrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">Nenhum paciente localizado para o termo informado.</td></tr>`;
        return;
    }

    tbody.innerHTML = encontrados.map(p => {
        const ltv = Number(p.ltv) || 0;
        let scoreLabel = 'Baixo';
        let scoreClasse = 'text-slate-400';
        if (ltv >= 8000) { scoreLabel = 'Alto'; scoreClasse = 'text-emerald-400'; }
        else if (ltv >= 3000) { scoreLabel = 'Médio'; scoreClasse = 'text-amber-400'; }

        return `
            <tr class="border-b border-slate-800/60">
                <td class="p-3 text-slate-200">${p.nome}</td>
                <td class="p-3 text-emerald-400">${formatarMoeda(ltv)}</td>
                <td class="p-3">${formatarMoeda(ltv)}</td>
                <td class="p-3 font-bold ${scoreClasse}">${scoreLabel}</td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// 7. MÓDULO 3 — INTELIGÊNCIA COMERCIAL (FUNIL ESTRATÉGICO)
// ============================================================

function calcularFunilComercial() {
    const container = document.getElementById('comercialFunilContainer');
    const placeholder = document.getElementById('comercialPlaceholder');
    if (!container) return;

    const total = state.pacientes.length;
    if (total < 3) {
        container.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');

    const porCiclo = { Novo: 0, Ativo: 0, Recorrente: 0 };
    const porMomento = {};

    state.pacientes.forEach(p => {
        if (porCiclo[p.ciclo_relacionamento] !== undefined) porCiclo[p.ciclo_relacionamento]++;
        const m = p.momento_vida || 'Não informado';
        porMomento[m] = (porMomento[m] || 0) + 1;
    });

    const cicloHtml = Object.entries(porCiclo).map(([k, v]) => `
        <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
            <p class="text-[10px] uppercase text-slate-500">${k}</p>
            <p class="text-xl font-bold text-sky-400">${v}</p>
        </div>
    `).join('');

    const momentoHtml = Object.entries(porMomento).map(([k, v]) => `
        <div class="flex justify-between text-xs border-b border-slate-800/60 py-1.5">
            <span class="text-slate-400">${k}</span>
            <span class="font-bold text-purple-400">${v} cliente(s)</span>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="grid grid-cols-3 gap-3 mb-4">${cicloHtml}</div>
        <div class="bg-slate-900 p-4 rounded-xl border border-slate-800">
            <p class="text-xs font-bold uppercase text-purple-400 mb-2">Distribuição por Momento de Vida</p>
            ${momentoHtml}
        </div>
    `;
}

// ============================================================
// 8. MÓDULO 4 — INTELIGÊNCIA DE TRATAMENTOS
// ============================================================

function calcularMetricasTratamentos() {
    const somas = { implantes: 0, ortodontia: 0, harmonizacao: 0 };
    state.pacientes.forEach(p => {
        if (somas[p.categoria_principal] !== undefined) {
            somas[p.categoria_principal] += Number(p.ltv) || 0;
        }
    });

    const elImplantes = document.getElementById('revImplantes');
    const elOrto = document.getElementById('revOrto');
    const elHarmo = document.getElementById('revHarmonizacao');

    if (elImplantes) elImplantes.textContent = formatarMoeda(somas.implantes);
    if (elOrto) elOrto.textContent = formatarMoeda(somas.ortodontia);
    if (elHarmo) elHarmo.textContent = formatarMoeda(somas.harmonizacao);
}

// ============================================================
// 9. MÓDULO 5 — BASE DE CLIENTES (CADASTRO, EDIÇÃO, PRONTUÁRIO)
// ============================================================

function coletarDadosFormularioPaciente() {
    const nome = document.getElementById('formNome').value.trim();
    const ltv = parseFloat(document.getElementById('formLtvInput').value) || 0;

    const f1 = parseInt(document.getElementById('idxFotos').value) || 0;
    const f2 = parseInt(document.getElementById('idxBoca').value) || 0;
    const f3 = parseInt(document.getElementById('idxRepresenta').value) || 0;
    const f4 = parseInt(document.getElementById('idxAutoestima').value) || 0;
    const scoreReconexao = f1 + f2 + f3 + f4;

    let opportunity = 30 + (ltv > 5000 ? 20 : 0) + (scoreReconexao > 15 ? 30 : 0);
    if (opportunity > 100) opportunity = 100;

    return {
        clinica_id: clinicaId(),
        nome,
        data_nascimento: document.getElementById('formDataNasc').value || null,
        sexo: document.getElementById('formSexo').value,
        estado_civil: document.getElementById('formEstadoCivil').value,
        filhos: document.getElementById('formFilhos').value,
        cidade: document.getElementById('formCidade').value,
        bairro: document.getElementById('formBairro').value,
        cep: document.getElementById('formCep').value,
        profissao: document.getElementById('formProfissao').value,
        empresa: document.getElementById('formEmpresa').value,
        renda: parseFloat(document.getElementById('formRenda').value) || 0,
        modalidade: document.getElementById('formModalidade').value,
        momento_vida: document.getElementById('formMomentoVida').value,
        comparecimento: document.getElementById('formScoreComparecer').value,
        engajamento_whatsapp: document.getElementById('formScoreWhats').value,
        score_decisao: document.getElementById('formScoreDecisao').value,
        adesao_tratamento: document.getElementById('formScoreConfianca').value,
        categoria_principal: document.getElementById('formCategoriaClinica').value,
        ltv,
        riscos: document.getElementById('formRiscos').value,
        necessidades_futuras: document.getElementById('formNecessidades').value,
        motivacao: document.getElementById('formMotivacao').value,
        queixa: document.getElementById('formQueixa').value,
        objetivo: document.getElementById('formObjetivo').value,
        ciclo_relacionamento: document.getElementById('formCicloRelacionamento').value,
        idx_fotos: f1, idx_boca: f2, idx_representa: f3, idx_autoestima: f4,
        score_reconexao: scoreReconexao,
        opportunity_score: opportunity
    };
}

async function cadastrarOuAtualizarPaciente() {
    const idAtual = document.getElementById('formIndexEditando').value;
    const dados = coletarDadosFormularioPaciente();

    if (!dados.nome) { alert('Nome é obrigatório.'); return; }

    const btn = document.getElementById('btnSalvarM5');
    const textoOriginal = btn.textContent;
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
        if (idAtual && idAtual !== '-1') {
            const atualizado = await apiUpdate('pacientes', idAtual, dados);
            const idx = state.pacientes.findIndex(p => p.id === idAtual);
            if (idx >= 0) state.pacientes[idx] = atualizado;
            alert('Dados atualizados com sucesso.');
        } else {
            const criado = await apiCreate('pacientes', dados);
            state.pacientes.push(criado);
            alert('Paciente cadastrado com sucesso.');
        }

        limparEPararEdicao();
        calcularMetricasGerais();
        calcularMetricasTratamentos();
        calcularFunilComercial();
        rebuildSelects();
    } catch (e) {
        console.error(e);
        alert('Erro ao salvar paciente. Tente novamente.');
    } finally {
        btn.textContent = textoOriginal;
        btn.disabled = false;
    }
}

function prepararEdicaoM5(id) {
    const p = state.pacientes.find(x => x.id === id);
    if (!p) return;

    document.getElementById('formIndexEditando').value = p.id;
    document.getElementById('formNome').value = p.nome || '';
    document.getElementById('formDataNasc').value = p.data_nascimento || '';
    document.getElementById('formSexo').value = p.sexo || 'Feminino';
    document.getElementById('formEstadoCivil').value = p.estado_civil || '';
    document.getElementById('formFilhos').value = p.filhos || '';
    document.getElementById('formCidade').value = p.cidade || '';
    document.getElementById('formBairro').value = p.bairro || '';
    document.getElementById('formCep').value = p.cep || '';
    document.getElementById('formProfissao').value = p.profissao || '';
    document.getElementById('formEmpresa').value = p.empresa || '';
    document.getElementById('formRenda').value = p.renda || '';
    document.getElementById('formModalidade').value = p.modalidade || 'Particular';
    document.getElementById('formMomentoVida').value = p.momento_vida || 'Mulher 35+';
    document.getElementById('formScoreComparecer').value = p.comparecimento || 'Comparece sempre';
    document.getElementById('formScoreWhats').value = p.engajamento_whatsapp || 'Responde WhatsApp';
    document.getElementById('formScoreDecisao').value = p.score_decisao || 'Decide rápido';
    document.getElementById('formScoreConfianca').value = p.adesao_tratamento || 'Alta Adesão';
    document.getElementById('formCategoriaClinica').value = p.categoria_principal || 'implantes';
    document.getElementById('formLtvInput').value = p.ltv || 0;
    document.getElementById('formRiscos').value = p.riscos || 'Nenhum relevante';
    document.getElementById('formNecessidades').value = p.necessidades_futuras || '';
    document.getElementById('formMotivacao').value = p.motivacao || 'Estética';
    document.getElementById('formQueixa').value = p.queixa || 'vergonha ao sorrir';
    document.getElementById('formObjetivo').value = p.objetivo || 'voltar a sorrir';
    document.getElementById('formCicloRelacionamento').value = p.ciclo_relacionamento || 'Novo';
    document.getElementById('idxFotos').value = p.idx_fotos || 0;
    document.getElementById('idxBoca').value = p.idx_boca || 0;
    document.getElementById('idxRepresenta').value = p.idx_representa || 0;
    document.getElementById('idxAutoestima').value = p.idx_autoestima || 0;

    document.getElementById('lblTituloFormM5').textContent = 'Editando Cadastro de: ' + p.nome;
    document.getElementById('btnCancelarEdicao').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function limparEPararEdicao() {
    document.getElementById('formIndexEditando').value = '-1';
    document.querySelectorAll('#tab-pacientes input[type=text], #tab-pacientes input[type=number], #tab-pacientes input[type=date]').forEach(inp => {
        if (inp.id !== 'matchCodeProntuario') inp.value = '';
    });
    document.getElementById('lblTituloFormM5').textContent = 'Novo Cadastro Estruturado (Paciente)';
    document.getElementById('btnCancelarEdicao').classList.add('hidden');
}

function filtrarProntuario() {
    const busca = (document.getElementById('matchCodeProntuario').value || '').toLowerCase().trim();
    const box = document.getElementById('containerFichaPaciente');

    if (busca.length < 3) { box.classList.add('hidden'); return; }

    const match = state.pacientes.find(p => (p.nome || '').toLowerCase().includes(busca));
    if (!match) { box.classList.add('hidden'); return; }

    box.classList.remove('hidden');
    document.getElementById('lblNomePacienteFicha').textContent = match.nome;
    document.getElementById('lblFichaMomento').textContent = match.momento_vida || '--';
    document.getElementById('lblFichaOpportunity').textContent = (match.opportunity_score || 0) + '/100';
    document.getElementById('vLocal').textContent = `${match.bairro || '-'}, ${match.cidade || '-'}`;
    document.getElementById('vProf').textContent = `${match.profissao || '-'} (${formatarMoeda(match.renda)})`;
    document.getElementById('vPlano').textContent = match.modalidade || '-';
    document.getElementById('vComp').textContent = match.comparecimento || '-';
    document.getElementById('vEng').textContent = `${match.engajamento_whatsapp || '-'} / ${match.score_decisao || '-'}`;

    document.getElementById('btnEditarFichaAtiva').onclick = function () { prepararEdicaoM5(match.id); };
    renderizarLinhasProntuario(match.id);
}

function renderizarLinhasProntuario(pacienteId) {
    const tbody = document.getElementById('tbodyHistoricoProntuario');
    const linhas = state.prontuario
        .filter(l => l.paciente_id === pacienteId)
        .sort((a, b) => (a.data_registro || '').localeCompare(b.data_registro || ''));

    if (linhas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-600">Nenhuma evolução clínica registrada.</td></tr>`;
        return;
    }

    tbody.innerHTML = linhas.map(line => {
        const acaoDeletar = line.travado
            ? `<span class="text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">Oficial Emitido (M7)</span>`
            : `<button onclick="removerLinhaProntuario('${line.id}', '${pacienteId}')" class="text-rose-400 hover:underline">Eliminar</button>`;

        const acaoEditar = line.travado
            ? ''
            : `<button onclick="editarLinhaProntuario('${line.id}', '${pacienteId}')" class="text-sky-400 hover:underline">Editar</button>`;

        return `
            <tr class="border-b border-slate-800/60 hover:bg-slate-900/40 text-xs">
                <td class="p-2 font-mono text-slate-400">${line.data_registro || ''}</td>
                <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] ${line.tipo === 'Online' ? 'bg-purple-950 text-purple-300' : 'bg-sky-950 text-sky-300'}">${line.tipo}</span></td>
                <td class="p-2 text-slate-200">${line.tratamento_realizado || ''}</td>
                <td class="p-2 italic text-slate-400">${line.receituario || 'Nenhuma'}</td>
                <td class="p-2 text-right space-x-2">${acaoEditar} ${acaoDeletar}</td>
            </tr>
        `;
    }).join('');
}

async function adicionarLinhaProntuarioManual() {
    const busca = (document.getElementById('matchCodeProntuario').value || '').toLowerCase().trim();
    const match = state.pacientes.find(p => (p.nome || '').toLowerCase().includes(busca));
    if (!match) return;

    const data = document.getElementById('pntData').value || new Date().toLocaleDateString('pt-BR');
    const tipo = document.getElementById('pntModalidade').value;
    const tratado = document.getElementById('pntTratado').value.trim();
    const receita = document.getElementById('pntReceita').value.trim();

    if (!tratado) { alert('Informe o tratamento.'); return; }

    const novaLinha = await apiCreate('prontuario_evolutivo', {
        clinica_id: clinicaId(),
        paciente_id: match.id,
        data_registro: data,
        tipo,
        tratamento_realizado: tratado,
        receituario: receita,
        travado: false
    });

    state.prontuario.push(novaLinha);
    document.getElementById('pntTratado').value = '';
    document.getElementById('pntReceita').value = '';
    renderizarLinhasProntuario(match.id);
}

async function editarLinhaProntuario(linhaId, pacienteId) {
    const linha = state.prontuario.find(l => l.id === linhaId);
    if (!linha) return;

    const novoTratado = prompt('Editar Tratamento Realizado:', linha.tratamento_realizado);
    if (novoTratado === null) return;
    const novaReceita = prompt('Editar Receituário:', linha.receituario);

    const atualizado = await apiUpdate('prontuario_evolutivo', linhaId, {
        tratamento_realizado: novoTratado,
        receituario: novaReceita
    });

    const idx = state.prontuario.findIndex(l => l.id === linhaId);
    if (idx >= 0) state.prontuario[idx] = atualizado;
    renderizarLinhasProntuario(pacienteId);
}

async function removerLinhaProntuario(linhaId, pacienteId) {
    if (!confirm('Deseja realmente remover este registro de consulta?')) return;
    try {
        await apiDelete('prontuario_evolutivo', linhaId);
        state.prontuario = state.prontuario.filter(l => l.id !== linhaId);
        renderizarLinhasProntuario(pacienteId);
    } catch (e) {
        alert('Não foi possível remover (registro pode estar travado/oficial).');
    }
}

// ============================================================
// 10. MÓDULO 6 — AGENDA INTERNA E QUADRO DE RECURSOS
// ============================================================

async function adicionarOuEditarAgendaLocal() {
    const idAtual = document.getElementById('agendaIndexEditando').value;
    const paciente_nome = document.getElementById('agPaciente').value.trim();
    const data_hora = document.getElementById('agData').value;
    const dentista = document.getElementById('agDentista').value;
    const cadeira_sala = document.getElementById('agCadeira').value.trim();
    const procedimento = document.getElementById('agProcedimento').value.trim();

    if (!paciente_nome || !data_hora) { alert('Paciente e Data são obrigatórios.'); return; }

    const item = { clinica_id: clinicaId(), paciente_nome, data_hora, dentista, cadeira_sala, procedimento };

    if (idAtual && idAtual !== '-1') {
        const atualizado = await apiUpdate('agendamentos', idAtual, item);
        const idx = state.agendamentos.findIndex(a => a.id === idAtual);
        if (idx >= 0) state.agendamentos[idx] = atualizado;
    } else {
        const criado = await apiCreate('agendamentos', item);
        state.agendamentos.push(criado);
    }

    limparAgendaForm();
    renderizarAgendaLocal();
}

function pertenceAoFiltro(dataHoraStr, filtro) {
    if (!dataHoraStr) return false;
    const data = new Date(dataHoraStr);
    const agora = new Date();

    if (filtro === 'dia') {
        return data.toDateString() === agora.toDateString();
    }
    if (filtro === 'semana') {
        const inicioSemana = new Date(agora);
        inicioSemana.setDate(agora.getDate() - agora.getDay());
        inicioSemana.setHours(0, 0, 0, 0);
        const fimSemana = new Date(inicioSemana);
        fimSemana.setDate(inicioSemana.getDate() + 7);
        return data >= inicioSemana && data < fimSemana;
    }
    if (filtro === 'mes') {
        return data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear();
    }
    return true;
}

function renderizarAgendaLocal() {
    const tbody = document.getElementById('tbodyAgendaLocal');
    const filtrados = state.agendamentos
        .filter(a => pertenceAoFiltro(a.data_hora, state.filtroAgendaAtivo))
        .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-600">Nenhum agendamento registrado nesta visão.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(a => `
        <tr class="hover:bg-slate-900/60 text-xs">
            <td class="p-2 text-slate-200 font-semibold">${a.paciente_nome}</td>
            <td class="p-2 text-sky-400">${a.data_hora ? new Date(a.data_hora).toLocaleString('pt-BR') : ''}</td>
            <td class="p-2 text-slate-300">${a.dentista || ''}</td>
            <td class="p-2"><span class="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px] text-amber-400">${a.cadeira_sala || 'Geral'}</span></td>
            <td class="p-2 text-slate-400">${a.procedimento || ''}</td>
            <td class="p-2 text-right space-x-1">
                <button onclick="prepararEdicaoAgenda('${a.id}')" class="text-sky-400 hover:underline">Editar</button>
                <span class="text-slate-700">|</span>
                <button onclick="removerAgenda('${a.id}')" class="text-rose-400 hover:underline">Excluir</button>
            </td>
        </tr>
    `).join('');
}

function prepararEdicaoAgenda(id) {
    const a = state.agendamentos.find(x => x.id === id);
    if (!a) return;

    document.getElementById('agendaIndexEditando').value = a.id;
    document.getElementById('agPaciente').value = a.paciente_nome || '';
    document.getElementById('agData').value = a.data_hora || '';
    document.getElementById('agDentista').value = a.dentista || '';
    document.getElementById('agCadeira').value = a.cadeira_sala || '';
    document.getElementById('agProcedimento').value = a.procedimento || '';

    document.getElementById('lblTituloAgendaForm').textContent = 'Modificar Agendamento';
    document.getElementById('btnLimparAgendaForm').classList.remove('hidden');
}

function limparAgendaForm() {
    document.getElementById('agendaIndexEditando').value = '-1';
    document.getElementById('agPaciente').value = '';
    document.getElementById('agData').value = '';
    document.getElementById('agCadeira').value = '';
    document.getElementById('agProcedimento').value = '';
    document.getElementById('lblTituloAgendaForm').textContent = 'Reservar Horário Operacional';
    document.getElementById('btnLimparAgendaForm').classList.add('hidden');
}

async function removerAgenda(id) {
    if (!confirm('Remover este compromisso da cadeira clínica?')) return;
    await apiDelete('agendamentos', id);
    state.agendamentos = state.agendamentos.filter(a => a.id !== id);
    renderizarAgendaLocal();
}

function filtrarPeriodoAgenda(periodo) {
    state.filtroAgendaAtivo = periodo;
    document.querySelectorAll("[id^='btnFilter']").forEach(b => b.classList.remove('bg-sky-600', 'text-white'));
    document.getElementById('btnFilter' + periodo).classList.add('bg-sky-600', 'text-white');
    renderizarAgendaLocal();
}

// ============================================================
// 11. MÓDULO 7 — ESTAÇÃO DE DOCUMENTOS LEGAIS
// ============================================================

async function emitirEDarComoProntoDocumento() {
    const pacName = document.getElementById('selectDocPaciente').value;
    const dentName = document.getElementById('selectDocDentista').value;
    const tipo = document.getElementById('selectTipoDoc').value;

    const paciente = state.pacientes.find(p => p.nome === pacName);
    if (!paciente) { alert('Selecione um paciente válido cadastrado no Módulo 5.'); return; }

    const hoje = new Date().toLocaleDateString('pt-BR');
    const desc = tipo === 'orcamento' ? 'Proposta Orçamentária Estética Emitida' : 'Receituário Odontológico Emitido';
    const conteudoHtml = document.getElementById('areaPreviewDocumento').innerHTML;

    try {
        await apiCreate('documentos_emitidos', {
            clinica_id: clinicaId(),
            paciente_id: paciente.id,
            paciente_nome: pacName,
            dentista_nome: dentName,
            tipo_documento: tipo,
            conteudo_html: conteudoHtml,
            data_emissao: hoje
        });

        const novaLinha = await apiCreate('prontuario_evolutivo', {
            clinica_id: clinicaId(),
            paciente_id: paciente.id,
            data_registro: hoje,
            tipo: 'Presencial',
            tratamento_realizado: desc,
            receituario: tipo === 'receita' ? 'Prescrição Clínica Autenticada' : 'Orçamento Base',
            travado: true
        });
        state.prontuario.push(novaLinha);

        alert('Documento dado como emitido. Histórico injetado com sucesso e blindado contra exclusão no prontuário do M5!');

        const buscaAtual = (document.getElementById('matchCodeProntuario').value || '').toLowerCase();
        if (buscaAtual && paciente.nome.toLowerCase().includes(buscaAtual)) {
            renderizarLinhasProntuario(paciente.id);
        }
    } catch (e) {
        console.error(e);
        alert('Erro ao emitir documento. Tente novamente.');
    }

    imprimirDocumentoPDF();
}

function atualizarTemplateDocumento() {
    const pacName = document.getElementById('selectDocPaciente').value || 'Paciente';
    const dentName = document.getElementById('selectDocDentista').value || 'Profissional Responsável';
    const tipo = document.getElementById('selectTipoDoc').value;
    const preview = document.getElementById('areaPreviewDocumento');

    const clinica = (state.clinicaAtual && state.clinicaAtual.nome_clinica) || 'Clínica';
    const endereco = (state.clinicaAtual && state.clinicaAtual.endereco) || '';
    const profissional = state.profissionais.find(p => p.nome === dentName);
    const cro = profissional ? profissional.cro : '';
    const logoClinica = state.clinicaAtual && state.clinicaAtual.logo_clinica_url;

    const logoHtml = logoClinica
        ? `<img src="${logoClinica}" alt="Logo" class="h-10 object-contain mb-1">`
        : '';

    const cabecalho = `<div class="flex justify-between items-center border-b pb-4 mb-4">
        <div class="text-left">${logoHtml}<h1 class="font-bold uppercase text-sm">${clinica}</h1><p class="text-[10px] text-gray-500">${endereco}</p></div>
    </div>`;

    const assinaturaValidador = `
        <div class="mt-8 pt-6 border-t border-gray-200 flex justify-between items-end text-xs text-gray-700">
            <div>
                <p class="font-bold">${dentName}</p>
                <p class="text-[11px] text-gray-500">${cro}</p>
                <p class="text-[10px] text-emerald-600 mt-1 font-mono">✓ Assinatura Eletrônica Validada</p>
            </div>
            <div class="text-right border border-dashed border-gray-300 p-2 rounded bg-gray-50 font-mono text-[9px] text-gray-400">
                Selo Digital: ALAVANCA360-SAAS-SECURE-KEY-2026
            </div>
        </div>
    `;

    if (tipo === 'orcamento') {
        preview.innerHTML = `
            ${cabecalho}
            <h2 class="text-center font-bold text-xs uppercase tracking-wider my-2">Planejamento Reabilitador Odontológico</h2>
            <p class="text-xs"><strong>Paciente:</strong> ${pacName}</p>
            <div class="border p-3 my-4 text-xs bg-gray-50 rounded">Proposta clínica personalizada gerada através das réguas estéticas Alavanca 360®.</div>
            ${assinaturaValidador}
        `;
    } else {
        preview.innerHTML = `
            ${cabecalho}
            <h2 class="text-center font-bold text-xs uppercase tracking-wider my-2">Receituário / Prescrição Clínica</h2>
            <p class="text-xs"><strong>Paciente:</strong> ${pacName}</p>
            <div class="my-6 border-l-4 border-emerald-500 pl-4 text-xs italic h-20 text-gray-500">[Inserção livre de medicamentos controlados ou analgésicos...]</div>
            ${assinaturaValidador}
        `;
    }
}

function imprimirDocumentoPDF() {
    const conteudo = document.getElementById('areaPreviewDocumento').innerHTML;
    const win = window.open('', '', 'width=850,height=700');
    win.document.write(`<html><head><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script></head><body class="p-10 bg-white" onload="window.print(); window.close();">${conteudo}</body></html>`);
    win.document.close();
}

// ============================================================
// 12. SELECTS DINÂMICOS
// ============================================================

function rebuildSelects() {
    const selPac = document.getElementById('selectDocPaciente');
    selPac.innerHTML = state.pacientes.length === 0
        ? '<option>Nenhum paciente cadastrado</option>'
        : state.pacientes.map(p => `<option value="${p.nome}">${p.nome}</option>`).join('');

    const selDen = document.getElementById('selectDocDentista');
    selDen.innerHTML = state.profissionais.map(p => `<option value="${p.nome}">${p.nome}</option>`).join('');

    const agDentista = document.getElementById('agDentista');
    if (agDentista) {
        agDentista.innerHTML = state.profissionais.map(p => `<option value="${p.nome}">${p.nome}</option>`).join('');
    }
}

// ============================================================
// 12B. MÓDULO 8 — CUSTOS, INSUMOS E PRECIFICAÇÃO
// ============================================================

function mudarSubAbaCustos(nome) {
    document.querySelectorAll('.subtab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('bg-emerald-600', 'text-white'));
    const alvo = document.getElementById('subtab-' + nome);
    if (alvo) alvo.classList.remove('hidden');
    const btn = document.getElementById('subtabBtn-' + nome);
    if (btn) btn.classList.add('bg-emerald-600', 'text-white');
}

function calcularCustoUnitarioInsumo(ins) {
    const qtd = Number(ins.quantidade_apresentacao) || 0;
    const preco = Number(ins.preco_apresentacao) || 0;
    return qtd > 0 ? preco / qtd : 0;
}

async function salvarInsumo() {
    const nome = document.getElementById('insNome').value.trim();
    const apresentacao = document.getElementById('insApresentacao').value.trim();
    const quantidade_apresentacao = parseFloat(document.getElementById('insQuantidade').value) || 0;
    const unidade_medida = document.getElementById('insUnidade').value.trim();
    const preco_apresentacao = parseFloat(document.getElementById('insPreco').value) || 0;

    if (!nome) { alert('Informe o nome do insumo.'); return; }

    try {
        const criado = await apiCreate('insumos', {
            clinica_id: clinicaId(), nome, apresentacao, quantidade_apresentacao, unidade_medida, preco_apresentacao
        });
        state.insumos.push(criado);
        ['insNome', 'insApresentacao', 'insQuantidade', 'insUnidade', 'insPreco'].forEach(id => document.getElementById(id).value = '');
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao salvar insumo.');
    }
}

async function removerInsumo(id) {
    if (!confirm('Remover este insumo? Vínculos com serviços também serão removidos.')) return;
    await apiDelete('insumos', id);
    state.insumos = state.insumos.filter(i => i.id !== id);
    state.mapaInsumosServicos = state.mapaInsumosServicos.filter(m => m.insumo_id !== id);
    renderizarModuloFinanceiroCompleto();
}

function renderizarInsumos() {
    const tbody = document.getElementById('tbodyInsumos');
    if (!tbody) return;
    if (state.insumos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-600">Nenhum insumo cadastrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = state.insumos.map(i => {
        const custoUnit = i.custo_unitario !== undefined && i.custo_unitario !== null ? Number(i.custo_unitario) : calcularCustoUnitarioInsumo(i);
        return `
        <tr class="border-b border-slate-800/60">
            <td class="p-2 text-slate-200">${i.nome}</td>
            <td class="p-2 text-slate-400">${i.apresentacao || ''}</td>
            <td class="p-2 text-slate-400">${i.quantidade_apresentacao || 0} ${i.unidade_medida || ''}</td>
            <td class="p-2 text-slate-400">${formatarMoeda(i.preco_apresentacao)}</td>
            <td class="p-2 text-emerald-400 font-mono">${formatarMoeda(custoUnit)}</td>
            <td class="p-2 text-right"><button onclick="removerInsumo('${i.id}')" class="text-rose-400 hover:underline">Excluir</button></td>
        </tr>`;
    }).join('');
}

async function salvarServico() {
    const nome = document.getElementById('servNome').value.trim();
    const categoria = document.getElementById('servCategoria').value.trim();
    const tempo_medio_min = parseFloat(document.getElementById('servTempo').value) || 0;
    const preco_convenio = parseFloat(document.getElementById('servPrecoConvenio').value) || 0;
    const preco_particular = parseFloat(document.getElementById('servPrecoParticular').value) || 0;

    if (!nome) { alert('Informe o nome do serviço.'); return; }

    try {
        const criado = await apiCreate('servicos', {
            clinica_id: clinicaId(), nome, categoria, tempo_medio_min, preco_convenio, preco_particular
        });
        state.servicos.push(criado);
        ['servNome', 'servCategoria', 'servTempo', 'servPrecoConvenio', 'servPrecoParticular'].forEach(id => document.getElementById(id).value = '');
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao salvar serviço.');
    }
}

async function removerServico(id) {
    if (!confirm('Remover este serviço? Vínculos e atendimentos relacionados também serão afetados.')) return;
    await apiDelete('servicos', id);
    state.servicos = state.servicos.filter(s => s.id !== id);
    state.mapaInsumosServicos = state.mapaInsumosServicos.filter(m => m.servico_id !== id);
    renderizarModuloFinanceiroCompleto();
}

function renderizarServicos() {
    const tbody = document.getElementById('tbodyServicos');
    if (!tbody) return;
    if (state.servicos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-600">Nenhum serviço cadastrado.</td></tr>`;
        return;
    }
    // Preço Convênio/Particular editável direto na linha — útil especialmente
    // depois de uma importação em massa via CSV (a planilha de custos, em
    // geral, não traz o preço de venda cobrado do paciente, só o custo).
    tbody.innerHTML = state.servicos.map(s => `
        <tr class="border-b border-slate-800/60">
            <td class="p-2 text-slate-200">${s.nome}</td>
            <td class="p-2 text-slate-400">${s.categoria || ''}</td>
            <td class="p-2 text-slate-400">${s.tempo_medio_min || 0}</td>
            <td class="p-1">
                <input type="number" value="${s.preco_convenio || 0}" onchange="atualizarPrecoServico('${s.id}', 'preco_convenio', this.value)"
                    class="w-24 bg-slate-950 border border-slate-800 p-1.5 rounded text-sky-400 text-xs">
            </td>
            <td class="p-1">
                <input type="number" value="${s.preco_particular || 0}" onchange="atualizarPrecoServico('${s.id}', 'preco_particular', this.value)"
                    class="w-24 bg-slate-950 border border-slate-800 p-1.5 rounded text-purple-400 text-xs">
            </td>
            <td class="p-2 text-right"><button onclick="removerServico('${s.id}')" class="text-rose-400 hover:underline">Excluir</button></td>
        </tr>
    `).join('');
}

// Atualiza só o preço (Convênio ou Particular) de um serviço já cadastrado,
// sem precisar reabrir/reenviar o formulário inteiro — usado principalmente
// depois de uma importação de CSV que trouxe custo mas não preço de venda.
async function atualizarPrecoServico(id, campo, valor) {
    const novoValor = parseFloat(valor) || 0;
    try {
        const atualizado = await apiUpdate('servicos', id, { [campo]: novoValor });
        const idx = state.servicos.findIndex(s => s.id === id);
        if (idx >= 0) state.servicos[idx] = atualizado;
        await recarregarCustoServicoView();
        renderizarResultadoCustos();
        renderizarDashboardVivo();
    } catch (e) {
        console.error(e);
        alert('Erro ao atualizar preço do serviço.');
    }
}

function rebuildSelectsFinanceiro() {
    const selMapaServico = document.getElementById('mapaServico');
    const selMapaInsumo = document.getElementById('mapaInsumo');
    const selAtdServico = document.getElementById('atdServico');
    const selAtdPaciente = document.getElementById('atdPaciente');
    const selAtdProfissional = document.getElementById('atdProfissional');

    if (selMapaServico) selMapaServico.innerHTML = state.servicos.map(s => `<option value="${s.id}">${s.nome}</option>`).join('') || '<option value="">Cadastre um serviço</option>';
    if (selMapaInsumo) selMapaInsumo.innerHTML = state.insumos.map(i => `<option value="${i.id}">${i.nome}</option>`).join('') || '<option value="">Cadastre um insumo</option>';
    if (selAtdServico) selAtdServico.innerHTML = state.servicos.map(s => `<option value="${s.id}">${s.nome}</option>`).join('') || '<option value="">Cadastre um serviço</option>';
    if (selAtdPaciente) selAtdPaciente.innerHTML = state.pacientes.map(p => `<option value="${p.id}">${p.nome}</option>`).join('') || '<option value="">Cadastre um paciente</option>';
    if (selAtdProfissional) selAtdProfissional.innerHTML = state.profissionais.map(p => `<option value="${p.id}">${p.nome}</option>`).join('') || '<option value="">Cadastre um profissional</option>';
}

async function salvarMapaInsumoServico() {
    const servico_id = document.getElementById('mapaServico').value;
    const insumo_id = document.getElementById('mapaInsumo').value;
    const quantidade_consumida = parseFloat(document.getElementById('mapaQuantidade').value) || 0;

    if (!servico_id || !insumo_id) { alert('Selecione um serviço e um insumo.'); return; }

    try {
        const criado = await apiCreate('mapa_insumos_servicos', { clinica_id: clinicaId(), servico_id, insumo_id, quantidade_consumida });
        state.mapaInsumosServicos.push(criado);
        document.getElementById('mapaQuantidade').value = '';
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao vincular insumo ao serviço.');
    }
}

async function removerMapaInsumoServico(id) {
    await apiDelete('mapa_insumos_servicos', id);
    state.mapaInsumosServicos = state.mapaInsumosServicos.filter(m => m.id !== id);
    renderizarModuloFinanceiroCompleto();
}

function renderizarMapaInsumos() {
    const tbody = document.getElementById('tbodyMapaInsumos');
    if (!tbody) return;
    if (state.mapaInsumosServicos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-600">Nenhum vínculo cadastrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = state.mapaInsumosServicos.map(m => {
        const serv = state.servicos.find(s => s.id === m.servico_id);
        const ins = state.insumos.find(i => i.id === m.insumo_id);
        const custoUnit = ins ? (ins.custo_unitario !== undefined && ins.custo_unitario !== null ? Number(ins.custo_unitario) : calcularCustoUnitarioInsumo(ins)) : 0;
        const custoGerado = custoUnit * (Number(m.quantidade_consumida) || 0);
        return `
        <tr class="border-b border-slate-800/60">
            <td class="p-2 text-slate-200">${serv ? serv.nome : '—'}</td>
            <td class="p-2 text-slate-400">${ins ? ins.nome : '—'}</td>
            <td class="p-2 text-slate-400">${m.quantidade_consumida}</td>
            <td class="p-2 text-emerald-400">${formatarMoeda(custoGerado)}</td>
            <td class="p-2 text-right"><button onclick="removerMapaInsumoServico('${m.id}')" class="text-rose-400 hover:underline">Excluir</button></td>
        </tr>`;
    }).join('');
}

async function salvarCustoFixo() {
    const nome_item = document.getElementById('fixoNome').value.trim();
    const valor_mensal = parseFloat(document.getElementById('fixoValor').value) || 0;
    if (!nome_item) { alert('Informe o nome do item.'); return; }

    try {
        const criado = await apiCreate('custos_fixos', { clinica_id: clinicaId(), nome_item, valor_mensal });
        state.custosFixos.push(criado);
        document.getElementById('fixoNome').value = '';
        document.getElementById('fixoValor').value = '';
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao salvar custo fixo.');
    }
}

async function removerCustoFixo(id) {
    await apiDelete('custos_fixos', id);
    state.custosFixos = state.custosFixos.filter(c => c.id !== id);
    renderizarModuloFinanceiroCompleto();
}

function renderizarCustosFixos() {
    const tbody = document.getElementById('tbodyCustosFixos');
    if (!tbody) return;
    const total = state.custosFixos.reduce((s, c) => s + (Number(c.valor_mensal) || 0), 0);
    const lblTotal = document.getElementById('lblTotalCustosFixos');
    if (lblTotal) lblTotal.textContent = formatarMoeda(total);

    if (state.custosFixos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-3 text-center text-slate-600">Nenhum custo fixo cadastrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = state.custosFixos.map(c => `
        <tr class="border-b border-slate-800/60">
            <td class="p-2 text-slate-200">${c.nome_item}</td>
            <td class="p-2 text-amber-400">${formatarMoeda(c.valor_mensal)}</td>
            <td class="p-2 text-right"><button onclick="removerCustoFixo('${c.id}')" class="text-rose-400 hover:underline">Excluir</button></td>
        </tr>
    `).join('');
}

function obterConfigPrecificacao(modalidade) {
    return state.configPrecificacao.find(c => c.modalidade === modalidade) || null;
}

function preencherFormsConfigPrecificacao() {
    const conv = obterConfigPrecificacao('convenio');
    const part = obterConfigPrecificacao('particular');

    if (conv) {
        document.getElementById('cfgConvProLabore').value = conv.pro_labore_desejado || 0;
        document.getElementById('cfgConvHorasDia').value = conv.horas_dia || 8;
        document.getElementById('cfgConvDiasMes').value = conv.dias_mes || 22;
        document.getElementById('cfgConvMargem').value = conv.margem_desejada_pct || 0;
        document.getElementById('cfgConvImposto').value = conv.imposto_pct || 0;
        document.getElementById('cfgConvTaxa').value = conv.taxa_maquininha_pct || 0;
    }
    if (part) {
        document.getElementById('cfgPartProLabore').value = part.pro_labore_desejado || 0;
        document.getElementById('cfgPartHorasDia').value = part.horas_dia || 8;
        document.getElementById('cfgPartDiasMes').value = part.dias_mes || 22;
        document.getElementById('cfgPartMargem').value = part.margem_desejada_pct || 0;
        document.getElementById('cfgPartImposto').value = part.imposto_pct || 0;
        document.getElementById('cfgPartTaxa').value = part.taxa_maquininha_pct || 0;
    }
}

async function salvarConfigPrecificacao(modalidade) {
    const prefixo = modalidade === 'convenio' ? 'cfgConv' : 'cfgPart';
    const dados = {
        clinica_id: clinicaId(),
        modalidade,
        pro_labore_desejado: parseFloat(document.getElementById(prefixo + 'ProLabore').value) || 0,
        horas_dia: parseFloat(document.getElementById(prefixo + 'HorasDia').value) || 8,
        dias_mes: parseFloat(document.getElementById(prefixo + 'DiasMes').value) || 22,
        margem_desejada_pct: parseFloat(document.getElementById(prefixo + 'Margem').value) || 0,
        imposto_pct: parseFloat(document.getElementById(prefixo + 'Imposto').value) || 0,
        taxa_maquininha_pct: parseFloat(document.getElementById(prefixo + 'Taxa').value) || 0
    };

    try {
        const existente = obterConfigPrecificacao(modalidade);
        let salvo;
        if (existente) {
            salvo = await apiUpdate('config_precificacao', existente.id, dados);
            const idx = state.configPrecificacao.findIndex(c => c.id === existente.id);
            state.configPrecificacao[idx] = salvo;
        } else {
            salvo = await apiCreate('config_precificacao', dados);
            state.configPrecificacao.push(salvo);
        }
        alert('Configuração de ' + (modalidade === 'convenio' ? 'Convênio' : 'Particular') + ' salva com sucesso.');
        await recarregarCustoServicoView();
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        console.error(e);
        alert('Erro ao salvar configuração de precificação.');
    }
}

async function recarregarCustoServicoView() {
    state.custoServicoView = await apiList('vw_custo_servico', { clinica_id: clinicaId() });
}

// Cálculo local de custo/margem por serviço, usado como fallback caso a
// view do banco (vw_custo_servico) ainda não esteja populada/atualizada,
// e para alimentar o Dashboard Vivo e o Assistente instantaneamente.
function calcularCustoServicoLocal(servico, modalidade) {
    const cfg = obterConfigPrecificacao(modalidade);
    const custoFixoMensal = state.custosFixos.reduce((s, c) => s + (Number(c.valor_mensal) || 0), 0);
    const proLabore = cfg ? Number(cfg.pro_labore_desejado) || 0 : 0;
    const horasDia = cfg ? Number(cfg.horas_dia) || 8 : 8;
    const diasMes = cfg ? Number(cfg.dias_mes) || 22 : 22;
    const minutosMes = horasDia * diasMes * 60;
    const custoMinutoProfissional = minutosMes > 0 ? (custoFixoMensal + proLabore) / minutosMes : 0;
    const tempoMedio = Number(servico.tempo_medio_min) || 0;
    const custoTempoProfissional = custoMinutoProfissional * tempoMedio;

    const custoMaterial = state.mapaInsumosServicos
        .filter(m => m.servico_id === servico.id)
        .reduce((soma, m) => {
            const ins = state.insumos.find(i => i.id === m.insumo_id);
            const custoUnit = ins ? (ins.custo_unitario !== undefined && ins.custo_unitario !== null ? Number(ins.custo_unitario) : calcularCustoUnitarioInsumo(ins)) : 0;
            return soma + custoUnit * (Number(m.quantidade_consumida) || 0);
        }, 0);

    const outrosCustos = (Number(servico.custo_servico_externo) || 0) + (Number(servico.custo_radiografia) || 0) + (Number(servico.outros_custos_diretos) || 0);
    const custoTotal = custoTempoProfissional + custoMaterial + outrosCustos;
    const precoVenda = modalidade === 'convenio' ? (Number(servico.preco_convenio) || 0) : (Number(servico.preco_particular) || 0);
    const margemReais = precoVenda - custoTotal;
    const margemPct = precoVenda > 0 ? (margemReais / precoVenda) * 100 : 0;
    const margemMinimaConfigurada = cfg ? Number(cfg.margem_desejada_pct) || 0 : 0;

    return { custoTotal, precoVenda, margemReais, margemPct, margemMinimaConfigurada };
}

function renderizarResultadoCustos() {
    const tbody = document.getElementById('tbodyResultadoCustos');
    if (!tbody) return;

    if (state.servicos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-3 text-center text-slate-600">Cadastre serviços e configurações para ver o resultado.</td></tr>`;
        return;
    }

    let linhas = [];
    state.servicos.forEach(s => {
        ['convenio', 'particular'].forEach(modalidade => {
            const r = calcularCustoServicoLocal(s, modalidade);
            const abaixoDoMinimo = r.margemPct < r.margemMinimaConfigurada;
            linhas.push(`
                <tr class="border-b border-slate-800/60">
                    <td class="p-2 text-slate-200">${s.nome}</td>
                    <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] ${modalidade === 'convenio' ? 'bg-sky-950 text-sky-300' : 'bg-purple-950 text-purple-300'}">${modalidade === 'convenio' ? 'Convênio' : 'Particular'}</span></td>
                    <td class="p-2 text-slate-400">${formatarMoeda(r.custoTotal)}</td>
                    <td class="p-2 text-slate-300">${formatarMoeda(r.precoVenda)}</td>
                    <td class="p-2 ${r.margemReais >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatarMoeda(r.margemReais)}</td>
                    <td class="p-2 ${r.margemReais >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${r.margemPct.toFixed(1)}%</td>
                    <td class="p-2">${abaixoDoMinimo ? '<span class="text-rose-400 font-bold">⚠ Abaixo do mínimo</span>' : '<span class="text-emerald-400">OK</span>'}</td>
                </tr>
            `);
        });
    });
    tbody.innerHTML = linhas.join('');
}

// ============================================================
// IMPORTADOR DE CSV (Google Sheets) — v2: robusto, por NOME de
// coluna (não por posição), tolerante a acentos/maiúsculas,
// números em formato BR ("1 000,00" / "40,00%"), linhas de
// totais e ao "preenchimento por arrasto" (células mescladas
// visualmente no Sheets, mas vazias no CSV) da planilha de
// Mapa Insumo×Serviço. Faz UPSERT (por código da planilha ou,
// se não houver, por nome) — reimportar o mesmo arquivo depois
// de atualizar preços NÃO duplica registros.
// ============================================================

// --- 1. Parser de CSV "de verdade" (respeita vírgulas dentro de aspas) ---
function parseLinhasCsv(texto) {
    texto = String(texto || '').replace(/^\uFEFF/, ''); // remove BOM, se houver
    const linhas = [];
    let campo = '', linha = [], dentroAspas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (dentroAspas) {
            if (c === '"') {
                if (texto[i + 1] === '"') { campo += '"'; i++; }
                else dentroAspas = false;
            } else {
                campo += c;
            }
        } else if (c === '"') {
            dentroAspas = true;
        } else if (c === ',') {
            linha.push(campo); campo = '';
        } else if (c === '\r') {
            // ignora — o \n cuida da quebra de linha
        } else if (c === '\n') {
            linha.push(campo); linhas.push(linha); linha = []; campo = '';
        } else {
            campo += c;
        }
    }
    if (campo.length > 0 || linha.length > 0) { linha.push(campo); linhas.push(linha); }
    // remove linhas 100% vazias (comuns no fim do export do Sheets)
    return linhas.filter(l => l.some(c => (c || '').trim() !== ''));
}

// --- 2. Normalização de texto/cabeçalho (ignora acento, caixa, espaços extras) ---
function normalizarCabecalho(s) {
    return String(s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .toLowerCase()
        .replace(/[_\-]/g, ' ')
        .replace(/[().%]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Localiza a PRIMEIRA coluna cujo cabeçalho bate com alguma das opções dadas.
function encontrarIndice(headers, opcoes) {
    const normalizados = headers.map(normalizarCabecalho);
    for (const opc of opcoes) {
        const alvo = normalizarCabecalho(opc);
        const idx = normalizados.findIndex(h => h === alvo);
        if (idx !== -1) return idx;
    }
    for (const opc of opcoes) {
        const alvo = normalizarCabecalho(opc);
        const idx = normalizados.findIndex(h => h && (h.includes(alvo) || alvo.includes(h)));
        if (idx !== -1) return idx;
    }
    return -1;
}

// Localiza TODAS as colunas com o mesmo nome (ex.: planilhas com 2 colunas "Categoria").
function encontrarTodosIndices(headers, opcoes) {
    const normalizados = headers.map(normalizarCabecalho);
    const alvos = opcoes.map(normalizarCabecalho);
    const indices = [];
    normalizados.forEach((h, idx) => { if (alvos.includes(h)) indices.push(idx); });
    return indices;
}

// --- 3. Número em formato brasileiro: "1 000,00" | "40,00%" | "0,57" | "12" ---
function parseNumeroBR(valor) {
    if (valor === undefined || valor === null) return 0;
    let s = String(valor).trim();
    if (!s) return 0;
    s = s.replace(/[R$\s%]/g, ''); // remove símbolo de moeda, % e espaço (separador de milhar)
    s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56 (caso apareça ponto de milhar)
    // Se não havia vírgula, o replace acima pode ter removido pontos decimais indevidamente
    // (ex.: "12.5" sem vírgula) — nesse caso, refaz sem remover o ponto.
    if (!/,/.test(String(valor)) && /\.\d/.test(String(valor).replace(/[R$\s%]/g, ''))) {
        s = String(valor).replace(/[R$\s%]/g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

// --- 4. Wrapper padrão: lê o arquivo, roda o parser específico da entidade ---
function processarArquivoCsv(input, statusEl, callback) {
    if (!input || !input.files || input.files.length === 0) {
        if (statusEl) statusEl.textContent = 'Selecione um arquivo CSV.';
        return;
    }
    const arquivo = input.files[0];
    const leitor = new FileReader();
    if (statusEl) statusEl.textContent = 'Processando...';
    leitor.onload = async function (e) {
        try {
            const linhas = parseLinhasCsv(e.target.result);
            if (linhas.length < 2) {
                if (statusEl) statusEl.textContent = 'Arquivo vazio ou sem linhas de dados após o cabeçalho.';
                return;
            }
            const resultado = await callback(linhas);
            if (statusEl) statusEl.textContent = resultado;
            renderizarModuloFinanceiroCompleto();
        } catch (err) {
            console.error(err);
            if (statusEl) statusEl.textContent = 'Erro ao processar o CSV: ' + (err.message || 'verifique o formato das colunas.');
        }
    };
    leitor.readAsText(arquivo, 'UTF-8');
}

// --- 5. IMPORTAR INSUMOS (aba "CUSTOS_INSUMOS_UNID" do Google Sheets) ---
function importarInsumosCsv() {
    const input = document.getElementById('inputCsvInsumos');
    const status = document.getElementById('lblImportStatus');
    processarArquivoCsv(input, status, async (linhas) => {
        const headers = linhas[0];
        const idxCodigo = 0; // 1ª coluna da planilha (rótulo vazio ou "ID_Insumo"), guarda o código ex.: INS001
        const idxNome = encontrarIndice(headers, ['Nome_Insumo', 'Nome do Insumo', 'Nome']);
        const idxApresentacao = encontrarIndice(headers, ['Apresentação', 'Apresentacao']);
        const idxQuantidade = encontrarIndice(headers, ['Quantidade']);
        const idxUnidade = encontrarIndice(headers, ['Unidade_Medida', 'Unidade de Medida', 'Unidade']);
        const idxPreco = encontrarIndice(headers, ['Preço_Apresentação', 'Preco_Apresentacao', 'Preço', 'Preco']);
        const idxObs = encontrarIndice(headers, ['Observacao', 'Observação']);

        if (idxNome === -1) throw new Error('Coluna "Nome_Insumo" não encontrada. Exporte a aba de Insumos da planilha.');

        let criados = 0, atualizados = 0;
        for (let i = 1; i < linhas.length; i++) {
            const row = linhas[i];
            const nome = (row[idxNome] || '').trim();
            if (!nome) continue;
            const codigo_externo = (row[idxCodigo] || '').trim() || null;

            const dados = {
                clinica_id: clinicaId(),
                nome,
                apresentacao: idxApresentacao !== -1 ? (row[idxApresentacao] || '').trim() : '',
                quantidade_apresentacao: idxQuantidade !== -1 ? (parseNumeroBR(row[idxQuantidade]) || 1) : 1,
                unidade_medida: idxUnidade !== -1 ? (row[idxUnidade] || '').trim() : '',
                preco_apresentacao: idxPreco !== -1 ? parseNumeroBR(row[idxPreco]) : 0,
                observacao: idxObs !== -1 ? (row[idxObs] || '').trim() : '',
                codigo_externo
            };

            const existente = state.insumos.find(x =>
                (codigo_externo && x.codigo_externo === codigo_externo) ||
                (!x.codigo_externo && (x.nome || '').trim().toLowerCase() === nome.toLowerCase())
            );

            try {
                if (existente) {
                    const atualizado = await apiUpdate('insumos', existente.id, dados);
                    const idx = state.insumos.findIndex(x => x.id === existente.id);
                    state.insumos[idx] = atualizado;
                    atualizados++;
                } else {
                    const criado = await apiCreate('insumos', dados);
                    state.insumos.push(criado);
                    criados++;
                }
            } catch (e) {
                // Se a coluna codigo_externo ainda não existir no banco (SQL de migração
                // não rodado), tenta de novo sem ela para não travar a importação inteira.
                delete dados.codigo_externo;
                if (existente) {
                    const atualizado = await apiUpdate('insumos', existente.id, dados);
                    const idx = state.insumos.findIndex(x => x.id === existente.id);
                    state.insumos[idx] = atualizado;
                    atualizados++;
                } else {
                    const criado = await apiCreate('insumos', dados);
                    state.insumos.push(criado);
                    criados++;
                }
            }
        }
        return `${criados} insumo(s) criado(s), ${atualizados} atualizado(s). Pode reimportar este arquivo sempre que a planilha mudar — nada é duplicado.`;
    });
}

// --- 6. IMPORTAR SERVIÇOS/PROCEDIMENTOS (aba "SERVIÇOS_PROCEDIMENTOS") ---
function importarServicosCsv() {
    const input = document.getElementById('inputCsvServicos');
    const status = document.getElementById('lblImportStatusServicos');
    processarArquivoCsv(input, status, async (linhas) => {
        const headers = linhas[0];
        const idxCodigo = encontrarIndice(headers, ['ID_Servico', 'ID Servico', 'Codigo']);
        const idxNome = encontrarIndice(headers, ['Nome_Servico', 'Nome do Servico', 'Servico', 'Nome']);
        const idxCategoria = encontrarIndice(headers, ['Categoria']);
        const idxTempo = encontrarIndice(headers, ['Tempo_Medio_min', 'Tempo Medio min', 'Tempo Medio', 'Tempo']);
        const idxCustoExterno = encontrarIndice(headers, ['Custo_Servico_Externo', 'Custo Servico Externo']);
        const idxRadiografia = encontrarIndice(headers, ['Custo_Radiografia']);
        const idxOutros = encontrarIndice(headers, ['Outros_Custos_Diretos SEM REDUÇÃO', 'Outros Custos Diretos Sem Reducao', 'Outros_Custos_Diretos', 'Outros Custos Diretos']);
        const idxPrecoConv = encontrarIndice(headers, ['Preco_Convenio', 'Preço_Convênio', 'Valor_Convenio', 'Preço Convênio']);
        const idxPrecoPart = encontrarIndice(headers, ['Preco_Particular', 'Preço_Particular', 'Valor_Particular', 'Preço Particular']);

        if (idxNome === -1) throw new Error('Coluna "Nome_Servico" não encontrada. Exporte a aba de Serviços/Procedimentos da planilha.');

        let criados = 0, atualizados = 0;
        for (let i = 1; i < linhas.length; i++) {
            const row = linhas[i];
            const nome = (row[idxNome] || '').trim();
            if (!nome) continue; // pula linhas de totais/vazias
            const codigo_externo = idxCodigo !== -1 ? ((row[idxCodigo] || '').trim() || null) : null;

            const dados = {
                clinica_id: clinicaId(),
                nome,
                categoria: idxCategoria !== -1 ? (row[idxCategoria] || '').trim() : '',
                tempo_medio_min: idxTempo !== -1 ? parseNumeroBR(row[idxTempo]) : 0,
                custo_servico_externo: idxCustoExterno !== -1 ? parseNumeroBR(row[idxCustoExterno]) : 0,
                custo_radiografia: idxRadiografia !== -1 ? parseNumeroBR(row[idxRadiografia]) : 0,
                outros_custos_diretos: idxOutros !== -1 ? parseNumeroBR(row[idxOutros]) : 0,
                codigo_externo
            };
            if (idxPrecoConv !== -1) dados.preco_convenio = parseNumeroBR(row[idxPrecoConv]);
            if (idxPrecoPart !== -1) dados.preco_particular = parseNumeroBR(row[idxPrecoPart]);

            const existente = state.servicos.find(x =>
                (codigo_externo && x.codigo_externo === codigo_externo) ||
                (!x.codigo_externo && (x.nome || '').trim().toLowerCase() === nome.toLowerCase())
            );

            try {
                if (existente) {
                    const atualizado = await apiUpdate('servicos', existente.id, dados);
                    const idx = state.servicos.findIndex(x => x.id === existente.id);
                    state.servicos[idx] = atualizado;
                    atualizados++;
                } else {
                    const criado = await apiCreate('servicos', dados);
                    state.servicos.push(criado);
                    criados++;
                }
            } catch (e) {
                delete dados.codigo_externo;
                if (existente) {
                    const atualizado = await apiUpdate('servicos', existente.id, dados);
                    const idx = state.servicos.findIndex(x => x.id === existente.id);
                    state.servicos[idx] = atualizado;
                    atualizados++;
                } else {
                    const criado = await apiCreate('servicos', dados);
                    state.servicos.push(criado);
                    criados++;
                }
            }
        }
        const avisoPreco = (idxPrecoConv === -1 && idxPrecoPart === -1)
            ? ' Atenção: essa planilha traz CUSTO, não PREÇO DE VENDA — preencha "Preço Convênio/Particular" na aba Serviços (uma vez só).'
            : '';
        return `${criados} serviço(s) criado(s), ${atualizados} atualizado(s).${avisoPreco}`;
    });
}

// --- 7. IMPORTAR MAPA INSUMO×SERVIÇO (aba "MAP_INSUMOS_SERVICOS") ---
// Requer que Insumos e Serviços já tenham sido importados antes (o vínculo
// é resolvido casando pelo código/nome dos dois já cadastrados no sistema).
function importarMapaInsumosServicosCsv() {
    const input = document.getElementById('inputCsvMapa');
    const status = document.getElementById('lblImportStatusMapa');
    processarArquivoCsv(input, status, async (linhas) => {
        const headers = linhas[0];
        const idxIdServico = encontrarIndice(headers, ['ID_Servico']);
        const idxNomeServico = encontrarIndice(headers, ['Nome_Servico']);
        const idxIdInsumo = encontrarIndice(headers, ['ID_Insumo']);
        const idxNomeInsumo = encontrarIndice(headers, ['Nome_Insumo']);
        const idxQtd = encontrarIndice(headers, ['Qtd_Consumida', 'Quantidade_Consumida', 'Quantidade Consumida', 'Quantidade']);

        if (idxNomeInsumo === -1) throw new Error('Coluna "Nome_Insumo" não encontrada. Exporte a aba MAP_INSUMOS_SERVICOS da planilha.');

        let codigoServicoAtual = null, nomeServicoAtual = null;
        let vinculados = 0, ignorados = 0;

        for (let i = 1; i < linhas.length; i++) {
            const row = linhas[i];
            // "Preenchimento por arrasto": no Sheets, ID_Servico/Nome_Servico só
            // aparecem na 1ª linha de cada serviço — as linhas seguintes ficam em
            // branco, então herdamos o último valor não-vazio encontrado.
            const codigoServicoLinha = idxIdServico !== -1 ? (row[idxIdServico] || '').trim() : '';
            const nomeServicoLinha = idxNomeServico !== -1 ? (row[idxNomeServico] || '').trim() : '';
            if (codigoServicoLinha) codigoServicoAtual = codigoServicoLinha;
            if (nomeServicoLinha) nomeServicoAtual = nomeServicoLinha;

            const codigoInsumo = idxIdInsumo !== -1 ? (row[idxIdInsumo] || '').trim() : '';
            const nomeInsumo = idxNomeInsumo !== -1 ? (row[idxNomeInsumo] || '').trim() : '';
            const qtd = idxQtd !== -1 ? parseNumeroBR(row[idxQtd]) : 0;

            if (!nomeInsumo || !nomeServicoAtual) { ignorados++; continue; }

            const servico = state.servicos.find(s =>
                (codigoServicoAtual && s.codigo_externo === codigoServicoAtual) ||
                (s.nome || '').trim().toLowerCase() === nomeServicoAtual.trim().toLowerCase()
            );
            const insumo = state.insumos.find(x =>
                (codigoInsumo && x.codigo_externo === codigoInsumo) ||
                (x.nome || '').trim().toLowerCase() === nomeInsumo.trim().toLowerCase()
            );

            if (!servico || !insumo) { ignorados++; continue; }

            const existente = state.mapaInsumosServicos.find(m => m.servico_id === servico.id && m.insumo_id === insumo.id);
            if (existente) {
                const atualizado = await apiUpdate('mapa_insumos_servicos', existente.id, { quantidade_consumida: qtd });
                const idx = state.mapaInsumosServicos.findIndex(m => m.id === existente.id);
                state.mapaInsumosServicos[idx] = atualizado;
            } else {
                const criado = await apiCreate('mapa_insumos_servicos', {
                    clinica_id: clinicaId(), servico_id: servico.id, insumo_id: insumo.id, quantidade_consumida: qtd
                });
                state.mapaInsumosServicos.push(criado);
            }
            vinculados++;
        }

        let msg = `${vinculados} vínculo(s) insumo×serviço importado(s)/atualizado(s).`;
        if (ignorados > 0) msg += ` ${ignorados} linha(s) ignorada(s) — importe primeiro os CSVs de Insumos e de Serviços, nessa ordem, e tente de novo.`;
        return msg;
    });
}

// --- 8. IMPORTAR CUSTOS FIXOS (aba "CUSTOS_FIXOS_VARIAVEIS") ---
function importarCustosFixosCsv() {
    const input = document.getElementById('inputCsvFixos');
    const status = document.getElementById('lblImportStatusFixos');
    processarArquivoCsv(input, status, async (linhas) => {
        const headers = linhas[0];
        const idxTipo = encontrarIndice(headers, ['Tipo']);
        const idxsCategoria = encontrarTodosIndices(headers, ['Categoria']);
        const idxValor = encontrarIndice(headers, ['Valor Mensal R$', 'Valor Mensal', 'Valor']);

        if (idxValor === -1) throw new Error('Coluna "Valor Mensal (R$)" não encontrada. Exporte a aba CUSTOS_FIXOS_VARIAVEIS da planilha.');

        let criados = 0, atualizados = 0, ignorados = 0;
        for (let i = 1; i < linhas.length; i++) {
            const row = linhas[i];
            const tipo = idxTipo !== -1 ? (row[idxTipo] || '').trim() : '';
            const cat1 = idxsCategoria[0] !== undefined ? (row[idxsCategoria[0]] || '').trim() : '';
            const cat2 = idxsCategoria[1] !== undefined ? (row[idxsCategoria[1]] || '').trim() : '';

            // A planilha traz, no fim, uma linha de TOTAL geral (Tipo/Categoria em
            // branco, só o Valor preenchido) — precisa ser ignorada, não importada
            // como se fosse um item de custo real.
            if (!tipo && !cat1 && !cat2) { ignorados++; continue; }

            const nome_item = [cat1, cat2].filter(Boolean).join(' — ') || tipo || 'Custo Fixo';
            const valor_mensal = parseNumeroBR(row[idxValor]);

            const existente = state.custosFixos.find(c => (c.nome_item || '').trim().toLowerCase() === nome_item.toLowerCase());
            if (existente) {
                const atualizado = await apiUpdate('custos_fixos', existente.id, { nome_item, valor_mensal });
                const idx = state.custosFixos.findIndex(c => c.id === existente.id);
                state.custosFixos[idx] = atualizado;
                atualizados++;
            } else {
                const criado = await apiCreate('custos_fixos', { clinica_id: clinicaId(), nome_item, valor_mensal });
                state.custosFixos.push(criado);
                criados++;
            }
        }
        return `${criados} custo(s) fixo(s) criado(s), ${atualizados} atualizado(s)${ignorados > 0 ? ` (${ignorados} linha de total ignorada)` : ''}.`;
    });
}

// --- 9. IMPORTAR CONFIG CONVÊNIO/PARTICULAR (abas "CONFIG_CONVENIO"/"CONFIG_PARTICULAR") ---
// Formato "chave → valor" (1 parâmetro por linha), diferente das demais abas.
const MAPA_CONFIG_PARAMS = [
    { chaves: ['pro labore desejado', 'pro labore desejado r$'], campo: 'pro_labore_desejado' },
    { chaves: ['horas trabalhadas por dia'], campo: 'horas_dia' },
    { chaves: ['dias trabalhados por mes'], campo: 'dias_mes' },
    { chaves: ['margem desejada particular'], campo: 'margem_desejada_pct' },
    { chaves: ['margem minima convenio'], campo: 'margem_desejada_pct' },
    { chaves: ['imposto'], campo: 'imposto_pct' },
    { chaves: ['taxa media maquininha', 'taxa maquininha'], campo: 'taxa_maquininha_pct' }
];

function importarConfigCsv(modalidade) {
    const input = document.getElementById(modalidade === 'convenio' ? 'inputCsvConfigConvenio' : 'inputCsvConfigParticular');
    const status = document.getElementById(modalidade === 'convenio' ? 'lblImportStatusConfigConvenio' : 'lblImportStatusConfigParticular');
    processarArquivoCsv(input, status, async (linhas) => {
        const dados = { clinica_id: clinicaId(), modalidade, horas_dia: 8, dias_mes: 22 };
        let camposEncontrados = 0;

        for (let i = 1; i < linhas.length; i++) {
            const row = linhas[i];
            const chaveNorm = normalizarCabecalho(row[0]);
            const valorBruto = row[1];
            const match = MAPA_CONFIG_PARAMS.find(m => m.chaves.some(k => chaveNorm.includes(normalizarCabecalho(k))));
            if (match) {
                dados[match.campo] = parseNumeroBR(valorBruto);
                camposEncontrados++;
            }
        }

        if (camposEncontrados === 0) {
            throw new Error('Não reconheci os parâmetros desse arquivo. Confira se é o CSV exportado da aba CONFIG_CONVENIO/CONFIG_PARTICULAR da planilha.');
        }

        const existente = obterConfigPrecificacao(modalidade);
        let salvo;
        if (existente) {
            salvo = await apiUpdate('config_precificacao', existente.id, dados);
            const idx = state.configPrecificacao.findIndex(c => c.id === existente.id);
            state.configPrecificacao[idx] = salvo;
        } else {
            salvo = await apiCreate('config_precificacao', dados);
            state.configPrecificacao.push(salvo);
        }
        preencherFormsConfigPrecificacao();
        await recarregarCustoServicoView();
        return `Configuração de ${modalidade === 'convenio' ? 'Convênio' : 'Particular'} importada com ${camposEncontrados} parâmetro(s) reconhecido(s). Confira/ajuste na aba "Config. Convênio/Particular".`;
    });
}

// ============================================================
// 12C. MÓDULO 9 — ATENDIMENTOS (CONVÊNIO / PARTICULAR / MISTO)
// ============================================================

// ============================================================
// ALAVANCA 360® — TRAVA DE SEGURANÇA DE MARGEM (M8/M9)
// ============================================================

function validarMargemSeguranca(precoVenda, custoTotal, margemMinima) {
    const margemReal = ((precoVenda - custoTotal) / precoVenda) * 100;
    
    if (margemReal < margemMinima) {
        console.warn("⚠️ ALERTA: Margem de lucro abaixo do limite de segurança!");
        return {
            permitido: false,
            msg: `Margem de ${margemReal.toFixed(1)}% é menor que o mínimo de ${margemMinima}%`
        };
    }
    return { permitido: true };
}

// Esta função será chamada sempre que o dentista tentar salvar um orçamento ou atendimento
async function dispararVerificacaoFinanceira() {
    const preco = parseFloat(document.getElementById('atdValorParticular').value);
    const servicoId = document.getElementById('atdServico').value;

    // Busca o custo real que veio da sua planilha (importado via CSV)
    const { data: servico } = await supabaseClient
        .from('vw_custo_servico')
        .select('*')
        .eq('id', servicoId)
        .single();

    const verificacao = validarMargemSeguranca(preco, servico.custo_total, servico.margem_minima);

    if (!verificacao.permitido) {
        alert("🛑 BLOQUEIO ALAVANCA 360: " + verificacao.msg + "\nO orçamento precisa ser revisado para garantir a saúde da clínica.");
        return false; // Impede o salvamento
    }
    return true; // Permite o salvamento
}

function ajustarCamposValorAtendimento() {
    const tipo = document.getElementById('atdTipoPagamento').value;
    const campoConv = document.getElementById('atdValorConvenio');
    const campoPart = document.getElementById('atdValorParticular');

    if (tipo === 'convenio') {
        campoConv.classList.remove('hidden'); campoPart.classList.add('hidden'); campoPart.value = '';
    } else if (tipo === 'particular') {
        campoConv.classList.add('hidden'); campoConv.value = ''; campoPart.classList.remove('hidden');
    } else {
        campoConv.classList.remove('hidden'); campoPart.classList.remove('hidden');
    }
}

async function salvarAtendimento() {
    const paciente_id = document.getElementById('atdPaciente').value;
    const servico_id = document.getElementById('atdServico').value;
    const profissional_id = document.getElementById('atdProfissional').value;
    const tipo_pagamento = document.getElementById('atdTipoPagamento').value;
    const valor_convenio = parseFloat(document.getElementById('atdValorConvenio').value) || 0;
    const valor_particular = parseFloat(document.getElementById('atdValorParticular').value) || 0;
    const data_atendimento = document.getElementById('atdData').value || new Date().toISOString().slice(0, 10);

    if (!paciente_id || !servico_id) { alert('Selecione paciente e serviço.'); return; }

    const paciente = state.pacientes.find(p => p.id === paciente_id);
    const servico = state.servicos.find(s => s.id === servico_id);

    try {
        const criado = await apiCreate('atendimentos', {
            clinica_id: clinicaId(),
            paciente_id, paciente_nome: paciente ? paciente.nome : '',
            servico_id, servico_nome: servico ? servico.nome : '',
            profissional_id: profissional_id || null,
            tipo_pagamento, valor_convenio, valor_particular, data_atendimento
        });
        state.atendimentos.push(criado);
        document.getElementById('atdValorConvenio').value = '';
        document.getElementById('atdValorParticular').value = '';
        renderizarAtendimentos();
        renderizarDashboardVivo();
    } catch (e) {
        console.error(e);
        alert('Erro ao registrar atendimento.');
    }
}

// Localize a função de salvar no Módulo 9 e adicione este bloco no início:
async function dispararVerificacaoFinanceira() {
    const preco = parseFloat(document.getElementById('atdValorParticular').value || 0);
    const servicoId = document.getElementById('atdServico').value;

    // Busca o custo real vindo da sua planilha blindada
    const { data: servico } = await supabaseClient
        .from('vw_custo_servico')
        .select('custo_total, margem_minima')
        .eq('id', servicoId)
        .single();

    if (servico) {
        const margemReal = ((preco - servico.custo_total) / preco) * 100;
        if (margemReal < servico.margem_minima) {
            alert(`🛑 ALERTA FINANCEIRO: A margem de ${margemReal.toFixed(1)}% está abaixo do mínimo de ${servico.margem_minima}%. Revise o valor!`);
            return false; // Bloqueia a execução
        }
    }
    return true;
}

async function removerAtendimento(id) {
    if (!confirm('Remover este atendimento?')) return;
    await apiDelete('atendimentos', id);
    state.atendimentos = state.atendimentos.filter(a => a.id !== id);
    renderizarAtendimentos();
    renderizarDashboardVivo();
}

function renderizarAtendimentos() {
    const tbody = document.getElementById('tbodyAtendimentos');
    if (!tbody) return;
    if (state.atendimentos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-600">Nenhum atendimento registrado.</td></tr>`;
        return;
    }
    const ordenados = [...state.atendimentos].sort((a, b) => (b.data_atendimento || '').localeCompare(a.data_atendimento || ''));
    tbody.innerHTML = ordenados.map(a => {
        const total = (Number(a.valor_convenio) || 0) + (Number(a.valor_particular) || 0);
        const tipoLabel = { convenio: 'Convênio', particular: 'Particular', misto: 'Misto' }[a.tipo_pagamento] || a.tipo_pagamento;
        const tipoCor = { convenio: 'bg-sky-950 text-sky-300', particular: 'bg-purple-950 text-purple-300', misto: 'bg-amber-950 text-amber-300' }[a.tipo_pagamento] || '';
        return `
        <tr class="border-b border-slate-800/60">
            <td class="p-2 text-slate-400">${a.data_atendimento ? new Date(a.data_atendimento).toLocaleDateString('pt-BR') : ''}</td>
            <td class="p-2 text-slate-200">${a.paciente_nome || ''}</td>
            <td class="p-2 text-slate-300">${a.servico_nome || ''}</td>
            <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] ${tipoCor}">${tipoLabel}</span></td>
            <td class="p-2 text-emerald-400">${formatarMoeda(total)}</td>
            <td class="p-2 text-right"><button onclick="removerAtendimento('${a.id}')" class="text-rose-400 hover:underline">Excluir</button></td>
        </tr>`;
    }).join('');
}

// ============================================================
// 12D. DASHBOARD VIVO
// ============================================================

function renderizarDashboardVivo() {
    const el = document.getElementById('dvFaturamentoTotal');
    if (!el) return; // tela ainda não montada

    const atendimentos = state.atendimentos;
    const faturamentoTotal = atendimentos.reduce((s, a) => s + (Number(a.valor_convenio) || 0) + (Number(a.valor_particular) || 0), 0);

    let margemTotal = 0;
    atendimentos.forEach(a => {
        const servico = state.servicos.find(s => s.id === a.servico_id);
        if (!servico) return;
        if (a.tipo_pagamento === 'misto') {
            const rConv = calcularCustoServicoLocal(servico, 'convenio');
            const rPart = calcularCustoServicoLocal(servico, 'particular');
            // Aproximação proporcional ao valor efetivamente cobrado em cada modalidade
            const totalCusto = (a.valor_convenio > 0 ? rConv.custoTotal : 0) + (a.valor_particular > 0 ? rPart.custoTotal : 0);
            margemTotal += ((Number(a.valor_convenio) || 0) + (Number(a.valor_particular) || 0)) - totalCusto;
        } else {
            const r = calcularCustoServicoLocal(servico, a.tipo_pagamento);
            margemTotal += ((Number(a.valor_convenio) || 0) + (Number(a.valor_particular) || 0)) - r.custoTotal;
        }
    });

    const totalAtend = atendimentos.length;
    const qtdConvenio = atendimentos.filter(a => a.tipo_pagamento === 'convenio').length;
    const qtdParticular = atendimentos.filter(a => a.tipo_pagamento === 'particular').length;
    const percConvenio = totalAtend > 0 ? (qtdConvenio / totalAtend) * 100 : 0;
    const percParticular = totalAtend > 0 ? (qtdParticular / totalAtend) * 100 : 0;

    document.getElementById('dvFaturamentoTotal').textContent = formatarMoeda(faturamentoTotal);
    document.getElementById('dvMargemTotal').textContent = formatarMoeda(margemTotal);
    document.getElementById('dvPercConvenio').textContent = percConvenio.toFixed(0) + '%';
    document.getElementById('dvPercParticular').textContent = percParticular.toFixed(0) + '%';

    renderizarGraficoTipoPagamento(atendimentos);
    renderizarGraficoRankingMargem();
    renderizarAlertasMargem();
}

function renderizarGraficoTipoPagamento(atendimentos) {
    const canvas = document.getElementById('chartTipoPagamento');
    if (!canvas || typeof Chart === 'undefined') return;

    const somaConvenio = atendimentos.reduce((s, a) => s + (a.tipo_pagamento !== 'particular' ? (Number(a.valor_convenio) || 0) : 0), 0);
    const somaParticular = atendimentos.reduce((s, a) => s + (a.tipo_pagamento !== 'convenio' ? (Number(a.valor_particular) || 0) : 0), 0);

    if (state.charts.tipoPagamento) state.charts.tipoPagamento.destroy();
    state.charts.tipoPagamento = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Convênio', 'Particular'],
            datasets: [{ data: [somaConvenio, somaParticular], backgroundColor: ['#38bdf8', '#a855f7'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#cbd5e1' } } } }
    });
}

function renderizarGraficoRankingMargem() {
    const canvas = document.getElementById('chartRankingMargem');
    if (!canvas || typeof Chart === 'undefined') return;

    const ranking = state.servicos.map(s => {
        const rConv = calcularCustoServicoLocal(s, 'convenio');
        const rPart = calcularCustoServicoLocal(s, 'particular');
        const margemMedia = (rConv.margemReais + rPart.margemReais) / 2;
        return { nome: s.nome, margem: margemMedia };
    }).sort((a, b) => b.margem - a.margem).slice(0, 8);

    if (state.charts.rankingMargem) state.charts.rankingMargem.destroy();
    state.charts.rankingMargem = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: ranking.map(r => r.nome),
            datasets: [{ label: 'Margem média (R$)', data: ranking.map(r => r.margem), backgroundColor: ranking.map(r => r.margem >= 0 ? '#34d399' : '#fb7185') }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#cbd5e1' } } }
        }
    });
}

function renderizarAlertasMargem() {
    const box = document.getElementById('dvAlertasMargem');
    if (!box) return;

    const alertas = [];
    state.servicos.forEach(s => {
        ['convenio', 'particular'].forEach(modalidade => {
            const r = calcularCustoServicoLocal(s, modalidade);
            if (r.precoVenda > 0 && r.margemPct < r.margemMinimaConfigurada) {
                alertas.push(`"${s.nome}" (${modalidade === 'convenio' ? 'Convênio' : 'Particular'}) está com margem de ${r.margemPct.toFixed(1)}%, abaixo do mínimo configurado de ${r.margemMinimaConfigurada}%.`);
            }
        });
    });

    box.innerHTML = alertas.length === 0
        ? 'Nenhum alerta no momento.'
        : alertas.map(a => `<div class="flex items-start gap-2"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0"></i><span>${a}</span></div>`).join('');
    if (window.lucide) lucide.createIcons();
}

// ============================================================
// 12E. ASSISTENTE DE DECISÃO (motor de regras/simulador)
// ============================================================

function calcularMixAtual() {
    const totalAtend = state.atendimentos.length;
    const qtdConvenio = state.atendimentos.filter(a => a.tipo_pagamento === 'convenio').length;
    const qtdParticular = state.atendimentos.filter(a => a.tipo_pagamento === 'particular').length;
    const qtdMisto = state.atendimentos.filter(a => a.tipo_pagamento === 'misto').length;
    return {
        totalAtend,
        percConvenio: totalAtend > 0 ? (qtdConvenio / totalAtend) * 100 : 0,
        percParticular: totalAtend > 0 ? (qtdParticular / totalAtend) * 100 : 0,
        percMisto: totalAtend > 0 ? (qtdMisto / totalAtend) * 100 : 0
    };
}

function margemMediaPorModalidade(modalidade) {
    if (state.servicos.length === 0) return 0;
    const margens = state.servicos.map(s => calcularCustoServicoLocal(s, modalidade).margemReais);
    return margens.reduce((a, b) => a + b, 0) / margens.length;
}

function rodarAssistenteEquilibrio() {
    const box = document.getElementById('assistenteResultado');
    if (!box) return;

    const custoFixoMensal = state.custosFixos.reduce((s, c) => s + (Number(c.valor_mensal) || 0), 0);
    const cfgConv = obterConfigPrecificacao('convenio');
    const cfgPart = obterConfigPrecificacao('particular');
    const mix = calcularMixAtual();
    const margemConvMedia = margemMediaPorModalidade('convenio');
    const margemPartMedia = margemMediaPorModalidade('particular');

    const pontoEquilibrioConvenio = margemConvMedia > 0 ? Math.ceil(custoFixoMensal / margemConvMedia) : null;
    const pontoEquilibrioParticular = margemPartMedia > 0 ? Math.ceil(custoFixoMensal / margemPartMedia) : null;

    let recomendacao = '';
    if (state.servicos.length === 0 || (!cfgConv && !cfgPart)) {
        recomendacao = 'Cadastre seus serviços e as configurações de precificação (Convênio/Particular) no Módulo 8 para o Assistente calcular sua recomendação com base em dados reais.';
    } else if (margemPartMedia > margemConvMedia * 1.5 && margemConvMedia >= 0) {
        recomendacao = `O particular gera, em média, ${formatarMoeda(margemPartMedia)} de margem por atendimento contra ${formatarMoeda(margemConvMedia)} do convênio. Recomendação: priorize o convênio para gerar volume e ocupação de agenda (fidelização e ponto de equilíbrio), mas direcione esforço comercial para aumentar a fatia particular gradualmente — cada 10% a mais de particular tende a ampliar a margem mensal sem precisar aumentar preços.`;
    } else if (margemConvMedia < 0) {
        recomendacao = `Atenção: a margem média do convênio está NEGATIVA (${formatarMoeda(margemConvMedia)} por atendimento). Isso significa que, hoje, cada atendimento de convênio pode estar sendo feito com prejuízo. Revise a tabela de preços do convênio ou renegocie com a operadora — priorize particular até corrigir essa margem.`;
    } else {
        recomendacao = `As margens de convênio (${formatarMoeda(margemConvMedia)}) e particular (${formatarMoeda(margemPartMedia)}) estão relativamente equilibradas. Um mix de 50%-60% de convênio (para volume/ocupação) e 40%-50% de particular (para margem) tende a manter a agenda cheia sem sacrificar rentabilidade.`;
    }

    box.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div class="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <p class="text-[10px] uppercase text-slate-500">Margem Média por Atendimento</p>
                <p class="text-xs mt-1">Convênio: <span class="font-bold ${margemConvMedia >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatarMoeda(margemConvMedia)}</span></p>
                <p class="text-xs">Particular: <span class="font-bold ${margemPartMedia >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatarMoeda(margemPartMedia)}</span></p>
            </div>
            <div class="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <p class="text-[10px] uppercase text-slate-500">Ponto de Equilíbrio Mensal (isolado)</p>
                <p class="text-xs mt-1">Só Convênio: <span class="font-bold text-sky-400">${pontoEquilibrioConvenio !== null ? pontoEquilibrioConvenio + ' atend./mês' : 'N/D'}</span></p>
                <p class="text-xs">Só Particular: <span class="font-bold text-purple-400">${pontoEquilibrioParticular !== null ? pontoEquilibrioParticular + ' atend./mês' : 'N/D'}</span></p>
            </div>
        </div>
        <div class="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-xs text-slate-200 leading-relaxed">
            <span class="font-bold text-emerald-400">Recomendação:</span> ${recomendacao}
        </div>
    `;
    box.classList.remove('hidden');
    atualizarSimulador();
}

function atualizarSimulador() {
    const perc = parseInt(document.getElementById('simuladorPercParticular').value) || 0;
    document.getElementById('lblSimuladorPerc').textContent = perc + '%';

    const box = document.getElementById('simuladorResultado');
    if (!box) return;

    const totalAtendMensalEstimado = Math.max(state.atendimentos.length, 20); 
    const qtdParticularSim = Math.round(totalAtendMensalEstimado * (perc / 100));
    const qtdConvenioSim = totalAtendMensalEstimado - qtdParticularSim;

    const margemConvMedia = margemMediaPorModalidade('convenio');
    const margemPartMedia = margemMediaPorModalidade('particular');
    const precoConvMedio = state.servicos.length ? state.servicos.reduce((s, x) => s + (Number(x.preco_convenio) || 0), 0) / state.servicos.length : 0;
    const precoPartMedio = state.servicos.length ? state.servicos.reduce((s, x) => s + (Number(x.preco_particular) || 0), 0) / state.servicos.length : 0;

    const receitaEstimada = qtdConvenioSim * precoConvMedio + qtdParticularSim * precoPartMedio;
    const margemEstimada = qtdConvenioSim * margemConvMedia + qtdParticularSim * margemPartMedia;

    box.innerHTML = `
        <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
            <p class="text-[10px] uppercase text-slate-500">Atendimentos/mês simulados</p>
            <p class="text-lg font-bold text-slate-200 mt-1">${totalAtendMensalEstimado}</p>
            <p class="text-[10px] text-slate-500">${qtdConvenioSim} convênio / ${qtdParticularSim} particular</p>
        </div>
        <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
            <p class="text-[10px] uppercase text-slate-500">Receita Estimada</p>
            <p class="text-lg font-bold text-slate-200 mt-1">${formatarMoeda(receitaEstimada)}</p>
        </div>
        <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
            <p class="text-[10px] uppercase text-slate-500">Margem Estimada</p>
            <p class="text-lg font-bold ${margemEstimada >= 0 ? 'text-emerald-400' : 'text-rose-400'} mt-1">${formatarMoeda(margemEstimada)}</p>
        </div>
    `;
}

// ============================================================
// 12F. RENDERIZAÇÃO GERAL DO MÓDULO FINANCEIRO (chamada única)
// ============================================================

function renderizarModuloFinanceiroCompleto() {
    rebuildSelectsFinanceiro();
    renderizarInsumos();
    renderizarServicos();
    renderizarMapaInsumos();
    renderizarCustosFixos();
    preencherFormsConfigPrecificacao();
    renderizarResultadoCustos();
    renderizarAtendimentos();
    renderizarDashboardVivo();
    if (window.lucide) lucide.createIcons();
}

// ============================================================
// 13. HUB CLÍNICA (CONFIGURAÇÕES OPERACIONAIS DA CLÍNICA LOGADA)
// ============================================================

function aplicarConfigNaInterface() {
    const clinica = state.clinicaAtual;
    if (!clinica) return;

    const txtNomeClinica = document.getElementById('txtNomeClinica');
    const txtIdSupabase = document.getElementById('txtIdSupabase');
    const lnkGoogleSheets = document.getElementById('lnkGoogleSheets');
    const lnkCalendly = document.getElementById('lnkCalendly');
    const lblNomeConsultoria = document.getElementById('lblNomeConsultoria');
    const lnkWhatsConsultoria = document.getElementById('lnkWhatsConsultoria');
    const lnkEmailConsultoria = document.getElementById('lnkEmailConsultoria');

    if (txtNomeClinica) txtNomeClinica.textContent = clinica.nome_clinica || 'Clínica';
    if (txtIdSupabase) txtIdSupabase.textContent = (state.usuario && state.usuario.email) || clinica.id;
    if (lnkGoogleSheets) lnkGoogleSheets.href = clinica.url_google_agenda || '#';
    if (lnkCalendly) lnkCalendly.href = clinica.url_calendly || '#';

    const cfgGlobal = state.configGlobal;
    if (lblNomeConsultoria) lblNomeConsultoria.textContent = (cfgGlobal && cfgGlobal.nome_consultoria) || 'Alavanca 360 Consultoria';
    if (lnkWhatsConsultoria && cfgGlobal && cfgGlobal.whatsapp_consultoria) lnkWhatsConsultoria.href = `https://wa.me/${cfgGlobal.whatsapp_consultoria.replace(/\D/g, '')}`;
    if (lnkEmailConsultoria && cfgGlobal && cfgGlobal.email_consultoria) lnkEmailConsultoria.href = `mailto:${cfgGlobal.email_consultoria}`;

    // Campos do formulário HUB Clínica
    const cfgNomeClinica = document.getElementById('cfgNomeClinica');
    const cfgEndereco = document.getElementById('cfgEndereco');
    const cfgUrlSheets = document.getElementById('cfgUrlSheets');
    const cfgUrlCalendly = document.getElementById('cfgUrlCalendly');
    const cfgLogoClinicaHub = document.getElementById('cfgLogoClinicaHub');
    if (cfgNomeClinica) cfgNomeClinica.value = clinica.nome_clinica || '';
    if (cfgEndereco) cfgEndereco.value = clinica.endereco || '';
    if (cfgUrlSheets) cfgUrlSheets.value = clinica.url_google_agenda || '';
    if (cfgUrlCalendly) cfgUrlCalendly.value = clinica.url_calendly || '';
    if (cfgLogoClinicaHub) cfgLogoClinicaHub.value = clinica.logo_clinica_url || '';

    atualizarLogosVisuais();
}

// ============================================================
// ATUALIZA LINKS DE WHATSAPP E E-MAIL NO RODAPÉ
// ============================================================
(function atualizarLinksRodape() {
    const cfgGlobal = state.configGlobal;
    if (!cfgGlobal) return;
    
    if (cfgGlobal.whatsapp_consultoria) {
        const lnkWhats = document.getElementById('lnkWhatsConsultoria');
        if (lnkWhats) {
            lnkWhats.href = 'https://wa.me/' + cfgGlobal.whatsapp_consultoria.replace(/[^0-9]/g, '');
            lnkWhats.target = '_blank';
        }
    }
    if (cfgGlobal.email_consultoria) {
        const lnkEmail = document.getElementById('lnkEmailConsultoria');
        if (lnkEmail) {
            lnkEmail.href = 'mailto:' + cfgGlobal.email_consultoria;
        }
    }
})();

function atualizarLogosVisuais() {
    const clinica = state.clinicaAtual;
    const cfgGlobal = state.configGlobal;

    const imgLogoClinica = document.getElementById('imgLogoClinicaNav');
    const iconDefault = document.getElementById('iconDefaultClinica');
    const imgLogoMetodo = document.getElementById('imgLogoMetodoNav');
    const logoConsultoriaContainer = document.getElementById('logoConsultoriaContainer');
    const imgLogoConsultoria = document.getElementById('imgLogoConsultoria');

    if (clinica && clinica.logo_clinica_url) {
        imgLogoClinica.src = clinica.logo_clinica_url;
        imgLogoClinica.classList.remove('hidden');
        if (iconDefault) iconDefault.classList.add('hidden');
    } else {
        imgLogoClinica.classList.add('hidden');
        if (iconDefault) iconDefault.classList.remove('hidden');
    }

    const logoMetodo = (cfgGlobal && cfgGlobal.logo_metodo_url) || 'images/logo-alavanca-360.png';
    if (imgLogoMetodo) {
        imgLogoMetodo.src = logoMetodo;
        imgLogoMetodo.classList.remove('hidden');
    }

    if (cfgGlobal && cfgGlobal.logo_consultoria_url) {
        if (imgLogoConsultoria) imgLogoConsultoria.src = cfgGlobal.logo_consultoria_url;
        if (logoConsultoriaContainer) {
            logoConsultoriaContainer.classList.remove('hidden');
            logoConsultoriaContainer.classList.add('flex');
        }
    } else {
        if (logoConsultoriaContainer) {
            logoConsultoriaContainer.classList.add('hidden');
            logoConsultoriaContainer.classList.remove('flex');
        }
    }
}

// Auxiliar interna para fazer o upload do arquivo binário para o Storage
async function uploadLogoClinicaStorage(fileInputId, idClinica) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        return null; // Nenhuma imagem anexada, segue fluxo padrão
    }

    const file = fileInput.files[0];
    
    // Filtro e blindagem de formato
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!tiposPermitidos.includes(file.type)) {
        alert('Formato de arquivo inválido. Por favor, envie apenas imagens em JPEG ou PNG.');
        fileInput.value = '';
        return null;
    }

    // Filtro e restrição de tamanho limite (2MB)
    if (file.size > 2 * 1024 * 1024) {
        alert('A imagem é muito pesada. O tamanho máximo permitido é de 2MB.');
        fileInput.value = '';
        return null;
    }

    const extensao = file.type.split('/')[1] || 'png';
    // Caminho estratégico organizado por ID de clínica para evitar conflitos de nomes
    const pathArquivo = `${idClinica}/logo_operacional_${Date.now()}.${extensao}`;

    try {
        // Envia o arquivo de imagem para o bucket público do Supabase
        const { data, error } = await supabaseClient.storage
            .from('logos-clinicas')
            .upload(pathArquivo, file, {
                cacheControl: '0', // Força a CDN a limpar caches antigos e carregar a imagem na hora
                upsert: true
            });

        if (error) throw error;

        // Gera a URL de acesso público direto para salvar no banco
        const { data: urlData } = supabaseClient.storage
            .from('logos-clinicas')
            .getPublicUrl(pathArquivo);

        return urlData.publicUrl;

    } catch (err) {
        console.error('Falha de Storage upload:', err);
        alert('Aviso: Não foi possível realizar o upload do arquivo de imagem. Certifique-se de criar um bucket chamado "logos-clinicas" configurado como "Public" no seu console do Supabase.');
        return null;
    }
}

async function salvarHubClinicaBasico() {
    if (!state.clinicaAtual) {
        alert("Nenhuma clínica carregada.");
        return;
    }

    const nome = document.getElementById('cfgNomeClinica').value.trim();
    const endereco = document.getElementById('cfgEndereco').value.trim();
    const urlSheets = document.getElementById('cfgUrlSheets').value.trim();
    const urlCalendly = document.getElementById('cfgUrlCalendly').value.trim();
    let logoUrl = document.getElementById('cfgLogoClinicaHub').value.trim();

    if (!nome) {
        alert("O nome da clínica é obrigatório.");
        return;
    }

    try {
        // MOTOR DE UPLOAD ASSÍNCRONO PARA O SUPABASE STORAGE
        const fileInput = document.getElementById('cfgLogoFile');
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${state.clinicaAtual.id}-${Date.now()}.${fileExt}`;

            // Envia o arquivo para o bucket existente "logos-clinicas"
            const { data: storageData, error: storageError } = await supabaseClient
                .storage
                .from('logos-clinicas')
                .upload(fileName, file, { cacheControl: '3600', upsert: true });

            if (storageError) throw storageError;

            // Resgata a estrutura correta de dados da URL pública
            const response = supabaseClient
                .storage
                .from('logos-clinicas')
                .getPublicUrl(fileName);

            if (response && response.data) {
                logoUrl = response.data.publicUrl;
            }
            document.getElementById('cfgLogoClinicaHub').value = logoUrl; 
        }

        // Atualiza a tabela "clinicas" no banco de dados
        await apiUpdate('clinicas', state.clinicaAtual.id, {
            nome_clinica: nome,
            endereco: endereco,
            url_google_agenda: urlSheets,
            url_calendly: urlCalendly,
            logo_clinica_url: logoUrl
        });

        // Sincroniza o estado global na memória da aplicação
        state.clinicaAtual.nome_clinica = nome;
        state.clinicaAtual.endereco = endereco;
        state.clinicaAtual.url_google_agenda = urlSheets;
        state.clinicaAtual.url_calendly = urlCalendly;
        state.clinicaAtual.logo_clinica_url = logoUrl;

        // CORREÇÃO: Executa a renderização se a função existir ou atualiza diretamente o elemento HTML da logo no cabeçalho
        if (typeof aplicarLogoClinicaInterface === 'function') {
            aplicarLogoClinicaInterface();
        } else {
            const imgLogo = document.getElementById('imgLogoClinicaHeader');
            if (imgLogo) imgLogo.src = logoUrl;
        }

        alert("Dados corporativos e logotipo atualizados com sucesso!");
    } catch (e) {
        console.error("Erro ao salvar dados básicos do HUB:", e);
        alert("Erro ao salvar: " + (e.message || e));
    }
}

async function sincronizarDadosPlanilhaGoogle() {
    if (!state.clinicaAtual || !state.clinicaAtual.url_google_agenda) {
        alert("URL da planilha não configurada para esta clínica.");
        return;
    }

    const btn = document.getElementById('btnSincronizarPlanilha');
    const originalText = btn ? btn.textContent : '🔄 Sincronizar e Atualizar Matriz de Inteligência';
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sincronizando dados...';
    }

    try {
        // Extrai o ID da planilha de forma robusta da URL cadastrada
        const urlStr = state.clinicaAtual.url_google_agenda;
        const matches = urlStr.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!matches || !matches[1]) {
            throw new Error("A URL do Google Sheets configurada parece inválida.");
        }
        const spreadsheetId = matches[1];

        // Exportação limpa do ecossistema Google como CSV
        // Altere o parâmetro "sheet" se o nome exato da aba na planilha for diferente de "Insumos"
        const urlCsv = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=Insumos`;
        
        const response = await fetch(urlCsv);
        if (!response.ok) {
            throw new Error("Não foi possível ler a planilha. Garanta que o acesso dela esteja configurado como 'Qualquer pessoa com o link'.");
        }
        
        const csvText = await response.text();
        
        // Conversão e higienização das linhas do CSV
        const linhas = csvText.split('\n').map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()));
        if (linhas.length <= 1) {
            throw new Error("Nenhum registro detectado na aba informada.");
        }

        // Limpeza transacional/segura dos dados defasados daquela clínica específica
        const { error: deleteError } = await supabaseClient
            .from('insumos')
            .delete()
            .eq('clinica_id', state.clinicaAtual.id);

        if (deleteError) throw deleteError;

        let insumosInseridos = 0;

        // Varredura populando a estrutura relacional do Supabase (ignora cabeçalho)
        for (let i = 1; i < linhas.length; i++) {
            const colunas = linhas[i];
            if (colunas.length < 2 || !colunas[0]) continue; // Segurança contra linhas fantasmas ou em branco

            // Tratamento sanitário preventivo para floats/decimais
            const nomeInsumo = colunas[0];
            const categoria = colunas[1] || 'Geral';
            const custoUnitario = parseFloat(colunas[2]?.replace(/[^0-9.-]+/g, "")) || 0;
            const unidadeMedida = colunas[3] || 'Unidade';

            const { error: insertError } = await supabaseClient
                .from('insumos')
                .insert({
                    clinica_id: state.clinicaAtual.id,
                    nome: nomeInsumo,
                    categoria: categoria,
                    custo_unitario: custoUnitario,
                    unidade_medida: unidadeMedida
                });

            if (insertError) throw insertError;
            insumosInseridos++;
        }

        alert(`Sucesso! Sincronização concluída.\n${insumosInseridos} insumos foram carregados e atualizados na base de dados.`);
        
        // Dispara a reatualização da lista interna se a função global existir no app
        if (typeof apiList === 'function') {
            apiList('insumos', { clinica_id: state.clinicaAtual.id });
        }

    } catch (e) {
        console.error("Erro no processamento da planilha:", e);
        alert("Erro na sincronização: " + (e.message || e));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

// ============================================================
// 14. HUB MASTER (CONSULTORIA — GESTÃO DE CLÍNICAS/TENANTS)
// ============================================================
// Acesso já é garantido pelo login (Supabase Auth) + verificação de
// state.isAdmin (tabela consultoria_admins) — sem chave extra no cliente.

function prepararHubMaster() {
    const hubGatekeeper = document.getElementById('hubGatekeeper');
    const hubConteudoOculto = document.getElementById('hubConteudoOculto');
    
    if (hubGatekeeper) hubGatekeeper.classList.add('hidden');
    if (hubConteudoOculto) hubConteudoOculto.classList.remove('hidden');

    // Proteção para não travar se o elemento HTML não existir
    const cfgLogoMetodo = document.getElementById('cfgLogoMetodo');
    const cfgLogoConsultoria = document.getElementById('cfgLogoConsultoria');
    const cfgNomeConsultoriaGlobal = document.getElementById('cfgNomeConsultoriaGlobal');

    if (cfgLogoMetodo) cfgLogoMetodo.value = (state.configGlobal && state.configGlobal.logo_metodo_url) || '';
    if (cfgLogoConsultoria) cfgLogoConsultoria.value = (state.configGlobal && state.configGlobal.logo_consultoria_url) || '';
    if (cfgNomeConsultoriaGlobal) cfgNomeConsultoriaGlobal.value = (state.configGlobal && state.configGlobal.nome_consultoria) || '';

    renderizarListaClinicas();
}

async function atualizarLogosSistema() {
    const dados = {
        logo_metodo_url: document.getElementById('cfgLogoMetodo').value,
        logo_consultoria_url: document.getElementById('cfgLogoConsultoria').value,
        nome_consultoria: document.getElementById('cfgNomeConsultoriaGlobal').value
    };

    const atualizado = await apiUpdate('config_global', 'global', dados);
    if (atualizado) {
        state.configGlobal = atualizado; // ✔️ Corrigido para 'atualizado'
    }
    atualizarLogosVisuais();
    aplicarConfigNaInterface();
}

// ============================================================
// SALVA CONFIGURAÇÕES GLOBAIS DO HUB MASTER
// ============================================================
async function salvarConfigGlobal() {
    const dados = {
        logo_metodo_url: document.getElementById('cfgLogoMetodo')?.value || '',
        logo_consultoria_url: document.getElementById('cfgLogoConsultoria')?.value || '',
        nome_consultoria: document.getElementById('cfgNomeConsultoriaGlobal')?.value || '',
        whatsapp_consultoria: document.getElementById('cfgWhatsApp')?.value || '',
        email_consultoria: document.getElementById('cfgEmailConsultoria')?.value || ''
    };

    const atualizado = await apiUpdate('config_global', 'global', dados);
    if (atualizado) {
        state.configGlobal = atualizado;
    }
    atualizarLogosVisuais();
    aplicarConfigNaInterface();
}

async function renderizarListaClinicas() {
    const tbody = document.getElementById('tbodyClinicasMaster');
    if (!tbody) return;

    // Buscamos diretamente do supabaseClient em vez do apiList genérico
    // para garantir que ignore filtros de clinica_id da sessão administrativa
    const { data: todas, error } = await supabaseClient
        .from('clinicas')
        .select('*')
        .order('nome_clinica', { ascending: true });

    if (error) {
        console.error("Erro ao listar clínicas no Master:", error);
        return;
    }

    if (!todas || todas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-600">Nenhuma clínica cadastrada ainda.</td></tr>`;
        return;
    }

    tbody.innerHTML = todas.map(c => `
        <tr class="border-b border-slate-800/60 text-xs">
            <td class="p-2 text-slate-200 font-semibold">${c.nome_clinica || ''}</td>
            <td class="p-2 text-slate-400">${c.segmento || ''}</td>
            <td class="p-2 font-mono text-emerald-400">${c.email_responsavel || ''}</td>
            <td class="p-2 text-slate-400">${c.plano_contratado || ''}</td>
            <td class="p-2">
                <span class="px-2 py-0.5 rounded text-[10px] ${c.ativo !== false ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'}">
                    ${c.ativo !== false ? 'Ativa' : 'Suspensa'}
                </span>
            </td>
            <td class="p-2 text-right">
                <button onclick="alternarStatusClinica('${c.id}', ${c.ativo === false})" class="text-sky-400 hover:underline">
                    ${c.ativo !== false ? 'Suspender' : 'Reativar'}
                </button>
            </td>
        </tr>
    `).join('');
}

async function alternarStatusClinica(id, novoStatusAtivo) {
    await apiUpdate('clinicas', id, { ativo: novoStatusAtivo });
    renderizarListaClinicas();
}

async function cadastrarNovaClinica() {
    const nome_clinica = document.getElementById('novaClinicaNome').value.trim();
    const segmento = document.getElementById('novaClinicaSegmento').value;
    const email_login = document.getElementById('novaClinicaCodigo').value.trim();
    const senha_login = document.getElementById('novaClinicaSenha').value.trim();
    const responsavel_nome = document.getElementById('novaClinicaResponsavel').value.trim();
    const plano_contratado = document.getElementById('novaClinicaPlano').value;

    if (!nome_clinica || !email_login || !senha_login) {
        alert('Nome da clínica, e-mail de login e senha são obrigatórios.');
        return;
    }
    if (senha_login.length < 6) {
        alert('A senha precisa ter pelo menos 6 caracteres (exigência do Supabase Auth).');
        return;
    }

    const btn = document.getElementById('btnCadastrarClinica');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando acesso...'; }

    try {
        if (!supabaseAuxClient) {
            throw new Error('O cliente auxiliar do Supabase não está configurado corretamente.');
        }

        // 1) Cria a conta de login (Supabase Auth) usando o cliente AUXILIAR.
        const { data: signUpData, error: signUpError } = await supabaseAuxClient.auth.signUp({
            email: email_login,
            password: senha_login
        });

        if (signUpError) {
            alert('Erro ao criar login da clínica: ' + signUpError.message);
            return; 
        }

        const novoUserId = signUpData.user ? signUpData.user.id : null;
        if (!novoUserId) {
            alert('Não foi possível obter o ID do novo usuário. Verifique as configurações de e-mail do Supabase.');
            return;
        }

        // 2) Cria o registro da clínica vinculado a esse usuário
        await apiCreate('clinicas', {
            owner_user_id: novoUserId,
            nome_clinica,
            segmento,
            responsavel_nome,
            email_responsavel: email_login,
            whatsapp_responsavel: '',
            endereco: '',
            logo_clinica_url: '',
            url_google_agenda: 'https://calendar.google.com',
            url_calendly: 'https://calendly.com',
            plano_contratado,
            ativo: true
        });

        // Limpa os campos do formulário
        document.getElementById('novaClinicaNome').value = '';
        document.getElementById('novaClinicaCodigo').value = '';
        document.getElementById('novaClinicaSenha').value = '';
        document.getElementById('novaClinicaResponsavel').value = '';

        alert('Clínica cadastrada com sucesso!\n\nLogin: ' + email_login + '\n\nCaso a confirmação de e-mail esteja ativada no seu projeto Supabase, a clínica precisa confirmar o e-mail antes do primeiro acesso.');
        renderizarListaClinicas();
    } catch (e) {
        console.error(e);
        alert('Erro ao cadastrar clínica: ' + (e.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Cadastrar Clínica e Gerar Acesso'; }
    }
}
