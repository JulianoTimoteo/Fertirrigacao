import { 
    apiGet,
    apiPost
} from './api.js';

import { 
    setupAuthListeners, 
    getCurrentUserProfile,
    setCurrentUserProfile,
    handlePasswordReset,
    handleLogout
} from './auth.js';

import { 
    setupImplementosSelector,
    unsubscribeAll,
    destroyCharts,
    setRefreshTime,
    forcarAtualizacaoImplementos
} from './dashboard/tratos.js';

import { 
    setupHistoricoTab,
    destroyHistoricoChart
} from './dashboard/historico.js';

import { 
    setupEquipamentosTab
} from './equipamentos/equipamentos.js';

import { 
    setupAdminTabs,
    loadAdminData,
    handleAddUser
} from './admin/users.js';

import { formatarTimestampFixo } from './dashboard/regras.js';

// 🔥 IMPORTAÇÃO DO MÓDULO DE FERTIRRIGAÇÃO
import fertirrigacao from './fertirrigacao/index.js';

// 🌟 IMPORTAÇÃO DO SUBMENU DE PERFIL / AVATAR
import { setupProfileMenu } from './dashboard/perfil.js';

// Variável global do perfil do usuário
let currentUserProfile = null;

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

export function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    
    try {
        const date = formatarTimestampFixo(timestamp);
        
        if (isNaN(date.getTime()) || date.getFullYear() < 2000) {
            return 'Data não disponível';
        }
        
        return date.toLocaleString('pt-BR', { 
            dateStyle: 'short', 
            timeStyle: 'medium' 
        });
    } catch (e) {
        console.error("Erro ao formatar timestamp:", e);
        return 'Erro na data';
    }
}

export function showMessage(title, message, type = 'info') {
    const existingDialog = document.getElementById('custom-dialog');
    if (existingDialog) existingDialog.remove();
    
    let bgColor = type === 'error' ? 'bg-red-500' : 
                  (type === 'warning' ? 'bg-amber-500' : 
                  (type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'));
    
    const dialogContainer = document.createElement('div');
    dialogContainer.id = 'custom-dialog';
    dialogContainer.className = "fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100] p-4";
    dialogContainer.innerHTML = `<div class="modal-content rounded-xl shadow-2xl p-6 max-w-sm w-full" style="background:var(--bg-2);border:1px solid var(--border-1);">
        <div class="flex items-start gap-3">
            <div class="p-2 rounded-full ${bgColor} text-white flex-shrink-0">
                ${type === 'success' ? 
                    '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>' : 
                    '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'}
            </div>
            <div>
                <h3 class="text-base font-semibold" style="color:var(--text-1)">${title}</h3>
                <p class="text-sm mt-1" style="color:var(--text-2)">${message}</p>
            </div>
        </div>
        <div class="mt-5 text-right">
            <button id="dialog-ok-button" class="py-2 px-5 ${bgColor} text-white rounded-lg text-sm font-bold">OK</button>
        </div>
    </div>`;
    
    document.body.appendChild(dialogContainer);
    dialogContainer.querySelector('#dialog-ok-button')?.addEventListener('click', () => dialogContainer.remove());
}

export function showConfirmationModal(message, onConfirm) {
    const modalPlaceholder = document.getElementById('modal-placeholder');
    modalPlaceholder.innerHTML = `<div id="confirmation-modal" class="modal-container fixed inset-0 flex items-center justify-center z-50 p-4" style="background:var(--overlay)">
        <div class="modal-content rounded-xl shadow-2xl p-7 max-w-sm w-full" style="background:var(--bg-2);border:1px solid var(--border-1)">
            <h3 class="text-lg font-bold mb-3" style="color:var(--text-1)">Confirmação</h3>
            <p class="mb-6" style="color:var(--text-2)">${message}</p>
            <div class="flex justify-end gap-3">
                <button id="cancel-confirmation" class="px-4 py-2 rounded-lg text-sm font-semibold" style="background:var(--bg-4);color:var(--text-1)">Cancelar</button>
                <button id="confirm-action" class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold">Confirmar</button>
            </div>
        </div>
    </div>`;
    
    const modal = document.getElementById('confirmation-modal');
    const closeModal = () => modal.remove();
    
    modal.addEventListener('click', (e) => {
        if(e.target.id === 'confirmation-modal' || e.target.id === 'cancel-confirmation') closeModal();
    });
    
    document.getElementById('confirm-action').addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-screen').innerHTML = getLoginHTML();
    document.getElementById('splashScreen').innerHTML = getSplashHTML();
    initializeApp();
});

function initializeApp() {
    try {
        setupAuthListeners();
    } catch (error) { 
        console.error("Erro fatal na inicialização:", error); 
        showMessage('Erro Fatal', 'Não foi possível inicializar o sistema.', 'error');
    }
}

export function showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    if(loginScreen) loginScreen.classList.add('active');
    
    document.getElementById('splashScreen')?.classList.remove('active');
    const appContainer = document.getElementById('app-container');
    if (appContainer) { 
        appContainer.innerHTML = ''; 
        appContainer.classList.remove('active'); 
    }
}

export function startApplication(user) {
    const appContainer = document.getElementById('app-container');
    if (!appContainer) return;
    
    document.getElementById('login-screen')?.classList.remove('active');
    document.getElementById('splashScreen')?.classList.add('active');
    
    currentUserProfile = getCurrentUserProfile();
    if (!currentUserProfile) {
        console.error("Perfil de usuário não encontrado!");
        showLoginScreen();
        return;
    }
    
    appContainer.innerHTML = getAppHTML(user, currentUserProfile);
    runInitialAnimation();
}

