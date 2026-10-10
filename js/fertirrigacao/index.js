// ============================================================================
// fertirrigacao_main.js — Orquestrador de Fertirrigação
// ============================================================================

import { setupConfigTanquesTab }                                              from './input.js';
import { initFertiFirebase, subscribeLagoa, unsubscribeAllLagoas, LAGOA_CONFIG, forcarPollLeituras } from './firebase.js';
import { getLagoasCardsHTML, initLagoasOffline, onLeituraESP32, getEstadoLagoas, clearOfflineTimers } from './lagoas.js';
import { renderLagoasChart, destroyLagoasChart, getGraficoHTML }              from './chart.js';
import { getVazaoHTML, getSummaryCardHTML, atualizarAcumulados, setupMetaInput, resetAcumulados, recalcularVolumeFromEstado } from './vazao.js';
import { setupFertirrigacaoSubTabs, stopAutoplay }                            from './subtabs.js';
import { getInsightsHTML, atualizarInsights, resetInsights, renderInsightsFromEstado } from './insights.js';

// ─── HTML principal ──────────────────────────────────────────────────────────
export function getFertirrigacaoTabHTML() {
  return `
  <div class="flex justify-between items-center mb-6">
    <nav id="fertirrigacao-sub-tabs" class="flex gap-2 items-center flex-wrap">
      <button class="fert-sub-tab active" data-tab="niveis-content">Níveis Atuais</button>
      <button class="fert-sub-tab" data-tab="vazao-content">Vazão e Acumulado</button>
      <button class="fert-sub-tab" data-tab="grafico-content">Gráfico Geral</button>
      <button class="fert-sub-tab" data-tab="config-content">Configuração Tanques</button>
      <button class="fert-sub-tab" data-tab="insights-content">
        <span class="material-symbols-outlined text-sm align-middle">lightbulb</span> Análise
      </button>
    </nav>
    <button id="play-pause-btn" class="flex items-center gap-2 px-4 py-2 text-sm bg-red-500 text-white rounded-lg shadow hover:bg-red-600 transition">
      <span class="material-symbols-outlined">play_arrow</span> Autoplay
    </button>
  </div>

  <!-- Aba: Níveis Atuais -->
  <div id="niveis-content" class="fert-sub-content active">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${getLagoasCardsHTML()}
      ${getSummaryCardHTML()}
    </div>
    <div id="ferti-status-bar" class="mt-4 flex items-center gap-2 text-sm" style="color:var(--text-3)">
      <span class="material-symbols-outlined text-sm" style="color:var(--c-primary)">sensors</span>
      <span id="ferti-status-text">Aguardando dados dos sensores...</span>
    </div>
  </div>

  <!-- Aba: Vazão e Acumulado -->
  <div id="vazao-content" class="fert-sub-content">
    ${getVazaoHTML()}
  </div>

  <!-- Aba: Gráfico Geral -->
  <div id="grafico-content" class="fert-sub-content">
    ${getGraficoHTML()}
  </div>

  <!-- Aba: Análise e Insights -->
  <div id="insights-content" class="fert-sub-content">
    ${getInsightsHTML()}
  </div>

  <!-- Aba: Configuração Tanques -->
  <div id="config-content" class="fert-sub-content">
    <div class="vazao-panel rounded-xl p-6 shadow-lg">
      <h3 class="text-lg font-bold mb-4" style="color:var(--text-1)">Configuração das Dimensões dos Tanques</h3>
      <p class="text-sm mb-6" style="color:var(--text-3)">
        Configure as dimensões reais de cada lagoa. Os volumes são calculados pela fórmula do
        Tronco de Pirâmide. O sensor mede a distância do topo até a superfície da água (cm).
      </p>
      <div id="config-form-container"></div>
    </div>
  </div>`;
}

