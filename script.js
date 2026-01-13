/* Version: #10 */

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    currentProject: null,
    editorMode: 'edit',
    unsubscribeAssets: null,
    
    // Editor State
    selectedAsset: null,
    loadedImage: null,
    
    // Viewport / Camera State
    viewport: {
        zoom: 1.0,
        offsetX: 0,
        offsetY: 0,
        isDragging: false,
        lastMouseX: 0,
        lastMouseY: 0,
        bgColor: '#222222',
        activeTool: 'select' // 'select' or 'pan'
    }
};

// === DOM ELEMENTS ===
const ui = {
    // Auth
    loginScreen: document.getElementById('login-overlay'),
    editorScreen: document.getElementById('editor-ui'),
    loginBtn: document.getElementById('login-btn'),
    registerBtn: document.getElementById('register-btn'),
    googleBtn: document.getElementById('google-btn'),
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    statusMsg: document.getElementById('status-msg'),
    logoutBtn: document.getElementById('logout-btn'),
    
    // Editor - General
    projectName: document.getElementById('project-name'),
    uploadBtn: document.getElementById('upload-asset-btn'),
    fileInput: document.getElementById('asset-file-input'),
    assetList: document.getElementById('asset-list'),
    inspector: document.getElementById('inspector-content'),
    
    // Editor - Viewport & Tools
    canvas: document.getElementById('game-canvas'),
    toolSelect: document.getElementById('tool-select'),
    toolPan: document.getElementById('tool-pan'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    zoomLabel: document.getElementById('zoom-level'),
    bgColorPicker: document.getElementById('bg-color-picker')
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Script starting...");
    
    if (typeof auth === 'undefined') {
        console.error("Critical: 'auth' is missing.");
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
    ui.uploadBtn.onclick = () => ui.fileInput.click(); 
    ui.fileInput.onchange = handleFileUpload;

    // Viewport Tools
    ui.zoomInBtn.onclick = () => handleZoom(0.1);
    ui.zoomOutBtn.onclick = () => handleZoom(-0.1);
    
    ui.toolSelect.onclick = () => setTool('select');
    ui.toolPan.onclick = () => setTool('pan');
    
    ui.bgColorPicker.oninput = (e) => {
        AppState.viewport.bgColor = e.target.value;
        drawCanvas();
    };
}

// === VIEWPORT LOGIC ===

function initCanvas() {
    if(!ui.canvas) return;

    // Mouse Events for Panning
    ui.canvas.addEventListener('mousedown', (e) => {
        if (AppState.viewport.activeTool === 'pan') {
            AppState.viewport.isDragging = true;
            AppState.viewport.lastMouseX = e.clientX;
            AppState.viewport.lastMouseY = e.clientY;
            ui.canvas.style.cursor = "grabbing";
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (AppState.viewport.isDragging) {
            const deltaX = e.clientX - AppState.viewport.lastMouseX;
            const deltaY = e.clientY - AppState.viewport.lastMouseY;
            
            AppState.viewport.offsetX += deltaX;
            AppState.viewport.offsetY += deltaY;
            
            AppState.viewport.lastMouseX = e.clientX;
            AppState.viewport.lastMouseY = e.clientY;
            
            drawCanvas();
        }
    });

    window.addEventListener('mouseup', () => {
        if (AppState.viewport.isDragging) {
            AppState.viewport.isDragging = false;
            ui.canvas.style.cursor = AppState.viewport.activeTool === 'pan' ? "grab" : "default";
        }
    });
    
    // Zoom with Scroll Wheel
    ui.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const direction = e.deltaY > 0 ? -0.1 : 0.1;
        handleZoom(direction);
    });

    drawCanvas();
}

function setTool(toolName) {
    AppState.viewport.activeTool = toolName;
    
    // Update UI buttons
    if (toolName === 'select') {
        ui.toolSelect.classList.add('active');
        ui.toolPan.classList.remove('active');
        ui.canvas.style.cursor = "default";
    } else {
        ui.toolSelect.classList.remove('active');
        ui.toolPan.classList.add('active');
        ui.canvas.style.cursor = "grab";
    }
}

function handleZoom(amount) {
    let newZoom = AppState.viewport.zoom + amount;
    
    // Clamp zoom levels (0.1x to 5.0x)
    newZoom = Math.max(0.1, Math.min(newZoom, 5.0));
    
    // Round to 1 decimal for cleanliness
    newZoom = Math.round(newZoom * 10) / 10;
    
    AppState.viewport.zoom = newZoom;
    ui.zoomLabel.innerText = Math.round(newZoom * 100) + "%";
    
    drawCanvas();
}

// === RENDERING ENGINE ===

function drawCanvas() {
    const ctx = ui.canvas.getContext('2d');
    const width = ui.canvas.width;
    const height = ui.canvas.height;

    // 1. Clear & Fill Background
    ctx.clearRect(0, 0, width, height);
    
    // Fill with user selected color
    ctx.fillStyle = AppState.viewport.bgColor;
    ctx.fillRect(0, 0, width, height);

    // 2. Setup Camera (Transformations)
    ctx.save(); // Save default state
    
    // Move origin to center of screen + panning offset
    ctx.translate(width/2 + AppState.viewport.offsetX, height/2 + AppState.viewport.offsetY);
    
    // Apply Zoom
    ctx.scale(AppState.viewport.zoom, AppState.viewport.zoom);

    // 3. Draw Content
    if (AppState.loadedImage) {
        drawImage(ctx);
    } else {
        // Hvis ingen bilde er lastet, tegn tekst (må reversere transform for teksten skal stå stille, eller bare tegne den relativt)
        // For enkelhets skyld: Vi tegner placeholder KUN hvis vi ikke har bilde, og vi ignorerer zoom for teksten.
        ctx.restore(); 
        drawPlaceholder(ctx, width, height);
        return; 
    }

    ctx.restore(); // Restore default state
}

function drawImage(ctx) {
    const img = AppState.loadedImage;
    
    // Vi tegner bildet sentrert rundt origo (0,0) som vi flyttet med translate ovenfor
    const x = -img.width / 2;
    const y = -img.height / 2;
    
    ctx.drawImage(img, x, y);
    
    // Tegn ramme rundt
    ctx.strokeStyle = "#007acc";
    ctx.lineWidth = 2 / AppState.viewport.zoom; // Hold linjetykkelsen konstant uansett zoom
    ctx.strokeRect(x, y, img.width, img.height);
}

function drawPlaceholder(ctx, width, height) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '20px Segoe UI';
    ctx.fillText("Velg en tegning fra menyen", width/2, height/2);
}

