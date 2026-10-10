import { 
    getEquipamentos,
    invalidarCacheEquipamentos,
    getSensoresAtivos,
    apiPost,
    apiGet
} from '../api.js';
import { showMessage, showConfirmationModal } from '../main.js';
import { populateGrupoSelect, renderGruposAdmin } from './grupo.js';
import { populateEquipeSelect, renderEquipesAdmin } from './equipe.js';
import { getESP32StatusHTML, initESP32StatusPanel, destroyESP32StatusPanel } from './esp32status.js';

let allEquipment = [];
let filteredEquipment = [];
let carregandoMacs = false;

export function setupEquipamentosTab() {
    const container = document.getElementById('limites-tab');
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const tab = e.target.dataset.tab;
        if (!tab) return;

        container.querySelectorAll('.equip-sub-tab').forEach(b => b.classList.remove('active', 'border-emerald-500', 'text-emerald-600'));
        e.target.classList.add('active', 'border-emerald-500', 'text-emerald-600');
        container.querySelectorAll('.equip-sub-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(`${tab}-content`)?.classList.remove('hidden');

        if (tab === 'cadastrar-equip') {
            setTimeout(() => {
                populateGrupoSelect(document.querySelector('#cadastrar-equip-content select[name="grupo"]'));
                populateEquipeSelect(document.querySelector('#cadastrar-equip-content select[name="equipe"]'));
            }, 100);
        } else if (tab === 'vincular-equip') {
            loadMacManagement();
        } else if (tab === 'esp32-status') {
            const mount = document.getElementById('esp32-status-panel-mount');
            if (mount && !mount.dataset.initialized) {
                mount.innerHTML = getESP32StatusHTML();
                mount.dataset.initialized = '1';
                setTimeout(() => initESP32StatusPanel(), 100);
            }
        } else {
            loadAndRenderEquipamentos();
        }
    });

    const btnGrupos = document.getElementById('edit-groups-shortcut');
    const btnEquipes = document.getElementById('edit-teams-shortcut');
    
    if (btnGrupos) {
        btnGrupos.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.openGruposPopup) window.openGruposPopup();
        });
    }
    
    if (btnEquipes) {
        btnEquipes.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.openEquipesPopup) window.openEquipesPopup();
        });
    }

    const cadastroForm = document.getElementById('cadastro-equip-form');
    if (cadastroForm) {
        cadastroForm.addEventListener('submit', handleCadastroEquipamento);
    }

    // Event listener para botões de edição
    document.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-equip-btn');
        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            
            const codigo = editBtn.dataset.codigo || editBtn.dataset.id;
            console.log("✏️ Botão de edição clicado:", editBtn);
            console.log("📌 Código encontrado:", codigo);
            
            if (codigo) {
                openEditEquipamentoModal(codigo);
            } else {
                console.error("❌ Código não encontrado no botão");
                showMessage('Erro', 'Código do equipamento não encontrado.', 'error');
            }
        }
    });

    // 🔥 CONFIGURAR FILTROS
    setupFilters();

    loadAndRenderEquipamentos();
}

// ============================================================================
// FUNÇÕES DE FILTRO
// ============================================================================

