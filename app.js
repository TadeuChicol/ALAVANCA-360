// ============================================================
// ESCUDO DE PROTEÇÃO — Protege a UI sem esconder erros internos
// ============================================================
window.addEventListener('error', function(event) {
    // Ignora erros de extensões do navegador (não são problema do sistema)
    if (event.filename && event.filename.startsWith('chrome-extension://')) {
        return;
    }
    // Erro interno: mostra no console para debug
    console.error("🛡️ [Alavanca 360] Erro de execução:", event.message);
    console.error("📍 Arquivo:", event.filename, "Linha:", event.lineno);
    // NÃO usa preventDefault() — o erro aparece no console para você debuggar
});

window.addEventListener('unhandledrejection', function(event) {
    console.error("🛡️ [Alavanca 360] Promessa rejeitada sem tratamento:", event.reason);
    // NÃO usa preventDefault() — a rejeição aparece no console para debug
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
            .limit(1);

        if (error) {
            console.error(`Erro ao buscar id ${id} na tabela ${table}:`, error);
            return null;
        }
        return data && data.length > 0 ? data[0] : null;
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



document.getElementById('btnEntrarSistema')?.addEventListener('click', (e) => {
    e.preventDefault();
    autenticarClinica();
});

async function carregarConfigGlobal() {
    let cfg = await apiGet('config_global', 'global');
    if (!cfg) {
        cfg = {
            id: 'global',
            logo_metodo_url: 'images/logo-alavanca-360.png',
            nome_consultoria: 'Alavanca 360 Consultoria',
            whatsapp_consultoria: '5511999999999',
            email_consultoria: 'contato@tce-tadeuchicolempowerment.cloud',
            logo_consultoria_url: ''
        };
    }
    // Garante fallback se estiver vazio no banco
    if (!cfg.email_consultoria) cfg.email_consultoria = 'contato@tce-tadeuchicolempowerment.cloud';
    // Garante valor fallback se estiver nulo/vazio no banco
    if (!cfg.nome_consultoria) cfg.nome_consultoria = 'Alavanca 360 Consultoria';
    state.configGlobal = cfg;
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

    // 1. Carrega marca/configurações globais
    await carregarConfigGlobal();
    if (typeof aplicarMarcaMetodoNaTelaLogin === 'function') {
        aplicarMarcaMetodoNaTelaLogin();
    }

    // 2. Verifica se o usuário já possui sessão ativa
    if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
            const ok = await carregarContextoUsuario(session.user);
            if (ok) { 
                await entrarNoSistema(); 
                return; 
            }
        }
    }

    // 3. Exibe a tela de login caso não esteja autenticado
    mostrarTelaLogin();
}

// Garante que a função esteja disponível globalmente para o HTML ou escuta o clique diretamente
window.autenticarClinica = autenticarClinica;

document.getElementById('btnEntrarSistema')?.addEventListener('click', (e) => {
    e.preventDefault();
    autenticarClinica();
});

async function carregarConfigGlobal() {
    let cfg = await apiGet('config_global', 'global');
    if (!cfg) {
        cfg = {
            id: 'global',
            logo_metodo_url: 'images/logo-alavanca-360.png',
            nome_consultoria: 'Alavanca 360 Consultoria',
            whatsapp_consultoria: '5511999999999',
            email_consultoria: 'contato@tce-tadeuchicolempowerment.cloud',
            logo_consultoria_url: ''
        };
    }
    // Garante fallback se estiver vazio no banco
    if (!cfg.email_consultoria) cfg.email_consultoria = 'contato@tce-tadeuchicolempowerment.cloud';
    // Garante valor fallback se estiver nulo/vazio no banco
    if (!cfg.nome_consultoria) cfg.nome_consultoria = 'Alavanca 360 Consultoria';
    state.configGlobal = cfg;
}

// ============================================================
// 3. RENDERIZADOR DE LOGOS E NOME DA CLÍNICA NO HEADER
// ============================================================
function atualizarLogosVisuais() {
    const clinica = state.clinicaAtual;
    const cfgGlobal = state.configGlobal;

    const imgLogoClinica = document.getElementById('imgLogoClinicaNav');
    const iconDefault = document.getElementById('iconDefaultClinica');
    const imgLogoMetodo = document.getElementById('imgLogoMetodoNav');
    const lblNomeClinica = document.getElementById('lblNomeClinicaNav');

    if (lblNomeClinica && clinica) {
        lblNomeClinica.textContent = clinica.nome_clinica || clinica.nome || clinica.email_responsavel || 'Clínica Conectada';
    }

    if (clinica && clinica.logo_clinica_url) {
        if (imgLogoClinica) {
            imgLogoClinica.src = clinica.logo_clinica_url;
            imgLogoClinica.classList.remove('hidden');
        }
        if (iconDefault) iconDefault.classList.add('hidden');
    } else {
        if (imgLogoClinica) imgLogoClinica.classList.add('hidden');
        if (iconDefault) iconDefault.classList.remove('hidden');
    }

    const logoMetodoPadrao = 'https://gtcybiuxdpxixdjnshty.supabase.co/storage/v1/object/public/logos-clinicas/logo-alavanca360.png';
    if (imgLogoMetodo) {
        imgLogoMetodo.src = (cfgGlobal && cfgGlobal.logo_metodo_url) || logoMetodoPadrao;
        imgLogoMetodo.classList.remove('hidden');
    }
}

// Garante que a função esteja disponível globalmente
window.autenticarClinica = autenticarClinica;

// ============================================================
// APLICAÇÃO DE MARCA E INTEGRAÇÕES DINÂMICAS
// ============================================================

function aplicarMarcaMetodoNaTelaLogin() {
    const logoMetodo = (state.configGlobal && state.configGlobal.logo_metodo_url) || 'images/logo-alavanca-360.png';
    document.querySelectorAll('.logo-metodo-alavanca').forEach(img => { 
        img.src = logoMetodo; 
    });
    
    const nomeConsultoria = document.getElementById('lblNomeConsultoriaLogin');
    if (nomeConsultoria && state.configGlobal) {
        nomeConsultoria.textContent = state.configGlobal.nome_consultoria || 'Alavanca 360 Consultoria';
    }
}

function aplicarConfigNaInterface() {
    const cfg = state.configGlobal || {};
    const logoMetodo = cfg.logo_metodo_url || 'images/logo-alavanca-360.png';

    // 1. Aplica Logo do Sistema / Método (Ampliada)
    document.querySelectorAll('.logo-metodo-alavanca').forEach(img => { 
        img.src = logoMetodo; 
    });

    // 2. HUB Clínica — Inserção / Povoamento Automático da Logo da Clínica
    const containerMarcaClinica = document.getElementById('containerMarcaClinicaTopo');
    const logoClinicaUrl = state.clinicaAtual?.logo_clinica_url;
    
    if (state.clinicaAtual && logoClinicaUrl) {
        if (containerMarcaClinica) containerMarcaClinica.classList.remove('hidden');
        document.querySelectorAll('.logo-clinica-topo').forEach(img => { 
            img.src = logoClinicaUrl;
            img.classList.remove('hidden');
        });
    } else {
        if (containerMarcaClinica) containerMarcaClinica.classList.add('hidden');
        document.querySelectorAll('.logo-clinica-topo').forEach(img => img.classList.add('hidden'));
    }

    // Atualiza nome da clínica no topo
    document.querySelectorAll('.nome-clinica-topo').forEach(el => {
        el.textContent = state.clinicaAtual?.nome_clinica || state.clinicaAtual?.nome || 'Sua Clínica';
    });

    // 3. Preenchimento de campos de formulário (HUB Master)
    const inpNome  = document.getElementById('hubMasterNomeConsultoria') || document.getElementById('cfgNomeConsultoriaGlobal');
    const inpLogo  = document.getElementById('hubMasterLogoUrl') || document.getElementById('cfgLogoConsultoria');
    const inpWsp   = document.getElementById('hubMasterWhatsapp') || document.getElementById('cfgWhatsApp');
    const inpEmail = document.getElementById('hubMasterEmailSuporte') || document.getElementById('cfgEmailConsultoria');
    
    if (inpNome)  inpNome.value  = cfg.nome_consultoria || '';
    if (inpLogo)  inpLogo.value  = cfg.logo_metodo_url || cfg.logo_consultoria_url || '';
    if (inpWsp)   inpWsp.value   = cfg.whatsapp_consultoria || cfg.whatsapp || '';
    if (inpEmail) inpEmail.value = cfg.email_consultoria || cfg.email_suporte || '';

    // 4. Redirecionamento Dinâmico do WhatsApp (HUB Master e HUB Clínica)
    const whatsappNum = cfg.whatsapp_consultoria || cfg.whatsapp || '';
    const numClean = whatsappNum.replace(/\D/g, '');
    
    document.querySelectorAll('.btn-suporte-whatsapp').forEach(btnWhats => {
        if (numClean) {
            btnWhats.href = `https://wa.me/${numClean}`;
            btnWhats.classList.remove('hidden');
        } else {
            btnWhats.href = '#';
        }
    });

    // 5. Google Agenda e Planilha Google Sheets
    if (typeof renderizarAgendaLocal === 'function') {
        renderizarAgendaLocal();
    }
}

function mostrarTelaLogin(mensagemErro) {
    document.getElementById('telaLogin')?.classList.remove('hidden');
    document.getElementById('appPrincipal')?.classList.add('hidden');

    const erroBox = document.getElementById('loginErro');
    if (erroBox) {
        if (mensagemErro) {
            erroBox.textContent = mensagemErro;
            erroBox.classList.remove('hidden');
        } else {
            erroBox.classList.add('hidden');
        }
    } else if (mensagemErro) {
        alert(mensagemErro);
    }

    if (window.lucide) lucide.createIcons();
}

