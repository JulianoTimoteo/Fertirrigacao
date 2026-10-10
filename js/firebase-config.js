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
    apiKey: "AIzaSyA6ZPZiDP-f3QeUzchkItKMgn3Xf9-NJTQ",
    authDomain: "fertirrigacaomonit.firebaseapp.com",
    projectId: "fertirrigacaomonit",
    storageBucket: "fertirrigacaomonit.firebasestorage.app",
    appId: "1:707534137465:web:839d7e27bc538de7308ca8"
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