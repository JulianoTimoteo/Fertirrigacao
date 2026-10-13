import { 
    getEquipamentos,
    getLeiturasESP 
} from '../api.js';
import { showMessage, formatTimestamp } from '../main.js';
import { 
    STATUS, 
    CONFIG_PADRAO,
    formatarTimestampFixo,
    recalcularStatusHistorico
} from './regras.js';

let depthChart = null;
let productiveChart = null;
let currentEquipmentId = null;
let currentMacAddress = null;
let currentLimits = { 
    produtivoMin: 10.0, 
    produtivoMax: 45.0, 
    hMesa: 100.0,       // x PADRÒO 100.0 igual ao historico.js e equipamentos.js
    paradoTolerancia: 5.0 
};
let readingsCache = [];
let pollingInterval = null;
let equipamentoAtivo = null;
let ultimaLeituraTimestamp = null;
let timerInterval = null;
let segundosRestantes = 10;
let refreshTime = 10;

export function getCurrentEquipmentId() { return currentEquipmentId; }
export function getCurrentMacAddress() { return currentMacAddress; }
export function getCurrentLimits() { return currentLimits; }
export function getReadingsCache() { return readingsCache; }

// ============================================================================
// TIMER
// ============================================================================

function calcularTempoSemLeitura() {
    if (!ultimaLeituraTimestamp || !(ultimaLeituraTimestamp instanceof Date) || isNaN(ultimaLeituraTimestamp.getTime())) {
        return 9999;
    }
    const agora = new Date();
    const diffMinutos = (agora.getTime() - ultimaLeituraTimestamp.getTime()) / (1000 * 60);
    console.log(`⏱️ Última leitura: ${ultimaLeituraTimestamp.toLocaleString()}, Diferença: ${diffMinutos.toFixed(2)} min`);
    return diffMinutos;
}

// Guard: evita requisições simultâneas ao GAS
let _loadingData = false;

function iniciarTimer(segundos = refreshTime) {
    segundosRestantes = segundos;
    if (timerInterval) clearInterval(timerInterval);

    const timerEl = document.getElementById('refresh-timer');
    if (timerEl) timerEl.textContent = segundosRestantes;

    timerInterval = setInterval(() => {
        segundosRestantes--;
        const timerEl = document.getElementById('refresh-timer');
        if (timerEl) {
            timerEl.textContent = segundosRestantes;
            if (segundosRestantes <= 3)      timerEl.className = 'text-red-600 font-bold text-lg animate-pulse';
            else if (segundosRestantes <= 7) timerEl.className = 'text-amber-600 font-bold text-lg';
            else                             timerEl.className = 'text-emerald-600 font-bold text-lg';
        }
        if (segundosRestantes <= 0) {
            segundosRestantes = refreshTime;
            if (timerEl) timerEl.textContent = segundosRestantes;
            // Só dispara se a aba de implementos estiver ativa e não houver requisição em andamento
            const tabImpl = document.getElementById('implementos-tab');
            const abaAtiva = tabImpl && tabImpl.classList.contains('active');
            if (abaAtiva && currentEquipmentId && !_loadingData) loadDataFromAPI();
        }
    }, 1000);
}

export function setRefreshTime(segundos) {
    refreshTime = segundos;
    segundosRestantes = segundos;
    const select = document.getElementById('refresh-select');
    if (select) select.value = segundos;
    if (timerInterval) { clearInterval(timerInterval); iniciarTimer(segundos); }
}

// ============================================================================
// SELETOR DE EQUIPAMENTOS
// ============================================================================

