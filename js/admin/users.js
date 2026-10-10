import { showMessage, showConfirmationModal } from '../main.js';
import { getCurrentUserProfile } from '../auth.js';
import { renderGruposAdmin } from '../equipamentos/grupo.js';
import { renderEquipesAdmin } from '../equipamentos/equipe.js';
import { apiGet, apiPost } from '../api.js';

// ============================================================================
// CONFIGURAÇÃO DAS ABAS DE ADMINISTRAÇÃO
// ============================================================================

export function setupAdminTabs() {
    const adminTabsContainer = document.getElementById('admin-sub-tabs');
    if (!adminTabsContainer) return;
    
    adminTabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.admin-sub-tab')) {
            const tabId = e.target.dataset.tab;
            
            adminTabsContainer.querySelectorAll('.admin-sub-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            document.querySelectorAll('.admin-content').forEach(c => c.classList.add('hidden'));
            const contentEl = document.getElementById(`${tabId}-content`);
            if (contentEl) contentEl.classList.remove('hidden');
            
            if (tabId === 'grupos') {
                renderGruposAdmin(document.getElementById('grupos-admin-container'));
            } else if (tabId === 'equipes') {
                renderEquipesAdmin(document.getElementById('equipes-admin-container'));
            } else {
                loadAdminData(tabId);
            }
        }
    });
}

// ============================================================================
// CARREGAR DADOS DOS USUÁRIOS DA API
// ============================================================================

export async function loadAdminData(tab) {
    const container = document.getElementById(`${tab}-list`);
    if (!container) return;
    
    try {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Carregando usuários...</p>';
        
        const result = await apiGet('getUsers');
        const allUsers = Array.isArray(result) ? result : (result.data || []);
        
        if (tab === 'pendentes') {
            const pendingUsers = allUsers.filter(u => u.status && u.status.toLowerCase() === 'pendente');
            
            if (pendingUsers.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum usuário pendente no momento.</p>';
            } else {
                container.innerHTML = pendingUsers.map(user => getUserPendingCardHTML(user)).join('');
                attachPendingButtonListeners(container);
            }
            
        } else if (tab === 'gerenciar') {
            const activeUsers = allUsers.filter(u => !u.status || u.status.toLowerCase() !== 'pendente');
            
            if (activeUsers.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum usuário cadastrado.</p>';
            } else {
                container.innerHTML = activeUsers.map(user => getUserCardHTML(user)).join('');
                attachAdminButtonListeners(container);
            }
        }
    } catch (error) {
        console.warn("⚠️ API offline ao carregar usuários:", error.message);
        const currentUser = getCurrentUserProfile();
        if (tab === 'pendentes') {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum usuário pendente no momento.</p>';
        } else if (tab === 'gerenciar') {
            if (currentUser) {
                container.innerHTML = getUserCardHTML(currentUser);
            } else {
                container.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum usuário cadastrado.</p>';
            }
        }
    }
}

// ============================================================================
// HTML CARDS DOS USUÁRIOS
// ============================================================================

function getUserPendingCardHTML(user) {
    return `
    <div class="p-4 border rounded-lg flex justify-between items-center bg-amber-50" id="pending-user-card-${user.uid}">
        <div>
            <p class="font-bold text-gray-900">${user.displayName || 'Sem nome'}</p>
            <p class="text-sm text-gray-600">${user.email || 'Sem email'}</p>
            ${user.customId ? `<p class="text-xs text-gray-500">ID: ${user.customId}</p>` : ''}
            <p class="text-xs text-gray-400">UID: ${user.uid?.substring(0, 8) || '...'}</p>
        </div>
        <div class="flex gap-2">
            <button data-uid="${user.uid}" data-action="approve" 
                    class="pending-action-btn bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm transition-colors">
                Aprovar
            </button>
            <button data-uid="${user.uid}" data-action="reject" 
                    class="pending-action-btn bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors">
                Rejeitar
            </button>
        </div>
    </div>`;
}

