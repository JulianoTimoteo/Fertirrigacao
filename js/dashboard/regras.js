/**
 * MÓDULO DE REGRAS DE NEGÓCIO - VERSÃO 2.1
 * Análise inteligente de estado de implementos agrícolas
 */

// ============================================================================
// CONSTANTES E CONFIGURAÇÕES
// ============================================================================

export const STATUS = {
    TRABALHANDO_IDEAL: 'Trabalhando (Ideal)',
    TRABALHANDO_RASO: 'Trabalhando (Raso)',
    TRABALHANDO_FUNDO: 'Trabalhando (Fundo)',
    DESLOCAMENTO: 'Deslocamento',
    PARADO_MESA: 'Parado (Mesa)',
    PARADO_SUSPENSO: 'Parado (Suspenso)',
    DESLIGADO: 'Desligado',
    SEM_CONFIG: 'Sem Configuração',
    AGUARDANDO: 'Aguardando Dados'
};

// Parâmetros configuráveis
export const CONFIG_PADRAO = {
    JANELA_ANALISE: 8,
    TOLERANCIA_PARADO: 0.8,
    TOLERANCIA_TRABALHO: 2.5,
    TEMPO_DESLIGADO_MINUTOS: 5.0,  // 🔥 ALTERADO DE 2.0 PARA 5.0
    MIN_LEITURAS_PARA_ANALISE: 3,
    HISTERESE_PROFUNDIDADE: 1.5
};

// Cache para análise em tempo real
const historicoEmTempoReal = new Map();

// ============================================================================
// FUNÇÃO PARA FORMATAR TIMESTAMP CORRETAMENTE - VERSÃO ROBUSTA
// ============================================================================