export async function setupImplementosSelector() {
    const select = document.getElementById('equipment-select-implementos');
    if (!select) { console.error("R Select não encontrado!"); return; }

    try {
        const equipamentos = await getEquipamentos();
        console.log("S& Equipamentos carregados:", equipamentos);
        
        select.innerHTML = '<option value="">-- Selecione o Equipamento Ativo --</option>';
        let temAtivos = false;
        
        equipamentos.forEach(equip => {
            const ativo = equip.ativo == '1' || equip.ativo == 1 || equip.ativo === true || equip.isActive === true;
            const mac   = equip.macVinculado || equip.mac || '';
            
            if (ativo && mac && mac.length > 5) {
                temAtivos = true;
                const option = document.createElement('option');
                option.value        = equip.codigo;
                option.text         = `${equip.codigo} - ${equip.descricao} (${mac})`;
                option.dataset.mac  = mac;
                // x  PADRÒO 100 igual ao historico.js e equipamentos.js
                option.dataset.hmesa  = equip.hMesa  || equip.hmesa  || 100;
                option.dataset.lmin   = equip.produtivoMin || equip.min || 10;
                option.dataset.lmax   = equip.produtivoMax || equip.max || 45;
                option.dataset.grupo  = equip.grupo  || "S/G";
                option.dataset.equipe = equip.equipe || "S/E";
                select.appendChild(option);
                console.log(`~" ${equip.codigo} | hMesa=${option.dataset.hmesa} min=${option.dataset.lmin} max=${option.dataset.lmax}`);
            }
        });

        if (!temAtivos) {
            select.innerHTML = '<option value="">Nenhum equipamento ativo com sensor vinculado</option>';
        }

        select.addEventListener('change', (e) => {
            const sel = e.target.options[e.target.selectedIndex];
            if (sel && sel.value && !sel.value.includes('Nenhum')) {
                currentEquipmentId = sel.value;
                currentMacAddress  = sel.dataset.mac;
                
                const hMesa = parseFloat(sel.dataset.hmesa) || 100;
                const lmin  = parseFloat(sel.dataset.lmin)  || 10;
                const lmax  = parseFloat(sel.dataset.lmax)  || 45;

                currentLimits = { produtivoMin: lmin, produtivoMax: lmax, hMesa, paradoTolerancia: 5.0 };

                equipamentoAtivo = {
                    codigo:       sel.value,
                    mac:          sel.dataset.mac,
                    hMesa,
                    produtivoMin: lmin,
                    produtivoMax: lmax,
                    min:          lmin,
                    max:          lmax,
                    grupo:        sel.dataset.grupo  || "S/G",
                    equipe:       sel.dataset.equipe || "S/E",
                    isActive:     true
                };

                console.log("S& Equipamento ativo:", equipamentoAtivo);
                updateConfigForm(currentLimits);
                readingsCache = [];
                ultimaLeituraTimestamp = null;
                iniciarTimer(refreshTime);
                
                // Carrega imediatamente ao selecionar equipamento SE a aba implementos estiver visível
                const tabImpl = document.getElementById('implementos-tab');
                const abaAtiva = tabImpl && tabImpl.classList.contains('active');
                if (abaAtiva && !_loadingData) loadDataFromAPI();
            }
        });

        if (select.options.length > 1) {
            // Procura preferencialmente um implemento agrícola (TR-* ou que não seja T1..T5)
            let chosenIdx = -1;
            for (let i = 1; i < select.options.length; i++) {
                const val = select.options[i].value;
                if (!/^T[1-5]$/i.test(val)) {
                    chosenIdx = i;
                    break;
                }
            }
            select.selectedIndex = chosenIdx !== -1 ? chosenIdx : 1;
            select.dispatchEvent(new Event('change'));
        }

        const refreshSelect = document.getElementById('refresh-select');
        if (refreshSelect) {
            refreshSelect.value = refreshTime.toString();
            refreshSelect.addEventListener('change', (e) => setRefreshTime(parseInt(e.target.value)));
        }

    } catch (e) { 
        console.error("R Erro no Seletor:", e);
        showMessage('Erro', 'Não foi possível carregar a lista de equipamentos.', 'error');
    }
}

// ============================================================================
// CARREGAMENTO DE DADOS
// x USA recalcularStatusHistorico DO regras.js  MESMO ENGINE DO historico.js
//   Dashboard e Histórico mostram SEMPRE o mesmo status para a mesma leitura
// ============================================================================

