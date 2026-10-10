// ============================================================================
// lagoas.js — v9.1 CORRIGIDO
//
// REGRA CRÍTICA DE ONLINE/OFFLINE:
//   O Firebase onSnapshot dispara com dados históricos ao abrir a página.
//   A flag isStale=true vem do firebase.js quando a leitura tem >15min.
//   Quando isStale=true: exibe os dados no card mas mantém badge OFFLINE.
//   Quando isStale=false: dados recentes, badge ONLINE.
//
// FILTRO ANTI-SPIKE: ignora variações físicamente impossíveis (>20cm/leitura)
// TENDÊNCIA 5min: enchendo/esvaziando/estável com memória de estado
// TIMEOUT OFFLINE: 5min sem dado novo → badge offline
// ============================================================================

import { calcularVolumeTronco } from './regras.js';
import { LAGOA_CONFIG }         from './firebase.js';

const _estado    = {};
const _historico = {};
const _timers    = {};

const CONFIG_KEY          = 'agro_tanks_config';
const ALARME_PERCENT      = 90;
const JANELA_MS           = 5  * 60 * 1000;
const TIMEOUT_OFFLINE_MS  = 5  * 60 * 1000;
const LIMIAR_TENDENCIA_CM = 5;
const MAX_DELTA_SENSOR_CM = 20;

const DEFAULT_CONFIG = {
  T1: { L_top: 40.0, W_top: 20.0, L_bottom: 35.0, W_bottom: 15.0, H_max: 3.0 },
  T2: { L_top: 40.0, W_top: 20.0, L_bottom: 35.0, W_bottom: 15.0, H_max: 3.0 },
  T3: { L_top: 38.0, W_top: 18.0, L_bottom: 32.0, W_bottom: 13.0, H_max: 2.8 },
  T4: { L_top: 42.0, W_top: 22.0, L_bottom: 36.0, W_bottom: 16.0, H_max: 3.2 },
  T5: { L_top: 45.0, W_top: 25.0, L_bottom: 38.0, W_bottom: 18.0, H_max: 3.5 }
};

function getTanqueConfig(tanqueId) {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return saved[tanqueId] || DEFAULT_CONFIG[tanqueId] || DEFAULT_CONFIG.T1;
  } catch { return DEFAULT_CONFIG[tanqueId] || DEFAULT_CONFIG.T1; }
}

// ─── Timer de offline (só usado para ESPs que foram online e pararam) ─────────
function _resetarTimerOffline(id) {
  if (_timers[id]) clearTimeout(_timers[id]);
  _timers[id] = setTimeout(() => {
    if (_estado[id]) _estado[id].online = false;
    _marcarOffline(id);
  }, TIMEOUT_OFFLINE_MS);
}

function _marcarOffline(id) {
  const q = s => document.getElementById(s);
  q(`lagoa-online-badge-${id}`)?.classList.add('hidden');
  q(`lagoa-sensor-badge-${id}`)?.classList.add('hidden');
  q(`lagoa-offline-badge-${id}`)?.classList.remove('hidden');
  const card = q(`lagoa-card-${id}`);
  card?.classList.remove('border-transparent','border-blue-500','border-green-500','border-slate-600');
  card?.classList.add('border-red-500');
  const glow = q(`lagoa-alert-glow-${id}`);
  if (glow) { glow.style.backgroundColor = 'rgba(239,68,68,0.35)'; glow.classList.remove('opacity-0'); }
  const badge = q(`lagoa-tendencia-badge-${id}`);
  if (badge) {
    badge.className = 'lagoa-badge lagoa-badge--offline';
    badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;">wifi_off</span><span>Offline</span>`;
  }
  const el = q(`lagoa-ultima-leitura-${id}`);
  if (el) el.textContent = '⚠️ Sem sinal há mais de 5 min';
}

