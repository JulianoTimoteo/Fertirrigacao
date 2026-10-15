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
let _modoOperacaoFluxo = 'auto'; // 'auto' (IA/Sensores) | 'manual' (Supervisório SCADA)

// Estado individual e independente de fluxo por trecho
const _estadoTrechos = {
  'industria-bifurcacao': { ativo: true, sentido: 'direto', vazao: 250 },
  'bifurcacao-t1': { ativo: true, sentido: 'direto', vazao: 125 },
  'bifurcacao-t2': { ativo: true, sentido: 'direto', vazao: 125 },
  't2-t1': { ativo: true, sentido: 'direto', vazao: 120 },
  't1-carr-usina': { ativo: false, sentido: 'direto', vazao: 0 },
  't1-eucalipto': { ativo: true, sentido: 'direto', vazao: 120 },
  'eucalipto-castanha': { ativo: true, sentido: 'direto', vazao: 120 },
  't4-carr-castanha': { ativo: false, sentido: 'direto', vazao: 0 },
  'castanha-theresinha': { ativo: true, sentido: 'direto', vazao: 120 },
  'theresinha-carr-theresinha': { ativo: false, sentido: 'direto', vazao: 0 }
};

export const PONTOS_ADUTORA = {
  industria: {
    chave: 'industria',
    nome: 'INDÚSTRIA PITANGUEIRAS',
    subtitulo: 'Moagem & Geração 24h',
    lat: -21.048358207942854,
    lng: -48.26135796446434,
    ordem: -1,
    cor: '#ef4444',
    badge: 'IND',
    tipo: 'industria'
  },
  carr_usina: {
    chave: 'carr_usina',
    nome: 'CARREGAMENTO USINA',
    subtitulo: 'Doca de Caminhões Usina (T1/T2)',
    lat: -21.044694910635954,
    lng: -48.26141733148316,
    ordem: 0,
    cor: '#f97316',
    badge: '🚛',
    tipo: 'caminhao'
  },
  t2: {
    chave: 't2',
    nome: 'CARREGAMENTO USINA B',
    subtitulo: 'Tanque 2 (T2)',
    lat: -21.044852715210126,
    lng: -48.260317960320975,
    ordem: 1,
    lagoas: [2],
    cor: '#0ea5e9',
    badge: 'T2',
    tipo: 'tanque'
  },
  t1: {
    chave: 't1',
    nome: 'CARREGAMENTO USINA A',
    subtitulo: 'Tanque 1 (T1)',
    lat: -21.04508601802594,
    lng: -48.260840316946286,
    ordem: 2,
    lagoas: [1],
    cor: '#06b6d4',
    badge: 'T1',
    tipo: 'tanque'
  },
  eucalipto: {
    chave: 'eucalipto',
    nome: 'EUCALIPTO CHEIROSO',
    subtitulo: 'Lagoa 3 (T3)',
    lat: -21.048171179817402,
    lng: -48.27849805552853,
    ordem: 3,
    lagoas: [3],
    cor: '#f59e0b',
    badge: 'T3',
    tipo: 'tanque'
  },
  castanha: {
    chave: 'castanha',
    nome: 'CASTANHA',
    subtitulo: 'Lagoa 4 (T4)',
    lat: -21.080929846011003,
    lng: -48.30075955155999,
    ordem: 4,
    lagoas: [4],
    cor: '#8b5cf6',
    badge: 'T4',
    tipo: 'tanque'
  },
  carr_castanha: {
    chave: 'carr_castanha',
    nome: 'CARREGAMENTO CASTANHA',
    subtitulo: 'Doca de Caminhões (T4)',
    lat: -21.07840906172092,
    lng: -48.300072451861894,
    ordem: 5,
    cor: '#f97316',
    badge: '🚛',
    tipo: 'caminhao'
  },
  theresinha: {
    chave: 'theresinha',
    nome: 'SANTA THERESINHA',
    subtitulo: 'Lagoa 5 (T5)',
    lat: -21.104326364035728,
    lng: -48.35321793859342,
    ordem: 6,
    lagoas: [5],
    cor: '#ec4899',
    badge: 'T5',
    tipo: 'tanque'
  },
  carr_theresinha: {
    chave: 'carr_theresinha',
    nome: 'CARREGAMENTO SANTA THERESINHA',
    subtitulo: 'Doca de Caminhões (T5)',
    lat: -21.099731418780465,
    lng: -48.35205904510835,
    ordem: 7,
    cor: '#f97316',
    badge: '🚛',
    tipo: 'caminhao'
  }
};