function initializeDashboard() {
    const doLogout = () => {
        unsubscribeAll();
        fertirrigacao.stop();
        destroyCharts();
        fertirrigacao.destroy();
        destroyHistoricoChart();
        handleLogout();
    };

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', doLogout);
    }
    
    // Configura o Submenu dinâmico e animado do Avatar (JT)
    setupProfileMenu(
        { email: currentUserProfile?.email || currentUserProfile?.username },
        currentUserProfile,
        (updated) => {
            currentUserProfile = { ...currentUserProfile, ...updated };
            setCurrentUserProfile(currentUserProfile);
            const nameEl = document.getElementById('header-user-name');
            if (nameEl) nameEl.textContent = updated.displayName || updated.username;
            const menuNameEl = document.getElementById('menu-user-display');
            if (menuNameEl) menuNameEl.textContent = updated.displayName || updated.username;
            const initials = (updated.displayName || updated.username || 'JT').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const avatarEls = document.querySelectorAll('#avatar-btn div, #profile-menu div');
            avatarEls.forEach(el => {
                if (el.classList.contains('rounded-full') && el.textContent.length <= 3) {
                    el.textContent = initials;
                }
            });
        },
        doLogout
    );
    
    setupTabNavigation();
    setupMobileMenu();
    setupThemeToggle();
    setupAutoRefresh();
    
    setupImplementosSelector();
    setupEquipamentosTab();
    setupHistoricoTab();

    const refreshBtn = document.getElementById('refresh-now-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const select = document.getElementById('equipment-select-implementos');
            if (select) {
                const event = new Event('change');
                select.dispatchEvent(event);
            }
        });
    }

    console.log("🔧 Inicializando painel de administração");
    
    const addUserForm = document.getElementById('add-user-form');
    if (addUserForm) {
        const newAddUserForm = addUserForm.cloneNode(true);
        addUserForm.parentNode.replaceChild(newAddUserForm, addUserForm);
        newAddUserForm.addEventListener('submit', handleAddUser);
    }
    
    setupAdminTabs();
    loadAdminData('pendentes');
}


function setupTabNavigation() {
    const sidebar = document.getElementById('tabs-container');
    if (!sidebar) return;

    sidebar.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-button');
        if (!btn) return;

        const tabId = btn.dataset.tab;
        _activeAppTab = tabId;
        
        // Ajusta o ciclo do timer para o ESP32 da aba correspondente
        if (tabId === 'implementos') {
            _currentCycleSeconds = 10;
            _remainingSeconds = 10;
        } else if (tabId === 'fertirrigacao') {
            _currentCycleSeconds = 30;
            _remainingSeconds = 30;
        }

        fertirrigacao.stop();
        
        if (tabId === 'fertirrigacao') {
            setTimeout(() => fertirrigacao.init(), 100);
        }

        // ✅ FIX: Só troca a classe de cor da aba ativa — NÃO substitui className inteiro
        // Remove somente as classes de cor de aba anteriores, preservando "sidebar"
        sidebar.classList.remove('fertirrigacao', 'implementos', 'historico', 'limites', 'cadastro');
        sidebar.classList.add(tabId);
        
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const activeTab = document.getElementById(`${tabId}-tab`);
        if (activeTab) activeTab.classList.add('active');
    });
}

function runInitialAnimation() {
    const splashLogo = document.getElementById('splash-logo');
    const splashSlogan = document.getElementById('splash-slogan');
    const headerLogo = document.getElementById('header-logo');
    const splashScreen = document.getElementById('splashScreen');
    const appContainer = document.getElementById('app-container');
    
    setTimeout(() => { 
        if(splashLogo) { 
            splashLogo.style.opacity = '1'; 
            splashLogo.style.transform = 'scale(1)'; 
        } 
        if(headerLogo) headerLogo.classList.add('header-logo-start'); 
    }, 100);
    
    setTimeout(() => { 
        if(splashSlogan) splashSlogan.style.opacity = '1';
    }, 600);
    
    setTimeout(() => {
        if(splashScreen) splashScreen.style.opacity = '0';
        if(headerLogo) { 
            headerLogo.classList.remove('header-logo-start'); 
            headerLogo.classList.add('h-10'); 
            headerLogo.style.opacity = '1'; 
        }
        if(appContainer) appContainer.classList.add('active');
        
        setTimeout(() => { 
            if (splashScreen) splashScreen.classList.remove('active'); 
            initializeDashboard(); 
            fertirrigacao.init();
        }, 1500);
    }, 2500);
}

// ============================================================================
// LOGIN HTML
// ============================================================================

function getLoginHTML() { 
    return `
    <div id="login-card" class="animated-border login-card-border-top max-w-md w-full shadow-2xl" style="background:var(--bg-2)">
        <div class="card-content-wrapper space-y-6">
            <div class="text-center">
                <img class="mx-auto h-20 w-auto" src="https://usinapitangueiras.com.br/wp-content/uploads/2020/04/usina-pitangueiras-logo.png" alt="Logo Usina Pitangueiras">
                <h2 class="mt-4 text-3xl font-extrabold" style="color:var(--text-1)">Acessar Sistema</h2>
            </div>
            
            <form id="login-form" class="space-y-4" onsubmit="return false;">
                <div>
                    <input id="email" type="text" autocomplete="username" required 
                            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-[#40800c] focus:border-[#40800c]" 
                           placeholder="Usuário ou e-mail">
                </div>
                <div>
                    <input id="password" type="password" autocomplete="current-password" required 
                            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-[#40800c] focus:border-[#40800c]" 
                           placeholder="Senha">
                </div>
                <div class="flex items-center">
                    <input id="remember-me" type="checkbox" class="h-4 w-4 text-[#40800c] rounded">
                    <label for="remember-me" class="ml-2 block text-sm" style="color:var(--text-1)">Lembrar usuário</label>
                </div>
                <div id="login-error" class="text-red-600 text-sm text-center hidden"></div>
                <div class="flex items-center gap-2 pt-2">
                    <button type="button" id="login-button" 
                            class="w-full py-2 bg-[#40800c] hover:bg-[#306009] text-white rounded-md transition-colors font-medium">
                        Entrar
                    </button>
                    <button type="button" id="request-login-button" 
                            class="w-full py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors font-medium">
                        Solicitar Login
                    </button>
                </div>
            </form>
        </div>
    </div>
    <div id="request-login-modal" class="modal-container hidden fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div class="modal-content rounded-xl shadow-2xl p-8 max-w-md w-full relative" style="background:var(--bg-2);border:1px solid var(--border-1)" onclick="event.stopPropagation()">
            <h2 class="text-2xl font-bold mb-6" style="color:var(--text-1)">Solicitar Acesso</h2>
            <button id="close-modal-button" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-3xl leading-none">&times;</button>
            <form id="request-login-form" class="space-y-4">
                <div>
                    <label for="req-nome" class="block text-sm font-medium" style="color:var(--text-1)">Nome Completo <span class="text-red-500">*</span></label>
                    <input id="req-nome" name="nome" type="text" required class="mt-1 w-full p-2 border rounded-md">
                </div>
                <div>
                    <label for="req-id" class="block text-sm font-medium" style="color:var(--text-1)">ID (Opcional)</label>
                    <input id="req-id" name="id" type="text" class="mt-1 w-full p-2 border rounded-md">
                </div>
                <div>
                    <label for="req-email" class="block text-sm font-medium" style="color:var(--text-1)">E-mail <span class="text-red-500">*</span></label>
                    <input id="req-email" name="email" type="email" required class="mt-1 w-full p-2 border rounded-md">
                </div>
                <div>
                    <label for="req-telefone" class="block text-sm font-medium" style="color:var(--text-1)">Telefone <span class="text-red-500">*</span></label>
                    <input id="req-telefone" name="telefone" type="tel" required class="mt-1 w-full p-2 border rounded-md">
                </div>
                <button type="submit" id="send-request-button" 
                        class="w-full py-2 px-4 bg-[#40800c] hover:bg-[#306009] text-white font-medium rounded-md transition-colors">
                    Enviar Solicitação
                </button>
            </form>
        </div>
    </div>`; 
}

