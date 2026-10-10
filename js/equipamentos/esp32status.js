// ============================================================================
// esp32status.js — Painel de Saúde dos Dispositivos (fertirrigacaomonit RTDB)
// Fica em js/equipamentos/esp32status.js
// Exibido como sub-aba dentro de "Gerenciar Equipamentos"
// ============================================================================

import { getESP32Health, LAGOA_CONFIG } from '../fertirrigacao/firebase.js';

const TIMEOUT_OFFLINE_MS = 5 * 60 * 1000;  // 5 min

// ─── HTML do painel ───────────────────────────────────────────────────────────
export function getESP32StatusHTML() {
  return `
  <div class="space-y-6">

    <!-- Cabeçalho -->
    <div class="vazao-panel rounded-xl p-5">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-cyan-400 text-2xl">router</span>
          <div>
            <h3 class="text-lg font-bold" style="color:var(--text-1)">Monitor de Tanques (RTDB)</h3>
            <p class="text-xs" style="color:var(--text-3)">Ferramenta para técnicos — visão de saúde de cada tanque</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div id="esp32-last-refresh" class="text-xs" style="color:var(--text-3)">–</div>
          <button id="esp32-refresh-btn"
            class="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition">
            <span class="material-symbols-outlined text-sm">refresh</span> Atualizar
          </button>
        </div>
      </div>

      <!-- Resumo geral -->
      <div class="grid grid-cols-3 gap-3 mt-4" id="esp32-summary">
        <div class="insight-inner-card rounded-lg p-3 text-center">
          <p class="text-2xl font-bold" style="color:var(--text-1)" id="esp32-count-total">–</p>
          <p class="text-xs text-slate-400 mt-0.5">Dispositivos</p>
        </div>
        <div class="bg-emerald-900/40 rounded-lg p-3 text-center border border-emerald-700/30">
          <p class="text-2xl font-bold text-emerald-400" id="esp32-count-online">–</p>
          <p class="text-xs text-slate-400 mt-0.5">Online</p>
        </div>
        <div class="bg-red-900/40 rounded-lg p-3 text-center border border-red-700/30">
          <p class="text-2xl font-bold text-red-400" id="esp32-count-offline">–</p>
          <p class="text-xs text-slate-400 mt-0.5">Offline / Erro</p>
        </div>
      </div>
    </div>

    <!-- Cards de cada ESP32 -->
    <div id="esp32-devices-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${_getPlaceholderCards()}
    </div>

    <!-- Legenda -->
    <div class="vazao-panel rounded-xl p-4">
      <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Legenda</p>
      <div class="flex flex-wrap gap-4 text-xs" style="color:var(--text-3)">
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span> Online — dados chegando normalmente</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span> Alerta — dados com status de erro (ERRO_SENSOR, NaN)</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span> Offline — sem dados há mais de 5 min</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-slate-500 inline-block"></span> Aguardando — nunca recebeu dados</span>
      </div>
    </div>

  </div>`;
}

