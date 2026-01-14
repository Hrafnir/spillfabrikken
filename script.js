/* Version: #20 */

// === CONFIGURATION ===
const ASSET_CATEGORIES = [
    { id: 'char', name: 'Aktører', color: '#ff6b6b' },
    { id: 'terr', name: 'Terreng', color: '#51cf66' },
    { id: 'item', name: 'Gjenstander', color: '#fcc419' },
    { id: 'bg',   name: 'Bakgrunn', color: '#339af0' },
    { id: 'prop', name: 'Dekorasjon', color: '#cc5de8' },
    { id: 'ui',   name: 'Grensesnitt', color: '#868e96' }
];

const DEFAULT_ANIMS = ["Idle", "Walk", "Run", "Jump", "Attack", "Hurt", "Die"];

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    
    // Editor Data
    selectedAsset: null, 
    loadedImage: null,
    animations: {},      
    currentAnimName: "Idle", 
    
    // Upload State
    uploadTargetCategory: 'char', // Default category
    
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
    },

    // Preview State
    preview: {
        active: false, lastTime: 0, frameIndex: 0, accumulatedTime: 0
    }
};

// === DOM ELEMENTS ===
const ui = {
    // Layout
    loginScreen: document.getElementById('login-overlay'),
    editorScreen: document.getElementById('editor-ui'),
    leftPanel: document.getElementById('left-panel'),
    toggleBtn: document.getElementById('toggle-sidebar-btn'),
    
    // Editor Panels
    inspector: document.getElementById('inspector-content'),
    assetsSection: document.getElementById('assets-section'), // Container for categories
    canvas: document.getElementById('game-canvas'),
    statusMsg: document.getElementById('status-msg'),
    
    // Inputs/Buttons
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    projectName: document.getElementById('project-name'),
    fileInput: document.getElementById('asset-file-input'), // Hidden input
    saveBtn: document.getElementById('save-btn'),
    
    // Preview Modal
    previewModal: document.getElementById('preview-modal'),
    previewCanvas: document.getElementById('preview-canvas'),
    closePreviewBtn: document.getElementById('close-preview-btn'),
    fpsSlider: document.getElementById('fps-slider'),
    fpsDisplay: document.getElementById('fps-display'),
    downloadGifBtn: document.getElementById('download-gif-btn'),
    
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
    buildAssetCategories(); // Bygg menyen
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
    ui.saveBtn.onclick = saveCurrentWork;

    // Assets
    ui.fileInput.onchange = handleFileUpload;

    // Preview
    ui.closePreviewBtn.onclick = closePreview;
    ui.downloadGifBtn.onclick = createGif;
    ui.fpsSlider.oninput = (e) => {
        const fps = parseInt(e.target.value);
        ui.fpsDisplay.innerText = fps;
        getCurrentAnimData().fps = fps;
    };

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
        if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedFrameIndex !== -1) deleteFrame(AppState.selectedFrameIndex);
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCurrentWork(); }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') setTool('select'); });
}

// === ASSET CATEGORY UI (NYTT) ===
function buildAssetCategories() {
    ui.assetsSection.innerHTML = ''; // Clear existing
    // Re-append the hidden file input so it's not lost
    ui.assetsSection.appendChild(ui.fileInput);

    ASSET_CATEGORIES.forEach(cat => {
        const block = document.createElement('div');
        block.className = 'category-block';
        
        block.innerHTML = `
            <div class="category-header" onclick="toggleCategory('${cat.id}')">
                <div style="display:flex; align-items:center;">
                    <span class="cat-indicator" style="background-color: ${cat.color}"></span>
                    <span>${cat.name}</span>
                </div>
                <button class="tiny-btn" onclick="triggerUpload('${cat.id}', event)">+ Ny</button>
            </div>
            <ul id="cat-list-${cat.id}" class="asset-list-ul">
                <!-- Assets go here -->
            </ul>
        `;
        ui.assetsSection.appendChild(block);
    });
}

window.toggleCategory = (id) => {
    const list = document.getElementById(`cat-list-${id}`);
    if(list) list.classList.toggle('collapsed');
};

window.triggerUpload = (catId, event) => {
    event.stopPropagation(); // Prevent toggling accordion
    AppState.uploadTargetCategory = catId;
    console.log("Upload targeting:", catId);
    ui.fileInput.click();
};

