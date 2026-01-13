/* Version: #15 */

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    
    // Editor Data
    selectedAsset: null, // { id, data }
    loadedImage: null,
    animations: {},      // { "Idle": [...], "Run": [...] }
    currentAnimName: "Idle", 
    
    // Selection & Interaction
    selectedFrameIndex: -1,
    mode: 'idle', 
    
    // Temp storage
    dragStart: {x:0, y:0},
    initialFrame: null,
    resizeHandle: null,
    tempSelection: null,
    
    // Viewport
    viewport: {
        zoom: 1.0, offsetX: 0, offsetY: 0,
        lastMouseX: 0, lastMouseY: 0,
        bgColor: '#222222', activeTool: 'select'
    }
};

const DEFAULT_ANIMS = ["Idle", "Walk", "Run", "Jump", "Attack", "Hurt", "Die"];

// === DOM ELEMENTS ===
const ui = {
    // Layout
    loginScreen: document.getElementById('login-overlay'),
    editorScreen: document.getElementById('editor-ui'),
    leftPanel: document.getElementById('left-panel'), // NY
    toggleBtn: document.getElementById('toggle-sidebar-btn'), // NY
    
    // Editor Panels
    inspector: document.getElementById('inspector-content'),
    assetList: document.getElementById('asset-list'),
    canvas: document.getElementById('game-canvas'),
    statusMsg: document.getElementById('status-msg'),
    
    // Inputs/Buttons
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    projectName: document.getElementById('project-name'),
    uploadBtn: document.getElementById('upload-asset-btn'),
    fileInput: document.getElementById('asset-file-input'),
    saveBtn: document.getElementById('save-btn'), // NY
    
    // Tools
    toolSelect: document.getElementById('tool-select'),
    toolPan: document.getElementById('tool-pan'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    zoomLabel: document.getElementById('zoom-level'),
    bgColorPicker: document.getElementById('bg-color-picker')
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    if (typeof auth === 'undefined') return;
    setupEventListeners();
    initCanvas();
    initAuthListener();
});

function setupEventListeners() {
    // Auth
    document.getElementById('login-btn').onclick = handleLogin;
    document.getElementById('register-btn').onclick = handleRegister;
    document.getElementById('google-btn').onclick = handleGoogleLogin;
    document.getElementById('logout-btn').onclick = handleLogout;
    
    // Layout & Saving
    ui.toggleBtn.onclick = toggleSidebar;
    ui.saveBtn.onclick = saveCurrentWork; // Koblet til lagring

    // Assets
    ui.uploadBtn.onclick = () => ui.fileInput.click(); 
    ui.fileInput.onchange = handleFileUpload;

    // Viewport
    ui.zoomInBtn.onclick = () => handleZoom(0.1);
    ui.zoomOutBtn.onclick = () => handleZoom(-0.1);
    ui.toolSelect.onclick = () => setTool('select');
    ui.toolPan.onclick = () => setTool('pan');
    ui.bgColorPicker.oninput = (e) => { AppState.viewport.bgColor = e.target.value; drawCanvas(); };

    // Keyboard
    window.addEventListener('keydown', (e) => {
        if (ui.loginScreen.classList.contains('hidden') === false) return;
        if (e.key === '+' || e.key === '=') handleZoom(0.1);
        if (e.key === '-') handleZoom(-0.1);
        if (e.code === 'Space') if(AppState.viewport.activeTool !== 'pan') setTool('pan');
        
        // Delete Frame
        if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedFrameIndex !== -1) {
            deleteFrame(AppState.selectedFrameIndex);
        }
        // Save shortcut (Ctrl+S)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCurrentWork();
        }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') setTool('select'); });
}

// === LAYOUT LOGIC ===
function toggleSidebar() {
    ui.leftPanel.classList.toggle('collapsed');
    // Redraw canvas siden senterpunktet flytter seg visuelt
    setTimeout(drawCanvas, 300); 
}