function getUserCardHTML(user) {
    const permissions = Array.isArray(user.permissions) ? user.permissions.join(', ') : (user.permissions || 'Nenhuma');
    
    const roleColors = {
        'Master': 'bg-purple-100 text-purple-800',
        'Lider': 'bg-blue-100 text-blue-800',
        'Operação': 'bg-green-100 text-green-800',
        'Pendente': 'bg-gray-100 text-gray-800'
    };
    
    const roleColor = roleColors[user.role] || 'bg-gray-100 text-gray-800';
    
    return `
    <div class="p-4 border rounded-lg hover:shadow-md transition-shadow" id="user-card-${user.uid}">
        <div class="flex justify-between items-start">
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                    <p class="font-bold text-gray-900">${user.displayName || 'Sem nome'}</p>
                    <span class="text-xs px-2 py-1 rounded-full ${roleColor}">${user.role || 'Operação'}</span>
                </div>
                <p class="text-sm text-gray-600">${user.email || 'Sem email'}</p>
                <div class="mt-2 text-xs text-gray-500 space-y-1">
                    ${user.customId ? `<p><span class="font-medium">ID:</span> ${user.customId}</p>` : ''}
                    ${user.role !== 'Master' ? `<p><span class="font-medium">Permissões:</span> ${permissions}</p>` : ''}
                    <p><span class="font-medium">UID:</span> ${user.uid?.substring(0, 8) || '...'}</p>
                </div>
            </div>
            <div class="flex gap-2 ml-4">
                <button data-uid="${user.uid}" data-action="manage" 
                        class="admin-action-btn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors flex items-center gap-1">
                    <span class="material-symbols-outlined text-sm">edit</span>
                    Editar
                </button>
                <button data-uid="${user.uid}" data-action="delete" 
                        class="admin-action-btn bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors flex items-center gap-1">
                    <span class="material-symbols-outlined text-sm">delete</span>
                    Excluir
                </button>
            </div>
        </div>
    </div>`;
}

// ============================================================================
// LISTENERS DOS BOTÕES
// ============================================================================

function attachPendingButtonListeners(container) {
    container.querySelectorAll('.pending-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const uid = e.currentTarget.dataset.uid;
            const action = e.currentTarget.dataset.action;
            
            if (action === 'approve') {
                showConfirmationModal('Deseja aprovar este usuário?', () => approveUser(uid));
            } else if (action === 'reject') {
                showConfirmationModal('Deseja rejeitar este usuário?', () => rejectUser(uid));
            }
        });
    });
}

function attachAdminButtonListeners(container) {
    container.querySelectorAll('.admin-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const uid = e.currentTarget.dataset.uid;
            const action = e.currentTarget.dataset.action;
            
            if (action === 'delete') {
                showConfirmationModal('Tem certeza que deseja excluir este usuário?', () => deleteUser(uid));
            } else if (action === 'manage') {
                openManagementModal(uid);
            }
        });
    });
}

// ============================================================================
// FUNÇÕES DE AÇÃO (APROVAR/REJEITAR/EXCLUIR)
// ============================================================================

async function approveUser(uid) {
    try {
        await apiPost('approveUser', { uid: uid });
        
        showMessage('Sucesso', 'Usuário aprovado com sucesso!', 'success');
        
        loadAdminData('pendentes');
        loadAdminData('gerenciar');
        
    } catch (error) {
        console.error("Erro ao aprovar usuário:", error);
        showMessage('Erro', 'Falha ao aprovar usuário.', 'error');
    }
}

async function rejectUser(uid) {
    try {
        await apiPost('deleteUser', { uid: uid });
        
        showMessage('Info', 'Usuário rejeitado.', 'info');
        
        loadAdminData('pendentes');
        
    } catch (error) {
        console.error("Erro ao rejeitar usuário:", error);
        showMessage('Erro', 'Falha ao rejeitar usuário.', 'error');
    }
}

async function deleteUser(uid) {
    try {
        await apiPost('deleteUser', { uid: uid });
        
        showMessage('Sucesso', 'Usuário removido com sucesso!', 'success');
        
        loadAdminData('gerenciar');
        
    } catch (error) {
        console.error("Erro ao excluir usuário:", error);
        showMessage('Erro', 'Falha ao excluir usuário.', 'error');
    }
}

// ============================================================================
// MODAL DE GERENCIAMENTO
// ============================================================================

