import { 
    apiGet,
    apiPost
} from '../api.js';
import { showMessage } from '../main.js';

const EQUIPES_PADRAO = ['Tratos', 'Preparo', 'Herbicida', 'Plantio', 'Colheita'];
let equipesCache = [];

export async function loadEquipes() {
    try {
        const result = await apiGet('getEquipes');
        const equipesPlanilha = Array.isArray(result) ? result : (result.data || []);
        
        if (!equipesPlanilha || equipesPlanilha.length === 0) {
            equipesCache = EQUIPES_PADRAO.map((nome, index) => ({ id: `temp-${index}`, nome }));
        } else {
            equipesCache = equipesPlanilha.map(d => ({ 
                id: d.id, 
                nome: d.nome 
            }));
            equipesCache.sort((a, b) => a.nome.localeCompare(b.nome));
        }
        
        console.log("Equipes carregadas:", equipesCache.length);
        return equipesCache;
        
    } catch (e) { 
        console.error("Erro ao carregar equipes:", e);
        equipesCache = EQUIPES_PADRAO.map((nome, index) => ({ id: `temp-${index}`, nome }));
        return equipesCache;
    }
}

export async function populateEquipeSelect(selectEl, valorSelecionado = '') {
    if (!selectEl) return;
    const equipes = await loadEquipes();
    selectEl.innerHTML = '<option value="">Selecione a equipe...</option>';
    equipes.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.nome;
        opt.textContent = e.nome;
        if (e.nome === valorSelecionado) opt.selected = true;
        selectEl.appendChild(opt);
    });
}

