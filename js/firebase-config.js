// ============================================================================
// firebase-config.js â€” ConexÃ£o Direta ao Firestore (fertirrigacaomonit)
// Gerencia UsuÃ¡rios, Equipamentos, Grupos e Equipes diretamente no Firebase
// ============================================================================

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyA6ZPZiDP-f3QeUzchkItKMgn3Xf9-NJTQ",
    authDomain: "fertirrigacaomonit.firebaseapp.com",
    projectId: "fertirrigacaomonit",
    storageBucket: "fertirrigacaomonit.firebasestorage.app",
    messagingSenderId: "707534137465",
    appId: "1:707534137465:web:839d7e27bc538de7308ca8",
    measurementId: "G-7MW20VV2W1"
};

// InicializaÃ§Ã£o segura (singleton)
export const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);

// Constantes de coleÃ§Ãµes no Firestore
export const COLLECTIONS = {
    USERS: 'users',
    EQUIPAMENTOS: 'equipamentos',
    GRUPOS: 'grupos',
    EQUIPES: 'equipes',
    MEDIDAS: 'medidas'
};

// Re-export das funÃ§Ãµes do Firestore para uso em outros mÃ³dulos
export {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy
};

console.log("ðŸ”¥ Firebase Firestore inicializado diretamente para UsuÃ¡rios e Equipamentos!");

