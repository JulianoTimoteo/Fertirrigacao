// ============================================================================
// insights.js — Inteligência de Irrigação
// Analisa vazão de entrada vs saída, detecta padrões, gera alertas e insights
// ============================================================================

import { LAGOA_CONFIG } from './firebase.js';

// Janela de análise: últimos N pontos com timestamp
const JANELA_TAXA = 10 * 60 * 1000;  // 10 min para calcular taxa L/min
const LIMIAR_ALERTA_TAXA = 1.5;       // razão entrada/saída acima disso = alerta

// Histórico por lagoa: [{ ts, volumeL }]
const _historico = {};

// Acumulados
let _totalEntrada = 0;  // L
let _totalSaida   = 0;  // L

// Últimas taxas calculadas
const _taxas = {};  // { [id]: { lMin, tendencia } }

// ─── HTML do painel de insights ───────────────────────────────────────────────
export function getInsightsHTML() {
  return `
  <div id="insights-panel" class="space-y-4">
    <!-- Resumo de fluxo -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="insight-panel-card rounded-xl p-4">
        <div class="flex items-center gap-2 mb-1">
          <span class="material-symbols-outlined text-cyan-400 text-lg">water_full</span>
          <span class="text-xs uppercase tracking-wide font-semibold" style="color:var(--text-3)">Vazão de Entrada</span>
        </div>
        <p class="text-2xl font-bold text-cyan-400" id="ins-taxa-entrada">– L/min</p>
        <p class="text-xs" style="color:var(--text-3) mt-0.5">Volume total armazenado aumentando</p>
      </div>
      <div class="insight-panel-card rounded-xl p-4">
        <div class="flex items-center gap-2 mb-1">
          <span class="material-symbols-outlined text-amber-400 text-lg">local_shipping</span>
          <span class="text-xs uppercase tracking-wide font-semibold" style="color:var(--text-3)">Vazão de Saída</span>
        </div>
        <p class="text-2xl font-bold text-amber-400" id="ins-taxa-saida">– L/min</p>
        <p class="text-xs" style="color:var(--text-3) mt-0.5">Volume escoando dos tanques</p>
      </div>
      <div class="insight-panel-card rounded-xl p-4" id="ins-balance-card">
        <div class="flex items-center gap-2 mb-1">
          <span class="material-symbols-outlined text-emerald-400 text-lg" id="ins-balance-icon">balance</span>
          <span class="text-xs uppercase tracking-wide font-semibold" style="color:var(--text-3)">Balanço Hídrico</span>
        </div>
        <p class="text-2xl font-bold text-emerald-400" id="ins-balance-valor">–</p>
        <p class="text-xs" style="color:var(--text-3) mt-0.5" id="ins-balance-desc">Calculando...</p>
      </div>
    </div>

    <!-- Alertas e insights -->
    <div class="insight-panel-card rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-yellow-400 text-base">lightbulb</span>
          <h4 class="text-sm font-bold" style="color:var(--text-1)">Análise Inteligente</h4>
        </div>
        <span id="ins-update-time" class="text-xs" style="color:var(--text-3)">–</span>
      </div>
      <div id="ins-alertas-lista" class="divide-y min-h-[80px]">
        <div class="px-4 py-4 text-center text-sm" style="color:var(--text-3)">Aguardando leituras...</div>
      </div>
    </div>

    <!-- Taxa por lagoa -->
    <div class="insight-panel-card rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b">
        <h4 class="text-sm font-bold" style="color:var(--text-1)">Taxa de Variação por Lagoa (L/min)</h4>
        <p class="text-xs" style="color:var(--text-3) mt-0.5">Positivo = enchendo · Negativo = esvaziando · Calculado na janela de 10 min</p>
      </div>
      <div id="ins-taxas-lagoas" class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${Object.entries(LAGOA_CONFIG).map(([id, cfg]) => `
          <div class="insight-inner-card rounded-lg p-3">
            <p class="text-xs font-semibold mb-1" style="color:var(--text-3)">${cfg.name}</p>
            <div class="flex items-center justify-between">
              <span id="ins-taxa-lagoa-${id}" class="text-lg font-bold" style="color:var(--text-3)">–</span>
              <span id="ins-taxa-lagoa-bar-${id}" class="text-xs px-2 py-0.5 rounded-full bg-slate-700" style="color:var(--text-3)">aguardando</span>
            </div>
          </div>`
        ).join('')}
      </div>
    </div>
  </div>`;
}

