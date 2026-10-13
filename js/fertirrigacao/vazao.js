// ============================================================================
// ferti_vazao.js — Aba "Vazão e Acumulado" + Card Resumo (Níveis Atuais)
// ============================================================================
//
// ── REGRAS DE NEGÓCIO (definitivas) ─────────────────────────────────────────
//
//  Volume Total Armazenado  = snapshot atual: soma dos volumes de TODAS as lagoas
//
//  Acumulado Total no Sistema = soma cumulativa de TUDO que entrou nas lagoas
//                              (rastreado via deltas positivos entre leituras).
//                              Persiste em localStorage entre sessões.
//                              Na 1ª sessão, baseia-se no volume atual como ponto
//                              de partida (baseline).
//
//  Volume Acumulado de Saída = Acumulado Total − Volume Atual
//                              (nunca negativo — é o que foi aplicado no campo)
//
//  Meta de Safra (m³)        = volume de Saída esperado na safra.
//                              Progresso = (Saída m³ / Meta m³) × 100%.
//
// ── FIX: IDs duplicados ──────────────────────────────────────────────────────
//  Ambas as abas usam CLASSES semânticas (.ferti-vol-xxx) em vez de IDs únicos.
//  _renderAcumulados() usa querySelectorAll('.ferti-vol-xxx') para atualizar
//  TODOS os elementos com aquela classe de uma vez (Níveis Atuais + Vazão).
//
// ============================================================================

import { LAGOA_CONFIG } from './firebase.js';
import { getEstadoLagoas, getTanqueConfig } from './lagoas.js';
import { obterHistoricoTodosTanques } from './fertirrigacaomonit.js';
import { calcularVolumeTronco } from './regras.js';
import { definirTaxasHistoricas } from './insights.js';

// ── Estado interno ───────────────────────────────────────────────────────────
let _totalVolumeIn   = 0;   // snapshot atual (soma dos tanques)
let _prevVolumes     = {};  // { [id]: volumeL } — leitura anterior por lagoa
let _historicoVazao  = {};  // { [id]: [{ts, volumeL}] } — para cálculo de vazão
let _baselineSet     = {};  // { [id]: bool } — 1ª leitura define baseline, não soma

// ── Persistência em localStorage ─────────────────────────────────────────────
const KEY_ENTRADA = 'agro_acum_entrada_v1';
const KEY_META    = 'agro_safra_meta_m3_v1';

const _loadEntrada  = () => { try { return parseFloat(localStorage.getItem(KEY_ENTRADA) || '0') || 0; } catch { return 0; } };
const _saveEntrada  = v  => { try { localStorage.setItem(KEY_ENTRADA, String(v)); }          catch {} };
const _loadMeta     = () => { try { return parseFloat(localStorage.getItem(KEY_META)    || '15000') || 15000; } catch { return 15000; } };
const _saveMeta     = v  => { try { localStorage.setItem(KEY_META,    String(v)); }          catch {} };

let _acumuladoEntrada = _loadEntrada(); // carrega ao importar módulo

