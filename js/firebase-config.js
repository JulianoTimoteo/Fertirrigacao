// ============================================================================
// firebase-config.js — Conexão Direta ao Firestore (fertirrigacaomonit)
// Gerencia Usuários, Equipamentos, Grupos e Equipes diretamente no Firebase
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
    apiKey: "AIzaSyBN-jcSaOxiIg9H8Zc2MxdPoBe36g3qnV4",
    authDomain: "monitoramento-esp32-2551e.firebaseapp.com",
    databaseURL: "https://monitoramento-esp32-2551e-default-rtdb.firebaseio.com",
    projectId: "monitoramento-esp32-2551e",
    storageBucket: "monitoramento-esp32-2551e.firebasestorage.app",
    messagingSenderId: "1026903641131",
    appId: "1:1026903641131:web:86e847b5e600914b26ae6e"
};

// Inicialização segura (singleton)
export const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);

// Constantes de coleções no Firestore
export const COLLECTIONS = {
    USERS: 'users',
    EQUIPAMENTOS: 'equipamentos',
    GRUPOS: 'grupos',
    EQUIPES: 'equipes',
    MEDIDAS: 'medidas'
};

// Re-export das funções do Firestore para uso em outros módulos
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

console.log("🔥 Firebase Firestore inicializado diretamente para Usuários e Equipamentos!");