// ─── Atualiza quando uma lagoa recebe nova leitura ────────────────────────────
export function atualizarInsights(lagoaId, volumeL) {
  if (!_historico[lagoaId]) _historico[lagoaId] = [];
  const agora = Date.now();

  // Adiciona ponto
  _historico[lagoaId].push({ ts: agora, volumeL });

  // Remove pontos fora da janela
  _historico[lagoaId] = _historico[lagoaId].filter(p => agora - p.ts <= JANELA_TAXA);

  // Calcula taxa L/min desta lagoa
  const pts = _historico[lagoaId];
  let taxaLMin = 0;

  if (pts.length >= 2) {
    const primeiro = pts[0], ultimo = pts[pts.length - 1];
    const dtMin = (ultimo.ts - primeiro.ts) / 60000;
    if (dtMin > 0.2) {
      taxaLMin = (ultimo.volumeL - primeiro.volumeL) / dtMin;
    }
  }

  _taxas[lagoaId] = taxaLMin;

  // Acumulados globais
  _calcularAcumulados(lagoaId, volumeL);

  // Renderiza
  _renderInsights();
}

// ─── Acumulados ──────────────────────────────────────────────────────────────
const _prevVolumes = {};

function _calcularAcumulados(id, novoVol) {
  const prev = _prevVolumes[id] ?? novoVol;
  const diff = novoVol - prev;
  if (diff > 0.5)       _totalEntrada += diff;
  else if (diff < -0.5) _totalSaida   += Math.abs(diff);
  _prevVolumes[id] = novoVol;
}

export function getTotalEntrada() { return _totalEntrada; }
export function getTotalSaida()   { return _totalSaida; }
export function resetInsights()   { _totalEntrada = 0; _totalSaida = 0; Object.keys(_prevVolumes).forEach(k => delete _prevVolumes[k]); }

// Renderiza insights a partir do estado atual (inclui dados stale)
// Chamado após page load para mostrar análise mesmo offline
export function renderInsightsFromEstado(estado) {
  if (!estado) return;
  
  const temDados = Object.values(estado).some(e => e && e.percent > 0);
  if (!temDados) return;

  Object.entries(estado).forEach(([id, e]) => {
    if (!e || e.volume === undefined) return;
    if (!_historico[id]) _historico[id] = [];
    if (e.volume > 0 && _historico[id].length === 0) {
      // Seed do histórico com o dado atual
      _historico[id].push({ ts: Date.now() - 60000, volumeL: e.volume });
      _historico[id].push({ ts: Date.now(),          volumeL: e.volume });
    }
    // Taxa zero para dados estáticos (sem variação entre leituras)
    if (_taxas[id] === undefined) _taxas[id] = 0;
  });

  // Gera alertas baseados no estado atual (nível crítico, etc.)
  _gerarAlertasDeEstado(estado);
}

function _gerarAlertasDeEstado(estado) {
  const container = document.getElementById('ins-alertas-lista');
  if (!container) return;

  const alertas = [];
  const lagoas  = Object.entries(estado);

  lagoas.forEach(([id, e]) => {
    if (!e || e.percent === undefined) return;
    const cfg = LAGOA_CONFIG[id];
    const nome = cfg?.name || `Lagoa ${id}`;

    // Alerta de transbordamento
    if (e.percent >= 90) {
      alertas.push({
        tipo: 'alerta', icon: 'emergency_heat',
        titulo: `${nome} está em ${e.percent.toFixed(0)}% de capacidade`,
        msg: e.percent >= 100
          ? `Risco imediato de transbordamento. Intervenção urgente necessária.`
          : `Capacidade crítica atingida (≥90%). Monitore de perto.`
      });
    }

    // ESP offline com dados antigos
    if (e.isStale && e.ultimaLeitura) {
      alertas.push({
        tipo: 'aviso', icon: 'wifi_off',
        titulo: `${nome}: sensor offline`,
        msg: `Última leitura: ${e.ultimaLeitura.data} ${e.ultimaLeitura.hora} (${e.ultimaLeitura.idadeMin ?? '?'}min atrás). Dados exibidos são históricos.`
      });
    }
  });

  // Resumo geral
  const onlineCount = lagoas.filter(([, e]) => e?.online).length;
  const totalVol    = lagoas.reduce((s, [, e]) => s + (e?.volume || 0), 0);
  alertas.push({
    tipo: 'ok', icon: 'check_circle',
    titulo: `${onlineCount} de ${lagoas.length} lagoas com sensor ativo`,
    msg: `Volume total armazenado: ${(totalVol / 1000).toFixed(0)} m³.`
  });

  const cores = {
    alerta: { bg: 'bg-red-500/10 border-red-500/30',       icon: 'text-red-400',    titulo: 'text-red-500' },
    aviso:  { bg: 'bg-yellow-500/10 border-yellow-500/30', icon: 'text-yellow-400', titulo: 'text-yellow-500' },
    info:   { bg: 'bg-blue-500/10 border-blue-500/30',     icon: 'text-blue-400',   titulo: 'text-blue-500' },
    ok:     { bg: 'bg-emerald-500/10 border-emerald-500/30',icon: 'text-emerald-400',titulo: 'text-emerald-600' }
  };

  container.innerHTML = alertas.map(a => {
    const c = cores[a.tipo] || cores.info;
    return `
    <div class="px-4 py-3 border ${c.bg} mx-3 my-2 rounded-lg">
      <div class="flex gap-3 items-start">
        <span class="material-symbols-outlined ${c.icon} text-xl flex-shrink-0 mt-0.5">${a.icon}</span>
        <div>
          <p class="text-sm font-bold ${c.titulo}">${a.titulo}</p>
          <p class="text-xs mt-0.5 leading-relaxed" style="color:var(--text-3)">${a.msg}</p>
        </div>
      </div>
    </div>`;
  }).join('');

  const timeEl = document.getElementById('ins-update-time');
  if (timeEl) timeEl.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;

  // Atualiza taxa por lagoa
  Object.entries(estado).forEach(([id, e]) => {
    const valEl   = document.getElementById(`ins-taxa-lagoa-${id}`);
    const badgeEl = document.getElementById(`ins-taxa-lagoa-bar-${id}`);
    if (!valEl || !badgeEl) return;
    const taxa = _taxas[id] ?? null;
    if (taxa === null || taxa === 0) {
      valEl.textContent = e?.isStale ? '–' : '0.0 L/min';
      valEl.className = 'text-lg font-bold ferti-text-muted';
      badgeEl.textContent = e?.isStale ? 'offline' : 'estável';
      badgeEl.className = e?.isStale ? 'lagoa-badge lagoa-badge--offline' : 'lagoa-badge lagoa-badge--estavel';
    }
  });
}