export function formatarTimestampFixo(timestamp) {
    if (!timestamp) return new Date();
    
    try {
        // CASO 1: Timestamp do Firestore com seconds (mantido para compatibilidade com dados antigos)
        if (typeof timestamp === 'object' && timestamp !== null) {
            if ('seconds' in timestamp) {
                // VALIDAÇÃO: timestamp não pode ser negativo
                const seconds = Math.max(0, timestamp.seconds);
                return new Date(seconds * 1000);
            }
            if ('_seconds' in timestamp) {
                const seconds = Math.max(0, timestamp._seconds);
                return new Date(seconds * 1000);
            }
        }
        
        // CASO 2: Número
        if (typeof timestamp === 'number') {
            // Se for número negativo, usa data atual
            if (timestamp < 0) {
                console.warn("Timestamp negativo detectado, usando data atual");
                return new Date();
            }
            // Timestamp em segundos (ex: 1771503334)
            if (timestamp > 1000000000 && timestamp < 2000000000) {
                return new Date(timestamp * 1000);
            }
            // Timestamp em millissegundos (ex: 1771503334000)
            if (timestamp > 1000000000000) {
                return new Date(timestamp);
            }
        }
        
        // CASO 3: String ISO
        if (typeof timestamp === 'string') {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        
        return new Date();
    } catch (e) {
        console.error("Erro ao formatar timestamp:", e);
        return new Date();
    }
}

// ============================================================================
// FUNÇÃO PARA STATUS EM TEMPO REAL
// ============================================================================

export function calcularStatusTempoReal({
    mac,
    leituraAtual,
    hMesa,
    profundidadeMin,
    profundidadeMax,
    isActive = true,
    timestamp = new Date(),
    config = {},
    ultimaLeituraTimestamp
}) {
    
    const cfg = { ...CONFIG_PADRAO, ...config };
    
    if (!isActive) {
        return {
            status: STATUS.DESLIGADO,
            profundidadeCalculada: hMesa - leituraAtual,
            emTempoReal: true,
            motivo: 'Equipamento inativo'
        };
    }

    if (!hMesa || hMesa <= 0 || !profundidadeMin || !profundidadeMax) {
        return {
            status: STATUS.SEM_CONFIG,
            profundidadeCalculada: 0,
            emTempoReal: true,
            motivo: 'Sem configuração'
        };
    }

    if (leituraAtual === null || leituraAtual === undefined || leituraAtual <= 0) {
        return {
            status: STATUS.DESLIGADO,
            profundidadeCalculada: 0,
            emTempoReal: true,
            motivo: 'Leitura inválida'
        };
    }

    if (ultimaLeituraTimestamp) {
        const agora = new Date();
        const diffMs = agora - ultimaLeituraTimestamp;
        const tempoSemLeitura = diffMs / (1000 * 60);
        
        if (tempoSemLeitura > cfg.TEMPO_DESLIGADO_MINUTOS) {
            return {
                status: STATUS.DESLIGADO,
                profundidadeCalculada: hMesa - leituraAtual,
                emTempoReal: true,
                motivo: `Sem leituras há ${tempoSemLeitura.toFixed(1)}min`
            };
        }
    }

    return calcularStatusPorLeitura({
        mac,
        leituraAtual,
        hMesa,
        profundidadeMin,
        profundidadeMax,
        timestamp,
        cfg
    });
}

// ============================================================================
// FUNÇÃO PARA STATUS HISTÓRICO (SEM TEMPO REAL)
// ============================================================================

export function calcularStatusHistorico({
    mac,
    leituraAtual,
    hMesa,
    profundidadeMin,
    profundidadeMax,
    isActive = true,
    timestamp,
    config = {}
}) {
    
    const cfg = { ...CONFIG_PADRAO, ...config };
    
    if (!isActive) {
        return {
            status: STATUS.DESLIGADO,
            profundidadeCalculada: hMesa - leituraAtual,
            emTempoReal: false,
            motivo: 'Equipamento inativo na época'
        };
    }

    if (!hMesa || hMesa <= 0 || !profundidadeMin || !profundidadeMax) {
        return {
            status: STATUS.SEM_CONFIG,
            profundidadeCalculada: 0,
            emTempoReal: false,
            motivo: 'Sem configuração na época'
        };
    }

    if (leituraAtual === null || leituraAtual === undefined || leituraAtual <= 0) {
        return {
            status: STATUS.SEM_CONFIG,
            profundidadeCalculada: 0,
            emTempoReal: false,
            motivo: 'Leitura inválida na época'
        };
    }

    return calcularStatusPorLeitura({
        mac,
        leituraAtual,
        hMesa,
        profundidadeMin,
        profundidadeMax,
        timestamp,
        cfg,
        modoHistorico: true
    });
}

// ============================================================================
// FUNÇÃO BASE DE CÁLCULO
// ============================================================================

// ============================================================================
// FUNÇÃO BASE DE CÁLCULO - VERSÃO SIMPLIFICADA E CORRIGIDA
// ============================================================================

function calcularStatusPorLeitura({
    mac,
    leituraAtual,
    hMesa,
    profundidadeMin,
    profundidadeMax,
    timestamp,
    cfg,
    modoHistorico = false
}) {
    
    // Calcula a profundidade de inserção
    const profundidade = hMesa - leituraAtual;
    
    // ===== 1. DESLOCAMENTO (acima da mesa) =====
    if (leituraAtual > hMesa + cfg.TOLERANCIA_PARADO) {
        return {
            status: STATUS.DESLOCAMENTO,
            profundidadeCalculada: profundidade,
            motivo: `Equipamento acima da mesa (${leituraAtual.toFixed(2)}cm)`
        };
    }
    
    // ===== 2. PARADO NA MESA (muito próximo de hMesa) =====
    if (Math.abs(leituraAtual - hMesa) <= cfg.TOLERANCIA_PARADO * 2) {
        return {
            status: STATUS.PARADO_MESA,
            profundidadeCalculada: profundidade,
            motivo: `Parado na mesa (${leituraAtual.toFixed(2)}cm)`
        };
    }
    
    // ===== 3. TRABALHANDO (baseado na profundidade) =====
    if (profundidade >= profundidadeMin && profundidade <= profundidadeMax) {
        return {
            status: STATUS.TRABALHANDO_IDEAL,
            profundidadeCalculada: profundidade,
            motivo: `Trabalhando ideal (${profundidade.toFixed(2)}cm)`
        };
    }
    
    if (profundidade < profundidadeMin && profundidade > 0) {
        return {
            status: STATUS.TRABALHANDO_RASO,
            profundidadeCalculada: profundidade,
            motivo: `Trabalhando raso (${profundidade.toFixed(2)}cm)`
        };
    }
    
    if (profundidade > profundidadeMax) {
        return {
            status: STATUS.TRABALHANDO_FUNDO,
            profundidadeCalculada: profundidade,
            motivo: `Trabalhando fundo (${profundidade.toFixed(2)}cm)`
        };
    }
    
    // ===== 4. CASO PADRÃO =====
    return {
        status: STATUS.PARADO_MESA,
        profundidadeCalculada: profundidade,
        motivo: 'Status não determinado'
    };
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function calcularEstatisticas(valores) {
    if (!valores || valores.length === 0) {
        return { media: 0, desvioPadrao: 0, amplitude: 0 };
    }
    
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    
    if (valores.length === 1) {
        return { media, desvioPadrao: 0, amplitude: 0 };
    }
    
    const variancia = valores.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / valores.length;
    const desvioPadrao = Math.sqrt(variancia);
    const amplitude = Math.max(...valores) - Math.min(...valores);
    
    return { media, desvioPadrao, amplitude };
}

// ============================================================================
// FUNÇÕES PARA RECÁLCULO DE HISTÓRICO
// ============================================================================

export function recalcularStatusHistorico(leituras, equipamento) {
    const resultados = [];
    
    const leiturasOrdenadas = [...leituras].sort((a, b) => {
        const ta = a.timestamp?.seconds || a.timestamp || 0;
        const tb = b.timestamp?.seconds || b.timestamp || 0;
        return ta - tb;
    });
    
    for (const leitura of leiturasOrdenadas) {
        const timestamp = formatarTimestampFixo(leitura.timestamp);
        
        // 🔥 PEGAR VALORES CORRETOS DO EQUIPAMENTO
        const hMesaVal = equipamento.hMesa || equipamento.hmesa || 45; // Agora 45, não 100
        const minVal = equipamento.produtivoMin || equipamento.min || 10;
        const maxVal = equipamento.produtivoMax || equipamento.max || 30;
        
        const leituraVal = leitura.media_cm || leitura.leitura_sensor_cm || leitura.leitura || 0;
        
        const resultado = calcularStatusPorLeitura({
            mac: equipamento.mac,
            leituraAtual: leituraVal,
            hMesa: hMesaVal,
            profundidadeMin: minVal,
            profundidadeMax: maxVal,
            isActive: equipamento.isActive !== false,
            timestamp,
            cfg: CONFIG_PADRAO
        });
        
        resultados.push({
            ...leitura,
            leitura_sensor_cm: leituraVal,
            statusRecalculado: resultado.status,
            profundidadeCalculada: resultado.profundidadeCalculada,
            motivo: resultado.motivo
        });
    }
    
    return resultados.reverse();
}

// ============================================================================
// FUNÇÃO DE LOG - REMOVIDA (não há mais Firebase)
// ============================================================================

// A função registrarLog foi removida pois dependia do Firebase.
// Se necessário, implementar posteriormente usando apiPost.

// ============================================================================
// EXPORTAÇÕES COMPATÍVEIS
// ============================================================================

export const STATUS_ANTIGO = {
    TRABALHANDO: 'Trabalhando',
    SEM_OPERACAO: 'Sem Operação',
    PARADO: 'Parado',
    DESLIGADO: 'Desligado',
    ERRO: 'Erro Sensor',
    SEM_CONFIG: 'Sem Configuração'
};

export function recalcularStatusLeituras(leituras, equipamento) {
    return recalcularStatusHistorico(leituras, equipamento);
}

export function calcularStatus(
    profundidade, 
    hMesa, 
    limiteMin, 
    limiteMax, 
    isActive = true,
    tempoSemLeitura = 0
) {
    if (!isActive) return STATUS_ANTIGO.DESLIGADO;
    if (!limiteMin || !limiteMax || !hMesa) return STATUS_ANTIGO.SEM_CONFIG;
    if (tempoSemLeitura > CONFIG_PADRAO.TEMPO_DESLIGADO_MINUTOS) return STATUS_ANTIGO.DESLIGADO;
    
    if (profundidade < 0) return STATUS_ANTIGO.SEM_OPERACAO;
    if (Math.abs(profundidade) <= CONFIG_PADRAO.TOLERANCIA_PARADO) return STATUS_ANTIGO.PARADO;
    if (profundidade >= limiteMin && profundidade <= limiteMax) return STATUS_ANTIGO.TRABALHANDO;
    
    return STATUS_ANTIGO.SEM_OPERACAO;
}