async function loadDataFromAPI() {
    if (!currentEquipmentId || !equipamentoAtivo) {
        console.log("a️ Nenhum equipamento selecionado");
        return;
    }
    // Evita requisições simultâneas  GAS processa uma por vez
    if (_loadingData) {
        console.log("⏳ Requisição já em andamento, ignorando disparo duplicado");
        return;
    }
    _loadingData = true;

    try {
        console.log(`= Buscando leituras para cdigo: ${currentEquipmentId}`);
        const leituras = await getLeiturasESP(currentEquipmentId, null, null, 100);
        
        const historyBody = document.getElementById('readings-history');
        
        if (!leituras || leituras.length === 0) {
            readingsCache = [];
            ultimaLeituraTimestamp = null;
            if (historyBody) {
                historyBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">Nenhum pacote encontrado.</td></tr>';
            }
            updateDashboard([]);
            return;
        }

        console.log(`S& ${leituras.length} leituras brutas recebidas`);

        // x DIAGNSTICO DE TIMESTAMP  mostra o valor bruto e convertido da API
        if (leituras.length > 0) {
            const amostras = leituras.slice(0, 3);
            amostras.forEach((l, i) => {
                const ts = l.timestamp;
                const tsMs  = typeof ts === 'number' && ts > 1e12 ? ts : ts * 1000;
                const dateMs  = new Date(tsMs);
                const dateSec = new Date(ts * 1000);
                const dateRaw = new Date(ts);
                console.log(`🕵️ Leitura[${i}] timestamp bruto=${ts} (tipo:${typeof ts})`);
                console.log(`     new Date(ts)       = ${dateRaw.toLocaleString('pt-BR')} (${ts < 1e10 ? 'segundos?' : 'ms?'})`);
                console.log(`     new Date(ts*1000)  = ${dateSec.toLocaleString('pt-BR')}`);
                console.log(`     formatarTimestamp  = ${formatarTimestampFixo(ts).toLocaleString('pt-BR')}`);
                console.log(`     data/hora API:     = ${l.data || '?'} ${l.hora || '?'}`);
            });
        }

        // x MESMO ENGINE DO historico.js  garante consistência total
        // recalcularStatusHistorico retorna em ordem DECRESCENTE (mais recente primeiro)
        const leiturasRecalculadas = recalcularStatusHistorico(leituras, equipamentoAtivo);

        // Timestamp da leitura mais recente via formatarTimestampFixo (igual ao historico.js)
        if (leiturasRecalculadas.length > 0) {
            const ulr = leiturasRecalculadas[0];
            ultimaLeituraTimestamp = formatarTimestampFixo(ulr.timestamp);
            console.log(`📅 Última: ${ultimaLeituraTimestamp.toLocaleString()} | ${ulr.media_cm || 0}cm | ${ulr.statusRecalculado}`);
        }

        const hMesaAtual  = equipamentoAtivo.hMesa;
        const TEMPO_LIMITE = CONFIG_PADRAO.TEMPO_DESLIGADO_MINUTOS;
        const tempoSemLeitura = calcularTempoSemLeitura();

        // Montar readingsCache com as 50 mais recentes
        readingsCache = leiturasRecalculadas.slice(0, 50).map((data, idx) => {
            const leituraVal = parseFloat(data.media_cm ?? data.leitura_sensor_cm ?? data.leitura ?? 0) || 0;
            const ts         = formatarTimestampFixo(data.timestamp); // x mesmo que historico.js
            const penetracao = hMesaAtual - leituraVal;
            const statusBase = data.statusRecalculado || STATUS.PARADO_MESA;

            // Status em tempo real para a leitura mais recente
            let statusTempoReal = statusBase;
            let motivoTempoReal = data.motivo || '';
            if (idx === 0 && tempoSemLeitura > TEMPO_LIMITE) {
                statusTempoReal = STATUS.DESLIGADO;
                motivoTempoReal = `Sem pacotes há ${tempoSemLeitura.toFixed(1)}min`;
            }

            return {
                timestamp:       ts,
                leitura:         leituraVal,
                profundidade:    penetracao,
                hMesa:           hMesaAtual,
                statusBase,
                statusTempoReal,
                motivoTempoReal,
                motivo:          data.motivo || '',
                desvio:          data.desvio_cm,
                pacote_id:       data.pacote_id,
                grupo:           equipamentoAtivo.grupo  || data.grupo  || "S/G",
                equipe:          equipamentoAtivo.equipe || data.equipe || "S/E",
                sd_status:       'OK'
            };
        });

        console.log(`📊 Cache: ${readingsCache.length} | Recente: ${readingsCache[0]?.leitura}cm | ${readingsCache[0]?.statusBase} | ${readingsCache[0]?.timestamp?.toLocaleString()}`);
        updateDashboard(readingsCache);

        // x Sincroniza o cronômetro do cabeçalho com o envio do ESP32 de implementos
        window.dispatchEvent(new CustomEvent('esp32:syncCycle', {
            detail: {
                modulo: 'implementos',
                intervalSeconds: refreshTime || 10,
                timestamp: Date.now()
            }
        }));

    } catch (e) { 
        console.error("R Erro no carregamento:", e);
    } finally {
        _loadingData = false;
    }
}

