# ALAVANCA 360® — Sistema SaaS Multi-Clínica (Supabase + VPS própria)

## 🎯 Sobre o Projeto

O **ALAVANCA 360®** nasceu como uma **metodologia de consultoria estratégica** para
clínicas — antes de existir qualquer software. O documento de origem do método
(`docs/ALAVANCA_360_Metodo_Completo.docx`) explica que a consultoria trabalha
simultaneamente **6 grandes pilares** da operação de uma clínica, e que o Sistema
ALAVANCA 360® nasceu justamente porque, terminada a consultoria presencial, muitas
clínicas voltavam aos processos antigos por falta de acompanhamento operacional
contínuo. O software existe para **sustentar na prática, todos os dias**, o que a
consultoria implanta estrategicamente.

Este projeto é o **sistema operacional (SaaS)** que dá vida a essa metodologia,
desenhado para atender **múltiplas clínicas simultaneamente** — odontológicas,
estéticas, de design de sobrancelhas, harmonização facial, etc. — com foco especial em
**negócios liderados por mulheres, para um público majoritariamente feminino**.

## 🏗️ Arquitetura Escolhida: Controle Total, Custo Zero

A partir desta etapa, o sistema foi migrado para uma arquitetura pensada para rodar
**inteiramente sob o seu controle**, sem depender de nenhuma plataforma paga:

| Peça | Papel | Custo |
|---|---|---|
| **Sua VPS Hostinger** | Hospeda os arquivos do site (`index.html`, `app.js`) via Nginx | Você já paga pela VPS |
| **Supabase** | Banco de dados PostgreSQL real + Autenticação segura (senhas com hash, sessões JWT) + Row Level Security (isolamento de dados por clínica garantido pelo próprio banco) | **Gratuito** (plano Free) |
| **Let's Encrypt** | Certificado HTTPS para o seu domínio | Gratuito |

➡️ **Guias passo a passo prontos:**
- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) — criar o banco de dados, tabelas e seu login de administrador.
- [`docs/DEPLOY_HOSTINGER.md`](docs/DEPLOY_HOSTINGER.md) — publicar os arquivos na sua VPS com Nginx + HTTPS.
- [`docs/GUIA_MODULO_FINANCEIRO.md`](docs/GUIA_MODULO_FINANCEIRO.md) — usar Custos & Insumos, Atendimentos, Dashboard Vivo e Assistente de Decisão.
- [`docs/GUIA_AUTOMACOES.md`](docs/GUIA_AUTOMACOES.md) — conectar Google, WhatsApp e e-mail (automações).

Depois de seguir os dois guias, você terá o sistema **rodando 100% na sua própria
infraestrutura**, acessível de qualquer computador/celular do mundo, com dados reais
persistidos e login seguro — sem pagar nada além do que já paga pela VPS.

---

## 🏢 Arquitetura Multi-Tenant (Cada Clínica com Login e Dados Próprios)

- Cada clínica é uma conta de login real do **Supabase Auth** (e-mail + senha com
  hash criptográfico), vinculada a um registro na tabela `clinicas`.
- O isolamento de dados **não depende mais de filtros no JavaScript**: ele é garantido
  pelo próprio banco de dados via **Row Level Security (RLS)** — mesmo que alguém
  manipule o código do navegador, o PostgreSQL recusa qualquer tentativa de acessar
  dados de outra clínica.
- Pode ter **seu próprio logo** (identidade da clínica), exibido no cabeçalho e nos
  documentos emitidos, sem perder a identidade visual do Método (ver seção seguinte).
- A gestão de todas as clínicas (criar novo login, suspender/reativar acesso) é feita
  pela Consultoria através do **HUB Master**, liberado automaticamente para qualquer
  usuário cadastrado na tabela `consultoria_admins` (sem chave/senha extra no
  navegador — a permissão é validada pelo banco).

### Como criar seu acesso de Administrador e sua primeira clínica
Siga o **Passo 5** e **Passo 6** de [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).

---

## 🎨 Identidade Visual — 3 Camadas de Marca

