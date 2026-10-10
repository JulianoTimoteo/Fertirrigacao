import { 
    login as apiLogin,
    apiPost
} from './api.js';
import { showMessage, showLoginScreen, startApplication } from './main.js';

let currentUserProfile = null;
let authTimeout = null;

export function getCurrentUserProfile() {
    return currentUserProfile;
}

export function setCurrentUserProfile(profile) {
    currentUserProfile = profile;
}

export function setupAuthListeners() {
    const loginScreen = document.getElementById('login-screen');
    const savedEmail = localStorage.getItem('savedUserEmail');
    
    if (savedEmail) {
        document.getElementById('email').value = savedEmail;
        document.getElementById('remember-me').checked = true;
    }

    loginScreen.addEventListener('click', e => {
        if (e.target.id === 'login-button') handleLogin();
        if (e.target.id === 'request-login-button') document.getElementById('request-login-modal')?.classList.remove('hidden');
        if (e.target.id === 'request-login-modal' || e.target.closest('#close-modal-button')) document.getElementById('request-login-modal')?.classList.add('hidden');
    });
    
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', e => { 
            if (e.key === 'Enter') handleLogin(); 
        });
    }
    
    const requestForm = document.getElementById('request-login-form');
    if (requestForm) {
        requestForm.addEventListener('submit', handleLoginRequest);
    }
    
    checkExistingSession();
}

function checkExistingSession() {
    const savedSession = localStorage.getItem('userSession');
    if (savedSession) {
        try {
            const userData = JSON.parse(savedSession);
            const expiry = userData.expiry || 0;
            
            if (expiry > Date.now()) {
                currentUserProfile = userData.profile;
                startApplication({ email: userData.profile.email });
            } else {
                localStorage.removeItem('userSession');
            }
        } catch (e) {
            localStorage.removeItem('userSession');
        }
    }
}

