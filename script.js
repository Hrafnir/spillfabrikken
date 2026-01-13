/* Version: #2 */

// === FIREBASE IMPORTS (Browser Modules) ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/**
 * === KONFIGURASJON ===
 * Hentet fra ditt prosjekt: "spillfabrikken-14ea4"
 */
const firebaseConfig = {
    apiKey: "AIzaSyADgJ4KPhQ_mcbIJeqWawx7gutJYaNuhr8",
    authDomain: "spillfabrikken-14ea4.firebaseapp.com",
    projectId: "spillfabrikken-14ea4",
    storageBucket: "spillfabrikken-14ea4.firebasestorage.app",
    messagingSenderId: "260463073750",
    appId: "1:260463073750:web:de3f5c6ed048aa82bdac77",
    measurementId: "G-JPZGLWQZDF"
};

// === INITIALIZE FIREBASE ===
console.log("System: Connecting to Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
console.log("System: Firebase connected.");

// Global State
const AppState = {
    user: null,
    currentProject: null,
    editorMode: 'edit'
};

// === DOM ELEMENTS ===
const ui = {
    loginScreen: document.getElementById('login-overlay'),
    editorScreen: document.getElementById('editor-ui'),
    loginBtn: document.getElementById('login-btn'),
    registerBtn: document.getElementById('register-btn'), // Ny knapp
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    statusMsg: document.getElementById('status-msg'),
    logoutBtn: document.getElementById('logout-btn')
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initCanvas();
    
    // Start lytting på autentiserings-status (Innlogget/Utlogget)
    initAuthListener();
});

function setupEventListeners() {
    // Login Button
    ui.loginBtn.addEventListener('click', handleLogin);
    
    // Register Button (Ny funksjon)
    ui.registerBtn.addEventListener('click', handleRegister);

    // Logout Button
    ui.logoutBtn.addEventListener('click', handleLogout);

    console.log("System: Event listeners ready.");
}

function initCanvas() {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    
    // Placeholder grafikk
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#666';
    ctx.font = '20px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText("Velkommen til Spillfabrikken", canvas.width/2, canvas.height/2);
}

// === AUTH LOGIC (REAL FIREBASE) ===

function initAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Bruker er logget inn
            console.log("Auth: User detected:", user.email);
            AppState.user = user;
            ui.statusMsg.innerText = "Innlogging vellykket!";
            ui.statusMsg.style.color = "#4cd137";
            
            // Vent bittelitt for god opplevelse, så bytt skjerm
            setTimeout(() => transitionToEditor(), 500);
        } else {
            // Bruker er logget ut
            console.log("Auth: No user signed in.");
            AppState.user = null;
            transitionToLogin();
        }
    });
}

async function handleLogin() {
    const email = ui.emailInput.value;
    const pass = ui.passwordInput.value;

    if (!email || !pass) {
        showStatus("Fyll inn både e-post og passord.", "error");
        return;
    }

    showStatus("Logger inn...", "info");

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        // onAuthStateChanged vil håndtere resten
    } catch (error) {
        console.error("Login Error:", error.code, error.message);
        showStatus(oversattFeilmelding(error.code), "error");
    }
}

async function handleRegister() {
    const email = ui.emailInput.value;
    const pass = ui.passwordInput.value;

    if (!email || !pass) {
        showStatus("Fyll inn e-post og passord for å opprette bruker.", "error");
        return;
    }

    showStatus("Oppretter bruker...", "info");

    try {
        await createUserWithEmailAndPassword(auth, email, pass);
        showStatus("Bruker opprettet! Logger inn...", "success");
        // onAuthStateChanged vil håndtere resten
    } catch (error) {
        console.error("Register Error:", error.code, error.message);
        showStatus(oversattFeilmelding(error.code), "error");
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        console.log("Auth: Signed out.");
    } catch (error) {
        console.error("Logout Error:", error);
    }
}

// Hjelpefunksjon for å gi norsk tilbakemelding
function oversattFeilmelding(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email': return "Ugyldig e-postadresse.";
        case 'auth/user-disabled': return "Brukeren er deaktivert.";
        case 'auth/user-not-found': return "Finner ingen bruker med denne e-posten.";
        case 'auth/wrong-password': return "Feil passord.";
        case 'auth/email-already-in-use': return "E-posten er allerede i bruk.";
        case 'auth/weak-password': return "Passordet må være minst 6 tegn.";
        default: return "Det oppstod en feil: " + errorCode;
    }
}

function showStatus(msg, type) {
    ui.statusMsg.innerText = msg;
    if (type === "error") ui.statusMsg.style.color = "#d94545"; // Rød
    else if (type === "success") ui.statusMsg.style.color = "#4cd137"; // Grønn
    else ui.statusMsg.style.color = "#ffaa00"; // Gul/Orange
}

// === UI TRANSITIONS ===

function transitionToEditor() {
    if(ui.loginScreen.classList.contains('hidden')) return; // Allerede i editor

    ui.loginScreen.classList.add('hidden');
    ui.editorScreen.classList.remove('hidden');
    
    // Oppdater header info
    if(AppState.user) {
        console.log("UI: Setting up editor for " + AppState.user.email);
    }
}

function transitionToLogin() {
    ui.editorScreen.classList.add('hidden');
    ui.loginScreen.classList.remove('hidden');
    
    // Clear inputs
    ui.emailInput.value = '';
    ui.passwordInput.value = '';
    ui.statusMsg.innerText = '';
}

/* Version: #2 */
