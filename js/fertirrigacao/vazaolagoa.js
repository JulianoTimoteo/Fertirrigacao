// ============================================================================
// fertirrigacao/vazaolagoa.js
// Re-export da tabela de Vazão por Lagoa (módulo de compatibilidade)
// O conteúdo real está em vazao.js
// ============================================================================
export { getVazaoHTML, atualizarAcumulados, setupMetaInput,
         resetAcumulados, recalcularVolumeFromEstado, zerarSaida } from './vazao.js';