function _getPlaceholderCards() {
  return Object.entries(LAGOA_CONFIG).map(([id, cfg]) => `
    <div id="esp32-device-card-${cfg.firebaseId}" class="lagoa-card-base rounded-xl border-2 p-5 transition-all duration-300">
      <div class="flex items-center justify-between mb-3">
        <div>
          <p class="text-xs text-slate-400 uppercase tracking-wide">Lagoa ${id}</p>
          <h4 class="text-base font-bold" style="color:var(--text-1)">${cfg.name}</h4>
          <p class="text-xs text-slate-500 font-mono">ID: ${cfg.firebaseId}</p>
        </div>
        <div id="esp32-status-badge-${cfg.firebaseId}"
          class="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-700" style="color:var(--text-3)">
          <span class="material-symbols-outlined text-sm">hourglass_empty</span> Aguardando
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="insight-inner-card rounded-lg p-2.5">
          <p class="text-slate-500 uppercase tracking-wide mb-0.5">MAC Address</p>
          <p id="esp32-mac-${cfg.firebaseId}" class="font-mono text-slate-300 text-xs break-all">–</p>
        </div>
        <div class="insight-inner-card rounded-lg p-2.5">
          <p class="text-slate-500 uppercase tracking-wide mb-0.5">Última Leitura</p>
          <p id="esp32-lastdata-${cfg.firebaseId}" class="text-slate-300">–</p>
        </div>
        <div class="insight-inner-card rounded-lg p-2.5">
          <p class="text-slate-500 uppercase tracking-wide mb-0.5">Status Sensor</p>
          <p id="esp32-sensor-status-${cfg.firebaseId}" class="font-bold">–</p>
        </div>
        <div class="insight-inner-card rounded-lg p-2.5">
          <p class="text-slate-500 uppercase tracking-wide mb-0.5">Nível Raw (cm)</p>
          <p id="esp32-nivel-${cfg.firebaseId}" class="font-mono" style="color:var(--text-3)">–</p>
        </div>
        <div class="insight-inner-card rounded-lg p-2.5">
          <p class="text-slate-500 uppercase tracking-wide mb-0.5">Tempo offline</p>
          <p id="esp32-age-${cfg.firebaseId}" class="text-slate-300">–</p>
        </div>
        <div class="insight-inner-card rounded-lg p-2.5">
          <p class="text-slate-500 uppercase tracking-wide mb-0.5">Total leituras</p>
          <p id="esp32-total-${cfg.firebaseId}" class="text-slate-300">–</p>
        </div>
      </div>

      <!-- Barra de saúde -->
      <div class="mt-3">
        <p class="text-xs text-slate-500 mb-1">Saúde geral</p>
        <div class="w-full bg-slate-700 rounded-full h-1.5">
          <div id="esp32-health-bar-${cfg.firebaseId}" class="h-1.5 rounded-full transition-all duration-500 bg-slate-500" style="width:0%"></div>
        </div>
      </div>
    </div>`
  ).join('');
}

// ─── Inicializa o painel (chame quando a sub-aba for ativada) ─────────────────
export function initESP32StatusPanel() {
  _renderAll();

  // Escuta updates em tempo real
  window.addEventListener('esp32:healthUpdate', _onHealthUpdate);

  // Botão de refresh
  const btn = document.getElementById('esp32-refresh-btn');
  if (btn) btn.addEventListener('click', _renderAll);

  // Auto-refresh da contagem de tempo offline a cada 30s
  _startAgeRefresh();
}

export function destroyESP32StatusPanel() {
  window.removeEventListener('esp32:healthUpdate', _onHealthUpdate);
  if (_ageInterval) { clearInterval(_ageInterval); _ageInterval = null; }
}

let _ageInterval = null;
function _startAgeRefresh() {
  if (_ageInterval) clearInterval(_ageInterval);
  _ageInterval = setInterval(_renderAll, 30000);
}

function _onHealthUpdate(e) {
  _renderAll(e.detail);
}

// ─── Render principal ─────────────────────────────────────────────────────────
function _renderAll(health) {
  const data = health || getESP32Health();
  const agora = Date.now();

  let total = 0, online = 0, offline = 0;

  Object.entries(LAGOA_CONFIG).forEach(([id, cfg]) => {
    const fid = cfg.firebaseId;
    const h   = data[fid];
    total++;

    if (!h || !h.ultimaVezVisto) {
      _atualizarCard(fid, 'aguardando', h || {});
      offline++;
      return;
    }

    const idadeMs  = agora - new Date(h.ultimaVezVisto).getTime();
    const isOffline = idadeMs > TIMEOUT_OFFLINE_MS;
    const isErro    = _isStatusErro(h.statusSensor);

    if (isOffline) {
      _atualizarCard(fid, 'offline', h, idadeMs);
      offline++;
    } else if (isErro) {
      _atualizarCard(fid, 'alerta', h, idadeMs);
      offline++;  // conta como problema
    } else {
      _atualizarCard(fid, 'online', h, idadeMs);
      online++;
    }
  });

  // Resumo
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('esp32-count-total',   total);
  set('esp32-count-online',  online);
  set('esp32-count-offline', offline);

  const lastEl = document.getElementById('esp32-last-refresh');
  if (lastEl) lastEl.textContent = `Atualizado: ${new Date().toLocaleTimeString('pt-BR')}`;
}

