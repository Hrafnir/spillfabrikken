/* Version: #9 */

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    currentProject: null,
    editorMode: 'edit',
    unsubscribeAssets: null,
    
    // Editor State
    selectedAsset: null,  // Metadata for valgt fil
    loadedImage: null     // Selve bildeobjektet (Image) for tegning
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
    assetList: document.getElementById('asset-list'),
    canvas: document.getElementById('game-canvas'),
    inspector: document.getElementById('inspector-content')
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
    initCanvas(); // Tegner start-skjermen
    initAuthListener();
});

function setupEventListeners() {
    // Auth
    ui.loginBtn.onclick = handleLogin;
    ui.registerBtn.onclick = handleRegister;
    ui.googleBtn.onclick = handleGoogleLogin;
    ui.logoutBtn.onclick = handleLogout;
    
    // Assets
    ui.uploadBtn.onclick = () => ui.fileInput.click(); 
    ui.fileInput.onchange = handleFileUpload;
}

// === CANVAS RENDERING ===

function initCanvas() {
    if(!ui.canvas) return;
    // Sørg for at canvas har riktig oppløsning i forhold til CSS
    // (Foreløpig fast 800x600, men dette kan gjøres dynamisk senere)
    drawCanvas();
}

function drawCanvas() {
    const ctx = ui.canvas.getContext('2d');
    const width = ui.canvas.width;
    const height = ui.canvas.height;

    // 1. Tøm canvas / Tegn bakgrunn
    ctx.clearRect(0, 0, width, height);
    
    // Vi tegner ikke svart bakgrunn lenger, fordi CSS-en har sjakkbrett-mønster 
    // som er fint for å se transparens.

    // 2. Tegn innhold basert på state
    if (AppState.loadedImage) {
        drawImageCentered(ctx, width, height);
    } else {
        drawPlaceholder(ctx, width, height);
    }
}

function drawPlaceholder(ctx, width, height) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = '#666';
    ctx.font = '20px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Velg eller last opp en tegning", width/2, height/2);
}

function drawImageCentered(ctx, width, height) {
    const img = AppState.loadedImage;
    
    // Beregn sentrert posisjon
    const x = Math.floor((width - img.width) / 2);
    const y = Math.floor((height - img.height) / 2);
    
    // Tegn bildet 1:1 (pixel perfect)
    ctx.drawImage(img, x, y);
    
    // Tegn en tynn ramme rundt bildet for å vise hvor det slutter
    ctx.strokeStyle = "#007acc";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, img.width, img.height);
}

// === ASSET SELECTION & INSPECTOR ===

function selectAsset(asset, liElement) {
    console.log("Editor: Selecting asset", asset.originalName);
    
    // 1. Update UI Highlight
    // Fjern 'selected' klasse fra alle andre
    const allItems = ui.assetList.querySelectorAll('li');
    allItems.forEach(item => item.style.backgroundColor = "transparent");
    
    // Legg til på den valgte
    liElement.style.backgroundColor = "#007acc"; // Highlight color
    
    // 2. Update State
    AppState.selectedAsset = asset;
    
    // 3. Load Image for Canvas
    const img = new Image();
    img.crossOrigin = "Anonymous"; // Viktig for å kunne manipulere bildet senere
    img.src = asset.url;
    
    // Vis "Laster..." mens vi venter
    const ctx = ui.canvas.getContext('2d');
    ctx.clearRect(0,0, ui.canvas.width, ui.canvas.height);
    ctx.fillStyle = "#FFF";
    ctx.fillText("Laster bilde...", ui.canvas.width/2, ui.canvas.height/2);

    img.onload = () => {
        console.log("Editor: Image loaded", img.width, "x", img.height);
        AppState.loadedImage = img;
        drawCanvas();
        updateInspector(asset, img);
    };
    
    img.onerror = () => {
        console.error("Editor: Failed to load image");
        alert("Kunne ikke laste bildet inn i canvaset.");
    };
}

function updateInspector(asset, img) {
    ui.inspector.innerHTML = `
        <h3>Egenskaper</h3>
        <div style="margin-top: 15px;">
            <label style="font-size: 10px; color: #888;">FILNAVN</label>
            <p style="font-weight: bold; margin-bottom: 10px;">${asset.originalName}</p>
            
            <label style="font-size: 10px; color: #888;">DIMENSJONER</label>
            <p style="margin-bottom: 10px;">${img.width} x ${img.height} px</p>
            
            <label style="font-size: 10px; color: #888;">TYPE</label>
            <p style="margin-bottom: 10px;">${asset.type}</p>
            
            <div style="margin-top: 20px; border-top: 1px solid #444; padding-top: 10px;">
                <p style="font-size: 12px; color: #aaa;">
                    Tips: Du kan nå definere animasjoner ved å markere områder på bildet.
                </p>
            </div>
        </div>
    `;
}

