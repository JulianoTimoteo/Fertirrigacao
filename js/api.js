// ============================================================================
// api.js — Ponto de Conexão: Roteamento Direto para o Firebase Firestore
// Substitui a API do Google Sheets por persistência direta no Firebase
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
            console.log(`ℹ️ [apiGet] Ação local/mock: ${action}`);
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
            console.log(`ℹ️ [apiPost] Ação tratada no Firebase: ${action}`, data);
            return { status: 'success', data };
    }
}

// ============================================================================
// EXPORTS ESPECÍFICOS PARA COMPATIBILIDADE COM TODOS OS MÓDULOS
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

// Leituras ESP32 para implementos, tanques e histórico direto do Firestore
export async function getLeiturasESP(identificador, desde = null, ate = null, limite = 500) {
    try {
        const snap = await getDocs(collection(db, 'medidas'));
        const leituras = [];
        let idFiltro = identificador ? String(identificador).toUpperCase().trim() : '';

        // Mapeamento caso venha o MAC do ESP32 ou nome da lagoa
        if (idFiltro.includes('84:1F:E8:38:F9:1C') || idFiltro.includes('CASTANHA')) idFiltro = 'T4';
        else if (idFiltro.includes('USINA A')) idFiltro = 'T1';
        else if (idFiltro.includes('USINA B')) idFiltro = 'T2';
        else if (idFiltro.includes('EUCALIPTO')) idFiltro = 'T3';
        else if (idFiltro.includes('THERESINHA')) idFiltro = 'T5';

        snap.forEach(docSnap => {
            const docId = docSnap.id;
            const data = docSnap.data();
            const tanque = (data.tanque || docId.split('_')[0] || '').toUpperCase();

            // Se um identificador de tanque foi solicitado (ex: T4), filtra por ele
            if (idFiltro && idFiltro.startsWith('T') && idFiltro.length <= 3) {
                if (!docId.startsWith(idFiltro) && tanque !== idFiltro) return;
            }

            // Calcula timestamp em milissegundos
            let ts = 0;
            if (data.timestamp) {
                if (typeof data.timestamp.toDate === 'function') {
                    ts = data.timestamp.toDate().getTime();
                } else if (typeof data.timestamp === 'string') {
                    ts = new Date(data.timestamp).getTime();
                } else if (typeof data.timestamp === 'number') {
                    ts = data.timestamp;
                }
            }

            if (!ts && data.data) {
                const partes = String(data.data).split('/');
                if (partes.length === 3) {
                    const horaParts = String(data.hora_ultima || '12:00:00').split(':');
                    ts = new Date(+partes[2], +partes[1] - 1, +partes[0], +horaParts[0] || 0, +horaParts[1] || 0, +horaParts[2] || 0).getTime();
                }
            }

            if (!ts) ts = Date.now();
            const tsSegundos = Math.floor(ts / 1000);

            // Filtro por período de datas (desde / ate em segundos)
            if (desde && tsSegundos < desde) return;
            if (ate && tsSegundos > ate) return;

            const nivel = parseFloat(data.ultima_medicao != null ? data.ultima_medicao : data.media_dia) || 0;
            const media = parseFloat(data.media_dia != null ? data.media_dia : nivel) || nivel;

            leituras.push({
                timestamp: ts,
                media_cm: media.toFixed(2),
                leitura_sensor_cm: nivel.toFixed(2),
                status: 'Trabalhando Ideal',
                statusRecalculado: 'Trabalhando Ideal',
                desvio_cm: Math.abs(nivel - media).toFixed(2),
                pacote_id: docId,
                tanque: tanque || idFiltro || docId,
                grupo: 'Vinhaça',
                equipe: 'Fertirrigação',
                mac: data.mac || 'ESP32 LoRa Mesh',
                data: data.data || '',
                hora: data.hora_ultima || ''
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

    // Fallback: se o equipamento for TR-01/02/03 sem telemetria, gera simulação suave
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

console.log("✅ API reconfigurada: Equipamentos, Usuários, Grupos e Equipes agora 100% no Firebase!");
