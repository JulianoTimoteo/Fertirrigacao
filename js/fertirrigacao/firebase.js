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
  forcarPollLeituras
} from './fertirrigacaomonit.js';
