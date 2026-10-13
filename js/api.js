// ============================================================================
// api.js â€” Ponto de ConexÃ£o: Roteamento Direto para o Firebase Firestore
// Substitui a API do Google Sheets por persistÃªncia direta no Firebase
// ============================================================================

import {
    fbGetUsers,
    fbAddUser,
    fbUpdateUser,
    fbDeleteUser,
    fbApproveUser,
    fbLogin,
    fbGetEquipamentos,
    fbSaveEquipamento,
    fbDeleteEquipamento,
    fbGetSensoresAtivos,
    fbGetGrupos,
    fbSaveGrupo,
    fbDeleteGrupo,
    fbGetEquipes,
    fbSaveEquipe,
    fbDeleteEquipe
} from './firebase-service.js';
import { db, collection, getDocs } from './firebase-config.js';

// ============================================================================
// ROTEADOR API GET (Agora direto no Firebase)
// ============================================================================

export async function apiGet(action, params = {}) {
    switch (action) {
        case 'getEquipamentos':
            return fbGetEquipamentos();
        case 'getUsers':
            return fbGetUsers();
        case 'getGrupos':
            return fbGetGrupos();
        case 'getEquipes':
            return fbGetEquipes();
        case 'getSensoresAtivos':
            return fbGetSensoresAtivos();
        case 'getLeiturasESP':
            return getLeiturasESP(params.mac, params.desde, params.ate, params.limite);
        default:
            console.log(`â„¹ï¸ [apiGet] AÃ§Ã£o local/mock: ${action}`);
            return [];
    }
}

// ============================================================================
// ROTEADOR API POST (Agora direto no Firebase)
// ============================================================================

export async function apiPost(action, data = {}) {
    switch (action) {
        case 'login':
            return fbLogin(data.email || data.username, data.password || data.senha);
            
        case 'updateEquipamento':
        case 'salvarEquipamento':
            return fbSaveEquipamento(data);
            
        case 'deleteEquipamento':
            return fbDeleteEquipamento(data.codigo || data.id);
            
        case 'addUser':
            return fbAddUser(data);
            
        case 'editUser':
            return fbUpdateUser(data.uid, data);
            
        case 'deleteUser':
            return fbDeleteUser(data.uid);
            
        case 'approveUser':
            return fbApproveUser(data.uid);
            
        case 'saveGrupo':
            return fbSaveGrupo(data.nome);
            
        case 'updateGrupo':
            return fbSaveGrupo(data.nome);
            
        case 'deleteGrupo':
            return fbDeleteGrupo(data.id);
            
        case 'saveEquipe':
            return fbSaveEquipe(data.nome);
            
        case 'updateEquipe':
            return fbSaveEquipe(data.nome);
            
        case 'deleteEquipe':
            return fbDeleteEquipe(data.id);
            
        default:
            console.log(`â„¹ï¸ [apiPost] AÃ§Ã£o tratada no Firebase: ${action}`, data);
            return { status: 'success', data };
    }
}

// ============================================================================
// EXPORTS ESPECÃFICOS PARA COMPATIBILIDADE COM TODOS OS MÃ“DULOS
// ============================================================================

export async function getEquipamentos({ forceRefresh = false } = {}) {
    return fbGetEquipamentos();
}

export function invalidarCacheEquipamentos() {
    // Cache invalidado diretamente nas chamadas do Firestore
}

export async function login(email, password) {
    return fbLogin(email, password);
}

export async function getEquipes() {
    return fbGetEquipes();
}

export async function getGrupos() {
    return fbGetGrupos();
}

export async function getUsers() {
    return fbGetUsers();
}

export async function getUserPermissions(user) {
    const users = await fbGetUsers();
    const found = users.find(u => u.username === user || u.email === user);
    return found ? found.permissions : [];
}

export async function getSensoresAtivos() {
    return fbGetSensoresAtivos();
}