// ============================================================================
// SPLASH HTML
// ============================================================================

function getSplashHTML() { 
    return `<img id="splash-logo" src="https://usinapitangueiras.com.br/wp-content/uploads/2020/04/usina-pitangueiras-logo.png" 
                alt="Logo Usina Pitangueiras" class="opacity-0 scale-125 h-36">
            <p id="splash-slogan" style="color:var(--text-2)" class="text-xl font-semibold opacity-0 mt-4">A energia que move a região</p>`; 
}

// ============================================================================
// APP HTML PRINCIPAL
// ============================================================================

function getAppHTML(user, profile) {
    if (!profile) {
        console.error("Profile não definido em getAppHTML");
        return '<div class="p-8 text-red-500">Erro ao carregar perfil do usuário</div>';
    }
    
    const username = profile.displayName || (user?.email ? user.email.split('@')[0] : 'Usuário');
    
    const allTabs = ['fertirrigacao', 'implementos', 'historico', 'limites', 'cadastro'];
    const firstVisibleTab = allTabs[0];

    const initials = username.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const avatarImg = profile.photoURL 
        ? `<img src="${profile.photoURL}" alt="Avatar" class="h-10 w-10 rounded-full object-cover ring-2 ring-emerald-500 shadow-md">`
        : `<div class="h-10 w-10 rounded-full bg-emerald-700 text-white flex items-center justify-center text-sm font-black ring-2 ring-emerald-500 shadow-md">${initials}</div>`;

    return `
        <header class="app-header shadow-md sticky top-0 z-40">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-between items-center">
                <img id="header-logo" src="https://usinapitangueiras.com.br/wp-content/uploads/2020/04/usina-pitangueiras-logo.png" 
                     alt="Logo Usina Pitangueiras" class="header-logo opacity-0 h-10">
                <h1 class="text-xl md:text-2xl font-extrabold tracking-tight hidden sm:block" style="color:var(--text-1)">Monitoramento Operacional</h1>
                <div class="flex items-center space-x-3">
                    
                    <!-- ⏱ Cronômetro de atualização automática -->
                    <div id="auto-refresh-widget" title="Atualização automática dos dados">
                        <span class="material-symbols-outlined" style="font-size:1rem;">autorenew</span>
                        <span id="auto-refresh-countdown">5:00</span>
                    </div>

                    <button id="theme-toggle" title="Alternar tema">
                        <span class="material-symbols-outlined text-base" id="theme-icon">dark_mode</span>
                        <span id="theme-label">Claro</span>
                    </button>

                    <!-- 🌟 AVATAR JT INTERATIVO COM SUBMENU DROPDOWN ANIMADO -->
                    <div class="relative" id="profile-container">
                        <button id="avatar-btn" type="button" class="avatar-button flex items-center gap-2 p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer" title="Clique para gerenciar perfil">
                            ${avatarImg}
                            <div class="hidden md:flex flex-col text-left">
                                <span id="header-user-name" class="font-bold text-sm leading-tight" style="color:var(--text-1)">${username}</span>
                                <span class="text-[11px] text-gray-400 capitalize leading-tight">${profile.role || 'Usuário'}</span>
                            </div>
                            <span id="avatar-caret" class="material-symbols-outlined text-xs text-gray-400 transition-transform duration-200">expand_more</span>
                        </button>

                        <!-- Submenu Dropdown Animado -->
                        <div id="profile-menu" class="profile-dropdown-menu hidden absolute right-0 mt-2 w-64 rounded-2xl p-2 z-50">
                            <div class="p-3 border-b border-[var(--border-1)] mb-1 flex items-center gap-3">
                                <div class="h-10 w-10 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm">
                                    ${initials}
                                </div>
                                <div class="overflow-hidden">
                                    <p id="menu-user-display" class="font-bold text-sm truncate" style="color:var(--text-1)">${username}</p>
                                    <p class="text-xs text-gray-400 truncate">${profile.customId ? 'ID: ' + profile.customId : (user?.email || '')}</p>
                                    <span class="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-500">${profile.role || 'Operador'}</span>
                                </div>
                            </div>
                            
                            <button id="btn-edit-displayname" class="profile-menu-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[var(--text-1)] text-left cursor-pointer">
                                <span class="material-symbols-outlined text-emerald-600 text-lg">badge</span>
                                <div>
                                    <div class="font-bold">Mudar Nome de Exibição</div>
                                    <div class="text-[10px] text-gray-400 font-normal">Alterar seu nome exibido na tela</div>
                                </div>
                            </button>

                            <button id="btn-edit-credentials" class="profile-menu-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-[var(--text-1)] text-left cursor-pointer">
                                <span class="material-symbols-outlined text-blue-500 text-lg">key</span>
                                <div>
                                    <div class="font-bold">Mudar Usuário e Senha</div>
                                    <div class="text-[10px] text-gray-400 font-normal">Atualizar credenciais no Firebase</div>
                                </div>
                            </button>

                            <div class="my-1 border-t border-[var(--border-1)]"></div>

                            <button id="menu-logout-btn" class="profile-menu-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 text-left cursor-pointer">
                                <span class="material-symbols-outlined text-lg">logout</span>
                                <span>Sair do Sistema</span>
                            </button>
                        </div>
                    </div>

                    <button id="logout-button" 
                            class="bg-red-600 hover:bg-red-700 text-white py-1.5 px-3 rounded-lg text-xs font-bold transition-colors hidden sm:block">
                        Sair
                    </button>
                    <button id="menu-toggle" aria-label="Menu" class="md:hidden">
                        <span class="material-symbols-outlined">menu</span>
                    </button>
                </div>
            </div>
        </header>

        <div class="app-layout">
          <!-- Sidebar de navegação lateral -->
          <div id="sidebar-overlay"></div>
          <nav id="tabs-container" class="sidebar ${firstVisibleTab}">
            <button class="tab-button active" data-tab="fertirrigacao">
              <span class="material-symbols-outlined">water_drop</span>
              <span class="tab-label">Fertirrigação</span>
            </button>
            <button class="tab-button" data-tab="implementos">
              <span class="material-symbols-outlined">dashboard</span>
              <span class="tab-label">Dashboard</span>
            </button>
            <button class="tab-button" data-tab="historico">
              <span class="material-symbols-outlined">history</span>
              <span class="tab-label">Histórico</span>
            </button>
            <button class="tab-button" data-tab="limites">
              <span class="material-symbols-outlined">agriculture</span>
              <span class="tab-label">Equipamentos</span>
            </button>
            <button class="tab-button" data-tab="cadastro">
              <span class="material-symbols-outlined">manage_accounts</span>
              <span class="tab-label">Cadastro</span>
            </button>
          </nav>

          <!-- Conteúdo principal -->
          <main class="main-content">
            <div id="fertirrigacao-tab" class="tab-content active">${fertirrigacao.getHTML()}</div>
            <div id="implementos-tab"   class="tab-content">${getImplementosTabHTML()}</div>
            <div id="historico-tab"     class="tab-content">${getHistoricoTabHTML()}</div>
            <div id="limites-tab"       class="tab-content">${getLimitesTabHTML()}</div>
            <div id="cadastro-tab"      class="tab-content">${getAdminHTML()}</div>
          </main>
        </div>

        <div id="modal-placeholder"></div>
    `;
}