function _atualizarCard(fid, statusGeral, h, idadeMs) {
  const q   = s => document.getElementById(s);
  const set = (id, val, cls) => {
    const el = q(id);
    if (!el) return;
    el.textContent = val;
    if (cls) el.className = cls;
  };

  const card  = q(`esp32-device-card-${fid}`);
  const badge = q(`esp32-status-badge-${fid}`);

  // Cor e texto do badge por status
  const statusMap = {
    online:    { bg: 'bg-emerald-900/60 text-emerald-400 border border-emerald-700/40', icon: 'sensors',       label: 'Online',    border: 'border-emerald-500' },
    alerta:    { bg: 'bg-yellow-900/60 text-yellow-400 border border-yellow-700/40',    icon: 'warning',       label: 'Erro Sensor', border: 'border-yellow-500' },
    offline:   { bg: 'bg-red-900/60 text-red-400 border border-red-700/40',             icon: 'wifi_off',      label: 'Offline',   border: 'border-red-500 animate-pulse' },
    aguardando:{ bg: 'bg-slate-700 text-slate-400',                                     icon: 'hourglass_empty', label: 'Aguardando', border: 'border-slate-700' }
  };

  const s = statusMap[statusGeral] || statusMap.aguardando;
  if (badge) {
    badge.className = `flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${s.bg}`;
    badge.innerHTML = `<span class="material-symbols-outlined text-sm">${s.icon}</span> ${s.label}`;
  }
  if (card) {
    card.className = card.className.replace(/border-\w+-\d+(?:\s+animate-pulse)?/g, '').trim();
    card.classList.add(...s.border.split(' '));
  }

  // Campos
  set(`esp32-mac-${fid}`,           h.mac || '–');
  set(`esp32-lastdata-${fid}`,      h.ultimaDataHora || '–');
  set(`esp32-total-${fid}`,         h.totalLeituras != null ? `${h.totalLeituras} docs` : '–');
  set(`esp32-nivel-${fid}`,         h.nivel != null ? `${h.nivel} cm` : '–');

  // Status do sensor com cor
  const sEl = q(`esp32-sensor-status-${fid}`);
  if (sEl) {
    const ss = h.statusSensor || '–';
    sEl.textContent = ss;
    sEl.className   = _isStatusErro(ss) ? 'font-bold text-red-400' : (ss === '–' ? 'text-slate-500' : 'font-bold text-emerald-400');
  }

  // Tempo desde última leitura
  const ageEl = q(`esp32-age-${fid}`);
  if (ageEl) {
    if (!idadeMs && idadeMs !== 0) {
      ageEl.textContent = '–';
    } else if (idadeMs < 60000) {
      ageEl.textContent = `${Math.round(idadeMs / 1000)}s`;
      ageEl.className = 'text-emerald-400';
    } else if (idadeMs < TIMEOUT_OFFLINE_MS) {
      ageEl.textContent = `${Math.round(idadeMs / 60000)} min`;
      ageEl.className = 'text-yellow-400';
    } else {
      ageEl.textContent = `${Math.round(idadeMs / 60000)} min ⚠️`;
      ageEl.className = 'text-red-400 font-bold';
    }
  }

  // Barra de saúde (100% = online, 0% = offline há >10min)
  const barEl = q(`esp32-health-bar-${fid}`);
  if (barEl) {
    let pct = 0, cor = 'bg-slate-500';
    if (statusGeral === 'online')  { pct = 100; cor = 'bg-emerald-500'; }
    else if (statusGeral === 'alerta') { pct = 60;  cor = 'bg-yellow-500'; }
    else if (statusGeral === 'offline' && idadeMs) {
      const maxMs = 10 * 60 * 1000;
      pct = Math.max(0, Math.round((1 - idadeMs / maxMs) * 100));
      cor = 'bg-red-500';
    }
    barEl.style.width = `${pct}%`;
    barEl.className   = `h-1.5 rounded-full transition-all duration-500 ${cor}`;
  }
}

const STATUS_ERRO_LIST = ['ERRO', 'ERRO_SENSOR', 'SENSOR_FAIL', 'NAN', 'TIMEOUT', 'FALHA'];
function _isStatusErro(s) {
  if (!s) return false;
  const su = String(s).toUpperCase().trim();
  return STATUS_ERRO_LIST.some(e => su.includes(e));
}