async function autenticarClinica() {
    const email = (document.getElementById('inputCodigoAcesso')?.value || '').trim();
    const senha = (document.getElementById('inputSenhaAcesso')?.value || '').trim();

    if (!email || !senha) {
        mostrarTelaLogin('Informe o e-mail e a senha de acesso.');
        return;
    }

    const btn = document.getElementById('btnEntrarSistema');
    const textoOriginal = btn ? btn.textContent : '→ Entrar no Sistema';
    if (btn) {
        btn.textContent = 'Verificando...';
        btn.disabled = true;
    }

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
        if (btn) {
            btn.textContent = textoOriginal;
            btn.disabled = false;
        }
    }
}

function traduzErroSupabase(msg) {
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.';
    if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado. Verifique a caixa de entrada (ou peça para a Consultoria desativar a confirmação de e-mail no Supabase).';
    return msg || 'Erro ao conectar ao servidor.';
}

async function carregarContextoUsuario(user) {
    state.usuario = user;

    const { data: adminData } = await supabaseClient
        .from('consultoria_admins')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

    state.isAdmin = !!adminData;

    const { data: clinicas, error } = await supabaseClient
        .from('clinicas')
        .select('*')
        .eq('owner_user_id', user.id)
        .maybeSingle();

    if (!error && clinicas) {
        if (clinicas.ativo === false && !state.isAdmin) {
            return false;
        }
        state.clinicaAtual = clinicas;
    } else {
        state.clinicaAtual = null;
    }

    if (adminData) {
        state.isAdmin = true;
    }
    return state.isAdmin || !!state.clinicaAtual;
}

async function sairDoSistema() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

async function entrarNoSistema() {
    document.getElementById('telaLogin')?.classList.add('hidden');
    document.getElementById('appPrincipal')?.classList.remove('hidden');
    if (typeof init === 'function') {
        await init();
    }
}

// ============================================================
// INICIALIZAÇÃO DO APP (JÁ AUTENTICADO)
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

        await carregarConfiguracoesGlobais();
        aplicarConfigNaInterface();
        rebuildSelects();
        if (typeof calcularMetricasGerais === 'function') calcularMetricasGerais();
        if (typeof calcularMetricasTratamentos === 'function') calcularMetricasTratamentos();
        if (typeof calcularFunilComercial === 'function') calcularFunilComercial();
        if (typeof renderizarAgendaLocal === 'function') renderizarAgendaLocal();
        if (typeof atualizarTemplateDocumento === 'function') atualizarTemplateDocumento();
        if (typeof renderizarModuloFinanceiroCompleto === 'function') renderizarModuloFinanceiroCompleto();
    } // <--- FECHA O "if (state.clinicaAtual)"

    // Redirecionamento de abas
    if (state.isAdmin && !state.clinicaAtual) {
        switchTab('tab-hub-master');
    } else {
        switchTab('tab-ceo');
    }
} // <--- FECHA A FUNÇÃO init() CORRETAMENTE AQUI

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
    try {
        // 1. Busca os dados da tabela no Supabase
        const dados = await apiList('agendamentos');
        
        // 2. Atualiza o estado global com os agendamentos recebidos (ou array vazio)
        state.agendamentos = Array.isArray(dados) ? dados : [];
        
        console.log('[Alavanca 360] Agendamentos carregados via API. Registros:', state.agendamentos.length);

        // 3. O PONTO CHAVE QUE FALTAVA: Renderiza imediatamente o HTML na tela
        renderizarAgendaLocal();

    } catch (error) {
        console.error('[Alavanca 360] Erro ao carregar agendamentos:', error);
        state.agendamentos = [];
        renderizarAgendaLocal();
    }
}

async function carregarProntuario() {
    try {
        state.prontuario = await apiList('prontuario_evolutivo');
    } catch (error) {
        console.error('[Alavanca 360] Erro ao carregar prontuario:', error);
    }
}

async function carregarDadosFinanceiros() {
    try {
        const [insumos, servicos, mapa, fixos, config, atendimentos, custoView] = await Promise.all([
            apiList('insumos'),
            apiList('servicos'),
            apiList('mapa_insumos_servicos'),
            apiList('custos_fixos'),
            apiList('config_precificacao'),
            apiList('atendimentos'),
            apiList('vw_custo_servico')
        ]);
        
        state.insumos = insumos || [];
        state.servicos = servicos || [];
        state.mapaInsumosServicos = mapa || [];
        state.custosFixos = fixos || [];
        state.configPrecificacao = config || [];
        state.atendimentos = atendimentos || [];
        state.custoServicoView = custoView || [];
    } catch (error) {
        console.error('[Alavanca 360] Erro ao carregar dados financeiros:', error);
    }
}

// ============================================================
// 4. NAVEGAÇÃO ENTRE MÓDULOS (VERSÃO CORRIGIDA PARA HUB MASTER)
// ============================================================

function switchTab(tabId) {
    console.log(`[Alavanca 360] Alternando para aba: ${tabId}`);

    // 🛡️ GUARDA DE SEGURANÇA: HUB Master somente para administradores master
    if (tabId === 'tab-hub-master' && !state.isAdmin) {
        console.warn('[Alavanca 360] Acesso negado ao HUB Master: perfil sem permissão.');
        return;
    }

    // 1. Oculta todos os conteúdos de abas
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.style.display = 'none';
    });

    // 2. Mapeamento de fallback
    const mapIDs = {
        'm6': 'tab-agenda',
        'm7': 'tab-documentos',
        'm8': 'tab-custos',
        'tab-m6': 'tab-agenda',
        'tab-m7': 'tab-documentos',
        'tab-m8': 'tab-custos'
    };

    const targetId = mapIDs[tabId] || tabId;
    const target = document.getElementById(targetId);

    if (target) {
        target.classList.remove('hidden');
        target.style.display = 'block';
    } else {
        console.warn(`[Aviso] Div com id "${tabId}" não encontrada no HTML.`);
        return;
    }

    // 3. TRATAMENTO EXCLUSIVO DO HUB MASTER
    const gatekeeper = document.getElementById('hubGatekeeper');
    const conteudoOculto = document.getElementById('hubConteudoOculto');

    if (targetId === 'tab-hub-master') {
        if (state.isAdmin) {
            // Se for Admin Master: Esconde o aviso de bloqueio e mostra o painel real
            if (gatekeeper) gatekeeper.classList.add('hidden');
            if (conteudoOculto) conteudoOculto.classList.remove('hidden');
            if (typeof prepararHubMaster === 'function') prepararHubMaster();
        } else {
            // Se NÃO for Admin Master: Mostra o Gatekeeper e esconde o painel
            if (gatekeeper) gatekeeper.classList.remove('hidden');
            if (conteudoOculto) conteudoOculto.classList.add('hidden');
        }
    }

    // 4. Atualiza destaque visual dos botões na barra lateral
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove(
        'text-emerald-400', 'bg-emerald-500/5', 'border', 'border-emerald-500/10'
    ));

    const activeBtn = document.getElementById(`btn-${tabId}`) || document.getElementById(`btn-${targetId}`);
    if (activeBtn) {
        activeBtn.classList.add('text-emerald-400', 'bg-emerald-500/5', 'border', 'border-emerald-500/10');
    }

    // 5. Execução dos inicializadores de módulos
    try {
        switch (targetId) {
            case 'tab-ceo':
                if (typeof calcularMetricasGerais === 'function') calcularMetricasGerais();
                break;
            case 'tab-financeiro':
            case 'tab-custos':
            case 'tab-atendimentos':
                if (typeof renderizarModuloFinanceiroCompleto === 'function') renderizarModuloFinanceiroCompleto();
                break;
            case 'tab-comercial':
                if (typeof calcularFunilComercial === 'function') calcularFunilComercial();
                break;
            case 'tab-tratamentos':
                if (typeof calcularMetricasTratamentos === 'function') calcularMetricasTratamentos();
                break;
            case 'tab-pacientes':
                if (typeof carregarPacientes === 'function') carregarPacientes();
                break;
            case 'tab-agenda':
                if (typeof renderizarAgendaLocal === 'function') renderizarAgendaLocal();
                break;
            case 'tab-documentos':
                if (typeof atualizarTemplateDocumento === 'function') atualizarTemplateDocumento();
                break;
            case 'tab-dashboard-vivo':
                if (typeof renderizarDashboardVivo === 'function') renderizarDashboardVivo();
                break;
            case 'tab-assistente':
                if (typeof inicializarAssistenteDecisao === 'function') inicializarAssistenteDecisao();
                break;
            case 'tab-hub-clinica':
                if (typeof aplicarConfigNaInterface === 'function') aplicarConfigNaInterface();
                if (typeof preencherFormularioHubClinica === 'function') preencherFormularioHubClinica();
                break;
        }
    } catch (err) {
        console.error(`[Erro na renderização da aba ${targetId}]:`, err);
    }

    if (window.lucide) lucide.createIcons();
}

function preencherFormularioHubClinica() {
    if (!state.clinicaAtual) return;
    const c = state.clinicaAtual;
    
    const elNome     = document.getElementById('hubClinicaNome') || document.getElementById('nomeClinica');
    const elEnd      = document.getElementById('hubClinicaEndereco') || document.getElementById('enderecoClinica');
    const elAgenda   = document.getElementById('hubClinicaGoogleAgenda') || document.getElementById('urlGoogleAgenda');
    const elCalendly = document.getElementById('hubClinicaCalendly') || document.getElementById('urlCalendly');
    const elEmail    = document.getElementById('hubClinicaEmail') || document.getElementById('emailClinica');
    const elLogo     = document.getElementById('hubClinicaLogoUrl') || document.getElementById('logoClinicaUrl');
    const elNap      = document.getElementById('hubClinicaPlanilhaNap') || document.getElementById('urlPlanilhaNap');

    if (elNome)     elNome.value     = c.nome_clinica || c.nome || '';
    if (elEnd)      elEnd.value      = c.endereco || '';
    if (elAgenda)   elAgenda.value   = c.url_google_agenda || '';
    if (elCalendly) elCalendly.value = c.url_calendly || '';
    if (elEmail)    elEmail.value    = c.email || c.email_suporte || '';
    if (elLogo)     elLogo.value     = c.logo_clinica_url || '';
    if (elNap)      elNap.value      = c.url_planilha_nap || '';

    // Se já houver logomarca cadastrada no banco, mostra no preview
    if (c.logo_clinica_url) {
        const elPreviewImg = document.getElementById('imgPreviewLogo');
        const elPreviewContainer = document.getElementById('previewLogoContainer');
        if (elPreviewImg) elPreviewImg.src = c.logo_clinica_url;
        if (elPreviewContainer) elPreviewContainer.classList.remove('hidden');
    }
}