export const TRECHOS_ADUTORA = [
  // 1. Adutora de Abastecimento Moagem 24h (Imagem 3)
  {
    id: 'industria-bifurcacao',
    origem: 'industria',
    destino: 'bifurcacao',
    nome: 'Moagem 24h ➔ Bifurcação Tanques',
    distanciaKm: 0.38,
    diametroMm: 350,
    tubulacao: 'Aço Carbono / PEAD 355mm (Linha Contínua 24h)',
    tipo: 'industria',
    pontos: [
      [-21.048358207942854, -48.26135796446434],
      [-21.046941460750915, -48.26085306662122],
      [-21.046303585136798, -48.26061943021131],
      [-21.045613478345047, -48.260781280211035],
      [-21.045382454755696, -48.26074637138774],
      [-21.045213629598635, -48.260273515507265]
    ]
  },
  {
    id: 'bifurcacao-t1',
    origem: 'bifurcacao',
    destino: 't1',
    nome: 'Bifurcação ➔ Tanque 1 (T1)',
    distanciaKm: 0.06,
    diametroMm: 300,
    tubulacao: 'PEAD PN10 De 315mm',
    tipo: 'alimentacao_tanque',
    pontos: [
      [-21.045213629598635, -48.260273515507265],
      [-21.04508601802594, -48.260840316946286]
    ]
  },
  {
    id: 'bifurcacao-t2',
    origem: 'bifurcacao',
    destino: 't2',
    nome: 'Bifurcação ➔ Tanque 2 (T2)',
    distanciaKm: 0.04,
    diametroMm: 300,
    tubulacao: 'PEAD PN10 De 315mm',
    tipo: 'alimentacao_tanque',
    pontos: [
      [-21.045213629598635, -48.260273515507265],
      [-21.044852715210126, -48.260317960320975]
    ]
  },

  // 2. Carregamento Usina T1 e T2 (Imagem 4: T2 -> T1 -> Doca Carregamento)
  {
    id: 't2-t1',
    origem: 't2',
    destino: 't1',
    nome: 'Carregamento B ⇄ Carregamento A',
    distanciaKm: 0.06,
    diametroMm: 300,
    tubulacao: 'PEAD PN10 De 315mm (Interligação T2-T1)',
    tipo: 'adutora',
    pontos: [
      [-21.044852715210126, -48.260317960320975],
      [-21.04508601802594, -48.260840316946286]
    ]
  },
  {
    id: 't1-carr-usina',
    origem: 't1',
    destino: 'carr_usina',
    nome: 'Tanque 1 (T1) ➔ Carregamento Usina',
    distanciaKm: 0.09,
    diametroMm: 250,
    tubulacao: 'PEAD PN10 De 250mm',
    tipo: 'caminhao',
    pontos: [
      [-21.04508601802594, -48.260840316946286],
      [-21.044980, -48.261220],
      [-21.044694910635954, -48.26141733148316]
    ]
  },

  // 3. Fluxo T1 - T2 - T3 (Imagem 5: Traçado fiel acompanhando a estrada vicinal)
  {
    id: 't1-eucalipto',
    origem: 't1',
    destino: 'eucalipto',
    nome: 'Carregamento Usina ➔ Eucalipto Cheiroso (T3)',
    distanciaKm: 1.95,
    diametroMm: 300,
    tubulacao: 'PEAD PN10 De 315mm',
    tipo: 'adutora',
    pontos: [
      [-21.04508601802594, -48.260840316946286],
      [-21.045230, -48.261100],
      [-21.045950, -48.266200],
      [-21.046750, -48.271800],
      [-21.047350, -48.275800],
      [-21.047580, -48.276900],
      [-21.048050, -48.278200],
      [-21.048171179817402, -48.27849805552853]
    ]
  },

  // 4. Eucalipto Cheiroso (T3) ➔ Castanha (T4)
  {
    id: 'eucalipto-castanha',
    origem: 'eucalipto',
    destino: 'castanha',
    nome: 'Eucalipto Cheiroso (T3) ➔ Castanha (T4)',
    distanciaKm: 4.26,
    diametroMm: 300,
    tubulacao: 'PEAD PN10 De 315mm',
    tipo: 'adutora',
    pontos: [
      [-21.048171179817402, -48.27849805552853],
      [-21.080929846011003, -48.30075955155999]
    ]
  },

  // 5. Carregamento Castanha (Imagem 2: Saída direta de T4 Castanha)
  {
    id: 't4-carr-castanha',
    origem: 'castanha',
    destino: 'carr_castanha',
    nome: 'Castanha (T4) ➔ Carregamento Castanha',
    distanciaKm: 0.30,
    diametroMm: 250,
    tubulacao: 'PEAD PN10 De 250mm',
    tipo: 'caminhao',
    pontos: [
      [-21.080536, -48.300914],
      [-21.07840906172092, -48.300072451861894]
    ]
  },

  // 6. Castanha (T4) ➔ Santa Theresinha (T5)
  {
    id: 'castanha-theresinha',
    origem: 'castanha',
    destino: 'theresinha',
    nome: 'Castanha (T4) ➔ Santa Theresinha (T5)',
    distanciaKm: 6.10,
    diametroMm: 250,
    tubulacao: 'PEAD PN10 De 280mm',
    tipo: 'adutora',
    pontos: [
      [-21.080929846011003, -48.30075955155999],
      [-21.104326364035728, -48.35321793859342]
    ]
  },

  // 7. Carregamento Santa Theresinha (Imagem 1: Somente de T5 ao Carregamento Santa Theresinha)
  {
    id: 'theresinha-carr-theresinha',
    origem: 'theresinha',
    destino: 'carr_theresinha',
    nome: 'Santa Theresinha (T5) ➔ Carregamento Santa Theresinha',
    distanciaKm: 0.52,
    diametroMm: 250,
    tubulacao: 'PEAD PN10 De 250mm',
    tipo: 'caminhao',
    pontos: [
      [-21.104326364035728, -48.35321793859342],
      [-21.099731418780465, -48.35205904510835]
    ]
  }
];