// ─── Tendência na janela de 5min ──────────────────────────────────────────────
function _calcularTendencia(id, alturaCmAtual) {
  if (!_historico[id]) _historico[id] = [];
  const agora = Date.now();
  _historico[id].push({ ts: agora, alturaCm: alturaCmAtual });
  _historico[id] = _historico[id].filter(p => agora - p.ts <= JANELA_MS);
  const pts = _historico[id];
  if (pts.length < 2) return 'aguardando';
  const primeiro = pts[0], ultimo = pts[pts.length - 1];
  if ((ultimo.ts - primeiro.ts) / 1000 < 30) return 'aguardando';
  const delta = ultimo.alturaCm - primeiro.alturaCm;
  if (delta >  LIMIAR_TENDENCIA_CM) return 'enchendo';
  if (delta < -LIMIAR_TENDENCIA_CM) return 'esvaziando';
  return 'estavel';
}

// ─── HTML dos cards ───────────────────────────────────────────────────────────
export function getLagoasCardsHTML() {
  return Object.entries(LAGOA_CONFIG).map(([id, cfg]) => `
    <div id="lagoa-card-${id}" class="zoom-hover-card lagoa-card-base rounded-2xl shadow-lg p-5 relative overflow-hidden border-2 border-transparent flex flex-col justify-between">
      <div id="lagoa-alert-glow-${id}" class="absolute inset-0 rounded-2xl blur-2xl opacity-0 transition-opacity duration-500 animate-pulse pointer-events-none"></div>

      <!-- Cabeçalho do Card -->
      <div class="flex justify-between items-start z-10 relative pb-2.5 border-b border-[var(--border-1)] mb-3">
        <div>
          <p class="lagoa-label-small">Lagoa ${id}</p>
          <h3 class="lagoa-title">${cfg.name}</h3>
        </div>
        <div class="flex flex-col items-end gap-1">
          <div id="lagoa-alert-icon-${id}" class="hidden lagoa-badge lagoa-badge--alerta">
            <span class="material-symbols-outlined text-sm">warning</span> Alerta
          </div>
          <div id="lagoa-sensor-badge-${id}" class="lagoa-badge lagoa-badge--sem-sensor">
            <span class="material-symbols-outlined text-sm align-middle">sensors_off</span> Sem Sensor
          </div>
          <div id="lagoa-online-badge-${id}" class="hidden lagoa-badge lagoa-badge--online">
            <span class="material-symbols-outlined text-sm align-middle">sensors</span> Online
          </div>
          <div id="lagoa-offline-badge-${id}" class="hidden lagoa-badge lagoa-badge--offline">
            <span class="material-symbols-outlined text-sm align-middle">wifi_off</span> Offline
          </div>
        </div>
      </div>

      <!-- Corpo do Card: Barra Alta quase da altura do card + Dados Centralizados -->
      <div class="flex items-center justify-between gap-5 z-10 relative flex-1 py-1">
        
        <!-- Barra do tanque de alta estatura -->
        <div class="flex flex-col items-center flex-shrink-0" style="width:68px;">
          <div class="lagoa-gauge-container shadow-inner" style="height:210px; width:68px;">
            <div id="lagoa-gauge-${id}" class="lagoa-gauge-fill" style="height:0%;"></div>
            <div class="lagoa-gauge-sensor-line"></div>
            <div class="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <span id="lagoa-percent-${id}" class="lagoa-percent-label">–</span>
            </div>
          </div>
          <div class="flex items-center justify-center mt-1 text-yellow-400" title="Sensor ultrassônico de nível">
            <span class="material-symbols-outlined" style="font-size:16px;">sensors</span>
          </div>
        </div>

        <!-- Conteúdo Textual Totalmente Centralizado -->
        <div class="flex-1 flex flex-col items-center justify-center text-center space-y-3.5">
          <!-- Vazio / Água -->
          <div class="w-full text-center">
            <p class="lagoa-label-small mb-0.5">Vazio / Água</p>
            <p class="lagoa-value-row text-base tracking-wide">
              <span id="lagoa-nivel-sensor-${id}" class="text-yellow-400 font-bold text-lg">–</span><span class="text-xs text-yellow-500 font-semibold mr-1">cm</span> /
              <span id="lagoa-altura-${id}" class="font-bold text-lg ml-1">–</span><span class="text-xs text-gray-400 font-semibold">m</span>
            </p>
          </div>

          <!-- Volume -->
          <div class="w-full text-center py-2 px-1 border-y border-[var(--border-1)] bg-[var(--bg-3)]/40 rounded-xl">
            <p class="lagoa-label-small mb-0.5">Volume</p>
            <p class="lagoa-value-row text-xl font-extrabold text-emerald-500 tracking-tight leading-none mb-1">
              <span id="lagoa-volume-litros-${id}">–</span> <span class="text-xs font-bold text-emerald-600">L</span>
            </p>
            <p class="lagoa-sub-text font-semibold text-xs">
              <span id="lagoa-volume-m3-${id}">–</span>
            </p>
          </div>

          <!-- Tendência e Última Leitura -->
          <div class="w-full flex flex-col items-center justify-center space-y-1.5">
            <div id="lagoa-tendencia-${id}" class="flex items-center justify-center gap-1.5">
              <span id="lagoa-tendencia-badge-${id}" class="lagoa-badge lagoa-badge--neutro shadow-sm">
                <span class="material-symbols-outlined" style="font-size:14px;">horizontal_rule</span>
                <span>Aguardando...</span>
              </span>
              <span id="lagoa-tendencia-delta-${id}" class="lagoa-sub-text font-bold"></span>
            </div>
            <div id="lagoa-ultima-leitura-${id}" class="lagoa-sub-text text-[11px] leading-tight text-center"></div>
          </div>
        </div>

      </div>
    </div>`
  ).join('');
}