// 📸 Função unificada para conversão local da logomarca (PNG/JPEG)
function converterLogoParaBase64(event, targetInputId = 'hubClinicaLogoUrl', targetPreviewImgId = 'imgPreviewLogo', targetContainerId = 'previewLogoContainer', targetNameId = 'nomeArquivoLogo') {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
        alert('Por favor, selecione apenas arquivos nos formatos PNG ou JPEG.');
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Url = e.target.result;
        const elLogoInput = document.getElementById(targetInputId);
        const elPreviewImg = document.getElementById(targetPreviewImgId);
        const elPreviewContainer = document.getElementById(targetContainerId);
        const elNomeArquivo = document.getElementById(targetNameId);
        
        if (elLogoInput) elLogoInput.value = base64Url;
        if (elPreviewImg) elPreviewImg.src = base64Url;
        if (elPreviewContainer) elPreviewContainer.classList.remove('hidden');
        if (elNomeArquivo) elNomeArquivo.textContent = file.name;
    };
    reader.readAsDataURL(file);
}

// Disparado ao clicar em "Salvar Parâmetros Master"
async function salvarHubMaster(event) {
    if (event) event.preventDefault();

    const btnSalvar = event?.currentTarget || document.querySelector("button[onclick='salvarHubMaster()']");
    const textoOriginal = btnSalvar ? btnSalvar.innerHTML : 'Salvar Parâmetros Master';

    try {
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = 'Salvando...';
        }

        const nome_consultoria = document.getElementById('hubMasterNomeConsultoria')?.value.trim() || '';
        const logo_metodo_url = document.getElementById('hubMasterLogoUrl')?.value || '';
        const email_suporte = document.getElementById('hubMasterEmailSuporte')?.value.trim() || '';
        const whatsapp_suporte = document.getElementById('hubMasterWhatsapp')?.value.trim() || '';

        const payload = {
            nome_consultoria,
            logo_metodo_url,
            email_suporte,
            whatsapp_suporte
        };

        const idConfig = state.configGlobal?.id || 1;
        const resultado = await apiUpdate('config_global', idConfig, payload);

        if (resultado) {
            state.configGlobal = { ...state.configGlobal, ...resultado };
            if (typeof aplicarConfigNaInterface === 'function') aplicarConfigNaInterface();
            alert('✅ Configurações Master salvas e aplicadas com sucesso!');
        }
    } catch (err) {
        console.error('Erro ao salvar HUB Master:', err);
        alert('❌ Erro ao salvar configurações do HUB Master.');
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginal;
        }
    }
}

async function salvarHubClinica(event) {
    if (event) event.preventDefault();
    
    const btnSalvar = event?.currentTarget || document.getElementById('btnSalvarHubClinica');
    const textoOriginal = btnSalvar ? btnSalvar.innerHTML : 'Salvar Dados';
    
    if (!state.clinicaAtual || !state.clinicaAtual.id) {
        alert('Erro: Nenhuma clínica ativa selecionada para salvar.');
        return;
    }

    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `Salvando...`;
    }

    const emailInput = (document.getElementById('hubClinicaEmail') || document.getElementById('emailClinica'))?.value.trim() || '';

    const dadosAtualizados = {
        nome_clinica: (document.getElementById('hubClinicaNome') || document.getElementById('nomeClinica'))?.value.trim() || '',
        endereco: (document.getElementById('hubClinicaEndereco') || document.getElementById('enderecoClinica'))?.value.trim() || '',
        url_google_agenda: (document.getElementById('hubClinicaGoogleAgenda') || document.getElementById('urlGoogleAgenda'))?.value.trim() || '',
        url_calendly: (document.getElementById('hubClinicaCalendly') || document.getElementById('urlCalendly'))?.value.trim() || '',
        email: emailInput,
        logo_clinica_url: (document.getElementById('hubClinicaLogoUrl') || document.getElementById('logoClinicaUrl'))?.value.trim() || '',
        url_planilha_nap: (document.getElementById('hubClinicaPlanilhaNap') || document.getElementById('urlPlanilhaNap'))?.value.trim() || ''
    };

    try {
        const resultado = await apiUpdate('clinicas', state.clinicaAtual.id, dadosAtualizados);
        if (resultado) {
            // Atualiza o cache global da clínica ativa
            state.clinicaAtual = { ...state.clinicaAtual, ...resultado };
            
            // Força a propagação do logo e nome nas telas topo do Hub
            aplicarConfigNaInterface();
            
            alert('✅ Dados da Clínica e integrações salvos e propagados com sucesso!');
        } else {
            throw new Error("Erro de resposta do servidor ao atualizar.");
        }
    } catch (err) {
        console.error('Erro ao salvar no HUB Clínica:', err);
        alert('❌ Erro ao salvar as configurações: ' + (err.message || err));
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginal;
        }
    }
}