// ─── Controle Individual de Fluxo por Trecho ─────────────────────────────────
// ─── Controle Individual e Inteligente de Fluxo ──────────────────────────────
export function _gerarHTMLStatusTrecho(trechoId) {
  const est = _estadoTrechos[trechoId] || { ativo: true, sentido: 'direto', vazao: 120 };
  const trecho = TRECHOS_ADUTORA.find(t => t.id === trechoId);
  const isCaminhao = trecho?.tipo === 'caminhao';
  const isIndustria = trecho?.tipo === 'industria';

  if (!est.ativo) {
    return `<span class="inline-flex items-center gap-1.5 font-bold font-mono text-xs text-slate-400">
      <span class="w-2 h-2 rounded-full bg-slate-500"></span>
      ${isCaminhao ? 'Stand-by (Vazio)' : 'Inativo / Stand-by'}
    </span>`;
  }

  if (isIndustria) {
    return `<span class="inline-flex items-center gap-1.5 font-bold font-mono text-xs text-red-400">
      <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
      Contínuo 24h (~${est.vazao || 250} m³/h)
    </span>`;
  }

  if (isCaminhao) {
    return `<span class="inline-flex items-center gap-1.5 font-bold font-mono text-xs text-orange-400">
      <span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
      Abastecendo Caminhão (~${est.vazao || 180} m³/h)
    </span>`;
  }

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

export function _aplicarEstadoTrecho(trechoId, { ativo = true, sentido = 'direto', vazao = 120 }) {
  if (!_estadoTrechos[trechoId]) {
    _estadoTrechos[trechoId] = { ativo: true, sentido: 'direto', vazao: 120 };
  }
  _estadoTrechos[trechoId].ativo = ativo;
  _estadoTrechos[trechoId].sentido = sentido;
  _estadoTrechos[trechoId].vazao = vazao;

  const trecho = TRECHOS_ADUTORA.find(t => t.id === trechoId);
  const p = _pipeLines[trechoId];
  if (!p || !p.flowLine) return;

  const isIndustria = trecho?.tipo === 'industria';
  const isCaminhao = trecho?.tipo === 'caminhao';
  const isReverso = sentido === 'reverso';

  let animClass = 'adutora-anim-flow';
  let corLinha = '#06b6d4';
  let pesoLinha = 3.5;
  let opacidade = 0.95;

  if (!ativo) {
    animClass = '';
    corLinha = '#334155';
    pesoLinha = 2.0;
    opacidade = 0.45;
  } else if (isIndustria) {
    animClass = 'adutora-anim-flow-industria';
    corLinha = '#ef4444';
    pesoLinha = 4.5;
  } else if (isCaminhao) {
    animClass = 'adutora-anim-flow-caminhao';
    corLinha = '#f97316';
    pesoLinha = 4.0;
  } else if (isReverso) {
    animClass = 'adutora-anim-flow-reverse';
    corLinha = '#f59e0b';
    pesoLinha = 4.5;
  }

  // Atualiza visual da linha no Leaflet
  if (p.flowLine._path) {
    p.flowLine._path.classList.remove('adutora-anim-flow', 'adutora-anim-flow-reverse', 'adutora-anim-flow-industria', 'adutora-anim-flow-caminhao');
    if (animClass) p.flowLine._path.classList.add(animClass);
  }
  p.flowLine.setStyle({ color: corLinha, weight: pesoLinha, opacity: opacidade });

  // Atualiza badge no card do trecho
  const badgeEl = document.getElementById(`pipe-flow-${trechoId}`);
  if (badgeEl) {
    badgeEl.innerHTML = _gerarHTMLStatusTrecho(trechoId);
  }

  // Atualiza borda do card
  const cardEl = document.getElementById(`card-trecho-${trechoId}`);
  if (cardEl) {
    cardEl.classList.remove('border-amber-500/60', 'border-red-500/60', 'border-orange-500/60');
    if (ativo) {
      if (isIndustria) cardEl.classList.add('border-red-500/60');
      else if (isCaminhao) cardEl.classList.add('border-orange-500/60');
      else if (isReverso) cardEl.classList.add('border-amber-500/60');
    }
  }

  // Atualiza popup se aberto
  const popupStatusEl = document.getElementById(`popup-status-${trechoId}`);
  if (popupStatusEl) {
    popupStatusEl.innerHTML = _gerarHTMLStatusTrecho(trechoId);
  }
}

export function _aplicarSentidoTrecho(trechoId, sentido) {
  const est = _estadoTrechos[trechoId] || { ativo: true, sentido: 'direto', vazao: 120 };
  _aplicarEstadoTrecho(trechoId, { ...est, sentido, ativo: true });
}

export function _inverterFluxoTrecho(trechoId) {
  const est = _estadoTrechos[trechoId] || { ativo: true, sentido: 'direto', vazao: 120 };
  const novoSentido = (est.sentido === 'reverso') ? 'direto' : 'reverso';
  _aplicarSentidoTrecho(trechoId, novoSentido);
}

export function _alternarAtivoTrecho(trechoId) {
  const est = _estadoTrechos[trechoId] || { ativo: true, sentido: 'direto', vazao: 120 };
  _aplicarEstadoTrecho(trechoId, { ...est, ativo: !est.ativo });
}

// ─── Motor de Regras Inteligente Orientado por Dados das Lagoas ──────────────
export function _processarRegrasFluxoInteligente() {
  if (_modoOperacaoFluxo !== 'auto') return;

  const estado = getEstadoLagoas();
  const e1 = estado[1] || {};
  const e2 = estado[2] || {};
  const e3 = estado[3] || {};
  const e4 = estado[4] || {};
  const e5 = estado[5] || {};

  const t1Enchendo = e1.tendencia === 'subindo';
  const t1Esvaziando = e1.tendencia === 'descendo';
  const t2Enchendo = e2.tendencia === 'subindo';
  const t2Esvaziando = e2.tendencia === 'descendo';
  const t3Estavel = e3.tendencia === 'estavel' || e3.tendencia === 'offline';
  const t4Enchendo = e4.tendencia === 'subindo';
  const t4Esvaziando = e4.tendencia === 'descendo';
  const t5Enchendo = e5.tendencia === 'subindo';
  const t5Esvaziando = e5.tendencia === 'descendo';
  const t5CheioOuEstavel = (e5.percent >= 80) || (e5.tendencia === 'estavel');

  // 1. Adutora Principal Indústria -> Bifurcação (24h contínua sem parar)
  _aplicarEstadoTrecho('industria-bifurcacao', { ativo: true, sentido: 'direto', vazao: 250 });

  // 2. Bifurcação para Tanque 1 e Tanque 2
  if (t1Enchendo && t2Enchendo) {
    _aplicarEstadoTrecho('bifurcacao-t1', { ativo: true, sentido: 'direto', vazao: 125 });
    _aplicarEstadoTrecho('bifurcacao-t2', { ativo: true, sentido: 'direto', vazao: 125 });
  } else if (t1Enchendo && !t2Enchendo) {
    _aplicarEstadoTrecho('bifurcacao-t1', { ativo: true, sentido: 'direto', vazao: 250 });
    _aplicarEstadoTrecho('bifurcacao-t2', { ativo: false, sentido: 'direto', vazao: 0 });
  } else if (t2Enchendo && !t1Enchendo) {
    _aplicarEstadoTrecho('bifurcacao-t1', { ativo: false, sentido: 'direto', vazao: 0 });
    _aplicarEstadoTrecho('bifurcacao-t2', { ativo: true, sentido: 'direto', vazao: 250 });
  } else {
    _aplicarEstadoTrecho('bifurcacao-t1', { ativo: true, sentido: 'direto', vazao: 125 });
    _aplicarEstadoTrecho('bifurcacao-t2', { ativo: true, sentido: 'direto', vazao: 125 });
  }

  // 3. Carregamento Usina (Doca de Caminhões T1 / T2 - Imagem 4)
  // Regra: Se Eucalipto Cheiroso (T3) estável E (T1 esvaziando OU T2 esvaziando)
  const carrUsinaAtivo = t3Estavel && (t1Esvaziando || t2Esvaziando);
  _aplicarEstadoTrecho('t1-carr-usina', { ativo: carrUsinaAtivo, sentido: 'direto', vazao: carrUsinaAtivo ? 180 : 0 });
  _atualizarMarcadorCaminhao('carr_usina', carrUsinaAtivo);

  // 4. Adutora T1 ➔ Eucalipto Cheiroso (T3) - Imagem 5
  if (e3.tendencia === 'subindo' && (t1Esvaziando || t2Esvaziando)) {
    _aplicarEstadoTrecho('t1-eucalipto', { ativo: true, sentido: 'direto', vazao: 150 });
  } else if (t3Estavel && !t1Esvaziando && !t2Esvaziando) {
    _aplicarEstadoTrecho('t1-eucalipto', { ativo: false, sentido: 'direto', vazao: 0 });
  }

  // 5. Adutora Eucalipto (T3) ➔ Castanha (T4)
  if (t4Enchendo && e3.tendencia === 'descendo') {
    _aplicarEstadoTrecho('eucalipto-castanha', { ativo: true, sentido: 'direto', vazao: 150 });
  } else if (t4Enchendo) {
    _aplicarEstadoTrecho('eucalipto-castanha', { ativo: true, sentido: 'direto', vazao: 120 });
  }

  // 6. Carregamento Castanha (Imagem 2: Doca T4)
  // Ativa quando a Lagoa Castanha (T4) está esvaziando para os caminhões
  const carrCastanhaAtivo = t4Esvaziando;
  _aplicarEstadoTrecho('t4-carr-castanha', { ativo: carrCastanhaAtivo, sentido: 'direto', vazao: carrCastanhaAtivo ? 180 : 0 });
  _atualizarMarcadorCaminhao('carr_castanha', carrCastanhaAtivo);

  // 7. Adutora Castanha ➔ Santa Theresinha (T5)
  if (t5Enchendo && t4Esvaziando) {
    _aplicarEstadoTrecho('castanha-theresinha', { ativo: true, sentido: 'direto', vazao: 140 });
  }

  // 8. Carregamento Santa Theresinha (Imagem 1: Somente de T5 ao Carregamento Santa Theresinha)
  // Ativa quando o reservatório T5 está esvaziando para caminhões
  const carrTheresinhaAtivo = t5Esvaziando;
  _aplicarEstadoTrecho('theresinha-carr-theresinha', { ativo: carrTheresinhaAtivo, sentido: 'direto', vazao: carrTheresinhaAtivo ? 180 : 0 });
  _atualizarMarcadorCaminhao('carr_theresinha', carrTheresinhaAtivo);
}

export function _alternarModoOperacaoFluxo(modo) {
  _modoOperacaoFluxo = modo;
  const btnAuto = document.getElementById('btn-flow-mode-auto');
  const btnManual = document.getElementById('btn-flow-mode-manual');
  const indModo = document.getElementById('map-mode-indicator');

  if (modo === 'auto') {
    if (btnAuto) btnAuto.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-600 text-white transition flex items-center gap-1 shadow cursor-pointer';
    if (btnManual) btnManual.className = 'px-2.5 py-1 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-1 cursor-pointer';
    if (indModo) indModo.innerHTML = '🤖 AUTOMÁTICO';
    _processarRegrasFluxoInteligente();
  } else {
    if (btnAuto) btnAuto.className = 'px-2.5 py-1 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-1 cursor-pointer';
    if (btnManual) btnManual.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 text-white transition flex items-center gap-1 shadow cursor-pointer';
    if (indModo) indModo.innerHTML = '🛠️ MANUAL (SCADA)';
  }
}

export function _atualizarMarcadorCaminhao(chave, ativo) {
  const marker = _markers[chave];
  const ponto = PONTOS_ADUTORA[chave];
  if (marker && ponto) {
    marker.setIcon(_criarIconeCaminhao(ponto, ativo));
  }
}

export function _obterDadosLagoa(chave) {
  const ponto = PONTOS_ADUTORA[chave];
  if (!ponto || !ponto.lagoas || !ponto.lagoas.length) return null;

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

    <!-- Cabeçalho do Mapa (Mobile Touch-Optimized) -->
    <div class="vazao-panel rounded-2xl p-3.5 sm:p-5 shadow-lg border flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4" style="background:var(--bg-2);border-color:var(--border-1)">
      <div>
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <span class="material-symbols-outlined text-cyan-400 text-xl sm:text-2xl">route</span>
          <h3 class="text-base sm:text-xl font-extrabold" style="color:var(--text-1)">Rede de Adutoras & Fluxo</h3>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            13.76 km Total
          </span>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/20 text-red-400 border border-red-500/40 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Indústria 24h
          </span>
        </div>
        <p class="text-[11px] sm:text-xs" style="color:var(--text-3)">
          Traçado georreferenciado: Indústria, Tanques T1/T2, Docas de Caminhões, Eucalipto (T3), Castanha (T4) e Theresinha (T5)
        </p>
      </div>

      <!-- Filtros e Controles Operacionais do Mapa -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full flex-nowrap sm:flex-wrap" style="scrollbar-width:none;-webkit-overflow-scrolling:touch;">
        <!-- Seletor Modo Operacional Inteligente -->
        <div class="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-700 mr-1 shadow-inner">
          <button id="btn-flow-mode-auto" type="button" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-600 text-white transition flex items-center gap-1 shadow cursor-pointer" title="Fluxo automatizado conforme a dinâmica dos sensores">
            <span class="material-symbols-outlined text-xs">smart_toy</span> Auto
          </button>
          <button id="btn-flow-mode-manual" type="button" class="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer" title="Modo manual: clique nas linhas ou docas para ligar/desligar">
            <span class="material-symbols-outlined text-xs">tune</span> Manual
          </button>
        </div>

        <button id="btn-map-fit-all" class="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1 shadow cursor-pointer whitespace-nowrap">
          <span class="material-symbols-outlined text-xs">zoom_out_map</span> Linha Completa
        </button>
        <button id="btn-map-focus-usina" class="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap" style="background:var(--bg-3);color:var(--text-1);border:1px solid var(--border-1)" title="Focar na Indústria, Carregamento A/B e Doca Usina">
          Pátio Usina
        </button>
        <button id="btn-map-focus-castanha" class="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-900/30 hover:bg-purple-800/50 text-purple-300 border border-purple-500/40 transition cursor-pointer whitespace-nowrap">
          Castanha
        </button>
        <button id="btn-map-focus-carr-castanha" class="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold bg-orange-900/30 hover:bg-orange-800/50 text-orange-300 border border-orange-500/40 transition cursor-pointer whitespace-nowrap" title="Focar na Doca de Caminhões Castanha (T4)">
          Doca Castanha
        </button>
        <button id="btn-map-focus-carr-theresinha" class="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold bg-pink-900/30 hover:bg-pink-800/50 text-pink-300 border border-pink-500/40 transition cursor-pointer whitespace-nowrap" title="Focar na Doca de Caminhões Santa Theresinha (T5)">
          Doca St. Theresinha
        </button>
        <button id="btn-map-toggle-layer" class="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer whitespace-nowrap" style="background:var(--bg-3);color:var(--text-1);border:1px solid var(--border-1)">
          <span class="material-symbols-outlined text-xs text-cyan-400">layers</span> <span id="lbl-layer-mode">Satélite</span>
        </button>
      </div>
    </div>

    <!-- Container do Mapa Leaflet -->
    <div class="adutoras-map-container">
      <div id="adutoras-leaflet-map"></div>

      <!-- Botão Flutuante de Gota 💧 (Abre / Fecha a janela de telemetria) -->
      <button id="btn-toggle-telemetry-overlay" class="map-toggle-droplet-btn" title="Exibir / Ocultar Telemetria da Rede de Campo">
        💧
      </button>

      <!-- Overlay Flutuante com Métricas do Enlace (Inicia Recolhido para Não Cobrir o Mapa) -->
      <div id="map-floating-overlay-card" class="map-floating-overlay hidden">
        <div class="map-overlay-header">
          <div class="map-overlay-title-group">
            <span class="material-symbols-outlined text-emerald-400 text-base">sensors</span>
            <span class="map-overlay-title">Rede de Campo</span>
          </div>
          <div class="flex items-center gap-2">
            <span id="map-telemetry-nodes" class="map-overlay-badge">5 Nós de Campo</span>
            <button id="btn-close-telemetry-overlay" class="map-overlay-close-btn" title="Fechar Janela">
              <span class="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </div>
        <div class="space-y-1.5">
          <div class="map-overlay-row">
            <span class="map-overlay-label">Extensão Total:</span>
            <span class="map-overlay-value text-slate-100">13.76 km</span>
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
          <div class="map-overlay-row pt-1.5 border-t border-slate-700/60">
            <span class="map-overlay-label">Controle de Fluxo:</span>
            <span id="map-mode-indicator" class="map-overlay-value text-cyan-300 font-mono text-[11px]">🤖 AUTOMÁTICO</span>
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
                10 Trechos · 13.76 km
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

        <!-- Painel de Trechos da Adutora (10 Trechos da Malha Completa) -->
        <div>
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h5 class="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-sm text-cyan-400">segment</span> Trechos Georreferenciados da Rede (10 Trechos)
            </h5>
            <span class="text-[11px] text-slate-400">Clique em qualquer trecho no mapa ou use os botões abaixo para alternar ou inverter o fluxo</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            ${TRECHOS_ADUTORA.map((t, idx) => `
              <div class="vazao-panel rounded-xl p-3.5 shadow border border-slate-700/90 relative overflow-hidden transition hover:border-cyan-500/50 bg-slate-900/80" id="card-trecho-${t.id}">
                <div class="flex items-center justify-between mb-2 pb-1 border-b border-slate-700/60">
                  <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Trecho ${idx + 1}</span>
                  <span class="map-distance-chip">
                    <span class="material-symbols-outlined text-[12px]">straighten</span> ${t.distanciaKm} km
                  </span>
                </div>
                <h4 class="text-xs font-bold text-slate-100 mb-1 leading-snug">${t.nome}</h4>
                <p class="text-[10px] text-slate-400 mb-2 truncate" title="${t.tubulacao}">${t.tubulacao}</p>
                <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                  <div class="flex flex-col">
                    <span class="text-[9px] text-slate-400 uppercase">Status:</span>
                    <span id="pipe-flow-${t.id}">
                      ${_gerarHTMLStatusTrecho(t.id)}
                    </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <button type="button" class="btn-toggle-trecho-card px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-bold cursor-pointer transition shadow" data-id="${t.id}" title="Ligar / Desligar este trecho">
                      <span class="material-symbols-outlined text-xs">power_settings_new</span>
                    </button>
                    <button type="button" class="btn-inverter-trecho-card px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 text-[11px] font-bold flex items-center gap-0.5 cursor-pointer transition shadow" data-id="${t.id}" title="Inverter sentido">
                      <span class="material-symbols-outlined text-xs">swap_horiz</span>
                    </button>
                  </div>
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
    const est = _estadoTrechos[trecho.id] || { ativo: true, sentido: 'direto', vazao: 120 };
    const isIndustria = trecho.tipo === 'industria';
    const isCaminhao = trecho.tipo === 'caminhao';
    const isReverso = est.sentido === 'reverso';

    let animClass = 'adutora-anim-flow';
    let corLinha = '#06b6d4';
    let pesoLinha = 3.5;
    let corBase = '#083344';
    let opacidade = 0.95;

    if (!est.ativo) {
      animClass = '';
      corLinha = '#334155';
      pesoLinha = 2.0;
      corBase = '#1e293b';
      opacidade = 0.45;
    } else if (isIndustria) {
      animClass = 'adutora-anim-flow-industria';
      corLinha = '#ef4444';
      pesoLinha = 4.5;
      corBase = '#450a0a';
    } else if (isCaminhao) {
      animClass = 'adutora-anim-flow-caminhao';
      corLinha = '#f97316';
      pesoLinha = 4.0;
      corBase = '#431407';
    } else if (isReverso) {
      animClass = 'adutora-anim-flow-reverse';
      corLinha = '#f59e0b';
      pesoLinha = 4.5;
    }

    // 1. Linha de base (glow exterior)
    const baseLine = L.polyline(trecho.pontos, {
      color: corBase,
      weight: 8,
      opacity: 0.7,
      lineCap: 'round',
      interactive: false
    }).addTo(_map);

    // 2. Linha interna condutora de fluido (animada)
    const flowLine = L.polyline(trecho.pontos, {
      color: corLinha,
      weight: pesoLinha,
      opacity: opacidade,
      className: animClass,
      interactive: false
    }).addTo(_map);

    // 3. HITBOX TRANSPARENTE ULTRA-PRECISA (30px de largura)
    const hitLine = L.polyline(trecho.pontos, {
      color: '#06b6d4',
      weight: 30,
      opacity: 0.0001,
      interactive: true,
      className: 'cursor-pointer'
    }).addTo(_map);

    hitLine.bindTooltip(_gerarTooltipTrechoHTML(trecho), {
      sticky: true,
      opacity: 1,
      direction: 'top',
      offset: [0, -12],
      className: 'adutora-leaflet-tooltip'
    });

    hitLine.on('mouseover', () => {
      flowLine.setStyle({ weight: pesoLinha + 2, color: isIndustria ? '#f87171' : (isCaminhao ? '#fb923c' : '#38bdf8') });
      baseLine.setStyle({ weight: 12, opacity: 0.9 });
      const cardEl = document.getElementById(`card-trecho-${trecho.id}`);
      if (cardEl) cardEl.classList.add('ring-2', 'ring-cyan-400');
    });

    hitLine.on('mouseout', () => {
      const curEst = _estadoTrechos[trecho.id] || { ativo: true, sentido: 'direto' };
      const curCor = !curEst.ativo ? '#334155' : (isIndustria ? '#ef4444' : (isCaminhao ? '#f97316' : (curEst.sentido === 'reverso' ? '#f59e0b' : '#06b6d4')));
      flowLine.setStyle({ weight: pesoLinha, color: curCor });
      baseLine.setStyle({ weight: 8, opacity: 0.7 });
      const cardEl = document.getElementById(`card-trecho-${trecho.id}`);
      if (cardEl) cardEl.classList.remove('ring-2', 'ring-cyan-400');
    });

    hitLine.on('click', (e) => {
      const midLat = (trecho.pontos[0][0] + trecho.pontos[trecho.pontos.length - 1][0]) / 2;
      const midLng = (trecho.pontos[0][1] + trecho.pontos[trecho.pontos.length - 1][1]) / 2;
      const latlng = e?.latlng || [midLat, midLng];
      _abrirPopupTrecho(trecho, latlng);
    });

    _pipeLines[trecho.id] = { baseLine, flowLine, hitLine };

    // Badge de distância no ponto médio
    if (trecho.distanciaKm >= 0.2) {
      const midLat = (trecho.pontos[0][0] + trecho.pontos[trecho.pontos.length - 1][0]) / 2;
      const midLng = (trecho.pontos[0][1] + trecho.pontos[trecho.pontos.length - 1][1]) / 2;
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
  });
}

function _criarIconeCaminhao(ponto, ativo = false) {
  const pulseHtml = ativo ? '<div class="caminhao-pulse"></div>' : '';
  const statusBadge = ativo
    ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span class="text-emerald-300">CARREGANDO</span>'
    : '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span><span class="text-slate-400">STAND-BY</span>';

  return L.divIcon({
    className: 'caminhao-map-marker',
    html: `
      <div class="caminhao-marker-badge badge-ponto-${ponto.chave}" title="${ponto.nome} — Doca de Abastecimento">
        <div class="caminhao-marker-icon">
          ${pulseHtml}
          <span class="material-symbols-outlined" style="font-size:22px;color:#fff;">local_shipping</span>
        </div>
        <div class="caminhao-marker-label">
          ${statusBadge}
        </div>
      </div>
    `,
    iconSize: [54, 64],
    iconAnchor: [27, 32]
  });
}

function _criarIconeIndustria(ponto) {
  return L.divIcon({
    className: 'lagoa-map-marker',
    html: `
      <div class="lagoa-marker-badge badge-ponto-${ponto.chave}" title="${ponto.nome} — Geração 24h">
        <div class="lagoa-marker-icon" style="background:#ef4444;border-color:#fca5a5;">
          <div class="lagoa-pulse" style="background:#ef4444;"></div>
          <span class="material-symbols-outlined" style="font-size:22px;color:#fff;">factory</span>
        </div>
        <div class="lagoa-marker-label" style="border-color:#f87171;">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>MOAGEM 24H</span>
        </div>
      </div>
    `,
    iconSize: [60, 70],
    iconAnchor: [30, 35]
  });
}

function _criarMarcadoresLagoas() {
  const estado = getEstadoLagoas();

  Object.values(PONTOS_ADUTORA).forEach(ponto => {
    let customIcon;
    if (ponto.tipo === 'caminhao') {
      let isAtivo = false;
      if (ponto.chave === 'carr_usina') {
        isAtivo = !!_estadoTrechos['t1-carr-usina']?.ativo;
      } else if (ponto.chave === 'carr_castanha') {
        isAtivo = !!_estadoTrechos['t4-carr-castanha']?.ativo;
      } else if (ponto.chave === 'carr_theresinha') {
        isAtivo = !!_estadoTrechos['theresinha-carr-theresinha']?.ativo;
      }
      customIcon = _criarIconeCaminhao(ponto, isAtivo);
    } else if (ponto.tipo === 'industria') {
      customIcon = _criarIconeIndustria(ponto);
    } else {
      customIcon = _criarIconePonto(ponto, estado);
    }

    const marker = L.marker([ponto.lat, ponto.lng], { icon: customIcon }).addTo(_map);

    const htmlTooltip = _gerarHTMLTooltipPonto(ponto);
    marker.bindTooltip(htmlTooltip, {
      opacity: 1,
      direction: 'top',
      offset: [0, -35],
      className: 'adutora-leaflet-tooltip'
    });

    marker.on('mouseover', () => {
      marker.setTooltipContent(_gerarHTMLTooltipPonto(ponto));
      marker.openTooltip();
    });

    marker.on('mouseout', () => {
      marker.closeTooltip();
    });

    marker.on('click', () => {
      _abrirPopupPonto(marker, ponto);
    });

    _markers[ponto.chave] = marker;
  });
}

function _criarIconePonto(ponto, estado) {
  let online = false;
  let percentual = '--';

  if (ponto.lagoas && ponto.lagoas.length) {
    ponto.lagoas.forEach(id => {
      const e = estado[id];
      if (e) {
        if (e.online && !e.isStale) online = true;
        if (e.percent > 0) percentual = `${e.percent.toFixed(0)}%`;
      }
    });
  }

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
  if (ponto.tipo === 'caminhao') {
    let isAtivo = false;
    let fontes = '';
    if (ponto.chave === 'carr_usina') {
      isAtivo = !!_estadoTrechos['t1-carr-usina']?.ativo;
      fontes = 'Alimentado por Tanque 1 (T1) / Tanque 2 (T2)';
    } else if (ponto.chave === 'carr_castanha') {
      isAtivo = !!_estadoTrechos['t4-carr-castanha']?.ativo;
      fontes = 'Alimentado pela Lagoa Castanha (T4)';
    } else if (ponto.chave === 'carr_theresinha') {
      isAtivo = !!_estadoTrechos['theresinha-carr-theresinha']?.ativo;
      fontes = 'Alimentado pela Lagoa Santa Theresinha (T5)';
    }
    const vazao = isAtivo ? '~180 m³/h' : '0 m³/h';
    const statusTxt = isAtivo ? 'Carregamento Ativo' : 'Em Stand-by';

    return `
      <div class="adutora-hover-card p-3" style="min-width: 250px;">
        <div class="flex items-center justify-between pb-1.5 mb-2 border-b border-orange-500/40">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-orange-400 text-base">local_shipping</span>
            <strong class="text-white text-xs font-bold">${ponto.nome}</strong>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${isAtivo ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'}">
            ${isAtivo ? 'ATIVO' : 'STAND-BY'}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-1.5 text-xs mb-2">
          <div class="bg-slate-950/80 p-2 rounded border border-slate-700/60">
            <span class="text-[9px] text-slate-400 block uppercase font-semibold">Operação</span>
            <strong class="${isAtivo ? 'text-emerald-400' : 'text-slate-300'} text-xs font-mono">${statusTxt}</strong>
          </div>
          <div class="bg-slate-950/80 p-2 rounded border border-slate-700/60">
            <span class="text-[9px] text-slate-400 block uppercase font-semibold">Vazão Doca</span>
            <strong class="text-orange-300 text-xs font-mono">${vazao}</strong>
          </div>
        </div>
        <div class="p-2 bg-slate-950/80 rounded border border-slate-800 text-[10px] text-slate-300 mb-1">
          <span class="text-slate-400 block font-semibold uppercase text-[9px]">Interligação:</span>
          ${fontes}
        </div>
        <div class="pt-1 text-[9px] text-orange-400 text-right">Clique para ver detalhes</div>
      </div>
    `;
  }

  if (ponto.tipo === 'industria') {
    return `
      <div class="adutora-hover-card p-3" style="min-width: 260px;">
        <div class="flex items-center justify-between pb-1.5 mb-2 border-b border-red-500/40">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-red-400 text-base">factory</span>
            <strong class="text-white text-xs font-bold">${ponto.nome}</strong>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/40">
            24H CONTÍNUA
          </span>
        </div>
        <div class="grid grid-cols-2 gap-1.5 text-xs mb-2">
          <div class="bg-slate-950/80 p-2 rounded border border-slate-700/60">
            <span class="text-[9px] text-slate-400 block uppercase font-semibold">Geração</span>
            <strong class="text-red-400 text-xs font-mono">Vinhaça In Natura</strong>
          </div>
          <div class="bg-slate-950/80 p-2 rounded border border-slate-700/60">
            <span class="text-[9px] text-slate-400 block uppercase font-semibold">Vazão Média</span>
            <strong class="text-amber-300 text-xs font-mono">~250 m³/h</strong>
          </div>
        </div>
        <div class="p-2 bg-slate-950/80 rounded border border-slate-800 text-[10px] text-slate-300 mb-1">
          <span class="text-slate-400 block font-semibold uppercase text-[9px]">Destino da Adutora:</span>
          Bifurcação ➔ Tanque 1 (T1) & Tanque 2 (T2)
        </div>
        <div class="pt-1 text-[9px] text-red-400 text-right">Telemetria de Geração Ativa</div>
      </div>
    `;
  }

  const estado = getEstadoLagoas();
  let lagoasHtml = '';

  if (ponto.lagoas && ponto.lagoas.length) {
    ponto.lagoas.forEach(id => {
      const cfg = LAGOA_CONFIG[id];
      const e = estado[id] || {};
      const online = e.online && !e.isStale;
      const volM3 = e.volume ? (e.volume / 1000).toFixed(0) : '--';
      
      const rawNivel = e.nivelCm != null ? e.nivelCm : (e.nivel != null ? e.nivel : e.ultimaLeitura?.nivel);
      const nivel = rawNivel != null && !isNaN(rawNivel) ? `${parseFloat(rawNivel).toFixed(1)} cm` : '--';

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
  }

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

  // Foco Pátio Usina (englobando Indústria, T1, T2 e Doca Usina)
  document.getElementById('btn-map-focus-usina')?.addEventListener('click', () => {
    if (_map) {
      _map.flyTo([-21.0465, -48.2610], 16, { duration: 1.2 });
    }
  });

  // Foco Lagoa Castanha (T4)
  document.getElementById('btn-map-focus-castanha')?.addEventListener('click', () => {
    if (_map) _map.flyTo([PONTOS_ADUTORA.castanha.lat, PONTOS_ADUTORA.castanha.lng], 15, { duration: 1.2 });
  });

  // Foco Doca de Carregamento de Caminhões Castanha (T4)
  document.getElementById('btn-map-focus-carr-castanha')?.addEventListener('click', () => {
    if (_map && PONTOS_ADUTORA.carr_castanha) {
      _map.flyTo([PONTOS_ADUTORA.carr_castanha.lat, PONTOS_ADUTORA.carr_castanha.lng], 16, { duration: 1.2 });
    }
  });

  // Foco Doca de Carregamento de Caminhões Santa Theresinha (T5)
  document.getElementById('btn-map-focus-carr-theresinha')?.addEventListener('click', () => {
    if (_map && PONTOS_ADUTORA.carr_theresinha) {
      _map.flyTo([PONTOS_ADUTORA.carr_theresinha.lat, PONTOS_ADUTORA.carr_theresinha.lng], 16, { duration: 1.2 });
    }
  });

  // Botão Flutuante de Gota 💧 (Abre / Fecha Janela de Telemetria)
  const btnGota = document.getElementById('btn-toggle-telemetry-overlay');
  const cardOverlay = document.getElementById('map-floating-overlay-card');

  btnGota?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!cardOverlay) return;
    const isHidden = cardOverlay.classList.contains('hidden');
    if (isHidden) {
      cardOverlay.classList.remove('hidden');
      btnGota.classList.add('active');
    } else {
      cardOverlay.classList.add('hidden');
      btnGota.classList.remove('active');
    }
  });

  // Botão Fechar dentro da janela de telemetria
  document.getElementById('btn-close-telemetry-overlay')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (cardOverlay) cardOverlay.classList.add('hidden');
    if (btnGota) btnGota.classList.remove('active');
  });

  // Modos de Fluxo Inteligente: Automático (IA & Dados) vs Manual (SCADA)
  document.getElementById('btn-flow-mode-auto')?.addEventListener('click', () => {
    _alternarModoOperacaoFluxo('auto');
  });

  document.getElementById('btn-flow-mode-manual')?.addEventListener('click', () => {
    _alternarModoOperacaoFluxo('manual');
  });

  // Alternador de Camada Satélite / Dark
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

  // Botões de ligar/desligar fluxo individual nos cards de trechos
  document.querySelectorAll('.btn-toggle-trecho-card').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trechoId = btn.getAttribute('data-id');
      if (trechoId) {
        if (_modoOperacaoFluxo === 'auto') {
          _alternarModoOperacaoFluxo('manual');
        }
        _alternarAtivoTrecho(trechoId);
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
      if (ponto.tipo === 'caminhao') {
        let isAtivo = false;
        if (ponto.chave === 'carr_usina') {
          isAtivo = !!_estadoTrechos['t1-carr-usina']?.ativo;
        } else if (ponto.chave === 'carr_castanha') {
          isAtivo = !!_estadoTrechos['t4-carr-castanha']?.ativo;
        } else if (ponto.chave === 'carr_theresinha') {
          isAtivo = !!_estadoTrechos['theresinha-carr-theresinha']?.ativo;
        }
        marker.setIcon(_criarIconeCaminhao(ponto, isAtivo));
      } else if (ponto.tipo === 'industria') {
        marker.setIcon(_criarIconeIndustria(ponto));
      } else {
        marker.setIcon(_criarIconePonto(ponto, estado));
      }
      if (typeof marker.setTooltipContent === 'function') {
        marker.setTooltipContent(_gerarHTMLTooltipPonto(ponto));
      }
    }
  });

  // 2. Processa regras inteligentes de fluxo dinamicamente
  _processarRegrasFluxoInteligente();

  // 3. Calcula total armazenado na adutora
  let totalM3 = 0;
  Object.values(estado).forEach(e => {
    if (e?.volume > 0) totalM3 += e.volume / 1000;
  });
  const storedEl = document.getElementById('map-total-stored');
  if (storedEl) storedEl.textContent = `${totalM3.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m³`;

  // 4. Status dinâmico dos nós
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