| Camada | O que é | Onde é definida |
|---|---|---|
| **1. Logo do Método ALAVANCA 360®** | Identidade oficial do método (`images/logo-alavanca-360.png`) — aparece na tela de login e no cabeçalho de todas as clínicas. | HUB Master → "Identidade Visual Global" |
| **2. Logo da Consultoria** | Marca de quem administra o SaaS. Aparece no rodapé lateral do sistema. | HUB Master → "Identidade Visual Global" |
| **3. Logo de cada Clínica** | Identidade própria de cada clínica-cliente. Aparece no cabeçalho da própria clínica e nos documentos que ela emite (M7). | HUB Clínica (visível apenas para quem está logado naquela clínica) |

A logo do Método foi criada com uma composição de setas em círculo (conceito de "360°"
de melhoria contínua) e uma alavanca em equilíbrio sobre um fulcro dourado, em paleta
azul-marinho, verde-esmeralda e dourado.

---

## 💰 Módulo Financeiro Vivo (Fase 2 — Custos, Atendimentos, Dashboard e Assistente)

Essa camada nasceu para resolver um pedido direto: transformar a planilha de
custos/preços do Google Sheets (usada hoje pela Clínica NAP 5AH — Odontologia)
em uma funcionalidade nativa do sistema, multi-tenant, reaproveitável por
qualquer negócio "mulher para mulher" (odontologia, estética, saúde).

### Módulo 8 — Custos & Insumos
Cadastro de **insumos** (com custo unitário calculado automaticamente pelo
banco), **serviços/procedimentos**, **consumo de insumo por serviço**,
**custos fixos mensais** e **parâmetros de precificação separados para
Convênio e Particular** (pró-labore, margem mínima/desejada, impostos, taxa
de maquininha). A aba "Custo Final por Procedimento" mostra, em tempo real,
custo total × preço de venda × margem (R$ e %), com alerta quando abaixo do
mínimo configurado.

**Importador de CSV multi-entidade (migração sem retrabalho):** a sub-aba
"Importar Planilha (CSV)" reconhece pelo **nome real das colunas** (não por
posição) as abas da planilha padrão — Insumos, Serviços/Procedimentos,
Vínculo Insumo×Serviço, Custos Fixos e Config. Convênio/Particular —
tratando números em formato brasileiro ("1 000,00"), ignorando linhas de
total e fazendo **upsert por código de origem** (reimportar o mesmo
arquivo atualiza em vez de duplicar). Uma clínica que já tem sua planilha
pronta consegue trazer todo o histórico de custos para o sistema em
minutos — ver o passo a passo em `docs/GUIA_MODULO_FINANCEIRO.md` (seção
"Migração de uma planilha real, sem retrabalho").

### Módulo 9 — Atendimentos
Registro de cada procedimento realizado por paciente, com o tipo de
pagamento: **Convênio**, **Particular** ou **Misto** — a peça que a
planilha original previa (aba `VENDAS_ATENDIMENTOS`) mas nunca chegou a
implementar. É a base do cruzamento cliente × custo × margem.

### Dashboard Vivo
Faturamento total, margem total estimada, % de atendimentos por
modalidade, gráfico de faturamento por tipo de pagamento (Chart.js),
ranking de procedimentos por margem e alertas automáticos de margem
abaixo do mínimo — tudo recalculado a cada atendimento novo.

### Assistente de Decisão
Motor de cálculo (não é IA generativa — ver nota de transparência no
guia) que responde à pergunta "qual o melhor equilíbrio entre convênio e
particular?" usando os dados reais da clínica: mix atual, margem média
por modalidade, ponto de equilíbrio mensal, recomendação textual e um
**simulador "E se..."** interativo.

### Template de planilha padrão
Em [`templates/planilha-padrao/`](templates/planilha-padrao/), um modelo
CSV redesenhado (insumos, serviços, custos fixos) pronto para ser
reaproveitado por qualquer novo negócio cadastrado na plataforma, com um
guia de boas práticas de formatação para quem preferir manter também uma
planilha visual no Google Sheets.