// === SAVING LOGIC (NYTT) ===
async function saveCurrentWork() {
    if (!AppState.selectedAsset) return alert("Ingen fil valgt å lagre.");
    
    const docId = AppState.selectedAsset.id;
    ui.saveBtn.innerText = "Lagrer...";
    ui.saveBtn.disabled = true;

    try {
        // Vi lagrer animasjonsobjektet inn i samme dokument som bildet
        await db.collection('users').doc(AppState.user.uid)
            .collection('assets').doc(docId)
            .update({
                animations: AppState.animations,
                lastModified: firebase.firestore.FieldValue.serverTimestamp()
            });
            
        ui.saveBtn.innerText = "Lagret!";
        setTimeout(() => { ui.saveBtn.innerText = "Lagre"; ui.saveBtn.disabled = false; }, 2000);
    } catch (e) {
        console.error("Save error:", e);
        alert("Kunne ikke lagre: " + e.message);
        ui.saveBtn.innerText = "Lagre";
        ui.saveBtn.disabled = false;
    }
}

// === ASSET SELECTION & LOADING ===
function selectAsset(assetData, docId, li) {
    // UI Highlight
    Array.from(ui.assetList.children).forEach(c => c.classList.remove('selected-item'));
    li.classList.add('selected-item');
    
    AppState.selectedAsset = { id: docId, data: assetData };
    
    // Load Animations from DB if they exist, else Init Defaults
    if (assetData.animations) {
        AppState.animations = assetData.animations;
        // Ensure structure is valid
        DEFAULT_ANIMS.forEach(n => { if(!AppState.animations[n]) AppState.animations[n] = []; });
    } else {
        AppState.animations = {}; 
        DEFAULT_ANIMS.forEach(n => AppState.animations[n] = []);
    }
    
    AppState.currentAnimName = "Idle";
    AppState.selectedFrameIndex = -1;

    // Load Image
    const img = new Image(); 
    img.crossOrigin = "Anonymous"; 
    img.src = assetData.url;
    
    // Show loading
    const ctx = ui.canvas.getContext('2d');
    ctx.clearRect(0,0, ui.canvas.width, ui.canvas.height);
    ctx.fillStyle="#fff"; ctx.fillText("Laster...", ui.canvas.width/2, ui.canvas.height/2);

    img.onload = () => { 
        AppState.loadedImage = img; 
        drawCanvas(); 
        updateInspector(); 
    };
    img.onerror = () => alert("Kunne ikke laste bilde (CORS feil?).");
}

