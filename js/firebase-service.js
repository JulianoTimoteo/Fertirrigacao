// ============================================================================
// firebase-service.js — Gerenciamento Direto de Usuários e Equipamentos no Firestore
// Substitui completamente a API do Google Sheets pelo Firebase Firestore
// ============================================================================

import { 
    db, 
    COLLECTIONS, 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc 
} from './firebase-config.js';

// ============================================================================
// DADOS PADRÃO (SEMENTE)
// ============================================================================

const DEFAULT_MASTER_USER = {
    uid: 'master_julianotimoteo',
    username: 'julianotimoteo',
    email: 'julianotimoteo@usinapitangueiras.com.br',
    senha: 'tmotvini1986@#',
    displayName: 'Juliano Timóteo',
    role: 'Master',
    status: 'Aprovado',
    permissions: ['fertirrigacao', 'implementos', 'historico', 'limites', 'cadastro'],
    customId: 'MASTER-01',
    createdAt: new Date().toISOString()
};

const DEFAULT_EQUIPAMENTOS = [
    {
        codigo: 'TR-01',
        descricao: 'Trator Case Magnum 340',
        grupo: 'Sulcador',
        equipe: 'Tratos',
        hMesa: 100.0,
        produtivoMin: 10.0,
        produtivoMax: 45.0,
        ativo: '1',
        macVinculado: '24:6F:28:B1:C2:A4'
    },
    {
        codigo: 'TR-02',
        descricao: 'Trator John Deere 8R',
        grupo: 'Subsolador',
        equipe: 'Preparo',
        hMesa: 100.0,
        produtivoMin: 15.0,
        produtivoMax: 50.0,
        ativo: '1',
        macVinculado: '24:6F:28:B1:C2:B5'
    },
    {
        codigo: 'TR-03',
        descricao: 'Trator Valtra S374',
        grupo: 'Grade',
        equipe: 'Tratos',
        hMesa: 100.0,
        produtivoMin: 10.0,
        produtivoMax: 40.0,
        ativo: '1',
        macVinculado: '24:6F:28:B1:C2:C6'
    }
];

const DEFAULT_GRUPOS = ['Sulcador', 'Grade', 'Subsolador', 'Pulverizador', 'Plantadeira', 'Colheitadeira'];
const DEFAULT_EQUIPES = ['Tratos', 'Preparo', 'Herbicida', 'Plantio', 'Colheita'];

// Cache e persistência local de contingência
function getLocal(key, defaultVal = []) {
    try {
        const val = localStorage.getItem(`fb_${key}`);
        return val ? JSON.parse(val) : defaultVal;
    } catch (e) {
        return defaultVal;
    }
}

function setLocal(key, val) {
    try {
        localStorage.setItem(`fb_${key}`, JSON.stringify(val));
    } catch (e) {
        console.warn('Erro ao salvar localmente:', e);
    }
}

// ============================================================================
// 1. USUÁRIOS (AUTENTICAÇÃO E GERENCIAMENTO DIRETO NO FIREBASE)
// ============================================================================

export async function fbGetUsers() {
    let localUsers = getLocal('users', []);
    
    // Garante que o Master sempre exista na lista
    if (!localUsers.some(u => u.username === 'julianotimoteo' || u.email === DEFAULT_MASTER_USER.email)) {
        localUsers.unshift(DEFAULT_MASTER_USER);
        setLocal('users', localUsers);
    }

    try {
        const colRef = collection(db, COLLECTIONS.USERS);
        const snapshot = await getDocs(colRef);
        
        if (snapshot.empty) {
            console.log("ℹ️ Coleção users vazia no Firestore. Inicializando Master...");
            try {
                await setDoc(doc(db, COLLECTIONS.USERS, DEFAULT_MASTER_USER.uid), DEFAULT_MASTER_USER);
            } catch (errRule) {
                console.warn("⚠️ Permissão no Firestore requerida para users. Mantendo cache local.");
            }
            return localUsers;
        }

        const firestoreUsers = [];
        snapshot.forEach(docSnap => {
            firestoreUsers.push({ uid: docSnap.id, ...docSnap.data() });
        });

        // Mescla com o Master caso não esteja gravado na nuvem
        if (!firestoreUsers.some(u => u.username === 'julianotimoteo' || u.email === DEFAULT_MASTER_USER.email)) {
            firestoreUsers.unshift(DEFAULT_MASTER_USER);
        }

        setLocal('users', firestoreUsers);
        return firestoreUsers;
    } catch (error) {
        console.warn("⚠️ Não foi possível ler users do Firestore, usando cache local:", error.message);
        return localUsers;
    }
}

