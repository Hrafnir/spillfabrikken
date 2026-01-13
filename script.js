/* Version: #1 */

/**
 * === SPILLMOTOR KJERNE ===
 * Håndterer UI-tilstand, initialisering og overordnet flyt.
 */

// Global State
const AppState = {
    user: null,
    currentProject: null,
    editorMode: 'edit' // 'edit' or 'play'
};

// === DOM ELEMENTS ===
const ui = {
    loginScreen: document.getElementById('login-overlay'),
    editorScreen: document.getElementById('editor-ui'),
    loginBtn: document.getElementById('login-btn'),
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    statusMsg: document.getElementById('status-msg'),
    logoutBtn: document.getElementById('logout-btn')
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    console.log("System: Initializing Game Engine...");
    
    // Setup Event Listeners
    setupEventListeners();
    
    // Initialize Canvas (Placeholder for now)
    initCanvas();
});

function setupEventListeners() {
    // Login Button (Mock functionality for now)
    ui.loginBtn.addEventListener('click', handleMockLogin);

    // Logout Button
    ui.logoutBtn.addEventListener('click', handleLogout);

    console.log("System: Event listeners ready.");
}

function initCanvas() {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    
    // Tegn en enkel placeholder tekst
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#666';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText("Ingen brett lastet", canvas.width/2, canvas.height/2);
    
    console.log("System: Canvas initialized.");
}

// === AUTHENTICATION (MOCK FOR FASE 1) ===

function handleMockLogin() {
    const email = ui.emailInput.value;
    const pass = ui.passwordInput.value;

    console.log(`Auth: Attempting login for ${email}`);

    // Enkel validering for å teste UI
    if (email && pass) {
        ui.statusMsg.innerText = "Logger inn...";
        ui.statusMsg.style.color = "#4cd137"; // Green

        // Simuler nettverksforsinkelse
        setTimeout(() => {
            AppState.user = { email: email, id: 'user_123' };
            console.log("Auth: Login successful.");
            transitionToEditor();
        }, 800);
    } else {
        ui.statusMsg.innerText = "Vennligst fyll ut e-post og passord (test/test fungerer).";
        ui.statusMsg.style.color = "#d94545"; // Red
    }
}

function handleLogout() {
    console.log("Auth: Logging out.");
    AppState.user = null;
    transitionToLogin();
}

// === UI TRANSITIONS ===

function transitionToEditor() {
    ui.loginScreen.classList.add('hidden');
    ui.editorScreen.classList.remove('hidden');
    console.log("UI: Switched to Editor Mode.");
}

function transitionToLogin() {
    ui.editorScreen.classList.add('hidden');
    ui.loginScreen.classList.remove('hidden');
    // Clear inputs
    ui.emailInput.value = '';
    ui.passwordInput.value = '';
    ui.statusMsg.innerText = '';
    console.log("UI: Switched to Login Mode.");
}

/* Version: #1 */
