// ferti_input.js - Gestão de Medidas Geométricas Reais
import { showMessage } from '../main.js';

const tanquesIds = [
    { id: 'T1', nome: 'Carreg Usina A' },
    { id: 'T2', nome: 'Carreg Usina B' },
    { id: 'T3', nome: 'Eucalipto Cheiroso' },
    { id: 'T4', nome: 'Castanha' },
    { id: 'T5', nome: 'Santa Teresinha' }
];

// ============================================================================
// FUNÇÃO PRINCIPAL PARA RENDERIZAR O FORMULÁRIO
// ============================================================================

export function renderConfigForm() {
    const container = document.getElementById('config-form-container');
    if (!container) {
        console.error("❌ Elemento config-form-container não encontrado");
        return;
    }

    let html = `<div class="grid grid-cols-1 md:grid-cols-2 gap-6">`;

    tanquesIds.forEach(tanque => {
        html += `
            <div class="config-tanque-card p-4 rounded-lg">
                <h3 class="text-lg font-bold mb-3 text-cyan-400">${tanque.nome}</h3>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs uppercase" style="color:var(--text-3)">Comp. Topo (m)</label>
                        <input type="number" id="L_top_${tanque.id}" class="w-full rounded p-1" style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1)" step="0.01" placeholder="Ex: 40.0">
                    </div>
                    <div>
                        <label class="block text-xs uppercase" style="color:var(--text-3)">Larg. Topo (m)</label>
                        <input type="number" id="W_top_${tanque.id}" class="w-full rounded p-1" style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1)" step="0.01" placeholder="Ex: 20.0">
                    </div>
                    <div>
                        <label class="block text-xs uppercase" style="color:var(--text-3)">Comp. Fundo (m)</label>
                        <input type="number" id="L_bottom_${tanque.id}" class="w-full rounded p-1" style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1)" step="0.01" placeholder="Ex: 35.0">
                    </div>
                    <div>
                        <label class="block text-xs uppercase" style="color:var(--text-3)">Larg. Fundo (m)</label>
                        <input type="number" id="W_bottom_${tanque.id}" class="w-full rounded p-1" style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1)" step="0.01" placeholder="Ex: 15.0">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs uppercase" style="color:var(--text-3)">Profundidade Total / Altura Útil (m)</label>
                        <input type="number" id="H_max_${tanque.id}" class="w-full rounded p-1" style="background:var(--bg-input);color:var(--text-1);border:1px solid var(--border-1)" step="0.01" placeholder="Ex: 3.0">
                    </div>
                </div>
            </div>`;
    });

    html += `</div>
        <div class="mt-6 flex justify-end gap-4">
            <button id="default-config-btn" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition-all flex items-center gap-2">
                <span class="material-symbols-outlined">restore</span> Valores Padrão
            </button>
            <button id="save-config-btn" class="bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-bold py-2 px-6 rounded-lg transition-all flex items-center gap-2">
                <span class="material-symbols-outlined">save</span> Salvar Dimensões
            </button>
        </div>`;

    container.innerHTML = html;
    
    // Adiciona os event listeners após renderizar
    const saveBtn = document.getElementById('save-config-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveAllConfigs);
    }
    
    const defaultBtn = document.getElementById('default-config-btn');
    if (defaultBtn) {
        defaultBtn.addEventListener('click', setDefaultConfig);
    }
    
    // Tenta carregar configurações salvas após um pequeno delay
    setTimeout(() => {
        carregarConfiguracoesSalvas();
    }, 100);
}

// ============================================================================
// FUNÇÃO PARA SALVAR TODAS AS CONFIGURAÇÕES
// ============================================================================

export function saveAllConfigs() {
    const configData = {};
    
    tanquesIds.forEach(t => {
        const lTop = document.getElementById(`L_top_${t.id}`)?.value;
        const wTop = document.getElementById(`W_top_${t.id}`)?.value;
        const lBottom = document.getElementById(`L_bottom_${t.id}`)?.value;
        const wBottom = document.getElementById(`W_bottom_${t.id}`)?.value;
        const hMax = document.getElementById(`H_max_${t.id}`)?.value;

        configData[t.id] = {
            L_top: parseFloat(lTop) || 0,
            W_top: parseFloat(wTop) || 0,
            L_bottom: parseFloat(lBottom) || 0,
            W_bottom: parseFloat(wBottom) || 0,
            H_max: parseFloat(hMax) || 0
        };
    });

    // Salva no localStorage
    localStorage.setItem('agro_tanks_config', JSON.stringify(configData));
    
    // Dispara evento para que lagoas.js e vazao.js recalculem volumes com a nova config
    // Isso atualiza os cards de Níveis Atuais e o Volume Total imediatamente
    window.dispatchEvent(new CustomEvent('ferti:configTanquesSalva', { detail: configData }));
    
    // Força re-render dos acumulados após novo config
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ferti:recalcularVolumes'));
    }, 100);
    
    // Mostra mensagem de sucesso
    showMessage('Configurações Salvas', 'Dimensões dos tanques atualizadas. Os volumes serão recalculados automaticamente.', 'success');
    
    console.log("✅ Configurações salvas:", configData);
}