export function forcarAtualizacaoImplementos() {
    if (!_loadingData && currentEquipmentId) {
        loadDataFromAPI();
    }
}

// ============================================================================
// DASHBOARD
// ============================================================================

function updateDashboard(readings) {
    if (!document.getElementById('depth-chart')) return;
    
    const hasReadings = readings && readings.length > 0;
    toggleSkeletons(hasReadings);
    
    const badge     = document.getElementById('connection-status-badge');
    const badgeText = document.getElementById('connection-status-text');

    if (!hasReadings) {
        renderStatus('Aguardando', 0, 0, '');
        updateProductiveChart([]);
        updateChart([]);
        if (badge) badge.classList.add('hidden');
        return;
    }

    const latestReading   = readings[0];
    const latestDepth     = latestReading.leitura     || 0;
    const latestProfund   = latestReading.profundidade || 0;
    const tempoSemLeitura = calcularTempoSemLeitura();
    const TEMPO_LIMITE    = CONFIG_PADRAO.TEMPO_DESLIGADO_MINUTOS;

        console.log(`📊 Dashboard | Sensor: ${latestDepth}cm | Prof: ${latestProfund}cm | Status: ${latestReading.statusBase} | ${tempoSemLeitura.toFixed(1)}min atrás`);

    // Badge Online/Offline
    if (badge) {
        badge.classList.remove('hidden', 'bg-gray-400', 'bg-emerald-500', 'bg-red-500');
        if (tempoSemLeitura <= TEMPO_LIMITE) {
            badge.classList.add('bg-emerald-500', 'flex');
            if (badgeText) badgeText.textContent = 'Online';
        } else {
            badge.classList.add('bg-red-500', 'flex');
            if (badgeText) badgeText.textContent = 'Offline';
        }
    }

    const statusParaExibir = latestReading.statusTempoReal || latestReading.statusBase;
    const motivoParaExibir = latestReading.motivoTempoReal || latestReading.motivo;

    renderStatus(statusParaExibir, latestDepth, latestProfund, motivoParaExibir);
    updateProductiveChart(readings);
    updateChart(readings);

    // Percentuais de distribuição
    const total  = readings.length;
    const ideal  = readings.filter(r => r.statusBase === STATUS.TRABALHANDO_IDEAL).length;
    const raso   = readings.filter(r => r.statusBase === STATUS.TRABALHANDO_RASO).length;
    const fundo  = readings.filter(r => r.statusBase === STATUS.TRABALHANDO_FUNDO).length;
    const desloc = readings.filter(r => r.statusBase === STATUS.DESLOCAMENTO).length;
    const parado = readings.filter(r => r.statusBase === STATUS.PARADO_MESA || r.statusBase === STATUS.PARADO_SUSPENSO).length;

        console.log(`📊 Distrib (${total}): Ideal=${ideal} Raso=${raso} Fundo=${fundo} Desloc=${desloc} Parado=${parado}`);

    document.getElementById('ideal-percent') ?.setAttribute('textContent', total ? ((ideal  / total) * 100).toFixed(1) + '%' : '0%');
    document.getElementById('raso-percent')  ?.setAttribute('textContent', total ? ((raso   / total) * 100).toFixed(1) + '%' : '0%');
    document.getElementById('fundo-percent') ?.setAttribute('textContent', total ? ((fundo  / total) * 100).toFixed(1) + '%' : '0%');
    document.getElementById('desloc-percent')?.setAttribute('textContent', total ? ((desloc / total) * 100).toFixed(1) + '%' : '0%');

    const idealEl  = document.getElementById('ideal-percent');
    const rasoEl   = document.getElementById('raso-percent');
    const fundoEl  = document.getElementById('fundo-percent');
    const deslocEl = document.getElementById('desloc-percent');
    if (idealEl)  idealEl.textContent  = total ? ((ideal  / total) * 100).toFixed(1) + '%' : '0%';
    if (rasoEl)   rasoEl.textContent   = total ? ((raso   / total) * 100).toFixed(1) + '%' : '0%';
    if (fundoEl)  fundoEl.textContent  = total ? ((fundo  / total) * 100).toFixed(1) + '%' : '0%';
    if (deslocEl) deslocEl.textContent = total ? ((desloc / total) * 100).toFixed(1) + '%' : '0%';

    // Tabela de leituras
    const historyBody = document.getElementById('readings-history');
    if (historyBody) {
        historyBody.innerHTML = '';
        readings.slice(0, 30).forEach(r => {
            let statusClass = 'text-gray-500';
            if      (r.statusBase === STATUS.TRABALHANDO_IDEAL)                                      statusClass = 'text-green-700 font-bold';
            else if (r.statusBase === STATUS.TRABALHANDO_RASO)                                       statusClass = 'text-amber-600 font-medium';
            else if (r.statusBase === STATUS.TRABALHANDO_FUNDO)                                      statusClass = 'text-red-600 font-medium';
            else if (r.statusBase === STATUS.DESLOCAMENTO)                                           statusClass = 'text-purple-600 font-medium';
            else if (r.statusBase === STATUS.PARADO_MESA || r.statusBase === STATUS.PARADO_SUSPENSO) statusClass = 'text-blue-600 font-medium';

            const tsFormatado = (r.timestamp instanceof Date && !isNaN(r.timestamp.getTime()))
                ? r.timestamp.toLocaleString('pt-BR')
                : formatTimestamp(r.timestamp);

            const row = document.createElement('tr');
            row.className = 'table-row hover:bg-gray-50 transition-colors';
            row.innerHTML = `
                <td class="px-6 py-3">${tsFormatado}</td>
                <td class="px-6 py-3 font-mono">${(parseFloat(r.leitura) || 0).toFixed(2)} cm</td>
                <td class="px-6 py-3 ${statusClass}" title="${r.motivo || ''}">${r.statusBase}</td>
                <td class="px-6 py-3">${r.sd_status || 'OK'}</td>`;
            historyBody.appendChild(row);
        });
    }
}