### Integrações e automações (estrutura de dados pronta)
Tabelas `integracoes_clinica` e `automacoes_config`/`automacoes_log`
(ver [`sql/schema_integracoes.sql`](sql/schema_integracoes.sql)) já
modelam a conexão de cada clínica com Google (Agenda/Sheets via OAuth),
WhatsApp (Meta Cloud API) e e-mail transacional, além de lembretes de
consulta, recall, aniversário, pesquisa de satisfação e recuperação de
no-show — ver [`docs/GUIA_AUTOMACOES.md`](docs/GUIA_AUTOMACOES.md) para o
passo a passo de configuração (inclusive como usar uma conta Google
gratuita para toda a plataforma).

---

## ✅ Funcionalidades Implementadas

### 🔐 Login / Multi-Tenant (Supabase Auth)
- Tela de login com e-mail + senha, autenticado via Supabase Auth.
- Sessão persistida com token JWT (login permanece ativo entre visitas, até logout
  manual ou expiração do token).
- Bloqueio automático de acesso para clínicas suspensas (`ativo = false`), exceto
  para administradores.

### Módulo 1 — Visão Executiva (CEO Dashboard)
Cards de Receita Bruta, Total de Pacientes, Ticket Médio e LTV Médio, calculados
dinamicamente a partir dos pacientes **da clínica logada**.

### Módulo 2 — Inteligência Financeira
Auditoria por "Match Code" (busca por nome), com Score Financeiro (Alto/Médio/Baixo).

### Módulo 3 — Inteligência Comercial
Funil de Atração Estratégica, liberado a partir de 3 pacientes cadastrados.

### Módulo 4 — Inteligência de Tratamentos
Receita por categoria (Implantes, Ortodontia, Harmonização).

### Módulo 5 — Base de Clientes (Cadastro + Prontuário)
CRUD completo de pacientes, *Índice de Reconexão com o Sorriso™*, *Opportunity Score*,
linha do tempo de Prontuário Evolutivo — registros emitidos pelo M7 ficam **travados**
no próprio banco (o PostgreSQL recusa a exclusão, não apenas a interface).

### Módulo 6 — Agenda Interna
CRUD de agendamentos com filtros Dia/Semana/Mês.

### Módulo 7 — Estação de Documentos
Emissão de Orçamento/Receituário com template dinâmico (nome, endereço e logo da
própria clínica); documento é salvo e injetado (travado) no prontuário do paciente.

### HUB Clínica (por clínica)
Configurações operacionais próprias: nome, endereço, links de agenda e logo.

### HUB Master (Consultoria)
- Acesso automático para administradores cadastrados no banco.
- Edição da identidade visual **global** (Logo do Método, Logo da Consultoria, Nome).
- **Cadastro de novas clínicas**, criando automaticamente o login (Supabase Auth) e o
  registro operacional vinculado.
- **Listagem de todas as clínicas** com status e botão de suspender/reativar.

---

## 🌐 Entradas Funcionais

- **`/index.html`** — Ponto de entrada único. Tela de login; após autenticação, exibe
  a aplicação completa (SPA, navegação via `switchTab()`).
- Não há back-end/servidor de aplicação próprio: toda a persistência ocorre
  diretamente do navegador para o **Supabase** (`supabase-js`), protegida por Row
  Level Security.

---

## 🗄️ Modelo de Dados (Tabelas no Supabase/PostgreSQL)

Ver definição completa e comentada em [`sql/schema.sql`](sql/schema.sql).

| Tabela | Descrição |
|---|---|
| `clinicas` | Um registro por clínica/tenant, vinculado a um usuário do Supabase Auth (`owner_user_id`). |
| `consultoria_admins` | Lista de usuários com acesso ao HUB Master (gerenciada apenas via SQL Editor, por segurança). |
| `config_global` | Registro único (`id = 'global'`) com a identidade visual do Método e dados da Consultoria. |
| `pacientes` | Cadastro completo do paciente/cliente, com `clinica_id`. |
| `prontuario_evolutivo` | Linha do tempo clínica, com `clinica_id` e `travado` (bloqueio de exclusão a nível de banco). |
| `agendamentos` | Compromissos da agenda interna, com `clinica_id`. |
| `profissionais` | Dentistas/profissionais de cada clínica, com `clinica_id`. |
| `documentos_emitidos` | Histórico de orçamentos/receituários emitidos, com `clinica_id`. |