// ============================================================================
// MENU MOBILE
// ============================================================================

function setupMobileMenu() {
    const toggle  = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('tabs-container');
    const overlay = document.getElementById('sidebar-overlay');
    if (!toggle || !sidebar) return;

    const openMenu = () => {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    const closeMenu = () => {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    };

    toggle.addEventListener('click', () => {
        sidebar.classList.contains('open') ? closeMenu() : openMenu();
    });
    if (overlay) overlay.addEventListener('click', closeMenu);

    // Fecha ao selecionar uma aba no mobile
    sidebar.addEventListener('click', (e) => {
        if (e.target.matches('.tab-button') || e.target.closest('.tab-button')) {
            if (window.innerWidth <= 768) closeMenu();
        }
    });
}

// ============================================================================
// TEMA CLARO / ESCURO
// ============================================================================

function setupThemeToggle() {
    const btn    = document.getElementById('theme-toggle');
    const icon   = document.getElementById('theme-icon');
    const label  = document.getElementById('theme-label');
    if (!btn) return;

    // Carrega preferência salva ou usa escuro como padrão
    const saved = localStorage.getItem('agro_theme') || 'dark';
    _applyTheme(saved, icon, label);

    btn.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme || 'dark';
        const next    = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('agro_theme', next);
        _applyTheme(next, icon, label);
    });
}

function _applyTheme(theme, icon, label) {
    document.documentElement.dataset.theme = theme;
    if (theme === 'light') {
        if (icon)  icon.textContent  = 'light_mode';
        if (label) label.textContent = 'Escuro';
    } else {
        if (icon)  icon.textContent  = 'dark_mode';
        if (label) label.textContent = 'Claro';
    }
}

// ============================================================================
// CRONÔMETRO DE ATUALIZAÇÃO AUTOMÁTICA SINCRONIZADO COM ESP32
// Sem F5 — sincroniza com a transmissão do ESP32 em tempo real
// ============================================================================

let _autoRefreshTimer = null;
let _currentCycleSeconds = 30; // 30s para fertirrigação por padrão (ciclo do ESP32)
let _remainingSeconds = 30;
let _activeAppTab = 'fertirrigacao';

function setupAutoRefresh() {
    const widget    = document.getElementById('auto-refresh-widget');
    const countEl   = document.getElementById('auto-refresh-countdown');
    if (!countEl) return;

    _remainingSeconds = _currentCycleSeconds;

    const _fmt = s => {
        const m = Math.floor(Math.max(0, s) / 60);
        const sec = Math.max(0, s) % 60;
        return `${m}:${String(sec).padStart(2, '0')}`;
    };

    const _executarAtualizacao = async () => {
        if (widget) {
            widget.classList.remove('refreshing');
            void widget.offsetWidth;
            widget.classList.add('refreshing');
        }

        try {
            if (_activeAppTab === 'fertirrigacao') {
                if (typeof fertirrigacao.refresh === 'function') {
                    await fertirrigacao.refresh();
                } else {
                    fertirrigacao.stop();
                    setTimeout(() => fertirrigacao.init(), 100);
                }
            } else if (_activeAppTab === 'implementos') {
                forcarAtualizacaoImplementos();
            }
        } catch(e) {
            console.warn('[AutoRefresh] Erro na sincronização:', e);
        } finally {
            setTimeout(() => widget?.classList.remove('refreshing'), 800);
        }
    };

    // 📡 ESCUTA SINCRONIZAÇÃO EMITIDA PELO ESP32 EM TEMPO REAL
    window.addEventListener('esp32:syncCycle', (e) => {
        const interval = e.detail?.intervalSeconds || _currentCycleSeconds;
        _currentCycleSeconds = interval;
        _remainingSeconds = interval;
        if (countEl) {
            countEl.textContent = _fmt(_remainingSeconds);
            countEl.style.color = '#10b981'; // flash verde de sincronia com ESP32
            countEl.classList.remove('animate-pulse');
            setTimeout(() => {
                if (countEl) countEl.style.color = '';
            }, 600);
        }
    });

    const _tick = () => {
        _remainingSeconds--;
        if (countEl) {
            countEl.textContent = _fmt(_remainingSeconds);
            // Destaca em vermelho nos últimos 5 segundos antes do envio do ESP32
            if (_remainingSeconds <= 5) {
                countEl.style.color = 'var(--c-red, #ef4444)';
                countEl.classList.add('animate-pulse');
            } else {
                countEl.style.color = '';
                countEl.classList.remove('animate-pulse');
            }
        }

        if (_remainingSeconds <= 0) {
            _executarAtualizacao();
            _remainingSeconds = _currentCycleSeconds;
        }
    };

    if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
    _autoRefreshTimer = setInterval(_tick, 1000);

    // Clique manual no widget força refresh imediato e reseta o ciclo
    if (widget) {
        widget.style.cursor = 'pointer';
        widget.title = 'Sincronizado com o ESP32 — Clique para atualizar agora';
        widget.addEventListener('click', () => {
            _remainingSeconds = _currentCycleSeconds;
            _executarAtualizacao();
        });
    }

    console.log('[AutoRefresh] Sincronizado com ciclo do ESP32:', _currentCycleSeconds, 's');
}