// ─── HTML: card resumo na aba Níveis Atuais ───────────────────────────────────
export function getSummaryCardHTML() {
  return `
  <div id="summary-card" class="zoom-hover-card lagoa-card-base rounded-xl shadow-lg relative overflow-hidden border">
    <div id="summary-alert-glow" class="absolute inset-0 rounded-xl blur-2xl transition-opacity duration-500 animate-pulse opacity-0 pointer-events-none"></div>
    <div class="h-full flex flex-col justify-between space-y-4 p-5 relative z-10">

      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="material-symbols-outlined text-cyan-400 text-lg">water_full</span>
          <h3 class="text-sm font-bold" style="color:var(--text-1)">Volume Total Armazenado</h3>
        </div>
        <p class="text-2xl font-bold text-cyan-400">
          <span class="ferti-vol-atual-litros">0</span> L
        </p>
        <p class="text-xs" style="color:var(--text-2)"><span class="ferti-vol-atual-m3">(0.00 m³)</span></p>
        <p class="text-xs mt-0.5" style="color:var(--text-3)">Snapshot atual — soma das 5 lagoas</p>
      </div>

      <div class="border-t" style="border-color:var(--border-1)"></div>

      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="material-symbols-outlined text-purple-400 text-lg">history</span>
          <h3 class="text-sm font-bold" style="color:var(--text-1)">Acumulado Total no Sistema</h3>
        </div>
        <p class="text-xl font-bold text-purple-400">
          <span class="ferti-vol-acum-litros">0</span> L
        </p>
        <p class="text-xs" style="color:var(--text-2)"><span class="ferti-vol-acum-m3">(0.00 m³)</span></p>
        <p class="text-xs mt-0.5" style="color:var(--text-3)">Tudo que passou pelas lagoas no período</p>
      </div>

      <div class="border-t" style="border-color:var(--border-1)"></div>

      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="material-symbols-outlined text-amber-400 text-lg">local_shipping</span>
          <h3 class="text-sm font-bold" style="color:var(--text-1)">Volume Acumulado de Saída</h3>
        </div>
        <p class="text-xl font-bold text-amber-400">
          <span class="ferti-vol-saida-litros">0</span> L
        </p>
        <p class="text-xs" style="color:var(--text-2)"><span class="ferti-vol-saida-m3">(0.00 m³)</span></p>
        <p class="text-xs mt-0.5" style="color:var(--text-3)">= Acumulado Total − Volume Atual</p>
      </div>

      <div class="border-t" style="border-color:var(--border-1)"></div>

      <div>
        <h3 class="text-sm font-bold mb-2" style="color:var(--text-1)">Meta de Safra (m³)</h3>
        <div class="flex items-center gap-2">
          <input type="number" class="ferti-meta-input"
                 style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1);border-radius:0.5rem;padding:0.4rem 0.6rem;width:100%;font-size:0.8rem"
                 placeholder="Meta em m³">
          <span class="ferti-meta-litros text-xs whitespace-nowrap" style="color:var(--text-3)"></span>
        </div>
        <div class="mt-2">
          <p class="ferti-meta-progress-text text-xs mb-1" style="color:var(--text-3)">Progresso: 0%</p>
          <div class="w-full rounded-full h-3 overflow-hidden" style="background:var(--bg-3);border:1px solid var(--border-1)">
            <div class="ferti-meta-bar h-3 rounded-full transition-all duration-500" style="width:0%;background-color:#f59e0b;"></div>
          </div>
          <div class="mt-1 text-xs flex justify-end" style="color:var(--text-3)">
            <span class="ferti-meta-faltando"></span>
          </div>
        </div>
      </div>

    </div>
  </div>`;
}