// ─── Render central ──────────────────────────────────────────────────────────
function _renderInsights() {
  // Taxa total de entrada e saída
  const taxaEntrada = Object.values(_taxas).filter(t => t > 0).reduce((a,b) => a+b, 0);
  const taxaSaida   = Math.abs(Object.values(_taxas).filter(t => t < 0).reduce((a,b) => a+b, 0));

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('ins-taxa-entrada', `${taxaEntrada.toFixed(1)} L/min`);
  set('ins-taxa-saida',   `${taxaSaida.toFixed(1)} L/min`);
  set('ins-update-time',  `Atualizado: ${new Date().toLocaleTimeString('pt-BR')}`);

  // Balanço
  const balanco    = taxaEntrada - taxaSaida;
  const balancoEl  = document.getElementById('ins-balance-valor');
  const balancoDesc= document.getElementById('ins-balance-desc');
  const balancoIcon= document.getElementById('ins-balance-icon');
  const balancoCard= document.getElementById('ins-balance-card');

  if (balancoEl) {
    balancoEl.textContent = `${balanco >= 0 ? '+' : ''}${balanco.toFixed(1)} L/min`;
    if (balanco > 0.5) {
      balancoEl.className = 'text-2xl font-bold text-red-400';
      if (balancoDesc) balancoDesc.textContent = 'Entrada supera a saída';
      if (balancoIcon) balancoIcon.textContent = 'trending_up';
    } else if (balanco < -0.5) {
      balancoEl.className = 'text-2xl font-bold text-green-400';
      if (balancoDesc) balancoDesc.textContent = 'Saída supera a entrada';
      if (balancoIcon) balancoIcon.textContent = 'trending_down';
    } else {
      balancoEl.className = 'text-2xl font-bold text-emerald-400';
      if (balancoDesc) balancoDesc.textContent = 'Sistema em equilíbrio';
      if (balancoIcon) balancoIcon.textContent = 'balance';
    }
  }

  // Taxa por lagoa
  Object.entries(LAGOA_CONFIG).forEach(([id]) => {
    const taxa   = _taxas[id] ?? null;
    const valEl  = document.getElementById(`ins-taxa-lagoa-${id}`);
    const badgeEl= document.getElementById(`ins-taxa-lagoa-bar-${id}`);
    if (!valEl || !badgeEl) return;

    if (taxa === null) {
      valEl.textContent = '–';
      valEl.className = 'text-lg font-bold ferti-text-muted';
      badgeEl.textContent = 'aguardando';
      badgeEl.className = 'lagoa-badge lagoa-badge--neutro';
    } else {
      valEl.textContent = `${taxa >= 0 ? '+' : ''}${taxa.toFixed(1)} L/min`;
      if (taxa > 2) {
        valEl.className  = 'text-lg font-bold text-red-400';
        badgeEl.textContent = 'enchendo';
        badgeEl.className = 'text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400';
      } else if (taxa < -2) {
        valEl.className  = 'text-lg font-bold text-green-400';
        badgeEl.textContent = 'esvaziando';
        badgeEl.className = 'text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400';
      } else {
        valEl.className  = 'text-lg font-bold text-blue-400';
        badgeEl.textContent = 'estável';
        badgeEl.className = 'text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400';
      }
    }
  });

  // Alertas e insights
  _gerarAlertas(taxaEntrada, taxaSaida, balanco);
}

