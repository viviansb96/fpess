const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Faz o backend entregar os seus arquivos HTML, CSS e JS do frontend
app.use(express.static(__dirname));
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());


// ==========================================
// 2. ROTAS DE RENDIMENTOS
// ==========================================
app.post('/api/rendimentos', async (req, res) => {
    const { tipo_rendimento, banco, valor_adicionado, valor_removido, data, motivo } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO rendimentos (tipo_rendimento, banco, valor_adicionado, valor_removido, data, motivo) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [tipo_rendimento, banco, valor_adicionado || 0, valor_removido || 0, data, motivo]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. ROTAS DE PLANEJAMENTO
// ==========================================
app.post('/api/planejamento', async (req, res) => {
    const { mes_referencia, salario_esperado, economia_desejada } = req.body; // mes_referencia ex: '2026-07'
    try {
        const result = await db.query(
            `INSERT INTO planejamento (mes_referencia, salario_esperado, economia_desejada) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (mes_referencia) 
             DO UPDATE SET salario_esperado = EXCLUDED.salario_esperado, economia_desejada = EXCLUDED.economia_desejada
             RETURNING *`,
            [mes_referencia, salario_esperado, economia_desejada]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. ROTAS DE CARTÕES (Configuração e Edição)
// ==========================================
app.get('/api/cartoes', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM cartoes ORDER BY nome');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/cartoes/:id', async (req, res) => {
    const { id } = req.params;
    const { dia_vencimento, dia_fechamento } = req.body;
    try {
        const result = await db.query(
            'UPDATE cartoes SET dia_vencimento = $1, dia_fechamento = $2 WHERE id = $3 RETURNING *',
            [dia_vencimento, dia_fechamento, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 5. INSERÇÃO DE FATURA TOTAL, PARCELAS E TERCEIROS
// ==========================================

// Inserir o valor cheio impresso na fatura do mês
app.post('/api/faturas-totais', async (req, res) => {
    const { cartao_id, mes_referencia, valor_total } = req.body; // mes_referencia ex: '2026-07'
    try {
        const result = await db.query(
            `INSERT INTO faturas_totais (cartao_id, mes_referencia, valor_total) VALUES ($1, $2, $3)
             ON CONFLICT (cartao_id, mes_referencia) DO UPDATE SET valor_total = EXCLUDED.valor_total RETURNING *`,
            [cartao_id, mes_referencia, valor_total]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Inserir compras parceladas ou assinaturas fixas
app.post('/api/despesas-parceladas', async (req, res) => {
    const { cartao_id, descricao, valor_parcela, mes_inicio, quantidade_parcelas } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO despesas_parceladas (cartao_id, descricao, valor_parcela, mes_inicio, quantidade_parcelas) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [cartao_id, descricao, valor_parcela, mes_inicio, quantidade_parcelas]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Inserir gastos de terceiros (valores emprestados no cartão)
app.post('/api/gastos-terceiros', async (req, res) => {
    const { cartao_id, quem_deve, valor_parcela, mes_inicio, quantidade_parcelas } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO gastos_terceiros (cartao_id, quem_deve, valor_parcela, mes_inicio, quantidade_parcelas) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [cartao_id, quem_deve, valor_parcela, mes_inicio, quantidade_parcelas || 1]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 6. ROTA DE VISUALIZAÇÃO DO MÊS (Mecanismo Central)
// ==========================================
app.get('/api/resumo/:mes', async (req, res) => {
    const { mes } = req.params;

    try {
        // 1. Busca o total REAL de entradas lançadas para este mês
        const entradasRes = await db.query('SELECT COALESCE(SUM(valor), 0) as total_entradas FROM entradas WHERE mes_referencia = $1', [mes]);
        const totalEntradas = parseFloat(entradasRes.rows[0].total_entradas);

        // 2. Busca a meta de economia na NOVA TABELA DE METAS
        const metaRes = await db.query('SELECT valor_meta FROM metas WHERE mes = $1', [mes]);
        const economiaDesejada = metaRes.rows.length ? parseFloat(metaRes.rows[0].valor_meta) : 0;

        const cartoesRes = await db.query('SELECT id, nome FROM cartoes');
        const resumoCartoes = [];

        for (const cartao of cartoesRes.rows) {
            const faturaTotalRes = await db.query('SELECT valor_total FROM faturas_totais WHERE cartao_id = $1 AND mes_referencia = $2', [cartao.id, mes]);
            const valorFaturaTotal = faturaTotalRes.rows.length ? parseFloat(faturaTotalRes.rows[0].valor_total) : 0;

            const terceirosRes = await db.query(`
                SELECT COALESCE(SUM(valor_parcela), 0) as total 
                FROM gastos_terceiros 
                WHERE cartao_id = $1 
                  AND TO_DATE(mes_inicio || '-01', 'YYYY-MM-DD') <= TO_DATE($2 || '-01', 'YYYY-MM-DD')
                  AND TO_DATE(mes_inicio || '-01', 'YYYY-MM-DD') + (quantidade_parcelas || ' month')::INTERVAL > TO_DATE($2 || '-01', 'YYYY-MM-DD')
            `, [cartao.id, mes]);
            const totalTerceiros = parseFloat(terceirosRes.rows[0].total);

            const valorRealmenteMeu = valorFaturaTotal - totalTerceiros;

            resumoCartoes.push({
                cartao: cartao.nome,
                fatura_total_informada: valorFaturaTotal,
                subtracao_gastos_terceiros: totalTerceiros,
                valor_realmente_seu: valorRealmenteMeu
            });
        }

        res.json({
            mes_visualizado: mes,
            total_entradas: totalEntradas, 
            economia_desejada: economiaDesejada, // Agora vem da tabela certa!
            resumo_cartoes: resumoCartoes
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// ROTAS DE ENTRADAS (CORRIGIDAS)
// ==========================================

// 1. Cadastrar nova entrada
app.post('/api/entradas', async (req, res) => {
    const { descricao, valor, mes_referencia } = req.body;
    try {
        // Query corrigida: inserindo apenas nas colunas que realmente existem
        await db.query(
            'INSERT INTO entradas (descricao, valor, mes_referencia) VALUES ($1, $2, $3)',
            [descricao, valor, mes_referencia]
        );
        res.status(201).json({ message: 'Entrada registrada com sucesso' });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// 2. Listar entradas de um mês específico
app.get('/api/entradas/mes/:mes', async (req, res) => {
    const { mes } = req.params;
    try {
        const result = await db.query(
            'SELECT id, descricao, valor, mes_referencia FROM entradas WHERE mes_referencia = $1 ORDER BY id DESC', 
            [mes]
        );
        
        const somaRes = await db.query(
            'SELECT COALESCE(SUM(valor), 0) as total FROM entradas WHERE mes_referencia = $1', 
            [mes]
        );

        res.json({
            entradas: result.rows,
            total_soma: parseFloat(somaRes.rows[0].total)
        });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// 3. Gráfico de Evolução de Entradas
// Gráfico do Dashboard Principal: Evolução Acumulada de Investimentos
app.get('/api/dashboard/rendimentos', async (req, res) => {
    try {
        // Busca a soma de entradas e saídas agrupadas por mês
        const result = await db.query(`
            SELECT mes_referencia as mes,
                   SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE -valor END) as total_mes
            FROM investimentos
            GROUP BY mes_referencia
            ORDER BY mes_referencia ASC
        `);
        
        // Calcula o saldo acumulado progressivo para gerar a linha do gráfico
        let acumulado = 0;
        const dadosGrafico = result.rows.map(row => {
            acumulado += parseFloat(row.total_mes);
            return {
                mes: row.mes,
                total: acumulado
            };
        });
        
        res.json(dadosGrafico);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// 4. Deletar uma entrada
app.delete('/api/entradas/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM entradas WHERE id = $1', [req.params.id]);
        res.json({ message: 'Entrada removida com sucesso' });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});


// ==========================================
// 8. NOVAS ROTAS DO DASHBOARD (EVOLUÇÃO E FIXOS)
// ==========================================

// Busca apenas as despesas fixas do tipo BOLETO para somar no total do mês
app.get('/api/gastos-fixos/:mes', async (req, res) => {
    try {
        const result = await db.query("SELECT COALESCE(SUM(valor), 0) as total_fixo FROM despesas_fixas WHERE categoria = 'Boleto'");
        res.json({ total_fixo: parseFloat(result.rows[0].total_fixo) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// Evolução de Gastos Totais (Faturas da sua parte + Fixos) dos últimos 6 meses
app.get('/api/dashboard/gastos-evolucao', async (req, res) => {
    try {
        // Uma query simplificada para o lab: soma tudo agrupado por mês
        // Nota: Para precisão máxima, usaríamos as regras de subtração, mas aqui simularemos o histórico para o gráfico
        const result = await db.query(`
            SELECT 
                f.mes_referencia as mes, 
                SUM(f.valor_total) as total_faturas
            FROM faturas_totais f
            GROUP BY f.mes_referencia
            ORDER BY f.mes_referencia ASC LIMIT 6
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 9. ROTAS DA PÁGINA DEDICADA DO CARTÃO
// ==========================================

// Busca as informações básicas do cartão
app.get('/api/cartoes/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM cartoes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Cartão não encontrado' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Evolução histórica do cartão (O que é REALMENTE seu)
app.get('/api/cartoes/:id/evolucao', async (req, res) => {
    const { id } = req.params;
    try {
        // Busca as faturas e subtrai as parcelas de terceiros ativas naqueles meses
        const result = await db.query(`
            SELECT 
                f.mes_referencia as mes,
                f.valor_total,
                COALESCE((
                    SELECT SUM(t.valor_parcela) 
                    FROM gastos_terceiros t 
                    WHERE t.cartao_id = f.cartao_id 
                    AND TO_DATE(t.mes_inicio || '-01', 'YYYY-MM-DD') <= TO_DATE(f.mes_referencia || '-01', 'YYYY-MM-DD')
                    AND TO_DATE(t.mes_inicio || '-01', 'YYYY-MM-DD') + (t.quantidade_parcelas || ' month')::INTERVAL > TO_DATE(f.mes_referencia || '-01', 'YYYY-MM-DD')
                ), 0) as total_terceiros
            FROM faturas_totais f
            WHERE f.cartao_id = $1
            ORDER BY f.mes_referencia ASC LIMIT 6
        `, [id]);
        
        // Formata os dados enviando apenas a evolução do "Gasto Real" (Sua parte)
        const dados = result.rows.map(r => ({
            mes: r.mes,
            gasto_real: parseFloat(r.valor_total) - parseFloat(r.total_terceiros)
        }));
        
        res.json(dados);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 10. RESUMO ESPECÍFICO DO MÊS NO CARTÃO (Com Histórico)
// ==========================================
app.get('/api/cartoes/:id/mes/:mes', async (req, res) => {
    const { id, mes } = req.params;
    try {
        const faturaRes = await db.query('SELECT valor_total FROM faturas_totais WHERE cartao_id = $1 AND mes_referencia = $2', [id, mes]);
        const valorTotal = faturaRes.rows.length > 0 ? parseFloat(faturaRes.rows[0].valor_total) : 0;

        const terceirosRes = await db.query(`
            SELECT id, quem_deve as descricao, valor_parcela, mes_inicio, quantidade_parcelas, 'terceiro' as tipo
            FROM gastos_terceiros 
            WHERE cartao_id = $1 
              AND TO_DATE(mes_inicio || '-01', 'YYYY-MM-DD') <= TO_DATE($2 || '-01', 'YYYY-MM-DD')
              AND TO_DATE(mes_inicio || '-01', 'YYYY-MM-DD') + (quantidade_parcelas || ' month')::INTERVAL > TO_DATE($2 || '-01', 'YYYY-MM-DD')
        `, [id, mes]);

        const parcelasRes = await db.query(`
            SELECT id, descricao, valor_parcela, mes_inicio, quantidade_parcelas, 'parcela' as tipo
            FROM despesas_parceladas
            WHERE cartao_id = $1 
              AND TO_DATE(mes_inicio || '-01', 'YYYY-MM-DD') <= TO_DATE($2 || '-01', 'YYYY-MM-DD')
              AND TO_DATE(mes_inicio || '-01', 'YYYY-MM-DD') + (quantidade_parcelas || ' month')::INTERVAL > TO_DATE($2 || '-01', 'YYYY-MM-DD')
        `, [id, mes]);

        const transacoes = [...terceirosRes.rows, ...parcelasRes.rows];
        const totalTerceiros = terceirosRes.rows.reduce((acc, curr) => acc + parseFloat(curr.valor_parcela), 0);
        
        // MATEMÁTICA CORRIGIDA: Ignora as suas parcelas na subtração, elas são só histórico!
        const valorReal = valorTotal - totalTerceiros;

        res.json({
            valor_total: valorTotal,
            valor_real: valorReal,
            transacoes: transacoes
        });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 11. EDITAR E APAGAR TRANSAÇÕES
// ==========================================

// Rota para Apagar (Recebe o tipo: 'terceiro' ou 'parcela' e o ID)
app.delete('/api/transacoes/:tipo/:id', async (req, res) => {
    const { tipo, id } = req.params;
    const tabela = tipo === 'terceiro' ? 'gastos_terceiros' : 'despesas_parceladas';
    try {
        await db.query(`DELETE FROM ${tabela} WHERE id = $1`, [id]);
        res.json({ message: 'Apagado com sucesso' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rota para Editar
app.put('/api/transacoes/:tipo/:id', async (req, res) => {
    const { tipo, id } = req.params;
    const { descricao, valor_parcela, mes_inicio, quantidade_parcelas } = req.body;
    
    try {
        if (tipo === 'terceiro') {
            await db.query(
                `UPDATE gastos_terceiros SET quem_deve = $1, valor_parcela = $2, mes_inicio = $3, quantidade_parcelas = $4 WHERE id = $5`,
                [descricao, valor_parcela, mes_inicio, quantidade_parcelas, id]
            );
        } else {
            await db.query(
                `UPDATE despesas_parceladas SET descricao = $1, valor_parcela = $2, mes_inicio = $3, quantidade_parcelas = $4 WHERE id = $5`,
                [descricao, valor_parcela, mes_inicio, quantidade_parcelas, id]
            );
        }
        res.json({ message: 'Atualizado com sucesso' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 12. ROTAS DE DESPESAS FIXAS
// ==========================================
app.get('/api/despesas-fixas', async (req, res) => {
    try {
        // Traz as despesas e o nome do cartão associado (se houver)
        const result = await db.query(`
            SELECT d.*, c.nome as cartao_nome 
            FROM despesas_fixas d 
            LEFT JOIN cartoes c ON d.cartao_id = c.id
            ORDER BY d.id DESC
        `);
        res.json(result.rows);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/despesas-fixas', async (req, res) => {
    const { descricao, valor, categoria, cartao_id } = req.body;
    try {
        await db.query(
            'INSERT INTO despesas_fixas (descricao, valor, categoria, cartao_id) VALUES ($1, $2, $3, $4)',
            [descricao, valor, categoria, cartao_id || null]
        );
        res.status(201).json({ message: 'Despesa criada com sucesso' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/despesas-fixas/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM despesas_fixas WHERE id = $1', [req.params.id]);
        res.json({ message: 'Apagado' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 13. ACRESCENTAR VALOR À FATURA TOTAL (Botão +)
// ==========================================
app.post('/api/faturas-totais/acrescentar', async (req, res) => {
    const { cartao_id, mes_referencia, valor } = req.body;
    try {
        // Se a fatura não existir, ele cria. Se existir, ele SOMA o valor novo ao valor que já estava lá!
        await db.query(
            `INSERT INTO faturas_totais (cartao_id, mes_referencia, valor_total) 
             VALUES ($1, $2, $3)
             ON CONFLICT (cartao_id, mes_referencia) 
             DO UPDATE SET valor_total = faturas_totais.valor_total + EXCLUDED.valor_total`,
            [cartao_id, mes_referencia, valor]
        );
        res.json({ message: 'Valor acrescentado com sucesso' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Função auxiliar para calcular o saldo livre dinâmico de qualquer mês
async function calcularSaldoLivreMes(mes) {
    const entradas = await db.query("SELECT COALESCE(SUM(valor), 0) as total FROM entradas WHERE mes_referencia = $1", [mes]);
    const fixos = await db.query("SELECT COALESCE(SUM(valor), 0) as total FROM despesas_fixas WHERE categoria = 'Boleto'");
    const faturas = await db.query("SELECT COALESCE(SUM(valor_total), 0) as total FROM faturas_totais WHERE mes_referencia = $1", [mes]);
    const terceiros = await db.query(`
        SELECT COALESCE(SUM(valor_parcela), 0) as total FROM gastos_terceiros 
        WHERE TO_DATE(mes_inicio || '-01', 'YYYY-MM-DD') <= TO_DATE($1 || '-01', 'YYYY-MM-DD')
          AND TO_DATE(mes_inicio || '-01', 'YYYY-MM-DD') + (quantidade_parcelas || ' month')::INTERVAL > TO_DATE($1 || '-01', 'YYYY-MM-DD')
    `, [mes]);

    const realCard = parseFloat(faturas.rows[0].total) - parseFloat(terceiros.rows[0].total);
    const totalGastos = parseFloat(fixos.rows[0].total) + (realCard > 0 ? realCard : 0);
    return parseFloat(entradas.rows[0].total) - totalGastos;
}

// Rota para o modal perguntar o saldo dinâmico de um mês
app.get('/api/metas/saldo/:mes', async (req, res) => {
    try {
        const saldo = await calcularSaldoLivreMes(req.params.mes);
        res.json({ saldo_livre: saldo });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ROTAS DE METAS
app.get('/api/metas', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM metas ORDER BY mes ASC');
        const metasComSaldo = [];
        for (let meta of result.rows) {
            const saldoLivre = await calcularSaldoLivreMes(meta.mes);
            metasComSaldo.push({ ...meta, saldo_livre: saldoLivre });
        }
        res.json(metasComSaldo);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/metas', async (req, res) => {
    const { mes, valor_meta } = req.body;
    try {
        await db.query(`INSERT INTO metas (mes, valor_meta) VALUES ($1, $2) ON CONFLICT (mes) DO UPDATE SET valor_meta = EXCLUDED.valor_meta`, [mes, valor_meta]);
        res.status(201).json({ message: 'Meta salva com sucesso' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/metas/:id', async (req, res) => {
    const { cumprida } = req.body;
    try {
        await db.query('UPDATE metas SET cumprida = $1 WHERE id = $2', [cumprida, req.params.id]);
        res.json({ message: 'Meta atualizada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/metas/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM metas WHERE id = $1', [req.params.id]);
        res.json({ message: 'Meta removida' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ROTAS DE INVESTIMENTOS
app.get('/api/investimentos', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM investimentos ORDER BY mes_referencia ASC, id ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/investimentos', async (req, res) => {
    const { descricao, banco, tipo, valor, mes_referencia } = req.body;
    try {
        await db.query('INSERT INTO investimentos (descricao, banco, tipo, valor, mes_referencia) VALUES ($1, $2, $3, $4, $5)', [descricao, banco, tipo, valor, mes_referencia]);
        res.status(201).json({ message: 'Investimento registrado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/investimentos/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM investimentos WHERE id = $1', [req.params.id]);
        res.json({ message: 'Investimento removido' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
