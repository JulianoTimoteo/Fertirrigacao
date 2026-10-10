// ============================================================================
// dashboard/perfil.js
// Submenu interativo e animado do Avatar (JT)
// Permite alterar Nome de Exibição, Usuário e Senha diretamente no Firebase
// ============================================================================

import { fbUpdateUser } from '../firebase-service.js';
import { showMessage } from '../main.js';

let _currentProfile = null;
let _onProfileUpdatedCallback = null;

export function setupProfileMenu(user, profile, onProfileUpdated, onLogout) {
    _currentProfile = profile;
    _onProfileUpdatedCallback = onProfileUpdated;

    const avatarBtn = document.getElementById('avatar-btn');
    const profileMenu = document.getElementById('profile-menu');
    const caret = document.getElementById('avatar-caret');

    if (!avatarBtn || !profileMenu) return;

    // Toggle do submenu animado
    avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !profileMenu.classList.contains('hidden');
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    function openMenu() {
        profileMenu.classList.remove('hidden', 'closing');
        if (caret) caret.style.transform = 'rotate(180deg)';
    }

    function closeMenu() {
        profileMenu.classList.add('closing');
        if (caret) caret.style.transform = 'rotate(0deg)';
        setTimeout(() => {
            profileMenu.classList.add('hidden');
            profileMenu.classList.remove('closing');
        }, 180);
    }

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
        if (!profileMenu.contains(e.target) && !avatarBtn.contains(e.target)) {
            if (!profileMenu.classList.contains('hidden')) {
                closeMenu();
            }
        }
    });

    // Opção: Mudar Nome de Exibição
    document.getElementById('btn-edit-displayname')?.addEventListener('click', () => {
        closeMenu();
        openEditDisplayNameModal();
    });

    // Opção: Mudar Usuário e Senha
    document.getElementById('btn-edit-credentials')?.addEventListener('click', () => {
        closeMenu();
        openEditCredentialsModal();
    });

    // Opção: Logout
    document.getElementById('menu-logout-btn')?.addEventListener('click', () => {
        closeMenu();
        if (onLogout) onLogout();
    });
}

// ============================================================================
// MODAL: ALTERAR NOME DE EXIBIÇÃO
// ============================================================================

