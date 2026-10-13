// ============================================================================
// mapa.js — Linha de Fluxo de Águas & Adutoras de Fertirrigação (Leaflet)
// Topologia Usina Pitangueiras:
// Usina (Carregamento A/B) -> Eucalipto Cheiroso -> Castanha -> Santa Theresinha (12.28 km)
// ============================================================================

import { LAGOA_CONFIG } from './firebase.js';
import { getEstadoLagoas } from './lagoas.js';

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

export const PONTOS_ADUTORA = {
  usina: {
    chave: 'usina',
    nome: 'CARREGAMENTO USINA (A e B)',
    subtitulo: 'Lagoas 1 e 2',
    lat: -21.04496856073156,
    lng: -48.26058559247929,
    ordem: 0,
    lagoas: [1, 2],
    cor: '#06b6d4',
    badge: 'USINA'
  },
  eucalipto: {
    chave: 'eucalipto',
    nome: 'EUCALIPTO CHEIROSO',
    subtitulo: 'Lagoa 3',
    lat: -21.048171179817402,
    lng: -48.27849805552853,
    ordem: 1,
    lagoas: [3],
    cor: '#f59e0b',
    badge: 'T3'
  },
  castanha: {
    chave: 'castanha',
    nome: 'CASTANHA',
    subtitulo: 'Lagoa 4',
    lat: -21.080929846011003,
    lng: -48.30075955155999,
    ordem: 2,
    lagoas: [4],
    cor: '#8b5cf6',
    badge: 'T4'
  },
  theresinha: {
    chave: 'theresinha',
    nome: 'SANTA THERESINHA',
    subtitulo: 'Lagoa 5',
    lat: -21.104326364035728,
    lng: -48.35321793859342,
    ordem: 3,
    lagoas: [5],
    cor: '#ec4899',
    badge: 'T5'
  }
};