// ─── HTML: aba Vazão e Acumulado ───────────────────────────────────────────────
export function getVazaoHTML() {
  const rows = Object.entries(LAGOA_CONFIG).map(([id, cfg]) => `
    <tr style="transition:background 0.15s"
        onmouseenter="this.style.background='var(--bg-3)'"
        onmouseleave="this.style.background=''">
      <td class="font-semibold px-5 py-3" style="color:var(--text-1)">${cfg.name}</td>
      <td class="font-mono px-5 py-3" id="flow-1h-${id}"><span style="color:var(--text-3)">–</span></td>
      <td class="font-mono px-5 py-3" id="flow-24h-${id}"><span style="color:var(--text-3)">–</span></td>
      <td class="font-mono px-5 py-3 text-cyan-400" id="flow-season-${id}"><span style="color:var(--text-3)">–</span></td>
    </tr>`).join('');

  return `
  <div class="space-y-6">

    <!-- Insights -->
    <div id="insights-container" class="vazao-panel rounded-xl shadow-lg overflow-hidden border border-slate-700">
      <div class="p-5 border-b border-slate-700 flex items-center gap-3">
        <span class="material-symbols-outlined text-cyan-400">insights</span>
        <div>
          <h3 class="text-base font-bold" style="color:var(--text-1)">Análise Operacional em Tempo Real</h3>
          <p class="text-xs mt-0.5" style="color:var(--text-3)">Insights gerados com base nos dados dos sensores</p>
        </div>
        <div id="insights-timestamp" class="ml-auto text-xs" style="color:var(--text-3)"></div>
      </div>
      <div id="insights-lista" class="p-5 space-y-3">
        <div class="text-slate-500 text-sm flex items-center gap-2">
          <span class="material-symbols-outlined text-sm animate-spin">refresh</span>
          Aguardando dados...
        </div>
      </div>
    </div>

    <!-- Tabela de Vazão -->
    <div class="vazao-panel rounded-xl shadow-lg overflow-hidden">
      <div class="p-5 border-b border-slate-700">
        <h3 class="text-base font-bold" style="color:var(--text-1)">Vazão por Lagoa</h3>
        <p class="text-xs mt-1" style="color:var(--text-3)">Taxa de variação de volume entre leituras consecutivas.</p>
      </div>
      <div class="overflow-x-auto">
        <table id="vazao-table" class="min-w-full">
          <thead>
            <tr>
              <th class="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase">Lagoa</th>
              <th class="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase">Última Hora</th>
              <th class="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase">Últimas 24h</th>
              <th class="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase">Acumulado Safra</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-700/60 text-sm">${rows}</tbody>
        </table>
      </div>
    </div>

    <!-- Balanço de Movimentação e Transferências -->
    <div id="transfer-container" class="vazao-panel rounded-xl shadow-lg overflow-hidden border border-slate-700">
      <div class="p-5 border-b border-slate-700 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-amber-400">sync_alt</span>
          <div>
            <h3 class="text-base font-bold" style="color:var(--text-1)">Balanço de Movimentação e Transferência entre Lagoas</h3>
            <p class="text-xs mt-0.5" style="color:var(--text-3)">Rastreia transferências internas via adutoras e saídas para caminhões/aplicação</p>
          </div>
        </div>
        <button id="btn-atualizar-balanco" class="px-3 py-1 text-xs rounded-lg border border-slate-600 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition cursor-pointer">
          <span class="material-symbols-outlined text-xs">refresh</span> Atualizar Histórico
        </button>
      </div>
      <div id="transfer-lista" class="p-5 space-y-3">
        <div class="text-slate-400 text-sm flex items-center gap-2">
          <span class="material-symbols-outlined text-cyan-400">info</span>
          Calculando movimentações com base no histórico de 10 min do Firestore...
        </div>
      </div>
    </div>

    <!-- Cards de volume + meta -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

      <div class="vazao-panel rounded-xl p-6 shadow-lg space-y-5 border border-slate-700">

        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="material-symbols-outlined text-cyan-400 text-lg">water_full</span>
            <h3 class="text-base font-bold" style="color:var(--text-1)">Volume Total Armazenado</h3>
          </div>
          <p class="text-3xl font-bold text-cyan-400">
            <span class="ferti-vol-atual-litros">0</span> L
          </p>
          <p class="text-sm" style="color:var(--text-3)"><span class="ferti-vol-atual-m3">(0.00 m³)</span></p>
          <p class="text-xs text-slate-500 mt-1">Snapshot atual — soma das lagoas com sensor</p>
        </div>

        <div class="border-t border-slate-600/60 pt-4">
          <div class="flex items-center gap-2 mb-1">
            <span class="material-symbols-outlined text-purple-400 text-lg">history</span>
            <h3 class="text-base font-bold" style="color:var(--text-1)">Acumulado Total no Sistema</h3>
          </div>
          <p class="text-3xl font-bold text-purple-400">
            <span class="ferti-vol-acum-litros">0</span> L
          </p>
          <p class="text-sm" style="color:var(--text-3)"><span class="ferti-vol-acum-m3">(0.00 m³)</span></p>
          <p class="text-xs text-slate-500 mt-1">Total cumulativo que passou pelas lagoas no período</p>
        </div>

        <div class="border-t border-slate-600/60 pt-4">
          <div class="flex items-center gap-2 mb-1">
            <span class="material-symbols-outlined text-amber-400 text-lg">local_shipping</span>
            <h3 class="text-base font-bold" style="color:var(--text-1)">Volume Acumulado de Saída</h3>
          </div>
          <p class="text-3xl font-bold text-amber-400">
            <span class="ferti-vol-saida-litros">0</span> L
          </p>
          <p class="text-sm" style="color:var(--text-3)"><span class="ferti-vol-saida-m3">(0.00 m³)</span></p>
          <p class="text-xs text-slate-500 mt-1">= Acumulado Total − Volume Atual (foi aplicado no campo)</p>
        </div>

      </div>

      <div class="vazao-panel rounded-xl p-6 shadow-lg border border-slate-700">
        <div class="flex items-center gap-2 mb-4">
          <span class="material-symbols-outlined text-green-400 text-lg">flag</span>
          <h3 class="text-base font-bold" style="color:var(--text-1)">Meta de Aplicação na Safra</h3>
        </div>
        <div class="flex items-center gap-3 mb-1">
          <input type="number" class="ferti-meta-input"
                 style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1);border-radius:0.5rem;padding:0.5rem;flex:1;font-size:0.875rem"
                 placeholder="Meta em m³ (ex: 2000000)">
          <span class="ferti-meta-litros text-sm whitespace-nowrap" style="color:var(--text-3)"></span>
        </div>
        <p class="text-xs text-slate-500 mb-3">
          Progresso baseado no <strong class="text-amber-400">Volume de Saída</strong> acumulado
        </p>
        <p class="ferti-meta-progress-text text-sm font-medium mb-2" style="color:var(--text-2)">Progresso: 0%</p>
        <div class="w-full rounded-full h-5 overflow-hidden" style="background:var(--bg-3);border:1px solid var(--border-1)">
          <div class="ferti-meta-bar h-5 rounded-full transition-all duration-700 flex items-center justify-end pr-2"
               style="width:0%;background-color:#f59e0b;">
            <span class="ferti-meta-bar-label text-xs font-bold text-slate-900 hidden">0%</span>
          </div>
        </div>
        <div class="mt-3 text-xs text-slate-500 flex justify-between">
          <span>0 m³</span>
          <span class="ferti-meta-faltando"></span>
        </div>
        <button id="btn-zerar-saida"
                class="mt-5 w-full py-2 text-xs rounded-lg border transition cursor-pointer"
                style="border-color:var(--border-1);color:var(--text-3);background:var(--bg-3)"
                onclick="if(confirm('Zerar o acumulado de saída? Faça somente no início de uma nova safra.')) window.dispatchEvent(new CustomEvent('ferti:zerarSaida'))">
          <span class="material-symbols-outlined text-xs align-middle">restart_alt</span>
          Zerar acumulado (nova safra)
        </button>
      </div>
    </div>
  </div>`;
}