export function renderEquipesAdmin(container, isPopup = false) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="space-y-4">
            <div class="flex gap-2">
                <input type="text" id="${isPopup ? 'popup-nova-equipe' : 'nova-equipe-input'}" class="flex-1 p-2 border rounded-lg" placeholder="Nova equipe">
                <button id="${isPopup ? 'popup-add-equipe' : 'add-equipe-btn'}" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">Adicionar</button>
            </div>
            <div id="${isPopup ? 'popup-equipes-list' : 'equipes-list'}" class="divide-y border rounded-lg bg-white max-h-60 overflow-y-auto"></div>
        </div>
    `;
    
    const addBtn = document.getElementById(isPopup ? 'popup-add-equipe' : 'add-equipe-btn');
    if (addBtn) {
        addBtn.addEventListener('click', isPopup ? handleAddEquipePopup : handleAddEquipe);
    }
    
    if (isPopup) {
        carregarEquipesPopup();
    } else {
        renderEquipesList();
    }
}

async function renderEquipesList(isPopup = false) {
    const list = document.getElementById(isPopup ? 'popup-equipes-list' : 'equipes-list');
    if (!list) return;
    
    const equipes = await loadEquipes();
    
    if (equipes.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">Nenhuma equipe cadastrada.</p>';
        return;
    }
    
    list.innerHTML = equipes.map(e => `
        <li class="flex justify-between items-center p-3 hover:bg-gray-50">
            <span class="font-medium">${e.nome}</span>
            <div class="flex gap-2">
                <button onclick="window.editEquipe('${e.id}', '${e.nome}')" class="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50 transition-all" title="Editar">
                    <span class="material-symbols-outlined text-base">edit</span>
                </button>
                <button onclick="window.deleteEquipe('${e.id}', '${e.nome}')" class="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition-all" title="Excluir">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>
            </div>
        </li>
    `).join('');
}

async function carregarEquipesPopup() {
    const list = document.getElementById('popup-equipes-list');
    if (!list) return;
    
    const equipes = await loadEquipes();
    
    if (equipes.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">Nenhuma equipe cadastrada.</p>';
        return;
    }
    
    list.innerHTML = equipes.map(e => `
        <li class="flex justify-between items-center p-3 hover:bg-gray-50">
            <span class="font-medium">${e.nome}</span>
            <div class="flex gap-2">
                <button onclick="window.editEquipePopup('${e.id}', '${e.nome}')" class="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50 transition-all" title="Editar">
                    <span class="material-symbols-outlined text-base">edit</span>
                </button>
                <button onclick="window.deleteEquipePopup('${e.id}', '${e.nome}')" class="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition-all" title="Excluir">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>
            </div>
        </li>
    `).join('');
}

async function handleAddEquipe() {
    const input = document.getElementById('nova-equipe-input');
    const nome = input.value.trim();
    if (!nome) {
        showMessage('Erro', 'Digite um nome para a equipe.', 'error');
        return;
    }
    
    try {
        await apiPost('saveEquipe', { nome });
        input.value = '';
        await loadEquipes();
        renderEquipesList();
        updateAllSelects();
        showMessage('Sucesso', 'Equipe adicionada!', 'success');
    } catch (error) {
        console.error("Erro ao adicionar equipe:", error);
        showMessage('Erro', 'Falha ao adicionar equipe.', 'error');
    }
}

async function handleAddEquipePopup() {
    const input = document.getElementById('popup-nova-equipe');
    const nome = input.value.trim();
    if (!nome) {
        showMessage('Erro', 'Digite um nome para a equipe.', 'error');
        return;
    }
    
    try {
        await apiPost('saveEquipe', { nome });
        input.value = '';
        await carregarEquipesPopup();
        showMessage('Sucesso', 'Equipe adicionada!', 'success');
    } catch (error) {
        console.error("Erro ao adicionar equipe:", error);
        showMessage('Erro', 'Falha ao adicionar equipe.', 'error');
    }
}

window.editEquipe = async (id, nomeAntigo) => {
    if (!id || id.startsWith('temp-')) {
        showMessage('Aviso', 'Equipes padrão não podem ser editadas. Crie uma nova equipe.', 'warning');
        return;
    }
    
    const novoNome = prompt('Editar nome da equipe:', nomeAntigo);
    if (novoNome && novoNome.trim()) {
        try {
            await apiPost('updateEquipe', { 
                id: id, 
                nome: novoNome.trim() 
            });
            await loadEquipes();
            renderEquipesList();
            updateAllSelects();
            showMessage('Sucesso', 'Equipe atualizada!', 'success');
        } catch (error) {
            console.error("Erro ao editar equipe:", error);
            showMessage('Erro', 'Falha ao editar equipe.', 'error');
        }
    }
};

window.editEquipePopup = async (id, nomeAntigo) => {
    if (!id || id.startsWith('temp-')) {
        showMessage('Aviso', 'Equipes padrão não podem ser editadas. Crie uma nova equipe.', 'warning');
        return;
    }
    
    const novoNome = prompt('Editar nome da equipe:', nomeAntigo);
    if (novoNome && novoNome.trim()) {
        try {
            await apiPost('updateEquipe', { 
                id: id, 
                nome: novoNome.trim() 
            });
            await carregarEquipesPopup();
            showMessage('Sucesso', 'Equipe atualizada!', 'success');
        } catch (error) {
            console.error("Erro ao editar equipe:", error);
            showMessage('Erro', 'Falha ao editar equipe.', 'error');
        }
    }
};

window.deleteEquipe = async (id, nome) => {
    if (!id || id.startsWith('temp-')) {
        showMessage('Aviso', 'Equipes padrão não podem ser excluídas.', 'warning');
        return;
    }
    
    if (confirm(`Tem certeza que deseja excluir a equipe "${nome}"?`)) {
        try {
            await apiPost('deleteEquipe', { id });
            await loadEquipes();
            renderEquipesList();
            updateAllSelects();
            showMessage('Sucesso', 'Equipe excluída!', 'success');
        } catch (error) {
            console.error("Erro ao excluir equipe:", error);
            showMessage('Erro', 'Falha ao excluir equipe.', 'error');
        }
    }
};

window.deleteEquipePopup = async (id, nome) => {
    if (!id || id.startsWith('temp-')) {
        showMessage('Aviso', 'Equipes padrão não podem ser excluídas.', 'warning');
        return;
    }
    
    if (confirm(`Tem certeza que deseja excluir a equipe "${nome}"?`)) {
        try {
            await apiPost('deleteEquipe', { id });
            await carregarEquipesPopup();
            showMessage('Sucesso', 'Equipe excluída!', 'success');
        } catch (error) {
            console.error("Erro ao excluir equipe:", error);
            showMessage('Erro', 'Falha ao excluir equipe.', 'error');
        }
    }
};

function updateAllSelects() {
    document.querySelectorAll('select[name="equipe"]').forEach(select => {
        const valorAtual = select.value;
        populateEquipeSelect(select, valorAtual);
    });
}

window.openEquipesPopup = function() {
    const modalPlaceholder = document.getElementById('modal-placeholder');
    modalPlaceholder.innerHTML = `
        <div id="popup-equipes" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
                <button onclick="this.closest('#popup-equipes').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-2xl">&times;</button>
                <h2 class="text-xl font-bold mb-4">Gerenciar Equipes</h2>
                <div id="popup-content-area"></div>
                <div class="mt-6 text-right">
                    <button onclick="this.closest('#popup-equipes').remove()" class="bg-gray-800 text-white px-6 py-2 rounded-lg">Fechar</button>
                </div>
            </div>
        </div>`;
    
    renderEquipesAdmin(document.getElementById('popup-content-area'), true);
};