// ─── Inicialização ───────────────────────────────────────────────────────────
export function initFertirrigacao() {
  console.log('🌊 [Fertirrigacao] Iniciando módulo...');

  if (!document.getElementById('fertirrigacao-sub-tabs')) {
    setTimeout(initFertirrigacao, 500);
    return;
  }

  resetAcumulados();
  resetInsights();
  initLagoasOffline();
  setupFertirrigacaoSubTabs();
  setupMetaInput();
  setTimeout(() => setupConfigTanquesTab(), 200);

  // FIX: renderiza o chart imediatamente na inicialização (mesmo com dados zerados)
  // para garantir que o canvas existe quando os dados chegarem.
  // O chart se atualiza a cada leitura via evento ferti:leituraAtualizada.
  setTimeout(() => renderLagoasChart(), 300);

  const fbOk = initFertiFirebase();
  if (fbOk) {
    _setStatus('Aguardando dados dos sensores...', 'waiting');
    Object.keys(LAGOA_CONFIG).forEach(id => {
      subscribeLagoa(parseInt(id), dados => _onDados(parseInt(id), dados));
    });
  } else {
    _setStatus('Erro ao conectar aos sensores.', 'error');
  }

  window.addEventListener('ferti:leituraAtualizada', _onLeituraAtualizada);
  window.addEventListener('ferti:renderCharts', () => renderLagoasChart());
  
  // Quando config de tanques é salva → recalcula volumes com nova geometria
  window.addEventListener('ferti:configTanquesSalva', () => {
    console.log('[Fertirrigacao] Config de tanques atualizada — recalculando volumes...');
    const estado = getEstadoLagoas();
    // Força releitura de cada lagoa com nova config (a config foi salva no localStorage)
    // como os dados já estão em _estado, só precisamos recalcular volumes
    Object.keys(LAGOA_CONFIG).forEach(id => {
      const e = estado[id];
      if (e && e.ultimaLeitura) {
        onLeituraESP32(parseInt(id), e.ultimaLeitura);
      }
    });
  });
  
  window.addEventListener('ferti:recalcularVolumes', () => {
    const estadoAtual = getEstadoLagoas();
    recalcularVolumeFromEstado(estadoAtual);
    renderInsightsFromEstado(estadoAtual);
  });

  // Após 3s: renderiza insights e volumes com qualquer dado já carregado (stale ou fresco)
  setTimeout(() => {
    const estadoAtual = getEstadoLagoas();
    const temDados = Object.values(estadoAtual).some(e => e && e.percent > 0);
    if (temDados) {
      // Recalcula volume total a partir do estado atual (inclui dados históricos)
      recalcularVolumeFromEstado(estadoAtual);
      // Renderiza análise de insights
      renderInsightsFromEstado(estadoAtual);
    }
  }, 3000);

  console.log('✅ [Fertirrigacao] Módulo inicializado.');
}

// ─── Callback de nova leitura ────────────────────────────────────────────────
function _onDados(lagoaId, dados) {
  const isStale = dados.isStale === true;

  // 1. Atualiza card + estado interno da lagoa
  onLeituraESP32(lagoaId, dados);

  // 2. Acumulados e insights: só para dados FRESCOS (isStale=false)
  //    Dados históricos não devem resetar os acumulados da sessão atual
  if (!isStale) {
    const estado = getEstadoLagoas()[lagoaId];
    if (estado) {
      atualizarAcumulados(lagoaId, estado.volume);
      atualizarInsights(lagoaId, estado.volume);
    }
  }

  const cfg = LAGOA_CONFIG[lagoaId];
  if (!isStale) {
    _setStatus(
      `Online — ${cfg.name} ${dados.status === 'OK' ? '✅' : '⚠️'} — Última: ${dados.data} ${dados.hora}`,
      'online'
    );
  } else {
    _setStatus(
      `Firestore OK — Dados históricos de ${dados.data} ${dados.hora} (${dados.idadeMin}min atrás)`,
      'online'
    );
  }
}

// ─── Atualiza chart a cada leitura (sempre, não só quando aba está ativa) ────
function _onLeituraAtualizada() {
  // Sempre atualiza os dados internos do chart.
  // Se a aba não estiver visível, o chart aguarda — mas terá dados ao abrir.
  renderLagoasChart();
}

// ─── Status bar ──────────────────────────────────────────────────────────────
function _setStatus(msg, tipo) {
  const el = document.getElementById('ferti-status-text');
  if (!el) return;
  const cores = { online: 'text-emerald-400', error: 'text-red-400', waiting: 'ferti-text-muted' };
  el.textContent = msg;
  el.className   = cores[tipo] || 'ferti-text-muted';
}

// ─── Parar / destruir ────────────────────────────────────────────────────────
export function stopFertirrigacao() {
  stopAutoplay();
  clearOfflineTimers();
  unsubscribeAllLagoas();
  window.removeEventListener('ferti:leituraAtualizada', _onLeituraAtualizada);
  console.log('[Fertirrigacao] Parado e listeners removidos.');
}

export function destroyFertirrigacaoChart() { destroyLagoasChart(); }
export function startFertirrigacaoSimulation() { initFertirrigacao(); }
export function stopFertirrigacaoSimulation()  { stopFertirrigacao(); }
export function controlFertirrigacaoSimulation(start) {
  start ? initFertirrigacao() : stopFertirrigacao();
}

export default {
  init:    initFertirrigacao,
  start:   startFertirrigacaoSimulation,
  stop:    stopFertirrigacaoSimulation,
  destroy: destroyFertirrigacaoChart,
  control: controlFertirrigacaoSimulation,
  refresh: forcarPollLeituras,
  getHTML: getFertirrigacaoTabHTML
};