// ─── Atualiza acumulados a cada nova leitura FRESCA ────────────────────────────
export function atualizarAcumulados(lagoaId, novoVolumeL) {
  const agora = Date.now();
  const prev  = _prevVolumes[lagoaId];

  // Rastreia entradas cumulativas
  if (prev !== undefined && _baselineSet[lagoaId]) {
    const delta = novoVolumeL - prev;
    if (delta > 10) {
      // Volume aumentou → água entrou → soma ao acumulado histórico
      _acumuladoEntrada += delta;
      _saveEntrada(_acumuladoEntrada);
    }
    // Quedas não somam — a Saída é derivada automaticamente (Acumulado - Atual)
  }

  _prevVolumes[lagoaId] = novoVolumeL;
  _baselineSet[lagoaId] = true; // a partir da 2ª leitura rastreia deltas

  // Histórico de vazão (janela 2h)
  if (!_historicoVazao[lagoaId]) _historicoVazao[lagoaId] = [];
  _historicoVazao[lagoaId].push({ ts: agora, volumeL: novoVolumeL });
  _historicoVazao[lagoaId] = _historicoVazao[lagoaId].filter(p => agora - p.ts <= 7_200_000);

  _atualizarVazaoTabela(lagoaId);
  _recalcularEAtualizarUI();
}

// ─── Recalcula a partir do estado das lagoas (inclui dados históricos/stale) ──
export function recalcularVolumeFromEstado(estado) {
  if (!estado) return;
  let totalL = 0;
  Object.values(estado).forEach(e => { if (e?.volume > 0) totalL += e.volume; });
  if (totalL > 0) {
    _totalVolumeIn = totalL;
    // Garante baseline: acumulado nunca menor que o volume atual
    if (_acumuladoEntrada < _totalVolumeIn) {
      _acumuladoEntrada = _totalVolumeIn;
      _saveEntrada(_acumuladoEntrada);
    }
    _renderAcumulados();
    _gerarInsights(estado);
  }
}

