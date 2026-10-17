// ============================================================================
// fertirrigacaomonit.js — Conexão Firestore "fertirrigacaomonit"
// Lê da coleção "medidas" — suporte flexível a documentos por código (T1..T5)
// Polling a cada 10s sincronizado com ESP32.
// ============================================================================

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA6ZPZiDP-f3QeUzchkItKMgn3Xf9-NJTQ",
  authDomain: "fertirrigacaomonit.firebaseapp.com",
  projectId: "fertirrigacaomonit",
  storageBucket: "fertirrigacaomonit.firebasestorage.app",
  messagingSenderId: "707534137465",
  appId: "1:707534137465:web:839d7e27bc538de7308ca8",
  measurementId: "G-7MW20VV2W1"
};

export const POLL_INTERVAL_MS    = 30 * 1000; // 30s sincronizado com o cronômetro do dashboard
const ONLINE_THRESHOLD_MS = 45 * 60 * 1000; // 45 min: margem para ciclo de 10 min do ESP32 mais tolerância e chaveamento de AP

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
    console.log('[Fertirrigacaomonit] Firestore SDK inicializado com projeto:', FIREBASE_CONFIG.projectId);
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

export async function obterHistoricoLagoa(lagoaFirebaseId, dataDoc) {
  if (!_db) return [];
  try {
    let dt = dataDoc || _dataFiltroAtiva;
    if (!dt) {
      const hoje = new Date();
      dt = `${String(hoje.getDate()).padStart(2, '0')}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${hoje.getFullYear()}`;
    }
    const docId = `${lagoaFirebaseId}_${dt}`;
    const histRef = collection(_db, 'medidas', docId, 'historico');
    const snap = await getDocs(histRef);
    const pontos = [];
    snap.forEach(d => {
      const data = d.data();
      pontos.push({
        id: d.id,
        tanque: lagoaFirebaseId,
        nivel: typeof data.nivel === 'number' ? data.nivel : parseFloat(data.nivel) || 0,
        hora: data.hora || d.id.replace('-', ':'),
        timestamp: data.timestamp?.toDate?.() || 
                   (data.timestamp?.timestampValue ? new Date(data.timestamp.timestampValue) : null) || 
                   (typeof data.timestamp === 'string' ? new Date(data.timestamp) : null) ||
                   new Date()
      });
    });
    pontos.sort((a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0));
    return pontos;
  } catch (e) {
    console.warn(`[Fertirrigacaomonit] Erro ao buscar histórico de ${lagoaFirebaseId}:`, e.message);
    return [];
  }
}

export async function obterHistoricoTodosTanques(dataDoc) {
  const resultado = {};
  for (const cfg of Object.values(LAGOA_CONFIG)) {
    resultado[cfg.firebaseId] = await obterHistoricoLagoa(cfg.firebaseId, dataDoc);
  }
  return resultado;
}

