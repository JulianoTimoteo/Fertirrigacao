import { 
    apiGet,
    apiPost
} from '../api.js';
import { showMessage } from '../main.js';

const GRUPOS_PADRAO = ['Sulcador', 'Grade', 'Subsolador', 'Pulverizador', 'Plantadeira', 'Colheitadeira'];
let gruposCache = [];

export async function loadGrupos() {
    try {
        const result = await apiGet('getGrupos');
        const gruposPlanilha = Array.isArray(result) ? result : (result.data || []);
        
        if (!gruposPlanilha || gruposPlanilha.length === 0) {
            gruposCache = GRUPOS_PADRAO.map((nome, index) => ({ id: `temp-${index}`, nome }));
        } else {
            gruposCache = gruposPlanilha.map(d => ({ 
                id: d.id, 
                nome: d.nome 
            }));
            gruposCache.sort((a, b) => a.nome.localeCompare(b.nome));
        }
        
        console.log("Grupos carregados:", gruposCache.length);
        return gruposCache;
        
    } catch (e) { 
        console.error("Erro ao carregar grupos:", e);
        gruposCache = GRUPOS_PADRAO.map((nome, index) => ({ id: `temp-${index}`, nome }));
        return gruposCache;
    }
}

export async function populateGrupoSelect(selectEl, valorSelecionado = '') {
    if (!selectEl) return;
    const grupos = await loadGrupos();
    selectEl.innerHTML = '<option value="">Selecione o grupo...</option>';
    grupos.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.nome;
        opt.textContent = g.nome;
        if (g.nome === valorSelecionado) opt.selected = true;
        selectEl.appendChild(opt);
    });
}