// ─── Setup dos inputs de meta ─────────────────────────────────────────────────
export function setupMetaInput() {
  const metaSalva = _loadMeta();
  document.querySelectorAll('.ferti-meta-input').forEach(el => {
    el.value = metaSalva;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value) || 15000;
      _saveMeta(v);
      document.querySelectorAll('.ferti-meta-input').forEach(o => { if (o !== el) o.value = v; });
      _renderAcumulados();
    });
  });

  window.addEventListener('ferti:zerarSaida', () => {
    _acumuladoEntrada = _totalVolumeIn;
    _saveEntrada(_acumuladoEntrada);
    _renderAcumulados();
    console.log('[Vazao] Saída zerada para nova safra.');
  });

  const btnBalanco = document.getElementById('btn-atualizar-balanco');
  if (btnBalanco) {
    btnBalanco.onclick = () => {
      btnBalanco.classList.add('animate-pulse');
      carregarHistoricoRealVazao().finally(() => btnBalanco.classList.remove('animate-pulse'));
    };
  }

  // Carrega histórico real do Firestore ao montar a aba
  carregarHistoricoRealVazao();

  _renderAcumulados();
}

export function zerarSaida() { window.dispatchEvent(new CustomEvent('ferti:zerarSaida')); }

export function resetAcumulados() {
  _totalVolumeIn  = 0;
  _prevVolumes    = {};
  _historicoVazao = {};
  _baselineSet    = {};
  // NÃO zera _acumuladoEntrada — safra persiste entre refreshes
}

// ─── Recalcula snapshot e re-renderiza ────────────────────────────────────────
function _recalcularEAtualizarUI() {
  const estado = getEstadoLagoas();
  _totalVolumeIn = Object.values(estado).reduce((s, e) => s + (e?.volume || 0), 0);

  // Baseline protection
  if (_acumuladoEntrada < _totalVolumeIn) {
    _acumuladoEntrada = _totalVolumeIn;
    _saveEntrada(_acumuladoEntrada);
  }

  _renderAcumulados();
  _gerarInsights(estado);
}

// ─── Renderiza em TODOS os elementos com classes semânticas ──────────────────
// querySelectorAll garante que tanto a aba Níveis Atuais quanto Vazão sejam
// atualizadas com os mesmos valores (fix para o bug de IDs duplicados)
function _renderAcumulados() {
  const fmtL  = v => Math.round(v).toLocaleString('pt-BR');
  const fmtM3 = v => `(${(v / 1000).toFixed(2)} m³)`;
  const saidaL = Math.max(0, _acumuladoEntrada - _totalVolumeIn);

  const S = (sel, txt) => document.querySelectorAll(sel).forEach(el => { el.textContent = txt; });

  S('.ferti-vol-atual-litros', fmtL(_totalVolumeIn));
  S('.ferti-vol-atual-m3',     fmtM3(_totalVolumeIn));
  S('.ferti-vol-acum-litros',  fmtL(_acumuladoEntrada));
  S('.ferti-vol-acum-m3',      fmtM3(_acumuladoEntrada));
  S('.ferti-vol-saida-litros', fmtL(saidaL));
  S('.ferti-vol-saida-m3',     fmtM3(saidaL));

  // Meta
  const metaM3 = parseFloat(document.querySelector('.ferti-meta-input')?.value) || _loadMeta();
  const saidaM3 = saidaL / 1000;
  const pct  = metaM3 > 0 ? Math.min(100, (saidaM3 / metaM3) * 100) : 0;
  const faltaM3 = Math.max(0, metaM3 - saidaM3);
  const cor  = pct >= 85 ? '#22c55e' : pct >= 50 ? '#3b82f6' : '#f59e0b';

  S('.ferti-meta-litros',
    `= ${(metaM3 * 1000).toLocaleString('pt-BR')} L`);
  S('.ferti-meta-progress-text',
    `Progresso: ${pct.toFixed(1)}% (${saidaM3.toLocaleString('pt-BR',{maximumFractionDigits:0})} m³ de ${metaM3.toLocaleString('pt-BR')} m³)`);
  S('.ferti-meta-faltando',
    faltaM3 > 0 ? `Faltam ${faltaM3.toLocaleString('pt-BR',{maximumFractionDigits:0})} m³` : '✅ Meta atingida!');

  document.querySelectorAll('.ferti-meta-bar').forEach(bar => {
    bar.style.width = `${pct}%`;
    bar.style.backgroundColor = cor;
  });
  document.querySelectorAll('.ferti-meta-bar-label').forEach(lbl => {
    lbl.textContent = `${pct.toFixed(0)}%`;
    pct > 8 ? lbl.classList.remove('hidden') : lbl.classList.add('hidden');
  });

  // Glow
  const glow = document.getElementById('summary-alert-glow');
  if (glow && _totalVolumeIn > 0) {
    glow.style.backgroundColor = 'rgba(6,182,212,0.15)';
    glow.classList.remove('opacity-0');
  }
}