async function openManagementModal(uid) {
    try {
        const result = await apiGet('getUsers');
        const allUsers = Array.isArray(result) ? result : (result.data || []);
        const user = allUsers.find(u => u.uid === uid);
        
        if (!user) {
            showMessage('Erro', 'Usuário não encontrado.', 'error');
            return;
        }

        const modalPlaceholder = document.getElementById('modal-placeholder');
        modalPlaceholder.innerHTML = getManagementModalHTML(user);
        
        const modal = document.getElementById('management-modal');
        const form = document.getElementById('management-form');
        const permissionsDiv = document.getElementById('permissions-div');
        const roleRadios = form.querySelectorAll('input[name="role"]');

        roleRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isMaster = e.target.value === 'Master';
                permissionsDiv.classList.toggle('hidden', isMaster);
                
                if (isMaster) {
                    form.querySelectorAll('input[name="permissions"]').forEach(cb => {
                        cb.checked = false;
                    });
                }
            });
        });
        
        modal.classList.remove('hidden');

        const closeModal = () => modal.remove();
        
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'management-modal' || 
                e.target.id === 'close-management-modal' || 
                e.target.id === 'cancel-management') {
                closeModal();
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const newRole = form.role.value;
            let permissions = [];
            
            if (newRole !== 'Master') {
                form.querySelectorAll('input[name="permissions"]:checked').forEach(checkbox => {
                    permissions.push(checkbox.value);
                });
            }
            
            if (newRole !== 'Master' && permissions.length === 0) {
                showMessage('Atenção', 'Usuários não-Master precisam ter pelo menos uma permissão.', 'warning');
                return;
            }
            
            try {
                await apiPost('editUser', {
                    uid: uid,
                    role: newRole,
                    permissions: permissions.join(','),
                    updatedAt: new Date().toISOString()
                });
                
                showMessage('Sucesso', 'Usuário atualizado com sucesso!', 'success');
                loadAdminData('gerenciar');
                closeModal();
                
            } catch (error) {
                console.error("Erro ao atualizar usuário:", error);
                showMessage('Erro', 'Falha ao atualizar usuário.', 'error');
            }
        });
        
    } catch (error) {
        console.error("Erro ao abrir modal:", error);
        showMessage('Erro', 'Falha ao carregar dados do usuário.', 'error');
    }
}

function getManagementModalHTML(user) {
    const userPermissions = Array.isArray(user.permissions) ? user.permissions : [];
    const isMaster = user.role === 'Master';
    
    return `
    <div id="management-modal" class="modal-container fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div class="modal-content bg-white rounded-lg shadow-2xl p-8 max-w-lg w-full relative">
            <h2 class="text-2xl font-bold text-gray-900 mb-4">Gerenciar Usuário</h2>
            
            <button id="close-management-modal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-3xl leading-none">&times;</button>
            
            <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                <p class="mb-1"><span class="font-medium">Usuário:</span> ${user.displayName || 'Sem nome'}</p>
                <p class="mb-1"><span class="font-medium">Email:</span> ${user.email || 'Sem email'}</p>
                ${user.customId ? `<p class="mb-1"><span class="font-medium">ID:</span> ${user.customId}</p>` : ''}
                <p class="mb-1"><span class="font-medium">UID:</span> ${user.uid}</p>
            </div>
            
            <form id="management-form">
                <div class="mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-3">Nível de Acesso</label>
                    <div class="flex flex-wrap gap-4">
                        <label class="flex items-center gap-2">
                            <input type="radio" name="role" value="Master" ${user.role === 'Master' ? 'checked' : ''} class="text-purple-600">
                            <span class="text-sm">Master</span>
                        </label>
                        <label class="flex items-center gap-2">
                            <input type="radio" name="role" value="Lider" ${user.role === 'Lider' ? 'checked' : ''} class="text-blue-600">
                            <span class="text-sm">Líder</span>
                        </label>
                        <label class="flex items-center gap-2">
                            <input type="radio" name="role" value="Operação" ${user.role === 'Operação' ? 'checked' : ''} class="text-green-600">
                            <span class="text-sm">Operação</span>
                        </label>
                    </div>
                </div>
                
                <div id="permissions-div" class="${isMaster ? 'hidden' : ''} mb-6">
                    <label class="block text-sm font-medium text-gray-700 mb-3">Permissões de Aba</label>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <label class="flex items-center gap-2 p-2 border rounded hover:bg-gray-50">
                            <input type="checkbox" name="permissions" value="implementos" 
                                ${userPermissions.includes('implementos') ? 'checked' : ''} 
                                class="text-emerald-600 rounded">
                            <span class="text-sm">Implementos</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 border rounded hover:bg-gray-50">
                            <input type="checkbox" name="permissions" value="limites" 
                                ${userPermissions.includes('limites') ? 'checked' : ''} 
                                class="text-amber-600 rounded">
                            <span class="text-sm">Equipamentos</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 border rounded hover:bg-gray-50">
                            <input type="checkbox" name="permissions" value="historico" 
                                ${userPermissions.includes('historico') ? 'checked' : ''} 
                                class="text-slate-600 rounded">
                            <span class="text-sm">Histórico</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 border rounded bg-gray-100 opacity-60">
                            <input type="checkbox" name="permissions" value="cadastro" disabled class="rounded">
                            <span class="text-sm text-gray-500">Cadastro (Master)</span>
                        </label>
                    </div>
                    <p class="text-xs text-gray-500 mt-2">* Usuários Master têm acesso a todas as abas automaticamente</p>
                </div>
                
                <div class="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" id="cancel-management" 
                            class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md transition-colors">
                        Cancelar
                    </button>
                    <button type="submit" 
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">save</span>
                        Salvar Alterações
                    </button>
                </div>
            </form>
        </div>
    </div>`;
}