// === ASSET SELECTION ===

function selectAsset(asset, liElement) {
    // UI Update
    const allItems = ui.assetList.querySelectorAll('li');
    allItems.forEach(item => item.style.backgroundColor = "transparent");
    liElement.style.backgroundColor = "#007acc";
    
    // State Update
    AppState.selectedAsset = asset;
    
    // Reset Viewport (Optional: Keep zoom/pan or reset? Let's reset for fresh view)
    AppState.viewport.zoom = 1.0;
    AppState.viewport.offsetX = 0;
    AppState.viewport.offsetY = 0;
    ui.zoomLabel.innerText = "100%";
    
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = asset.url;
    
    // Loading indicator
    const ctx = ui.canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0); // Reset transforms temporarily
    ctx.fillStyle = "#FFF";
    ctx.clearRect(0,0, ui.canvas.width, ui.canvas.height);
    ctx.fillText("Laster...", ui.canvas.width/2, ui.canvas.height/2);
    ctx.restore();

    img.onload = () => {
        AppState.loadedImage = img;
        drawCanvas();
        updateInspector(asset, img);
    };
    
    img.onerror = () => {
        alert("Kunne ikke laste bildet. Sjekk CORS-innstillinger i Google Cloud.");
    };
}

function updateInspector(asset, img) {
    ui.inspector.innerHTML = `
        <h3>Bildeinfo</h3>
        <div style="margin-top: 15px;">
            <label style="font-size: 10px; color: #888;">FILNAVN</label>
            <p style="font-weight: bold; margin-bottom: 10px;">${asset.originalName}</p>
            
            <label style="font-size: 10px; color: #888;">STØRRELSE</label>
            <p style="margin-bottom: 10px;">${img.width} x ${img.height} px</p>
            
            <hr style="border: 0; border-top: 1px solid #444; margin: 15px 0;">
            <p style="font-size: 12px; color: #aaa;">
                Bruk <b>Hånd-verktøyet</b> for å flytte bildet.<br>
                Bruk <b>Zoom</b> for å se detaljer.
            </p>
        </div>
    `;
}