// ─── Tabela de Vazão ──────────────────────────────────────────────────────────
function _atualizarVazaoTabela(lagoaId) {
  const hist = _historicoVazao[lagoaId];
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };
  const acumM3 = (_prevVolumes[lagoaId] || 0) / 1000;
  set(`flow-season-${lagoaId}`, `<span class="text-cyan-400">${acumM3.toFixed(0)} m³</span>`);

  if (!hist || hist.length < 2) return;

  const agora = Date.now();
  const pts1h = hist.filter(p => agora - p.ts <= 3_600_000);
  let vazao1h = '–';
  if (pts1h.length >= 2) {
    const p0 = pts1h[0], p1 = pts1h[pts1h.length - 1];
    const dV = (p1.volumeL - p0.volumeL) / 1000;
    const dH = (p1.ts - p0.ts) / 3_600_000;
    if (dH > 0.05) {
      const q = dV / dH;
      const sinal = q > 0 ? '+' : '';
      const cor = q > 0 ? 'text-cyan-400' : (q < 0 ? 'text-amber-400' : 'text-slate-400');
      vazao1h = `<span class="${cor}">${sinal}${q.toFixed(1)} m³/h</span>`;
    }
  }

  const pts24h = hist.filter(p => agora - p.ts <= 86_400_000);
  let vazao24h = '–';
  if (pts24h.length >= 2) {
    const p0 = pts24h[0], p1 = pts24h[pts24h.length - 1];
    const dV = (p1.volumeL - p0.volumeL) / 1000;
    const sinal = dV > 0 ? '+' : '';
    const cor = dV > 0 ? 'text-cyan-400' : (dV < 0 ? 'text-amber-400' : 'text-slate-400');
    vazao24h = `<span class="${cor}">${sinal}${dV.toFixed(0)} m³</span>`;
  }

  set(`flow-1h-${lagoaId}`, vazao1h !== '–' ? vazao1h : `<span style="color:var(--text-3)">–</span>`);
  set(`flow-24h-${lagoaId}`, vazao24h !== '–' ? vazao24h : `<span style="color:var(--text-3)">–</span>`);
}

// ─── Carregamento do Histórico Real do Firestore para Vazão e Balanço ─────────
let _carregandoVazao = false;
export async function carregarHistoricoRealVazao(dataDoc) {
  if (_carregandoVazao) return;
  _carregandoVazao = true;
  try {
    const todosPontos = await obterHistoricoTodosTanques(dataDoc);
    const variacoesPorLagoa = {};

    for (const [id, cfg] of Object.entries(LAGOA_CONFIG)) {
      const pontos = todosPontos[cfg.firebaseId] || [];
      if (pontos.length > 0) {
        if (!_historicoVazao[id]) _historicoVazao[id] = [];
        const cfgT = getTanqueConfig(cfg.tanqueId);
        const hMaxCm = (cfgT.H_max || 3.0) * 100;

        pontos.forEach(p => {
          const altM = Math.max(0, (hMaxCm - p.nivel) / 100);
          const volL = calcularVolumeTronco(altM, cfgT);
          const ts = p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(p.timestamp).getTime();
          _historicoVazao[id].push({ ts, volumeL: volL, nivel: p.nivel, hora: p.hora });
        });

        _historicoVazao[id].sort((a, b) => a.ts - b.ts);
        const unique = [];
        const seen = new Set();
        for (const pt of _historicoVazao[id]) {
          const chave = Math.round(pt.ts / 60000);
          if (!seen.has(chave)) {
            seen.add(chave);
            unique.push(pt);
          }
        }
        _historicoVazao[id] = unique;

        if (_historicoVazao[id].length >= 2) {
          const pAnt = _historicoVazao[id][_historicoVazao[id].length - 2];
          const pRec = _historicoVazao[id][_historicoVazao[id].length - 1];
          const deltaVol = pRec.volumeL - pAnt.volumeL;
          variacoesPorLagoa[cfg.name] = deltaVol;

          const dtMin = Math.max(0.5, (pRec.ts - pAnt.ts) / 60000);
          if (dtMin <= 180) {
            taxasCalculadas[id] = deltaVol / dtMin;
          }
        }

        _atualizarVazaoTabela(id);
      }
    }

    definirTaxasHistoricas(taxasCalculadas);
    _gerarBalancoMovimentacao(variacoesPorLagoa);
  } catch (e) {
    console.warn('[Vazao] Erro ao carregar histórico para vazão:', e.message);
  } finally {
    _carregandoVazao = false;
  }
}