// === ASSET FETCHING & RENDERING (OPPDATERT) ===
function subscribeToAssets(uid) {
    // Reset all lists
    ASSET_CATEGORIES.forEach(cat => {
        const list = document.getElementById(`cat-list-${cat.id}`);
        if(list) list.innerHTML = ''; 
    });

    AppState.unsubscribeAssets = db.collection('users').doc(uid).collection('assets')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            // Clear again to prevent duplicates on update
            ASSET_CATEGORIES.forEach(cat => {
                const list = document.getElementById(`cat-list-${cat.id}`);
                if(list) list.innerHTML = ''; 
            });

            if(snapshot.empty) {
                // Optional: Show "empty" msg in first category
                return;
            }

            snapshot.forEach(doc => {
                const asset = doc.data();
                // Default to first category ('char') if no category set
                const catId = asset.category || 'char'; 
                renderAssetItem(asset, doc.id, catId);
            });
        });
}

function renderAssetItem(asset, id, catId) {
    const list = document.getElementById(`cat-list-${catId}`);
    if (!list) return; // Should not happen

    const li = document.createElement('li');
    li.className = 'asset-item';
    // Check if this is the currently selected asset
    if (AppState.selectedAsset && AppState.selectedAsset.id === id) {
        li.classList.add('selected-item');
    }

    li.innerHTML = `
        <img src="${asset.url}" class="asset-thumb">
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${asset.originalName}</span>
        <button onclick="deleteAsset('${id}','${asset.url}',event)" style="background:none;border:none;color:#ff5555;font-weight:bold;cursor:pointer;padding:0 5px;">X</button>
    `;
    
    li.onclick = () => selectAsset(asset, id, li);
    list.appendChild(li);
}

