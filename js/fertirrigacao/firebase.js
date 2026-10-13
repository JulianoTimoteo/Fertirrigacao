// ============================================================================
// firebase.js — PONTO DE RE-EXPORT (compatibilidade)
// Redireciona todas as exportações para fertirrigacaomonit.js
// ============================================================================
export {
  LAGOA_CONFIG,
  initFertiFirebase,
  subscribeLagoa,
  unsubscribeAllLagoas,
  getESP32Health,
  forcarPollLeituras,
  setDataVisualizacao,
  getDataVisualizacao,
  obterHistoricoMedidas,
  obterHistoricoLagoa,
  obterHistoricoTodosTanques
} from './fertirrigacaomonit.js';
