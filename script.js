/* Version: #8 */

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    currentProject: null,
    editorMode: 'edit',
    unsubscribeAssets: null // To stop listening when logging out
};

// === DOM ELEMENTS ===
const ui = {
    // Auth screens
    loginScreen: document.getElementById('login-overlay'),
    editorScreen: document.getElementById('editor-ui'),
    
    // Auth buttons/inputs
    loginBtn: document.getElementById('login-btn'),
    registerBtn: document.getElementById('register-btn'),
    googleBtn: document.getElementById('google-btn'),
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    statusMsg: document.getElementById('status-msg'),
    logoutBtn: document.getElementById('logout-btn'),
    
    // Editor elements
    projectName: document.getElementById('project-name'),
    uploadBtn: document.getElementById('upload-asset-btn'),
    fileInput: document.getElementById('asset-file-input'),
    assetList: document.getElementById('asset-list')
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Script starting...");
    
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
    // Auth
    ui.loginBtn.onclick = handleLogin;
    ui.registerBtn.onclick = handleRegister;
    ui.googleBtn.onclick = handleGoogleLogin;
    ui.logoutBtn.onclick = handleLogout;
    
    // Assets
    ui.uploadBtn.onclick = () => ui.fileInput.click(); // Trigger hidden input
    ui.fileInput.onchange = handleFileUpload;
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
    auth.onAuthStateChanged((user) => {
        if (user) {
            console.log("Auth: User detected:", user.email);
            AppState.user = user;
            ui.statusMsg.innerText = "Innlogging vellykket!";
            ui.statusMsg.style.color = "#4cd137";
            
            setTimeout(() => {
                transitionToEditor();
                // Start listening for user's assets
                subscribeToAssets(user.uid);
            }, 500);
        } else {
            console.log("Auth: No user signed in.");
            AppState.user = null;
            
            // Stop listening to assets
            if (AppState.unsubscribeAssets) {
                AppState.unsubscribeAssets();
                AppState.unsubscribeAssets = null;
            }
            
            transitionToLogin();
        }
    });
}

function handleLogin() {
    const email = ui.emailInput.value;
    const pass = ui.passwordInput.value;
    if (!email || !pass) return showStatus("Fyll inn alt.", "error");
    
    showStatus("Logger inn...", "info");
    auth.signInWithEmailAndPassword(email, pass)
        .catch(err => showStatus(oversattFeilmelding(err.code), "error"));
}

function handleRegister() {
    const email = ui.emailInput.value;
    const pass = ui.passwordInput.value;
    if (!email || !pass) return showStatus("Fyll inn alt.", "error");
    if (pass.length < 6) return showStatus("Passord min 6 tegn.", "error");

    showStatus("Oppretter bruker...", "info");
    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => showStatus("Bruker opprettet!", "success"))
        .catch(err => showStatus(oversattFeilmelding(err.code), "error"));
}

function handleGoogleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .catch(err => {
            if (err.code !== 'auth/popup-closed-by-user') {
                showStatus("Google feil: " + err.message, "error");
            }
        });
}

function handleLogout() {
    auth.signOut();
}