// ─── Estado offline inicial ───────────────────────────────────────────────────
export function initLagoasOffline() {
  Object.keys(LAGOA_CONFIG).forEach(id => {
    _estado[id]    = { altura: 0, alturaCm: 0, nivelCm: 0, volume: 0, percent: 0, online: false, spikes: 0 };
    _historico[id] = [];
    if (_timers[id]) clearTimeout(_timers[id]);
    _mostrarSemSensor(id);
  });
}

// ─── Callback principal — nova leitura (fresca ou histórica) ──────────────────
export function onLeituraESP32(lagoaId, dados) {
  const cfg = LAGOA_CONFIG[lagoaId];
  if (!cfg) return;

  // Filtra heartbeats do orquestrador
  if (dados.mac === 'ORQUESTRADOR' || dados.status === 'SISTEMA_CHECK') return;

  // Filtra status de erro de sensor
  const STATUS_ERRO = ['ERRO','ERRO_SENSOR','SENSOR_FAIL','NAN','TIMEOUT','FALHA'];
  if (STATUS_ERRO.some(e => String(dados.status || '').toUpperCase().includes(e))) return;

  // ── isStale: dado existe no Firebase mas ESP não está enviando agora ─────────
  // Quando true: exibe valores históricos, badge OFFLINE — NÃO conta como online
  const isStale = dados.isStale === true;

  const tanque   = getTanqueConfig(cfg.tanqueId);
  const H_max    = tanque.H_max;
  const H_max_cm = H_max * 100;

  const nivelCm  = parseFloat(dados.nivel) || 0;
  const alturaCm = Math.max(0, Math.min(H_max_cm, H_max_cm - nivelCm));

  // ── FILTRO ANTI-SPIKE (só para dados recentes — não aplica a históricos) ─────
  const prev = _estado[lagoaId];
  if (!isStale && prev && prev.online && prev.alturaCm !== undefined) {
    const deltaCm = Math.abs(alturaCm - prev.alturaCm);
    if (deltaCm > MAX_DELTA_SENSOR_CM) {
      if (_estado[lagoaId]) _estado[lagoaId].spikes = (prev.spikes || 0) + 1;
      return; // descarta spike, não atualiza
    }
  }

  const alturaM  = alturaCm / 100;
  const percent  = Math.max(0, Math.min(100, (alturaM / H_max) * 100));
  const volumeL  = calcularVolumeTronco(alturaM, tanque);
  const volumeM3 = volumeL / 1000;

  // Tendência: só calcula para dados frescos; dados históricos usam 'offline'
  const tendencia = isStale ? 'offline' : _calcularTendencia(lagoaId, alturaCm);
  const anterior  = prev?.alturaCm ?? alturaCm;
  const deltaCm   = alturaCm - anterior;

  // Só inicia timer de offline para dados FRESCOS (ESP estava ativo agora)
  if (!isStale) {
    _resetarTimerOffline(lagoaId);
  }

  // Estado interno: sempre armazena volume real (fisicamente nos tanques)
  // O flag isStale=true impede que este volume seja somado aos acumulados de FLUXO
  // mas permite que o Volume Total Armazenado mostre o que está nos tanques
  _estado[lagoaId] = {
    altura: alturaM, alturaCm, alturaAnterior: anterior,
    volume: volumeL,           // volume real — sempre armazenado
    percent, nivelCm, tendencia,
    online: !isStale,
    ultimaLeitura: dados, tanqueConfig: tanque,
    spikes: prev?.spikes || 0, isStale
  };

  // Label da última leitura com aviso de dado antigo
  const labelHora = isStale
    ? `${dados.data} ${dados.hora} — ⚠️ ${dados.idadeMin ?? '?'}min atrás`
    : `${dados.data} ${dados.hora} — ${dados.status}`;

  _atualizarCardUI(lagoaId, {
    alturaM, percent, volumeL, volumeM3, nivelCm,
    tendencia, deltaCm, labelHora,
    hora: dados.hora, data: dados.data, status: dados.status,
    online: !isStale, isStale
  });

  // Evento para vazao.js e chart.js — só para dados frescos
  if (!isStale) {
    window.dispatchEvent(new CustomEvent('ferti:leituraAtualizada', {
      detail: { lagoaId, estado: _estado }
    }));
  }
}