// === CANVAS LOGIC (Uendret fra v14, men inkludert for komplett fil) ===
function initCanvas() {
    if(!ui.canvas) return;
    ui.canvas.addEventListener('mousedown', (e) => {
        const mouse = getMousePos(e);
        const imgCoords = screenToImageCoords(mouse.x, mouse.y);
        AppState.viewport.lastMouseX = e.clientX; AppState.viewport.lastMouseY = e.clientY;

        if (AppState.viewport.activeTool === 'pan') {
            AppState.mode = 'panning'; ui.canvas.style.cursor = "grabbing"; return;
        }
        if (!AppState.loadedImage) return;

        if (AppState.selectedFrameIndex !== -1) {
            const frame = getCurrentFrames()[AppState.selectedFrameIndex];
            const anchorScreen = imageToScreenCoords(frame.x + frame.anchor.x, frame.y + frame.anchor.y);
            if (dist(mouse.x, mouse.y, anchorScreen.x, anchorScreen.y) < 10) {
                AppState.mode = 'dragging_anchor'; AppState.dragStart = imgCoords;
                AppState.initialFrame = JSON.parse(JSON.stringify(frame)); return;
            }
            const handle = getResizeHandleHover(mouse.x, mouse.y, frame);
            if (handle) {
                AppState.mode = 'resizing_frame'; AppState.resizeHandle = handle;
                AppState.dragStart = imgCoords; AppState.initialFrame = JSON.parse(JSON.stringify(frame)); return;
            }
        }
        const hitIndex = getFrameAt(imgCoords.x, imgCoords.y);
        if (hitIndex !== -1) {
            AppState.selectedFrameIndex = hitIndex; AppState.mode = 'dragging_frame';
            AppState.dragStart = imgCoords; AppState.initialFrame = JSON.parse(JSON.stringify(getCurrentFrames()[hitIndex]));
            updateInspector(); drawCanvas();
        } else {
            AppState.selectedFrameIndex = -1; AppState.mode = 'drawing';
            AppState.dragStart = imgCoords; AppState.tempSelection = { x: imgCoords.x, y: imgCoords.y, w: 0, h: 0 };
            updateInspector(); drawCanvas();
        }
    });

    window.addEventListener('mousemove', (e) => {
        const mouse = getMousePos(e);
        const imgCoords = screenToImageCoords(mouse.x, mouse.y);

        if (AppState.mode === 'idle' && AppState.selectedFrameIndex !== -1 && AppState.viewport.activeTool === 'select') {
             const f = getCurrentFrames()[AppState.selectedFrameIndex];
             const h = getResizeHandleHover(mouse.x, mouse.y, f);
             ui.canvas.style.cursor = h ? h + "-resize" : "default";
        }

        if (AppState.mode === 'panning') {
            AppState.viewport.offsetX += e.clientX - AppState.viewport.lastMouseX;
            AppState.viewport.offsetY += e.clientY - AppState.viewport.lastMouseY;
            AppState.viewport.lastMouseX = e.clientX; AppState.viewport.lastMouseY = e.clientY;
            drawCanvas();
        }
        else if (AppState.mode === 'dragging_frame') {
            const f = getCurrentFrames()[AppState.selectedFrameIndex];
            f.x = AppState.initialFrame.x + (imgCoords.x - AppState.dragStart.x);
            f.y = AppState.initialFrame.y + (imgCoords.y - AppState.dragStart.y);
            drawCanvas();
        }
        else if (AppState.mode === 'dragging_anchor') {
            const f = getCurrentFrames()[AppState.selectedFrameIndex];
            f.anchor.x = AppState.initialFrame.anchor.x + (imgCoords.x - AppState.dragStart.x);
            f.anchor.y = AppState.initialFrame.anchor.y + (imgCoords.y - AppState.dragStart.y);
            drawCanvas();
        }
        else if (AppState.mode === 'resizing_frame') {
            const f = getCurrentFrames()[AppState.selectedFrameIndex];
            const dx = imgCoords.x - AppState.dragStart.x;
            const dy = imgCoords.y - AppState.dragStart.y;
            const i = AppState.initialFrame;
            if(AppState.resizeHandle.includes('e')) f.w = Math.max(1, i.w + dx);
            if(AppState.resizeHandle.includes('s')) f.h = Math.max(1, i.h + dy);
            if(AppState.resizeHandle.includes('w')) { f.x = Math.min(i.x+i.w-1, i.x+dx); f.w = Math.max(1, i.w-dx); }
            if(AppState.resizeHandle.includes('n')) { f.y = Math.min(i.y+i.h-1, i.y+dy); f.h = Math.max(1, i.h-dy); }
            drawCanvas();
        }
        else if (AppState.mode === 'drawing') {
            AppState.tempSelection.w = imgCoords.x - AppState.dragStart.x;
            AppState.tempSelection.h = imgCoords.y - AppState.dragStart.y;
            drawCanvas();
        }
    });

    window.addEventListener('mouseup', () => {
        if(AppState.mode === 'panning') ui.canvas.style.cursor = AppState.viewport.activeTool==='pan'?"grab":"default";
        if(AppState.mode === 'drawing') {
            let s = AppState.tempSelection;
            if(s.w<0){s.x+=s.w; s.w=Math.abs(s.w);} if(s.h<0){s.y+=s.h; s.h=Math.abs(s.h);}
            if(s.w>2 && s.h>2) {
                const list = getCurrentFrames();
                list.push({x:s.x, y:s.y, w:s.w, h:s.h, anchor:{x:s.w/2, y:s.h}});
                AppState.selectedFrameIndex = list.length-1;
                updateInspector();
            }
        }
        AppState.mode = 'idle'; AppState.resizeHandle = null; AppState.tempSelection = null;
        drawCanvas();
    });
    ui.canvas.addEventListener('wheel', (e) => { e.preventDefault(); handleZoom(e.deltaY>0?-0.1:0.1); });
}

