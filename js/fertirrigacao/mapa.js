// ============================================================================
// mapa.js — Linha de Fluxo de Águas & Adutoras de Fertirrigação (Leaflet)
// Topologia Usina Pitangueiras:
// Usina (Carregamento A/B) -> Eucalipto Cheiroso -> Castanha -> Santa Theresinha (12.28 km)
// ============================================================================

import { LAGOA_CONFIG } from './firebase.js';
import { getEstadoLagoas, getTanqueConfig } from './lagoas.js';
import { calcularVolumeTronco } from './regras.js';

let _map = null;
let _layers = {
  satellite: null,
  labels: null,
  dark: null
};
let _pipeLines = {};
let _markers = {};
let _distanceMarkers = [];
let _activeFlowTrechos = new Set();
let _modoCamada = 'satellite';

// Estado individual e independente de fluxo por trecho
const _estadoTrechos = {
  't2-t1': { sentido: 'direto', vazao: 120 },
  't1-eucalipto': { sentido: 'direto', vazao: 120 },
  'eucalipto-castanha': { sentido: 'direto', vazao: 120 },
  'castanha-theresinha': { sentido: 'direto', vazao: 120 }
};

export const PONTOS_ADUTORA = {
  t2: {
    chave: 't2',
    nome: 'CARREGAMENTO USINA B',
    subtitulo: 'Tanque 2 (T2)',
    lat: -21.044852715210126,
    lng: -48.260317960320975,
    ordem: 0,
    lagoas: [2],
    cor: '#0ea5e9',
    badge: 'T2'
  },
  t1: {
    chave: 't1',
    nome: 'CARREGAMENTO USINA A',
    subtitulo: 'Tanque 1 (T1)',
    lat: -21.04508601802594,
    lng: -48.260840316946286,
    ordem: 1,
    lagoas: [1],
    cor: '#06b6d4',
    badge: 'T1'
  },
  eucalipto: {
    chave: 'eucalipto',
    nome: 'EUCALIPTO CHEIROSO',
    subtitulo: 'Lagoa 3 (T3)',
    lat: -21.048171179817402,
    lng: -48.27849805552853,
    ordem: 2,
    lagoas: [3],
    cor: '#f59e0b',
    badge: 'T3'
  },
  castanha: {
    chave: 'castanha',
    nome: 'CASTANHA',
    subtitulo: 'Lagoa 4 (T4)',
    lat: -21.080929846011003,
    lng: -48.30075955155999,
    ordem: 3,
    lagoas: [4],
    cor: '#8b5cf6',
    badge: 'T4'
  },
  theresinha: {
    chave: 'theresinha',
    nome: 'SANTA THERESINHA',
    subtitulo: 'Lagoa 5 (T5)',
    lat: -21.104326364035728,
    lng: -48.35321793859342,
    ordem: 4,
    lagoas: [5],
    cor: '#ec4899',
    badge: 'T5'
  }
};

export const TRECHOS_ADUTORA = [
  {
    id: 't2-t1',
    origem: 't2',
    destino: 't1',
    nome: 'Carregamento B ⇄ Carregamento A',
    distanciaKm: 0.06,
    diametroMm: 300,
    tubulacao: 'PEAD PN10 De 315mm (Interligação)',
    pontos: [
      [-21.044852715210126, -48.260317960320975],
      [-21.04508601802594, -48.260840316946286]
    ]
  },
  {
    id: 't1-eucalipto',
    origem: 't1',
    destino: 'eucalipto',
    nome: 'Carregamento Usina ➔ Eucalipto Cheiroso',
    distanciaKm: 1.90,
    diametroMm: 300,
    tubulacao: 'PEAD PN10 De 315mm',
    pontos: [
      [-21.04508601802594, -48.260840316946286],
      [-21.048171179817402, -48.27849805552853]
    ]
  },
  {
    id: 'eucalipto-castanha',
    origem: 'eucalipto',
    destino: 'castanha',
    nome: 'Eucalipto Cheiroso ➔ Castanha',
    distanciaKm: 4.26,
    diametroMm: 300,
    tubulacao: 'PEAD PN10 De 315mm',
    pontos: [
      [-21.048171179817402, -48.27849805552853],
      [-21.080929846011003, -48.30075955155999]
    ]
  },
  {
    id: 'castanha-theresinha',
    origem: 'castanha',
    destino: 'theresinha',
    nome: 'Castanha ➔ Santa Theresinha',
    distanciaKm: 6.10,
    diametroMm: 250,
    tubulacao: 'PEAD PN10 De 280mm',
    pontos: [
      [-21.080929846011003, -48.30075955155999],
      [-21.104326364035728, -48.35321793859342]
    ]
  }
];

// ─── Controle Individual de Fluxo por Trecho ─────────────────────────────────
export function _gerarHTMLStatusTrecho(trechoId) {
  const est = _estadoTrechos[trechoId] || { sentido: 'direto', vazao: 120 };
  const isReverso = est.sentido === 'reverso';
  const badgeDot = isReverso ? 'bg-amber-400' : 'bg-cyan-400';
  const textCor = isReverso ? 'text-amber-400' : 'text-cyan-400';
  const seta = isReverso ? '⬅' : '➔';
  const label = isReverso ? 'Fluxo Reverso' : 'Fluxo Direto';

  return `<span class="inline-flex items-center gap-1.5 font-bold font-mono text-xs ${textCor}">
    <span class="w-2 h-2 rounded-full ${badgeDot} animate-pulse"></span>
    ${label} (${seta})
  </span>`;
}

export function _aplicarSentidoTrecho(trechoId, sentido) {
  if (!_estadoTrechos[trechoId]) {
    _estadoTrechos[trechoId] = { sentido: 'direto', vazao: 120 };
  }
  _estadoTrechos[trechoId].sentido = sentido;

  const p = _pipeLines[trechoId];
  const isReverso = sentido === 'reverso';
  const animClass = isReverso ? 'adutora-anim-flow-reverse' : 'adutora-anim-flow';
  const corLinha = isReverso ? '#f59e0b' : '#06b6d4';
  const badgeDot = isReverso ? 'bg-amber-400' : 'bg-cyan-400';
  const seta = isReverso ? '⬅' : '➔';
  const label = isReverso ? 'Fluxo Reverso' : 'Fluxo Direto';

  // 1. Atualiza visual no mapa Leaflet para ESTE trecho exclusivamente
  if (p && p.flowLine) {
    if (p.flowLine._path) {
      p.flowLine._path.classList.remove('adutora-anim-flow', 'adutora-anim-flow-reverse');
      p.flowLine._path.classList.add(animClass);
    }
    p.flowLine.setStyle({ color: corLinha, weight: 4.5 });
  }

  // 2. Atualiza badge no card do trecho abaixo do mapa
  const badgeEl = document.getElementById(`pipe-flow-${trechoId}`);
  if (badgeEl) {
    badgeEl.innerHTML = `<span class="w-2 h-2 rounded-full ${badgeDot} animate-pulse"></span> <strong class="${isReverso ? 'text-amber-400' : 'text-cyan-400'}">${label} (${seta})</strong>`;
  }

  // 3. Atualiza destaque visual de borda no card do trecho
  const cardEl = document.getElementById(`card-trecho-${trechoId}`);
  if (cardEl) {
    if (isReverso) {
      cardEl.classList.add('border-amber-500/60');
    } else {
      cardEl.classList.remove('border-amber-500/60');
    }
  }

  // 4. Se o popup deste trecho estiver aberto, atualiza o status dinamicamente
  const popupStatusEl = document.getElementById(`popup-status-${trechoId}`);
  if (popupStatusEl) {
    popupStatusEl.innerHTML = _gerarHTMLStatusTrecho(trechoId);
  }
}

export function _inverterFluxoTrecho(trechoId) {
  const est = _estadoTrechos[trechoId] || { sentido: 'direto', vazao: 120 };
  const novoSentido = (est.sentido === 'reverso') ? 'direto' : 'reverso';
  _aplicarSentidoTrecho(trechoId, novoSentido);
}