function setupFilters() {
    // Filtro de pesquisa por texto
    const searchInput = document.getElementById('equipment-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    // Filtro por grupo
    const grupoFilter = document.getElementById('grupo-filter');
    if (grupoFilter) {
        // Popular o select de grupos
        populateGrupoSelect(grupoFilter);
        grupoFilter.addEventListener('change', applyFilters);
    }

    // Filtro por status
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
}

// ============================================================================
// FUNÇÕES DE FILTRO - CORRIGIDAS (COM CONVERSÃO PARA STRING)
// ============================================================================

function applyFilters() {
    const searchInput = document.getElementById('equipment-search-input');
    const grupoFilter = document.getElementById('grupo-filter');
    const statusFilter = document.getElementById('status-filter');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const grupoValue = grupoFilter ? grupoFilter.value : '';
    const statusValue = statusFilter ? statusFilter.value : '';

    console.log("🔍 Aplicando filtros:", { searchTerm, grupoValue, statusValue });
    console.log("📋 Total de equipamentos:", allEquipment.length);

    filteredEquipment = allEquipment.filter(equip => {
        const codigo = String(equip.codigo || '').toLowerCase();
        const descricao = String(equip.descricao || '').toLowerCase();
        
        const matchesSearch = searchTerm === '' || 
            codigo.includes(searchTerm) ||
            descricao.includes(searchTerm);

        const grupoEquip = String(equip.grupo || '').toLowerCase();
        const grupoFiltro = String(grupoValue).toLowerCase();
        const matchesGrupo = grupoValue === '' || grupoEquip === grupoFiltro;

        const isActive = equip.ativo == '1' || equip.ativo == 1 || equip.ativo === true;
        let matchesStatus = true;
        if (statusValue === 'ativo') {
            matchesStatus = isActive;
        } else if (statusValue === 'inativo') {
            matchesStatus = !isActive;
        }

        if (grupoValue && !matchesGrupo) {
            console.log(`❌ Equip ${equip.codigo} - Grupo: "${equip.grupo}" não corresponde a "${grupoValue}"`);
        }

        return matchesSearch && matchesGrupo && matchesStatus;
    });

    console.log(`✅ Filtro aplicado: ${filteredEquipment.length} equipamentos encontrados`);
    
    // 🔥 CHAMAR RENDERIZAÇÃO APÓS O FILTRO
    renderFilteredEquipamentos();
}


function renderFilteredEquipamentos() {
    const listBody = document.getElementById('equipment-list-body');
    if (!listBody) return;

    // 🔥 CORREÇÃO: Usar filteredEquipment, NÃO allEquipment quando há filtro ativo
    const searchInput = document.getElementById('equipment-search-input');
    const grupoFilter = document.getElementById('grupo-filter');
    const statusFilter = document.getElementById('status-filter');
    
    const hasActiveFilters = 
        (searchInput && searchInput.value.trim() !== '') ||
        (grupoFilter && grupoFilter.value !== '') ||
        (statusFilter && statusFilter.value !== '');

    // Se há filtros ativos, usar filteredEquipment, senão usar allEquipment
    const equipamentos = hasActiveFilters ? filteredEquipment : allEquipment;

    console.log(`📊 Renderizando ${equipamentos.length} equipamentos (filtros ativos: ${hasActiveFilters})`);

    if (equipamentos.length === 0) {
        listBody.innerHTML = `
        <tr><td colspan="6" class="p-8 text-center text-gray-500">
            <span class="material-symbols-outlined text-4xl mb-2">search_off</span>
            <p>Nenhum equipamento encontrado com os filtros aplicados.</p>
            <p class="text-sm mt-2">Tente ajustar os filtros ou limpar a pesquisa.</p>
        </td></tr>`;
        return;
    }

    listBody.innerHTML = equipamentos.map(equip => {
        const ativo = equip.ativo == '1' || equip.ativo == 1 || equip.ativo === true || equip.isActive === true;
        const codigo = equip.codigo || '';
        const descricao = equip.descricao || '';
        const grupo = equip.grupo || '';
        const equipe = equip.equipe || '';
        
        return `
        <tr class="border-b hover:bg-gray-50 transition-colors" data-equipamento-codigo="${codigo}" data-grupo="${String(grupo).toLowerCase()}">
            <td class="px-6 py-4 font-bold text-gray-800">${codigo}</td>
            <td class="px-6 py-4 text-sm">${descricao}</td>
            <td class="px-6 py-4 text-sm">${grupo}</td>
            <td class="px-6 py-4 text-sm">${equipe}</td>
            <td class="px-6 py-4 text-center">
                <span class="px-2 py-1 rounded-full text-[10px] font-bold ${ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} uppercase">
                    ${ativo ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td class="px-6 py-4 text-center">
                <button data-codigo="${codigo}" class="edit-equip-btn text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50 transition-all" title="Editar equipamento">
                    <span class="material-symbols-outlined">edit</span>
                </button>
            </td>
        </tr>`;
    }).join('');
}


// ============================================================================
// FUNÇÕES EXISTENTES (MANTIDAS IGUAIS)
// ============================================================================

async function refreshEquipmentList() {
    try {
        allEquipment = await getEquipamentos({ forceRefresh: true });
        filteredEquipment = [...allEquipment];
        console.log("📋 Equipamentos carregados:", allEquipment);
        return allEquipment;
    } catch (error) {
        console.error("Erro ao recarregar equipamentos:", error);
        return [];
    }
}

async function loadMacManagement() {
    if (carregandoMacs) {
        console.log("⏳ Já carregando MACs, aguarde...");
        return;
    }
    
    carregandoMacs = true;
    
    const listBody = document.getElementById('mac-list-body');
    if (!listBody) {
        carregandoMacs = false;
        return;
    }

    listBody.innerHTML = '<tr><td colspan="3" class="p-4 text-center animate-pulse">Carregando sensores da API...</td></tr>';
    
    try {
        await refreshEquipmentList();
        
        const sensores = await getSensoresAtivos();
        const macsComDados = sensores.map(s => s.mac);

        const vinculados = allEquipment.filter(e => e.macVinculado && e.macVinculado.length > 5);
        const macsUsados = vinculados.map(e => e.macVinculado);
        
        const disponiveis = macsComDados.filter(m => !macsUsados.includes(m));

        let html = '';

        html += '<tr class="bg-amber-50"><td colspan="3" class="p-3 font-bold text-amber-700">🆓 Sensores Disponíveis para Vincular</td></tr>';
        
        if (disponiveis.length === 0) {
            html += '<tr><td colspan="3" class="p-4 text-center style="color:var(--text-3)">Nenhum sensor novo detectado.</td></tr>';
        } else {
            disponiveis.forEach(mac => {
                html += `
                <tr class="border-b hover:bg-amber-50 transition-colors">
                    <td class="p-3 font-mono font-bold text-amber-700">${mac}</td>
                    <td class="p-3 text-gray-400 italic">—</td>
                    <td class="p-3 text-center">
                        <button onclick="window.vincularNovoMac('${mac}')" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-md text-xs font-bold shadow-sm transition-colors">
                            Vincular
                        </button>
                    </td>
                </tr>`;
            });
        }

        html += '<tr class="bg-emerald-50"><td colspan="3" class="p-3 font-bold text-emerald-700">📌 Sensores Vinculados a Equipamentos</td></tr>';
        
        if (vinculados.length === 0) {
            html += '<tr><td colspan="3" class="p-4 text-center style="color:var(--text-3)">Nenhum sensor vinculado.</td></tr>';
        } else {
            vinculados.forEach(e => {
                html += `
                <tr class="border-b hover:bg-emerald-50 transition-colors">
                    <td class="p-3 font-mono text-gray-600">${e.macVinculado}</td>
                    <td class="p-3 font-bold text-emerald-800">${e.descricao || 'Sem descrição'} (${e.codigo})</td>
                    <td class="p-3 text-center">
                        <button onclick="window.desvincularMac('${e.codigo}')" class="text-red-500 hover:text-red-700 font-bold text-xs underline">
                            Desvincular
                        </button>
                    </td>
                </tr>`;
            });
        }

        listBody.innerHTML = html;

    } catch (e) { 
        console.error("Erro ao carregar MACs:", e);
        listBody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-red-500">Erro ao carregar dados da API.</td></tr>';
    } finally {
        carregandoMacs = false;
    }
}

async function loadAndRenderEquipamentos() {
    try {
        const equipamentos = await getEquipamentos();
        const listBody = document.getElementById('equipment-list-body');
        if (!listBody) return;

        if (!equipamentos || equipamentos.length === 0) {
            listBody.innerHTML = `
            <tr><td colspan="6" class="p-8 text-center text-gray-500">
                <span class="material-symbols-outlined text-4xl mb-2">engineering</span>
                <p>Nenhum equipamento cadastrado.</p>
                <p class="text-sm mt-1">Use a aba "Novo Cadastro" para começar.</p>
            </td></tr>`;
            return;
        }

        allEquipment = equipamentos;
        filteredEquipment = [...allEquipment]; // 🔥 IMPORTANTE: inicializar filteredEquipment
        console.log("✅ Equipamentos para renderizar:", allEquipment);

        renderFilteredEquipamentos();
        
    } catch (error) {
        console.error("Erro ao carregar equipamentos:", error);
        const listBody = document.getElementById('equipment-list-body');
        if (listBody) {
            listBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Erro ao carregar equipamentos.</td></tr>`;
        }
    }
}

window.vincularNovoMac = async (mac) => {
    try {
        await refreshEquipmentList();
        const semMac = allEquipment.filter(e => !e.macVinculado || e.macVinculado === '');
        
        if (semMac.length === 0) {
            return showMessage('Aviso', 'Não existem equipamentos cadastrados sem sensor.', 'warning');
        }
        
        const modalPlaceholder = document.getElementById('modal-placeholder');
        modalPlaceholder.innerHTML = `
            <div id="vincular-mac-modal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
                <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
                    <button id="close-modal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-2xl">&times;</button>
                    <h3 class="text-lg font-bold mb-4">Vincular MAC ${mac}</h3>
                    <p class="text-sm text-gray-500 mb-4">Selecione o equipamento que receberá este sensor:</p>
                    <select id="equipamento-select" class="w-full p-2 border rounded-lg mb-4">
                        <option value="">Selecione...</option>
                        ${semMac.map(e => `<option value="${e.codigo}">${e.codigo} - ${e.descricao || 'Sem descrição'}</option>`).join('')}
                    </select>
                    <div class="flex justify-end gap-2">
                        <button id="cancelar-btn" class="px-4 py-2 bg-gray-200 rounded-lg">Cancelar</button>
                        <button id="confirmar-btn" class="px-4 py-2 bg-emerald-600 text-white rounded-lg">Vincular</button>
                    </div>
                </div>
            </div>`;

        const closeModalBtn = document.getElementById('close-modal');
        if (closeModalBtn) {
            closeModalBtn.onclick = () => {
                const modal = document.getElementById('vincular-mac-modal');
                if (modal) modal.remove();
            };
        }
        
        const cancelarBtn = document.getElementById('cancelar-btn');
        if (cancelarBtn) {
            cancelarBtn.onclick = () => {
                const modal = document.getElementById('vincular-mac-modal');
                if (modal) modal.remove();
            };
        }
        
        const confirmarBtn = document.getElementById('confirmar-btn');
        if (confirmarBtn) {
            confirmarBtn.onclick = async () => {
                const select = document.getElementById('equipamento-select');
                const codigo = select.value;
                if (!codigo) {
                    showMessage('Erro', 'Selecione um equipamento.', 'error');
                    return;
                }
                
                try {
                    const equipamento = allEquipment.find(e => e.codigo && String(e.codigo).trim() === String(codigo).trim());
                    if (!equipamento) {
                        showMessage('Erro', 'Equipamento não encontrado.', 'error');
                        return;
                    }
                    
                    console.log("📦 Equipamento encontrado para vincular:", equipamento);
                    
                    const dadosAtualizacao = {
                        codigo: equipamento.codigo,
                        descricao: equipamento.descricao || '',
                        grupo: equipamento.grupo || '',
                        equipe: equipamento.equipe || '',
                        hmesa: equipamento.hMesa || equipamento.hmesa || '100.0',
                        min: equipamento.produtivoMin || equipamento.min || '10.0',
                        max: equipamento.produtivoMax || equipamento.max || '45.0',
                        ativo: equipamento.ativo || equipamento.isActive ? '1' : '0',
                        macVinculado: mac 
                    };
                    
                    console.log("📤 Enviando atualização com todos os campos:", dadosAtualizacao);
                    
                    await apiPost('updateEquipamento', dadosAtualizacao);
                    invalidarCacheEquipamentos();
                    
                    showMessage('Sucesso', 'Sensor vinculado com sucesso!', 'success');
                    
                    const modal = document.getElementById('vincular-mac-modal');
                    if (modal) modal.remove();
                    
                    setTimeout(() => {
                        loadMacManagement();
                        loadAndRenderEquipamentos();
                    }, 500);
                    
                } catch (error) {
                    console.error("Erro ao vincular MAC:", error);
                    showMessage('Erro', 'Falha ao vincular sensor.', 'error');
                }
            };
        }

    } catch (error) {
        console.error("Erro ao vincular MAC:", error);
        showMessage('Erro', 'Falha ao vincular sensor.', 'error');
    }
};

window.desvincularMac = async (codigo) => {
    if (confirm('Deseja realmente desvincular o sensor deste equipamento?')) {
        try {
            console.log("🔍 Buscando equipamento com código:", codigo, "Tipo:", typeof codigo);
            console.log("📋 allEquipment atual:", allEquipment);
            console.log("📋 Códigos disponíveis:", allEquipment.map(e => e.codigo));
            
            const equipamento = allEquipment.find(e => {
                if (!e.codigo) return false;
                return String(e.codigo).trim() === String(codigo).trim();
            });
            
            if (!equipamento) {
                console.error("❌ Equipamento não encontrado. Código buscado:", codigo);
                showMessage('Erro', `Equipamento com código ${codigo} não encontrado.`, 'error');
                return;
            }
            
            console.log("✅ Equipamento encontrado para desvincular:", equipamento);
            
            const dadosAtualizacao = {
                codigo: equipamento.codigo,
                descricao: equipamento.descricao || '',
                grupo: equipamento.grupo || '',
                equipe: equipamento.equipe || '',
                hmesa: equipamento.hMesa || equipamento.hmesa || '100.0',
                min: equipamento.produtivoMin || equipamento.min || '10.0',
                max: equipamento.produtivoMax || equipamento.max || '45.0',
                ativo: equipamento.ativo || equipamento.isActive ? '1' : '0',
                macVinculado: '' 
            };
            
            console.log("📤 Enviando atualização com todos os campos:", dadosAtualizacao);
            
            await apiPost('updateEquipamento', dadosAtualizacao);
                    invalidarCacheEquipamentos();
            
            showMessage('Sucesso', 'Sensor desvinculado!', 'success');
            
            setTimeout(() => {
                loadMacManagement();
                loadAndRenderEquipamentos();
            }, 500);
            
        } catch (error) {
            console.error("Erro ao desvincular:", error);
            showMessage('Erro', 'Falha ao desvincular sensor.', 'error');
        }
    }
};

function openEditEquipamentoModal(codigo) {
    console.log("🔍 Editando equipamento com código:", codigo, "Tipo:", typeof codigo);
    console.log("📋 allEquipment atual:", allEquipment);
    console.log("📋 Códigos disponíveis:", allEquipment.map(e => e.codigo));
    
    const equip = allEquipment.find(e => {
        if (!e.codigo) return false;
        return String(e.codigo).trim() === String(codigo).trim();
    });
    
    if (!equip) {
        console.error("❌ Equipamento não encontrado. Código buscado:", codigo);
        showMessage('Erro', `Equipamento com código ${codigo} não encontrado.`, 'error');
        return;
    }

    console.log("✅ Equipamento encontrado:", equip);
    console.log("🔗 MAC Vinculado atual:", equip.macVinculado); // 🔥 DEBUG

    const ativo = equip.ativo == '1' || equip.ativo == 1 || equip.ativo === true || equip.isActive === true;

    const modalPlaceholder = document.getElementById('modal-placeholder');
    modalPlaceholder.innerHTML = `
        <div id="edit-equip-modal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
                <button id="close-modal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800 text-2xl">&times;</button>
                <h2 class="text-xl font-bold mb-6">Editar Equipamento</h2>
                
                <form id="edit-equip-form" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Código</label>
                        <input type="text" name="codigo" value="${equip.codigo || ''}" readonly
                               class="w-full mt-1 p-2 border rounded-lg bg-gray-100 cursor-not-allowed">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Descrição</label>
                        <input type="text" name="descricao" value="${equip.descricao || ''}" required
                               class="w-full mt-1 p-2 border rounded-lg">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Grupo</label>
                        <select name="grupo" required class="w-full mt-1 p-2 border rounded-lg">
                            <option value="">Selecione...</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Equipe</label>
                        <select name="equipe" required class="w-full mt-1 p-2 border rounded-lg">
                            <option value="">Selecione...</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700">h_Mesa (cm)</label>
                        <input type="number" step="0.1" name="hmesa" value="${equip.hMesa || equip.hmesa || 100.0}"
                               class="w-full mt-1 p-2 border rounded-lg">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Prof. Mínima</label>
                        <input type="number" step="0.1" name="min" value="${equip.produtivoMin || equip.min || 10.0}"
                               class="w-full mt-1 p-2 border rounded-lg">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Prof. Máxima</label>
                        <input type="number" step="0.1" name="max" value="${equip.produtivoMax || equip.max || 45.0}"
                               class="w-full mt-1 p-2 border rounded-lg">
                    </div>
                    
                    <div class="flex items-center">
                        <input type="checkbox" name="ativo" id="edit-ativo" ${ativo ? 'checked' : ''}
                               class="w-5 h-5 text-emerald-600">
                        <label for="edit-ativo" class="ml-2 text-sm text-gray-700">Ativo no Dashboard</label>
                    </div>
                    
                    <!-- 🔥 CAMPO OCULTO PARA MANTER O MAC VINCULADO -->
                    <input type="hidden" name="macVinculado" value="${equip.macVinculado || ''}">
                    
                    <div class="md:col-span-2 flex justify-end gap-4 pt-4 border-t mt-4">
                        <button type="button" id="cancelar-edit" class="px-6 py-2 bg-gray-200 rounded-lg">Cancelar</button>
                        <button type="submit" class="px-6 py-2 bg-emerald-600 text-white rounded-lg">Salvar Alterações</button>
                    </div>
                </form>
            </div>
        </div>`;

    setTimeout(() => {
        populateGrupoSelect(document.querySelector('#edit-equip-form select[name="grupo"]'), equip.grupo);
        populateEquipeSelect(document.querySelector('#edit-equip-form select[name="equipe"]'), equip.equipe);
    }, 100);

    const closeBtn = document.getElementById('close-modal');
    const cancelBtn = document.getElementById('cancelar-edit');
    
    const closeModal = () => {
        const modal = document.getElementById('edit-equip-modal');
        if (modal) modal.remove();
    };
    
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    document.getElementById('edit-equip-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target.elements;
        
        // 🔥 INCLUIR O MAC VINCULADO NA ATUALIZAÇÃO
        const updates = {
            codigo: equip.codigo,
            descricao: f.descricao.value,
            grupo: f.grupo.value,
            equipe: f.equipe.value,
            hmesa: parseFloat(f.hmesa.value),
            min: parseFloat(f.min.value),
            max: parseFloat(f.max.value),
            ativo: f.ativo.checked ? '1' : '0',
            macVinculado: f.macVinculado ? f.macVinculado.value : (equip.macVinculado || '') // 🔥 PRESERVA O MAC
        };
        
        console.log("📤 Enviando atualização:", updates);
        console.log("🔗 MAC sendo preservado:", updates.macVinculado);
        
        try {
            await apiPost('updateEquipamento', updates);
            invalidarCacheEquipamentos();
            await refreshEquipmentList();
            showMessage('Sucesso', 'Equipamento atualizado!', 'success');
            closeModal();
            loadAndRenderEquipamentos();
        } catch (error) {
            console.error("Erro ao atualizar:", error);
            showMessage('Erro', 'Falha ao atualizar equipamento.', 'error');
        }
    });
}


async function handleCadastroEquipamento(e) {
    e.preventDefault();
    const f = e.target.elements;
    const data = {
        codigo: f.codigo.value,
        descricao: f.descricao.value,
        grupo: f.grupo.value,
        equipe: f.equipe.value,
        hmesa: parseFloat(f.hmesa.value),
        min: parseFloat(f.min.value),
        max: parseFloat(f.max.value),
        ativo: f.ativo.checked ? '1' : '0',
        macVinculado: ''
    };
    
    console.log("📤 Cadastrando novo equipamento:", data);
    
    const existente = allEquipment.find(e => e.codigo && String(e.codigo).trim() === String(data.codigo).trim());
    if (existente) {
        showMessage('Erro', 'Já existe um equipamento com este código.', 'error');
        return;
    }
    
    try {
        await apiPost('updateEquipamento', data);
        invalidarCacheEquipamentos();
        await refreshEquipmentList();
        showMessage('Sucesso', 'Equipamento cadastrado!', 'success');
        e.target.reset();
        
        const gerenciarTab = document.querySelector('[data-tab="gerenciar-equip"]');
        if (gerenciarTab) gerenciarTab.click();
        
        loadAndRenderEquipamentos();
    } catch (error) {
        console.error("Erro ao cadastrar:", error);
        showMessage('Erro', 'Falha ao cadastrar equipamento.', 'error');
    }
}