function _gerarBalancoMovimentacao(variacoes) {
  const container = document.getElementById('transfer-lista');
  if (!container) return;

  const cards = [];
  const entradas = [];
  const saidas = [];

  for (const [nome, deltaL] of Object.entries(variacoes)) {
    const deltaM3 = deltaL / 1000;
    if (deltaM3 > 2) {
      entradas.push({ nome, deltaM3 });
    } else if (deltaM3 < -2) {
      saidas.push({ nome, deltaM3: Math.abs(deltaM3) });
    }
  }

  if (saidas.length > 0 && entradas.length > 0) {
    saidas.forEach(s => {
      entradas.forEach(e => {
        const razao = Math.min(s.deltaM3, e.deltaM3) / Math.max(s.deltaM3, e.deltaM3);
        if (razao >= 0.65) {
          const volTransf = Math.round((s.deltaM3 + e.deltaM3) / 2);
          cards.push({
            tipo: 'transferencia',
            icone: 'sync_alt',
            titulo: `Transferência: ${s.nome} ➔ ${e.nome}`,
            texto: `Bombeamento de aprox. <strong>${volTransf} m³</strong> entre reservatórios (${s.nome} esvaziou ${s.deltaM3.toFixed(1)} m³ e ${e.nome} recebeu ${e.deltaM3.toFixed(1)} m³).`
          });
        }
      });
    });
  }

  saidas.forEach(s => {
    const jaContemplado = cards.some(c => c.titulo.includes(s.nome));
    if (!jaContemplado) {
      cards.push({
        tipo: 'saida',
        icone: 'local_shipping',
        titulo: `Saída / Carregamento: ${s.nome}`,
        texto: `Retirada de <strong>${s.deltaM3.toFixed(1)} m³</strong> para carretéis de fertirrigação ou caminhões tanque.`
      });
    }
  });

  entradas.forEach(e => {
    const jaContemplado = cards.some(c => c.titulo.includes(e.nome));
    if (!jaContemplado) {
      cards.push({
        tipo: 'entrada',
        icone: 'water_drop',
        titulo: `Entrada da Usina: ${e.nome}`,
        texto: `Recebimento de vinhaça: <strong>+${e.deltaM3.toFixed(1)} m³</strong> recebidos da usina.`
      });
    }
  });

  if (cards.length === 0) {
    cards.push({
      tipo: 'estavel',
      icone: 'check_circle',
      titulo: 'Sistema em Equilíbrio',
      texto: 'Nenhuma transferência de grande porte detectada no intervalo recente de 10 min.'
    });
  }

  const C = {
    transferencia: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400',
    saida: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
    entrada: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
    estavel: 'border-slate-600 bg-slate-800/40 text-slate-300'
  };

  container.innerHTML = cards.map(c => `
    <div class="flex items-start gap-3 p-3.5 rounded-lg border ${C[c.tipo]}">
      <span class="material-symbols-outlined text-2xl flex-shrink-0 mt-0.5">${c.icone}</span>
      <div>
        <h4 class="font-bold text-sm mb-0.5">${c.titulo}</h4>
        <p class="text-xs text-slate-300 leading-relaxed">${c.texto}</p>
      </div>
    </div>
  `).join('');
}

