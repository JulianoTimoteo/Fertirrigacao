// ============================================================================
// fertirrigacao/cards.js
// Cards das lagoas: gauge visual, badge online/offline, tendência 5min
// Toda a lógica vive em ferti_lagoas.js — este módulo re-exporta e
// fornece a constante de configuração para acesso direto se necessário.
// ============================================================================
export { getLagoasCardsHTML, initLagoasOffline, onLeituraESP32, getEstadoLagoas, getLagoaEstado } from '../ferti_lagoas.js';
export { LAGOA_CONFIG } from '../ferti_firebase.js';