// === AUTH & FILE UPLOAD (Uendret logikk) ===

function initAuthListener() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            AppState.user = user;
            ui.statusMsg.innerText = "Logget inn";
            ui.statusMsg.style.color = "#4cd137";
            setTimeout(() => {
                transitionToEditor();
                subscribeToAssets(user.uid);
            }, 500);
        } else {
            AppState.user = null;
            if (AppState.unsubscribeAssets) AppState.unsubscribeAssets();
            transitionToLogin();
        }
    });
}

function handleLogin() {
    const email = ui.emailInput.value;
    const pass = ui.passwordInput.value;
    if (!email || !pass) return showStatus("Fyll inn alt", "error");
    auth.signInWithEmailAndPassword(email, pass).catch(err => showStatus(err.code, "error"));
}

function handleRegister() {
    const email = ui.emailInput.value;
    const pass = ui.passwordInput.value;
    if (!email || !pass) return showStatus("Fyll inn alt", "error");
    auth.createUserWithEmailAndPassword(email, pass)
        .then(() => showStatus("Bruker laget!", "success"))
        .catch(err => showStatus(err.code, "error"));
}

function handleGoogleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => console.error(err));
}

function handleLogout() { auth.signOut(); }

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validation
    if (!file.type.startsWith('image/')) return alert("Kun bilder");
    if (file.size > 10 * 1024 * 1024) return alert("Maks 10MB");

    ui.uploadBtn.innerText = "...";
    ui.uploadBtn.disabled = true;

    const uid = AppState.user.uid;
    const storageRef = storage.ref().child(`users/${uid}/assets/${Date.now()}_${file.name}`);

    try {
        const snapshot = await storageRef.put(file);
        const url = await snapshot.ref.getDownloadURL();
        await db.collection('users').doc(uid).collection('assets').add({
            originalName: file.name, url, type: file.type,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        alert("Feil: " + e.message);
    } finally {
        ui.fileInput.value = '';
        ui.uploadBtn.innerText = "+ Last opp";
        ui.uploadBtn.disabled = false;
    }
}

function subscribeToAssets(uid) {
    ui.assetList.innerHTML = '<li>Laster...</li>';
    AppState.unsubscribeAssets = db.collection('users').doc(uid).collection('assets')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
            ui.assetList.innerHTML = '';
            snap.forEach(doc => renderAssetItem(doc.data(), doc.id));
            if(snap.empty) ui.assetList.innerHTML = '<li class="empty-state">Ingen bilder</li>';
        });
}

function renderAssetItem(asset, id) {
    const li = document.createElement('li');
    li.style.padding = "8px";
    li.style.borderBottom = "1px solid #333";
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.cursor = "pointer";
    
    const img = document.createElement('img');
    img.src = asset.url;
    img.style.width = "32px"; img.style.height = "32px"; img.style.objectFit = "contain";
    img.style.marginRight = "10px"; img.style.background = "#222";
    
    const span = document.createElement('span');
    span.innerText = asset.originalName;
    span.style.fontSize = "13px";
    
    li.appendChild(img); li.appendChild(span);
    li.onclick = () => selectAsset(asset, li);
    ui.assetList.appendChild(li);
}

function showStatus(msg, type) {
    ui.statusMsg.innerText = msg;
    ui.statusMsg.style.color = type === "error" ? "red" : "green";
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

/* Version: #10 */