export async function fbAddUser(userData) {
    const uid = userData.uid || `user_${Date.now()}`;
    const userToSave = {
        uid,
        username: userData.username || userData.email.split('@')[0],
        email: userData.email,
        displayName: userData.displayName || userData.nome || userData.username,
        customId: userData.customId || '',
        senha: userData.senha || userData.password || 'a123456@',
        role: userData.role || 'Operação',
        status: userData.status || 'Pendente',
        permissions: Array.isArray(userData.permissions) ? userData.permissions : 
                     (userData.permissions ? userData.permissions.split(',').map(p => p.trim()) : ['fertirrigacao']),
        createdAt: new Date().toISOString(),
        primeiroAcesso: userData.primeiroAcesso !== undefined ? userData.primeiroAcesso : false
    };

    // 1. Salva no cache local
    const users = getLocal('users', []);
    const existingIndex = users.findIndex(u => u.uid === uid || u.email === userToSave.email);
    if (existingIndex >= 0) {
        users[existingIndex] = { ...users[existingIndex], ...userToSave };
    } else {
        users.push(userToSave);
    }
    setLocal('users', users);

    // 2. Salva no Firestore
    try {
        await setDoc(doc(db, COLLECTIONS.USERS, uid), userToSave);
        console.log(`✅ Usuário ${userToSave.displayName} gravado com sucesso no Firebase!`);
    } catch (e) {
        console.warn(`⚠️ Usuário gravado localmente (aguardando regras Firestore): ${e.message}`);
    }

    return userToSave;
}

export async function fbUpdateUser(uid, updates) {
    // 1. Atualiza no cache local
    const users = getLocal('users', []);
    const index = users.findIndex(u => u.uid === uid);
    if (index >= 0) {
        users[index] = { ...users[index], ...updates, updatedAt: new Date().toISOString() };
        setLocal('users', users);
    }

    // 2. Atualiza no Firestore
    try {
        const userDocRef = doc(db, COLLECTIONS.USERS, uid);
        await updateDoc(userDocRef, { ...updates, updatedAt: new Date().toISOString() });
        console.log(`✅ Usuário ${uid} atualizado no Firebase!`);
    } catch (e) {
        console.warn(`⚠️ Atualização gravada localmente: ${e.message}`);
    }

    return true;
}

export async function fbDeleteUser(uid) {
    // 1. Remove do cache local
    let users = getLocal('users', []);
    users = users.filter(u => u.uid !== uid);
    setLocal('users', users);

    // 2. Remove do Firestore
    try {
        await deleteDoc(doc(db, COLLECTIONS.USERS, uid));
        console.log(`✅ Usuário ${uid} excluído do Firebase!`);
    } catch (e) {
        console.warn(`⚠️ Exclusão local: ${e.message}`);
    }

    return true;
}

export async function fbApproveUser(uid) {
    return fbUpdateUser(uid, { status: 'Aprovado' });
}

export async function fbLogin(usernameOrEmail, password) {
    const term = String(usernameOrEmail).trim().toLowerCase();
    const users = await fbGetUsers();

    const user = users.find(u => {
        const uEmail = String(u.email || '').toLowerCase();
        const uName = String(u.username || '').toLowerCase();
        return (uEmail === term || uName === term);
    });

    if (!user) {
        return { status: 'error', message: 'Usuário não encontrado.' };
    }

    if (user.senha !== password) {
        return { status: 'error', message: 'Senha incorreta.' };
    }

    if (user.status && user.status.toLowerCase() === 'pendente') {
        return { 
            status: 'error', 
            message: 'Acesso pendente de aprovação pelo administrador.', 
            userStatus: 'pendente' 
        };
    }

    // Atualiza último login
    fbUpdateUser(user.uid, { ultimoLogin: new Date().toISOString() }).catch(() => {});

    return {
        status: 'success',
        data: user
    };
}

// ============================================================================
// 2. EQUIPAMENTOS (DIRETO NO FIREBASE)
// ============================================================================

export async function fbGetEquipamentos() {
    let localEquips = getLocal('equipamentos', DEFAULT_EQUIPAMENTOS);

    try {
        const colRef = collection(db, COLLECTIONS.EQUIPAMENTOS);
        const snapshot = await getDocs(colRef);

        if (snapshot.empty) {
            console.log("ℹ️ Coleção equipamentos vazia no Firestore. Inicializando padrões...");
            try {
                for (const equip of DEFAULT_EQUIPAMENTOS) {
                    await setDoc(doc(db, COLLECTIONS.EQUIPAMENTOS, equip.codigo), equip);
                }
            } catch (errRule) {
                console.warn("⚠️ Permissão no Firestore requerida para equipamentos. Mantendo cache local.");
            }
            return localEquips;
        }

        const firestoreEquips = [];
        snapshot.forEach(docSnap => {
            firestoreEquips.push({ id: docSnap.id, ...docSnap.data() });
        });

        setLocal('equipamentos', firestoreEquips);
        return firestoreEquips;
    } catch (error) {
        console.warn("⚠️ Não foi possível ler equipamentos do Firestore, usando cache local:", error.message);
        return localEquips;
    }
}