// 🛡️ FUNÇÃO INTELIGENTE PARA FECHAR O HUB MASTER
function fecharHubMaster() {
    if (state.clinicaAtual) {
        // Se houver uma clínica selecionada/ativa, vai para o M1 Visão Executiva
        switchTab('tab-ceo');
    } else {
        // Se for um Super Admin sem clínica vinculada, oculta todas as abas limpando a tela
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.add('hidden');
            el.style.display = 'none';
        });
        console.log('[Alavanca 360] HUB Master fechado (Nenhuma clínica selecionada).');
    }
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
    // 1. Renderização da Tabela Interna
    const tbody = document.getElementById('tbodyAgendaLocal');
    if (tbody) {
        const totalRegistros = state.agendamentos?.length || 0;
        const listaGeral = Array.isArray(state.agendamentos) ? state.agendamentos : [];
        const filtrados = listaGeral
            .filter(a => {
                if (!a.data_hora) return true;
                if (typeof pertenceAoFiltro === 'function' && state.filtroAgendaAtivo) {
                    try { return pertenceAoFiltro(a.data_hora, state.filtroAgendaAtivo); } catch (e) { return true; }
                }
                return true;
            })
            .sort((a, b) => new Date(a.data_hora || 0) - new Date(b.data_hora || 0));

        if (filtrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-slate-400 bg-slate-900/50 rounded-lg">
                        <p class="text-sm font-semibold text-slate-300">Nenhum agendamento encontrado para este período.</p>
                        <p class="text-xs text-slate-500">Total no banco: ${totalRegistros}.</p>
                    </td>
                </tr>`;
        } else {
            tbody.innerHTML = filtrados.map(a => {
                let dataFormatada = '--';
                if (a.data_hora) {
                    const d = new Date(a.data_hora);
                    dataFormatada = isNaN(d.getTime()) ? a.data_hora : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                }
                return `
                    <tr class="hover:bg-slate-800/60 text-xs transition border-b border-slate-800/40">
                        <td class="p-3 text-slate-200 font-semibold">${a.paciente_nome || 'Paciente não informado'}</td>
                        <td class="p-3 text-sky-400 font-medium">${dataFormatada}</td>
                        <td class="p-3 text-slate-300">${a.dentista || 'Não atribuído'}</td>
                        <td class="p-3"><span class="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px] text-amber-400 font-mono">${a.cadeira_sala || 'Geral'}</span></td>
                        <td class="p-3 text-slate-400">${a.procedimento || 'Avaliação'}</td>
                        <td class="p-3 text-right space-x-2">
                            <button onclick="prepararEdicaoAgenda('${a.id}')" class="text-sky-400 hover:text-sky-300 font-medium transition">Editar</button>
                            <span class="text-slate-700">|</span>
                            <button onclick="removerAgenda('${a.id}')" class="text-rose-400 hover:text-rose-300 font-medium transition">Excluir</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // 2. Sincronização com Google Agenda / Calendly (Exibição da Fonte de Verdade)
    const containerGoogle = document.getElementById('containerGoogleAgendaIframe');
    const linkExternoGoogle = document.getElementById('btnAbrirGoogleAgendaExterno');
    
    if (state.clinicaAtual) {
        const urlGoogle = state.clinicaAtual.url_google_agenda;
        if (containerGoogle && urlGoogle) {
            containerGoogle.innerHTML = `<iframe src="${urlGoogle}" style="border: 0" width="100%" height="600" frameborder="0" scrolling="no"></iframe>`;
        }
        if (linkExternoGoogle && urlGoogle) {
            linkExternoGoogle.href = urlGoogle;
            linkExternoGoogle.target = "_blank";
        }
    }
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
    const selPac = document.getElementById('selectDocPaciente');
    const selDent = document.getElementById('selectDocDentista');
    const selTipo = document.getElementById('selectTipoDoc');
    const preview = document.getElementById('areaPreviewDocumento');
    
    if (!selPac || !selDent || !selTipo || !preview) return;
    
    const pacName = selPac.value || 'Paciente';
    const dentName = selDent.value || 'Profissional Responsável';
    const tipo = selTipo.value;
    const clinica = (state.clinicaAtual && state.clinicaAtual.nome_clinica) || 'Clínica';
    const endereco = (state.clinicaAtual && state.clinicaAtual.endereco) || '';
    const profissional = state.profissionais.find(p => p.nome === dentName);
    const cro = profissional ? profissional.cro : '';
    const logoClinica = state.clinicaAtual && state.clinicaAtual.logo_clinica_url;
    const logoHtml = logoClinica
        ? `<img src="${logoClinica}" alt="Logo" class="h-10 object-contain mb-1">`
        : '';

    const cabecalho = `
        <div class="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
            <div class="text-left">
                ${logoHtml}
                <h1 class="font-bold uppercase text-sm text-slate-100">${clinica}</h1>
                <p class="text-[10px] text-slate-400">${endereco}</p>
            </div>
            <div class="text-right">
                <p class="text-xs font-bold text-slate-200">${dentName}</p>
                <p class="text-[10px] text-slate-400">${cro}</p>
            </div>
        </div>
    `;

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
    const conteudo = document.getElementById('areaPreviewDocumento')?.innerHTML;
    if (!conteudo) return;
    
    const janelaImpressao = window.open('', '', 'width=800,height=600');
    janelaImpressao.document.write(`
        <html>
            <head>
                <title>Documento Oficial - Método Alavanca 360</title>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="p-8 bg-white text-black" onload="window.print(); window.close();">
                ${conteudo}
            </body>
        </html>
    `);
    janelaImpressao.document.close();
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
// 12B. MÓDULO 8 — CUSTOS, INSUMOS E PRECIFICAÇÃO (COMPLETO E INTEGRADO À API)
// ============================================================

function mudarSubAbaCustos(nome) {
    document.querySelectorAll('.subtab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('bg-emerald-600', 'text-white'));
    const alvo = document.getElementById('subtab-' + nome);
    if (alvo) alvo.classList.remove('hidden');
    const btn = document.getElementById('subtabBtn-' + nome);
    if (btn) btn.classList.add('bg-emerald-600', 'text-white');

    if (nome === 'mapa') atualizarSelectsMapa();
    if (nome === 'resultado') renderizarResultadosCustos();
}

function calcularCustoUnitarioInsumo(ins) {
    const qtd = Number(ins.quantidade_apresentacao) || 0;
    const preco = Number(ins.preco_apresentacao) || 0;
    return qtd > 0 ? preco / qtd : 0;
}

// --- 1. INSUMOS ---
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
        ['insNome', 'insApresentacao', 'insQuantidade', 'insUnidade', 'insPreco'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao salvar insumo.');
    }
}

async function removerInsumo(id) {
    if (!confirm('Remover este insumo? Vínculos com serviços também serão removidos.')) return;
    try {
        await apiDelete('insumos', id);
        state.insumos = state.insumos.filter(i => i.id !== id);
        if (state.mapaInsumosServicos) {
            state.mapaInsumosServicos = state.mapaInsumosServicos.filter(m => m.insumo_id !== id);
        }
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao excluir insumo.');
    }
}

function renderizarInsumos() {
    const tbody = document.getElementById('tbodyInsumos');
    if (!tbody) return;
    if (!state.insumos || state.insumos.length === 0) {
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

// --- 2. SERVIÇOS ---
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
        ['servNome', 'servCategoria', 'servTempo', 'servPrecoConvenio', 'servPrecoParticular'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao salvar serviço.');
    }
}

async function removerServico(id) {
    if (!confirm('Remover este serviço? Vínculos e atendimentos relacionados também serão afetados.')) return;
    try {
        await apiDelete('servicos', id);
        state.servicos = state.servicos.filter(s => s.id !== id);
        if (state.mapaInsumosServicos) {
            state.mapaInsumosServicos = state.mapaInsumosServicos.filter(m => m.servico_id !== id);
        }
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao excluir serviço.');
    }
}

// Atualização inline de preços de venda dos serviços
async function atualizarPrecoServico(id, campo, valor) {
    const servico = state.servicos.find(s => String(s.id) === String(id));
    if (!servico) return;
    
    const numVal = parseFloat(valor) || 0;
    servico[campo] = numVal;

    try {
        await apiUpdate('servicos', id, { [campo]: numVal });
    } catch (e) {
        console.error('Erro ao atualizar preço do serviço via API', e);
    }
}

function renderizarServicos() {
    const tbody = document.getElementById('tbodyServicos');
    if (!tbody) return;
    if (!state.servicos || state.servicos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-600">Nenhum serviço cadastrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = state.servicos.map(s => `
        <tr class="border-b border-slate-800/60">
            <td class="p-2 text-slate-200">${s.nome}</td>
            <td class="p-2 text-slate-400">${s.categoria || ''}</td>
            <td class="p-2 text-slate-400">${s.tempo_medio_min || 0} min</td>
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

// --- 3. MAPA DE CONSUMO (INSUMO X SERVIÇO) ---
function atualizarSelectsMapa() {
    const selS = document.getElementById('mapaServico');
    const selI = document.getElementById('mapaInsumo');
    if (selS) {
        selS.innerHTML = (state.servicos || []).map(s => `<option value="${s.id}">${s.nome}</option>`).join('') || '<option value="">Cadastre um serviço primeiro</option>';
    }
    if (selI) {
        selI.innerHTML = (state.insumos || []).map(i => `<option value="${i.id}">${i.nome}</option>`).join('') || '<option value="">Cadastre um insumo primeiro</option>';
    }
}

async function salvarMapaInsumoServico() {
    const servico_id = document.getElementById('mapaServico').value;
    const insumo_id = document.getElementById('mapaInsumo').value;
    const quantidade_consumida = parseFloat(document.getElementById('mapaQuantidade').value) || 0;

    if (!servico_id || !insumo_id || quantidade_consumida <= 0) {
        alert('Selecione os itens e informe uma quantidade válida.');
        return;
    }

    try {
        const criado = await apiCreate('mapa_insumos_servicos', {
            clinica_id: clinicaId(), servico_id, insumo_id, quantidade_consumida
        });
        if (!state.mapaInsumosServicos) state.mapaInsumosServicos = [];
        state.mapaInsumosServicos.push(criado);
        document.getElementById('mapaQuantidade').value = '';
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao vincular insumo ao serviço.');
    }
}

async function removerMapaInsumoServico(id) {
    try {
        await apiDelete('mapa_insumos_servicos', id);
        state.mapaInsumosServicos = state.mapaInsumosServicos.filter(m => m.id !== id);
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao excluir vínculo.');
    }
}

function renderizarMapaInsumos() {
    const tbody = document.getElementById('tbodyMapaInsumos');
    if (!tbody) return;
    const mapa = state.mapaInsumosServicos || [];
    if (mapa.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-600">Nenhum vínculo cadastrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = mapa.map(m => {
        const s = (state.servicos || []).find(x => String(x.id) === String(m.servico_id)) || { nome: 'Removido' };
        const i = (state.insumos || []).find(x => String(x.id) === String(m.insumo_id)) || { nome: 'Removido', quantidade_apresentacao: 1, preco_apresentacao: 0 };
        const custoUnit = calcularCustoUnitarioInsumo(i);
        const custoTotal = Number(m.quantidade_consumida || 0) * custoUnit;

        return `
            <tr class="border-b border-slate-800/60">
                <td class="p-2 font-medium text-slate-200">${s.nome}</td>
                <td class="p-2 text-slate-400">${i.nome}</td>
                <td class="p-2 text-slate-400">${m.quantidade_consumida}</td>
                <td class="p-2 font-bold text-amber-400">${formatarMoeda(custoTotal)}</td>
                <td class="p-2 text-right"><button onclick="removerMapaInsumoServico('${m.id}')" class="text-rose-400 hover:underline">Excluir</button></td>
            </tr>
        `;
    }).join('');
}

// --- 4. CUSTOS FIXOS ---
async function salvarCustoFixo() {
    const nome = document.getElementById('fixoNome').value.trim();
    const valor = parseFloat(document.getElementById('fixoValor').value) || 0;

    if (!nome || valor <= 0) { alert('Informe a descrição e o valor.'); return; }

    try {
        const criado = await apiCreate('custos_fixos', { clinica_id: clinicaId(), nome, valor });
        if (!state.custosFixos) state.custosFixos = [];
        state.custosFixos.push(criado);
        document.getElementById('fixoNome').value = '';
        document.getElementById('fixoValor').value = '';
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao salvar custo fixo.');
    }
}

async function removerCustoFixo(id) {
    try {
        await apiDelete('custos_fixos', id);
        state.custosFixos = state.custosFixos.filter(f => f.id !== id);
        renderizarModuloFinanceiroCompleto();
    } catch (e) {
        alert('Erro ao excluir custo fixo.');
    }
}

function renderizarCustosFixos() {
    const tbody = document.getElementById('tbodyCustosFixos');
    const lblTotal = document.getElementById('lblTotalCustosFixos');
    const fixos = state.custosFixos || [];
    const total = fixos.reduce((acc, f) => acc + Number(f.valor || 0), 0);

    if (lblTotal) lblTotal.innerText = formatarMoeda(total);
    if (!tbody) return;

    if (fixos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-3 text-center text-slate-600">Nenhum custo fixo cadastrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = fixos.map(f => `
        <tr class="border-b border-slate-800/60">
            <td class="p-2 font-medium text-slate-200">${f.nome}</td>
            <td class="p-2 font-bold text-slate-300">${formatarMoeda(f.valor)}</td>
            <td class="p-2 text-right"><button onclick="removerCustoFixo('${f.id}')" class="text-rose-400 hover:underline">Excluir</button></td>
        </tr>
    `).join('');
}

// --- 5. RESULTADOS E MATRIZ DE PRECIFICAÇÃO ---
function renderizarResultadosCustos() {
    const tbody = document.getElementById('tbodyResultadoCustos');
    if (!tbody) return;

    const servicos = state.servicos || [];
    if (servicos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-3 text-center text-slate-600">Cadastre serviços e insumos para visualizar a matriz.</td></tr>`;
        return;
    }

    const totalFixos = (state.custosFixos || []).reduce((acc, f) => acc + Number(f.valor || 0), 0);
    const mapa = state.mapaInsumosServicos || [];

    let html = '';
    servicos.forEach(s => {
        const insumoCustos = mapa.filter(m => String(m.servico_id) === String(s.id)).reduce((acc, m) => {
            const ins = (state.insumos || []).find(i => String(i.id) === String(m.insumo_id));
            return acc + (ins ? calcularCustoUnitarioInsumo(ins) * Number(m.quantidade_consumida || 0) : 0);
        }, 0);

        ['convenio', 'particular'].forEach(mod => {
            const cfg = (state.configPrecificacao && state.configPrecificacao[mod]) || {};
            const minutosMes = (Number(cfg.horas_dia) || 8) * (Number(cfg.dias_mes) || 22) * 60;
            const proLabore = Number(cfg.pro_labore) || 0;
            const valorMinutoFixo = minutosMes > 0 ? (totalFixos + proLabore) / minutosMes : 0;
            const custoHoraFixo = valorMinutoFixo * (Number(s.tempo_medio_min) || 0);

            const custoTotal = insumoCustos + custoHoraFixo;
            const precoVenda = mod === 'convenio' ? Number(s.preco_convenio || 0) : Number(s.preco_particular || 0);
            const impostoTaxaR$ = (precoVenda * ((Number(cfg.imposto_pct) || 0) + (Number(cfg.taxa_cartao_pct) || 0))) / 100;
            const margemR$ = precoVenda - custoTotal - impostoTaxaR$;
            const margemPct = precoVenda > 0 ? (margemR$ / precoVenda) * 100 : 0;

            const metaMargem = Number(cfg.margem_desejada_pct) || 0;
            const statusClass = margemPct >= metaMargem ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
            const statusTexto = margemPct >= metaMargem ? 'Lucrativo' : 'Abaixo da Meta';

            html += `
                <tr class="border-b border-slate-800/60">
                    <td class="p-2 font-medium text-slate-200">${s.nome}</td>
                    <td class="p-2 capitalize font-semibold ${mod === 'convenio' ? 'text-sky-400' : 'text-purple-400'}">${mod}</td>
                    <td class="p-2 text-slate-300">${formatarMoeda(custoTotal)}</td>
                    <td class="p-2 text-slate-300">${formatarMoeda(precoVenda)}</td>
                    <td class="p-2 text-slate-300">${formatarMoeda(margemR$)}</td>
                    <td class="p-2 text-slate-300">${margemPct.toFixed(1)}%</td>
                    <td class="p-2 ${statusClass}">${statusTexto}</td>
                </tr>
            `;
        });
    });
    tbody.innerHTML = html;
}

// Renderização consolidada do Módulo Financeiro
function renderizarModuloFinanceiroCompleto() {
    renderizarInsumos();
    renderizarServicos();
    renderizarMapaInsumos();
    renderizarCustosFixos();
    atualizarSelectsMapa();
    renderizarResultadosCustos();
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
    if (!precoVenda || precoVenda <= 0) {
        return { permitido: false, msg: "O valor cobrado deve ser maior que zero." };
    }
    const margemReal = ((precoVenda - custoTotal) / precoVenda) * 100;
    
    if (margemReal < margemMinima) {
        console.warn("⚠️ ALERTA: Margem de lucro abaixo do limite de segurança!");
        return {
            permitido: false,
            margemReal: margemReal.toFixed(1),
            msg: `Margem de ${margemReal.toFixed(1)}% é menor que o mínimo exigido de ${margemMinima}%.`
        };
    }

    return {
        permitido: true,
        margemReal: margemReal.toFixed(1),
        msg: "Margem de segurança validada com sucesso."
    };
}

// Disparado ao clicar no botão "Validar Margem e Salvar Atendimento"
async function dispararVerificacaoFinanceira() {
    const valConv = parseFloat(document.getElementById('atdValorConvenio')?.value || 0);
    const valPart = parseFloat(document.getElementById('atdValorParticular')?.value || 0);
    const precoTotal = valConv + valPart;
    const servicoId = document.getElementById('atdServico')?.value;

    if (!servicoId) {
        alert('Selecione um serviço para validar.');
        return false;
    }

    // Busca o custo real vindo da view no Supabase
    let custoTotal = 0;
    let margemMinima = 20;

    try {
        const { data: servico } = await supabaseClient
            .from('vw_custo_servico')
            .select('custo_total, margem_minima')
            .eq('id', servicoId)
            .single();

        if (servico) {
            custoTotal = servico.custo_total || 0;
            margemMinima = servico.margem_minima || 20;
        }
    } catch (err) {
        console.warn('Serviço não encontrado na vw_custo_servico, aplicando validação padrão.', err);
    }

    const verificacao = validarMargemSeguranca(precoTotal, custoTotal, margemMinima);
    const elAlerta = document.getElementById('alertaMargemAtendimento');

    if (!verificacao.permitido) {
        // Exibe o aviso no container HTML dinâmico
        if (elAlerta) {
            elAlerta.classList.remove('hidden');
            elAlerta.innerHTML = `⚠️ <strong>ALERTA DE MARGEM BAIXA:</strong> ${verificacao.msg}`;
        }

        // Pergunta se deseja forçar o salvamento mesmo abaixo da margem
        const prosseguir = confirm(`🛑 ALERTA FINANCEIRO ALAVANCA 360:\n${verificacao.msg}.\n\nDeseja prosseguir e registrar este atendimento assim mesmo?`);
        return prosseguir;
    }

    // Oculta o container de alerta se a margem for aprovada
    if (elAlerta) {
        elAlerta.classList.add('hidden');
    }

    return true;
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

    // Trava de Segurança Financeira (Valida a margem antes de permitir salvar)
    const margemAprovada = await dispararVerificacaoFinanceira();
    if (!margemAprovada) return;

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
        
        // Limpa o alerta da tela após salvar
        const elAlerta = document.getElementById('alertaMargemAtendimento');
        if (elAlerta) elAlerta.classList.add('hidden');

        renderizarAtendimentos();
        if (typeof renderizarDashboardVivo === 'function') {
            renderizarDashboardVivo();
        }
    } catch (e) {
        console.error(e);
        alert('Erro ao registrar atendimento.');
    }
}

async function removerAtendimento(id) {
    if (!confirm('Remover este atendimento?')) return;
    await apiDelete('atendimentos', id);
    state.atendimentos = state.atendimentos.filter(a => a.id !== id);
    renderizarAtendimentos();
    if (typeof renderizarDashboardVivo === 'function') {
        renderizarDashboardVivo();
    }
}

function renderizarAtendimentos() {
    const tbody = document.getElementById('tbodyAtendimentos');
    if (!tbody) {
        console.error('[Alavanca 360] ERRO: #tbodyAtendimentos não encontrado no DOM');
        return;
    }
    console.log('[Alavanca 360] renderizarAtendimentos() chamada. state.atendimentos:', state.atendimentos?.length || 0, 'registros');
    if (!state.atendimentos || state.atendimentos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-600">Nenhum atendimento registrado.</td></tr>`;
        return;
    }
    const ordenados = [...state.atendimentos].sort((a, b) => (b.data_atendimento || '').localeCompare(a.data_atendimento || ''));
    tbody.innerHTML = ordenados.map(a => {
        const total = (Number(a.valor_convenio) || 0) + (Number(a.valor_particular) || 0);
        const tipoLabel = { convenio: 'Convênio', particular: 'Particular', misto: 'Misto' }[a.tipo_pagamento] || a.tipo_pagamento;
        const tipoCor = { convenio: 'bg-sky-950 text-sky-300', particular: 'bg-purple-950 text-purple-300', misto: 'bg-amber-950 text-amber-300' }[a.tipo_pagamento] || 'bg-slate-800 text-slate-300';
        return `
            <tr class="border-b border-slate-800/60 text-xs">
                <td class="p-2 text-slate-200">${a.data_atendimento || ''}</td>
                <td class="p-2 font-medium text-slate-100">${a.paciente_nome || ''}</td>
                <td class="p-2 text-slate-300">${a.servico_nome || ''}</td>
                <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] ${tipoCor}">${tipoLabel}</span></td>
                <td class="p-2 text-emerald-400 font-mono font-bold">${typeof formatarMoeda === 'function' ? formatarMoeda(total) : 'R$ ' + total.toFixed(2)}</td>
                <td class="p-2 text-right"><button onclick="removerAtendimento('${a.id}')" class="text-rose-400 hover:underline">Excluir</button></td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// 12D. DASHBOARD VIVO
// ============================================================

function renderizarDashboardVivo() {
    const el = document.getElementById('dvFaturamentoTotal');
    if (!el) {
        console.error('[Alavanca 360] ERRO: Elemento #dvFaturamentoTotal não encontrado no DOM. A aba dashboard-vivo não será renderizada.');
        return;
    }

    const atendimentos = state.atendimentos || [];
    const faturamentoTotal = atendimentos.reduce((s, a) => s + (Number(a.valor_convenio) || 0) + (Number(a.valor_particular) || 0), 0);

    let margemTotal = 0;
    atendimentos.forEach(a => {
        const servico = (state.servicos || []).find(s => s.id === a.servico_id);
        if (!servico) return;
        
        if (a.tipo_pagamento === 'misto') {
            const rConv = calcularCustoServicoLocal(servico, 'convenio');
            const rPart = calcularCustoServicoLocal(servico, 'particular');
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

    // Atualização dos Elementos no DOM com checagem de segurança
    if (document.getElementById('dvFaturamentoTotal')) document.getElementById('dvFaturamentoTotal').textContent = formatarMoeda(faturamentoTotal);
    if (document.getElementById('dvMargemTotal')) document.getElementById('dvMargemTotal').textContent = formatarMoeda(margemTotal);
    if (document.getElementById('dvPercConvenio')) document.getElementById('dvPercConvenio').textContent = percConvenio.toFixed(0) + '%';
    if (document.getElementById('dvPercParticular')) document.getElementById('dvPercParticular').textContent = percParticular.toFixed(0) + '%';

    // Chamada das funções auxiliares de gráficos e alertas
    if (typeof renderizarGraficoTipoPagamento === 'function') renderizarGraficoTipoPagamento(atendimentos);
    if (typeof renderizarGraficoRankingMargem === 'function') renderizarGraficoRankingMargem();
    if (typeof renderizarAlertasMargem === 'function') renderizarAlertasMargem();
}

function renderizarGraficoTipoPagamento(atendimentos) {
    const canvas = document.getElementById('chartTipoPagamento');
    if (!canvas || typeof Chart === 'undefined') return;

    const somaConvenio = atendimentos.reduce((s, a) => s + (a.tipo_pagamento !== 'particular' ? (Number(a.valor_convenio) || 0) : 0), 0);
    const somaParticular = atendimentos.reduce((s, a) => s + (a.tipo_pagamento !== 'convenio' ? (Number(a.valor_particular) || 0) : 0), 0);

    if (state.charts && state.charts.tipoPagamento) state.charts.tipoPagamento.destroy();
    
    if (!state.charts) state.charts = {};

    state.charts.tipoPagamento = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Convênio', 'Particular'],
            datasets: [{ data: [somaConvenio, somaParticular], backgroundColor: ['#38bdf8', '#a855f7'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#cbd5e1' } } } }
    });
}

// ============================================================
// CONTINUAÇÃO E FECHAMENTO DO DASHBOARD VIVO E MÓDULO FINANCEIRO
// ============================================================

function renderizarGraficoRankingMargem() {
    const canvas = document.getElementById('chartRankingMargem');
    if (!canvas || typeof Chart === 'undefined') return;

    // Prepara dados dos serviços ordenados por margem de lucro (%)
    const dados = state.servicos.map(s => {
        const rPart = calcularCustoServicoLocal(s, 'particular');
        return { nome: s.nome, margemPct: rPart.margemPct };
    }).sort((a, b) => b.margemPct - a.margemPct).slice(0, 8); // Top 8 serviços

    const labels = dados.map(d => d.nome);
    const valores = dados.map(d => d.margemPct);

    if (state.charts.rankingMargem) state.charts.rankingMargem.destroy();

    state.charts.rankingMargem = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Margem % (Particular)',
                data: valores,
                backgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: '#94a3b8' } },
                x: { ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { labels: { color: '#cbd5e1' } } }
        }
    });
}

function renderizarAlertasMargem() {
    const container = document.getElementById('dvContainerAlertas');
    if (!container) return;

    const alertas = [];
    state.servicos.forEach(s => {
        ['convenio', 'particular'].forEach(mod => {
            const r = calcularCustoServicoLocal(s, mod);
            if (r.margemPct < r.margemMinimaConfigurada) {
                alertas.push(`
                    <div class="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex justify-between items-center">
                        <span><strong>${s.nome}</strong> (${mod.toUpperCase()}): Margem de ${r.margemPct.toFixed(1)}% abaixo do mínimo (${r.margemMinimaConfigurada}%).</span>
                        <span class="font-bold text-rose-400">Prejuízo / Risco</span>
                    </div>
                `);
            }
        });
    });

    container.innerHTML = alertas.length > 0 
        ? alertas.join('') 
        : `<p class="text-xs text-emerald-400">✅ Todos os serviços estão operando dentro das margens mínimas de segurança.</p>`;
}

function renderizarModuloFinanceiroCompleto() {
    if (typeof renderizarInsumos === 'function') renderizarInsumos();
    if (typeof renderizarServicos === 'function') renderizarServicos();
    if (typeof renderizarMapaInsumos === 'function') renderizarMapaInsumos();
    if (typeof renderizarCustosFixos === 'function') renderizarCustosFixos();
    if (typeof preencherFormsConfigPrecificacao === 'function') preencherFormsConfigPrecificacao();
    if (typeof rebuildSelectsFinanceiro === 'function') rebuildSelectsFinanceiro();
    if (typeof renderizarResultadoCustos === 'function') renderizarResultadoCustos();
    if (typeof renderizarAtendimentos === 'function') renderizarAtendimentos();
    if (typeof renderizarDashboardVivo === 'function') renderizarDashboardVivo();
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

// ============================================================
// APLICA CONFIGURAÇÕES GLOBAIS NOS CAMPOS E NO FOOTER DA SIDEBAR
// ============================================================
function aplicarConfigNaInterface() {
    const cfg = state.configGlobal || {};

    // 1. Preenche os campos de input dentro do HUB Master
    const inpNome  = document.getElementById('cfgNomeConsultoriaGlobal');
    const inpLogo  = document.getElementById('cfgLogoConsultoria');
    const inpWsp   = document.getElementById('cfgWhatsApp');
    const inpEmail = document.getElementById('cfgEmailConsultoria');

    if (inpNome)  inpNome.value  = cfg.nome_consultoria || '';
    if (inpLogo)  inpLogo.value  = cfg.logo_consultoria_url || '';
    if (inpWsp)   inpWsp.value   = cfg.whatsapp || '';
    if (inpEmail) inpEmail.value = cfg.email_suporte || '';

    // 2. Atualiza o nome da Consultoria no Footer da Sidebar (Imagem 3)
    const lblNome = document.getElementById('lblNomeConsultoria');
    if (lblNome && cfg.nome_consultoria) {
        lblNome.textContent = cfg.nome_consultoria;
    }

    // 3. Atualiza os links de WhatsApp e E-mail no Footer (Imagem 3)
    const lnkWhats = document.getElementById('lnkWhatsConsultoria');
    if (lnkWhats && cfg.whatsapp) {
        const apenasNumeros = cfg.whatsapp.replace(/\D/g, '');
        lnkWhats.href = `https://wa.me/${apenasNumeros}`;
    }

    const lnkEmail = document.getElementById('lnkEmailConsultoria');
    if (lnkEmail && cfg.email_suporte) {
        lnkEmail.href = `mailto:${cfg.email_suporte}`;
    }

    // 4. Exibe a logo da consultoria no footer se houver URL informada
    const containerLogo = document.getElementById('logoConsultoriaContainer');
    const imgLogo = document.getElementById('imgLogoConsultoria');
    if (containerLogo && imgLogo) {
        if (cfg.logo_consultoria_url) {
            imgLogo.src = cfg.logo_consultoria_url;
            containerLogo.classList.remove('hidden');
            containerLogo.classList.add('flex');
        } else {
            containerLogo.classList.add('hidden');
            containerLogo.classList.remove('flex');
        }
    }
}

// ============================================================
// ATUALIZA LINKS DE SUPORTE (SIDEBAR / RODAPÉ LEFE)
// ============================================================
function atualizarLinksRodape() {
    const cfgGlobal = state.configGlobal;
    if (!cfgGlobal) return;

    // Atualiza nome da consultoria
    const lblConsultoria = document.getElementById('lblSidebarConsultoria');
    if (lblConsultoria) {
        lblConsultoria.textContent = cfgGlobal.nome_consultoria || 'Alavanca 360 Consultoria';
    }

    // Link WhatsApp
    const wspNum = cfgGlobal.whatsapp || cfgGlobal.whatsapp_consultoria || '5511964363466';
    const btnWsp = document.getElementById('btnSuporteWhatsapp');
    if (btnWsp) {
        btnWsp.href = `https://wa.me/${wspNum.replace(/\D/g, '')}?text=${encodeURIComponent('Olá! Preciso de suporte no sistema Alavanca 360.')}`;
        btnWsp.target = '_blank';
    }

    // Link E-mail
    const emailStr = cfgGlobal.email_suporte || cfgGlobal.email_consultoria || 'contato@tce-tadeuchicolempowerment.cloud';
    const btnEmail = document.getElementById('btnSuporteEmail');
    if (btnEmail) {
        btnEmail.href = `mailto:${emailStr}?subject=${encodeURIComponent('Suporte - Portal Alavanca 360')}`;
    }
}

// Garante o carregamento automático das configurações globais ao iniciar
async function carregarConfiguracoesGlobais() {
    try {
        const { data, error } = await supabaseClient
            .from('config_global')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            state.configGlobal = data;

            // Preenche os inputs do HUB Master
            const elNome = document.getElementById('cfgNomeConsultoriaGlobal');
            const elLogo = document.getElementById('cfgLogoConsultoria');
            const elWsp  = document.getElementById('cfgWhatsApp');
            const elMail = document.getElementById('cfgEmailConsultoria');

            if (elNome) elNome.value = data.nome_consultoria || '';
            if (elLogo) elLogo.value = data.logo_consultoria_url || '';
            if (elWsp)  elWsp.value  = data.whatsapp || '';
            if (elMail) elMail.value = data.email_suporte || '';

            atualizarLinksRodape();
            if (typeof atualizarLogosVisuais === 'function') atualizarLogosVisuais();
        }
    } catch (e) {
        console.warn("Aviso ao carregar config_global:", e.message);
    }
}

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

// Auxiliar para fazer o upload do arquivo de Imagem para o Supabase Storage
async function uploadLogoSupabaseStorage(arquivo, bucket = 'logos-clinicas') {
    if (!arquivo) return null;

    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!tiposPermitidos.includes(arquivo.type)) {
        alert('Formato de arquivo inválido. Envie apenas imagens em JPEG ou PNG.');
        return null;
    }

    if (arquivo.size > 2 * 1024 * 1024) {
        alert('A imagem é muito pesada. O tamanho máximo permitido é 2MB.');
        return null;
    }

    const extensao = arquivo.name.split('.').pop() || 'png';
    const pathArquivo = `logo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${extensao}`;

    try {
        const { data, error } = await supabaseClient.storage
            .from(bucket)
            .upload(pathArquivo, arquivo, {
                cacheControl: '0',
                upsert: true
            });

        if (error) throw error;

        const { data: urlData } = supabaseClient.storage
            .from(bucket)
            .getPublicUrl(pathArquivo);

        return urlData.publicUrl;

    } catch (err) {
        console.error('Falha no upload para o Storage:', err);
        alert('Não foi possível fazer o upload da imagem. Verifique se o bucket "logos-clinicas" existe e é Público no Supabase.');
        return null;
    }
}

// ============================================================
// 1. HUB CLÍNICA - SALVAR DADOS BÁSICOS E UPLOAD ATÔMICO
// ============================================================
async function salvarHubClinicaBasico() {
    if (!state.clinicaAtual) {
        alert("Nenhuma clínica ativa no momento.");
        return;
    }

    const nome = (document.getElementById('hubClinicaNome') || document.getElementById('cfgNomeClinica'))?.value.trim() || '';
    const endereco = (document.getElementById('hubClinicaEndereco') || document.getElementById('cfgEndereco'))?.value.trim() || '';
    const urlSheets = (document.getElementById('hubClinicaGoogleAgenda') || document.getElementById('cfgUrlSheets'))?.value.trim() || '';
    const urlCalendly = (document.getElementById('hubClinicaCalendly') || document.getElementById('cfgUrlCalendly'))?.value.trim() || '';
    const fileInput = document.getElementById('cfgLogoLocalFile') || document.getElementById('hubClinicaLogoFile');

    if (!nome) {
        alert("O nome da clínica é obrigatório.");
        return;
    }

    try {
        let logoUrl = state.clinicaAtual.logo_clinica_url || '';

        // UPLOAD DIRETO PARA O SUPABASE STORAGE
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];

            if (!['image/png', 'image/jpeg'].includes(file.type)) {
                alert('Por favor, selecione apenas arquivos nos formatos PNG ou JPEG.');
                return;
            }

            const extensao = file.name.split('.').pop();
            const fileName = `logo_${state.clinicaAtual.id}_${Date.now()}.${extensao}`;

            const { data: storageData, error: storageError } = await supabaseClient
                .storage
                .from('logos-clinicas')
                .upload(fileName, file, { cacheControl: '3600', upsert: true });

            if (storageError) throw storageError;

            // Resgata a URL Pública Gerada
            const { data: urlData } = supabaseClient
                .storage
                .from('logos-clinicas')
                .getPublicUrl(fileName);

            if (urlData && urlData.publicUrl) {
                logoUrl = urlData.publicUrl;
            }
        }

        // ATUALIZA O BANCO DE DADOS (SUPABASE)
        const { data: clinicaAtualizada, error: updateError } = await supabaseClient
            .from('clinicas')
            .update({
                nome: nome,
                nome_clinica: nome,
                endereco: endereco,
                url_google_agenda: urlSheets,
                url_calendly: urlCalendly,
                logo_clinica_url: logoUrl
            })
            .eq('id', state.clinicaAtual.id)
            .select()
            .single();

        if (updateError) throw updateError;

        // ATUALIZA A MEMÓRIA DA APLICAÇÃO (STATE) E O LOCAL STORAGE
        state.clinicaAtual = clinicaAtualizada;
        localStorage.setItem('alavanca_clinica', JSON.stringify(clinicaAtualizada));

        // ATUALIZA A INTERFACE IMEDIATAMENTE
        if (typeof atualizarLogosVisuais === 'function') {
            atualizarLogosVisuais();
        }

        // LIMPA O INPUT DE ARQUIVO
        if (fileInput) fileInput.value = '';

        alert("Dados corporativos e logotipo salvos com sucesso!");

    } catch (e) {
        console.error("Erro ao salvar HUB Clínica:", e);
        alert("Erro ao salvar: " + (e.message || e));
    }
}