// === INSPECTOR UI ===
function getCurrentFrames() {
    if(!AppState.animations[AppState.currentAnimName]) AppState.animations[AppState.currentAnimName] = [];
    return AppState.animations[AppState.currentAnimName];
}

function updateInspector() {
    if (!ui.inspector) return;
    if (!AppState.loadedImage) {
        ui.inspector.innerHTML = `<div style="padding:20px; color:#888; text-align:center; font-size:12px;">Velg en tegning ovenfor.</div>`;
        return;
    }
    const animName = AppState.currentAnimName;
    const frames = getCurrentFrames();
    let animOptions = "";
    Object.keys(AppState.animations).forEach(k => {
        animOptions += `<option value="${k}" ${k === animName ? "selected" : ""}>${k}</option>`;
    });
    let framesListHtml = "";
    if (frames.length === 0) {
        framesListHtml = `<p style="padding:10px; font-style:italic; color:#666; font-size:11px;">Ingen frames. Tegn boks.</p>`;
    } else {
        frames.forEach((f, i) => {
            const isSel = i === AppState.selectedFrameIndex;
            const cssClass = isSel ? "selected-item" : "";
            framesListHtml += `
            <li class="${cssClass}" onclick="selectFrame(${i})">
                <span style="flex:1; font-size:12px;">Frame #${i+1}</span>
                <span style="font-size:10px; color:#aaa; margin-right:5px;">${Math.round(f.w)}x${Math.round(f.h)}</span>
                <button onclick="deleteFrame(${i}, event)" style="background:none; border:none; color:#ff6666; font-weight:bold; cursor:pointer;">✖</button>
            </li>`;
        });
    }

    ui.inspector.innerHTML = `
        <div class="inspector-section">
            <label class="inspector-label">Aktiv Animasjon</label>
            <div class="anim-row">
                <select class="anim-select" onchange="changeAnimation(this.value)">${animOptions}</select>
                <button class="small-btn" onclick="createNewAnimation()">+</button>
            </div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
            <label class="inspector-label" style="padding:0 5px;">Frames (${frames.length})</label>
            <ul id="frame-list" style="list-style:none; overflow-y:auto; flex:1; margin-top:5px; border-top:1px solid #333;">
                ${framesListHtml}
            </ul>
        </div>
        <div style="margin-top:auto; padding-top:10px; border-top:1px solid #333; font-size:10px; color:#666;">
            Tips: Husk å trykke <b>Lagre</b> etter endringer!
        </div>
    `;
}

// === EXPOSED FUNCTIONS ===
window.changeAnimation = (name) => { AppState.currentAnimName = name; AppState.selectedFrameIndex = -1; updateInspector(); drawCanvas(); };
window.createNewAnimation = () => { const n = prompt("Navn:"); if(n && !AppState.animations[n]){ AppState.animations[n]=[]; changeAnimation(n); }};
window.selectFrame = (i) => { AppState.selectedFrameIndex = i; updateInspector(); drawCanvas(); };
window.deleteFrame = (i, e) => { if(e) e.stopPropagation(); getCurrentFrames().splice(i, 1); AppState.selectedFrameIndex = -1; updateInspector(); drawCanvas(); };
window.deleteAsset = async (docId, fileUrl, event) => {
    event.stopPropagation(); if(!confirm("Slette filen?")) return;
    try {
        await firebase.storage().refFromURL(fileUrl).delete();
        await db.collection('users').doc(AppState.user.uid).collection('assets').doc(docId).delete();
    } catch(e){console.error(e);}
};

// === RENDER CANVAS (Uendret logikk, forkortet) ===
function drawCanvas() {
    const ctx = ui.canvas.getContext('2d'); const w = ui.canvas.width; const h = ui.canvas.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = AppState.viewport.bgColor; ctx.fillRect(0, 0, w, h);