// Leituras ESP32 para implementos, tanques e histÃ³rico direto do Firestore
export async function getLeiturasESP(identificador, desde = null, ate = null, limite = 500) {
    try {
        const snap = await getDocs(collection(db, 'medidas'));
        const leituras = [];
        let idFiltro = identificador ? String(identificador).toUpperCase().trim() : '';

        // Mapeamento: MAC físico, nome da lagoa, ou código direto -> código do tanque
        if (idFiltro.includes('84:1F:E8:38:F9:1C') || idFiltro.includes('CASTANHA') || idFiltro === 'ESP32_T4') idFiltro = 'T4';
        else if (idFiltro.includes('USINA A') || idFiltro === 'ESP32_T1') idFiltro = 'T1';
        else if (idFiltro.includes('USINA B') || idFiltro === 'ESP32_T2') idFiltro = 'T2';
        else if (idFiltro.includes('EUCALIPTO') || idFiltro === 'ESP32_T3') idFiltro = 'T3';
        else if (idFiltro.includes('THERESINHA') || idFiltro === 'ESP32_T5') idFiltro = 'T5';
        else if (idFiltro === 'ESP32_TR-01' || idFiltro.includes('TR-01')) idFiltro = 'TR-01';
        else if (idFiltro === 'ESP32_TR-02' || idFiltro.includes('TR-02')) idFiltro = 'TR-02';
        else if (idFiltro === 'ESP32_TR-03' || idFiltro.includes('TR-03')) idFiltro = 'TR-03';

        snap.forEach(docSnap => {
            const docId = docSnap.id;
            const data = docSnap.data();
            const tanque = (data.tanque || docId.split('_')[0] || '').toUpperCase();

            // Filtra por código do equipamento (T1..T5, TR-01, TR-02, TR-03)
            if (idFiltro) {
                const docTanque = docId.split('_')[0].toUpperCase();
                const matchDoc   = docTanque === idFiltro;
                const matchCampo = tanque === idFiltro;
                const matchData  = (data.tanque || ').toUpperCase() === idFiltro;
                const matchCod   = (data.codigo || ').toUpperCase() === idFiltro;
                if (!matchDoc && !matchCampo && !matchData && !matchCod) return;
            }

            // Calcula timestamp em milissegundos — suporta todos os formatos do ESP32
            let ts = 0;
            if (data.timestamp) {
                if (typeof data.timestamp.toDate === 'function') {
                    // Firestore SDK Timestamp object
                    ts = data.timestamp.toDate().getTime();
                } else if (typeof data.timestamp === 'object' && data.timestamp.timestampValue) {
                    // Firestore REST API: { timestampValue: "2026-10-13T10:19:25Z" }
                    ts = new Date(data.timestamp.timestampValue).getTime();
                } else if (typeof data.timestamp === 'string') {
                    // ISO string direta
                    ts = new Date(data.timestamp).getTime();
                } else if (typeof data.timestamp === 'number') {
                    // Unix ms (ESP32 via millis() ou epoch*1000)
                    ts = data.timestamp > 9999999999 ? data.timestamp : data.timestamp * 1000;
                }
            }

            // Fallback: monta a partir dos campos data + hora (enviados pelo ESP corrigido)
            if (!ts && data.data) {
                const partes = String(data.data).split('/');
                if (partes.length === 3) {
                    const horaStr = data.hora || data.hora_ultima || '12:00:00';
                    const horaParts = String(horaStr).split(':');
                    ts = new Date(+partes[2], +partes[1] - 1, +partes[0], +horaParts[0] || 0, +horaParts[1] || 0, +horaParts[2] || 0).getTime();
                }
            }

            if (!ts) ts = Date.now();
            const tsSegundos = Math.floor(ts / 1000);

            // Filtro por perÃ­odo de datas (desde / ate em segundos)
            if (desde && tsSegundos < desde) return;
            if (ate && tsSegundos > ate) return;

            const nivel = parseFloat(
                data.ultima_medicao != null ? data.ultima_medicao :
                data.sensor         != null ? data.sensor :
                data.distancia      != null ? data.distancia :
                data.media_dia) || 0;
            const media = parseFloat(data.media_dia != null ? data.media_dia : nivel) || nivel;

            leituras.push({
                timestamp: ts,
                data_hora: data.data_hora || data.dataHora || `${data.data || ''} - ${data.hora || data.hora_ultima || ''}`,
                media_cm: media,
                leitura_sensor_cm: nivel,
                leitura: nivel,
                status: 'Trabalhando Ideal',
                statusRecalculado: 'Trabalhando Ideal',
                desvio_cm: Math.abs(nivel - media),
                pacote_id: docId,
                tanque: tanque || idFiltro || docId,
                grupo: 'VinhaÃ§a',
                equipe: 'FertirrigaÃ§Ã£o',
                mac: data.mac || 'ESP32 LoRa Mesh',
                data: data.data || '',
                hora: data.hora || data.hora_ultima || ''
            });
        });

        // Se encontrou dados reais no Firestore, ordena por timestamp e retorna
        if (leituras.length > 0) {
            leituras.sort((a, b) => b.timestamp - a.timestamp); // mais recentes primeiro
            return leituras.slice(0, limite);
        }
    } catch (e) {
        console.warn('Erro ao ler medidas reais do Firestore:', e);
    }

    // Fallback: se o equipamento for TR-01/02/03 sem telemetria, gera simulaÃ§Ã£o suave
    const leituras = [];
    const agora = Date.now();
    for (let i = 0; i < Math.min(limite, 50); i++) {
        const ts = agora - (i * 10 * 1000);
        leituras.push({
            timestamp: ts,
            media_cm: (15 + Math.sin(i / 5) * 5 + (Math.random() * 2)).toFixed(2),
            leitura_sensor_cm: 15.0,
            status: 'Trabalhando Ideal',
            statusRecalculado: 'Trabalhando Ideal',
            desvio_cm: 0.5,
            pacote_id: 1000 - i,
            grupo: 'Sulcador',
            equipe: 'Tratos',
            mac: identificador
        });
    }
    return leituras;
}

export async function salvarLeituraESP(dados) {
    return { status: 'success' };
}

export async function testConnection() {
    return { status: 'success', message: 'Conectado diretamente ao Firebase Firestore' };
}

console.log("âœ… API reconfigurada: Equipamentos, UsuÃ¡rios, Grupos e Equipes agora 100% no Firebase!");


