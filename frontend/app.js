// ==========================================
// CONFIGURAÇÕES GERAIS E VARIÁVEIS
// ==========================================
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

let chartCartoesPizza, chartEvolucaoGastos, chartInvestimentos, chartDivisaoSalario;
let chartEvolucaoCartaoEspecifico;

let dataAtualDashboard = new Date();
dataAtualDashboard.setMonth(dataAtualDashboard.getMonth() + 1);

let dataAtualFiltroCartao = new Date();
dataAtualFiltroCartao.setMonth(dataAtualFiltroCartao.getMonth() + 1);

let dataAtualEntradas = new Date();
dataAtualEntradas.setMonth(dataAtualEntradas.getMonth() + 1); // Próximo mês por padrão
let chartEvolucaoEntradasPagina;

// ==========================================
// FUNÇÕES UTILITÁRIAS DE DATA E MODAL
// ==========================================
function getProximoMes() {
    const hoje = new Date();
    hoje.setMonth(hoje.getMonth() + 1);
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function formatarMesGrafico(anoMes) {
    if(!anoMes) return '';
    const [ano, mes] = anoMes.split('-');
    const data = new Date(ano, mes - 1);
    return `${data.toLocaleString('pt-BR', { month: 'long' })} ${ano}`;
}

function formatarMesApresentacao(data) {
    const nomeMes = data.toLocaleString('pt-BR', { month: 'long' });
    const ano = data.getFullYear();
    return `${nomeMes} ${ano}`;
}

function obterMesBackend(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

window.abrirModal = function(idModal) {
    const modal = document.getElementById(idModal);
    if(modal) modal.classList.add('active');
}

window.fecharModal = function(idModal) {
    const modal = document.getElementById(idModal);
    if(modal) modal.classList.remove('active');
}

// ==========================================
// 1. LÓGICA DO DASHBOARD (index.html)
// ==========================================
window.mudarMesDashboard = function(direcao) {
    dataAtualDashboard.setMonth(dataAtualDashboard.getMonth() + direcao);
    document.getElementById('displayMesDashboard').innerText = formatarMesApresentacao(dataAtualDashboard);
    const mesStr = obterMesBackend(dataAtualDashboard);
    carregarDashboard(mesStr);
}

async function carregarDashboard(mes) {
    try {
        const resResumo = await fetch(`${API_URL}/resumo/${mes}`);
        if(!resResumo.ok) return;
        const dataResumo = await resResumo.json();

        const resFixos = await fetch(`${API_URL}/gastos-fixos/${mes}`);
        const dataFixos = resFixos.ok ? await resFixos.json() : { total_fixo: 0 };

        let totalSuaFatura = 0; let nomesCartoes = []; let valoresCartoes = [];

        dataResumo.resumo_cartoes.forEach(cartao => {
            totalSuaFatura += cartao.valor_realmente_seu;
            if (cartao.valor_realmente_seu > 0) { nomesCartoes.push(cartao.cartao); valoresCartoes.push(cartao.valor_realmente_seu); }
        });

        const totalFixo = dataFixos.total_fixo || 0;
        const totalGastos = totalSuaFatura + totalFixo;
        
        // --- A MÁGICA ACONTECE AQUI ---
        const salarioReal = dataResumo.total_entradas || 0; 
        const saldoLivre = salarioReal - totalGastos;
        
        if (document.getElementById('kpiSaldoMes')) {
            document.getElementById('kpiSaldoMes').innerText = `R$ ${(saldoLivre > 0 ? saldoLivre : 0).toFixed(2)}`;
            document.getElementById('kpiGastosTotais').innerText = `R$ ${totalGastos.toFixed(2)}`;
            
            // O KPI agora mostra o valor dinâmico das suas Entradas
            document.getElementById('kpiSalarioEsperado').innerText = `R$ ${salarioReal.toFixed(2)}`;
            document.getElementById('kpiEconomia').innerText = `R$ ${dataResumo.economia_desejada || '0.00'}`;
        }

        const ctxDivisao = document.getElementById('graficoDivisaoSalario');
        if (ctxDivisao) {
            if (chartDivisaoSalario) chartDivisaoSalario.destroy();
            chartDivisaoSalario = new Chart(ctxDivisao, { type: 'doughnut', data: { labels: ['Gasto Fixo', 'Gasto Cartão', 'Livre'], datasets: [{ data: [totalFixo, totalSuaFatura, saldoLivre > 0 ? saldoLivre : 0], backgroundColor: ['#F48C06', '#F25C54', '#54CA7E'] }] }, options: { responsive: true, maintainAspectRatio: false } });
        }

        const ctxCartoes = document.getElementById('graficoCartoesPizza');
        if (ctxCartoes) {
            if (chartCartoesPizza) chartCartoesPizza.destroy();
            chartCartoesPizza = new Chart(ctxCartoes, { type: 'pie', data: { labels: nomesCartoes.length ? nomesCartoes : ['Sem gastos'], datasets: [{ data: valoresCartoes.length ? valoresCartoes : [1], backgroundColor: nomesCartoes.length ? ['#3A86FF', '#9D4EDD', '#F48C06', '#E0E5F2'] : ['#E0E5F2'] }] }, options: { responsive: true, maintainAspectRatio: false } });
        }
    } catch (error) { console.error("Erro Dashboard:", error); }
}

async function carregarGraficosHistoricos() {
    try {
        const ctxGastos = document.getElementById('graficoEvolucaoGastos');
        if (ctxGastos) {
            const resGastos = await fetch(`${API_URL}/dashboard/gastos-evolucao`);
            const dadosGastos = await resGastos.json();
            if (chartEvolucaoGastos) chartEvolucaoGastos.destroy();
            chartEvolucaoGastos = new Chart(ctxGastos, {
                type: 'bar',
                data: { labels: dadosGastos.map(d => formatarMesGrafico(d.mes)), datasets: [{ label: 'Gastos R$', data: dadosGastos.map(d => parseFloat(d.total_faturas)), backgroundColor: '#F25C54', borderRadius: 4 }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const ctxRend = document.getElementById('graficoInvestimentos');
        if (ctxRend) {
            const resRend = await fetch(`${API_URL}/dashboard/rendimentos`);
            const dadosRend = await resRend.json();
            if (chartInvestimentos) chartInvestimentos.destroy();
            chartInvestimentos = new Chart(ctxRend, {
                type: 'line',
                data: { labels: dadosRend.map(d => formatarMesGrafico(d.mes)), datasets: [{ label: 'Investimentos R$', data: dadosRend.map(d => parseFloat(d.total)), borderColor: '#3A86FF', backgroundColor: 'rgba(58, 134, 255, 0.2)', fill: true, tension: 0.4 }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    } catch (error) { console.error("Erro Históricos:", error); }
}

// ==========================================
// 2. LÓGICA DA LISTA DE CARTÕES (cartoes.html)
// ==========================================
async function desenharCartoesNaTela() {
    const container = document.getElementById('containerCartoes');
    if (!container) return; 

    try {
        const response = await fetch(`${API_URL}/cartoes`);
        const cartoes = await response.json();
        
        const mesAtual = getProximoMes();
        const resResumo = await fetch(`${API_URL}/resumo/${mesAtual}`);
        const dataResumo = resResumo.ok ? await resResumo.json() : null;
        
        container.innerHTML = ''; 
        let somaFaturasTotais = 0; // Variável para guardar a soma de todos os cartões

        // Atualiza o texto do mês no painel superior
        const labelMes = document.getElementById('mesReferenciaCartoes');
        if (labelMes) labelMes.innerText = formatarMesGrafico(mesAtual);

        cartoes.forEach(cartao => {
            let faturaInfo = "R$ 0.00";
            if(dataResumo) {
                const resumoCartao = dataResumo.resumo_cartoes.find(c => c.cartao === cartao.nome);
                if(resumoCartao) {
                    faturaInfo = `R$ ${resumoCartao.fatura_total_informada.toFixed(2)}`;
                    somaFaturasTotais += resumoCartao.fatura_total_informada; // Vai somando
                }
            }

            const div = document.createElement('div');
            div.className = 'cartao-item';
            div.innerHTML = `
                <h3>${cartao.nome} <span>💳</span></h3>
                <div class="datas">
                    <div style="margin-bottom: 0.8rem;">
                        <span style="color: var(--text-light); font-size: 0.8rem;">Fatura Informada (${formatarMesGrafico(mesAtual)}):</span><br>
                        <strong style="color: var(--text-dark); font-size: 1.3rem;">${faturaInfo}</strong>
                    </div>
                    Fechamento: Dia ${cartao.dia_fechamento} <br>
                    Vencimento: Dia ${cartao.dia_vencimento}
                </div>
                <div class="cartao-acoes">
                    <a href="detalhes-cartao.html?id=${cartao.id}" style="text-decoration: none;">
                        <button style="width: 100%;">⚙️ Gerenciar Cartão</button>
                    </a>
                </div>
            `;
            container.appendChild(div);
        });

        // Joga a soma total no painel vermelho
        const elTotal = document.getElementById('somaTodosCartoes');
        if (elTotal) elTotal.innerText = `R$ ${somaFaturasTotais.toFixed(2)}`;

    } catch (error) {
        container.innerHTML = `<p style="color: red;">Erro ao carregar cartões.</p>`;
    }
}

// ==========================================
// 3. LÓGICA DO CARTÃO ESPECÍFICO (detalhes-cartao.html)
// ==========================================
window.mudarMes = function(direcao) {
    dataAtualFiltroCartao.setMonth(dataAtualFiltroCartao.getMonth() + direcao);
    document.getElementById('displayMesAtual').innerText = formatarMesApresentacao(dataAtualFiltroCartao);
    carregarDadosCartaoEspecifico(); 
}

window.toggleTransacaoFields = function() {
    const isTerceiro = document.getElementById('checkTerceiro').checked;
    const isParcelado = document.getElementById('checkParcelado').checked;

    document.getElementById('labelDescricao').innerText = isTerceiro ? "Quem deve?" : "Descrição da Compra:";
    document.getElementById('divParcelas').style.display = isParcelado ? "block" : "none";
    if (!isParcelado) document.getElementById('qtdParcelas').value = 1;
}

window.deletarTransacao = async function(id, tipo, parcelas) {
    let mensagem = 'Tem certeza que deseja apagar este lançamento?';
    if (parcelas > 1) {
        mensagem = 'Atenção: Esta é uma compra parcelada. Apagar aqui irá excluir a compra original e TODAS as parcelas dos meses futuros. Deseja continuar?';
    }
    if(confirm(mensagem)) {
        try {
            await fetch(`${API_URL}/transacoes/${tipo}/${id}`, { method: 'DELETE' });
            carregarDadosCartaoEspecifico(); 
        } catch(err) { alert('Erro ao apagar.'); }
    }
}

window.acrescentarNaFatura = async function(cartaoId, mes, valor) {
    if(confirm(`Deseja acrescentar R$ ${parseFloat(valor).toFixed(2)} ao valor da sua Fatura Total deste mês?`)) {
        try {
            await fetch(`${API_URL}/faturas-totais/acrescentar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cartao_id: cartaoId, mes_referencia: mes, valor: valor })
            });
            carregarDadosCartaoEspecifico(); // Recarrega os painéis na mesma hora
        } catch(err) { alert('Erro ao acrescentar valor.'); }
    }
}

window.abrirModalEdicao = function(id, tipo, descricao, valor, mes, parcelas) {
    document.getElementById('editId').value = id;
    document.getElementById('editTipo').value = tipo;
    document.getElementById('editDescricao').value = descricao;
    document.getElementById('editValor').value = valor;
    document.getElementById('editMes').value = mes;
    document.getElementById('editQtdParcelas').value = parcelas;
    abrirModal('modalEditarTransacao');
}

async function carregarDadosCartaoEspecifico() {
    const urlParams = new URLSearchParams(window.location.search);
    const cartaoId = urlParams.get('id');

    if (!cartaoId) return;

    try {
        const resCartao = await fetch(`${API_URL}/cartoes/${cartaoId}`);
        const cartao = await resCartao.json();
        
        if(document.getElementById('tituloCartao')) {
            document.getElementById('tituloCartao').innerText = `Cartão ${cartao.nome}`;
            document.getElementById('subtituloDatas').innerText = `Fechamento: Dia ${cartao.dia_fechamento} | Vencimento: Dia ${cartao.dia_vencimento}`;
            document.getElementById('displayMesAtual').innerText = formatarMesApresentacao(dataAtualFiltroCartao);
            
            document.getElementById('mesFatura').value = obterMesBackend(dataAtualFiltroCartao);
            document.getElementById('mesTransacao').value = obterMesBackend(dataAtualFiltroCartao);
        }

        const mesBack = obterMesBackend(dataAtualFiltroCartao);
        const resMes = await fetch(`${API_URL}/cartoes/${cartaoId}/mes/${mesBack}`);
        const dadosMes = await resMes.json();

        if (document.getElementById('kpiFaturaTotal')) {
            document.getElementById('kpiFaturaTotal').innerText = `R$ ${dadosMes.valor_total.toFixed(2)}`;
            document.getElementById('kpiFaturaReal').innerText = `R$ ${dadosMes.valor_real.toFixed(2)}`;
            
            const tbody = document.getElementById('tabelaHistorico');
            tbody.innerHTML = '';
            
            if (dadosMes.transacoes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#A3AED0;">Nenhuma transação lançada para este mês.</td></tr>';
            } else {
                dadosMes.transacoes.forEach(t => {
                    const badge = t.tipo === 'terceiro' ? '<span class="badge badge-terceiro">Terceiro</span>' : '<span class="badge badge-parcela">Parcela Sua</span>';
                    
                    // O Botão '+' só aparece se a transação for 'parcela' (sua)
                    const btnAdd = t.tipo === 'parcela' ? `<button onclick="acrescentarNaFatura(${cartaoId}, '${mesBack}', ${t.valor_parcela})" style="background:none;border:none;cursor:pointer;color:#54CA7E;font-size:1.1rem;margin-right:0.5rem;" title="Somar à Fatura Informada">➕</button>` : '';
                    
                    const btnEdit = `<button onclick="abrirModalEdicao(${t.id}, '${t.tipo}', '${t.descricao}', ${t.valor_parcela}, '${t.mes_inicio}', ${t.quantidade_parcelas})" style="background:none;border:none;cursor:pointer;color:#3A86FF;font-size:1.1rem;margin-right:0.5rem;" title="Editar">✏️</button>`;
                    const btnDel = `<button onclick="deletarTransacao(${t.id}, '${t.tipo}', ${t.quantidade_parcelas})" style="background:none;border:none;cursor:pointer;color:#EB5757;font-size:1.1rem;" title="Apagar">🗑️</button>`;

                    tbody.innerHTML += `
                        <tr>
                            <td>${t.descricao}</td>
                            <td>${badge}</td>
                            <td>${t.mes_inicio}</td>
                            <td>${t.quantidade_parcelas > 1 ? t.quantidade_parcelas + 'x' : 'À vista'}</td>
                            <td>R$ ${parseFloat(t.valor_parcela).toFixed(2)}</td>
                            <td>${btnAdd} ${btnEdit} ${btnDel}</td>
                        </tr>
                    `;
                });
            }
        }

        const resEvolucao = await fetch(`${API_URL}/cartoes/${cartaoId}/evolucao`);
        const dadosEvolucao = await resEvolucao.json();

        const ctxCartao = document.getElementById('graficoEvolucaoCartao');
        if (ctxCartao) {
            if (chartEvolucaoCartaoEspecifico) chartEvolucaoCartaoEspecifico.destroy();
            chartEvolucaoCartaoEspecifico = new Chart(ctxCartao, {
                type: 'line',
                data: { labels: dadosEvolucao.map(d => formatarMesGrafico(d.mes)), datasets: [{ label: 'Minha Fatura Real (R$)', data: dadosEvolucao.map(d => d.gasto_real), borderColor: '#9D4EDD', backgroundColor: 'rgba(157, 78, 221, 0.2)', fill: true, tension: 0.4 }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    } catch (error) { console.error("Erro detalhes cartão:", error); }
}

// ==========================================
// 4. LÓGICA DE DESPESAS FIXAS (despesas.html)
// ==========================================

window.toggleCartaoDespesa = function() {
    const categoria = document.getElementById('categoriaDespesa').value;
    const divCartao = document.getElementById('divCartaoVinculado');
    divCartao.style.display = categoria === 'Assinatura' ? 'flex' : 'none';
}

window.abrirModalDespesa = async function() {
    abrirModal('modalDespesa');
    
    // Carrega a lista de cartões para o select de Assinatura
    const select = document.getElementById('cartaoVinculado');
    if (select.options.length <= 1) { // Só carrega se estiver vazio
        try {
            const res = await fetch(`${API_URL}/cartoes`);
            const cartoes = await res.json();
            cartoes.forEach(c => {
                select.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
            });
        } catch(err) { console.error('Erro ao buscar cartões'); }
    }
}

window.deletarDespesa = async function(id) {
    if(confirm('Tem certeza que deseja apagar esta despesa fixa?')) {
        try {
            await fetch(`${API_URL}/despesas-fixas/${id}`, { method: 'DELETE' });
            desenharDespesasNaTela();
        } catch(err) { alert('Erro ao apagar.'); }
    }
}

async function desenharDespesasNaTela() {
    const tbody = document.getElementById('tabelaDespesas');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_URL}/despesas-fixas`);
        const despesas = await res.json();
        
        tbody.innerHTML = '';
        
        // Variáveis para somar
        let somaBoletos = 0;
        let somaAssinaturas = 0;
        
        if (despesas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#A3AED0;">Nenhuma despesa fixa cadastrada.</td></tr>';
        } else {
            despesas.forEach(d => {
                // Matemática da soma
                const valor = parseFloat(d.valor);
                if (d.categoria === 'Boleto') somaBoletos += valor;
                if (d.categoria === 'Assinatura') somaAssinaturas += valor;

                const badgeClass = d.categoria === 'Boleto' ? 'badge-terceiro' : 'badge-parcela';
                const vinculo = d.categoria === 'Assinatura' ? (d.cartao_nome || 'Nenhum') : '-';
                
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${d.descricao}</strong></td>
                        <td><span class="badge ${badgeClass}">${d.categoria}</span></td>
                        <td>${vinculo}</td>
                        <td>R$ ${valor.toFixed(2)}</td>
                        <td><button onclick="deletarDespesa(${d.id})" style="background:none;border:none;cursor:pointer;color:#EB5757;font-size:1.1rem;" title="Apagar">🗑️</button></td>
                    </tr>
                `;
            });
        }

        // Joga as somas nos painéis do HTML
        const elBoletos = document.getElementById('totalBoletos');
        const elAssinaturas = document.getElementById('totalAssinaturas');
        
        if (elBoletos) elBoletos.innerText = `R$ ${somaBoletos.toFixed(2)}`;
        if (elAssinaturas) elAssinaturas.innerText = `R$ ${somaAssinaturas.toFixed(2)}`;

    } catch (error) {
        console.error("Erro ao listar despesas:", error);
    }
}

// Evento de Salvar Despesa
const formDespesa = document.getElementById('formModalDespesa');
if (formDespesa) {
    formDespesa.onsubmit = async (e) => {
        e.preventDefault();
        const btnSubmit = e.target.querySelector('button[type="submit"]');
        btnSubmit.disabled = true; btnSubmit.innerText = 'Salvando...';

        const categoria = document.getElementById('categoriaDespesa').value;
        const dados = {
            descricao: document.getElementById('descDespesa').value,
            valor: document.getElementById('valorDespesa').value,
            categoria: categoria,
            cartao_id: categoria === 'Assinatura' ? document.getElementById('cartaoVinculado').value : null
        };

        try {
            await fetch(`${API_URL}/despesas-fixas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
            fecharModal('modalDespesa'); e.target.reset(); toggleCartaoDespesa(); desenharDespesasNaTela();
        } catch(err) { alert('Erro ao salvar.'); }
        finally { btnSubmit.disabled = false; btnSubmit.innerText = 'Salvar Despesa'; }
    };
}

// ==========================================
// 5. LÓGICA DA PÁGINA DE ENTRADAS (entradas.html)
// ==========================================
window.mudarMesEntradas = function(direcao) {
    dataAtualEntradas.setMonth(dataAtualEntradas.getMonth() + direcao);
    document.getElementById('displayMesEntradas').innerText = formatarMesApresentacao(dataAtualEntradas);
    carregarPaginaEntradas();
}

window.deletarEntrada = async function(id) {
    if(confirm('Deseja excluir este lançamento de entrada?')) {
        try {
            await fetch(`${API_URL}/entradas/${id}`, { method: 'DELETE' });
            carregarPaginaEntradas();
        } catch(err) { console.error(err); }
    }
}

async function carregarPaginaEntradas() {
    const tbody = document.getElementById('tabelaEntradas');
    if (!tbody) return; // Trava de segurança: só roda se a tabela existir na tela

    const mesStr = obterMesBackend(dataAtualEntradas);
    
    if (document.getElementById('displayMesEntradas')) {
        document.getElementById('displayMesEntradas').innerText = formatarMesApresentacao(dataAtualEntradas);
    }
    if (document.getElementById('mesEntrada')) {
        document.getElementById('mesEntrada').value = mesStr;
    }

    try {
        const res = await fetch(`${API_URL}/entradas/mes/${mesStr}`);
        const data = await res.json();

        if (document.getElementById('kpiSomaEntradas')) {
            document.getElementById('kpiSomaEntradas').innerText = `R$ ${data.total_soma.toFixed(2)}`;
        }

        tbody.innerHTML = '';
        if(data.entradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#A3AED0;">Nenhuma entrada registrada para este mês.</td></tr>';
        } else {
            data.entradas.forEach(e => {
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${e.descricao}</strong></td>
                        <td>${formatarMesGrafico(e.mes_referencia)}</td>
                        <td style="color: #54CA7E; font-weight: 600;">R$ ${parseFloat(e.valor).toFixed(2)}</td>
                        <td><button onclick="deletarEntrada(${e.id})" style="background:none;border:none;cursor:pointer;color:#EB5757;font-size:1.1rem;" title="Apagar">🗑️</button></td>
                    </tr>
                `;
            });
        }

        const resHist = await fetch(`${API_URL}/dashboard/entradas`);
        const dadosHist = await resHist.json();

        const ctx = document.getElementById('graficoEvolucaoEntradasPagina');
        if (ctx) {
            if (chartEvolucaoEntradasPagina) chartEvolucaoEntradasPagina.destroy();
            chartEvolucaoEntradasPagina = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dadosHist.map(d => formatarMesGrafico(d.mes)),
                    datasets: [{
                        label: 'Minhas Entradas (R$)',
                        data: dadosHist.map(d => parseFloat(d.total)),
                        borderColor: '#54CA7E',
                        backgroundColor: 'rgba(84, 202, 126, 0.2)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    } catch (error) { console.error("Erro entradas:", error); }
}

// ==========================================
// LÓGICA DE METAS E INVESTIMENTOS
// ==========================================
let chartMetasPagina, chartInvestimentosPagina;

async function carregarPaginaMetas() {
    const tbody = document.getElementById('tabelaMetas');
    if (!tbody) return;
    
    try {
        const res = await fetch(`${API_URL}/metas`);
        const metas = await res.json();
        tbody.innerHTML = '';

        metas.forEach(m => {
            const meta = parseFloat(m.valor_meta);
            const livre = parseFloat(m.saldo_livre);
            
            // SISTEMA DE CORES E ALERTA INTELIGENTE
            let aviso = `<span style="color:#54CA7E; font-weight:bold;">✅ Margem Segura</span>`;
            let estiloLinha = "";
            
            if (livre < meta) {
                aviso = `<span style="color:#EB5757; font-weight:bold;">🚨 Meta em Risco</span>`;
                estiloLinha = "background-color: #FFF0F0;"; // Destaca linha em vermelho claro
            } else if (livre >= meta && livre <= meta + 200) {
                aviso = `<span style="color:#F48C06; font-weight:bold;">⚠️ Alerta Limite</span>`;
                estiloLinha = "background-color: #FFFBEA;"; // Destaca linha em amarelo claro
            }

            const checked = m.cumprida ? 'checked' : '';

            // --- AQUI ESTÃO OS BOTÕES DE EDITAR E DELETAR JUNTOS ---
            const btnEdit = `<button onclick="abrirModalEdicaoMeta('${m.mes}', ${meta})" style="background:none;border:none;cursor:pointer;color:#3A86FF;font-size:1.1rem;margin-right:0.5rem;" title="Editar">✏️</button>`;
            const btnDel = `<button onclick="deletarMeta(${m.id})" style="background:none;border:none;cursor:pointer;color:#EB5757;font-size:1.1rem;" title="Apagar">🗑️</button>`;

            tbody.innerHTML += `
                <tr style="${estiloLinha}">
                    <td><strong>${formatarMesGrafico(m.mes)}</strong></td>
                    <td>R$ ${meta.toFixed(2)}</td>
                    <td>R$ ${livre.toFixed(2)}</td>
                    <td>${aviso}</td>
                    <td><input type="checkbox" ${checked} onchange="alterarStatusMeta(${m.id}, this.checked)" style="transform: scale(1.2); cursor:pointer;"></td>
                    <td>${btnEdit} ${btnDel}</td>
                </tr>
            `;
        });

        // Desenha o gráfico dinâmico Meta vs Real
        const ctx = document.getElementById('graficoMetasPagina');
        if (ctx) {
            if (chartMetasPagina) chartMetasPagina.destroy();
            chartMetasPagina = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: metas.map(m => formatarMesGrafico(m.mes)),
                    datasets: [
                        { label: 'Sua Meta (R$)', data: metas.map(m => parseFloat(m.valor_meta)), borderColor: '#3A86FF', tension: 0.1 },
                        { label: 'Dinheiro Livre Real (R$)', data: metas.map(m => parseFloat(m.saldo_livre)), borderColor: '#54CA7E', backgroundColor: 'rgba(84,202,126,0.1)', fill: true, tension: 0.4 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    } catch(err) { console.error(err); }
}

// --- INÍCIO DO BLOCO DE METAS (Substituir no app.js) ---

// Função CORRIGIDA: "cumprida" escrito da forma certa
window.alterarStatusMeta = async function(id, status) {
    await fetch(`${API_URL}/metas/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cumprida: status }) });
    carregarPaginaMetas();
}

window.deletarMeta = async function(id) {
    if(confirm('Remover esta meta?')) { await fetch(`${API_URL}/metas/${id}`, { method: 'DELETE' }); carregarPaginaMetas(); }
}

// Novas Funções para o Modal
window.abrirModalNovaMeta = function() {
    document.getElementById('formModalMeta').reset();
    document.getElementById('saldoLivreModal').innerText = 'Selecione o mês...';
    abrirModal('modalMeta');
}

window.abrirModalEdicaoMeta = function(mes, valor) {
    document.getElementById('mesMeta').value = mes;
    document.getElementById('valorMeta').value = valor;
    buscarSaldoDoMes(); // Já calcula o saldo do mês selecionado
    abrirModal('modalMeta');
}

window.buscarSaldoDoMes = async function() {
    const mes = document.getElementById('mesMeta').value;
    const elSaldo = document.getElementById('saldoLivreModal');
    
    if(!mes) { elSaldo.innerText = 'Selecione o mês...'; return; }
    
    elSaldo.innerText = 'Calculando...';
    try {
        const res = await fetch(`${API_URL}/metas/saldo/${mes}`);
        const data = await res.json();
        elSaldo.innerText = `R$ ${data.saldo_livre.toFixed(2)}`;
    } catch(e) { elSaldo.innerText = 'Erro ao calcular'; }
}

async function carregarPaginaInvestimentos() {
    const tbody = document.getElementById('tabelaInvestimentos');
    if (!tbody) return;
    try {
        const res = await fetch(`${API_URL}/investimentos`);
        const invs = await res.json();
        tbody.innerHTML = '';
        
        let acumulado = 0;
        let pontosGrafico = [];
        let labelsGrafico = [];

        invs.forEach(i => {
            const valor = parseFloat(i.valor);
            const isRetirada = i.tipo === 'Retirada';
            
            if (isRetirada) acumulado -= valor;
            else acumulado += valor;

            pontosGrafico.push(acumulado);
            labelsGrafico.push(formatarMesGrafico(i.mes_referencia));

            const estiloLinha = isRetirada ? "background-color: #FFF0F0; color: #EB5757;" : "";
            const sinal = isRetirada ? "- " : "+ ";

            tbody.innerHTML += `
                <tr style="${estiloLinha}">
                    <td><strong>${i.descricao}</strong></td>
                    <td>${i.banco}</td>
                    <td><span class="badge ${isRetirada ? 'badge-terceiro' : 'badge-parcela'}">${i.tipo}</span></td>
                    <td>${formatarMesGrafico(i.mes_referencia)}</td>
                    <td style="font-weight:bold;">${sinal} R$ ${valor.toFixed(2)}</td>
                    <td><button onclick="deletarInvestimento(${i.id})" style="background:none;border:none;cursor:pointer;color:#EB5757;font-size:1.1rem;">🗑️</button></td>
                </tr>
            `;
        });

        const ctx = document.getElementById('graficoInvestimentosPagina');
        if (ctx) {
            if (chartInvestimentosPagina) chartInvestimentosPagina.destroy();
            chartInvestimentosPagina = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labelsGrafico,
                    datasets: [{ label: 'Patrimônio Guardado Acumulado (R$)', data: pontosGrafico, borderColor: '#9D4EDD', backgroundColor: 'rgba(157, 78, 221, 0.1)', fill: true, tension: 0.3 }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    } catch(err) { console.error(err); }
}

window.deletarInvestimento = async function(id) {
    if(confirm('Excluir esta movimentação?')) { await fetch(`${API_URL}/investimentos/${id}`, { method: 'DELETE' }); carregarPaginaInvestimentos(); }
}

// ==========================================
// INICIALIZADOR E EVENTOS DE FORMULÁRIO (BLINDADOS)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    // --- EVENTOS DOS FORMULÁRIOS USANDO .ONSUBMIT ---
    const formFatura = document.getElementById('formModalFatura');
    if(formFatura) {
        formFatura.onsubmit = async (e) => {
            e.preventDefault();
            const btnSubmit = e.target.querySelector('button[type="submit"]');
            btnSubmit.disabled = true; btnSubmit.innerText = 'Salvando...';

            const cartaoId = new URLSearchParams(window.location.search).get('id');
            const dados = { cartao_id: cartaoId, mes_referencia: document.getElementById('mesFatura').value, valor_total: document.getElementById('valorFatura').value };
            
            try {
                await fetch(`${API_URL}/faturas-totais`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
                fecharModal('modalFatura'); carregarDadosCartaoEspecifico();
            } catch(err) { alert('Erro ao salvar.'); } 
            finally { btnSubmit.disabled = false; btnSubmit.innerText = 'Salvar Fatura'; }
        };
    }

    const formTransacao = document.getElementById('formModalTransacao');
    if(formTransacao) {
        formTransacao.onsubmit = async (e) => {
            e.preventDefault();
            const btnSubmit = e.target.querySelector('button[type="submit"]');
            btnSubmit.disabled = true; btnSubmit.innerText = 'Salvando...';

            const cartaoId = new URLSearchParams(window.location.search).get('id');
            const isTerceiro = document.getElementById('checkTerceiro').checked;
            const dados = {
                cartao_id: cartaoId,
                valor_parcela: document.getElementById('valorTransacao').value,
                mes_inicio: document.getElementById('mesTransacao').value,
                quantidade_parcelas: document.getElementById('checkParcelado').checked ? document.getElementById('qtdParcelas').value : 1
            };

            try {
                if (isTerceiro) {
                    dados.quem_deve = document.getElementById('descTransacao').value;
                    await fetch(`${API_URL}/gastos-terceiros`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
                } else {
                    dados.descricao = document.getElementById('descTransacao').value;
                    await fetch(`${API_URL}/despesas-parceladas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
                }
                fecharModal('modalTransacao'); e.target.reset(); toggleTransacaoFields(); carregarDadosCartaoEspecifico();
            } catch(err) { alert('Erro ao salvar.'); }
            finally { btnSubmit.disabled = false; btnSubmit.innerText = 'Salvar Transação'; }
        };
    }

    const formEditar = document.getElementById('formModalEditar');
    if(formEditar) {
        formEditar.onsubmit = async (e) => {
            e.preventDefault();
            const btnSubmit = e.target.querySelector('button[type="submit"]');
            btnSubmit.disabled = true; btnSubmit.innerText = 'Atualizando...';

            const id = document.getElementById('editId').value;
            const tipo = document.getElementById('editTipo').value;
            const dados = {
                descricao: document.getElementById('editDescricao').value,
                valor_parcela: document.getElementById('editValor').value,
                mes_inicio: document.getElementById('editMes').value,
                quantidade_parcelas: document.getElementById('editQtdParcelas').value
            };

            try {
                await fetch(`${API_URL}/transacoes/${tipo}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
                fecharModal('modalEditarTransacao'); carregarDadosCartaoEspecifico();
            } catch(err) { alert('Erro ao atualizar.'); }
            finally { btnSubmit.disabled = false; btnSubmit.innerText = 'Atualizar Alterações'; }
        };
    }

    const formDespesa = document.getElementById('formModalDespesa');
    if (formDespesa) {
        formDespesa.onsubmit = async (e) => {
            e.preventDefault();
            const btnSubmit = e.target.querySelector('button[type="submit"]');
            btnSubmit.disabled = true; btnSubmit.innerText = 'Salvando...';

            const categoria = document.getElementById('categoriaDespesa').value;
            const dados = {
                descricao: document.getElementById('descDespesa').value,
                valor: document.getElementById('valorDespesa').value,
                categoria: categoria,
                cartao_id: categoria === 'Assinatura' ? document.getElementById('cartaoVinculado').value : null
            };

            try {
                await fetch(`${API_URL}/despesas-fixas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
                fecharModal('modalDespesa'); e.target.reset(); toggleCartaoDespesa(); desenharDespesasNaTela();
            } catch(err) { alert('Erro ao salvar.'); }
            finally { btnSubmit.disabled = false; btnSubmit.innerText = 'Salvar Despesa'; }
        };
    }

    const formEntrada = document.getElementById('formModalEntrada');
    if(formEntrada) {
        formEntrada.onsubmit = async (e) => {
            e.preventDefault();
            const btnSubmit = e.target.querySelector('button[type="submit"]');
            btnSubmit.disabled = true; btnSubmit.innerText = 'Salvando...';

            const dados = {
                descricao: document.getElementById('descEntrada').value,
                valor: document.getElementById('valorEntrada').value,
                mes_referencia: document.getElementById('mesEntrada').value
            };

            try {
                await fetch(`${API_URL}/entradas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
                fecharModal('modalEntrada'); e.target.reset(); carregarPaginaEntradas();
            } catch(err) { alert('Erro ao salvar.'); }
            finally { btnSubmit.disabled = false; btnSubmit.innerText = 'Salvar Entrada'; }
        };
    }

    // Cole estes blocos junto com os outros escutadores de formulários (binds)
    const formMeta = document.getElementById('formModalMeta');
    if(formMeta) {
        formMeta.onsubmit = async (e) => {
            e.preventDefault();
            const dados = { mes: document.getElementById('mesMeta').value, valor_meta: document.getElementById('valorMeta').value };
            await fetch(`${API_URL}/metas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
            fecharModal('modalMeta'); e.target.reset(); carregarPaginaMetas();
        };
    }

    const formInv = document.getElementById('formModalInvestimento');
    if(formInv) {
        formInv.onsubmit = async (e) => {
            e.preventDefault();
            const dados = {
                descricao: document.getElementById('invDesc').value,
                banco: document.getElementById('invBanco').value,
                tipo: document.getElementById('invTipo').value,
                valor: document.getElementById('invValor').value,
                mes_referencia: document.getElementById('invMes').value
            };
            await fetch(`${API_URL}/investimentos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
            fecharModal('modalInvestimento'); e.target.reset(); carregarPaginaInvestimentos();
        };
    }

    // Cole estas chamadas bem no finalzinho, antes de fechar a chave "});" do DOMContentLoaded
    if (document.getElementById('tabelaMetas')) carregarPaginaMetas();
    if (document.getElementById('tabelaInvestimentos')) carregarPaginaInvestimentos();

    // --- VERIFICAÇÃO DE QUAL TELA ESTAMOS ---
    if (document.getElementById('displayMesDashboard')) {
        const mesPadrao = obterMesBackend(dataAtualDashboard);
        document.getElementById('displayMesDashboard').innerText = formatarMesApresentacao(dataAtualDashboard);
        carregarDashboard(mesPadrao);
        carregarGraficosHistoricos();
    }

    if (document.getElementById('containerCartoes')) {
        desenharCartoesNaTela();
    }

    if (document.getElementById('tituloCartao')) {
        carregarDadosCartaoEspecifico();
    }

    if (document.getElementById('tabelaDespesas')) {
        desenharDespesasNaTela();
    }

    if (document.getElementById('tabelaEntradas')) {
        carregarPaginaEntradas();
    }
});