function _gerarAlertas(entrada, saida, balanco) {
  const container = document.getElementById('ins-alertas-lista');
  if (!container) return;

  const alertas = [];

  // 1. Entrada muito maior que saída
  if (entrada > 5 && saida > 0.5) {
    const razao = entrada / saida;
    if (razao > LIMIAR_ALERTA_TAXA) {
      alertas.push({
        tipo: 'aviso',
        icon: 'water_pump',
        titulo: 'Entrada maior que aplicação',
        msg: `A taxa de enchimento (${entrada.toFixed(1)} L/min) está ${razao.toFixed(1)}× superior à saída (${saida.toFixed(1)} L/min). Verifique se há chuva ou irrigação não planejada.`
      });
    }
  }

  // 2. Volume crescendo mas saída zerada
  if (balanco > 3 && saida < 0.5) {
    alertas.push({
      tipo: 'info',
      icon: 'cloud_rain',
      titulo: 'Volume aumentando sem saída registrada',
      msg: `Os tanques estão enchendo (+${balanco.toFixed(1)} L/min) sem saída registrada. Pode ser precipitação pluviométrica ou recarga natural.`
    });
  }

  // 3. Lagoas com alta taxa de esvaziamento
  Object.entries(_taxas).forEach(([id, taxa]) => {
    const cfg = LAGOA_CONFIG[id];
    if (taxa < -10) {
      alertas.push({
        tipo: 'alerta',
        icon: 'warning',
        titulo: `${cfg?.name || 'Lagoa '+id}: esvaziamento rápido`,
        msg: `Taxa de ${Math.abs(taxa).toFixed(1)} L/min. Verifique vazamento ou bomba com pressão excessiva.`
      });
    }
  });

  // 4. Lagoas críticas (>90%)
  Object.entries(_historico).forEach(([id, pts]) => {
    if (!pts.length) return;
    const ultima = pts[pts.length - 1];
    const cfg    = LAGOA_CONFIG[id];
    // Só verifica se há dados de volume
  });

  // 5. Sistema em equilíbrio — insight positivo
  if (Math.abs(balanco) < 1 && entrada > 0.5) {
    alertas.push({
      tipo: 'ok',
      icon: 'check_circle',
      titulo: 'Sistema equilibrado',
      msg: `Entrada (${entrada.toFixed(1)} L/min) e saída (${saida.toFixed(1)} L/min) estão balanceadas. Operação normal.`
    });
  }

  if (!alertas.length) {
    container.innerHTML = `<div class="px-4 py-4 text-center text-sm" style="color:var(--text-3)">Sem alertas no momento. Aguardando mais leituras...</div>`;
    return;
  }

  const cores = {
    alerta: { bg: 'bg-red-500/10 border-red-500/30',    icon: 'text-red-400',    titulo: 'text-red-500' },
    aviso:  { bg: 'bg-yellow-500/10 border-yellow-500/30', icon: 'text-yellow-400', titulo: 'text-yellow-500' },
    info:   { bg: 'bg-blue-500/10 border-blue-500/30',  icon: 'text-blue-400',   titulo: 'text-blue-500' },
    ok:     { bg: 'bg-emerald-500/10 border-emerald-500/30', icon: 'text-emerald-400', titulo: 'text-emerald-600' }
  };

  container.innerHTML = alertas.map(a => {
    const c = cores[a.tipo] || cores.info;
    return `
    <div class="px-4 py-3 border ${c.bg} mx-3 my-2 rounded-lg">
      <div class="flex gap-3 items-start">
        <span class="material-symbols-outlined ${c.icon} text-xl flex-shrink-0 mt-0.5">${a.icon}</span>
        <div>
          <p class="text-sm font-bold ${c.titulo}">${a.titulo}</p>
          <p class="text-xs" style="color:var(--text-3)" class="mt-0.5 leading-relaxed">${a.msg}</p>
        </div>
      </div>
    </div>`;
  }).join('');
}