async function _fetchLatestReadings() {
  if (!_db) return {};
  const medidasRef = collection(_db, 'medidas');
  const snap = await getDocs(medidasRef);

  const porTanque = {};
  const hoje = new Date();
  const hojeDoc = `${String(hoje.getDate()).padStart(2, '0')}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${hoje.getFullYear()}`;

  snap.forEach(doc => {
    const key = doc.id.trim();
    const raw = doc.data();

    // 1. Identifica qual tanque (T1..T5) este documento representa
    let tanque = null;
    const mTanque = key.match(/^(T[1-5])\b/i);
    if (mTanque) {
      tanque = mTanque[1].toUpperCase();
    } else if (raw.tanque) {
      const mT = String(raw.tanque).trim().match(/^(T[1-5])/i);
      if (mT) tanque = mT[1].toUpperCase();
    } else if (raw.codigo) {
      const mC = String(raw.codigo).trim().match(/^(T[1-5])/i);
      if (mC) tanque = mC[1].toUpperCase();
    } else if (raw.equipamento) {
      const mE = String(raw.equipamento).trim().match(/^(T[1-5])/i);
      if (mE) tanque = mE[1].toUpperCase();
    } else if (raw.moduloId) {
      const mM = String(raw.moduloId).trim().match(/^(T[1-5])/i);
      if (mM) tanque = mM[1].toUpperCase();
    }

    if (!tanque) return;

    // Ignora documentos corrompidos sem sincronismo de data (ex: ano 2000 gerados quando o ESP32 estava sem NTP)
    if (key.includes('2000') || String(raw.data).includes('2000') || String(raw.data_hora).includes('2000')) {
      return;
    }

    // 2. Extrai timestamp real com suporte a todos os formatos do Firestore
    let tsReal = 0;
    if (raw.timestamp) {
      if (typeof raw.timestamp.toDate === 'function') {
        tsReal = raw.timestamp.toDate().getTime();
      } else if (typeof raw.timestamp === 'object' && raw.timestamp.timestampValue) {
        tsReal = new Date(raw.timestamp.timestampValue).getTime();
      } else if (typeof raw.timestamp === 'string') {
        tsReal = new Date(raw.timestamp).getTime() || 0;
      } else if (typeof raw.timestamp === 'number') {
        tsReal = raw.timestamp > 1e12 ? raw.timestamp : raw.timestamp * 1000;
      }
    }

    if (!tsReal && raw.data_hora) {
      const m = String(raw.data_hora).match(/(\d{2})[-/](\d{2})[-/](\d{4})\s*[-_]?\s*(\d{2}):(\d{2})(?::(\d{2}))?/);
      if (m) {
        tsReal = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime();
      }
    }

    if (!tsReal && raw.data) {
      const partes = String(raw.data).split(/[-/]/);
      if (partes.length === 3) {
        const horaStr = raw.hora || raw.hora_ultima || '12:00:00';
        const hp = horaStr.split(':');
        tsReal = new Date(+partes[2], +partes[1] - 1, +partes[0], +hp[0] || 0, +hp[1] || 0, +hp[2] || 0).getTime();
      }
    }

    if (!tsReal) tsReal = 0;

    // 3. Filtro por data se estiver ativo
    let dataDoc = '';
    const mData = key.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (mData) {
      dataDoc = `${mData[1]}-${mData[2]}-${mData[3]}`;
    } else if (raw.data) {
      dataDoc = String(raw.data).replace(/\//g, '-');
    }

    if (_dataFiltroAtiva && dataDoc && dataDoc !== _dataFiltroAtiva) {
      return;
    }

    // 4. Guarda o registro mais recente para cada tanque
    if (!porTanque[tanque] || tsReal > porTanque[tanque].ts) {
      porTanque[tanque] = { ts: tsReal, data: raw };
    }
  });

  const results = {};
  for (const [tanque, entry] of Object.entries(porTanque)) {
    results[tanque] = { ...entry.data };
  }

  // 5. Para o modo Tempo Real (ou data selecionada), confere se a subcoleção "historico" tem ponto mais novo
  const dataAlvo = _dataFiltroAtiva || hojeDoc;
  for (const tanque of Object.keys(results)) {
    try {
      const docId = `${tanque}_${dataAlvo}`;
      const histRef = collection(_db, 'medidas', docId, 'historico');
      const snapHist = await getDocs(histRef);
      if (!snapHist.empty) {
        let maxTs = porTanque[tanque]?.ts || 0;
        let ultimoPonto = null;

        snapHist.forEach(d => {
          const pt = d.data();
          let tsPt = 0;
          if (pt.timestamp) {
            if (typeof pt.timestamp.toDate === 'function') tsPt = pt.timestamp.toDate().getTime();
            else if (pt.timestamp.timestampValue) tsPt = new Date(pt.timestamp.timestampValue).getTime();
            else if (typeof pt.timestamp === 'string') tsPt = new Date(pt.timestamp).getTime();
          }
          if (!tsPt && pt.hora) {
            const hp = pt.hora.split(':');
            const dp = dataAlvo.split('-');
            tsPt = new Date(+dp[2], +dp[1] - 1, +dp[0], +hp[0] || 0, +hp[1] || 0, +hp[2] || 0).getTime();
          }
          if (tsPt > maxTs) {
            maxTs = tsPt;
            ultimoPonto = { ...pt, id: d.id, ts: tsPt };
          }
        });

        if (ultimoPonto) {
          results[tanque].ultima_medicao = ultimoPonto.nivel;
          results[tanque].nivel          = ultimoPonto.nivel;
          results[tanque].hora_ultima    = ultimoPonto.hora;
          results[tanque].hora           = ultimoPonto.hora;
          results[tanque].data_hora      = `${dataAlvo.replace(/-/g, '/')} - ${ultimoPonto.hora}`;
          results[tanque].timestamp      = ultimoPonto.timestamp || new Date(maxTs);
        }
      }
    } catch(err) {
      // Ignora falhas pontuais de subcoleção
    }
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
    console.log('[Fertirrigacaomonit] Lagoas encontradas no Firestore:', Object.keys(readings));

    for (const [id, cfg] of Object.entries(LAGOA_CONFIG)) {
      const cb = _callbacks[id];
      if (!cb) continue;

      const raw = readings[cfg.firebaseId];
      if (!raw) continue;

      const nivel = parseFloat(
        raw.ultima_medicao != null ? raw.ultima_medicao :
        raw.nivel          != null ? raw.nivel :
        raw.sensor         != null ? raw.sensor :
        raw.distancia      != null ? raw.distancia :
        raw.media_dia      != null ? raw.media_dia :
        raw.media_cm) || 0;

      const tsFirestore = raw.timestamp?.toDate?.() || 
                          (raw.timestamp?.timestampValue ? new Date(raw.timestamp.timestampValue) : null) || 
                          (typeof raw.timestamp === 'string' ? new Date(raw.timestamp) : null) ||
                          (typeof raw.timestamp === 'number' ? (raw.timestamp > 1e12 ? new Date(raw.timestamp) : new Date(raw.timestamp * 1000)) : null);

      const tsLeitura   = (tsFirestore instanceof Date && !isNaN(tsFirestore.getTime())) ? tsFirestore.getTime() : Date.now();
      const idadeMs     = Math.max(0, Date.now() - tsLeitura);
      const isRecent    = idadeMs < ONLINE_THRESHOLD_MS;

      const horaStr = raw.hora || raw.hora_ultima || (tsLeitura ? new Date(tsLeitura).toLocaleTimeString('pt-BR') : '-');
      const dataStr = raw.data || (tsLeitura ? new Date(tsLeitura).toLocaleDateString('pt-BR') : '-');
      const dataHoraStr = raw.data_hora || raw.dataHora || `${dataStr} - ${horaStr}`;

      _healthData[cfg.firebaseId] = {
        lagoaId: +id, nome: cfg.name, mac: raw.mac || 'Firestore',
        ultimaVezVisto: tsLeitura > 0 ? new Date(tsLeitura) : null,
        ultimaDataHora: dataHoraStr,
        statusSensor: 'OK', nivel, online: isRecent,
        idadeMinutos: Math.round(idadeMs / 60000),
        totalLeituras: 1, erros: 0, sistemaAtivo: true
      };

      cb({
        nivel, 
        hora: horaStr,
        data: dataStr,
        data_hora: dataHoraStr,
        mac: raw.mac || 'Firestore', 
        status: raw.status || 'OK',
        isStale: !isRecent,
        idadeMin: Math.round(idadeMs / 60000)
      });

      window.dispatchEvent(new CustomEvent('esp32:healthUpdate', { detail: getESP32Health() }));
    }
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