// ============================================================================
// IMPLEMENTOS/DASHBOARD TAB HTML
// ============================================================================

function getImplementosTabHTML() {
    return `
    <div class="flex justify-between items-center mb-8 border-b pb-4">
        <div class="flex items-center gap-4">
            <h2 class="text-2xl font-bold" style="color:var(--text-1)">Status</h2>
            <div id="connection-status-badge" class="items-center gap-2 px-3 py-1 text-sm font-bold text-white rounded-lg flex bg-red-500">
                <span class="relative flex h-3 w-3">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                </span>
                <span id="connection-status-text">Offline</span>
            </div>
        </div>
        
        <div class="flex items-center gap-4">
            <div class="flex items-center gap-2 px-4 py-2 rounded-lg" style="background:var(--bg-3)">
                <span class="material-symbols-outlined" style="color:var(--text-2)">schedule</span>
                <span class="text-sm font-medium" style="color:var(--text-2)">Refresh em:</span>
                <span id="refresh-timer" class="text-amber-600 font-bold text-lg">5</span>
                <span class="text-sm" style="color:var(--text-3)">s</span>
            </div>
            
            <select id="refresh-select" class="rounded-md border-gray-300 shadow-sm text-sm py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                <option value="5">5 segundos</option>
                <option value="10" selected>10 segundos</option>
                <option value="15">15 segundos</option>
                <option value="20">20 segundos</option>
                <option value="30">30 segundos</option>
                <option value="60">1 minuto</option>
            </select>
            
            <div class="flex items-center space-x-2">
                <label for="equipment-select-implementos" class="text-sm font-medium" style="color:var(--text-1)">Equipamento:</label>
                <select id="equipment-select-implementos" class="rounded-md border-gray-300 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"></select>
            </div>
        </div>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div id="last-depth-card" class="metric-card animated-border h-52">
            <div class="card-content-wrapper h-full flex flex-col justify-center">
                <p class="data-label">Distância Sensor-Solo</p>
                <div id="last-depth-skeleton" class="mt-1 h-9 w-3/4 rounded-md bg-gray-200 animate-pulse"></div>
                <p class="data-value text-indigo-700 hidden" id="last-depth">0.00 cm</p>
            </div>
        </div>
        
        <div id="avg-depth-card" class="metric-card animated-border h-52">
            <div class="card-content-wrapper h-full flex flex-col justify-center">
                <p class="data-label">Profundidade de Inserção</p>
                <div id="avg-depth-skeleton" class="mt-1 h-9 w-3/4 rounded-md bg-gray-200 animate-pulse"></div>
                <p class="data-value text-purple-700 hidden" id="avg-depth">0.0 cm</p>
            </div>
        </div>

        <div id="productive-percent-card" class="metric-card animated-border h-52">
            <div class="card-content-wrapper h-full flex flex-col p-2">
                <p class="data-label text-center text-xs font-medium mb-1">Distribuição (50 leituras)</p>
                <div class="flex items-center justify-center gap-2 flex-1">
                    <div class="relative flex-shrink-0" style="width: 85px; height: 85px;">
                        <div id="productive-percent-skeleton" class="h-full w-full rounded-full animate-pulse" style="background:var(--bg-4)"></div>
                        <canvas id="productive-chart" class="hidden absolute inset-0"></canvas>
                    </div>            
                    <div id="productive-chart-legend" class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]"></div>
                </div>
            </div>
        </div>

        <div id="current-status-card" class="metric-card animated-border h-52">
            <div class="card-content-wrapper h-full flex flex-col justify-center text-center">
                <p class="data-label text-xl mb-2">Status Atual</p>
                <p class="text-4xl font-extrabold" id="status-value-text" style="line-height: 1.2;">Aguardando</p>
            </div>
        </div>
    </div>

    <div class="mb-10">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-2xl font-bold" style="color:var(--text-1)">📊 Perfil de Inserção no Solo</h2>
        </div>
        <div class="grid grid-cols-4 gap-3 mb-4">
            <div class="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <span class="text-xs font-bold text-green-700 uppercase">Ideal</span>
                <p class="text-xl font-bold text-green-600" id="ideal-percent">0%</p>
            </div>
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                <span class="text-xs font-bold text-yellow-700 uppercase">Raso</span>
                <p class="text-xl font-bold text-yellow-600" id="raso-percent">0%</p>
            </div>
            <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                <span class="text-xs font-bold text-red-700 uppercase">Fundo</span>
                <p class="text-xl font-bold text-red-600" id="fundo-percent">0%</p>
            </div>
            <div class="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                <span class="text-xs font-bold text-purple-700 uppercase">Desloc.</span>
                <p class="text-xl font-bold text-purple-600" id="desloc-percent">0%</p>
            </div>
        </div>
        <div class="vazao-panel p-6 rounded-xl shadow-2xl relative">
            <div class="pt-4">
                <canvas id="depth-chart" style="height: 450px;"></canvas>
            </div>
        </div>
        <div class="text-center text-xs mt-3" style="color:var(--text-3)">
            <span class="font-semibold">Limites Atuais:</span>
            <span class="text-emerald-600 mx-2">Produtivo: <strong id="limit-produtivo">-- / -- cm</strong></span> | 
            <span class="text-indigo-600 ml-2">Sem Operação: <strong id="limit-parado">-- ± -- cm</strong></span>
        </div>
    </div>
    
    <div>
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold" style="color:var(--text-1)">Últimas Leituras</h2>
            <button id="refresh-now-btn" class="flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">
                <span class="material-symbols-outlined text-sm">refresh</span>
                Atualizar Agora
            </button>
        </div>
        <div class="overflow-x-auto rounded-lg shadow-xl">
            <table class="min-w-full divide-y divide-gray-200">
                <thead>
                    <tr class="table-header">
                        <th scope="col" class="px-6 py-3 text-left">Timestamp</th>
                        <th scope="col" class="px-6 py-3 text-left">Dist. Sensor-Solo (cm)</th>
                        <th scope="col" class="px-6 py-3 text-left">Status Serviço</th>
                        <th scope="col" class="px-6 py-3 text-left">Conexão</th>
                    </tr>
                </thead>
                <tbody id="readings-history" style="background:var(--bg-2)">
                    <tr><td colspan="4" class="px-6 py-4 text-center" style="color:var(--text-3)">Aguardando dados...</td></tr>
                </tbody>
            </table>
        </div>
    </div>`;
}