export async function fbSaveEquipamento(dados) {
    const codigo = String(dados.codigo).trim();
    if (!codigo) throw new Error('Código do equipamento é obrigatório');

    const equipData = {
        codigo,
        descricao: dados.descricao || '',
        grupo: dados.grupo || '',
        equipe: dados.equipe || '',
        hMesa: parseFloat(dados.hMesa || dados.hmesa || 100.0),
        produtivoMin: parseFloat(dados.produtivoMin || dados.min || 10.0),
        produtivoMax: parseFloat(dados.produtivoMax || dados.max || 45.0),
        ativo: dados.ativo == '1' || dados.ativo === true ? '1' : '0',
        macVinculado: dados.macVinculado || '',
        updatedAt: new Date().toISOString()
    };

    // 1. Atualiza no cache local
    const equips = getLocal('equipamentos', DEFAULT_EQUIPAMENTOS);
    const index = equips.findIndex(e => String(e.codigo).trim() === codigo);
    if (index >= 0) {
        equips[index] = equipData;
    } else {
        equips.push(equipData);
    }
    setLocal('equipamentos', equips);

    // 2. Atualiza no Firestore
    try {
        await setDoc(doc(db, COLLECTIONS.EQUIPAMENTOS, codigo), equipData);
        console.log(`✅ Equipamento ${codigo} gravado com sucesso no Firebase!`);
    } catch (e) {
        console.warn(`⚠️ Equipamento salvo localmente (aguardando regras Firestore): ${e.message}`);
    }

    return equipData;
}

export async function fbDeleteEquipamento(codigo) {
    const cod = String(codigo).trim();
    
    // 1. Remove do cache local
    let equips = getLocal('equipamentos', DEFAULT_EQUIPAMENTOS);
    equips = equips.filter(e => String(e.codigo).trim() !== cod);
    setLocal('equipamentos', equips);

    // 2. Remove do Firestore
    try {
        await deleteDoc(doc(db, COLLECTIONS.EQUIPAMENTOS, cod));
        console.log(`✅ Equipamento ${cod} excluído do Firebase!`);
    } catch (e) {
        console.warn(`⚠️ Exclusão local de equipamento: ${e.message}`);
    }

    return true;
}

// Retorna lista de MACs vinculados ou ativos para vinculação
export async function fbGetSensoresAtivos() {
    const equips = await fbGetEquipamentos();
    const macsUsados = equips.map(e => e.macVinculado).filter(Boolean);
    
    // Lista de sensores de demonstração/disponíveis
    const sensoresPadrao = [
        { mac: '24:6F:28:B1:C2:A4', status: 'Ativo' },
        { mac: '24:6F:28:B1:C2:B5', status: 'Ativo' },
        { mac: '24:6F:28:B1:C2:C6', status: 'Ativo' },
        { mac: '30:AE:A4:05:78:E1', status: 'Disponível' },
        { mac: '30:AE:A4:05:78:F2', status: 'Disponível' }
    ];

    return sensoresPadrao;
}

// ============================================================================
// 3. GRUPOS E EQUIPES (DIRETO NO FIREBASE)
// ============================================================================

export async function fbGetGrupos() {
    let local = getLocal('grupos', DEFAULT_GRUPOS.map((nome, i) => ({ id: `grp_${i}`, nome })));
    try {
        const snapshot = await getDocs(collection(db, COLLECTIONS.GRUPOS));
        if (snapshot.empty) return local;
        const grupos = [];
        snapshot.forEach(d => grupos.push({ id: d.id, ...d.data() }));
        setLocal('grupos', grupos);
        return grupos;
    } catch (e) {
        return local;
    }
}

export async function fbSaveGrupo(nome) {
    const id = `grp_${Date.now()}`;
    const obj = { id, nome };
    const list = getLocal('grupos', []);
    list.push(obj);
    setLocal('grupos', list);
    try {
        await setDoc(doc(db, COLLECTIONS.GRUPOS, id), obj);
    } catch (e) {}
    return obj;
}

export async function fbDeleteGrupo(id) {
    let list = getLocal('grupos', []);
    list = list.filter(g => g.id !== id);
    setLocal('grupos', list);
    try {
        await deleteDoc(doc(db, COLLECTIONS.GRUPOS, id));
    } catch (e) {}
    return true;
}

export async function fbGetEquipes() {
    let local = getLocal('equipes', DEFAULT_EQUIPES.map((nome, i) => ({ id: `eqp_${i}`, nome })));
    try {
        const snapshot = await getDocs(collection(db, COLLECTIONS.EQUIPES));
        if (snapshot.empty) return local;
        const equipes = [];
        snapshot.forEach(d => equipes.push({ id: d.id, ...d.data() }));
        setLocal('equipes', equipes);
        return equipes;
    } catch (e) {
        return local;
    }
}

export async function fbSaveEquipe(nome) {
    const id = `eqp_${Date.now()}`;
    const obj = { id, nome };
    const list = getLocal('equipes', []);
    list.push(obj);
    setLocal('equipes', list);
    try {
        await setDoc(doc(db, COLLECTIONS.EQUIPES, id), obj);
    } catch (e) {}
    return obj;
}

export async function fbDeleteEquipe(id) {
    let list = getLocal('equipes', []);
    list = list.filter(e => e.id !== id);
    setLocal('equipes', list);
    try {
        await deleteDoc(doc(db, COLLECTIONS.EQUIPES, id));
    } catch (e) {}
    return true;
}
