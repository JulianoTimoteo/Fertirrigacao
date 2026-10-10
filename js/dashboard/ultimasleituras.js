// ============================================================================
// dashboard/ultimasleituras.js
// Tabela de últimas leituras do ESP32 (renderização e refresh)
// ============================================================================

/**
 * Renderiza uma linha na tabela de últimas leituras.
 * @param {object} leitura - { timestamp, distancia, status, conexao }
 * @returns {string} HTML da <tr>
 */
export function renderLinhaLeitura({ timestamp, distancia, status, conexao }) {
    const statusClass = status?.toLowerCase().includes('ideal') ? 'text-emerald-600 font-bold'
                      : status?.toLowerCase().includes('raso')  ? 'text-yellow-600 font-bold'
                      : status?.toLowerCase().includes('fundo') ? 'text-red-600 font-bold'
                      : 'text-gray-600';

    return `<tr class="table-row hover:bg-gray-50 transition-colors">
        <td class="px-6 py-3 text-sm text-gray-700">${timestamp ?? '–'}</td>
        <td class="px-6 py-3 text-sm font-mono">${distancia != null ? distancia.toFixed(1) + ' cm' : '–'}</td>
        <td class="px-6 py-3 text-sm ${statusClass}">${status ?? '–'}</td>
        <td class="px-6 py-3 text-sm text-gray-500">${conexao ?? '–'}</td>
    </tr>`;
}

/**
 * Atualiza a tabela de últimas leituras no DOM.
 * @param {Array} leituras
 */
export function atualizarTabelaLeituras(leituras) {
    const tbody = document.getElementById('readings-history');
    if (!tbody) return;
    if (!leituras || leituras.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Sem dados disponíveis</td></tr>';
        return;
    }
    tbody.innerHTML = leituras.map(renderLinhaLeitura).join('');
}