// ============================================================================
// EQUIPAMENTOS TAB HTML
// ============================================================================

function getLimitesTabHTML() {
    return `
    <div class="max-w-7xl mx-auto space-y-6">
        <div class="flex justify-between items-center">
            <h1 class="text-2xl font-bold" style="color:var(--text-1)">Gerenciar Equipamentos</h1>
            <button id="export-btn" class="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium">
                <span class="material-symbols-outlined text-lg">download</span>
                Exportar CSV
            </button>
        </div>
        
        <div class="flex border-b border-gray-200">
            <button data-tab="gerenciar-equip" class="equip-sub-tab active px-6 py-3 font-medium text-sm transition-all border-b-2 border-transparent">Lista de Frota</button>
            <button data-tab="cadastrar-equip" class="equip-sub-tab px-6 py-3 font-medium text-sm transition-all border-b-2 border-transparent">Novo Cadastro</button>
            <button data-tab="vincular-equip"  class="equip-sub-tab px-6 py-3 font-medium text-sm transition-all border-b-2 border-transparent">Vincular Sensor (MAC)</button>
            <button data-tab="esp32-status"   class="equip-sub-tab px-6 py-3 font-medium text-sm transition-all border-b-2 border-transparent flex items-center gap-1"><span class="material-symbols-outlined text-sm">router</span> Monitor RTDB</button>
        </div>

        <div id="gerenciar-equip-content" class="equip-sub-content">
            <div class="rounded-xl overflow-hidden" style="background:var(--bg-2);border:1px solid var(--border-1)">
                <div class="p-4 border-b flex flex-wrap gap-4" style="background:var(--bg-3);border-color:var(--border-1)">
                    <div class="flex-1 min-w-[200px] relative">
                        <span class="material-symbols-outlined absolute left-3 top-2.5 text-gray-400">search</span>
                        <input type="text" id="equipment-search-input" placeholder="Pesquisar frota ou código..." class="w-full pl-10 pr-4 py-2 border rounded-lg">
                    </div>
                    <select id="grupo-filter" class="border rounded-lg px-4 py-2" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)"></select>
                    <select id="status-filter" class="border rounded-lg px-4 py-2" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                        <option value="">Todos os Status</option>
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                    </select>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead style="background:var(--bg-3)">
                            <tr class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                <th class="px-6 py-4 text-left" style="color:var(--text-2);background:var(--bg-3)">Código</th>
                                <th class="px-6 py-4 text-left" style="color:var(--text-2);background:var(--bg-3)">Frota/Descrição</th>
                                <th class="px-6 py-4 text-left" style="color:var(--text-2);background:var(--bg-3)">Grupo</th>
                                <th class="px-6 py-4 text-left" style="color:var(--text-2);background:var(--bg-3)">Equipe</th>
                                <th class="px-6 py-4 text-center" style="color:var(--text-2);background:var(--bg-3)">Status Dash</th>
                                <th class="px-6 py-4 text-center" style="color:var(--text-2);background:var(--bg-3)">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="equipment-list-body" style="background:var(--bg-2)"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <div id="cadastrar-equip-content" class="equip-sub-content hidden">
            <div class="rounded-xl p-8" style="background:var(--bg-2);border:1px solid var(--border-1)">
                <form id="cadastro-equip-form" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="md:col-span-2 border-b pb-2 mb-2">
                        <h3 class="text-lg font-bold" style="color:var(--text-1)">Informações Básicas</h3>
                    </div>
                    <div>
                        <label class="block text-sm font-medium" style="color:var(--text-1)">Código da Frota *</label>
                        <input type="text" name="codigo" required class="w-full mt-1 p-2 border rounded-lg" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                    </div>
                    <div>
                        <label class="block text-sm font-medium" style="color:var(--text-1)">Descrição/Nome *</label>
                        <input type="text" name="descricao" required class="w-full mt-1 p-2 border rounded-lg" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                    </div>
                    <div>
                        <label class="block text-sm font-medium" style="color:var(--text-1)">Grupo *</label>
                        <div class="flex gap-2">
                            <select name="grupo" required class="w-full mt-1 p-2 border rounded-lg" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)"></select>
                            <button type="button" id="edit-groups-shortcut" class="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-600" title="Gerenciar Grupos">
                                <span class="material-symbols-outlined text-base">settings</span>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium" style="color:var(--text-1)">Equipe Responsável *</label>
                        <div class="flex gap-2">
                            <select name="equipe" required class="w-full mt-1 p-2 border rounded-lg" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)"></select>
                            <button type="button" id="edit-teams-shortcut" class="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-600" title="Gerenciar Equipes">
                                <span class="material-symbols-outlined text-base">settings</span>
                            </button>
                        </div>
                    </div>
                    <div class="md:col-span-2 border-b pb-2 mt-4 mb-2">
                        <h3 class="text-lg font-bold" style="color:var(--text-1)">Parâmetros Operacionais (cm)</h3>
                    </div>
                    <div>
                        <label class="block text-sm font-medium" style="color:var(--text-1)">h_Mesa (Altura Sensor até Solo) *</label>
                        <input type="number" name="hmesa" step="0.1" value="100.0" class="w-full mt-1 p-2 border rounded-lg" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium" style="color:var(--text-1)">Prof. Mínima</label>
                            <input type="number" name="min" step="0.1" value="10.0" class="w-full mt-1 p-2 border rounded-lg" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                        </div>
                        <div>
                            <label class="block text-sm font-medium" style="color:var(--text-1)">Prof. Máxima</label>
                            <input type="number" name="max" step="0.1" value="45.0" class="w-full mt-1 p-2 border rounded-lg" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                        </div>
                    </div>
                    <div class="md:col-span-2 flex items-center gap-2 py-4">
                        <input type="checkbox" name="ativo" id="check-ativo" checked class="w-5 h-5 text-emerald-600">
                        <label for="check-ativo" class="font-bold" style="color:var(--text-1)">Equipamento Ativo no Sistema</label>
                    </div>
                    <div class="md:col-span-2 flex justify-end gap-4 border-t pt-6">
                        <button type="button" onclick="document.querySelector('[data-tab=\\'gerenciar-equip\\']').click()" class="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors">Cancelar</button>
                        <button type="submit" class="bg-emerald-600 text-white px-8 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-all flex items-center gap-2">
                            <span class="material-symbols-outlined">save</span> Salvar Equipamento
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <div id="vincular-equip-content" class="equip-sub-content hidden">
            <div class="rounded-xl p-8" style="background:var(--bg-2);border:1px solid var(--border-1);border-top:8px solid #10b981">
                <h2 class="text-3xl font-bold mb-2">Gerenciar Vínculos MAC</h2>
                <p class="text-sm mb-6" style="color:var(--text-2)">Vincule ou desvincule MAC addresses aos equipamentos cadastrados.</p>
                <div class="overflow-x-auto rounded-lg" style="border:1px solid var(--border-1)">
                    <table class="min-w-full text-sm" style="background:var(--bg-2)">
                        <thead style="background:var(--bg-3)">
                            <tr>
                                <th class="p-3 text-left font-semibold" style="color:var(--text-2)">MAC Address</th>
                                <th class="p-3 text-left font-semibold" style="color:var(--text-2)">Equipamento Vinculado</th>
                                <th class="p-3 text-center font-semibold" style="color:var(--text-2)">Ação</th>
                            </tr>
                        </thead>
                        <tbody id="mac-list-body" class="divide-y">
                            <tr><td colspan="3" class="p-4 text-center" style="color:var(--text-3)">Carregando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ABA MONITOR RTDB -->
        <div id="esp32-status-content" class="equip-sub-content hidden">
          <div id="esp32-status-panel-mount" class="vazao-panel rounded-xl p-4 min-h-[400px]">
            <p class="text-slate-400 text-sm">Carregando painel RTDB...</p>
          </div>
        </div>
    </div>`;
}