Todas as tabelas usam **Row Level Security (RLS)** — as políticas de acesso estão
documentadas dentro do próprio `sql/schema.sql`.

### Módulo Financeiro (ver [`sql/schema_financeiro.sql`](sql/schema_financeiro.sql))

| Tabela/View | Descrição |
|---|---|
| `insumos` | Matérias-primas/produtos, com custo unitário calculado automaticamente (coluna gerada) e `codigo_externo` (código da planilha de origem, usado para upsert na importação de CSV). |
| `servicos` | Procedimentos/serviços oferecidos, com tempo médio, preços Convênio/Particular e `codigo_externo`. |
| `mapa_insumos_servicos` | Consumo de cada insumo por serviço (N:N). |
| `custos_fixos` | Aluguel, internet, contador etc. (mensal). |
| `kit_operacao_itens` | Consumíveis de sala (EPI) ratreados por cenário. |
| `config_precificacao` | Parâmetros de precificação, uma linha por modalidade (`convenio`/`particular`). |
| `atendimentos` | Procedimento realizado por paciente, com `tipo_pagamento` (convenio/particular/misto). |
| `vw_custo_servico` | **View calculada automaticamente** (não uma tabela fixa) com custo total, preço e margem por serviço/modalidade — sempre atualizada quando um insumo ou config muda. |

### Integrações e Automações (ver [`sql/schema_integracoes.sql`](sql/schema_integracoes.sql))

| Tabela | Descrição |
|---|---|
| `integracoes_clinica` | Estado de conexão de cada clínica com Google/WhatsApp/E-mail. |
| `automacoes_config` | Regras de automação (lembrete, recall, aniversário etc.) configuráveis por clínica. |
| `automacoes_log` | Histórico de disparos, para auditoria e métricas. |

---

## 🚀 Como colocar no ar (passo a passo resumido)

1. **Banco de dados**: siga [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) — criar
   projeto Supabase, rodar `sql/schema.sql`, pegar suas credenciais, criar seu login
   de administrador.
2. **Configurar credenciais**: edite `js/supabase-config.js` com a URL e a chave
   `anon public` do seu projeto Supabase.
3. **Publicar na sua VPS**: siga [`docs/DEPLOY_HOSTINGER.md`](docs/DEPLOY_HOSTINGER.md)
   — copiar os arquivos para a VPS, configurar Nginx, apontar seu domínio e ativar
   HTTPS gratuito.
4. **Testar**: acesse seu domínio, faça login como administrador, cadastre sua
   primeira clínica pelo HUB Master, e faça login com essa clínica para validar o
   fluxo completo.

> Alternativa rápida para testes: você também pode publicar esta mesma versão pela
> aba **Publish** desta plataforma (gera um link imediato), mantendo o Supabase como
> banco de dados — útil para validar tudo antes de migrar definitivamente para a VPS.

---

## 🔒 Por que esse nível de segurança é real (e não apenas "aparente")

- Senhas nunca ficam em texto puro em nenhuma tabela — o Supabase Auth as armazena
  com hash criptográfico.
- O isolamento entre clínicas é garantido **pelo banco de dados**, não pelo
  JavaScript do navegador (Row Level Security) — um ataque que manipule o código do
  site não consegue "enganar" o banco para ler dados de outra clínica.