// === ASSET MANAGEMENT (NYTT) ===

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 1. Basic Validation
    if (!file.type.startsWith('image/')) {
        alert("Du kan bare laste opp bilder (PNG, JPG, GIF).");
        return;
    }
    
    // ENDRET: Økt grense fra 2MB til 10MB
    const MAX_SIZE_MB = 10;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) { 
        alert(`Bildet er for stort! Maks ${MAX_SIZE_MB}MB.`);
        return;
    }

    console.log(`Assets: Starting upload for ${file.name}`);
    
    // Visuell feedback
    const originalText = ui.uploadBtn.innerText;
    ui.uploadBtn.innerText = "Laster opp...";
    ui.uploadBtn.disabled = true;
    
    const uid = AppState.user.uid;
    const storageRef = storage.ref().child(`users/${uid}/assets/${Date.now()}_${file.name}`);
    
    try {
        // 2. Upload to Firebase Storage
        const snapshot = await storageRef.put(file);
        console.log("Assets: Upload complete. Fetching URL...");
        
        const downloadURL = await snapshot.ref.getDownloadURL();
        
        // 3. Save reference to Firestore (Database)
        await db.collection('users').doc(uid).collection('assets').add({
            originalName: file.name,
            url: downloadURL,
            type: file.type,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log("Assets: Metadata saved to database.");
        
    } catch (error) {
        console.error("Assets: Upload failed", error);
        // Håndter permission errors spesifikt for å hjelpe deg
        if (error.code === 'storage/unauthorized' || error.code === 'permission-denied') {
            alert("Mangler tillatelse! Husk å oppdatere 'Rules' i Firebase Console (se instruksjoner).");
        } else {
            alert("Kunne ikke laste opp bilde: " + error.message);
        }
    } finally {
        ui.fileInput.value = '';
        ui.uploadBtn.innerText = originalText;
        ui.uploadBtn.disabled = false;
    }
}

function subscribeToAssets(uid) {
    console.log("Assets: Listening for changes in DB...");
    ui.assetList.innerHTML = '<li class="empty-state">Laster bilder...</li>';

    // Real-time listener
    AppState.unsubscribeAssets = db.collection('users').doc(uid).collection('assets')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            ui.assetList.innerHTML = ''; // Clear list
            
            if (snapshot.empty) {
                ui.assetList.innerHTML = '<li class="empty-state">Ingen tegninger ennå. Last opp en!</li>';
                return;
            }

            snapshot.forEach(doc => {
                const asset = doc.data();
                renderAssetItem(asset, doc.id);
            });
        }, (error) => {
            console.error("Assets: Listener error", error);
            if (error.code === 'permission-denied') {
                ui.assetList.innerHTML = '<li class="empty-state" style="color:orange">Mangler databasetilgang (Rules).</li>';
            } else {
                ui.assetList.innerHTML = '<li class="empty-state" style="color:red">Feil ved henting.</li>';
            }
        });
}

function renderAssetItem(asset, id) {
    const li = document.createElement('li');
    li.style.padding = "5px";
    li.style.borderBottom = "1px solid #333";
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.cursor = "pointer";
    li.style.transition = "background 0.2s";
    
    li.onmouseover = () => li.style.background = "#333";
    li.onmouseout = () => li.style.background = "transparent";
    
    // Thumbnail
    const img = document.createElement('img');
    img.src = asset.url;
    img.style.width = "40px";
    img.style.height = "40px";
    img.style.objectFit = "contain"; // Endret til contain for å se hele bildet
    img.style.marginRight = "10px";
    img.style.borderRadius = "4px";
    img.style.backgroundColor = "#222"; 
    
    // Name
    const nameSpan = document.createElement('span');
    nameSpan.innerText = asset.originalName;
    nameSpan.style.fontSize = "13px";
    nameSpan.style.overflow = "hidden";
    nameSpan.style.textOverflow = "ellipsis";
    nameSpan.style.whiteSpace = "nowrap";
    
    li.appendChild(img);
    li.appendChild(nameSpan);
    
    li.onclick = () => {
        console.log("Assets: Selected asset", id);
    };

    ui.assetList.appendChild(li);
}

// === UTILS ===
function oversattFeilmelding(code) {
    if(code === 'auth/wrong-password') return "Feil passord.";
    if(code === 'auth/user-not-found') return "Ingen bruker funnet.";
    return code; 
}

function showStatus(msg, type) {
    ui.statusMsg.innerText = msg;
    ui.statusMsg.style.color = type === "error" ? "#d94545" : type === "success" ? "#4cd137" : "#ffaa00";
}

function transitionToEditor() {
    ui.loginScreen.classList.add('hidden');
    ui.editorScreen.classList.remove('hidden');
    if(AppState.user) {
        ui.projectName.innerText = AppState.user.email;
    }
}

function transitionToLogin() {
    ui.editorScreen.classList.add('hidden');
    ui.loginScreen.classList.remove('hidden');
    ui.emailInput.value = '';
    ui.passwordInput.value = '';
    ui.statusMsg.innerText = '';
}

/* Version: #8 */