// ============================================================================
// HISTÓRICO TAB HTML
// ============================================================================

function getHistoricoTabHTML() {
    return `
    <div class="space-y-8">
        <div class="rounded-xl p-6" style="background:var(--bg-2);border:1px solid var(--border-1);box-shadow:var(--shadow-sm)">
            <h2 class="text-2xl font-bold mb-1">Consulta de Histórico</h2>
            <p class="text-sm mb-6" style="color:var(--text-2)">Selecione um equipamento e o período desejado para visualizar os dados de operação.</p>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div class="md:col-span-2">
                    <label for="equipment-select-historico" class="block text-sm font-medium" style="color:var(--text-1)">Equipamento</label>
                    <select id="equipment-select-historico" 
                            class="mt-1 block w-full rounded-md focus:ring-2 focus:ring-blue-500" style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1)"></select>
                </div>
                <div>
                    <label for="date-start-historico" class="block text-sm font-medium" style="color:var(--text-1)">Data de Início</label>
                    <input type="date" id="date-start-historico" 
                           class="mt-1 block w-full rounded-md focus:ring-2 focus:ring-blue-500" style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1)">
                </div>
                <div>
                    <label for="date-end-historico" class="block text-sm font-medium" style="color:var(--text-1)">Data Final</label>
                    <input type="date" id="date-end-historico" 
                           class="mt-1 block w-full rounded-md focus:ring-2 focus:ring-blue-500" style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1)">
                </div>
            </div>
            <div class="mt-4 flex flex-wrap items-center gap-3">
                <button id="search-historico-btn" 
                        class="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 shadow">
                    <span class="material-symbols-outlined text-sm">search</span> Buscar Histórico
                </button>
                <label class="cursor-pointer bg-slate-700 hover:bg-slate-800 text-white font-bold py-2.5 px-5 rounded-lg text-sm inline-flex items-center gap-2 transition-colors shadow">
                    <span class="material-symbols-outlined text-sm">upload_file</span> Importar Log do SD Card (.csv)
                    <input type="file" id="import-sd-file" accept=".csv,.txt" class="hidden">
                </label>
            </div>
        </div>

        <div id="historico-results-container" class="space-y-8">
            <div class="rounded-xl h-96 p-4" style="background:var(--bg-2);border:1px solid var(--border-1)">
                <canvas id="historico-chart"></canvas>
            </div>
            <div class="rounded-xl overflow-hidden" style="background:var(--bg-2);border:1px solid var(--border-1)">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead style="background:var(--bg-3)">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase" style="color:var(--text-3);background:var(--bg-3)">Dist. Sensor-Solo (cm)</th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase" style="color:var(--text-3);background:var(--bg-3)">Status Serviço</th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase" style="color:var(--text-3);background:var(--bg-3)">Conexão</th>
                        </tr>
                    </thead>
                    <tbody id="historico-readings-body" style="background:var(--bg-2)">
                        <tr><td colspan="4" class="px-6 py-4 text-center" style="color:var(--text-3)">Aguardando busca...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}

// ============================================================================
// ADMIN/CADASTRO TAB HTML
// ============================================================================

function getAdminHTML() {
    return `
        <div class="max-w-4xl mx-auto p-8 rounded-xl" style="background:var(--bg-2);border-top:8px solid #8b5cf6;border:1px solid var(--border-1)">
            <h2 class="text-3xl font-bold mb-6">Painel de Administração</h2>
            <div id="admin-sub-tabs" class="flex gap-2 border-b mb-6">
                <div class="admin-sub-tab active" data-tab="pendentes">Aprovações Pendentes</div>
                <div class="admin-sub-tab" data-tab="gerenciar">Gerenciar Usuários</div>
                <div class="admin-sub-tab" data-tab="adicionar">Adicionar Manualmente</div>
                <div class="admin-sub-tab" data-tab="grupos">Grupos</div>
                <div class="admin-sub-tab" data-tab="equipes">Equipes</div>
            </div>
            <div id="pendentes-content" class="admin-content space-y-4">
                <h3 class="text-xl font-semibold" style="color:var(--text-1)">Usuários aguardando aprovação</h3>
                <div id="pendentes-list" class="space-y-3"></div>
            </div>
            <div id="gerenciar-content" class="admin-content hidden space-y-4">
                <h3 class="text-xl font-semibold" style="color:var(--text-1)">Gerenciar usuários existentes</h3>
                <div id="gerenciar-list" class="space-y-3"></div>
            </div>
            <div id="adicionar-content" class="admin-content hidden">
                <form id="add-user-form" class="mb-10 p-6 rounded-xl" style="background:var(--bg-2);border:1px solid var(--border-1)">
                    <h3 class="text-xl font-bold mb-6" style="color:var(--text-1)">Cadastrar Novo Usuário no Firebase</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1" style="color:var(--text-1)">Nome Completo *</label>
                            <input name="new-user-name" type="text" placeholder="Ex: João da Silva" required 
                                   class="w-full p-2 border rounded-md" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1" style="color:var(--text-1)">Nome de Usuário (Login) *</label>
                            <input name="new-user-username" type="text" placeholder="Ex: joaosilva" required 
                                   class="w-full p-2 border rounded-md" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1" style="color:var(--text-1)">Senha de Acesso *</label>
                            <input name="new-user-password" type="text" placeholder="Senha do usuário" required 
                                   class="w-full p-2 border rounded-md" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1" style="color:var(--text-1)">E-mail *</label>
                            <input name="new-user-email" type="email" placeholder="joao@usinapitangueiras.com.br" required 
                                   class="w-full p-2 border rounded-md" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1" style="color:var(--text-1)">ID / Matrícula (Opcional)</label>
                            <input name="new-user-id" type="text" placeholder="Ex: FUNC-105" 
                                   class="w-full p-2 border rounded-md" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1" style="color:var(--text-1)">Nível de Acesso (Cargo)</label>
                            <select name="new-user-role" class="w-full p-2 border rounded-md" style="background:var(--bg-input);color:var(--text-1);border-color:var(--border-1)">
                                <option value="Operação">Operação</option>
                                <option value="Lider">Líder</option>
                                <option value="Master">Master (Administrador Total)</option>
                            </select>
                        </div>
                    </div>

                    <div class="mt-6 border-t pt-4" style="border-color:var(--border-1)">
                        <label class="block text-sm font-medium mb-3" style="color:var(--text-1)">Permissões de Abas:</label>
                        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer" style="border-color:var(--border-1)">
                                <input type="checkbox" name="new-user-permissions" value="fertirrigacao" checked class="text-emerald-600 rounded">
                                <span class="text-xs font-semibold" style="color:var(--text-1)">Fertirrigação</span>
                            </label>
                            <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer" style="border-color:var(--border-1)">
                                <input type="checkbox" name="new-user-permissions" value="implementos" checked class="text-emerald-600 rounded">
                                <span class="text-xs font-semibold" style="color:var(--text-1)">Dashboard</span>
                            </label>
                            <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer" style="border-color:var(--border-1)">
                                <input type="checkbox" name="new-user-permissions" value="historico" checked class="text-emerald-600 rounded">
                                <span class="text-xs font-semibold" style="color:var(--text-1)">Histórico</span>
                            </label>
                            <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer" style="border-color:var(--border-1)">
                                <input type="checkbox" name="new-user-permissions" value="limites" class="text-emerald-600 rounded">
                                <span class="text-xs font-semibold" style="color:var(--text-1)">Equipamentos</span>
                            </label>
                            <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer" style="border-color:var(--border-1)">
                                <input type="checkbox" name="new-user-permissions" value="cadastro" class="text-emerald-600 rounded">
                                <span class="text-xs font-semibold" style="color:var(--text-1)">Cadastro</span>
                            </label>
                        </div>
                    </div>

                    <div class="mt-6 text-right">
                        <button type="submit" 
                                class="py-2.5 px-6 rounded-lg shadow-lg text-white font-bold bg-[#40800c] hover:bg-[#306009] transition-all">
                            Salvar Usuário no Firebase
                        </button>
                    </div>
                </form>
            </div>
            <div id="grupos-content" class="admin-content hidden">
                <h3 class="text-xl font-semibold mb-4" style="color:#a78bfa">Gerenciar Grupos de Equipamentos</h3>
                <p class="text-sm mb-4" style="color:var(--text-2)">Adicione ou remova grupos disponíveis nos formulários de cadastro de equipamentos.</p>
                <div id="grupos-admin-container"></div>
            </div>
            <div id="equipes-content" class="admin-content hidden">
                <h3 class="text-xl font-semibold mb-4" style="color:#60a5fa">Gerenciar Equipes</h3>
                <p class="text-sm mb-4" style="color:var(--text-2)">Adicione ou remova equipes disponíveis nos formulários de cadastro de equipamentos.</p>
                <div id="equipes-admin-container"></div>
            </div>
        </div>`;
}