- Sessões usam tokens JWT com expiração automática.
- HTTPS (Let's Encrypt) garante que os dados trafegam criptografados entre o
  navegador e o Supabase/sua VPS.

## 🚧 Funcionalidades Ainda Não Implementadas

- Perfis de usuário dentro de uma mesma clínica (hoje o login é por clínica, não por
  funcionário individual — ex.: recepção vs. dono vs. profissional de saúde).
- Cobrança/gestão de planos (hoje o campo `plano_contratado` é apenas informativo).
- Integração de fato com Google Agenda e Calendly (hoje são apenas links externos;
  o schema de OAuth já existe em `integracoes_clinica`, falta a tela de conexão).
- Disparo real de automações (WhatsApp/e-mail) — schema e guia prontos
  (`automacoes_config`, `docs/GUIA_AUTOMACOES.md`), falta implementar as
  Supabase Edge Functions + pg_cron que efetivamente enviam as mensagens.
- Geração de PDF nativa (hoje depende da função "Imprimir" do navegador).
- Upload de imagem para logo (hoje é feito colando uma URL pública da imagem).
- Assistente com IA generativa conversacional (hoje é um motor de regras/simulador
  determinístico — ver nota de transparência em `docs/GUIA_MODULO_FINANCEIRO.md`).

## 🔭 Próximos Passos Recomendados

1. **Upload de arquivos**: usar o Supabase Storage (também gratuito até 1GB) para
   permitir upload direto de logos, em vez de exigir uma URL externa.
2. **Perfis de usuário por clínica** (dono, recepção, profissional), com permissões
   diferenciadas — pode ser modelado com uma tabela `usuarios_clinica` adicional.
3. **Tela de conexão Google (OAuth)** dentro do Hub da Clínica, usando o projeto
   único no Google Cloud Console (ver `docs/GUIA_AUTOMACOES.md`).
4. **Supabase Edge Functions + pg_cron** para disparo automático de lembretes,
   recall e aniversário via WhatsApp (Meta Cloud API) e e-mail (Resend/Brevo).
5. **Exportação real em PDF** dos documentos do M7.
6. **Visão de calendário gráfico** (semana/mês) no M6 (ex.: FullCalendar).
7. Incorporar integralmente os 6 pilares operacionais descritos no documento
   `docs/ALAVANCA_360_Metodo_Completo.docx` como conteúdo/copy dentro dos módulos.

## 🚀 Tecnologias Utilizadas

- HTML5 semântico + Tailwind CSS (via CDN, `@tailwindcss/browser@4`)
- Lucide Icons (via CDN)
- Chart.js (via CDN) — gráficos do Dashboard Vivo
- JavaScript puro (ES6+), sem frameworks
- **Supabase** (`@supabase/supabase-js@2`) — PostgreSQL + Auth + Row Level Security
- Nginx + Let's Encrypt (hospedagem na VPS Hostinger)

## 📁 Estrutura de Arquivos

```
index.html              → Tela de login + aplicação completa (7 módulos + HUB Clínica + HUB Master)
app.js                   → Lógica de negócio + integração com Supabase
js/
  └── supabase-config.js → Suas credenciais de conexão com o Supabase (preencher)
sql/
  ├── schema.sql               → Tabelas base (clínicas, pacientes, agenda, prontuário etc.)
  ├── schema_financeiro.sql    → Custos, insumos, serviços, precificação, atendimentos e view de margem
  └── schema_integracoes.sql   → Integrações (Google/WhatsApp/E-mail) e automações configuráveis
images/
  └── logo-alavanca-360.png → Logo oficial do Método ALAVANCA 360®
templates/
  └── planilha-padrao/         → Modelo CSV padronizado (insumos, serviços, custos fixos) + guia de formatação
docs/
  ├── SUPABASE_SETUP.md               → Guia passo a passo do banco de dados
  ├── DEPLOY_HOSTINGER.md             → Guia passo a passo da publicação na VPS
  ├── GUIA_MODULO_FINANCEIRO.md       → Guia de uso de Custos, Atendimentos, Dashboard Vivo e Assistente
  ├── GUIA_AUTOMACOES.md              → Guia de integrações Google/WhatsApp/E-mail e automações
  └── ALAVANCA_360_Metodo_Completo.docx → Documento de origem/filosofia do método
legacy-genspark/          → Cópia da versão anterior (RESTful Table API do Genspark), mantida como referência histórica
README.md                 → Este documento
```

## 🚀 Deploy

Para colocar o sistema definitivamente sob seu controle, siga os dois guias:
1. [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
2. [`docs/DEPLOY_HOSTINGER.md`](docs/DEPLOY_HOSTINGER.md)

Ou, para um link de teste imediato (mantendo o Supabase como banco), utilize a aba
**Publish** desta plataforma.