// ─── Motor de Insights ────────────────────────────────────────────────────────
function _gerarInsights(estado) {
  const container = document.getElementById('insights-lista');
  const tsEl      = document.getElementById('insights-timestamp');
  if (!container) return;

  const lagoas   = Object.entries(LAGOA_CONFIG);
  const insights = [];

  lagoas.forEach(([id, cfg]) => {
    const e = estado[id];
    if (!e || e.percent === undefined) return;
    const pct  = e.percent, volM3 = e.volume / 1000, nome = cfg.name;

    if (pct >= 95) insights.push({ tipo:'critico', icone:'emergency_heat',
      texto:`<strong>${nome}</strong> em <strong class="text-red-400">${pct.toFixed(0)}%</strong> — transbordamento iminente.` });
    else if (pct >= 90) insights.push({ tipo:'alerta', icone:'warning',
      texto:`<strong>${nome}</strong> em <strong class="text-orange-400">${pct.toFixed(0)}%</strong>. Planeje esvaziamento.` });

    if (pct < 15 && pct > 0) insights.push({ tipo:'atencao', icone:'water_loss',
      texto:`<strong>${nome}</strong> com apenas <strong class="text-yellow-400">${pct.toFixed(0)}%</strong> (${volM3.toFixed(1)} m³).` });

    const hist = _historicoVazao[id];
    if (hist?.length >= 2) {
      const agora = Date.now();
      const rec = hist.filter(p => agora - p.ts <= 3_600_000);
      if (rec.length >= 2) {
        const dV = (rec[rec.length-1].volumeL - rec[0].volumeL) / 1000;
        const dH = (rec[rec.length-1].ts - rec[0].ts) / 3_600_000;
        if (dH > 0.01) {
          const v = dV / dH;
          if (v > 0.5)  insights.push({ tipo:'info', icone:'trending_up',
            texto:`<strong>${nome}</strong> enchendo a <strong class="text-cyan-400">${v.toFixed(1)} m³/h</strong>. Volume: ${volM3.toFixed(0)} m³ (${pct.toFixed(0)}%).` });
          else if (v < -0.5) insights.push({ tipo:'info', icone:'trending_down',
            texto:`<strong>${nome}</strong> esvaziando a <strong class="text-green-400">${Math.abs(v).toFixed(1)} m³/h</strong>. Restam ${volM3.toFixed(0)} m³.` });
        }
      }
    }
  });

  const online   = lagoas.filter(([id]) => estado[id]?.online).length;
  const stale    = lagoas.filter(([id]) => estado[id]?.isStale && !estado[id]?.online).length;
  const semDados = lagoas.filter(([id]) => !estado[id]?.volume && !estado[id]?.percent).length;
  const saidaM3  = Math.max(0, _acumuladoEntrada - _totalVolumeIn) / 1000;

  insights.push({ tipo:'ok', icone:'check_circle',
    texto:`<strong>${online} online</strong>, ${stale} histórico${stale!==1?'s':''}, ${semDados} sem sinal. Armazenado: <strong class="text-cyan-400">${(_totalVolumeIn/1000).toLocaleString('pt-BR',{maximumFractionDigits:0})} m³</strong>. Saída: <strong class="text-amber-400">${saidaM3.toLocaleString('pt-BR',{maximumFractionDigits:0})} m³</strong>.` });

  if (semDados > 0) {
    const nomes = lagoas.filter(([id]) => !estado[id]?.volume && !estado[id]?.percent).map(([,c])=>c.name).join(', ');
    insights.push({ tipo:'atencao', icone:'sensors_off', texto:`Sem dados: <span class="text-yellow-400">${nomes}</span>.` });
  }

  if (insights.length === 0) insights.push({ tipo:'ok', icone:'check_circle', texto:'Sistema operando normalmente.' });

  const C = { critico:'border-red-500/60 bg-red-500/10', alerta:'border-orange-500/60 bg-orange-500/10', atencao:'border-yellow-500/60 bg-yellow-500/10', info:'border-cyan-500/40 bg-cyan-500/10', ok:'border-emerald-500/40 bg-emerald-500/10' };
  const T = { critico:'text-red-400', alerta:'text-orange-400', atencao:'text-yellow-400', info:'text-cyan-400', ok:'text-emerald-400' };

  container.innerHTML = insights.map(i => `
    <div class="flex items-start gap-3 p-3 rounded-lg border ${C[i.tipo]||C.info}">
      <span class="material-symbols-outlined ${T[i.tipo]||T.info} text-xl flex-shrink-0 mt-0.5">${i.icone}</span>
      <p class="text-sm leading-relaxed" style="color:var(--text-2)">${i.texto}</p>
    </div>`).join('');

  if (tsEl) tsEl.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
}