// ============================================================================
// FUNÇÃO PARA CARREGAR CONFIGURAÇÕES SALVAS
// ============================================================================

function carregarConfiguracoesSalvas() {
    console.log("🔧 Carregando configurações salvas...");
    
    const savedConfig = localStorage.getItem('agro_tanks_config');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            if (config.T4 && (config.T4.H_max === 3.2 || !config.T4.H_max)) {
                config.T4.H_max = 3.0;
                config.T4.L_top = 42.0;
                config.T4.W_top = 22.0;
                config.T4.L_bottom = 36.0;
                config.T4.W_bottom = 16.0;
                localStorage.setItem('agro_tanks_config', JSON.stringify(config));
            }
            preencherConfiguracoes(config);
            console.log("✅ Configurações carregadas do localStorage");
        } catch (e) {
            console.error("❌ Erro ao carregar configurações salvas:", e);
        }
    } else {
        console.log("ℹ️ Nenhuma config salva — usando valores padrão");
        preencherConfiguracoes(getDefaultConfig());
    }
}

function getDefaultConfig() {
    return {
        T1: { L_top: 40.0, W_top: 20.0, L_bottom: 35.0, W_bottom: 15.0, H_max: 3.0 },
        T2: { L_top: 40.0, W_top: 20.0, L_bottom: 35.0, W_bottom: 15.0, H_max: 3.0 },
        T3: { L_top: 38.0, W_top: 18.0, L_bottom: 32.0, W_bottom: 13.0, H_max: 2.8 },
        T4: { L_top: 42.0, W_top: 22.0, L_bottom: 36.0, W_bottom: 16.0, H_max: 3.0 },
        T5: { L_top: 45.0, W_top: 25.0, L_bottom: 38.0, W_bottom: 18.0, H_max: 3.5 }
    };
}

// ============================================================================
// FUNÇÃO PARA PREENCHER OS INPUTS COM VALORES SALVOS
// ============================================================================

function preencherConfiguracoes(config) {
    tanquesIds.forEach(t => {
        if (config[t.id]) {
            const dados = config[t.id];
            
            const lTop = document.getElementById(`L_top_${t.id}`);
            const wTop = document.getElementById(`W_top_${t.id}`);
            const lBottom = document.getElementById(`L_bottom_${t.id}`);
            const wBottom = document.getElementById(`W_bottom_${t.id}`);
            const hMax = document.getElementById(`H_max_${t.id}`);
            
            if (lTop && dados.L_top) lTop.value = dados.L_top;
            if (wTop && dados.W_top) wTop.value = dados.W_top;
            if (lBottom && dados.L_bottom) lBottom.value = dados.L_bottom;
            if (wBottom && dados.W_bottom) wBottom.value = dados.W_bottom;
            if (hMax && dados.H_max) hMax.value = dados.H_max;
        }
    });
}

// ============================================================================
// FUNÇÃO PARA DEFINIR VALORES PADRÃO
// ============================================================================

export function setDefaultConfig() {
    const defaultConfig = getDefaultConfig();
    preencherConfiguracoes(defaultConfig);
    localStorage.setItem('agro_tanks_config', JSON.stringify(defaultConfig));
    window.dispatchEvent(new CustomEvent('ferti:configTanquesSalva', { detail: defaultConfig }));
    setTimeout(() => window.dispatchEvent(new CustomEvent('ferti:recalcularVolumes')), 100);
    showMessage('Configurações padrão carregadas!', 'success');
    console.log("✅ Configurações padrão carregadas");
}

// ============================================================================
// FUNÇÃO PARA INICIALIZAR A ABA QUANDO CLICADA (EXPORTADA)
// ============================================================================

export function setupConfigTanquesTab() {
    console.log("🔧 Inicializando aba de configuração de tanques...");
    
    // Primeiro renderiza o formulário se necessário
    const container = document.getElementById('config-form-container');
    if (container && container.children.length === 0) {
        renderConfigForm();
    } else {
        // Se já estiver renderizado, apenas carrega as configurações
        carregarConfiguracoesSalvas();
    }
}

// ============================================================================
// FUNÇÃO PARA LIMPAR TODAS AS CONFIGURAÇÕES (OPCIONAL)
// ============================================================================

export function limparConfiguracoes() {
    tanquesIds.forEach(t => {
        const lTop = document.getElementById(`L_top_${t.id}`);
        const wTop = document.getElementById(`W_top_${t.id}`);
        const lBottom = document.getElementById(`L_bottom_${t.id}`);
        const wBottom = document.getElementById(`W_bottom_${t.id}`);
        const hMax = document.getElementById(`H_max_${t.id}`);
        
        if (lTop) lTop.value = '';
        if (wTop) wTop.value = '';
        if (lBottom) lBottom.value = '';
        if (wBottom) wBottom.value = '';
        if (hMax) hMax.value = '';
    });
    
    localStorage.removeItem('agro_tanks_config');
    showMessage('Configurações removidas!', 'info');
}