export const TRECHOS_ADUTORA = [
  {
    id: 'usina-eucalipto',
    origem: 'usina',
    destino: 'eucalipto',
    nome: 'Usina ➔ Eucalipto Cheiroso',
    distanciaKm: 1.92,
    pontos: [
      [-21.04496856073156, -48.26058559247929],
      [-21.048171179817402, -48.27849805552853]
    ]
  },
  {
    id: 'eucalipto-castanha',
    origem: 'eucalipto',
    destino: 'castanha',
    nome: 'Eucalipto Cheiroso ➔ Castanha',
    distanciaKm: 4.26,
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
    pontos: [
      [-21.080929846011003, -48.30075955155999],
      [-21.104326364035728, -48.35321793859342]
    ]
  }
];

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
            12.28 km de extensão
          </span>
        </div>
        <p class="text-xs" style="color:var(--text-3)">
          Traçado georreferenciado interligando Usina Pitangueiras, Eucalipto Cheiroso, Castanha e Santa Theresinha com telemetria dos sensores
        </p>
      </div>

      <!-- Filtros Rápidos de Visão -->
      <div class="flex flex-wrap items-center gap-2">
        <button id="btn-map-fit-all" class="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1.5 shadow cursor-pointer">
          <span class="material-symbols-outlined text-xs">zoom_out_map</span> Ver Linha Completa
        </button>
        <button id="btn-map-focus-usina" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer" style="background:var(--bg-3);color:var(--text-1);border:1px solid var(--border-1)">
          Usina A/B
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
          <span id="map-telemetry-nodes" class="map-overlay-badge">4 Estações</span>
        </div>
        <div class="space-y-1.5">
          <div class="map-overlay-row">
            <span class="map-overlay-label">Extensão Total:</span>
            <span class="map-overlay-value text-slate-100">12.28 km</span>
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

    <!-- Simulador Operacional de Fluxos Futuros -->
    <div class="vazao-panel rounded-xl p-5 shadow-lg border border-slate-700 bg-slate-900/80">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-700">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-amber-400 text-2xl">swap_horiz</span>
          <div>
            <h4 class="text-base font-bold text-white">Simulador Dinâmico de Fluxos Futuros</h4>
            <p class="text-xs text-slate-400">Simule bombeamentos programados, visualize a direção do fluido no mapa e calcule o tempo estimado de transferência</p>
          </div>
        </div>
        <span class="text-xs font-mono px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span> Linha Viva
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Lagoa de Origem (Saída)</label>
          <select id="sim-origem" class="w-full p-2.5 text-xs rounded-lg bg-slate-800 border border-slate-600 text-white font-medium focus:border-cyan-400 outline-none">
            <option value="usina">Carregamento Usina (A/B)</option>
            <option value="eucalipto">Eucalipto Cheiroso (T3)</option>
            <option value="castanha">Castanha (T4)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Lagoa de Destino (Chegada)</label>
          <select id="sim-destino" class="w-full p-2.5 text-xs rounded-lg bg-slate-800 border border-slate-600 text-white font-medium focus:border-cyan-400 outline-none">
            <option value="castanha" selected>Castanha (T4)</option>
            <option value="eucalipto">Eucalipto Cheiroso (T3)</option>
            <option value="theresinha">Santa Theresinha (T5)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Vazão da Bomba (m³/h)</label>
          <input type="number" id="sim-vazao" value="120" min="10" max="800" step="10" class="w-full p-2.5 text-xs rounded-lg bg-slate-800 border border-slate-600 text-white font-mono focus:border-cyan-400 outline-none">
        </div>
        <div class="flex gap-2">
          <button id="btn-simular-fluxo" class="flex-1 py-2.5 px-3 text-xs font-bold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center justify-center gap-1.5 shadow cursor-pointer">
            <span class="material-symbols-outlined text-sm">play_arrow</span> Ativar Fluxo
          </button>
          <button id="btn-reset-fluxo" class="py-2.5 px-3 text-xs font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition cursor-pointer">
            Parar
          </button>
        </div>
      </div>

      <!-- Resumo da Projeção de Fluxo -->
      <div id="sim-resultado" class="mt-4 p-4 rounded-lg bg-slate-800/90 border border-cyan-500/40 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-cyan-400 text-2xl">airwave</span>
          <div>
            <strong class="text-white text-sm" id="sim-trajeto-label">Usina ➔ Castanha (Distância: 6.18 km)</strong>
            <p class="text-slate-400 mt-0.5" id="sim-detalhes-label">Fluxo simulado a 120 m³/h passando pelas adutoras 1 e 2.</p>
          </div>
        </div>
        <div class="flex items-center gap-5 text-right flex-wrap">
          <div>
            <span class="text-slate-400 block text-[11px]">Tempo Est. p/ 500 m³</span>
            <strong class="text-amber-400 text-sm font-mono" id="sim-tempo-estimado">~4h 10min</strong>
          </div>
          <div>
            <span class="text-slate-400 block text-[11px]">Velocidade no Duto</span>
            <strong class="text-cyan-400 text-sm font-mono" id="sim-velocidade-duto">~1.4 m/s</strong>
          </div>
          <div>
            <span class="text-slate-400 block text-[11px]">Pressão Estimada</span>
            <strong class="text-emerald-400 text-sm font-mono" id="sim-pressao-estimada">~4.8 bar</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Painel de Trechos da Adutora -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      ${TRECHOS_ADUTORA.map((t, idx) => `
        <div class="vazao-panel rounded-xl p-4 shadow border border-slate-700 relative overflow-hidden" id="card-trecho-${t.id}">
          <div class="flex items-center justify-between mb-2 pb-1 border-b border-slate-700">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Trecho ${idx + 1}</span>
            <span class="map-distance-chip">
              <span class="material-symbols-outlined text-[12px]">straighten</span> ${t.distanciaKm} km
            </span>
          </div>
          <h4 class="text-sm font-bold text-slate-100 mb-1">${t.nome}</h4>
          <p class="text-xs text-slate-400 mb-2">Tubulação de alta pressão interligando reservatórios</p>
          <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
            <span class="text-slate-400">Fluxo no Trecho:</span>
            <span id="pipe-flow-${t.id}" class="font-mono text-cyan-400 font-bold flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> Estável
            </span>
          </div>
        </div>
      `).join('')}
    </div>

  </div>`;
}

// ─── Inicialização do Mapa Leaflet ──────────────────────────────────────────
export function initMapaAdutoras() {
  const container = document.getElementById('adutoras-leaflet-map');
  if (!container) return;

  // Se já inicializado, apenas invalida o tamanho e atualiza dados
  if (_map) {
    _map.invalidateSize();
    atualizarDadosMapa();
    return;
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

  // Traça as linhas de tubulação da adutora
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

function _desenharAdutoras() {
  TRECHOS_ADUTORA.forEach(trecho => {
    // 1. Linha de base (glow exterior)
    const baseLine = L.polyline(trecho.pontos, {
      color: '#083344',
      weight: 8,
      opacity: 0.7,
      lineCap: 'round'
    }).addTo(_map);

    // 2. Linha interna condutora de fluido
    const flowLine = L.polyline(trecho.pontos, {
      color: '#06b6d4',
      weight: 3.5,
      opacity: 0.95,
      className: 'adutora-anim-flow'
    }).addTo(_map);

    flowLine.bindTooltip(`<strong>${trecho.nome}</strong><br>Distância: ${trecho.distanciaKm} km`, {
      sticky: true,
      className: 'bg-slate-900 text-white rounded-lg px-2 py-1 text-xs border border-slate-700 shadow'
    });

    _pipeLines[trecho.id] = { baseLine, flowLine };

    // Adiciona badge de distância no ponto médio do trecho
    const midLat = (trecho.pontos[0][0] + trecho.pontos[1][0]) / 2;
    const midLng = (trecho.pontos[0][1] + trecho.pontos[1][1]) / 2;
    const distIcon = L.divIcon({
      className: 'custom-distance-marker',
      html: `<div class="map-distance-chip shadow-lg">${trecho.distanciaKm} km</div>`,
      iconSize: [60, 20],
      iconAnchor: [30, 10]
    });
    const distMarker = L.marker([midLat, midLng], { icon: distIcon }).addTo(_map);
    _distanceMarkers.push(distMarker);
  });
}

function _criarMarcadoresLagoas() {
  const estado = getEstadoLagoas();

  Object.values(PONTOS_ADUTORA).forEach(ponto => {
    const customIcon = _criarIconePonto(ponto, estado);
    const marker = L.marker([ponto.lat, ponto.lng], { icon: customIcon }).addTo(_map);

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
      <div class="lagoa-marker-badge">
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

function _abrirPopupPonto(marker, ponto) {
  const estado = getEstadoLagoas();
  let lagoasHtml = '';

  ponto.lagoas.forEach(id => {
    const cfg = LAGOA_CONFIG[id];
    const e = estado[id] || {};
    const online = e.online && !e.isStale;
    const volM3 = e.volume ? (e.volume / 1000).toFixed(0) : '--';
    
    // Suporte aos formatos de nivel: nivelCm, nivel ou ultimaLeitura
    const rawNivel = e.nivelCm != null ? e.nivelCm : (e.nivel != null ? e.nivel : e.ultimaLeitura?.nivel);
    const nivel = rawNivel != null && !isNaN(rawNivel) ? `${parseFloat(rawNivel).toFixed(1)} cm` : '--';

    // Lâmina d'água útil
    const rawLamina = e.alturaCm != null ? (e.alturaCm / 100) : (e.altura != null ? e.altura : null);
    const lamina = rawLamina != null && !isNaN(rawLamina) ? `${parseFloat(rawLamina).toFixed(2)} m` : '--';

    const pct = e.percent != null && !isNaN(e.percent) ? `${e.percent.toFixed(1)}%` : '--';

    lagoasHtml += `
      <div class="p-3 bg-slate-800/80 rounded-lg border border-slate-700/80 mb-2">
        <div class="flex items-center justify-between mb-1.5">
          <strong class="text-sm text-slate-100">${cfg ? cfg.name : `Lagoa ${id}`}</strong>
          <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${online ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-400'}">
            ${online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <div class="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <span class="text-[10px] text-slate-400 block">Capacidade</span>
            <strong class="text-cyan-400">${pct}</strong>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 block">Volume</span>
            <strong class="text-purple-400">${volM3} m³</strong>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 block" title="Distância do sensor até a lâmina">Dist. Sensor</span>
            <strong class="text-slate-200">${nivel}</strong>
          </div>
          <div>
            <span class="text-[10px] text-slate-400 block" title="Lâmina de vinhaça acumulada">Lâmina</span>
            <strong class="text-emerald-400">${lamina}</strong>
          </div>
        </div>
      </div>
    `;
  });

  const popupContent = `
    <div class="p-4" style="min-width: 260px;">
      <div class="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
        <span class="w-3 h-3 rounded-full" style="background:${ponto.cor}"></span>
        <div>
          <h4 class="font-extrabold text-sm text-white">${ponto.nome}</h4>
          <p class="text-[10px] text-slate-400">${ponto.lat.toFixed(6)}, ${ponto.lng.toFixed(6)}</p>
        </div>
      </div>
      <div class="space-y-1">
        ${lagoasHtml}
      </div>
    </div>
  `;

  marker.bindPopup(popupContent, { maxWidth: 320 }).openPopup();
}

function _conectarBotoesControle() {
  document.getElementById('btn-map-fit-all')?.addEventListener('click', _ajustarVisaoCompleta);

  document.getElementById('btn-map-focus-usina')?.addEventListener('click', () => {
    if (_map) _map.flyTo([PONTOS_ADUTORA.usina.lat, PONTOS_ADUTORA.usina.lng], 15, { duration: 1.2 });
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
}

function _conectarSimuladorFluxo() {
  const btnSimular = document.getElementById('btn-simular-fluxo');
  const btnReset = document.getElementById('btn-reset-fluxo');
  const selOrigem = document.getElementById('sim-origem');
  const selDestino = document.getElementById('sim-destino');
  const inputVazao = document.getElementById('sim-vazao');

  function atualizarCalculosSimulacao() {
    const orig = selOrigem?.value || 'usina';
    const dest = selDestino?.value || 'castanha';
    const vazao = parseFloat(inputVazao?.value) || 120;

    const pOrig = PONTOS_ADUTORA[orig];
    const pDest = PONTOS_ADUTORA[dest];
    if (!pOrig || !pDest) return;

    // Determina trechos percorridos no trajeto
    const i1 = Math.min(pOrig.ordem, pDest.ordem);
    const i2 = Math.max(pOrig.ordem, pDest.ordem);
    let distTotal = 0;
    const trechosEnvolvidos = [];

    for (let i = i1; i < i2; i++) {
      const t = TRECHOS_ADUTORA[i];
      if (t) {
        distTotal += t.distanciaKm;
        trechosEnvolvidos.push(t);
      }
    }

    const sentidoReverso = pOrig.ordem > pDest.ordem;

    // Atualiza resumo no DOM
    const lblTrajeto = document.getElementById('sim-trajeto-label');
    const lblDetalhes = document.getElementById('sim-detalhes-label');
    const lblTempo = document.getElementById('sim-tempo-estimado');
    const lblVel = document.getElementById('sim-velocidade-duto');
    const lblPressao = document.getElementById('sim-pressao-estimada');

    if (lblTrajeto) {
      lblTrajeto.textContent = `${pOrig.badge} ➔ ${pDest.badge} (${pOrig.nome} ➔ ${pDest.nome}) — ${distTotal.toFixed(2)} km`;
    }

    if (lblDetalhes) {
      lblDetalhes.textContent = `Fluxo ${sentidoReverso ? 'reverso' : 'direto'} programado a ${vazao} m³/h atravessando ${trechosEnvolvidos.length} trecho(s) de adutora.`;
    }

    // Tempo estimado para transferir 500 m³
    const horas = 500 / vazao;
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    if (lblTempo) lblTempo.textContent = `~${h}h ${m}min`;

    // Velocidade em duto de 250mm: v = Q / (pi * r^2)
    const vel = (vazao / 3600) / (Math.PI * Math.pow(0.125, 2));
    if (lblVel) lblVel.textContent = `~${vel.toFixed(1)} m/s`;

    // Pressão estimada (perda de carga proporcional à distância e vazão)
    const pressao = 2.0 + (distTotal * 0.45) + (vazao / 200);
    if (lblPressao) lblPressao.textContent = `~${pressao.toFixed(1)} bar`;

    return { trechosEnvolvidos, sentidoReverso, vazao };
  }

  selOrigem?.addEventListener('change', atualizarCalculosSimulacao);
  selDestino?.addEventListener('change', atualizarCalculosSimulacao);
  inputVazao?.addEventListener('input', atualizarCalculosSimulacao);

  btnSimular?.addEventListener('click', () => {
    const res = atualizarCalculosSimulacao();
    if (!res) return;

    // Reseta classes de todos os trechos
    TRECHOS_ADUTORA.forEach(t => {
      const p = _pipeLines[t.id];
      if (p) {
        p.flowLine._path?.classList.remove('adutora-anim-flow', 'adutora-anim-flow-reverse');
        p.flowLine.setStyle({ color: '#334155', weight: 3 });
        const badgeEl = document.getElementById(`pipe-flow-${t.id}`);
        if (badgeEl) badgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Estável`;
      }
    });

    // Ativa animação intensa e cores vibrantes nos trechos envolvidos
    res.trechosEnvolvidos.forEach(t => {
      const p = _pipeLines[t.id];
      if (p) {
        const animClass = res.sentidoReverso ? 'adutora-anim-flow-reverse' : 'adutora-anim-flow';
        p.flowLine._path?.classList.add(animClass);
        p.flowLine.setStyle({ color: '#22d3ee', weight: 5 });
        const badgeEl = document.getElementById(`pipe-flow-${t.id}`);
        if (badgeEl) {
          badgeEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span> <strong>${res.vazao} m³/h ${res.sentidoReverso ? '⬅' : '➔'}</strong>`;
        }
      }
    });

    const statusEl = document.getElementById('map-flow-status');
    if (statusEl) {
      statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span> Bombeamento Ativo (${res.vazao} m³/h)`;
    }
  });

  btnReset?.addEventListener('click', () => {
    TRECHOS_ADUTORA.forEach(t => {
      const p = _pipeLines[t.id];
      if (p) {
        p.flowLine._path?.classList.remove('adutora-anim-flow-reverse');
        p.flowLine._path?.classList.add('adutora-anim-flow');
        p.flowLine.setStyle({ color: '#06b6d4', weight: 3.5 });
        const badgeEl = document.getElementById(`pipe-flow-${t.id}`);
        if (badgeEl) badgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> Estável`;
      }
    });
    const statusEl = document.getElementById('map-flow-status');
    if (statusEl) {
      statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Em Operação`;
    }
  });

  atualizarCalculosSimulacao();
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

  // 1. Atualiza ícones dos marcadores
  Object.values(PONTOS_ADUTORA).forEach(ponto => {
    const marker = _markers[ponto.chave];
    if (marker) {
      marker.setIcon(_criarIconePonto(ponto, estado));
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