// === AUTH LOGIC (Uendret) ===

function initAuthListener() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            AppState.user = user;
            ui.statusMsg.innerText = "Innlogging vellykket!";
            ui.statusMsg.style.color = "#4cd137";
            setTimeout(() => {
                transitionToEditor();
                subscribeToAssets(user.uid);
            }, 500);
        } else {
            AppState.user = null;
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
    auth.signInWithEmailAndPassword(email, pass).catch(err => showStatus(oversattFeilmelding(err.code), "error"));
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
    auth.signInWithPopup(provider).catch(err => {
        if (err.code !== 'auth/popup-closed-by-user') showStatus("Google feil: " + err.message, "error");
    });
}

function handleLogout() {
    auth.signOut();
}

// === ASSET MANAGEMENT (Laste opp + Liste) ===

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) { alert("Kun bilder!"); return; }
    
    const MAX_SIZE_MB = 10;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) { 
        alert(`Bildet er for stort! Maks ${MAX_SIZE_MB}MB.`);
        return;
    }

    ui.uploadBtn.innerText = "Laster opp...";
    ui.uploadBtn.disabled = true;
    
    const uid = AppState.user.uid;
    const storageRef = storage.ref().child(`users/${uid}/assets/${Date.now()}_${file.name}`);
    
    try {
        const snapshot = await storageRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        
        await db.collection('users').doc(uid).collection('assets').add({
            originalName: file.name,
            url: downloadURL,
            type: file.type,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Upload failed", error);
        alert("Feil ved opplasting: " + error.message);
    } finally {
        ui.fileInput.value = '';
        ui.uploadBtn.innerText = "+ Last opp";
        ui.uploadBtn.disabled = false;
    }
}

function subscribeToAssets(uid) {
    ui.assetList.innerHTML = '<li class="empty-state">Laster bilder...</li>';
    AppState.unsubscribeAssets = db.collection('users').doc(uid).collection('assets')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            ui.assetList.innerHTML = '';
            if (snapshot.empty) {
                ui.assetList.innerHTML = '<li class="empty-state">Ingen tegninger ennå.</li>';
                return;
            }
            snapshot.forEach(doc => renderAssetItem(doc.data(), doc.id));
        });
}

function renderAssetItem(asset, id) {
    const li = document.createElement('li');
    // Styling settes her via JS for enkelhets skyld, men kan flyttes til CSS
    li.style.padding = "8px";
    li.style.borderBottom = "1px solid #333";
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.cursor = "pointer";
    li.style.borderRadius = "4px";
    li.style.marginBottom = "2px";
    
    const img = document.createElement('img');
    img.src = asset.url;
    img.style.width = "32px";
    img.style.height = "32px";
    img.style.objectFit = "contain";
    img.style.marginRight = "10px";
    img.style.backgroundColor = "#222"; 
    img.style.borderRadius = "3px";
    
    const nameSpan = document.createElement('span');
    nameSpan.innerText = asset.originalName;
    nameSpan.style.fontSize = "13px";
    nameSpan.style.whiteSpace = "nowrap";
    nameSpan.style.overflow = "hidden";
    nameSpan.style.textOverflow = "ellipsis";
    
    li.appendChild(img);
    li.appendChild(nameSpan);
    
    // Koble klikk til funksjonen vår
    li.onclick = () => selectAsset(asset, li);

    ui.assetList.appendChild(li);
}

// === UTILS ===
function oversattFeilmelding(code) { return code; } // Forenklet for nå
function showStatus(msg, type) {
    ui.statusMsg.innerText = msg;
    ui.statusMsg.style.color = type === "error" ? "#d94545" : "#4cd137";
}
function transitionToEditor() {
    ui.loginScreen.classList.add('hidden');
    ui.editorScreen.classList.remove('hidden');
    if(AppState.user) ui.projectName.innerText = AppState.user.email;
}
function transitionToLogin() {
    ui.editorScreen.classList.add('hidden');
    ui.loginScreen.classList.remove('hidden');
}

/* Version: #9 */