export function renderGruposAdmin(container, isPopup = false) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="space-y-4">
            <div class="flex gap-2">
                <input type="text" id="${isPopup ? 'popup-novo-grupo' : 'novo-grupo-input'}" class="flex-1 p-2 border rounded-lg" placeholder="Novo grupo">
                <button id="${isPopup ? 'popup-add-grupo' : 'add-grupo-btn'}" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">Adicionar</button>
            </div>
            <div id="${isPopup ? 'popup-grupos-list' : 'grupos-list'}" class="divide-y border rounded-lg bg-white max-h-60 overflow-y-auto"></div>
        </div>
    `;
    
    const addBtn = document.getElementById(isPopup ? 'popup-add-grupo' : 'add-grupo-btn');
    if (addBtn) {
        addBtn.addEventListener('click', isPopup ? handleAddGrupoPopup : handleAddGrupo);
    }
    
    if (isPopup) {
        carregarGruposPopup();
    } else {
        renderGruposList();
    }
}

async function renderGruposList(isPopup = false) {
    const list = document.getElementById(isPopup ? 'popup-grupos-list' : 'grupos-list');
    if (!list) return;
    
    const grupos = await loadGrupos();
    
    if (grupos.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">Nenhum grupo cadastrado.</p>';
        return;
    }
    
    list.innerHTML = grupos.map(g => `
        <li class="flex justify-between items-center p-3 hover:bg-gray-50">
            <span class="font-medium">${g.nome}</span>
            <div class="flex gap-2">
                <button onclick="window.editGrupo('${g.id}', '${g.nome}')" class="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50 transition-all" title="Editar">
                    <span class="material-symbols-outlined text-base">edit</span>
                </button>
                <button onclick="window.deleteGrupo('${g.id}', '${g.nome}')" class="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition-all" title="Excluir">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>
            </div>
        </li>
    `).join('');
}

async function carregarGruposPopup() {
    const list = document.getElementById('popup-grupos-list');
    if (!list) return;
    
    const grupos = await loadGrupos();
    
    if (grupos.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">Nenhum grupo cadastrado.</p>';
        return;
    }
    
    list.innerHTML = grupos.map(g => `
        <li class="flex justify-between items-center p-3 hover:bg-gray-50">
            <span class="font-medium">${g.nome}</span>
            <div class="flex gap-2">
                <button onclick="window.editGrupoPopup('${g.id}', '${g.nome}')" class="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50 transition-all" title="Editar">
                    <span class="material-symbols-outlined text-base">edit</span>
                </button>
                <button onclick="window.deleteGrupoPopup('${g.id}', '${g.nome}')" class="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition-all" title="Excluir">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>
            </div>
        </li>
    `).join('');
}

async function handleAddGrupo() {
    const input = document.getElementById('novo-grupo-input');
    const nome = input.value.trim();
    if (!nome) {
        showMessage('Erro', 'Digite um nome para o grupo.', 'error');
        return;
    }
    
    try {
        await apiPost('saveGrupo', { nome });
        input.value = '';
        await loadGrupos();
        renderGruposList();
        updateAllSelects();
        showMessage('Sucesso', 'Grupo adicionado!', 'success');
    } catch (error) {
        console.error("Erro ao adicionar grupo:", error);
        showMessage('Erro', 'Falha ao adicionar grupo.', 'error');
    }
}

async function handleAddGrupoPopup() {
    const input = document.getElementById('popup-novo-grupo');
    const nome = input.value.trim();
    if (!nome) {
        showMessage('Erro', 'Digite um nome para o grupo.', 'error');
        return;
    }
    
    try {
        await apiPost('saveGrupo', { nome });
        input.value = '';
        await carregarGruposPopup();
        showMessage('Sucesso', 'Grupo adicionado!', 'success');
    } catch (error) {
        console.error("Erro ao adicionar grupo:", error);
        showMessage('Erro', 'Falha ao adicionar grupo.', 'error');
    }
}

window.editGrupo = async (id, nomeAntigo) => {
    if (!id || id.startsWith('temp-')) {
        showMessage('Aviso', 'Grupos padrão não podem ser editados. Crie um novo grupo.', 'warning');
        return;
    }
    
    const novoNome = prompt('Editar nome do grupo:', nomeAntigo);
    if (novoNome && novoNome.trim()) {
        try {
            await apiPost('updateGrupo', { 
                id: id, 
                nome: novoNome.trim() 
            });
            await loadGrupos();
            renderGruposList();
            updateAllSelects();
            showMessage('Sucesso', 'Grupo atualizado!', 'success');
        } catch (error) {
            console.error("Erro ao editar grupo:", error);
            showMessage('Erro', 'Falha ao editar grupo.', 'error');
        }
    }
};

window.editGrupoPopup = async (id, nomeAntigo) => {
    if (!id || id.startsWith('temp-')) {
        showMessage('Aviso', 'Grupos padrão não podem ser editados. Crie um novo grupo.', 'warning');
        return;
    }
    
    const novoNome = prompt('Editar nome do grupo:', nomeAntigo);
    if (novoNome && novoNome.trim()) {
        try {
            await apiPost('updateGrupo', { 
                id: id, 
                nome: novoNome.trim() 
            });
            await carregarGruposPopup();
            showMessage('Sucesso', 'Grupo atualizado!', 'success');
        } catch (error) {
            console.error("Erro ao editar grupo:", error);
            showMessage('Erro', 'Falha ao editar grupo.', 'error');
        }
    }
};

window.deleteGrupo = async (id, nome) => {
    if (!id || id.startsWith('temp-')) {
        showMessage('Aviso', 'Grupos padrão não podem ser excluídos.', 'warning');
        return;
    }
    
    if (confirm(`Tem certeza que deseja excluir o grupo "${nome}"?`)) {
        try {
            await apiPost('deleteGrupo', { id });
            await loadGrupos();
            renderGruposList();
            updateAllSelects();
            showMessage('Sucesso', 'Grupo excluído!', 'success');
        } catch (error) {
            console.error("Erro ao excluir grupo:", error);
            showMessage('Erro', 'Falha ao excluir grupo.', 'error');
        }
    }
};

window.deleteGrupoPopup = async (id, nome) => {
    if (!id || id.startsWith('temp-')) {
        showMessage('Aviso', 'Grupos padrão não podem ser excluídos.', 'warning');
        return;
    }
    
    if (confirm(`Tem certeza que deseja excluir o grupo "${nome}"?`)) {
        try {
            await apiPost('deleteGrupo', { id });
            await carregarGruposPopup();
            showMessage('Sucesso', 'Grupo excluído!', 'success');
        } catch (error) {
            console.error("Erro ao excluir grupo:", error);
            showMessage('Erro', 'Falha ao excluir grupo.', 'error');
        }
    }
};

function updateAllSelects() {
    document.querySelectorAll('select[name="grupo"], #grupo-filter').forEach(select => {
        const valorAtual = select.value;
        populateGrupoSelect(select, valorAtual);
    });
}

window.openGruposPopup = function() {
    const modalPlaceholder = document.getElementById('modal-placeholder');
    modalPlaceholder.innerHTML = `
        <div id="popup-grupos" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
                <button onclick="this.closest('#popup-grupos').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-2xl">&times;</button>
                <h2 class="text-xl font-bold mb-4">Gerenciar Grupos</h2>
                <div id="popup-content-area"></div>
                <div class="mt-6 text-right">
                    <button onclick="this.closest('#popup-grupos').remove()" class="bg-gray-800 text-white px-6 py-2 rounded-lg">Fechar</button>
                </div>
            </div>
        </div>`;
    
    renderGruposAdmin(document.getElementById('popup-content-area'), true);
};