// ─── Atualização da UI ────────────────────────────────────────────────────────
function _atualizarCardUI(id, { alturaM, percent, volumeL, volumeM3, nivelCm, tendencia, deltaCm, labelHora, hora, data, status, online, isStale }) {
  const q   = s => document.getElementById(s);
  const set = (sel, val) => { const el = q(sel); if (el) el.textContent = val; };

  // ── Badges de status ──────────────────────────────────────────────────────
  q(`lagoa-sensor-badge-${id}`)?.classList.add('hidden');

  if (online && !isStale) {
    // ESP ativo agora
    q(`lagoa-online-badge-${id}`)?.classList.remove('hidden');
    q(`lagoa-offline-badge-${id}`)?.classList.add('hidden');
  } else {
    // isStale = dados históricos, ESP offline
    q(`lagoa-online-badge-${id}`)?.classList.add('hidden');
    q(`lagoa-offline-badge-${id}`)?.classList.remove('hidden');
  }

  // ── Valores numéricos ────────────────────────────────────────────────────
  set(`lagoa-percent-${id}`,       `${percent.toFixed(0)}%`);
  set(`lagoa-nivel-sensor-${id}`,  nivelCm.toFixed(0));
  set(`lagoa-altura-${id}`,        alturaM.toFixed(2));
  set(`lagoa-volume-litros-${id}`, volumeL.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
  set(`lagoa-volume-m3-${id}`,     `(${volumeM3.toFixed(2)} m³)`);
  set(`lagoa-ultima-leitura-${id}`, labelHora);

  // ── Gauge ──────────────────────────────────────────────────────────────
  const gEl = q(`lagoa-gauge-${id}`);
  if (gEl) {
    gEl.style.height = `${percent}%`;
    // Gauge cinza para dados históricos
    if (isStale) {
      gEl.className = 'lagoa-gauge-fill gauge-stale';
    } else {
      gEl.className = `lagoa-gauge-fill ${_corGaugeClass(percent)}`;
    }
  }

  // ── Borda e glow do card ────────────────────────────────────────────────
  const card  = q(`lagoa-card-${id}`);
  const glow  = q(`lagoa-alert-glow-${id}`);
  const badge = q(`lagoa-tendencia-badge-${id}`);
  const deltaEl = q(`lagoa-tendencia-delta-${id}`);

  card?.classList.remove('border-transparent','border-red-500','border-blue-500','border-green-500','border-slate-600','border-yellow-600');

  const sinalDelta = deltaCm > 0 ? '+' : '';
  if (deltaEl) deltaEl.textContent = (!isStale && deltaCm !== 0) ? `${sinalDelta}${deltaCm.toFixed(1)}cm` : '';

  if (isStale || tendencia === 'offline') {
    // Dado histórico: borda amarela discreta, badge offline
    badge.className = 'lagoa-badge lagoa-badge--offline';
    badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;">history</span><span>Dado antigo</span>`;
    card?.classList.add('border-yellow-600');
    if (glow) glow.classList.add('opacity-0');
  } else {
    // Tendência com memória do estado anterior
    const tendDisplay = (tendencia === 'aguardando' && _estado[id]?.tendencia && !['aguardando','offline'].includes(_estado[id].tendencia))
      ? _estado[id].tendencia
      : tendencia;

    if (tendDisplay === 'enchendo') {
      badge.className = 'lagoa-badge lagoa-badge--enchendo';
      badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;">arrow_upward</span><span>Enchendo</span>`;
      card?.classList.add('border-red-500');
      if (glow) { glow.style.backgroundColor = 'rgba(239,68,68,0.25)'; glow.classList.remove('opacity-0'); }
    } else if (tendDisplay === 'esvaziando') {
      badge.className = 'lagoa-badge lagoa-badge--esvaziando';
      badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;">arrow_downward</span><span>Esvaziando</span>`;
      card?.classList.add('border-green-500');
      if (glow) { glow.style.backgroundColor = 'rgba(34,197,94,0.2)'; glow.classList.remove('opacity-0'); }
    } else if (tendDisplay === 'estavel') {
      badge.className = 'lagoa-badge lagoa-badge--estavel';
      badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;">horizontal_rule</span><span>Estável</span>`;
      card?.classList.add('border-blue-500');
      if (glow) glow.classList.add('opacity-0');
    } else {
      badge.className = 'lagoa-badge lagoa-badge--neutro';
      badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;">schedule</span><span>Coletando...</span>`;
      card?.classList.add('border-slate-600');
      if (glow) glow.classList.add('opacity-0');
    }
  }

  // ── Alarme de transbordamento (mesmo em dados históricos) ───────────────
  const alertIcon = q(`lagoa-alert-icon-${id}`);
  if (percent >= ALARME_PERCENT) {
    alertIcon?.classList.remove('hidden');
    if (!isStale) { // só glow pulsante para dados reais
      card?.classList.remove('border-transparent','border-blue-500','border-green-500','border-slate-600','border-yellow-600');
      card?.classList.add('border-red-500');
      if (glow) { glow.style.backgroundColor = 'rgba(239,68,68,0.45)'; glow.classList.remove('opacity-0'); }
    }
  } else {
    alertIcon?.classList.add('hidden');
  }
}

function _mostrarSemSensor(id) {
  const q   = s => document.getElementById(s);
  const set = (sel, val) => { const el = q(sel); if (el) el.textContent = val; };
  q(`lagoa-sensor-badge-${id}`)?.classList.remove('hidden');
  q(`lagoa-online-badge-${id}`)?.classList.add('hidden');
  q(`lagoa-offline-badge-${id}`)?.classList.add('hidden');
  set(`lagoa-percent-${id}`,        '–');
  set(`lagoa-nivel-sensor-${id}`,   '–');
  set(`lagoa-altura-${id}`,         '–');
  set(`lagoa-volume-litros-${id}`,  '–');
  set(`lagoa-volume-m3-${id}`,      '(sem dados)');
  set(`lagoa-ultima-leitura-${id}`, 'Sem dados dos sensores');
}

function _corGaugeClass(pct) {
  if (pct >= ALARME_PERCENT) return 'gauge-red';
  if (pct >= 75)             return 'gauge-orange';
  if (pct >= 50)             return 'gauge-yellow';
  return 'gauge-cyan';
}

export function clearOfflineTimers() {
  Object.values(_timers).forEach(t => clearTimeout(t));
  Object.keys(_timers).forEach(k => delete _timers[k]);
}

export function getEstadoLagoas()  { return { ..._estado }; }
export function getLagoaEstado(id) { return _estado[id] || null; }