export function _obterDadosLagoa(chave) {
  const ponto = PONTOS_ADUTORA[chave];
  if (!ponto) return null;

  const lagoaId = ponto.lagoas[0];
  const tanqueId = ponto.badge; // T1, T2, T3, T4, T5
  const config = getTanqueConfig(tanqueId);
  const estado = getEstadoLagoas()[lagoaId] || {};

  const capMaxM3 = config ? (calcularVolumeTronco(config.H_max, config) / 1000) : 1000;

  let percentAtual = 50;
  if (typeof estado.percent === 'number' && !isNaN(estado.percent)) {
    percentAtual = Math.max(0, Math.min(100, estado.percent));
  }

  let volumeAtualM3 = (percentAtual / 100) * capMaxM3;
  if (typeof estado.volume === 'number' && !isNaN(estado.volume) && estado.volume > 0) {
    volumeAtualM3 = estado.volume / 1000;
    percentAtual = Math.max(0, Math.min(100, (volumeAtualM3 / capMaxM3) * 100));
  }

  return {
    chave,
    nome: ponto.nome,
    subtitulo: ponto.subtitulo,
    badge: ponto.badge,
    cor: ponto.cor,
    capMaxM3,
    volumeAtualM3,
    percentAtual,
    online: estado.online ?? false
  };
}