function renderStatus(status, leitura, profundidade, motivo) {
    const statusCard = document.getElementById('current-status-card');
    const statusText = document.getElementById('status-value-text');
    if (!statusCard || !statusText) return;

    statusText.textContent = status;

    const allClasses = ['status-produtivo', 'status-parado', 'status-manutencao', 'status-deslocando', 'status-erro'];
    statusCard.classList.remove(...allClasses);

    const mapa = {
        [STATUS.TRABALHANDO_IDEAL]:   { cls: 'status-produtivo',  cor: '#40800c' },
        [STATUS.TRABALHANDO_RASO]:    { cls: 'status-deslocando', cor: '#f59e0b' },
        [STATUS.TRABALHANDO_FUNDO]:   { cls: 'status-manutencao', cor: '#dc2626' },
        [STATUS.DESLOCAMENTO]:        { cls: 'status-deslocando', cor: '#8b5cf6' },
        [STATUS.PARADO_MESA]:         { cls: 'status-parado',     cor: '#3b82f6' },
        [STATUS.PARADO_SUSPENSO]:     { cls: 'status-parado',     cor: '#3b82f6' },
        [STATUS.DESLIGADO]:           { cls: 'status-erro',       cor: '#6b7280' },
    };
    const info = mapa[status] || { cls: 'status-erro', cor: '#6b7280' };

    statusCard.classList.add(info.cls);
    statusCard.style.setProperty('--animation-color', info.cor);
    statusCard.setAttribute('title', motivo || '');

    const numLeitura = (typeof leitura === 'object' && leitura !== null) ? Number(leitura.nivel ?? leitura.valor ?? 0) : Number(leitura || 0);
    const numProfundidade = (typeof profundidade === 'object' && profundidade !== null) ? Number(profundidade.profundidade ?? profundidade.valor ?? 0) : Number(profundidade || 0);

    const elLastDepth = document.getElementById('last-depth');
    if (elLastDepth) elLastDepth.textContent = `${(isNaN(numLeitura) ? 0 : numLeitura).toFixed(2)} cm`;
    const elAvgDepth = document.getElementById('avg-depth');
    if (elAvgDepth) elAvgDepth.textContent = `${(isNaN(numProfundidade) ? 0 : numProfundidade).toFixed(2)} cm`;
}

