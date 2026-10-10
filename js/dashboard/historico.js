import { 
    getEquipamentos,
    getLeiturasESP 
} from '../api.js';
import { showMessage, formatTimestamp } from '../main.js';
import { recalcularStatusHistorico, STATUS, formatarTimestampFixo } from './regras.js';

let historicoChart = null;
let currentEquipamento = null;

export function setupHistoricoTab() {
    const searchBtn = document.getElementById('search-historico-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', buscarHistorico);
    }
    
    // Preenche o seletor de equipamentos
    populateEquipamentoSelector();
    
    // Define datas padrão (últimos 7 dias)
    const hoje = new Date();
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(hoje.getDate() - 7);
    
    const startInput = document.getElementById('date-start-historico');
    const endInput = document.getElementById('date-end-historico');
    
    if (startInput) {
        startInput.value = seteDiasAtras.toISOString().split('T')[0];
    }
    if (endInput) {
        endInput.value = hoje.toISOString().split('T')[0];
    }
}

async function populateEquipamentoSelector() {
    const select = document.getElementById('equipment-select-historico');
    if (!select) return;
    
    try {
        const equipamentos = await getEquipamentos();
        
        select.innerHTML = '<option value="">-- Selecione um equipamento com sensor --</option>';
        
        let hasOptions = false;
        
        equipamentos.forEach(equip => {
            const mac = equip.macVinculado || equip.mac;
            if (mac && mac.length > 5) {
                hasOptions = true;
                const option = document.createElement('option');
                option.value = equip.codigo;
                option.text = `${equip.codigo || 'Sem código'} - ${equip.descricao || 'Sem descrição'} (${mac})`;
                option.dataset.mac = mac;
                option.dataset.hmesa = equip.hMesa || equip.hmesa || 100;
                option.dataset.min = equip.produtivoMin || equip.min || 10;
                option.dataset.max = equip.produtivoMax || equip.max || 45;
                select.appendChild(option);
            }
        });
        
        if (!hasOptions) {
            select.innerHTML = '<option value="">Nenhum equipamento com sensor vinculado</option>';
        }
        
    } catch (error) {
        console.error("Erro ao carregar equipamentos:", error);
        showMessage('Erro', 'Não foi possível carregar a lista de equipamentos.', 'error');
    }
}

async function buscarHistorico() {
    const select = document.getElementById('equipment-select-historico');
    const startInput = document.getElementById('date-start-historico');
    const endInput = document.getElementById('date-end-historico');
    
    if (!select || !select.value) {
        showMessage('Aviso', 'Selecione um equipamento para buscar o histórico.', 'warning');
        return;
    }
    
    const selectedOption = select.options[select.selectedIndex];
    const mac = selectedOption.dataset.mac;
    const hMesa = parseFloat(selectedOption.dataset.hmesa) || 100;
    const min = parseFloat(selectedOption.dataset.min) || 10;
    const max = parseFloat(selectedOption.dataset.max) || 45;
    
    const dataInicio = new Date(startInput.value + 'T00:00:00');
    const dataFim = new Date(endInput.value + 'T23:59:59');
    
    if (isNaN(dataInicio) || isNaN(dataFim)) {
        showMessage('Erro', 'Datas inválidas.', 'error');
        return;
    }
    
    if (dataFim < dataInicio) {
        showMessage('Erro', 'A data final não pode ser menor que a data inicial.', 'error');
        return;
    }
    
    // Mostra indicador de carregamento
    const btn = document.getElementById('search-historico-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin mr-2">sync</span> Buscando...';
    }
    
    try {
        // Converte datas para timestamps (segundos)
        const inicioTimestamp = Math.floor(dataInicio.getTime() / 1000);
        const fimTimestamp = Math.floor(dataFim.getTime() / 1000);
        
        // Busca as leituras do período usando a API
        const leituras = await getLeiturasESP(mac, inicioTimestamp, fimTimestamp, 500);
        
        if (!leituras || leituras.length === 0) {
            document.getElementById('historico-readings-body').innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Nenhuma leitura encontrada no período.</td></tr>';
            if (historicoChart) {
                historicoChart.data.labels = [];
                historicoChart.data.datasets.forEach(ds => ds.data = []);
                historicoChart.update();
            }
            return;
        }
        
        // Prepara dados do equipamento para recalculo
        const equipamento = {
            mac: mac,
            hMesa: hMesa,
            produtivoMin: min,
            produtivoMax: max,
            isActive: true
        };
        
        // Recalcula status com as regras atuais
        const leiturasRecalculadas = recalcularStatusHistorico(leituras, equipamento);
        
        // Atualiza a tabela
        updateHistoricoTable(leiturasRecalculadas);
        
        // Atualiza o gráfico
        updateHistoricoChart(leiturasRecalculadas, hMesa, min, max);
        
        showMessage('Sucesso', `${leituras.length} leituras carregadas com sucesso.`, 'success');
        
    } catch (error) {
        console.error("Erro ao buscar histórico:", error);
        showMessage('Erro', 'Falha ao buscar dados históricos: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Buscar Histórico';
        }
    }
}

