// ============================================================================
// fertirrigacaomonit.js — Conexão Firestore "fertirrigacaomonit"
// Lê da coleção "medidas" — documentos com chave {TANQUE}_{DD-MM-YYYY}
// Polling a cada 30s sincronizado com ESP32.
// ============================================================================

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBN-jcSaOxiIg9H8Zc2MxdPoBe36g3qnV4",
  authDomain: "monitoramento-esp32-2551e.firebaseapp.com",
  databaseURL: "https://monitoramento-esp32-2551e-default-rtdb.firebaseio.com",
  projectId: "monitoramento-esp32-2551e",
  storageBucket: "monitoramento-esp32-2551e.firebasestorage.app",
  messagingSenderId: "1026903641131",
  appId: "1:1026903641131:web:86e847b5e600914b26ae6e"
};

export const POLL_INTERVAL_MS    = 10 * 1000;
const ONLINE_THRESHOLD_MS = 15 * 60 * 1000;

export const LAGOA_CONFIG = {
  1: { name: 'Carregamento Usina A', firebaseId: 'T1', tanqueId: 'T1' },
  2: { name: 'Carregamento Usina B', firebaseId: 'T2', tanqueId: 'T2' },
  3: { name: 'EUCALIPTO CHEIRO',      firebaseId: 'T3', tanqueId: 'T3' },
  4: { name: 'CASTANHA',              firebaseId: 'T4', tanqueId: 'T4' },
  5: { name: 'SANTA THERESINHA',      firebaseId: 'T5', tanqueId: 'T5' }
};

let _db        = null;
let _pollTimer = null;
let _callbacks = {};
const _healthData = {};

export function initFertiFirebase() {
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
    _db = getFirestore(app);
    console.log('[Fertirrigacaomonit] Firestore SDK inicializado');
    return true;
  } catch (e) {
    console.error('[Fertirrigacaomonit] init:', e);
    return false;
  }
}

let _dataFiltroAtiva = null; // null = tempo real / última leitura; 'DD-MM-YYYY' = data histórica

export function setDataVisualizacao(dataStr) {
  if (!dataStr || dataStr === 'hoje' || dataStr === 'realtime') {
    _dataFiltroAtiva = null;
    return;
  }
  let s = String(dataStr).trim().replace(/\//g, '-');
  const parts = s.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD -> DD-MM-YYYY
      _dataFiltroAtiva = `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
    } else {
      _dataFiltroAtiva = `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
    }
  } else {
    _dataFiltroAtiva = s;
  }
}

export function getDataVisualizacao() {
  return _dataFiltroAtiva;
}

export async function obterHistoricoMedidas() {
  if (!_db) return [];
  const medidasRef = collection(_db, 'medidas');
  const snap = await getDocs(medidasRef);
  const docs = [];
  snap.forEach(d => {
    docs.push({ id: d.id, ...d.data() });
  });
  return docs;
}

async function _fetchLatestReadings() {
  const medidasRef = collection(_db, 'medidas');
  const snap = await getDocs(medidasRef);

  const porTanque = {};

  snap.forEach(doc => {
    const key = doc.id;
    const m = key.match(/^(T[1-5])_(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return;

    const tanque  = m[1];
    const dataDoc = `${m[2]}-${m[3]}-${m[4]}`;
    const raw     = doc.data();

    // Usa o campo timestamp real do Firestore (mais preciso que a data do ID)
    let tsReal = 0;
    if (raw.timestamp) {
      if (typeof raw.timestamp.toDate === 'function') {
        tsReal = raw.timestamp.toDate().getTime();
      } else if (typeof raw.timestamp === 'number') {
        tsReal = raw.timestamp > 1e12 ? raw.timestamp : raw.timestamp * 1000;
      } else if (typeof raw.timestamp === 'string') {
        tsReal = new Date(raw.timestamp).getTime() || 0;
      }
    }
    // Fallback para a data do ID (hora do meio-dia para desambiguação)
    if (!tsReal || tsReal < 1e12) {
      tsReal = new Date(+m[4], +m[3] - 1, +m[2], 12, 0, 0).getTime();
    }

    if (_dataFiltroAtiva) {
      if (dataDoc === _dataFiltroAtiva) {
        if (!porTanque[tanque] || tsReal > porTanque[tanque].ts) {
          porTanque[tanque] = { ts: tsReal, data: raw };
        }
      }
    } else {
      if (!porTanque[tanque] || tsReal > porTanque[tanque].ts) {
        porTanque[tanque] = { ts: tsReal, data: raw };
      }
    }
  });

  const results = {};
  for (const [tanque, entry] of Object.entries(porTanque)) {
    results[tanque] = entry.data;
  }
  return results;
}

export function getESP32Health() { return JSON.parse(JSON.stringify(_healthData)); }

export function subscribeLagoa(lagoaId, onUpdate) {
  _callbacks[lagoaId] = onUpdate;
  if (Object.keys(_callbacks).length === 1) _iniciarPolling();
}

export async function executarPollLeituras() {
  try {
    const readings = await _fetchLatestReadings();
    for (const [id, cfg] of Object.entries(LAGOA_CONFIG)) {
      const cb = _callbacks[id];
      if (!cb) continue;

      const raw = readings[cfg.firebaseId];
      if (!raw || raw.ultima_medicao == null) continue;

      const tsFirestore = raw.timestamp?.toDate?.() || raw.timestamp;
      const tsLeitura   = tsFirestore instanceof Date ? tsFirestore.getTime() : Date.now();
      const idadeMs     = Math.max(0, Date.now() - tsLeitura);
      const isRecent    = idadeMs < ONLINE_THRESHOLD_MS;

      const nivel = parseFloat(raw.ultima_medicao) || 0;

      _healthData[cfg.firebaseId] = {
        lagoaId: +id, nome: cfg.name, mac: 'Firestore',
        ultimaVezVisto: tsLeitura > 0 ? new Date(tsLeitura) : null,
        ultimaDataHora: raw.data_hora || ((raw.data || '-') + ' - ' + (raw.hora_ultima || '-')),
        statusSensor: 'OK', nivel, online: isRecent,
        idadeMinutos: Math.round(idadeMs / 60000),
        totalLeituras: 1, erros: 0, sistemaAtivo: true
      };

      cb({
        nivel, hora: raw.hora_ultima, data: raw.data,
        data_hora: raw.data_hora || ((raw.data || '-') + ' - ' + (raw.hora_ultima || '-')),
        mac: 'Firestore', status: 'OK',
        isStale: !isRecent,
        idadeMin: Math.round(idadeMs / 60000)
      });

      window.dispatchEvent(new CustomEvent('esp32:healthUpdate', { detail: getESP32Health() }));
    }

    // 📡 Notifica sincronização do ciclo do ESP32 para o cronômetro do cabeçalho
    window.dispatchEvent(new CustomEvent('esp32:syncCycle', {
      detail: {
        modulo: 'fertirrigacao',
        intervalSeconds: POLL_INTERVAL_MS / 1000,
        timestamp: Date.now()
      }
    }));
  } catch (e) {
    console.warn('[Fertirrigacaomonit] Polling:', e.message);
  }
}

export async function forcarPollLeituras() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = setInterval(executarPollLeituras, POLL_INTERVAL_MS);
  }
  await executarPollLeituras();
}

function _iniciarPolling() {
  if (_pollTimer) clearInterval(_pollTimer);
  executarPollLeituras();
  _pollTimer = setInterval(executarPollLeituras, POLL_INTERVAL_MS);
}

export function unsubscribeAllLagoas() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  _callbacks = {};
}
