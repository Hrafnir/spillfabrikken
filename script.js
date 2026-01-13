/* Version: #5 */

// === GLOBAL APP STATE ===
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
    registerBtn: document.getElementById('register-btn'),
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    statusMsg: document.getElementById('status-msg'),
    logoutBtn: document.getElementById('logout-btn')
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Script starting...");
    
    // Sjekk om firebase-config.js har gjort jobben sin
    if (typeof auth === 'undefined') {
        console.error("Critical: 'auth' is missing. Did firebase-config.js load?");
        ui.statusMsg.innerText = "Feil: Systemet lastet ikke korrekt.";
        return;
    }

    setupEventListeners();
    initCanvas();
    initAuthListener();
});

function setupEventListeners() {
    ui.loginBtn.onclick = handleLogin;
    ui.registerBtn.onclick = handleRegister;
    ui.logoutBtn.onclick = handleLogout;
}

function initCanvas() {
    const canvas = document.getElementById('game-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#666';
    ctx.font = '20px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText("Velkommen til Spillfabrikken", canvas.width/2, canvas.height/2);
}

// === AUTH LOGIC ===

function initAuthListener() {
    // Vi bruker den globale 'auth' variabelen fra firebase-config.js
    auth.onAuthStateChanged((user) => {
        if (user) {
            console.log("Auth: User detected:", user.email);
            AppState.user = user;
            ui.statusMsg.innerText = "Innlogging vellykket!";
            ui.statusMsg.style.color = "#4cd137";
            setTimeout(() => transitionToEditor(), 500);
        } else {
            console.log("Auth: No user signed in.");
            AppState.user = null;
            transitionToLogin();
        }
    });
}

function handleLogin() {
    const email = ui.emailInput.value;
    const pass = ui.passwordInput.value;

    if (!email || !pass) {
        showStatus("Fyll inn både e-post og passord.", "error");
        return;
    }

    showStatus("Logger inn...", "info");

    auth.signInWithEmailAndPassword(email, pass)
        .catch((error) => {
            console.error("Login Error:", error);
            showStatus(oversattFeilmelding(error.code), "error");
        });
}

function handleRegister() {
    const email = ui.emailInput.value;
    const pass = ui.passwordInput.value;

    if (!email || !pass) {
        showStatus("Fyll inn e-post og passord.", "error");
        return;
    }

    if (pass.length < 6) {
        showStatus("Passordet må være minst 6 tegn.", "error");
        return;
    }

    showStatus("Oppretter bruker...", "info");

    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => {
            showStatus("Bruker opprettet! Logger inn...", "success");
        })
        .catch((error) => {
            console.error("Register Error:", error);
            showStatus(oversattFeilmelding(error.code), "error");
        });
}

function handleLogout() {
    auth.signOut().then(() => {
        console.log("Auth: Signed out.");
    });
}

// Hjelpefunksjoner
function oversattFeilmelding(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email': return "Ugyldig e-postadresse.";
        case 'auth/user-disabled': return "Brukeren er deaktivert.";
        case 'auth/user-not-found': return "Finner ingen bruker med denne e-posten.";
        case 'auth/wrong-password': return "Feil passord.";
        case 'auth/email-already-in-use': return "E-posten er allerede i bruk.";
        case 'auth/weak-password': return "Passordet må være minst 6 tegn.";
        default: return "Feil: " + errorCode;
    }
}

function showStatus(msg, type) {
    ui.statusMsg.innerText = msg;
    if (type === "error") ui.statusMsg.style.color = "#d94545";
    else if (type === "success") ui.statusMsg.style.color = "#4cd137";
    else ui.statusMsg.style.color = "#ffaa00";
}

// === UI TRANSITIONS ===

function transitionToEditor() {
    ui.loginScreen.classList.add('hidden');
    ui.editorScreen.classList.remove('hidden');
}

function transitionToLogin() {
    ui.editorScreen.classList.add('hidden');
    ui.loginScreen.classList.remove('hidden');
    
    ui.emailInput.value = '';
    ui.passwordInput.value = '';
    ui.statusMsg.innerText = '';
}

/* Version: #5 */