// === UPLOAD LOGIC (OPPDATERT) ===
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert("Kun bilder (PNG/JPG/GIF).");

    const catId = AppState.uploadTargetCategory || 'char';
    // Find visual button to update text
    // (Complex selector, simplification: just use global status)
    ui.statusMsg.innerText = "Laster opp...";
    
    const uid = AppState.user.uid;
    const storageRef = storage.ref().child(`users/${uid}/assets/${catId}/${Date.now()}_${file.name}`);

    try {
        const snapshot = await storageRef.put(file);
        const url = await snapshot.ref.getDownloadURL();
        
        await db.collection('users').doc(uid).collection('assets').add({
            originalName: file.name,
            url: url,
            type: file.type,
            category: catId, // Save category!
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        ui.statusMsg.innerText = "Opplasting ferdig!";
    } catch (e) {
        console.error(e);
        alert("Feil: " + e.message);
    } finally {
        ui.fileInput.value = '';
        setTimeout(()=>ui.statusMsg.innerText = "", 2000);
    }
}

// === STANDARD LOGIC (Previous implementations) ===

function selectAsset(assetData, docId, li) {
    // Remove 'selected-item' class from ALL lists
    document.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected-item'));
    li.classList.add('selected-item');
    
    AppState.selectedAsset = { id: docId, data: assetData };
    
    // Migration Logic
    let rawAnims = assetData.animations || {};
    AppState.animations = {};
    DEFAULT_ANIMS.forEach(name => {
        if (rawAnims[name]) {
            if (Array.isArray(rawAnims[name])) AppState.animations[name] = { fps: 8, frames: rawAnims[name] };
            else AppState.animations[name] = rawAnims[name];
        } else {
            AppState.animations[name] = { fps: 8, frames: [] };
        }
    });
    AppState.currentAnimName = "Idle";
    AppState.selectedFrameIndex = -1;

    const img = new Image(); img.crossOrigin = "Anonymous"; img.src = assetData.url;
    // Clear canvas & show loading
    const ctx = ui.canvas.getContext('2d'); ctx.clearRect(0,0, ui.canvas.width, ui.canvas.height);
    ctx.fillStyle="#fff"; ctx.fillText("Laster...", ui.canvas.width/2, ui.canvas.height/2);

    img.onload = () => { AppState.loadedImage = img; drawCanvas(); updateInspector(); };
    img.onerror = () => alert("Kunne ikke laste bilde.");
}

// ... (Resten av canvas/drawing/preview/auth funksjonene er uendret fra versjon 19, men inkluderes her for kompletthet) ...

function getCurrentAnimData() { if (!AppState.animations[AppState.currentAnimName]) AppState.animations[AppState.currentAnimName] = { fps: 8, frames: [] }; return AppState.animations[AppState.currentAnimName]; }
function getCurrentFrames() { return getCurrentAnimData().frames; }

async function saveCurrentWork() {
    if (!AppState.selectedAsset) return alert("Ingen fil valgt.");
    const docId = AppState.selectedAsset.id;
    ui.saveBtn.innerText = "Lagrer..."; ui.saveBtn.disabled = true;
    try {
        await db.collection('users').doc(AppState.user.uid).collection('assets').doc(docId).update({
            animations: AppState.animations, lastModified: firebase.firestore.FieldValue.serverTimestamp()
        });
        ui.saveBtn.innerText = "Lagret!"; setTimeout(() => { ui.saveBtn.innerText = "Lagre"; ui.saveBtn.disabled = false; }, 2000);
    } catch (e) { alert("Feil: " + e.message); ui.saveBtn.innerText = "Lagre"; ui.saveBtn.disabled = false; }
}

function updateInspector() {
    if (!ui.inspector) return;
    if (!AppState.loadedImage) { ui.inspector.innerHTML = `<div style="padding:20px; color:#888; text-align:center; font-size:12px;">Velg en tegning.</div>`; return; }
    const animName = AppState.currentAnimName; const frames = getCurrentFrames();
    let animOptions = ""; Object.keys(AppState.animations).forEach(k => { animOptions += `<option value="${k}" ${k === animName ? "selected" : ""}>${k}</option>`; });
    let framesListHtml = "";
    if (frames.length === 0) { framesListHtml = `<p style="padding:10px; font-style:italic; color:#666; font-size:11px;">Ingen frames.</p>`; } 
    else {
        frames.forEach((f, i) => {
            const isSel = i === AppState.selectedFrameIndex;
            framesListHtml += `<li class="${isSel ? "selected-item" : ""}" onclick="selectFrame(${i})"><span style="flex:1; font-size:12px;">Frame #${i+1}</span><button onclick="deleteFrame(${i}, event)" style="background:none; border:none; color:#ff6666; font-weight:bold; cursor:pointer;">✖</button></li>`;
        });
    }
    ui.inspector.innerHTML = `<div class="inspector-section"><label class="inspector-label">Aktiv Animasjon</label><div class="anim-row"><select class="anim-select" onchange="changeAnimation(this.value)">${animOptions}</select><button class="small-btn" onclick="createNewAnimation()">+</button></div><button class="primary-btn" style="width:100%; margin-top:5px; font-size:12px;" onclick="openPreview()">▶ Spill av</button></div><div style="flex:1; display:flex; flex-direction:column; overflow:hidden;"><label class="inspector-label" style="padding:0 5px;">Frames (${frames.length})</label><ul id="frame-list" style="list-style:none; overflow-y:auto; flex:1; margin-top:5px; border-top:1px solid #333;">${framesListHtml}</ul></div><div style="margin-top:auto; padding-top:10px; border-top:1px solid #333; font-size:10px; color:#666;">Tips: Husk å trykke <b>Lagre</b>!</div>`;
}

window.changeAnimation = (name) => { AppState.currentAnimName = name; AppState.selectedFrameIndex = -1; updateInspector(); drawCanvas(); };
window.createNewAnimation = () => { const n = prompt("Navn:"); if(n && !AppState.animations[n]){ AppState.animations[n]={fps:8, frames:[]}; changeAnimation(n); }};
window.selectFrame = (i) => { AppState.selectedFrameIndex = i; updateInspector(); drawCanvas(); };
window.deleteFrame = (i, e) => { if(e) e.stopPropagation(); getCurrentFrames().splice(i, 1); AppState.selectedFrameIndex = -1; updateInspector(); drawCanvas(); };
window.deleteAsset = async (docId, fileUrl, event) => { event.stopPropagation(); if(!confirm("Slette filen?")) return; try { await firebase.storage().refFromURL(fileUrl).delete(); await db.collection('users').doc(AppState.user.uid).collection('assets').doc(docId).delete(); } catch(e){console.error(e);} };

function initCanvas() {
    if(!ui.canvas) return;
    ui.canvas.addEventListener('mousedown', (e) => {
        const mouse = getMousePos(e); const imgCoords = screenToImageCoords(mouse.x, mouse.y);
        AppState.viewport.lastMouseX = e.clientX; AppState.viewport.lastMouseY = e.clientY;
        if (AppState.viewport.activeTool === 'pan') { AppState.mode = 'panning'; ui.canvas.style.cursor = "grabbing"; return; }
        if (!AppState.loadedImage) return;
        if (AppState.selectedFrameIndex !== -1) {
            const frame = getCurrentFrames()[AppState.selectedFrameIndex];
            const anchorScreen = imageToScreenCoords(frame.x + (frame.anchor?frame.anchor.x:frame.w/2), frame.y + (frame.anchor?frame.anchor.y:frame.h));
            if (dist(mouse.x, mouse.y, anchorScreen.x, anchorScreen.y) < 10) { AppState.mode = 'dragging_anchor'; AppState.dragStart = imgCoords; AppState.initialFrame = JSON.parse(JSON.stringify(frame)); if(!AppState.initialFrame.anchor) AppState.initialFrame.anchor = {x:frame.w/2, y:frame.h}; return; }
            const handle = getResizeHandleHover(mouse.x, mouse.y, frame);
            if (handle) { AppState.mode = 'resizing_frame'; AppState.resizeHandle = handle; AppState.dragStart = imgCoords; AppState.initialFrame = JSON.parse(JSON.stringify(frame)); return; }
        }
        const hitIndex = getFrameAt(imgCoords.x, imgCoords.y);
        if (hitIndex !== -1) { AppState.selectedFrameIndex = hitIndex; AppState.mode = 'dragging_frame'; AppState.dragStart = imgCoords; AppState.initialFrame = JSON.parse(JSON.stringify(getCurrentFrames()[hitIndex])); updateInspector(); drawCanvas(); } 
        else { AppState.selectedFrameIndex = -1; AppState.mode = 'drawing'; AppState.dragStart = imgCoords; AppState.tempSelection = { x: imgCoords.x, y: imgCoords.y, w: 0, h: 0 }; updateInspector(); drawCanvas(); }
    });
    window.addEventListener('mousemove', (e) => {
        const mouse = getMousePos(e); const imgCoords = screenToImageCoords(mouse.x, mouse.y);
        if (AppState.mode === 'idle' && AppState.selectedFrameIndex !== -1 && AppState.viewport.activeTool === 'select') { const f = getCurrentFrames()[AppState.selectedFrameIndex]; const h = getResizeHandleHover(mouse.x, mouse.y, f); ui.canvas.style.cursor = h ? h + "-resize" : "default"; }
        if (AppState.mode === 'panning') { AppState.viewport.offsetX += e.clientX - AppState.viewport.lastMouseX; AppState.viewport.offsetY += e.clientY - AppState.viewport.lastMouseY; AppState.viewport.lastMouseX = e.clientX; AppState.viewport.lastMouseY = e.clientY; drawCanvas(); }
        else if (AppState.mode === 'dragging_frame') { const f = getCurrentFrames()[AppState.selectedFrameIndex]; f.x = AppState.initialFrame.x + (imgCoords.x - AppState.dragStart.x); f.y = AppState.initialFrame.y + (imgCoords.y - AppState.dragStart.y); drawCanvas(); }
        else if (AppState.mode === 'dragging_anchor') { const f = getCurrentFrames()[AppState.selectedFrameIndex]; if(!f.anchor) f.anchor = {x: f.w/2, y: f.h}; f.anchor.x = AppState.initialFrame.anchor.x + (imgCoords.x - AppState.dragStart.x); f.anchor.y = AppState.initialFrame.anchor.y + (imgCoords.y - AppState.dragStart.y); drawCanvas(); }
        else if (AppState.mode === 'resizing_frame') { const f = getCurrentFrames()[AppState.selectedFrameIndex]; const dx = imgCoords.x - AppState.dragStart.x; const dy = imgCoords.y - AppState.dragStart.y; const i = AppState.initialFrame; if(AppState.resizeHandle.includes('e')) f.w = Math.max(1, i.w + dx); if(AppState.resizeHandle.includes('s')) f.h = Math.max(1, i.h + dy); if(AppState.resizeHandle.includes('w')) { f.x = Math.min(i.x+i.w-1, i.x+dx); f.w = Math.max(1, i.w-dx); } if(AppState.resizeHandle.includes('n')) { f.y = Math.min(i.y+i.h-1, i.y+dy); f.h = Math.max(1, i.h-dy); } drawCanvas(); }
        else if (AppState.mode === 'drawing') { AppState.tempSelection.w = imgCoords.x - AppState.dragStart.x; AppState.tempSelection.h = imgCoords.y - AppState.dragStart.y; drawCanvas(); }
    });
    window.addEventListener('mouseup', () => {
        if(AppState.mode === 'panning') ui.canvas.style.cursor = AppState.viewport.activeTool==='pan'?"grab":"default";
        if(AppState.mode === 'drawing') { let s = AppState.tempSelection; if(s.w<0){s.x+=s.w; s.w=Math.abs(s.w);} if(s.h<0){s.y+=s.h; s.h=Math.abs(s.h);} if(s.w>2 && s.h>2) { const list = getCurrentFrames(); list.push({x:s.x, y:s.y, w:s.w, h:s.h, anchor:{x:s.w/2, y:s.h}}); AppState.selectedFrameIndex = list.length-1; updateInspector(); } }
        AppState.mode = 'idle'; AppState.resizeHandle = null; AppState.tempSelection = null; drawCanvas();
    });
    ui.canvas.addEventListener('wheel', (e) => { e.preventDefault(); handleZoom(e.deltaY>0?-0.1:0.1); });
}

window.openPreview = () => {
    const frames = getCurrentFrames(); if (frames.length === 0) return alert("Ingen frames.");
    ui.previewModal.classList.remove('hidden'); AppState.preview.active = true; AppState.preview.frameIndex = 0; AppState.preview.accumulatedTime = 0; AppState.preview.lastTime = performance.now();
    const fps = getCurrentAnimData().fps || 8; ui.fpsSlider.value = fps; ui.fpsDisplay.innerText = fps; requestAnimationFrame(animatePreview);
};
function closePreview() { ui.previewModal.classList.add('hidden'); AppState.preview.active = false; }
function animatePreview(timestamp) {
    if (!AppState.preview.active) return;
    const animData = getCurrentAnimData(); const frames = animData.frames; const fps = animData.fps || 8; const interval = 1000 / fps;
    const dt = timestamp - AppState.preview.lastTime; AppState.preview.lastTime = timestamp; AppState.preview.accumulatedTime += dt;
    if (AppState.preview.accumulatedTime >= interval) { AppState.preview.frameIndex = (AppState.preview.frameIndex + 1) % frames.length; AppState.preview.accumulatedTime -= interval; }
    const ctx = ui.previewCanvas.getContext('2d'); const w = ui.previewCanvas.width; const h = ui.previewCanvas.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = AppState.viewport.bgColor; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
    const frame = frames[AppState.preview.frameIndex]; const img = AppState.loadedImage;
    if (frame && img) {
        const sx = frame.x; const sy = frame.y; const sw = frame.w; const sh = frame.h; const padding = 0.9; const scaleX = (w * padding) / sw; const scaleY = (h * padding) / sh; const scale = Math.min(scaleX, scaleY); const dw = sw * scale; const dh = sh * scale; const simpleDx = (w - dw) / 2; const simpleDy = (h - dh) / 2;
        ctx.imageSmoothingEnabled = false; ctx.drawImage(img, sx, sy, sw, sh, simpleDx, simpleDy, dw, dh);
        ctx.fillStyle = "white"; ctx.font = "10px Arial"; ctx.shadowColor = "black"; ctx.shadowBlur = 2; ctx.fillText(`F: ${AppState.preview.frameIndex + 1}/${frames.length}`, 5, 15);
    }
    requestAnimationFrame(animatePreview);
}
async function createGif() {
    const animData = getCurrentAnimData(); const frames = animData.frames; if (frames.length === 0) return;
    const originalText = ui.downloadGifBtn.innerText; ui.downloadGifBtn.innerText = "Genererer..."; ui.downloadGifBtn.disabled = true;
    try {
        const workerResponse = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'); const workerBlob = await workerResponse.blob(); const workerUrl = URL.createObjectURL(workerBlob);
        const gif = new GIF({ workers: 2, quality: 10, workerScript: workerUrl, background: AppState.viewport.bgColor, width: frames[0].w, height: frames[0].h });
        const img = AppState.loadedImage; const fps = animData.fps || 8; const delay = 1000 / fps;
        frames.forEach(f => { const tCanvas = document.createElement('canvas'); tCanvas.width = f.w; tCanvas.height = f.h; const tCtx = tCanvas.getContext('2d'); tCtx.fillStyle = AppState.viewport.bgColor; tCtx.fillRect(0, 0, f.w, f.h); tCtx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h); gif.addFrame(tCanvas, {delay: delay}); });
        gif.on('finished', function(blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${AppState.selectedAsset.data.originalName}_${AppState.currentAnimName}.gif`; document.body.appendChild(a); a.click(); document.body.removeChild(a); ui.downloadGifBtn.innerText = "Lastet ned!"; setTimeout(() => { ui.downloadGifBtn.innerText = originalText; ui.downloadGifBtn.disabled = false; }, 2000); });
        gif.render();
    } catch (error) { console.error(error); alert("GIF feil"); ui.downloadGifBtn.innerText = originalText; ui.downloadGifBtn.disabled = false; }
}

function getMousePos(e){const r=ui.canvas.getBoundingClientRect(); return{x:e.clientX-r.left, y:e.clientY-r.top};}
function dist(x1,y1,x2,y2){return Math.sqrt((x2-x1)**2+(y2-y1)**2);}
function screenToImageCoords(sx,sy){const z=AppState.viewport.zoom,img=AppState.loadedImage;if(!img)return{x:0,y:0};const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z);const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);return{x:(sx-dx)/z,y:(sy-dy)/z};}
function imageToScreenCoords(ix,iy){const z=AppState.viewport.zoom,img=AppState.loadedImage;if(!img)return{x:0,y:0};const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z);const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);return{x:dx+(ix*z),y:dy+(iy*z)};}
function getFrameAt(ix,iy){const fs=getCurrentFrames();for(let i=fs.length-1;i>=0;i--){const f=fs[i];if(ix>=f.x&&ix<=f.x+f.w&&iy>=f.y&&iy<=f.y+f.h)return i;}return -1;}
function getResizeHandleHover(mx,my,f){const z=AppState.viewport.zoom,m=8;const tl=imageToScreenCoords(f.x,f.y),tr=imageToScreenCoords(f.x+f.w,f.y),bl=imageToScreenCoords(f.x,f.y+f.h),br=imageToScreenCoords(f.x+f.w,f.y+f.h);if(dist(mx,my,tl.x,tl.y)<m)return'nw';if(dist(mx,my,tr.x,tr.y)<m)return'ne';if(dist(mx,my,bl.x,bl.y)<m)return'sw';if(dist(mx,my,br.x,br.y)<m)return'se';return null;}
function setTool(t){AppState.viewport.activeTool=t;if(t==='select'){ui.toolSelect.classList.add('active');ui.toolPan.classList.remove('active');ui.canvas.style.cursor="default";}else{ui.toolSelect.classList.remove('active');ui.toolPan.classList.add('active');ui.canvas.style.cursor="grab";}}
function handleZoom(a){let z=AppState.viewport.zoom+a;z=Math.max(0.1,Math.min(z,10.0));AppState.viewport.zoom=Math.round(z*10)/10;ui.zoomLabel.innerText=Math.round(z*100)+"%";drawCanvas();}
function initAuthListener(){auth.onAuthStateChanged(u=>{if(u){AppState.user=u;ui.statusMsg.innerText="Klar";setTimeout(()=>{toggleSidebar();subscribeToAssets(u.uid);},500);}else{AppState.user=null;transitionToLogin();}});}
function handleLogin(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.signInWithEmailAndPassword(e,p).catch(err=>showStatus(err.code,"error"));}
function handleRegister(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.createUserWithEmailAndPassword(e,p).then(()=>showStatus("OK","success")).catch(err=>showStatus(err.code,"error"));}
function handleGoogleLogin(){auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err=>console.error(err));}
function handleLogout(){auth.signOut();}
function toggleSidebar() { ui.leftPanel.classList.toggle('collapsed'); setTimeout(drawCanvas, 300); }
function transitionToEditor(){ui.loginScreen.classList.add('hidden');ui.editorScreen.classList.remove('hidden');if(AppState.user)ui.projectName.innerText=AppState.user.email;}
function transitionToLogin(){ui.editorScreen.classList.add('hidden');ui.loginScreen.classList.remove('hidden');}

/* Version: #20 */