function updateHistoricoTable(leituras) {
    const tbody = document.getElementById('historico-readings-body');
    if (!tbody) return;
    
    if (!leituras || leituras.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Nenhuma leitura encontrada.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    leituras.slice(0, 100).forEach(leitura => {
        const timestamp = new Date(leitura.timestamp * 1000);
        const leituraCm = leitura.media_cm || leitura.leitura_sensor_cm || leitura.leitura || 0;
        const status = leitura.statusRecalculado || leitura.status || 'Desconhecido';
        
        let statusClass = 'text-gray-500';
        let bgStatus = '';
        
        if (status === STATUS.TRABALHANDO_IDEAL) {
            statusClass = 'text-green-700 font-bold';
            bgStatus = 'bg-green-50 border-green-200';
        } else if (status === STATUS.TRABALHANDO_RASO) {
            statusClass = 'text-amber-600 font-medium';
            bgStatus = 'bg-yellow-50 border-yellow-200';
        } else if (status === STATUS.TRABALHANDO_FUNDO) {
            statusClass = 'text-red-600 font-medium';
            bgStatus = 'bg-red-50 border-red-200';
        } else if (status === STATUS.DESLOCAMENTO) {
            statusClass = 'text-purple-600 font-medium';
            bgStatus = 'bg-purple-50 border-purple-200';
        } else if (status === STATUS.PARADO_MESA || status === STATUS.PARADO_SUSPENSO) {
            statusClass = 'text-blue-600 font-medium';
            bgStatus = 'bg-blue-50 border-blue-200';
        } else if (status === STATUS.DESLIGADO) {
            statusClass = 'text-gray-400';
            bgStatus = 'bg-gray-50 border-gray-200';
        }
        
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-gray-50 transition-colors';
        
        let tooltipText = '';
        if (leitura.metricas) {
            tooltipText = `Média: ${leitura.metricas.media}cm, Desvio: ${leitura.metricas.desvio}cm, Variação: ${leitura.metricas.variacao || '0'}`;
        } else if (leitura.motivo) {
            tooltipText = leitura.motivo;
        }
        
        row.innerHTML = `
            <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-500">${formatTimestamp(timestamp)}</td>
            <td class="px-6 py-3 whitespace-nowrap text-sm font-mono font-bold text-gray-700">${leituraCm.toFixed(2)} cm</td>
            <td class="px-6 py-3 whitespace-nowrap text-sm ${statusClass}">
                <span class="px-2 py-1 rounded-md border ${bgStatus}" title="${tooltipText}">${status}</span>
            </td>
            <td class="px-6 py-3 whitespace-nowrap text-sm">
                <span class="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200 text-xs">OK</span>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    if (leituras.length > 100) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="4" class="px-6 py-3 text-center text-sm text-gray-500 italic">Mostrando as 100 leituras mais recentes (de ${leituras.length} total).</td>`;
        tbody.appendChild(row);
    }
}

function updateHistoricoChart(leituras, hMesa, min, max) {
    const ctx = document.getElementById('historico-chart')?.getContext('2d');
    if (!ctx) return;
    
    // Ordena cronologicamente para o gráfico
    const leiturasOrdenadas = [...leituras].sort((a, b) => {
        const ta = a.timestamp || 0;
        const tb = b.timestamp || 0;
        return ta - tb;
    });
    
    const labels = leiturasOrdenadas.map(l => new Date(l.timestamp * 1000));
    const leiturasSensor = leiturasOrdenadas.map(l => l.media_cm || l.leitura_sensor_cm || l.leitura || 0);
    const profundidades = leiturasOrdenadas.map(l => l.profundidadeCalculada || (hMesa - (l.media_cm || l.leitura_sensor_cm || l.leitura || 0)));
    
    const pointColors = leiturasOrdenadas.map(l => {
        const status = l.statusRecalculado;
        if (status === STATUS.TRABALHANDO_IDEAL) return '#22c55e';
        if (status === STATUS.TRABALHANDO_RASO) return '#f59e0b';
        if (status === STATUS.TRABALHANDO_FUNDO) return '#ef4444';
        if (status === STATUS.DESLOCAMENTO) return '#a855f7';
        if (status === STATUS.PARADO_MESA || status === STATUS.PARADO_SUSPENSO) return '#3b82f6';
        return '#6b7280';
    });
    
    // Determina os limites do gráfico
    const todosValores = [...leiturasSensor, ...profundidades, hMesa, 0, -min, -max];
    const yMax = Math.max(...todosValores) + 10;
    const yMin = Math.min(-max - 10, ...profundidades) - 5;
    
    const chartData = {
        labels: labels,
        datasets: [
            {
                label: 'Leitura do Sensor',
                data: leiturasSensor,
                borderColor: 'rgba(59, 130, 246, 0.8)',
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0.2,
                pointRadius: 3,
                pointBackgroundColor: pointColors,
                pointBorderColor: 'white',
                pointBorderWidth: 1,
                fill: false,
                yAxisID: 'y'
            },
            {
                label: 'h_Mesa',
                data: leiturasOrdenadas.map(() => hMesa),
                borderColor: 'rgba(249, 115, 22, 0.8)',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                yAxisID: 'y'
            },
            {
                label: 'Solo',
                data: leiturasOrdenadas.map(() => 0),
                borderColor: 'rgba(220, 38, 38, 0.7)',
                borderWidth: 1,
                pointRadius: 0,
                fill: false,
                yAxisID: 'y'
            },
            {
                label: 'Prof. Mínima',
                data: leiturasOrdenadas.map(() => -min),
                borderColor: 'rgba(34, 197, 94, 0.6)',
                borderWidth: 1,
                borderDash: [3, 3],
                pointRadius: 0,
                fill: false,
                yAxisID: 'y'
            },
            {
                label: 'Prof. Máxima',
                data: leiturasOrdenadas.map(() => -max),
                borderColor: 'rgba(239, 68, 68, 0.6)',
                borderWidth: 1,
                borderDash: [3, 3],
                pointRadius: 0,
                fill: false,
                yAxisID: 'y'
            }
        ]
    };
    
    if (historicoChart) {
        historicoChart.data = chartData;
        historicoChart.options.scales.y.min = yMin;
        historicoChart.options.scales.y.max = yMax;
        historicoChart.update();
    } else {
        historicoChart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Histórico de Leituras',
                        color: 'white',
                        font: { size: 16, weight: 'bold' },
                        padding: { bottom: 20 }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: 'rgb(203, 213, 225)',
                            font: { size: 11 },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: 'white',
                        bodyColor: 'rgb(203, 213, 225)',
                        borderColor: 'rgb(75, 85, 99)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            title: (context) => {
                                const date = context[0].label;
                                return date instanceof Date ? date.toLocaleString('pt-BR') : 'Data inválida';
                            },
                            label: (context) => {
                                const datasetLabel = context.dataset.label || '';
                                const value = context.parsed.y;
                                
                                if (datasetLabel.includes('Leitura')) {
                                    if (value > hMesa) {
                                        return `🚜 Deslocamento: ${value.toFixed(2)}cm`;
                                    } else if (value > 0) {
                                        const insercao = hMesa - value;
                                        return `⛏️ Inserção: ${insercao.toFixed(2)}cm | Sensor: ${value.toFixed(2)}cm`;
                                    }
                                }
                                return `${datasetLabel}: ${Math.abs(value).toFixed(2)}cm`;
                            },
                            afterBody: (context) => {
                                const index = context[0].dataIndex;
                                const leitura = leiturasOrdenadas[index];
                                if (leitura?.metricas) {
                                    return [
                                        `📊 Status: ${leitura.statusRecalculado}`,
                                        `📏 Média: ${leitura.metricas.media}cm`,
                                        `📉 Desvio: ${leitura.metricas.desvio}cm`
                                    ];
                                } else if (leitura?.motivo) {
                                    return [`ℹ️ ${leitura.motivo}`];
                                }
                                return [];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'dd/MM/yyyy HH:mm',
                            displayFormats: {
                                day: 'dd/MM'
                            }
                        },
                        grid: { color: 'rgba(75, 85, 99, 0.2)' },
                        ticks: { color: 'rgb(156, 163, 175)' },
                        title: {
                            display: true,
                            text: 'Data/Hora',
                            color: 'rgb(156, 163, 175)'
                        }
                    },
                    y: {
                        min: yMin,
                        max: yMax,
                        grid: { color: 'rgba(75, 85, 99, 0.2)' },
                        ticks: {
                            color: 'rgb(156, 163, 175)',
                            callback: (value) => {
                                if (value === hMesa) return `${hMesa}cm (MESA)`;
                                if (value === 0) return '0cm (SOLO)';
                                if (value === -min) return `-${min}cm`;
                                if (value === -max) return `-${max}cm`;
                                return value.toFixed(0) + 'cm';
                            }
                        },
                        title: {
                            display: true,
                            text: 'Valores (cm)',
                            color: 'rgb(156, 163, 175)'
                        }
                    }
                }
            }
        });
    }
}

export function destroyHistoricoChart() {
    if (historicoChart) {
        historicoChart.destroy();
        historicoChart = null;
    }
}