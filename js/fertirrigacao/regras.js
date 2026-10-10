// ferti_regras.js - Motor de Cálculo e Regras de Negócio

export function calcularVolumeTronco(h, config) {
    if (!config || h <= 0) return 0;
    
    // Limita a altura lida à altura máxima configurada do tanque
    const alturaProcessada = h > config.H_max ? config.H_max : h;

    const A_bottom = config.L_bottom * config.W_bottom;
    
    // Proporção do aumento das dimensões com base na altura atual (Trapézio Invertido)
    const L_h = config.L_bottom + (alturaProcessada / config.H_max) * (config.L_top - config.L_bottom);
    const W_h = config.W_bottom + (alturaProcessada / config.H_max) * (config.W_top - config.W_bottom);
    const A_h = L_h * W_h;

    // Fórmula do Tronco de Pirâmide: V = (h/3) * (Ab + Ah + sqrt(Ab * Ah))
    const volume_m3 = (1/3) * alturaProcessada * (A_bottom + A_h + Math.sqrt(A_bottom * A_h));
    
    return volume_m3 * 1000; // Retorna o volume convertido para Litros
}

export function processarMovimentacao(variacoes) {
    // Exemplo esperado de variacoes: { T1: -500, T2: 0, T3: 450, T4: 0, T5: 0 }
    let resultado = { tipo: 'estável', volume: 0 };

    // Soma as saídas apenas dos tanques de carregamento T1 e T2
    const saidaTotal = Math.abs(Object.keys(variacoes)
        .filter(id => id === 'T1' || id === 'T2')
        .reduce((sum, id) => sum + (variacoes[id] < 0 ? variacoes[id] : 0), 0));

    // Soma as entradas nos tanques de destino T3, T4 e T5
    const entradaDestinos = Object.keys(variacoes)
        .filter(id => id === 'T3' || id === 'T4' || id === 'T5')
        .reduce((sum, id) => sum + (variacoes[id] > 0 ? variacoes[id] : 0), 0);

    // Lógica Agroanalytics: Diferenciação entre movimentação interna e aplicação no campo
    if (saidaTotal > 10) { // Margem de segurança para ignorar ruídos de leitura (10L)
        if (entradaDestinos > 10) {
            // Se o volume saiu de T1/T2 e subiu em outros tanques
            resultado = { tipo: 'movimentação', volume: entradaDestinos };
        } else {
            // Se saiu de T1/T2 e nenhum outro tanque subiu, considera-se aplicado no campo
            resultado = { tipo: 'aplicação', volume: saidaTotal };
        }
    }

    return resultado;
}