// ─── HTML da Aba Mapa ────────────────────────────────────────────────────────
export function getMapaHTML() {
  return `
  <div class="space-y-6">

    <!-- Cabeçalho do Mapa -->
    <div class="vazao-panel rounded-xl p-5 shadow-lg border flex flex-col md:flex-row md:items-center justify-between gap-4" style="background:var(--bg-2);border-color:var(--border-1)">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="material-symbols-outlined text-cyan-400 text-2xl">route</span>
          <h3 class="text-xl font-extrabold" style="color:var(--text-1)">Rede de Adutoras & Fluxo de Vinhaça</h3>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            12.32 km de extensão
          </span>
        </div>
        <p class="text-xs" style="color:var(--text-3)">
          Traçado georreferenciado interligando Carregamento Usina (T1 e T2), Eucalipto Cheiroso (T3), Castanha (T4) e Santa Theresinha (T5) com telemetria dedicada dos sensores
        </p>
      </div>

      <!-- Filtros Rápidos de Visão -->
      <div class="flex flex-wrap items-center gap-2">
        <button id="btn-map-fit-all" class="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1.5 shadow cursor-pointer">
          <span class="material-symbols-outlined text-xs">zoom_out_map</span> Ver Linha Completa
        </button>
        <button id="btn-map-focus-usina" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer" style="background:var(--bg-3);color:var(--text-1);border:1px solid var(--border-1)" title="Focar nos tanques gêmeos Carregamento A e B">
          Carregamento A/B
        </button>
        <button id="btn-map-focus-castanha" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-900/30 hover:bg-purple-800/50 text-purple-300 border border-purple-500/40 transition cursor-pointer">
          Castanha (Online)
        </button>
        <button id="btn-map-toggle-layer" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer" style="background:var(--bg-3);color:var(--text-1);border:1px solid var(--border-1)">
          <span class="material-symbols-outlined text-xs text-cyan-400">layers</span> <span id="lbl-layer-mode">Satélite</span>
        </button>
      </div>
    </div>

    <!-- Container do Mapa Leaflet -->
    <div class="adutoras-map-container">
      <div id="adutoras-leaflet-map"></div>

      <!-- Overlay Flutuante com Métricas do Enlace (Glassmorphism de Alta Legibilidade) -->
      <div class="map-floating-overlay">
        <div class="map-overlay-header">
          <div class="map-overlay-title-group">
            <span class="material-symbols-outlined text-emerald-400 text-base">sensors</span>
            <span class="map-overlay-title">Rede de Campo</span>
          </div>
          <span id="map-telemetry-nodes" class="map-overlay-badge">5 Nós de Telemetria</span>
        </div>
        <div class="space-y-1.5">
          <div class="map-overlay-row">
            <span class="map-overlay-label">Extensão Total:</span>
            <span class="map-overlay-value text-slate-100">12.32 km</span>
          </div>
          <div class="map-overlay-row">
            <span class="map-overlay-label">Armazenado na Linha:</span>
            <span id="map-total-stored" class="map-overlay-value text-cyan-400">-- m³</span>
          </div>
          <div class="map-overlay-row">
            <span class="map-overlay-label">Status Operacional:</span>
            <span id="map-flow-status" class="map-overlay-value text-emerald-400 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Em Operação
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Painel de Controle e Simulador de Adutoras (Minimizado por Padrão para Prioridade Total ao Mapa) -->
    <div class="vazao-panel rounded-xl shadow-lg border border-slate-700 bg-slate-900/95 overflow-hidden transition-all duration-300">
      
      <!-- Barra de Controle Clicável (Sempre visível) -->
      <button id="btn-toggle-simulador" type="button" class="w-full p-3.5 px-5 flex items-center justify-between hover:bg-slate-800/80 transition cursor-pointer text-left select-none outline-none">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-cyan-400 text-xl">tune</span>
          <div>
            <h4 class="text-xs font-bold text-white flex items-center gap-2">
              <span>Simulador de Fluxos & Monitoramento de Trechos</span>
              <span id="badge-simulador-resumo" class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                4 Trechos · 12.32 km
              </span>
            </h4>
            <p class="text-[11px] text-slate-400">Clique para abrir ou recolher o simulador de vazão, estimativas de trânsito e detalhes das tubulações</p>
          </div>
        </div>
        <div class="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
          <span id="lbl-toggle-simulador">Abrir Simulador</span>
          <span id="icon-toggle-simulador" class="material-symbols-outlined text-lg transition-transform duration-300">expand_more</span>
        </div>
      </button>

      <!-- Conteúdo Retrátil (Minimizado por Padrão) -->
      <div id="conteudo-simulador" class="hidden border-t border-slate-800 p-5 space-y-6">
        
        <!-- 🌟 NOVO SIMULADOR PREDITIVO DE NÍVEL DE LAGOA & TEMPO DE TRANSFERÊNCIA -->
        <div class="p-5 rounded-2xl border border-slate-700/80 bg-slate-900/60 shadow-xl space-y-5">
          
          <!-- Cabeçalho do Simulador -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div class="flex items-center gap-3">
              <div class="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <span class="material-symbols-outlined text-2xl">calculate</span>
              </div>
              <div>
                <h4 class="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>Simulador Preditivo de Nível de Lagoa (%)</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Cálculo Operacional
                  </span>
                </h4>
                <p class="text-xs text-slate-400">
                  Calcule com precisão em quanto tempo a lagoa atingirá a porcentagem desejada (%) na vazão selecionada
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5 font-mono">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Telemetria em Tempo Real
              </span>
            </div>
          </div>

          <!-- Grade de Controles de Entrada -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
            
            <!-- 1. Lagoa de Origem (Saída) -->
            <div class="lg:col-span-3">
              <label class="block text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
                <span>Lagoa de Origem (Saída)</span>
                <span id="sim-origem-nivel-badge" class="text-[11px] font-mono text-cyan-400 font-bold">--%</span>
              </label>
              <select id="sim-origem" class="w-full p-2.5 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white font-medium focus:border-cyan-400 outline-none transition">
                <option value="t1">Carregamento Usina A (T1)</option>
                <option value="t2">Carregamento Usina B (T2)</option>
                <option value="eucalipto">Eucalipto Cheiroso (T3)</option>
                <option value="castanha" selected>Castanha (T4)</option>
                <option value="theresinha">Santa Theresinha (T5)</option>
              </select>
            </div>

            <!-- Botão Inverter Reservatórios (Origem ⇄ Destino) -->
            <div class="lg:col-span-1 flex items-center justify-center">
              <button id="btn-inverter-reservatorios" type="button" title="Inverter Reservatórios (Origem ⇄ Destino)" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 hover:text-cyan-300 flex items-center justify-center gap-1 transition shadow cursor-pointer text-xs font-bold">
                <span class="material-symbols-outlined text-lg">swap_horiz</span>
              </button>
            </div>

            <!-- 2. Lagoa de Destino (Chegada) -->
            <div class="lg:col-span-3">
              <label class="block text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
                <span>Lagoa de Destino (Chegada)</span>
                <span id="sim-destino-nivel-badge" class="text-[11px] font-mono text-emerald-400 font-bold">--%</span>
              </label>
              <select id="sim-destino" class="w-full p-2.5 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white font-medium focus:border-cyan-400 outline-none transition">
                <option value="t1">Carregamento Usina A (T1)</option>
                <option value="t2">Carregamento Usina B (T2)</option>
                <option value="eucalipto">Eucalipto Cheiroso (T3)</option>
                <option value="castanha">Castanha (T4)</option>
                <option value="theresinha" selected>Santa Theresinha (T5)</option>
              </select>
            </div>

            <!-- 3. Vazão da Bomba (m³/h) -->
            <div class="lg:col-span-2">
              <label class="block text-xs font-bold text-slate-300 mb-1">Vazão Bomba (m³/h)</label>
              <div class="relative">
                <input type="number" id="sim-vazao" value="120" min="10" max="600" step="10" class="w-full p-2.5 pr-8 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white font-mono font-bold focus:border-cyan-400 outline-none">
                <span class="absolute right-2.5 top-2.5 text-[10px] text-slate-400 font-bold">m³/h</span>
              </div>
            </div>

            <!-- 4. Meta de Nível Desejada no Destino (%) -->
            <div class="lg:col-span-3">
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-bold text-slate-300">Meta no Destino (%)</label>
                <span id="lbl-meta-percent-val" class="text-xs font-mono font-black text-amber-400">80%</span>
              </div>
              <div class="flex items-center gap-2">
                <input type="range" id="sim-meta-percent" min="5" max="100" value="80" step="5" class="w-full accent-amber-400 cursor-pointer">
                <input type="number" id="sim-meta-percent-num" value="80" min="5" max="100" step="1" class="w-14 p-2 text-xs text-center rounded-lg bg-slate-800 border border-slate-700 text-amber-400 font-mono font-bold focus:border-amber-400 outline-none">
              </div>
            </div>

          </div>

          <!-- Atalhos Rápidos de Meta e Vazão -->
          <div class="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-slate-400 text-[11px] font-semibold">Atalhos de Meta:</span>
              <button type="button" class="btn-preset-meta px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-mono cursor-pointer transition" data-meta="50">50%</button>
              <button type="button" class="btn-preset-meta px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-mono cursor-pointer transition" data-meta="70">70%</button>
              <button type="button" class="btn-preset-meta px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-400 font-bold text-[11px] font-mono cursor-pointer transition" data-meta="80">80%</button>
              <button type="button" class="btn-preset-meta px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-mono cursor-pointer transition" data-meta="90">90%</button>
              <button type="button" class="btn-preset-meta px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-red-500/30 text-red-400 text-[11px] font-mono cursor-pointer transition" data-meta="95">95% (Crítico)</button>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-slate-400 text-[11px] font-semibold">Vazão Rápida:</span>
              <button type="button" class="btn-preset-vazao px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-mono cursor-pointer transition" data-vazao="80">80</button>
              <button type="button" class="btn-preset-vazao px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-cyan-500/40 text-cyan-300 font-bold text-[11px] font-mono cursor-pointer transition" data-vazao="120">120</button>
              <button type="button" class="btn-preset-vazao px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-mono cursor-pointer transition" data-vazao="150">150</button>
              <button type="button" class="btn-preset-vazao px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-mono cursor-pointer transition" data-vazao="200">200</button>
            </div>
          </div>

          <!-- Painel de Resultados Preditivos da Simulação -->
          <div id="sim-painel-resultado" class="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-4">
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pb-3 border-b border-slate-800">
              <!-- Indicador 1: Tempo Estimado -->
              <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
                <div class="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                  <span class="material-symbols-outlined text-2xl">timer</span>
                </div>
                <div>
                  <span class="text-[11px] text-slate-400 block font-semibold uppercase">Tempo p/ Atingir a Meta</span>
                  <strong class="text-xl font-mono text-amber-400 font-extrabold" id="sim-tempo-resultado">~--</strong>
                  <span class="text-[10px] text-slate-500 block" id="sim-taxa-transferencia">a 120 m³/h</span>
                </div>
              </div>

              <!-- Indicador 2: Volume Necessário -->
              <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
                <div class="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <span class="material-symbols-outlined text-2xl">water_drop</span>
                </div>
                <div>
                  <span class="text-[11px] text-slate-400 block font-semibold uppercase">Volume a Transferir</span>
                  <strong class="text-xl font-mono text-cyan-400 font-extrabold" id="sim-volume-transferir">-- m³</strong>
                  <span class="text-[10px] text-slate-500 block" id="sim-litros-transferir">-- Litros</span>
                </div>
              </div>

              <!-- Indicador 3: Diagnóstico de Segurança -->
              <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3" id="sim-diagnostico-box">
                <div class="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400" id="sim-diagnostico-icon-box">
                  <span class="material-symbols-outlined text-2xl" id="sim-diagnostico-icon">verified</span>
                </div>
                <div>
                  <span class="text-[11px] text-slate-400 block font-semibold uppercase">Diagnóstico Operacional</span>
                  <strong class="text-xs font-bold text-emerald-400 block" id="sim-diagnostico-titulo">Operação Viável</strong>
                  <span class="text-[10px] text-slate-400 block" id="sim-diagnostico-desc">Dentro dos limites operacionais</span>
                </div>
              </div>
            </div>

            <!-- Projeção Gráfica Comparativa das Lagoas (Origem vs Destino) -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              
              <!-- Lagoa de Origem (Esvaziamento) -->
              <div class="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-slate-200 flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span id="sim-origem-card-nome">Origem: Castanha (T4)</span>
                  </span>
                  <span class="font-mono text-slate-300 font-bold" id="sim-origem-proj-valores">--% ➔ --%</span>
                </div>
                
                <!-- Barra de Nível da Origem -->
                <div class="w-full bg-slate-950 rounded-full h-3.5 p-0.5 border border-slate-700/60 overflow-hidden relative">
                  <div id="sim-origem-bar-proj" class="h-full rounded-full bg-cyan-500/30 transition-all duration-300 absolute left-0" style="width: 0%;"></div>
                  <div id="sim-origem-bar-atual" class="h-full rounded-full bg-cyan-500 transition-all duration-300 relative" style="width: 0%;"></div>
                </div>

                <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Atual: <strong class="text-slate-200" id="sim-origem-vol-atual">-- m³</strong></span>
                  <span>Previsto: <strong class="text-cyan-300" id="sim-origem-vol-previsto">-- m³</strong></span>
                  <span>Cap: <strong class="text-slate-400" id="sim-origem-vol-cap">-- m³</strong></span>
                </div>
              </div>

              <!-- Lagoa de Destino (Enchimento até a Meta) -->
              <div class="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-slate-200 flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span id="sim-destino-card-nome">Destino: Santa Theresinha (T5)</span>
                  </span>
                  <span class="font-mono text-amber-400 font-bold" id="sim-destino-proj-valores">--% ➔ --%</span>
                </div>

                <!-- Barra de Nível do Destino com Marcador da Meta -->
                <div class="w-full bg-slate-950 rounded-full h-3.5 p-0.5 border border-slate-700/60 overflow-hidden relative">
                  <div id="sim-destino-bar-meta" class="h-full rounded-full bg-amber-400/40 transition-all duration-300 absolute left-0" style="width: 0%;"></div>
                  <div id="sim-destino-bar-atual" class="h-full rounded-full bg-emerald-500 transition-all duration-300 relative" style="width: 0%;"></div>
                </div>

                <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Atual: <strong class="text-slate-200" id="sim-destino-vol-atual">-- m³</strong></span>
                  <span>Meta: <strong class="text-amber-400" id="sim-destino-vol-meta">-- m³</strong></span>
                  <span>Cap: <strong class="text-slate-400" id="sim-destino-vol-cap">-- m³</strong></span>
                </div>
              </div>

            </div>

          </div>

        </div>

        <!-- Painel de Trechos da Adutora (4 trechos) -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h5 class="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-sm text-cyan-400">segment</span> Trechos Georreferenciados da Rede
            </h5>
            <span class="text-[11px] text-slate-400">Inverta o fluxo de qualquer trecho de forma individual clicando no botão Inverter</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            ${TRECHOS_ADUTORA.map((t, idx) => `
              <div class="vazao-panel rounded-xl p-4 shadow border border-slate-700 relative overflow-hidden transition hover:border-cyan-500/50" id="card-trecho-${t.id}">
                <div class="flex items-center justify-between mb-2 pb-1 border-b border-slate-700">
                  <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Trecho ${idx + 1}</span>
                  <span class="map-distance-chip">
                    <span class="material-symbols-outlined text-[12px]">straighten</span> ${t.distanciaKm} km
                  </span>
                </div>
                <h4 class="text-sm font-bold text-slate-100 mb-1">${t.nome}</h4>
                <p class="text-xs text-slate-400 mb-2">${t.tubulacao}</p>
                <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                  <div class="flex flex-col">
                    <span class="text-[10px] text-slate-400 uppercase">Fluxo no Trecho:</span>
                    <span id="pipe-flow-${t.id}">
                      ${_gerarHTMLStatusTrecho(t.id)}
                    </span>
                  </div>
                  <button type="button" class="btn-inverter-trecho-card px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow" data-id="${t.id}" title="Inverter apenas o fluxo deste trecho">
                    <span class="material-symbols-outlined text-sm">swap_horiz</span> Inverter
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    </div>

  </div>`;
}

// ─── Destruição Limpa do Mapa ────────────────────────────────────────────────
export function destroyMapaAdutoras() {
  if (_map) {
    try {
      _map.remove();
    } catch (e) {
      console.warn('Erro ao destruir mapa:', e);
    }
    _map = null;
    _pipeLines = {};
    _markers = {};
    _distanceMarkers = [];
  }
}

// ─── Inicialização do Mapa Leaflet ──────────────────────────────────────────
export function initMapaAdutoras() {
  const container = document.getElementById('adutoras-leaflet-map');
  if (!container) return;

  // Se o mapa já existe mas foi desanexado do DOM (ex: troca de abas no app),
  // destrói a instância órfã anterior para que novos cliques e eventos funcionem 100%
  if (_map) {
    const mapContainer = _map.getContainer();
    if (!mapContainer || !mapContainer.isConnected || mapContainer !== container) {
      destroyMapaAdutoras();
    } else {
      _map.invalidateSize();
      atualizarDadosMapa();
      return;
    }
  }

  // Previne colisão do Leaflet caso o contêiner DOM tenha sido recriado
  if (container._leaflet_id) {
    delete container._leaflet_id;
  }

  // Centro da rede (próximo à Lagoa Castanha)
  const centroLat = -21.070;
  const centroLng = -48.300;

  _map = L.map('adutoras-leaflet-map', {
    center: [centroLat, centroLng],
    zoom: 12,
    zoomControl: true
  });

  // Camadas de Satélite (Esri World Imagery)
  _layers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 18
  }).addTo(_map);

  _layers.labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    opacity: 0.85
  }).addTo(_map);

  // Camada CARTO Dark Oficial com API Key autorizada do Juliano
  const CARTO_KEY = 'cb1_4jhd_1_e7101fd1f03c32c103ac51dc';
  _layers.dark = L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 18,
    subdomains: 'abcd'
  });

  // Traça as linhas de tubulação da adutora com Hitbox de alta precisão
  _desenharAdutoras();

  // Cria os marcadores dos nós (lagoas)
  _criarMarcadoresLagoas();

  // Conecta botões de controle e o Simulador de Fluxo
  _conectarBotoesControle();
  _conectarSimuladorFluxo();

  // Ajusta visão para englobar toda a linha (12.28 km)
  _ajustarVisaoCompleta();

  // Atualiza com dados ao vivo
  atualizarDadosMapa();
}

function _gerarTooltipTrechoHTML(trecho) {
  const diametroMm = trecho.diametroMm || 300;
  const raioM = (diametroMm / 1000) / 2;
  const volTubulacaoM3 = Math.round(Math.PI * Math.pow(raioM, 2) * (trecho.distanciaKm * 1000));
  const tempoTransitoMin = Math.round((volTubulacaoM3 / 120) * 60);

  return `
    <div class="adutora-hover-card p-3" style="min-width: 260px;">
      <div class="flex items-center justify-between pb-1.5 mb-2 border-b border-cyan-500/30">
        <div class="flex items-center gap-1.5">
          <span class="material-symbols-outlined text-cyan-400 text-base">route</span>
          <strong class="text-white text-xs font-bold">${trecho.nome}</strong>
        </div>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
          ${trecho.distanciaKm} km
        </span>
      </div>

      <div class="grid grid-cols-2 gap-1.5 text-xs mb-2">
        <div class="bg-slate-950/80 p-2 rounded border border-slate-700/60">
          <span class="text-[9px] text-slate-400 block uppercase font-semibold">Tubulação</span>
          <strong class="text-slate-100 text-xs font-mono">${trecho.tubulacao || 'PEAD PN10'}</strong>
        </div>
        <div class="bg-slate-950/80 p-2 rounded border border-slate-700/60">
          <span class="text-[9px] text-slate-400 block uppercase font-semibold">Vol. no Tubo</span>
          <strong class="text-purple-300 text-xs font-mono">${volTubulacaoM3.toLocaleString('pt-BR')} m³</strong>
        </div>
        <div class="bg-slate-950/80 p-2 rounded border border-slate-700/60">
          <span class="text-[9px] text-slate-400 block uppercase font-semibold">Pressão Média</span>
          <strong class="text-emerald-400 text-xs font-mono">~4.8 bar</strong>
        </div>
        <div class="bg-slate-950/80 p-2 rounded border border-slate-700/60">
          <span class="text-[9px] text-slate-400 block uppercase font-semibold" title="Tempo a 120 m³/h">Tempo Trânsito</span>
          <strong class="text-amber-300 text-xs font-mono">~${tempoTransitoMin} min</strong>
        </div>
      </div>

      <div class="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px] text-cyan-400">
        <span class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span> Telemetria Ativa
        </span>
        <span class="text-slate-400">Clique para simular</span>
      </div>
    </div>
  `;
}

function _desenharAdutoras() {
  TRECHOS_ADUTORA.forEach(trecho => {
    // 1. Linha de base (glow exterior) - Apenas visual
    const baseLine = L.polyline(trecho.pontos, {
      color: '#083344',
      weight: 8,
      opacity: 0.7,
      lineCap: 'round',
      interactive: false
    }).addTo(_map);

    const est = _estadoTrechos[trecho.id] || { sentido: 'direto' };
    const isReverso = est.sentido === 'reverso';
    const animClass = isReverso ? 'adutora-anim-flow-reverse' : 'adutora-anim-flow';
    const corLinha = isReverso ? '#f59e0b' : '#06b6d4';

    // 2. Linha interna condutora de fluido (animada) - Apenas visual
    const flowLine = L.polyline(trecho.pontos, {
      color: corLinha,
      weight: isReverso ? 4.5 : 3.5,
      opacity: 0.95,
      className: animClass,
      interactive: false
    }).addTo(_map);

    // 3. HITBOX TRANSPARENTE ULTRA-PRECISA (30px de largura)
    // Responde ao simples PASSAR DO MOUSE (Hover Instantâneo) e ao clique
    const hitLine = L.polyline(trecho.pontos, {
      color: '#06b6d4',
      weight: 30,
      opacity: 0.0001,
      interactive: true,
      className: 'cursor-pointer'
    }).addTo(_map);

    // TOOLTIP INSTANTÂNEO NO HOVER (SEM PRECISAR CLICAR!)
    // O card de dados segue o cursor suavemente pela tubulação
    hitLine.bindTooltip(_gerarTooltipTrechoHTML(trecho), {
      sticky: true,
      opacity: 1,
      direction: 'top',
      offset: [0, -12],
      className: 'adutora-leaflet-tooltip'
    });

    // Hover effect: ilumina o trecho ao passar o mouse
    hitLine.on('mouseover', () => {
      flowLine.setStyle({ weight: 5.5, color: '#38bdf8' });
      baseLine.setStyle({ weight: 12, opacity: 0.9 });
      const cardEl = document.getElementById(`card-trecho-${trecho.id}`);
      if (cardEl) cardEl.classList.add('ring-2', 'ring-cyan-400');
    });

    hitLine.on('mouseout', () => {
      flowLine.setStyle({ weight: 3.5, color: '#06b6d4' });
      baseLine.setStyle({ weight: 8, opacity: 0.7 });
      const cardEl = document.getElementById(`card-trecho-${trecho.id}`);
      if (cardEl) cardEl.classList.remove('ring-2', 'ring-cyan-400');
    });

    // Ao clicar, abre o popup fixo com botão para disparar o simulador
    hitLine.on('click', (e) => {
      const latlng = e?.latlng || [
        (trecho.pontos[0][0] + trecho.pontos[1][0]) / 2,
        (trecho.pontos[0][1] + trecho.pontos[1][1]) / 2
      ];
      _abrirPopupTrecho(trecho, latlng);
    });

    _pipeLines[trecho.id] = { baseLine, flowLine, hitLine };

    // Badge de distância no ponto médio do trecho (só exibido em trechos com mais de 200m para não cobrir tanques próximos)
    if (trecho.distanciaKm >= 0.2) {
      const midLat = (trecho.pontos[0][0] + trecho.pontos[1][0]) / 2;
      const midLng = (trecho.pontos[0][1] + trecho.pontos[1][1]) / 2;
      const distIcon = L.divIcon({
        className: 'custom-distance-marker',
        html: `<div class="map-distance-chip shadow-lg cursor-pointer">${trecho.distanciaKm} km</div>`,
        iconSize: [64, 24],
        iconAnchor: [32, 12]
      });
      const distMarker = L.marker([midLat, midLng], { icon: distIcon }).addTo(_map);

      distMarker.bindTooltip(_gerarTooltipTrechoHTML(trecho), {
        opacity: 1,
        direction: 'top',
        offset: [0, -12],
        className: 'adutora-leaflet-tooltip'
      });

      distMarker.on('click', () => {
        _abrirPopupTrecho(trecho, [midLat, midLng]);
      });

      _distanceMarkers.push(distMarker);
    }

    // Conecta o card do trecho na parte inferior da tela
    const cardEl = document.getElementById(`card-trecho-${trecho.id}`);
    if (cardEl) {
      cardEl.style.cursor = 'pointer';
      cardEl.title = 'Passe o mouse ou clique para detalhar no mapa';
      cardEl.onmouseenter = () => {
        flowLine.setStyle({ weight: 5.5, color: '#38bdf8' });
      };
      cardEl.onmouseleave = () => {
        flowLine.setStyle({ weight: 3.5, color: '#06b6d4' });
      };
      cardEl.onclick = () => {
        if (_map) {
          _map.flyTo([midLat, midLng], 14, { duration: 1.0 });
          _abrirPopupTrecho(trecho, [midLat, midLng]);
        }
      };
    }
  });
}

function _criarMarcadoresLagoas() {
  const estado = getEstadoLagoas();

  Object.values(PONTOS_ADUTORA).forEach(ponto => {
    const customIcon = _criarIconePonto(ponto, estado);
    const marker = L.marker([ponto.lat, ponto.lng], { icon: customIcon }).addTo(_map);

    // TOOLTIP NO HOVER DOS "Ts" (INSTANTÂNEO NO MOUSE - IGUAL ÀS ADUTORAS!)
    const htmlTooltip = _gerarHTMLTooltipPonto(ponto);
    marker.bindTooltip(htmlTooltip, {
      opacity: 1,
      direction: 'top',
      offset: [0, -35],
      className: 'adutora-leaflet-tooltip'
    });

    // Eventos explícitos para garantir exibição imediata no hover e atualização em tempo real
    marker.on('mouseover', () => {
      marker.setTooltipContent(_gerarHTMLTooltipPonto(ponto));
      marker.openTooltip();
    });

    marker.on('mouseout', () => {
      marker.closeTooltip();
    });

    // CLIQUE FIXA A JANELA POPUP
    marker.on('click', () => {
      _abrirPopupPonto(marker, ponto);
    });

    _markers[ponto.chave] = marker;
  });
}

function _criarIconePonto(ponto, estado) {
  let online = false;
  let percentual = '--';

  ponto.lagoas.forEach(id => {
    const e = estado[id];
    if (e) {
      if (e.online && !e.isStale) online = true;
      if (e.percent > 0) percentual = `${e.percent.toFixed(0)}%`;
    }
  });

  const pulseHtml = online ? `<div class="lagoa-pulse" style="background:${ponto.cor}"></div>` : '';

  return L.divIcon({
    className: 'lagoa-map-marker',
    html: `
      <div class="lagoa-marker-badge badge-ponto-${ponto.chave}" title="${ponto.nome} (${ponto.badge}) — Passe o mouse para telemetria">
        <div class="lagoa-marker-icon" style="background:${ponto.cor}">
          ${pulseHtml}
          <span>${ponto.badge}</span>
        </div>
        <div class="lagoa-marker-label">
          <span class="w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-400'}"></span>
          <span>${percentual}</span>
        </div>
      </div>
    `,
    iconSize: [60, 70],
    iconAnchor: [30, 35]
  });
}

function _gerarHTMLTooltipPonto(ponto) {
  const estado = getEstadoLagoas();
  let lagoasHtml = '';

  ponto.lagoas.forEach(id => {
    const cfg = LAGOA_CONFIG[id];
    const e = estado[id] || {};
    const online = e.online && !e.isStale;
    const volM3 = e.volume ? (e.volume / 1000).toFixed(0) : '--';
    
    // Suporte aos formatos de nível: nivelCm, nivel ou ultimaLeitura
    const rawNivel = e.nivelCm != null ? e.nivelCm : (e.nivel != null ? e.nivel : e.ultimaLeitura?.nivel);
    const nivel = rawNivel != null && !isNaN(rawNivel) ? `${parseFloat(rawNivel).toFixed(1)} cm` : '--';

    // Lâmina d'água útil
    const rawLamina = e.alturaCm != null ? (e.alturaCm / 100) : (e.altura != null ? e.altura : null);
    const lamina = rawLamina != null && !isNaN(rawLamina) ? `${parseFloat(rawLamina).toFixed(2)} m` : '--';

    const pct = e.percent != null && !isNaN(e.percent) ? `${e.percent.toFixed(1)}%` : '--';

    lagoasHtml += `
      <div class="p-2.5 bg-slate-900/90 rounded-lg border border-slate-700/80 mb-1.5">
        <div class="flex items-center justify-between mb-1.5">
          <strong class="text-xs text-slate-100 font-bold">${cfg ? cfg.name : `Lagoa ${id}`}</strong>
          <span class="text-[9px] px-2 py-0.5 rounded-full font-bold ${online ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-700 text-slate-400'}">
            ${online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <div class="grid grid-cols-4 gap-1.5 text-center text-xs">
          <div class="bg-slate-950/70 p-1 rounded">
            <span class="text-[9px] text-slate-400 block uppercase font-semibold">Capac.</span>
            <strong class="text-cyan-400 font-mono text-[11px]">${pct}</strong>
          </div>
          <div class="bg-slate-950/70 p-1 rounded">
            <span class="text-[9px] text-slate-400 block uppercase font-semibold">Volume</span>
            <strong class="text-purple-300 font-mono text-[11px]">${volM3} m³</strong>
          </div>
          <div class="bg-slate-950/70 p-1 rounded" title="Distância do sensor">
            <span class="text-[9px] text-slate-400 block uppercase font-semibold">Sensor</span>
            <strong class="text-slate-200 font-mono text-[11px]">${nivel}</strong>
          </div>
          <div class="bg-slate-950/70 p-1 rounded" title="Lâmina de vinhaça">
            <span class="text-[9px] text-slate-400 block uppercase font-semibold">Lâmina</span>
            <strong class="text-emerald-400 font-mono text-[11px]">${lamina}</strong>
          </div>
        </div>
      </div>
    `;
  });

  return `
    <div class="adutora-hover-card p-3" style="min-width: 270px;">
      <div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-cyan-500/30">
        <span class="w-3 h-3 rounded-full shadow" style="background:${ponto.cor}"></span>
        <div>
          <h4 class="font-bold text-xs text-white">${ponto.nome}</h4>
          <p class="text-[9px] text-cyan-300 font-mono">${ponto.lat.toFixed(6)}, ${ponto.lng.toFixed(6)}</p>
        </div>
      </div>
      <div class="space-y-1">
        ${lagoasHtml}
      </div>
      <div class="pt-1 mt-1 border-t border-slate-800 text-[9px] text-slate-400 text-right">
        Clique para fixar janela
      </div>
    </div>
  `;
}

function _abrirPopupPonto(marker, ponto) {
  const content = _gerarHTMLTooltipPonto(ponto);
  marker.bindPopup(content, { maxWidth: 320, closeOnClick: false }).openPopup();
}

function _abrirPopupTrecho(trecho, latlng) {
  if (!_map) return;
  const p = _pipeLines[trecho.id];

  // Destaque visual temporário da adutora
  if (p && p.flowLine) {
    p.flowLine.setStyle({ weight: 6, color: '#38bdf8' });
    setTimeout(() => {
      p.flowLine.setStyle({ weight: 3.5, color: '#06b6d4' });
    }, 2500);
  }

  // Destaque visual do card de trecho correspondente
  const cardEl = document.getElementById(`card-trecho-${trecho.id}`);
  if (cardEl) {
    cardEl.classList.add('ring-2', 'ring-cyan-400');
    setTimeout(() => cardEl.classList.remove('ring-2', 'ring-cyan-400'), 2500);
  }

  // Volume interno da tubulação (m³)
  const diametroMm = trecho.diametroMm || 300;
  const raioM = (diametroMm / 1000) / 2;
  const volTubulacaoM3 = Math.round(Math.PI * Math.pow(raioM, 2) * (trecho.distanciaKm * 1000));
  const tempoTransitoMin = Math.round((volTubulacaoM3 / 120) * 60);

  const popupContent = `
    <div class="p-3.5" style="min-width: 280px;">
      <div class="flex items-center justify-between mb-2 pb-2 border-b border-slate-700">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-cyan-400 text-lg">alt_route</span>
          <div>
            <h4 class="font-bold text-sm text-white">${trecho.nome}</h4>
            <p class="text-[10px] text-cyan-300">Tubulação Georreferenciada</p>
          </div>
        </div>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
          ${trecho.distanciaKm} km
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs mb-3">
        <div class="bg-slate-800/80 p-2 rounded border border-slate-700/60">
          <span class="text-[10px] text-slate-400 block">Tubulação</span>
          <strong class="text-slate-100 text-xs">${trecho.tubulacao || 'PEAD PN10'}</strong>
        </div>
        <div class="bg-slate-800/80 p-2 rounded border border-slate-700/60">
          <span class="text-[10px] text-slate-400 block">Vol. na Linha</span>
          <strong class="text-purple-300 text-xs">${volTubulacaoM3.toLocaleString('pt-BR')} m³</strong>
        </div>
        <div class="bg-slate-800/80 p-2 rounded border border-slate-700/60">
          <span class="text-[10px] text-slate-400 block">Pressão Média</span>
          <strong class="text-emerald-400 text-xs">~4.8 bar</strong>
        </div>
        <div class="bg-slate-800/80 p-2 rounded border border-slate-700/60">
          <span class="text-[10px] text-slate-400 block" title="Tempo a 120 m³/h">Tempo Trânsito</span>
          <strong class="text-amber-300 text-xs">~${tempoTransitoMin} min</strong>
        </div>
      </div>

      <!-- Status Atual Exclusivo do Trecho -->
      <div class="mb-3 p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between text-xs">
        <span class="text-slate-400 font-medium">Fluxo no Trecho:</span>
        <span id="popup-status-${trecho.id}">${_gerarHTMLStatusTrecho(trecho.id)}</span>
      </div>

      <!-- Ações de Direção do Trecho (Altera SOMENTE este trecho) -->
      <div class="grid grid-cols-2 gap-2 mt-1">
        <button id="btn-popup-direto-${trecho.id}" class="py-2.5 px-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center justify-center gap-1.5 shadow cursor-pointer" title="Manter fluxo no sentido direto neste trecho">
          <span class="material-symbols-outlined text-sm">play_arrow</span> Fluxo Direto
        </button>
        <button id="btn-popup-reverso-${trecho.id}" class="py-2.5 px-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center justify-center gap-1.5 shadow cursor-pointer" title="Inverter apenas o fluxo deste trecho (os outros continuam normais)">
          <span class="material-symbols-outlined text-sm">swap_horiz</span> Inverter Fluxo
        </button>
      </div>
    </div>
  `;

  const popupPos = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
  L.popup({
    className: 'adutora-custom-popup',
    offset: [0, -5],
    maxWidth: 320,
    autoClose: true,
    closeOnClick: false
  })
    .setLatLng(popupPos)
    .setContent(popupContent)
    .openOn(_map);

  setTimeout(() => {
    // 1. Botão Fluxo Direto (Altera apenas este trecho)
    document.getElementById(`btn-popup-direto-${trecho.id}`)?.addEventListener('click', () => {
      _aplicarSentidoTrecho(trecho.id, 'direto');
    });

    // 2. Botão Inverter Fluxo (Inverte exclusivamente este trecho; os outros permanecem intactos)
    document.getElementById(`btn-popup-reverso-${trecho.id}`)?.addEventListener('click', () => {
      _inverterFluxoTrecho(trecho.id);
    });
  }, 100);
}

function _expandirSimulador() {
  const conteudo = document.getElementById('conteudo-simulador');
  const lblToggle = document.getElementById('lbl-toggle-simulador');
  const iconToggle = document.getElementById('icon-toggle-simulador');
  if (conteudo && conteudo.classList.contains('hidden')) {
    conteudo.classList.remove('hidden');
    if (lblToggle) lblToggle.textContent = 'Minimizar Simulador';
    if (iconToggle) iconToggle.classList.add('rotate-180');
  }
}

function _conectarBotoesControle() {
  document.getElementById('btn-map-fit-all')?.addEventListener('click', _ajustarVisaoCompleta);

  document.getElementById('btn-map-focus-usina')?.addEventListener('click', () => {
    if (_map) {
      // Foco detalhado (zoom 17) no pátio dos carregamentos gêmeos T1 e T2
      _map.flyTo([-21.044969, -48.260579], 17, { duration: 1.2 });
    }
  });

  document.getElementById('btn-map-focus-castanha')?.addEventListener('click', () => {
    if (_map) _map.flyTo([PONTOS_ADUTORA.castanha.lat, PONTOS_ADUTORA.castanha.lng], 15, { duration: 1.2 });
  });

  const btnToggleLayer = document.getElementById('btn-map-toggle-layer');
  const lblLayerMode = document.getElementById('lbl-layer-mode');

  btnToggleLayer?.addEventListener('click', () => {
    if (!_map) return;
    if (_modoCamada === 'satellite') {
      if (_layers.satellite && _map.hasLayer(_layers.satellite)) _map.removeLayer(_layers.satellite);
      if (_layers.labels && _map.hasLayer(_layers.labels)) _map.removeLayer(_layers.labels);
      if (_layers.dark) _layers.dark.addTo(_map);
      _modoCamada = 'dark';
      if (lblLayerMode) lblLayerMode.textContent = 'Modo Dark';
      btnToggleLayer.classList.add('bg-cyan-900/40', 'border-cyan-500/50', 'text-cyan-300');
    } else {
      if (_layers.dark && _map.hasLayer(_layers.dark)) _map.removeLayer(_layers.dark);
      if (_layers.satellite) _layers.satellite.addTo(_map);
      if (_layers.labels) _layers.labels.addTo(_map);
      _modoCamada = 'satellite';
      if (lblLayerMode) lblLayerMode.textContent = 'Satélite';
      btnToggleLayer.classList.remove('bg-cyan-900/40', 'border-cyan-500/50', 'text-cyan-300');
    }
  });

  // Toggle do Painel Retrátil do Simulador
  const btnToggleSimulador = document.getElementById('btn-toggle-simulador');
  const conteudoSimulador = document.getElementById('conteudo-simulador');
  const lblToggle = document.getElementById('lbl-toggle-simulador');
  const iconToggle = document.getElementById('icon-toggle-simulador');

  btnToggleSimulador?.addEventListener('click', () => {
    if (!conteudoSimulador) return;
    const isHidden = conteudoSimulador.classList.contains('hidden');
    if (isHidden) {
      conteudoSimulador.classList.remove('hidden');
      if (lblToggle) lblToggle.textContent = 'Minimizar Simulador';
      if (iconToggle) iconToggle.classList.add('rotate-180');
    } else {
      conteudoSimulador.classList.add('hidden');
      if (lblToggle) lblToggle.textContent = 'Abrir Simulador';
      if (iconToggle) iconToggle.classList.remove('rotate-180');
    }
  });
}

function _conectarSimuladorFluxo() {
  const selOrigem = document.getElementById('sim-origem');
  const selDestino = document.getElementById('sim-destino');
  const inputVazao = document.getElementById('sim-vazao');
  const sliderMeta = document.getElementById('sim-meta-percent');
  const numMeta = document.getElementById('sim-meta-percent-num');
  const lblMetaVal = document.getElementById('lbl-meta-percent-val');
  const btnInverterRes = document.getElementById('btn-inverter-reservatorios');

  function atualizarSimulacaoNivel() {
    const origKey = selOrigem?.value || 'castanha';
    const destKey = selDestino?.value || 'theresinha';
    const vazao = Math.max(10, parseFloat(inputVazao?.value) || 120);
    const metaPct = Math.max(5, Math.min(100, parseFloat(sliderMeta?.value) || 80));

    // Sincroniza labels e campos numéricos de meta
    if (lblMetaVal) lblMetaVal.textContent = `${metaPct}%`;
    if (numMeta && parseFloat(numMeta.value) !== metaPct) numMeta.value = metaPct;
    if (sliderMeta && parseFloat(sliderMeta.value) !== metaPct) sliderMeta.value = metaPct;

    const origem = _obterDadosLagoa(origKey);
    const destino = _obterDadosLagoa(destKey);
    if (!origem || !destino) return;

    // Atualiza badges nos labels dos selects
    const badgeOrigem = document.getElementById('sim-origem-nivel-badge');
    if (badgeOrigem) badgeOrigem.textContent = `${origem.percentAtual.toFixed(1)}% (${origem.volumeAtualM3.toFixed(0)} m³)`;

    const badgeDestino = document.getElementById('sim-destino-nivel-badge');
    if (badgeDestino) badgeDestino.textContent = `${destino.percentAtual.toFixed(1)}% (${destino.volumeAtualM3.toFixed(0)} m³)`;

    // Atualiza nomes nos cards comparativos
    const nomeOrigemEl = document.getElementById('sim-origem-card-nome');
    if (nomeOrigemEl) nomeOrigemEl.textContent = `Origem: ${origem.nome} (${origem.badge})`;

    const nomeDestinoEl = document.getElementById('sim-destino-card-nome');
    if (nomeDestinoEl) nomeDestinoEl.textContent = `Destino: ${destino.nome} (${destino.badge})`;

    // Elementos de resultado
    const elTempo = document.getElementById('sim-tempo-resultado');
    const elTaxa = document.getElementById('sim-taxa-transferencia');
    const elVolTransf = document.getElementById('sim-volume-transferir');
    const elLitrosTransf = document.getElementById('sim-litros-transferir');
    const diagTitulo = document.getElementById('sim-diagnostico-titulo');
    const diagDesc = document.getElementById('sim-diagnostico-desc');
    const diagIcon = document.getElementById('sim-diagnostico-icon');
    const diagIconBox = document.getElementById('sim-diagnostico-icon-box');

    // Validação: Origem e Destino iguais
    if (origKey === destKey) {
      if (elTempo) elTempo.textContent = '--';
      if (elTaxa) elTaxa.textContent = 'Reservatórios iguais';
      if (elVolTransf) elVolTransf.textContent = '0 m³';
      if (elLitrosTransf) elLitrosTransf.textContent = 'Selecione lagoas diferentes';
      if (diagTitulo) diagTitulo.textContent = 'Origem e Destino Iguais';
      if (diagDesc) diagDesc.textContent = 'Escolha reservatórios distintos para calcular a transferência.';
      if (diagIcon) diagIcon.textContent = 'info';
      if (diagIconBox) {
        diagIconBox.className = 'p-2.5 rounded-xl bg-amber-500/10 text-amber-400';
      }
      return;
    }

    // Cálculos de volume
    const volDestinoAtual = destino.volumeAtualM3;
    const volDestinoMeta = (metaPct / 100) * destino.capMaxM3;
    const deltaM3 = volDestinoMeta - volDestinoAtual;

    if (elTaxa) elTaxa.textContent = `Vazão programada: ${vazao} m³/h`;

    if (deltaM3 <= 0) {
      // Destino já está na meta ou acima dela
      if (elTempo) elTempo.textContent = '0 min';
      if (elVolTransf) elVolTransf.textContent = '0 m³';
      if (elLitrosTransf) elLitrosTransf.textContent = 'Meta já atingida';

      if (diagTitulo) diagTitulo.textContent = 'Meta Já Atingida';
      if (diagDesc) diagDesc.textContent = `O reservatório de destino já está em ${destino.percentAtual.toFixed(1)}% (igual ou superior à meta de ${metaPct}%).`;
      if (diagIcon) diagIcon.textContent = 'check_circle';
      if (diagIconBox) diagIconBox.className = 'p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400';

      // Atualiza visual Origem
      _atualizarBarraVisual('sim-origem', origem.percentAtual, origem.percentAtual, origem.volumeAtualM3, origem.volumeAtualM3, origem.capMaxM3);
      // Atualiza visual Destino
      _atualizarBarraVisual('sim-destino', destino.percentAtual, destino.percentAtual, destino.volumeAtualM3, destino.volumeAtualM3, destino.capMaxM3);
      return;
    }

    // Tempo de bombeamento
    const horasDec = deltaM3 / vazao;
    const h = Math.floor(horasDec);
    const m = Math.round((horasDec - h) * 60);
    const tempoFormatado = h > 0 ? `~${h}h ${m}min` : `~${m} min`;

    if (elTempo) elTempo.textContent = tempoFormatado;
    if (elVolTransf) elVolTransf.textContent = `${Math.round(deltaM3).toLocaleString('pt-BR')} m³`;
    if (elLitrosTransf) elLitrosTransf.textContent = `+${Math.round(deltaM3 * 1000).toLocaleString('pt-BR')} Litros`;

    // Projeções
    const volOrigemPrevisto = Math.max(0, origem.volumeAtualM3 - deltaM3);
    const pctOrigemPrevisto = Math.max(0, (volOrigemPrevisto / origem.capMaxM3) * 100);

    const volDestinoPrevisto = volDestinoMeta;
    const pctDestinoPrevisto = metaPct;

    // Atualiza barras visuais
    _atualizarBarraVisual('sim-origem', origem.percentAtual, pctOrigemPrevisto, origem.volumeAtualM3, volOrigemPrevisto, origem.capMaxM3);
    _atualizarBarraVisual('sim-destino', destino.percentAtual, pctDestinoPrevisto, destino.volumeAtualM3, volDestinoPrevisto, destino.capMaxM3);

    // Diagnósticos e alertas operacionais
    if (deltaM3 > origem.volumeAtualM3) {
      if (diagTitulo) diagTitulo.textContent = 'Volume Insuficiente na Origem';
      if (diagDesc) diagDesc.textContent = `A origem possui ${origem.volumeAtualM3.toFixed(0)} m³, mas são necessários ${deltaM3.toFixed(0)} m³. Faltarão ${(deltaM3 - origem.volumeAtualM3).toFixed(0)} m³.`;
      if (diagIcon) diagIcon.textContent = 'warning';
      if (diagIconBox) diagIconBox.className = 'p-2.5 rounded-xl bg-red-500/10 text-red-400';
    } else if (metaPct >= 95) {
      if (diagTitulo) diagTitulo.textContent = 'Alerta: Risco de Transbordamento';
      if (diagDesc) diagDesc.textContent = `Meta de ${metaPct}% fica muito perto do limite da borda (recomendado máx: 90%).`;
      if (diagIcon) diagIcon.textContent = 'crisis_alert';
      if (diagIconBox) diagIconBox.className = 'p-2.5 rounded-xl bg-amber-500/10 text-amber-400';
    } else if (pctOrigemPrevisto < 10) {
      if (diagTitulo) diagTitulo.textContent = 'Alerta: Nível Crítico na Origem';
      if (diagDesc) diagDesc.textContent = `A lagoa de saída ficará com apenas ${pctOrigemPrevisto.toFixed(1)}% (risco de sucção de lodo/ar na bomba).`;
      if (diagIcon) diagIcon.textContent = 'report_problem';
      if (diagIconBox) diagIconBox.className = 'p-2.5 rounded-xl bg-amber-500/10 text-amber-400';
    } else {
      if (diagTitulo) diagTitulo.textContent = 'Operação Viável e Segura';
      if (diagDesc) diagDesc.textContent = `Transferência prevista em ${tempoFormatado} sem risco de transbordamento.`;
      if (diagIcon) diagIcon.textContent = 'verified';
      if (diagIconBox) diagIconBox.className = 'p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400';
    }
  }

  function _atualizarBarraVisual(prefixo, pctAtual, pctPrevisto, volAtual, volPrevisto, capMax) {
    const elValores = document.getElementById(`${prefixo}-proj-valores`);
    const elBarAtual = document.getElementById(`${prefixo}-bar-atual`);
    const elBarProj = document.getElementById(`${prefixo}-bar-proj`) || document.getElementById(`${prefixo}-bar-meta`);
    const elVolAtual = document.getElementById(`${prefixo}-vol-atual`);
    const elVolPrevisto = document.getElementById(`${prefixo}-vol-previsto`) || document.getElementById(`${prefixo}-vol-meta`);
    const elVolCap = document.getElementById(`${prefixo}-vol-cap`);

    if (elValores) {
      elValores.textContent = `${pctAtual.toFixed(1)}% ➔ ${pctPrevisto.toFixed(1)}%`;
    }
    if (elBarAtual) {
      elBarAtual.style.width = `${Math.min(100, Math.max(0, pctAtual))}%`;
    }
    if (elBarProj) {
      elBarProj.style.width = `${Math.min(100, Math.max(0, pctPrevisto))}%`;
    }
    if (elVolAtual) elVolAtual.textContent = `${Math.round(volAtual).toLocaleString('pt-BR')} m³`;
    if (elVolPrevisto) elVolPrevisto.textContent = `${Math.round(volPrevisto).toLocaleString('pt-BR')} m³`;
    if (elVolCap) elVolCap.textContent = `${Math.round(capMax).toLocaleString('pt-BR')} m³`;
  }

  // Inverter Reservatórios (Origem ⇄ Destino)
  btnInverterRes?.addEventListener('click', () => {
    if (!selOrigem || !selDestino) return;
    const temp = selOrigem.value;
    selOrigem.value = selDestino.value;
    selDestino.value = temp;
    atualizarSimulacaoNivel();
  });

  selOrigem?.addEventListener('change', atualizarSimulacaoNivel);
  selDestino?.addEventListener('change', atualizarSimulacaoNivel);
  inputVazao?.addEventListener('input', atualizarSimulacaoNivel);

  sliderMeta?.addEventListener('input', (e) => {
    if (numMeta) numMeta.value = e.target.value;
    atualizarSimulacaoNivel();
  });

  numMeta?.addEventListener('input', (e) => {
    if (sliderMeta) sliderMeta.value = e.target.value;
    atualizarSimulacaoNivel();
  });

  // Atalhos de Meta (%)
  document.querySelectorAll('.btn-preset-meta').forEach(btn => {
    btn.addEventListener('click', () => {
      const meta = btn.getAttribute('data-meta');
      if (sliderMeta) sliderMeta.value = meta;
      if (numMeta) numMeta.value = meta;
      document.querySelectorAll('.btn-preset-meta').forEach(b => {
        b.classList.remove('border-amber-500/60', 'text-amber-400', 'font-bold');
      });
      btn.classList.add('border-amber-500/60', 'text-amber-400', 'font-bold');
      atualizarSimulacaoNivel();
    });
  });

  // Atalhos de Vazão
  document.querySelectorAll('.btn-preset-vazao').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-vazao');
      if (inputVazao) inputVazao.value = v;
      document.querySelectorAll('.btn-preset-vazao').forEach(b => {
        b.classList.remove('border-cyan-500/60', 'text-cyan-300', 'font-bold');
      });
      btn.classList.add('border-cyan-500/60', 'text-cyan-300', 'font-bold');
      atualizarSimulacaoNivel();
    });
  });

  // Botões de inversão de fluxo individual nos cards de trechos
  document.querySelectorAll('.btn-inverter-trecho-card').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trechoId = btn.getAttribute('data-id');
      if (trechoId) {
        _inverterFluxoTrecho(trechoId);
      }
    });
  });

  // Executa o cálculo inicial da simulação
  atualizarSimulacaoNivel();
}

function _ajustarVisaoCompleta() {
  if (!_map) return;
  const bounds = L.latLngBounds(Object.values(PONTOS_ADUTORA).map(p => [p.lat, p.lng]));
  _map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
}

// ─── Atualização Contínua dos Dados no Mapa ──────────────────────────────────
export function atualizarDadosMapa() {
  if (!_map) return;
  const estado = getEstadoLagoas();

  // 1. Atualiza ícones dos marcadores e seus tooltips de hover
  Object.values(PONTOS_ADUTORA).forEach(ponto => {
    const marker = _markers[ponto.chave];
    if (marker) {
      marker.setIcon(_criarIconePonto(ponto, estado));
      if (typeof marker.setTooltipContent === 'function') {
        marker.setTooltipContent(_gerarHTMLTooltipPonto(ponto));
      }
    }
  });

  // 2. Calcula total armazenado na adutora
  let totalM3 = 0;
  Object.values(estado).forEach(e => {
    if (e?.volume > 0) totalM3 += e.volume / 1000;
  });
  const storedEl = document.getElementById('map-total-stored');
  if (storedEl) storedEl.textContent = `${totalM3.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m³`;

  // 3. Status dinâmico dos nós
  const onlineCount = Object.values(estado).filter(e => e?.online && !e?.isStale).length;
  const nodesEl = document.getElementById('map-telemetry-nodes');
  if (nodesEl) nodesEl.textContent = `${onlineCount} Nós Transmitindo`;
}

// ─── Hook de renderização disparado ao trocar para a aba ────────────────────
window.addEventListener('ferti:renderMap', () => {
  setTimeout(() => {
    initMapaAdutoras();
    if (_map) {
      _map.invalidateSize();
      _ajustarVisaoCompleta();
    }
  }, 100);
});

window.addEventListener('ferti:leituraAtualizada', () => {
  atualizarDadosMapa();
});