async function handleLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const btn = document.getElementById('login-button');
    const errEl = document.getElementById('login-error');
    const loginCard = document.getElementById('login-card');
    
    if (errEl) errEl.classList.add('hidden');
    if (btn) {
        btn.disabled = true; 
        btn.textContent = "Verificando...";
    }
    if (loginCard) loginCard.style.setProperty('--animation-color', 'var(--color-primary)');

    if (!email || !password) {
        if (errEl) {
            errEl.textContent = "Preencha email e senha."; 
            errEl.classList.remove('hidden'); 
        }
        if (btn) {
            btn.disabled = false; 
            btn.textContent = "Entrar";
        }
        return;
    }

    // 🔥 Verificação direta de credenciais Master (Juliano Timóteo)
    const isMasterUser = (
        (email.toLowerCase() === 'julianotimoteo' || 
         email.toLowerCase() === 'julianotimoteo@usinapitangueiras.com.br' ||
         email.toLowerCase() === 'jtsdowload@gmail.com') &&
        password === 'tmotvini1986@#'
    );

    if (isMasterUser) {
        currentUserProfile = {
            uid: 'master_julianotimoteo',
            email: email.includes('@') ? email : 'julianotimoteo@usinapitangueiras.com.br',
            displayName: 'Juliano Timóteo',
            photoURL: '',
            role: 'Master',
            permissions: ['fertirrigacao', 'implementos', 'historico', 'limites', 'cadastro'],
            customId: 'MASTER-01'
        };

        console.log("✅ Login Master autenticado localmente:", currentUserProfile);

        if (rememberMe) {
            localStorage.setItem('savedUserEmail', email);
            const sessionData = {
                profile: currentUserProfile,
                expiry: Date.now() + (24 * 60 * 60 * 1000)
            };
            localStorage.setItem('userSession', JSON.stringify(sessionData));
        } else {
            localStorage.removeItem('savedUserEmail');
            localStorage.removeItem('userSession');
        }

        startApplication({ email: currentUserProfile.email });
        return;
    }

    try { 
        const response = await apiLogin(email, password);
        
        console.log("📥 Resposta completa do login:", response);
        
        if (response && response.status === 'error') {
            if (errEl) {
                errEl.textContent = response.message || "Usuário não encontrado ou senha incorreta."; 
                errEl.classList.remove('hidden'); 
            }
            if (loginCard) loginCard.style.setProperty('--animation-color', '#ef4444');
            if (btn) {
                btn.disabled = false; 
                btn.textContent = "Entrar";
            }
            return;
        }

        const userData = response.data || response;
        
        console.log("👤 Dados do usuário:", userData);
        
        if (!userData || !userData.email) {
            if (errEl) {
                errEl.textContent = "Resposta inválida da API."; 
                errEl.classList.remove('hidden'); 
            }
            if (btn) {
                btn.disabled = false; 
                btn.textContent = "Entrar";
            }
            return;
        }
        
        const userStatus = userData.status ? userData.status.toLowerCase() : '';
        if (userStatus === 'pendente') {
            showMessage(
                'Acesso Pendente', 
                `Sua conta está aguardando aprovação de um administrador. \nEntre em contato com o suporte pelo WhatsApp (16) 99288-6004.`, 
                'warning'
            );
            if (btn) {
                btn.disabled = false; 
                btn.textContent = "Entrar";
            }
            return;
        }
        
        // 🔥 VERIFICAR SE É PRIMEIRO ACESSO
        if (userData.primeiroAcesso) {
            // Forçar troca de senha
            const novaSenha = prompt("Primeiro acesso. Por favor, defina sua nova senha (deve conter letras, números e caractere especial):");
            
            if (!novaSenha) {
                showMessage('Erro', 'A troca de senha é obrigatória para o primeiro acesso.', 'error');
                if (btn) {
                    btn.disabled = false; 
                    btn.textContent = "Entrar";
                }
                return;
            }
            
            // Validar força da senha
            const temLetra = /[a-zA-Z]/.test(novaSenha);
            const temNumero = /[0-9]/.test(novaSenha);
            const temEspecial = /[!@#$%^&*(),.?":{}|<>]/.test(novaSenha);
            
            if (!temLetra || !temNumero || !temEspecial || novaSenha.length < 6) {
                showMessage('Erro', 'A senha deve ter pelo menos 6 caracteres, incluindo letras, números e caractere especial.', 'error');
                if (btn) {
                    btn.disabled = false; 
                    btn.textContent = "Entrar";
                }
                return;
            }
            
            // Atualizar senha na API
            try {
                await apiPost('editUser', {
                    uid: userData.uid,
                    senha: novaSenha,
                    primeiroAcesso: false
                });
                showMessage('Sucesso', 'Senha alterada com sucesso! Faça login novamente.', 'success');
                if (btn) {
                    btn.disabled = false; 
                    btn.textContent = "Entrar";
                }
                return; // Volta para tela de login
            } catch (error) {
                console.error("Erro ao alterar senha:", error);
                showMessage('Erro', 'Falha ao alterar senha.', 'error');
                if (btn) {
                    btn.disabled = false; 
                    btn.textContent = "Entrar";
                }
                return;
            }
        }
        
        currentUserProfile = {
            uid: userData.uid || userData.id || 'user_' + Date.now(),
            email: userData.email,
            displayName: userData.displayName || userData.nome || userData.nickname || email.split('@')[0],
            photoURL: userData.photoURL || '',
            role: userData.role || userData.cargo || 'Operação',
            permissions: Array.isArray(userData.permissions) ? userData.permissions : 
                        (userData.permissoes ? userData.permissoes.split(',').map(p => p.trim()) : []),
            customId: userData.customId || userData.matricula || userData.id_externo || ''
        };
        
        console.log("✅ Perfil do usuário:", currentUserProfile);
        
        try {
            if (userData.uid) {
                await apiPost('editUser', { 
                    uid: userData.uid,
                    ultimoLogin: new Date().toISOString()
                });
            }
        } catch (e) {
            console.log("Não foi possível atualizar último login", e);
        }
        
        if (rememberMe) {
            localStorage.setItem('savedUserEmail', email);
            
            const sessionData = {
                profile: currentUserProfile,
                expiry: Date.now() + (24 * 60 * 60 * 1000)
            };
            localStorage.setItem('userSession', JSON.stringify(sessionData));
        } else {
            localStorage.removeItem('savedUserEmail');
            localStorage.removeItem('userSession');
        }
        
        startApplication({ email: userData.email });
        
    } catch (error) { 
        console.error("❌ Erro no login:", error);
        if (errEl) {
            errEl.textContent = "Erro ao fazer login. Tente novamente."; 
            errEl.classList.remove('hidden'); 
        }
        if (loginCard) loginCard.style.setProperty('--animation-color', '#ef4444');
    } finally { 
        if (btn) {
            btn.disabled = false; 
            btn.textContent = "Entrar"; 
        }
    }
}

function handleLoginRequest(e) {
    e.preventDefault();
    const form = e.target;
    const nome = form.elements['nome'].value;
    const id = form.elements['id'].value;
    const email = form.elements['email'].value;
    const telefone = form.elements['telefone'].value;

    if (!nome || !email || !telefone) {
        return showMessage('Campos Obrigatórios', 'Por favor, preencha Nome, E-mail e Telefone.', 'warning');
    }
    
    const whatsappNumber = '5516992886004'; 
    const message = `*Solicitação de Acesso ao Sistema de Monitoramento*\n\n*Nome:* ${nome}\n*ID:* ${id || 'Não informado'}\n*Email:* ${email}\n*Telefone:* ${telefone}`;
    const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappLink, '_blank');
    showMessage('Redirecionando', 'Você será redirecionado para o WhatsApp para enviar a solicitação.', 'success');
    document.getElementById('request-login-modal').classList.add('hidden');
    form.reset();
}

export function handleLogout() {
    currentUserProfile = null;
    localStorage.removeItem('userSession');
    localStorage.removeItem('savedUserEmail');
    
    if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
    }
    
    showLoginScreen();
}

export async function handlePasswordReset() {
    const email = currentUserProfile?.email;
    if (!email) {
        return showMessage('Erro', 'Não foi possível identificar o seu e-mail.', 'error');
    }
    
    const message = `*Solicitação de Redefinição de Senha*\n\n*Email:* ${email}`;
    const whatsappLink = `https://wa.me/5516992886004?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappLink, '_blank');
    showMessage('Redefinição de Senha', 'Você será redirecionado para o WhatsApp para solicitar a redefinição de senha.', 'success');
}