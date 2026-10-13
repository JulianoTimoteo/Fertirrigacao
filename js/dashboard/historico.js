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

    // Listener para importação direta de arquivo CSV do SD Card
    const importInput = document.getElementById('import-sd-file');
    if (importInput) {
        importInput.addEventListener('change', handleSDImport);
    }
}

async function populateEquipamentoSelector() {
    const select = document.getElementById('equipment-select-historico');
    if (!select) return;
    
    try {
        select.innerHTML = '<option value="">-- Selecione o Tanque ou Equipamento --</option>';
        
        // 1. Grupo de Tanques de Fertirrigação / Módulos ESP32
        const tanquesFerti = [
            { codigo: 'T4', nome: 'Tanque T4 - CASTANHA (ESP32 LoRa Mesh)', mac: '84:1F:E8:38:F9:1C' },
            { codigo: 'T1', nome: 'Tanque T1 - Carregamento Usina A', mac: 'ESP32_T1' },
            { codigo: 'T2', nome: 'Tanque T2 - Carregamento Usina B', mac: 'ESP32_T2' },
            { codigo: 'T3', nome: 'Tanque T3 - EUCALIPTO CHEIRO', mac: 'ESP32_T3' },
            { codigo: 'T5', nome: 'Tanque T5 - SANTA THERESINHA', mac: 'ESP32_T5' }
        ];

        const optGroupTanques = document.createElement('optgroup');
        optGroupTanques.label = '🌊 Tanques de Vinhaça / Fertirrigação (IoT)';
        tanquesFerti.forEach(t => {
            const option = document.createElement('option');
            option.value = t.codigo;
            option.text = `${t.codigo} - ${t.nome}`;
            option.dataset.mac = t.codigo;
            option.dataset.hmesa = 100;
            option.dataset.min = 10;
            option.dataset.max = 70;
            if (t.codigo === 'T4') option.selected = true; // Pré-seleciona T4
            optGroupTanques.appendChild(option);
        });
        select.appendChild(optGroupTanques);

        // 2. Grupo de Frota Agrícola (Tratores / Sulcadores)
        const equipamentos = await getEquipamentos();
        const optGroupFrota = document.createElement('optgroup');
        optGroupFrota.label = '🚜 Frota Agrícola (Tratos / Preparo)';
        
        equipamentos.forEach(equip => {
            const mac = equip.macVinculado || equip.mac;
            if (mac && mac.length > 5) {
                const option = document.createElement('option');
                option.value = equip.codigo;
                option.text = `${equip.codigo || 'Sem código'} - ${equip.descricao || 'Sem descrição'} (${mac})`;
                option.dataset.mac = mac;
                option.dataset.hmesa = equip.hMesa || equip.hmesa || 100;
                option.dataset.min = equip.produtivoMin || equip.min || 10;
                option.dataset.max = equip.produtivoMax || equip.max || 45;
                optGroupFrota.appendChild(option);
            }
        });

        if (optGroupFrota.children.length > 0) {
            select.appendChild(optGroupFrota);
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

async function handleSDImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            const lines = text.split('\n');
            const leituras = [];

            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('data_hora') || line.length < 10) continue;

                // Formato padrão SD: data_hora,no_origem,nivel_cm,media_cm,total,status
                // Exemplo: 12/10/2026 14:18:57,T4,68.17,68.17,1,LORA_MESH_OFFLINE
                const parts = line.split(',');
                if (parts.length >= 3) {
                    const dataHoraStr = parts[0].trim();
                    const noOrigem = parts[1].trim();
                    const nivel = parseFloat(parts[2]) || 0;
                    const media = parts[3] ? (parseFloat(parts[3]) || nivel) : nivel;
                    const statusStr = parts[5] ? parts[5].trim() : 'SD_OFFLINE';

                    let ts = Date.now();
                    const dtParts = dataHoraStr.split(' ');
                    if (dtParts.length === 2) {
                        const [d, m, y] = dtParts[0].split('/');
                        const [hh, mm, ss] = dtParts[1].split(':');
                        if (d && m && y) {
                            ts = new Date(+y, +m - 1, +d, +hh || 0, +mm || 0, +ss || 0).getTime();
                        }
                    }

                    leituras.push({
                        timestamp: ts,
                        media_cm: media.toFixed(2),
                        leitura_sensor_cm: nivel.toFixed(2),
                        status: 'Trabalhando Ideal',
                        statusRecalculado: 'Trabalhando Ideal',
                        desvio_cm: Math.abs(nivel - media).toFixed(2),
                        pacote_id: `SD_${ts}`,
                        tanque: noOrigem,
                        mac: `SD Card (${statusStr})`,
                        data: dtParts[0] || '',
                        hora: dtParts[1] || ''
                    });
                }
            }

            if (leituras.length === 0) {
                showMessage('Aviso', 'Nenhuma leitura válida encontrada no arquivo CSV.', 'warning');
                return;
            }

            leituras.sort((a, b) => b.timestamp - a.timestamp);

            const equipamento = {
                mac: 'SD_CARD',
                hMesa: 100,
                produtivoMin: 10,
                produtivoMax: 70,
                isActive: true
            };

            const leiturasRecalculadas = recalcularStatusHistorico(leituras, equipamento);
            updateHistoricoTable(leiturasRecalculadas);
            updateHistoricoChart(leiturasRecalculadas, 100, 10, 70);

            showMessage('Sucesso', `${leituras.length} leituras importadas do Cartão SD com sucesso!`, 'success');
        } catch (err) {
            console.error('Erro ao importar CSV:', err);
            showMessage('Erro', 'Falha ao processar arquivo do SD Card: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}