// ============================================================================
// ADICIONAR NOVO USUÁRIO - VERSÃO CORRIGIDA COM CAMPOS DE PERMISSÃO
// ============================================================================

// ============================================================================
// ADICIONAR NOVO USUÁRIO - VERSÃO CORRIGIDA COM SENHA PADRÃO
// ============================================================================

export async function handleAddUser(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.elements['new-user-email']?.value;
    const displayName = form.elements['new-user-name']?.value;
    const customId = form.elements['new-user-id']?.value;
    const role = form.elements['new-user-role']?.value;
    
    // Coletar permissões selecionadas
    const permissions = [];
    form.querySelectorAll('input[name="new-user-permissions"]:checked').forEach(cb => {
        permissions.push(cb.value);
    });

    if (!displayName || !email) {
        return showMessage('Erro', 'Os campos Nome e E-mail são obrigatórios.', 'error');
    }
    
    if (!email.includes('@') || !email.includes('.')) {
        return showMessage('Erro', 'Por favor, insira um e-mail válido.', 'error');
    }
    
    // VALIDAÇÃO: Usuários não-Master não podem criar usuários Master
    const currentUser = getCurrentUserProfile();
    if (role === 'Master' && currentUser.role !== 'Master') {
        return showMessage('Erro', 'Apenas usuários Master podem criar outros usuários Master.', 'error');
    }
    
    // Validação: Usuários não-Master precisam ter pelo menos uma permissão
    if (role !== 'Master' && permissions.length === 0) {
        return showMessage('Erro', 'Usuários não-Master precisam ter pelo menos uma permissão.', 'error');
    }
    
    try {
        const result = await apiGet('getUsers');
        const allUsers = Array.isArray(result) ? result : (result.data || []);
        
        const emailExists = allUsers.some(u => u.email === email);
        
        if (emailExists) {
            return showMessage('Erro', 'Este e-mail já está cadastrado.', 'error');
        }
        
        // 🔥 SENHA PADRÃO: a123456@
        const senhaPadrao = 'a123456@';
        
        await apiPost('addUser', {
            email: email,
            displayName: displayName,
            customId: customId || '',
            status: 'Pendente',
            role: role || 'Operação',
            permissions: permissions.join(','),
            senha: senhaPadrao,  // 🔥 Enviar senha padrão
            primeiroAcesso: true   // 🔥 Marcar como primeiro acesso
        });
        
        showMessage('Sucesso', `Solicitação para ${displayName} (${email}) enviada para aprovação! Senha padrão: ${senhaPadrao}`, 'success');
        
        form.reset();
        
        const pendentesTab = document.querySelector('.admin-sub-tab[data-tab="pendentes"]');
        if (pendentesTab) pendentesTab.click();
        
    } catch (error) {
        console.error("Erro ao adicionar usuário:", error);
        showMessage('Erro', 'Falha ao adicionar usuário.', 'error');
    }
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

export async function getUsersList() {
    const result = await apiGet('getUsers');
    const allUsers = Array.isArray(result) ? result : (result.data || []);
    return allUsers.filter(u => !u.status || u.status.toLowerCase() !== 'pendente');
}

export async function getPendingUsersList() {
    const result = await apiGet('getUsers');
    const allUsers = Array.isArray(result) ? result : (result.data || []);
    return allUsers.filter(u => u.status && u.status.toLowerCase() === 'pendente');
}

export async function findUserByEmail(email) {
    const result = await apiGet('getUsers');
    const allUsers = Array.isArray(result) ? result : (result.data || []);
    return allUsers.find(u => u.email === email) || null;
}

export async function findUserByUid(uid) {
    const result = await apiGet('getUsers');
    const allUsers = Array.isArray(result) ? result : (result.data || []);
    return allUsers.find(u => u.uid === uid) || null;
}