function updateConfigForm(limits) {
    const limitProdutivo = document.getElementById('limit-produtivo');
    const limitParado    = document.getElementById('limit-parado');
    if (limitProdutivo) {
        limitProdutivo.innerHTML = limits
            ? `${(limits.produtivoMin || 0).toFixed(1)} / ${(limits.produtivoMax || 0).toFixed(1)} cm`
            : '-- / -- cm';
    }
    if (limitParado) {
        limitParado.innerHTML = limits
            ? `${(limits.hMesa || 0).toFixed(1)} &pm; ${(limits.paradoTolerancia || 0).toFixed(1)} cm`
            : '-- &pm; -- cm';
    }
}

function toggleSkeletons(showData = true) {
    ['last-depth', 'avg-depth'].forEach(id => {
        document.getElementById(`${id}-skeleton`)?.classList.toggle('hidden', showData);
        document.getElementById(id)?.classList.toggle('hidden', !showData);
    });
    const productiveCard = document.getElementById('productive-percent-card');
    if (productiveCard) {
        productiveCard.querySelector('#productive-percent-skeleton')?.classList.toggle('hidden', showData);
        productiveCard.querySelector('canvas')?.classList.toggle('hidden', !showData);
        productiveCard.querySelector('#productive-chart-legend')?.classList.toggle('hidden', !showData);
    }
}

// ============================================================================
// GRÁFICOS
// ============================================================================

// Variável global para controlar o tema
let chartTheme = 'dark'; // 'dark' ou 'light'

// Função para alternar tema
export function toggleChartTheme() {
    chartTheme = chartTheme === 'dark' ? 'light' : 'dark';
    // Recarregar o gráfico com os dados atuais
    if (currentEquipmentId) {
        loadDataFromAPI();
    }
}