// ============================================================
// 2. HUB CLÍNICA - SINCRONIZADOR DE INSUMOS DO GOOGLE SHEETS
// ============================================================
async function sincronizarDadosPlanilhaGoogle() {
    if (!state.clinicaAtual || !state.clinicaAtual.url_google_agenda) {
        alert("Cadastre a URL da planilha no campo 'Link Integrador Google Agenda' e salve antes de sincronizar.");
        return;
    }

    const btn = document.getElementById('btnSincronizarPlanilha');
    const originalText = btn ? btn.textContent : 'Sincronizar Insumos (Planilha)';
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sincronizando...';
    }

    try {
        const urlStr = state.clinicaAtual.url_google_agenda.trim();
        let urlCsv = '';

        if (urlStr.includes('@') && !urlStr.includes('http')) {
            throw new Error("O campo contém um endereço de e-mail em vez de um link. Por favor, insira a URL da Planilha Google.");
        }

        if (urlStr.includes('/pub?') || urlStr.includes('output=csv')) {
            urlCsv = urlStr;
        } else {
            const matches = urlStr.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (!matches || !matches[1]) {
                throw new Error("Link da planilha inválido. Verifique se copiou a URL completa da planilha do Google Sheets.");
            }
            const spreadsheetId = matches[1];
            urlCsv = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
        }

        const response = await fetch(urlCsv);
        if (!response.ok) {
            throw new Error("Não foi possível acessar a planilha. Verifique se as permissões de acesso estão como 'Qualquer pessoa com o link'.");
        }

        const csvText = await response.text();
        
        const linhas = csvText.split('\n').map(l => {
            const cols = [];
            let inQuotes = false;
            let val = '';
            for (let i = 0; i < l.length; i++) {
                let char = l[i];
                if (char === '"') { inQuotes = !inQuotes; }
                else if (char === ',' && !inQuotes) { cols.push(val.trim()); val = ''; }
                else { val += char; }
            }
            cols.push(val.trim());
            return cols.map(c => c.replace(/^"|"$/g, '').trim());
        });

        if (linhas.length <= 1) {
            throw new Error("A planilha está vazia ou não foi possível ler as colunas de insumos.");
        }

        const { error: deleteError } = await supabaseClient
            .from('insumos')
            .delete()
            .eq('clinica_id', state.clinicaAtual.id);

        if (deleteError) throw deleteError;

        let totalInserido = 0;

        for (let i = 1; i < linhas.length; i++) {
            const col = linhas[i];
            if (col.length < 2 || !col[0]) continue;

            const nome = col[0];
            const apresentacao = col[1] || 'Geral';
            
            let rawCusto = col[2] || '0';
            if (rawCusto.includes(',') && (!rawCusto.includes('.') || rawCusto.lastIndexOf(',') > rawCusto.lastIndexOf('.'))) {
                rawCusto = rawCusto.replace(/\./g, '').replace(',', '.');
            }
            const custo = parseFloat(rawCusto.replace(/[^0-9.-]+/g, "")) || 0;
            const unidade = col[3] || 'Unidade';

            const { error: insertError } = await supabaseClient
                .from('insumos')
                .insert({
                    clinica_id: state.clinicaAtual.id,
                    nome: nome,
                    apresentacao: apresentacao,
                    quantidade_apresentacao: 1,
                    preco_apresentacao: custo,
                    custo_unitario: custo,
                    unidade_medida: unidade
                });

            if (insertError) throw insertError;
            totalInserido++;
        }

        alert(`Sincronização concluída com sucesso!\n\n${totalInserido} insumos foram atualizados na base de dados da clínica.`);

        if (typeof apiList === 'function') {
            apiList('insumos', { clinica_id: state.clinicaAtual.id });
        }

    } catch (e) {
        console.error("Erro ao sincronizar insumos:", e);
        alert("Erro na sincronização: " + (e.message || e));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

// ============================================================
// 3. RENDERIZADOR DE LOGOS E NOME DA CLÍNICA NO HEADER
// ============================================================
function atualizarLogosVisuais() {
    const clinica = state.clinicaAtual;
    const cfgGlobal = state.configGlobal;

    const imgLogoClinica = document.getElementById('imgLogoClinicaNav');
    const iconDefault = document.getElementById('iconDefaultClinica');
    const imgLogoMetodo = document.getElementById('imgLogoMetodoNav');
    const lblNomeClinica = document.getElementById('lblNomeClinicaNav');

    if (lblNomeClinica && clinica) {
        lblNomeClinica.textContent = clinica.nome_clinica || clinica.nome || clinica.email_responsavel || 'Clínica Conectada';
    }

    if (clinica && clinica.logo_clinica_url) {
        if (imgLogoClinica) {
            imgLogoClinica.src = clinica.logo_clinica_url;
            imgLogoClinica.classList.remove('hidden');
        }
        if (iconDefault) iconDefault.classList.add('hidden');
    } else {
        if (imgLogoClinica) imgLogoClinica.classList.add('hidden');
        if (iconDefault) iconDefault.classList.remove('hidden');
    }

    const logoMetodoPadrao = 'https://gtcybiuxdpxixdjnshty.supabase.co/storage/v1/object/public/logos-clinicas/logo-alavanca360.png';
    if (imgLogoMetodo) {
        imgLogoMetodo.src = (cfgGlobal && cfgGlobal.logo_metodo_url) || logoMetodoPadrao;
        imgLogoMetodo.classList.remove('hidden');
    }
}

// ============================================================
// 14. HUB MASTER (CONSULTORIA — GESTÃO DE CLÍNICAS/TENANTS)
// ============================================================
async function prepararHubMaster() {
    const hubGatekeeper = document.getElementById('hubGatekeeper');
    const hubConteudoOculto = document.getElementById('hubConteudoOculto');
    
    if (hubGatekeeper) hubGatekeeper.classList.add('hidden');
    if (hubConteudoOculto) hubConteudoOculto.classList.remove('hidden');

    await carregarConfigGlobal();

    const cfgLogoMetodo = document.getElementById('cfgLogoMetodo') || document.getElementById('hubMasterLogoMetodoUrl');
    const cfgLogoConsultoria = document.getElementById('cfgLogoConsultoria');
    const cfgNomeConsultoriaGlobal = document.getElementById('cfgNomeConsultoriaGlobal');
    const cfgWhatsApp = document.getElementById('cfgWhatsApp');
    const cfgEmailConsultoria = document.getElementById('cfgEmailConsultoria');

    if (cfgLogoMetodo) cfgLogoMetodo.value = (state.configGlobal?.logo_metodo_url) || '';
    if (cfgLogoConsultoria) cfgLogoConsultoria.value = (state.configGlobal?.logo_consultoria_url) || (state.configGlobal?.logo_metodo_url) || '';
    if (cfgNomeConsultoriaGlobal) cfgNomeConsultoriaGlobal.value = (state.configGlobal?.nome_consultoria) || '';
    if (cfgWhatsApp) cfgWhatsApp.value = (state.configGlobal?.whatsapp) || '';
    if (cfgEmailConsultoria) cfgEmailConsultoria.value = (state.configGlobal?.email_suporte) || '';

    if (typeof aplicarConfigNaInterface === 'function') aplicarConfigNaInterface();

    await renderizarListaClinicas();
}

function aplicarConfigNaInterface() {
    const cfg = state.configGlobal || {};

    const lblNome = document.getElementById('lblNomeConsultoria');
    if (lblNome && cfg.nome_consultoria) {
        lblNome.textContent = cfg.nome_consultoria;
    }

    const lnkWhats = document.getElementById('lnkWhatsConsultoria');
    if (lnkWhats && cfg.whatsapp) {
        const num = cfg.whatsapp.replace(/\D/g, '');
        lnkWhats.onclick = (e) => {
            e.preventDefault();
            window.open(`https://wa.me/${num}`, '_blank');
        };
    }

    const lnkEmail = document.getElementById('lnkEmailConsultoria');
    if (lnkEmail && cfg.email_suporte) {
        lnkEmail.onclick = (e) => {
            e.preventDefault();
            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(cfg.email_suporte)}&su=Suporte%20-%20Alavanca%20360`;
            window.open(gmailUrl, '_blank');
        };
    }

    const imgLogoMetodo = document.getElementById('imgLogoMetodo');
    if (imgLogoMetodo && cfg.logo_metodo_url) {
        imgLogoMetodo.src = cfg.logo_metodo_url;
    }
}

async function salvarConfigGlobal() {
    const nome  = document.getElementById('cfgNomeConsultoriaGlobal')?.value.trim() || '';
    const logo  = document.getElementById('cfgLogoConsultoria')?.value.trim() || document.getElementById('cfgLogoMetodo')?.value.trim() || '';
    const wsp   = document.getElementById('cfgWhatsApp')?.value.trim() || '';
    const email = document.getElementById('cfgEmailConsultoria')?.value.trim() || '';

    try {
        const payload = {
            id: 1,
            nome_consultoria: nome,
            logo_consultoria_url: logo,
            logo_metodo_url: logo,
            whatsapp: wsp,
            email_suporte: email,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabaseClient
            .from('config_global')
            .upsert(payload)
            .select()
            .single();

        if (error) throw error;

        state.configGlobal = data || payload;
        aplicarConfigNaInterface();

        alert("✅ Configurações Globais e Suporte salvos com sucesso!");
    } catch (e) {
        console.error("Erro ao salvar marca global:", e);
        alert("Erro ao salvar configurações globais: " + (e.message || e));
    }
}

async function renderizarListaClinicas() {
    const tbody = document.getElementById('tbodyClinicasMaster');
    if (!tbody) return;

    const { data: todas, error } = await supabaseClient
        .from('clinicas')
        .select('*')
        .order('nome', { ascending: true });

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
            <td class="p-2 text-slate-200 font-semibold">${c.nome || c.nome_clinica || ''}</td>
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
        alert('A senha precisa ter pelo menos 6 caracteres.');
        return;
    }

    const btn = document.getElementById('btnCadastrarClinica');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando acesso...'; }

    try {
        if (!supabaseAuxClient) {
            throw new Error('O cliente auxiliar do Supabase não está configurado.');
        }

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
            alert('Não foi possível obter o ID do novo usuário.');
            return;
        }

        await apiCreate('clinicas', {
            owner_user_id: novoUserId,
            nome: nome_clinica,           
            nome_clinica: nome_clinica,    
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

        document.getElementById('novaClinicaNome').value = '';
        document.getElementById('novaClinicaCodigo').value = '';
        document.getElementById('novaClinicaSenha').value = '';
        document.getElementById('novaClinicaResponsavel').value = '';

        alert('Clínica cadastrada com sucesso!\n\nLogin: ' + email_login);
        renderizarListaClinicas();
    } catch (e) {
        console.error(e);
        alert('Erro ao cadastrar clínica: ' + (e.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Cadastrar Clínica e Gerar Acesso'; }
    }
}

// ============================================================
// BLOCO DE AUTENTICAÇÃO E CONTEXTO
// ============================================================

async function autenticarClinica() {
    const email = (document.getElementById('inputCodigoAcesso')?.value || '').trim();
    const senha = (document.getElementById('inputSenhaAcesso')?.value || '').trim();

    if (!email || !senha) {
        mostrarTelaLogin('Informe o e-mail e a senha de acesso.');
        return;
    }

    const btn = document.getElementById('btnEntrarSistema');
    const textoOriginal = btn ? btn.textContent : '→ Entrar no Sistema';
    if (btn) {
        btn.textContent = 'Verificando...';
        btn.disabled = true;
    }

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
        if (btn) {
            btn.textContent = textoOriginal;
            btn.disabled = false;
        }
    }
}

function mostrarTelaLogin(mensagem) {
    const elErro = document.getElementById('loginErro');
    if (elErro) {
        if (mensagem) {
            elErro.textContent = mensagem;
            elErro.classList.remove('hidden');
        } else {
            elErro.classList.add('hidden');
        }
    } else if (mensagem) {
        alert(mensagem);
    }
}

function traduzErroSupabase(msg) {
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.';
    if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado. Verifique a caixa de entrada.';
    return msg || 'Erro ao conectar ao servidor.';
}

async function carregarContextoUsuario(user) {
    state.usuario = user;

    const { data: adminData } = await supabaseClient
        .from('consultoria_admins')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

    state.isAdmin = !!adminData;

    const { data: clinicas, error } = await supabaseClient
        .from('clinicas')
        .select('*')
        .eq('owner_user_id', user.id)
        .maybeSingle();

    if (!error && clinicas) {
        if (clinicas.ativo === false && !state.isAdmin) {
            return false;
        }
        state.clinicaAtual = clinicas;
    } else {
        state.clinicaAtual = null;
    }

    if (state.clinicaAtual) {
        state.isAdmin = false;
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
    if (typeof init === 'function') {
        await init();
    }
}

// ============================================================
// REFRESH E POVOAMENTO COMPLETO DA INTERFACE
// ============================================================
function renderizarModuloFinanceiroCompleto() {
    renderizarInsumos();
    renderizarServicos();
    renderizarMapaInsumos();
    renderizarCustosFixos();
    preencherFormsConfigPrecificacao();
    rebuildSelectsFinanceiro();
    renderizarResultadoCustos();
    renderizarAtendimentos();
    renderizarDashboardVivo();
}

// ============================================================
// FUNCIONALIDADES DE DISPARO DE CONTATO E DOCUMENTOS (HUB / M7)
// ============================================================

function dispararContatoSuporteSaaS(meio) {
    const emailConsultoria = state.configGlobal?.email_suporte || '';
    const whatsConsultoria = state.configGlobal?.whatsapp || '';
    const nomeClinica = state.clinicaAtual?.nome_clinica || state.clinicaAtual?.nome || 'Minha Clínica';
    const emailClinica = state.clinicaAtual?.email_responsavel || 'Não cadastrado';

    if (meio === 'whatsapp') {
        if (!whatsConsultoria) { alert('Número de WhatsApp do Suporte não configurado no HUB Master.'); return; }
        const numClean = whatsConsultoria.replace(/\D/g, '');
        const msg = encodeURIComponent(`Olá Suporte Alavanca 360! Sou da clínica "${nomeClinica}" e preciso de auxílio.`);
        window.open(`https://wa.me/${numClean}?text=${msg}`, '_blank');
    } else if (meio === 'email') {
        if (!emailConsultoria) { alert('E-mail do Suporte não configurado no HUB Master.'); return; }
        const assunto = encodeURIComponent(`[Suporte SaaS] Solicitação de Atendimento - ${nomeClinica}`);
        const corpo = encodeURIComponent(`Clínica: ${nomeClinica}\nE-mail da Clínica: ${emailClinica}\n\nDescreva sua dúvida/problema aqui:`);
        window.open(`mailto:${emailConsultoria}?subject=${assunto}&body=${corpo}`, '_blank');
    }
}

function dispararDocumentoCliente(meio) {
    const selPac = document.getElementById('selectDocPaciente');
    const selTipo = document.getElementById('selectTipoDoc');
    const pacName = selPac ? selPac.value : '';
    const tipo = selTipo ? selTipo.value : 'documento';

    const paciente = state.pacientes?.find(p => p.nome === pacName);
    const nomeClinica = state.clinicaAtual?.nome_clinica || state.clinicaAtual?.nome || 'Nossa Clínica';
    const enderecoClinica = state.clinicaAtual?.endereco || '';
    const docNome = tipo === 'orcamento' ? 'Orçamento/Planejamento' : 'Receituário';

    if (meio === 'whatsapp') {
        const telefone = paciente?.telefone || paciente?.whatsapp || prompt('Digite o número do WhatsApp do cliente com DDD:');
        if (!telefone) return;
        const numClean = telefone.replace(/\D/g, '');
        const msg = encodeURIComponent(`Olá ${pacName}, segue o seu ${docNome} referente ao atendimento na clínica ${nomeClinica}.\n📍 Endereço: ${enderecoClinica}`);
        window.open(`https://wa.me/${numClean}?text=${msg}`, '_blank');
    } else if (meio === 'email') {
        const emailPac = paciente?.email || prompt('Digite o e-mail do cliente:');
        if (!emailPac) return;
        const assunto = encodeURIComponent(`${docNome} - ${nomeClinica}`);
        const corpo = encodeURIComponent(`Olá ${pacName},\n\nAnexo/Segue a via do seu ${docNome} emitido por ${nomeClinica}.\n\nAtenciosamente,\n${nomeClinica}\n${enderecoClinica}`);
        window.open(`mailto:${emailPac}?subject=${assunto}&body=${corpo}`, '_blank');
    }
}