export function openEditDisplayNameModal() {
    const modalPlaceholder = document.getElementById('modal-placeholder');
    if (!modalPlaceholder) return;

    const currentName = _currentProfile?.displayName || '';

    modalPlaceholder.innerHTML = `
        <div id="displayname-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div class="modal-profile-animated rounded-2xl shadow-2xl max-w-md w-full p-6 relative" style="background:var(--bg-2);border:1px solid var(--border-1)">
                <button id="close-dn-modal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-2xl leading-none">&times;</button>
                
                <div class="flex items-center gap-3 mb-4">
                    <div class="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                        <span class="material-symbols-outlined text-2xl">badge</span>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold" style="color:var(--text-1)">Nome de Exibição</h3>
                        <p class="text-xs" style="color:var(--text-2)">Como você aparece no topo e nas operações</p>
                    </div>
                </div>

                <form id="form-displayname" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold mb-1" style="color:var(--text-1)">Novo Nome Completo / Exibição</label>
                        <input type="text" id="input-new-displayname" value="${currentName}" required 
                               class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm font-medium" 
                               style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                    </div>

                    <div class="flex justify-end gap-2 pt-2">
                        <button type="button" id="cancel-dn-btn" class="px-4 py-2 rounded-xl text-sm font-medium" style="background:var(--bg-3);color:var(--text-1)">
                            Cancelar
                        </button>
                        <button type="submit" id="save-dn-btn" class="px-5 py-2 bg-[#40800c] hover:bg-[#306009] text-white rounded-xl text-sm font-bold shadow-md transition-all">
                            Salvar Alteração
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    const closeModal = () => modalPlaceholder.innerHTML = '';
    document.getElementById('close-dn-modal')?.addEventListener('click', closeModal);
    document.getElementById('cancel-dn-btn')?.addEventListener('click', closeModal);

    document.getElementById('form-displayname')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('input-new-displayname').value.trim();
        if (!newName) return;

        const btn = document.getElementById('save-dn-btn');
        btn.disabled = true;
        btn.textContent = 'Salvando no Firebase...';

        try {
            await fbUpdateUser(_currentProfile.uid, { displayName: newName });
            
            // Atualiza objeto em memória
            _currentProfile.displayName = newName;
            
            // Notifica e atualiza DOM
            if (_onProfileUpdatedCallback) {
                _onProfileUpdatedCallback(_currentProfile);
            }

            closeModal();
            showMessage('Sucesso', 'Nome de exibição atualizado com sucesso no Firebase!', 'success');
        } catch (err) {
            console.error('Erro ao atualizar nome:', err);
            showMessage('Erro', 'Não foi possível salvar o nome de exibição.', 'error');
            btn.disabled = false;
            btn.textContent = 'Salvar Alteração';
        }
    });
}

// ============================================================================
// MODAL: ALTERAR USUÁRIO E SENHA
// ============================================================================

export function openEditCredentialsModal() {
    const modalPlaceholder = document.getElementById('modal-placeholder');
    if (!modalPlaceholder) return;

    const currentUsername = _currentProfile?.username || _currentProfile?.email?.split('@')[0] || '';

    modalPlaceholder.innerHTML = `
        <div id="credentials-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div class="modal-profile-animated rounded-2xl shadow-2xl max-w-md w-full p-6 relative" style="background:var(--bg-2);border:1px solid var(--border-1)">
                <button id="close-cred-modal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-2xl leading-none">&times;</button>
                
                <div class="flex items-center gap-3 mb-4">
                    <div class="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                        <span class="material-symbols-outlined text-2xl">key</span>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold" style="color:var(--text-1)">Credenciais de Acesso</h3>
                        <p class="text-xs" style="color:var(--text-2)">Altere seu usuário e defina uma nova senha</p>
                    </div>
                </div>

                <form id="form-credentials" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold mb-1" style="color:var(--text-1)">Nome de Usuário (Login)</label>
                        <input type="text" id="input-new-username" value="${currentUsername}" required 
                               class="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-amber-500 text-sm font-medium" 
                               style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                        <p class="text-[11px] text-gray-400 mt-1">Usado para fazer login no sistema</p>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold mb-1" style="color:var(--text-1)">Nova Senha *</label>
                        <div class="relative">
                            <input type="password" id="input-new-password" required placeholder="Digite a nova senha"
                                   class="w-full p-2.5 pr-10 border rounded-xl focus:ring-2 focus:ring-amber-500 text-sm" 
                                   style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                            <button type="button" id="toggle-pwd-btn" class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                                <span class="material-symbols-outlined text-lg" id="pwd-icon">visibility</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold mb-1" style="color:var(--text-1)">Confirmar Nova Senha *</label>
                        <input type="password" id="input-confirm-password" required placeholder="Repita a nova senha"
                               class="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-amber-500 text-sm" 
                               style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                    </div>

                    <div id="cred-error-msg" class="text-xs text-red-500 font-semibold hidden"></div>

                    <div class="flex justify-end gap-2 pt-2">
                        <button type="button" id="cancel-cred-btn" class="px-4 py-2 rounded-xl text-sm font-medium" style="background:var(--bg-3);color:var(--text-1)">
                            Cancelar
                        </button>
                        <button type="submit" id="save-cred-btn" class="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold shadow-md transition-all">
                            Gravar no Firebase
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    const closeModal = () => modalPlaceholder.innerHTML = '';
    document.getElementById('close-cred-modal')?.addEventListener('click', closeModal);
    document.getElementById('cancel-cred-btn')?.addEventListener('click', closeModal);

    // Toggle de visualização da senha
    const pwdInput = document.getElementById('input-new-password');
    const pwdIcon = document.getElementById('pwd-icon');
    document.getElementById('toggle-pwd-btn')?.addEventListener('click', () => {
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            pwdIcon.textContent = 'visibility_off';
        } else {
            pwdInput.type = 'password';
            pwdIcon.textContent = 'visibility';
        }
    });

    document.getElementById('form-credentials')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newUsername = document.getElementById('input-new-username').value.trim();
        const newPassword = document.getElementById('input-new-password').value;
        const confirmPassword = document.getElementById('input-confirm-password').value;
        const errEl = document.getElementById('cred-error-msg');

        errEl.classList.add('hidden');

        if (!newUsername) {
            errEl.textContent = 'O nome de usuário não pode estar vazio.';
            errEl.classList.remove('hidden');
            return;
        }

        if (newPassword.length < 6) {
            errEl.textContent = 'A nova senha deve ter no mínimo 6 caracteres.';
            errEl.classList.remove('hidden');
            return;
        }

        if (newPassword !== confirmPassword) {
            errEl.textContent = 'As senhas informadas não coincidem.';
            errEl.classList.remove('hidden');
            return;
        }

        const btn = document.getElementById('save-cred-btn');
        btn.disabled = true;
        btn.textContent = 'Atualizando no Firebase...';

        try {
            await fbUpdateUser(_currentProfile.uid, {
                username: newUsername,
                senha: newPassword
            });

            _currentProfile.username = newUsername;
            _currentProfile.senha = newPassword;

            if (_onProfileUpdatedCallback) {
                _onProfileUpdatedCallback(_currentProfile);
            }

            closeModal();
            showMessage('Sucesso', 'Usuário e senha gravados diretamente no Firebase com sucesso!', 'success');
        } catch (err) {
            console.error('Erro ao atualizar credenciais:', err);
            errEl.textContent = 'Falha ao atualizar credenciais.';
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Gravar no Firebase';
        }
    });
}