function updateChart(readings) {
    const ctxEl = document.getElementById('depth-chart');
    if (!ctxEl) return;

    // Destrói qualquer instância prévia no canvas antes de renderizar (evita "Canvas is already in use")
    const existingChart = Chart.getChart(ctxEl);
    if (existingChart) {
        try { existingChart.destroy(); } catch (e) {}
    }
    if (depthChart) {
        try { depthChart.destroy(); } catch (e) {}
        depthChart = null;
    }

    // PEGA APENAS AS LEITURAS MAIS RECENTES
    const ultimas20 = readings.slice(0, 60);
    const reversedReadings = [...ultimas20].reverse();
    
    const { hMesa, produtivoMin, produtivoMax } = currentLimits; 

    const timestamps = [];
    const hMesaAtual = [];    // Linha 1: Onde o sensor está fisicamente
    const insercaoReal = [];  // Linha 2: O quanto entrou na terra

    reversedReadings.forEach(r => {
        const leituraBruta = r.media_cm || r.leitura_sensor_cm || r.distancia_sensor_solo || r.leitura || 0;
        const sensor = parseFloat(leituraBruta);
        
        // Formata timestamp com suporte a Date, ms, segundos e data_hora brasileira
        const timestamp = formatarTimestampFixo(r.timestamp_formatado || r.data_hora || r.timestamp);
        timestamps.push(timestamp);

        // 1. h_Mesa Atual (Posição no Ar)
        hMesaAtual.push(sensor);

        // 2. Inserção Real (No Solo)
        const diferenca = sensor - hMesa;
        insercaoReal.push(sensor < hMesa ? diferenca : 0);
    });

    const ctx = ctxEl.getContext('2d');
    
    try {
        depthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    {
                        label: 'Altura do Implemento (Sensor)',
                        data: hMesaAtual,
                        borderColor: '#3b82f6',
                        borderWidth: 3,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                        fill: false,
                        tension: 0.2,
                        zIndex: 10
                    },
                    {
                        label: 'Inserção no Solo',
                        data: insercaoReal,
                        borderColor: '#40800c',
                        backgroundColor: 'rgba(64, 128, 12, 0.2)',
                        borderWidth: 4,
                        fill: 'origin',
                        zIndex: 11,
                        segment: {
                            borderColor: ctx => {
                                const p = Math.abs(ctx.p0.parsed.y);
                                if (p > 0) {
                                    if (p >= produtivoMin && p <= produtivoMax) return '#40800c';
                                    return p < produtivoMin ? '#f59e0b' : '#ef4444';
                                }
                                return 'transparent';
                            }
                        }
                    },
                    {
                        label: `h_Mesa FIXA (${hMesa}cm)`,
                        data: timestamps.map(() => hMesa),
                        borderColor: '#f97316',
                        borderDash: [10, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: 'SOLO (0cm)',
                        data: timestamps.map(() => 0),
                        borderColor: '#ffffff',
                        borderWidth: 3,
                        pointRadius: 0,
                        fill: false,
                        zIndex: 5
                    },
                    {
                        label: `Prof Min (${produtivoMin}cm)`,
                        data: timestamps.map(() => -produtivoMin),
                        borderColor: '#f59e0b',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: `Prof Max (${produtivoMax}cm)`,
                        data: timestamps.map(() => -produtivoMax),
                        borderColor: '#ef4444',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { 
                        type: 'time',
                        time: { 
                            displayFormats: { 
                                minute: 'HH:mm',
                                hour: 'HH:mm',
                                day: 'dd/MM',
                                month: 'MM/yyyy'
                            },
                            tooltipFormat: 'dd/MM/yyyy - HH:mm:ss'
                        },
                        ticks: { 
                            color: '#f1f5f9',
                            maxRotation: 45,
                            minRotation: 45,
                            source: 'data',
                            autoSkip: true,
                            maxTicksLimit: 10
                        },
                        grid: { display: false }
                    },
                    y: {
                        min: -60,
                        max: 80,
                        ticks: {
                            color: '#f1f5f9',
                            stepSize: 10,
                            callback: (v) => {
                                if (v === 0) return 'SOLO';
                                if (v === hMesa) return `h_MESA (${hMesa}cm)`;
                                if (v === -produtivoMin) return `${produtivoMin}cm`;
                                if (v === -produtivoMax) return `${produtivoMax}cm`;
                                return Math.abs(v) + 'cm';
                            }
                        },
                        grid: { color: 'rgba(148, 163, 184, 0.2)' }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#f1f5f9', usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            title: (context) => {
                                if (!context || !context[0]) return '';
                                const d = context[0].label || context[0].raw?.x;
                                return formatTimestamp(d);
                            },
                            label: (ctx) => {
                                const val = ctx.parsed.y;
                                if (ctx.datasetIndex === 0) {
                                    const status = val > hMesa ? 'xaS Deslocamento' : 
                                                  val === hMesa ? 'a"️ Repouso' : ':️ Descendo';
                                    return `${status}: ${val.toFixed(1)}cm`;
                                }
                                if (ctx.datasetIndex === 1 && val < 0) {
                                    const prof = Math.abs(val);
                                    let zona = '';
                                    if (prof >= produtivoMin && prof <= produtivoMax) zona = 'Ideal';
                                    else if (prof < produtivoMin) zona = 'Raso';
                                    else zona = 'Fundo';
                                    return `:️ Inserção (${zona}): ${prof.toFixed(1)}cm no solo`;
                                }
                                return null;
                            }
                        }
                    }
                }
            }
        });
    } catch (chartErr) {
        console.warn('a️ Erro ao instanciar depthChart:', chartErr);
        const chartCleanup = Chart.getChart(ctxEl);
        if (chartCleanup) {
            try { chartCleanup.destroy(); } catch (e) {}
        }
        depthChart = null;
    }
}

// x ADICIONAR BOTÒO DE TEMA NO DASHBOARD
export function addThemeToggle() {
    const chartContainer = document.querySelector('#depth-chart').parentElement;
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'theme-toggle-btn';
    toggleBtn.innerHTML = `
        <span class="material-symbols-outlined">dark_mode</span>
        <span class="ml-2">Tema</span>
    `;
    toggleBtn.className = 'absolute top-4 right-4 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 z-50 shadow-lg';
    
    toggleBtn.addEventListener('click', () => {
        toggleChartTheme();
        const icon = toggleBtn.querySelector('.material-symbols-outlined');
        icon.textContent = chartTheme === 'dark' ? 'dark_mode' : 'light_mode';
    });
    
    chartContainer.style.position = 'relative';
    chartContainer.appendChild(toggleBtn);
}

function updateProductiveChart(readings) {
    const ctxEl    = document.getElementById('productive-chart');
    const legendEl = document.getElementById('productive-chart-legend');
    if (!ctxEl || !legendEl) return;
    if (productiveChart) { productiveChart.destroy(); productiveChart = null; }

    let idealCount = 0, rasoCount = 0, fundoCount = 0, deslocCount = 0, paradoCount = 0;
    readings.forEach(r => {
        const s = r.statusBase;
        if      (s === STATUS.TRABALHANDO_IDEAL)                           idealCount++;
        else if (s === STATUS.TRABALHANDO_RASO)                            rasoCount++;
        else if (s === STATUS.TRABALHANDO_FUNDO)                           fundoCount++;
        else if (s === STATUS.DESLOCAMENTO)                                deslocCount++;
        else if (s === STATUS.PARADO_MESA || s === STATUS.PARADO_SUSPENSO) paradoCount++;
    });

    legendEl.innerHTML = `
        <div class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0"></span><span><b>${idealCount}</b> Ideal</span></div>
        <div class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500 flex-shrink-0"></span><span><b>${rasoCount}</b> Raso</span></div>
        <div class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"></span><span><b>${fundoCount}</b> Fundo</span></div>
        <div class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full bg-purple-500 flex-shrink-0"></span><span><b>${deslocCount}</b> Desloc.</span></div>
        <div class="col-span-2 flex items-center justify-center gap-1 mt-1 pt-1 border-t border-gray-200">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0"></span>
            <span><b>${paradoCount}</b> Parado</span>
        </div>`;

    productiveChart = new Chart(ctxEl.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Ideal', 'Raso', 'Fundo', 'Desloc.', 'Parado'],
            datasets: [{
                data: [idealCount, rasoCount, fundoCount, deslocCount, paradoCount],
                backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#3b82f6'],
                borderColor: 'white',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            layout: { padding: { top: 0, bottom: 0, left: 0, right: 0 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => {
                    const total = c.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    const pct   = total > 0 ? (c.parsed / total * 100).toFixed(1) + '%' : '0%';
                    return `${c.label}: ${c.parsed} (${pct})`;
                }}}
            }
        }
    });
}

// ============================================================================
// POLLING E EXPORTS
// ============================================================================

// startPolling removido  o timer único (iniciarTimer) controla o polling.
// Mantido como stub para compatibilidade com unsubscribeAll.
function startPolling() {
    console.log("️ startPolling: usando iniciarTimer como único controlador de polling");
}

export function unsubscribeAll() { 
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    if (timerInterval)   { clearInterval(timerInterval);   timerInterval   = null; }
}

export function destroyCharts() { 
    const ctxEl = document.getElementById('depth-chart');
    if (ctxEl) {
        const existing = Chart.getChart(ctxEl);
        if (existing) {
            try { existing.destroy(); } catch (e) {}
        }
    }
    if (depthChart)      { try { depthChart.destroy(); } catch (e) {} depthChart = null; }
    if (productiveChart) { try { productiveChart.destroy(); } catch (e) {} productiveChart = null; }
}

