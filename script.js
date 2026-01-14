/* Version: #23 */

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
const GRID_SIZE = 32; // Standard rute-størrelse

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    editorMode: 'asset', // 'asset' or 'level'
    
    // Asset Editor State
    selectedAsset: null, 
    loadedImage: null,
    animations: {},      
    currentAnimName: "Idle",
    selectedFrameIndex: -1,
    
    // Level Editor State (NYTT)
    level: {
        tiles: {}, // Format: "x,y": { assetId, url, catId }
        activeBrush: null, // Asset data for painting
        showGrid: true
    },
    assetCache: {}, // { url: ImageObject } for level rendering
    
    // Common Interaction
    uploadTargetCategory: 'char',
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

    // Preview
    preview: { active: false, lastTime: 0, frameIndex: 0, accumulatedTime: 0 }
};

// === DOM ELEMENTS ===
const ui = {
    loginScreen: document.getElementById('login-overlay'),
    editorScreen: document.getElementById('editor-ui'),
    leftPanel: document.getElementById('left-panel'),
    toggleBtn: document.getElementById('toggle-sidebar-btn'),
    inspector: document.getElementById('inspector-content'),
    assetsSection: document.getElementById('assets-section'),
    canvas: document.getElementById('game-canvas'),
    statusMsg: document.getElementById('status-msg'),
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    projectName: document.getElementById('project-name'),
    fileInput: document.getElementById('asset-file-input'),
    saveBtn: document.getElementById('save-btn'),
    uploadBtn: document.getElementById('upload-asset-btn'),
    
    // Mode Switcher
    modeAssetBtn: document.getElementById('mode-asset-btn'),
    modeLevelBtn: document.getElementById('mode-level-btn'),
    
    // Level Tools
    toolBrush: document.getElementById('tool-brush'),
    toolEraser: document.getElementById('tool-eraser'),
    toggleGridBtn: document.getElementById('toggle-grid-btn'),
    
    // Preview
    previewModal: document.getElementById('preview-modal'),
    previewCanvas: document.getElementById('preview-canvas'),
    closePreviewBtn: document.getElementById('close-preview-btn'),
    fpsSlider: document.getElementById('fps-slider'),
    fpsDisplay: document.getElementById('fps-display'),
    downloadGifBtn: document.getElementById('download-gif-btn'),
    
    // Viewport Tools
    toolSelect: document.getElementById('tool-select'),
    toolPan: document.getElementById('tool-pan'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    bgColorPicker: document.getElementById('bg-color-picker')
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    if (typeof auth === 'undefined') return;
    setupEventListeners();
    buildAssetCategories(); 
    initCanvas();
    initAuthListener();
});

function setupEventListeners() {
    // Auth
    document.getElementById('login-btn').onclick = handleLogin;
    document.getElementById('register-btn').onclick = handleRegister;
    document.getElementById('google-btn').onclick = handleGoogleLogin;
    document.getElementById('logout-btn').onclick = handleLogout;
    
    // Global UI
    ui.toggleBtn.onclick = toggleSidebar;
    ui.saveBtn.onclick = saveCurrentWork;
    ui.fileInput.onchange = handleFileUpload;
    
    // Modes
    ui.modeAssetBtn.onclick = () => setEditorMode('asset');
    ui.modeLevelBtn.onclick = () => setEditorMode('level');

    // Level Tools
    ui.toggleGridBtn.onclick = () => { 
        AppState.level.showGrid = !AppState.level.showGrid; 
        ui.toggleGridBtn.style.color = AppState.level.showGrid ? '#4cd137' : '#666';
        drawCanvas(); 
    };
    ui.toolBrush.onclick = () => setTool('brush');
    ui.toolEraser.onclick = () => setTool('eraser');

    // Preview
    ui.closePreviewBtn.onclick = closePreview;
    ui.downloadGifBtn.onclick = createGif;
    ui.fpsSlider.oninput = (e) => {
        ui.fpsDisplay.innerText = e.target.value;
        getCurrentAnimData().fps = parseInt(e.target.value);
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
        
        if (AppState.editorMode === 'asset') {
            if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedFrameIndex !== -1) deleteFrame(AppState.selectedFrameIndex);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCurrentWork(); }
        
        // Level Hotkeys
        if (AppState.editorMode === 'level') {
            if (e.key === 'b') setTool('brush');
            if (e.key === 'e') setTool('eraser');
        }
    });
    window.addEventListener('keyup', (e) => { 
        if (e.code === 'Space') setTool(AppState.editorMode === 'level' ? 'brush' : 'select'); 
    });
}

// === MODE SWITCHING ===
function setEditorMode(mode) {
    AppState.editorMode = mode;
    
    // UI Updates
    ui.modeAssetBtn.classList.toggle('active', mode === 'asset');
    ui.modeLevelBtn.classList.toggle('active', mode === 'level');
    
    // Show/Hide relevant tools
    const levelTools = document.querySelectorAll('.level-only');
    levelTools.forEach(el => el.classList.toggle('hidden', mode !== 'level'));
    
    // Reset Viewport slightly for context switch
    AppState.viewport.offsetX = 0; 
    AppState.viewport.offsetY = 0;
    
    if (mode === 'level') {
        ui.toolBrush.click(); // Default to brush
        document.getElementById('panel-title-assets').innerText = "Velg Pensel";
        updateInspector(); // Show level help
    } else {
        ui.toolSelect.click(); // Default to select
        document.getElementById('panel-title-assets').innerText = "Mine Tegninger";
        updateInspector(); // Show asset details
    }
    
    drawCanvas();
}

// === LEVEL EDITOR LOGIC ===

function handleLevelMouseDown(e, imgCoords) {
    // 1. Pan
    if (AppState.viewport.activeTool === 'pan') {
        AppState.mode = 'panning'; ui.canvas.style.cursor = "grabbing"; return;
    }
    
    // 2. Paint / Erase
    paintTile(imgCoords);
    AppState.mode = 'painting'; // Start continuous painting
}

function handleLevelMouseMove(e, imgCoords) {
    if (AppState.mode === 'painting') {
        paintTile(imgCoords);
    }
}

function paintTile(coords) {
    // Snap to grid
    const gridX = Math.floor(coords.x / GRID_SIZE);
    const gridY = Math.floor(coords.y / GRID_SIZE);
    const key = `${gridX},${gridY}`;
    
    if (AppState.viewport.activeTool === 'brush') {
        if (!AppState.level.activeBrush) {
            // Hvis ingen pensel er valgt, gi beskjed (kunne brukt toast)
            return; 
        }
        
        // Add/Update tile
        AppState.level.tiles[key] = {
            x: gridX,
            y: gridY,
            assetId: AppState.level.activeBrush.id,
            url: AppState.level.activeBrush.url,
            catId: AppState.level.activeBrush.category
        };
        
        // Ensure image is cached for rendering
        getAssetImage(AppState.level.activeBrush.url); 
    } 
    else if (AppState.viewport.activeTool === 'eraser') {
        delete AppState.level.tiles[key];
    }
    
    drawCanvas();
}

// Image Caching for Level Editor
function getAssetImage(url) {
    if (AppState.assetCache[url]) return AppState.assetCache[url];
    
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = () => drawCanvas(); // Redraw when ready
    AppState.assetCache[url] = img;
    return img;
}

// === CANVAS RENDERER (SPLITTED) ===

function drawCanvas() {
    if(!ui.canvas) return;
    const ctx = ui.canvas.getContext('2d');
    const w = ui.canvas.width; const h = ui.canvas.height;
    
    ctx.clearRect(0, 0, w, h); 
    ctx.fillStyle = AppState.viewport.bgColor; 
    ctx.fillRect(0, 0, w, h);
    
    ctx.save(); 
    ctx.translate(w/2 + AppState.viewport.offsetX, h/2 + AppState.viewport.offsetY); 
    ctx.scale(AppState.viewport.zoom, AppState.viewport.zoom);
    
    if (AppState.editorMode === 'level') {
        drawLevelMode(ctx);
    } else {
        drawAssetMode(ctx);
    }
    
    ctx.restore();
}

function drawLevelMode(ctx) {
    // 1. Draw Tiles
    Object.values(AppState.level.tiles).forEach(tile => {
        const img = getAssetImage(tile.url);
        if (img && img.complete) {
            // Draw tile at grid position
            ctx.drawImage(img, tile.x * GRID_SIZE, tile.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
        }
    });
    
    // 2. Draw Grid (Overlay)
    if (AppState.level.showGrid) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1 / AppState.viewport.zoom;
        
        // Optimization: Only draw grid visible on screen? 
        // For now, draw a reasonable area around 0,0 or based on viewport
        // Simple hack: Draw grid lines based on view bounds logic (omitted for brevity, drawing fixed large grid)
        const range = 50; // Draw 50x50 grid around origin
        ctx.beginPath();
        for(let i = -range; i <= range; i++) {
            ctx.moveTo(i*GRID_SIZE, -range*GRID_SIZE); ctx.lineTo(i*GRID_SIZE, range*GRID_SIZE);
            ctx.moveTo(-range*GRID_SIZE, i*GRID_SIZE); ctx.lineTo(range*GRID_SIZE, i*GRID_SIZE);
        }
        ctx.stroke();
        
        // Draw Axis
        ctx.strokeStyle = "#444";
        ctx.beginPath();
        ctx.moveTo(0, -range*GRID_SIZE); ctx.lineTo(0, range*GRID_SIZE);
        ctx.moveTo(-range*GRID_SIZE, 0); ctx.lineTo(range*GRID_SIZE, 0);
        ctx.stroke();
    }
}

function drawAssetMode(ctx) {
    if (!AppState.loadedImage) { 
        ctx.fillStyle="#444"; ctx.textAlign="center"; ctx.font="20px Arial"; ctx.fillText("Velg tegning", 0, 0); 
        return; 
    }
    
    const img = AppState.loadedImage; 
    const x = -img.width/2; const y = -img.height/2;
    
    ctx.drawImage(img, x, y); 
    ctx.strokeStyle="#444"; ctx.lineWidth=1/AppState.viewport.zoom; 
    ctx.strokeRect(x,y,img.width,img.height);
    
    // Frames
    const frames = getCurrentFrames();
    frames.forEach((f, i) => {
        const isSel = i === AppState.selectedFrameIndex; 
        ctx.strokeStyle = isSel ? "#ffff00" : "#4cd137"; 
        ctx.lineWidth = (isSel ? 2 : 1) / AppState.viewport.zoom; 
        ctx.strokeRect(x+f.x, y+f.y, f.w, f.h);
        
        if(f.anchor){ 
            const ax = x+f.x+f.anchor.x; const ay = y+f.y+f.anchor.y; const s = 5/AppState.viewport.zoom; 
            ctx.strokeStyle="#00ffff"; ctx.beginPath(); ctx.moveTo(ax-s, ay); ctx.lineTo(ax+s, ay); ctx.moveTo(ax, ay-s); ctx.lineTo(ax, ay+s); ctx.stroke(); 
        }
        
        if(isSel){ 
            ctx.fillStyle="#fff"; const hs=4/AppState.viewport.zoom; 
            [[x+f.x, y+f.y], [x+f.x+f.w, y+f.y], [x+f.x, y+f.y+f.h], [x+f.x+f.w, y+f.y+f.h]].forEach(c=>ctx.fillRect(c[0]-hs, c[1]-hs, hs*2, hs*2)); 
        }
        
        ctx.fillStyle = isSel ? "#ffff00" : "#4cd137"; ctx.font=`${10/AppState.viewport.zoom}px Arial`; ctx.fillText("#"+(i+1), x+f.x, y+f.y - 3/AppState.viewport.zoom);
    });
    
    if(AppState.tempSelection){ 
        const s = AppState.tempSelection; ctx.strokeStyle="#ff3333"; ctx.setLineDash([5,5]); ctx.strokeRect(x+s.x, y+s.y, s.w, s.h); ctx.setLineDash([]); 
    }
}

// === CANVAS INTERACTIONS (Updated) ===

function initCanvas() {
    if(!ui.canvas) return;
    ui.canvas.addEventListener('mousedown', (e) => {
        const mouse = getMousePos(e);
        const imgCoords = screenToImageCoords(mouse.x, mouse.y);
        AppState.viewport.lastMouseX = e.clientX; AppState.viewport.lastMouseY = e.clientY;

        if (AppState.editorMode === 'level') {
            handleLevelMouseDown(e, imgCoords);
            return;
        }

        // Asset Mode Logic
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
        const mouse = getMousePos(e);
        const imgCoords = screenToImageCoords(mouse.x, mouse.y);

        if (AppState.editorMode === 'level') {
            handleLevelMouseMove(e, imgCoords);
            if(AppState.mode === 'panning') { // Common pan logic
                AppState.viewport.offsetX += e.clientX - AppState.viewport.lastMouseX;
                AppState.viewport.offsetY += e.clientY - AppState.viewport.lastMouseY;
                AppState.viewport.lastMouseX = e.clientX; AppState.viewport.lastMouseY = e.clientY;
                drawCanvas();
            }
            return;
        }

        // Asset Mode Logic
        if (AppState.mode === 'idle' && AppState.selectedFrameIndex !== -1 && AppState.viewport.activeTool === 'select') { const f = getCurrentFrames()[AppState.selectedFrameIndex]; const h = getResizeHandleHover(mouse.x, mouse.y, f); ui.canvas.style.cursor = h ? h + "-resize" : "default"; }
        if (AppState.mode === 'panning') { AppState.viewport.offsetX += e.clientX - AppState.viewport.lastMouseX; AppState.viewport.offsetY += e.clientY - AppState.viewport.lastMouseY; AppState.viewport.lastMouseX = e.clientX; AppState.viewport.lastMouseY = e.clientY; drawCanvas(); }
        else if (AppState.mode === 'dragging_frame') { const f = getCurrentFrames()[AppState.selectedFrameIndex]; f.x = AppState.initialFrame.x + (imgCoords.x - AppState.dragStart.x); f.y = AppState.initialFrame.y + (imgCoords.y - AppState.dragStart.y); drawCanvas(); }
        else if (AppState.mode === 'dragging_anchor') { const f = getCurrentFrames()[AppState.selectedFrameIndex]; if(!f.anchor) f.anchor = {x: f.w/2, y: f.h}; f.anchor.x = AppState.initialFrame.anchor.x + (imgCoords.x - AppState.dragStart.x); f.anchor.y = AppState.initialFrame.anchor.y + (imgCoords.y - AppState.dragStart.y); drawCanvas(); }
        else if (AppState.mode === 'resizing_frame') { const f = getCurrentFrames()[AppState.selectedFrameIndex]; const dx = imgCoords.x - AppState.dragStart.x; const dy = imgCoords.y - AppState.dragStart.y; const i = AppState.initialFrame; if(AppState.resizeHandle.includes('e')) f.w = Math.max(1, i.w + dx); if(AppState.resizeHandle.includes('s')) f.h = Math.max(1, i.h + dy); if(AppState.resizeHandle.includes('w')) { f.x = Math.min(i.x+i.w-1, i.x+dx); f.w = Math.max(1, i.w-dx); } if(AppState.resizeHandle.includes('n')) { f.y = Math.min(i.y+i.h-1, i.y+dy); f.h = Math.max(1, i.h-dy); } drawCanvas(); }
        else if (AppState.mode === 'drawing') { AppState.tempSelection.w = imgCoords.x - AppState.dragStart.x; AppState.tempSelection.h = imgCoords.y - AppState.dragStart.y; drawCanvas(); }
    });

    window.addEventListener('mouseup', () => {
        if(AppState.mode === 'panning') ui.canvas.style.cursor = AppState.viewport.activeTool==='pan'?"grab":"default";
        
        if (AppState.editorMode === 'asset' && AppState.mode === 'drawing') {
            let s = AppState.tempSelection; if(s.w<0){s.x+=s.w; s.w=Math.abs(s.w);} if(s.h<0){s.y+=s.h; s.h=Math.abs(s.h);}
            if(s.w>2 && s.h>2) { const list = getCurrentFrames(); list.push({x:s.x, y:s.y, w:s.w, h:s.h, anchor:{x:s.w/2, y:s.h}}); AppState.selectedFrameIndex = list.length-1; updateInspector(); }
        }
        
        AppState.mode = 'idle'; AppState.resizeHandle = null; AppState.tempSelection = null;
        drawCanvas();
    });
    ui.canvas.addEventListener('wheel', (e) => { e.preventDefault(); handleZoom(e.deltaY>0?-0.1:0.1); });
}

// === ASSET SELECTION ===
function selectAsset(assetData, docId, li) {
    // 1. LEVEL MODE: Set as Brush
    if (AppState.editorMode === 'level') {
        // Highlight in UI
        document.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected-item'));
        li.classList.add('selected-item');
        
        // Set as active brush
        AppState.level.activeBrush = { ...assetData, id: docId };
        
        // Show info in inspector (Level Context)
        ui.inspector.innerHTML = `
            <div style="padding:10px;">
                <p style="font-size:12px; color:#aaa; text-transform:uppercase;">Valgt Pensel</p>
                <div style="margin-top:10px; display:flex; align-items:center;">
                    <img src="${assetData.url}" style="width:40px; height:40px; background:#333; margin-right:10px; object-fit:contain;">
                    <b>${assetData.originalName}</b>
                </div>
                <hr style="border:0; border-top:1px solid #444; margin:15px 0;">
                <p style="font-size:11px; color:#888;">Klikk på rutenettet for å male.</p>
            </div>
        `;
        return;
    }

    // 2. ASSET MODE: Edit Animation (Existing Logic)
    document.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected-item'));
    li.classList.add('selected-item');
    AppState.selectedAsset = { id: docId, data: assetData };
    
    let rawAnims = assetData.animations || {};
    AppState.animations = {};
    DEFAULT_ANIMS.forEach(name => { if (rawAnims[name]) { if (Array.isArray(rawAnims[name])) AppState.animations[name] = { fps: 8, frames: rawAnims[name] }; else AppState.animations[name] = rawAnims[name]; } else { AppState.animations[name] = { fps: 8, frames: [] }; } });
    AppState.currentAnimName = "Idle"; AppState.selectedFrameIndex = -1;

    const img = new Image(); img.crossOrigin = "Anonymous"; img.src = assetData.url;
    img.onload = () => { AppState.loadedImage = img; drawCanvas(); updateInspector(); };
}

// === INSPECTOR (Updated for context) ===
function updateInspector() {
    if (!ui.inspector) return;
    
    // Level Mode Help
    if (AppState.editorMode === 'level') {
        if (!AppState.level.activeBrush) {
            ui.inspector.innerHTML = `<div style="padding:20px; text-align:center; color:#888; font-size:12px;">Velg en ting å bygge med fra listen.</div>`;
        }
        return;
    }

    // Asset Mode
    if (!AppState.loadedImage) { ui.inspector.innerHTML = `<div style="padding:20px; color:#888; text-align:center; font-size:12px;">Velg en tegning.</div>`; return; }
    const animName = AppState.currentAnimName; const frames = getCurrentFrames();
    let animOptions = ""; Object.keys(AppState.animations).forEach(k => { animOptions += `<option value="${k}" ${k === animName ? "selected" : ""}>${k}</option>`; });
    let framesListHtml = frames.length === 0 ? `<p style="padding:10px; font-style:italic; color:#666; font-size:11px;">Ingen frames.</p>` : "";
    if(frames.length > 0) frames.forEach((f, i) => { const isSel = i === AppState.selectedFrameIndex; framesListHtml += `<li class="${isSel ? "selected-item" : ""}" onclick="selectFrame(${i})"><span style="flex:1; font-size:12px;">Frame #${i+1}</span><button onclick="deleteFrame(${i}, event)" style="background:none; border:none; color:#ff6666; font-weight:bold; cursor:pointer;">✖</button></li>`; });

    ui.inspector.innerHTML = `<div class="inspector-section"><label class="inspector-label">Aktiv Animasjon</label><div class="anim-row"><select class="anim-select" onchange="changeAnimation(this.value)">${animOptions}</select><button class="small-btn" onclick="createNewAnimation()">+</button></div><button class="primary-btn" style="width:100%; margin-top:5px; font-size:12px;" onclick="openPreview()">▶ Spill av</button></div><div style="flex:1; display:flex; flex-direction:column; overflow:hidden;"><label class="inspector-label" style="padding:0 5px;">Frames (${frames.length})</label><ul id="frame-list" style="list-style:none; overflow-y:auto; flex:1; margin-top:5px; border-top:1px solid #333;">${framesListHtml}</ul></div><div style="margin-top:auto; padding-top:10px; border-top:1px solid #333; font-size:10px; color:#666;">Tips: Husk å trykke <b>Lagre</b>!</div>`;
}

// === BOILERPLATE & HELPERS ===
function getMousePos(e){const r=ui.canvas.getBoundingClientRect(); return{x:e.clientX-r.left, y:e.clientY-r.top};}
function dist(x1,y1,x2,y2){return Math.sqrt((x2-x1)**2+(y2-y1)**2);}
function screenToImageCoords(sx,sy){const z=AppState.viewport.zoom; 
    // In Level Mode, origin is center of screen + offset (no image centering)
    if(AppState.editorMode === 'level') {
        const dx = (ui.canvas.width/2) + AppState.viewport.offsetX;
        const dy = (ui.canvas.height/2) + AppState.viewport.offsetY;
        return {x:(sx-dx)/z, y:(sy-dy)/z};
    }
    // In Asset Mode, origin is centered on image
    const img=AppState.loadedImage; if(!img)return{x:0,y:0};
    const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z);
    const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);
    return {x:(sx-dx)/z,y:(sy-dy)/z};
}
function imageToScreenCoords(ix,iy){const z=AppState.viewport.zoom;
    if(AppState.editorMode === 'level') {
        const dx = (ui.canvas.width/2) + AppState.viewport.offsetX;
        const dy = (ui.canvas.height/2) + AppState.viewport.offsetY;
        return {x:dx+(ix*z), y:dy+(iy*z)};
    }
    const img=AppState.loadedImage; if(!img)return{x:0,y:0};
    const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z);
    const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);
    return {x:dx+(ix*z),y:dy+(iy*z)};
}
function getFrameAt(ix,iy){const fs=getCurrentFrames();for(let i=fs.length-1;i>=0;i--){const f=fs[i];if(ix>=f.x&&ix<=f.x+f.w&&iy>=f.y&&iy<=f.y+f.h)return i;}return -1;}
function getResizeHandleHover(mx,my,f){const z=AppState.viewport.zoom,m=8;const tl=imageToScreenCoords(f.x,f.y),tr=imageToScreenCoords(f.x+f.w,f.y),bl=imageToScreenCoords(f.x,f.y+f.h),br=imageToScreenCoords(f.x+f.w,f.y+f.h);if(dist(mx,my,tl.x,tl.y)<m)return'nw';if(dist(mx,my,tr.x,tr.y)<m)return'ne';if(dist(mx,my,bl.x,bl.y)<m)return'sw';if(dist(mx,my,br.x,br.y)<m)return'se';return null;}
function setTool(t){AppState.viewport.activeTool=t;
    // UI Updates
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if(t==='select') ui.toolSelect.classList.add('active');
    if(t==='pan') ui.toolPan.classList.add('active');
    if(t==='brush') ui.toolBrush.classList.add('active');
    if(t==='eraser') ui.toolEraser.classList.add('active');
    ui.canvas.style.cursor = t==='pan' ? "grab" : "default";
}
function handleZoom(a){let z=AppState.viewport.zoom+a;z=Math.max(0.1,Math.min(z,10.0));AppState.viewport.zoom=Math.round(z*10)/10;ui.zoomLabel.innerText=Math.round(z*100)+"%";drawCanvas();}
function getCurrentAnimData() { if (!AppState.animations[AppState.currentAnimName]) AppState.animations[AppState.currentAnimName] = { fps: 8, frames: [] }; return AppState.animations[AppState.currentAnimName]; }
function getCurrentFrames() { return getCurrentAnimData().frames; }

// --- BOILERPLATE (Standard, un-modified) ---
function initAuthListener(){auth.onAuthStateChanged(u=>{if(u){AppState.user=u;ui.statusMsg.innerText="Klar";setTimeout(()=>{toggleSidebar();subscribeToAssets(u.uid);},500);}else{AppState.user=null;transitionToLogin();}});}
function handleLogin(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.signInWithEmailAndPassword(e,p).catch(err=>showStatus(err.code,"error"));}
function handleRegister(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.createUserWithEmailAndPassword(e,p).then(()=>showStatus("OK","success")).catch(err=>showStatus(err.code,"error"));}
function handleGoogleLogin(){auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err=>console.error(err));}
function handleLogout(){auth.signOut();}
async function handleFileUpload(ev){const f=ev.target.files[0];if(!f)return;if(!f.type.startsWith('image/'))return alert("Kun bilder");const catId=AppState.uploadTargetCategory||'char';ui.uploadBtn.innerText="...";ui.uploadBtn.disabled=true;const uid=AppState.user.uid,ref=storage.ref().child(`users/${uid}/assets/${catId}/${Date.now()}_${f.name}`);try{const snap=await ref.put(f),url=await snap.ref.getDownloadURL();await db.collection('users').doc(uid).collection('assets').add({originalName:f.name,url,type:f.type,category:catId,createdAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(e){alert(e.message);}finally{ui.fileInput.value='';ui.uploadBtn.innerText="+ Ny";ui.uploadBtn.disabled=false;}}
function subscribeToAssets(uid){ASSET_CATEGORIES.forEach(c=>document.getElementById(`cat-list-${c.id}`).innerHTML='');AppState.unsubscribeAssets=db.collection('users').doc(uid).collection('assets').orderBy('createdAt','desc').onSnapshot(s=>{ASSET_CATEGORIES.forEach(c=>document.getElementById(`cat-list-${c.id}`).innerHTML='');if(s.empty)return;s.forEach(d=>renderAssetItem(d.data(),d.id,d.data().category||'char'));});}
function renderAssetItem(a,id,catId){const l=document.getElementById(`cat-list-${catId}`);if(!l)return;const li=document.createElement('li');li.className='asset-item';li.innerHTML=`<img src="${a.url}" class="asset-thumb"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;">${a.originalName}</span><button onclick="deleteAsset('${id}','${a.url}',event)" style="background:none;border:none;color:#f55;font-weight:bold;cursor:pointer;">X</button>`;li.onclick=()=>selectAsset(a,id,li);l.appendChild(li);}
function buildAssetCategories(){ui.assetsSection.innerHTML='';ui.assetsSection.appendChild(ui.fileInput);ASSET_CATEGORIES.forEach(c=>{const b=document.createElement('div');b.className='category-block';b.innerHTML=`<div class="category-header" onclick="toggleCategory('${c.id}')"><div style="display:flex;align-items:center;"><span class="cat-indicator" style="background-color:${c.color}"></span><span>${c.name}</span></div><button class="tiny-btn" onclick="triggerUpload('${c.id}',event)">+ Ny</button></div><ul id="cat-list-${c.id}" class="asset-list-ul"></ul>`;ui.assetsSection.appendChild(b);});}
window.toggleCategory=id=>{const l=document.getElementById(`cat-list-${id}`);if(l)l.classList.toggle('collapsed');};
window.triggerUpload=(id,e)=>{e.stopPropagation();AppState.uploadTargetCategory=id;ui.fileInput.click();};
window.deleteAsset=async(id,url,e)=>{e.stopPropagation();if(!confirm("Slette?"))return;try{await firebase.storage().refFromURL(url).delete();await db.collection('users').doc(AppState.user.uid).collection('assets').doc(id).delete();}catch(e){console.error(e);}};
function toggleSidebar(){ui.leftPanel.classList.toggle('collapsed');setTimeout(drawCanvas,300);}
async function saveCurrentWork(){if(!AppState.selectedAsset)return alert("Ingen fil.");const id=AppState.selectedAsset.id;ui.saveBtn.innerText="Lagrer...";try{await db.collection('users').doc(AppState.user.uid).collection('assets').doc(id).update({animations:AppState.animations,lastModified:firebase.firestore.FieldValue.serverTimestamp()});ui.saveBtn.innerText="Lagret!";setTimeout(()=>ui.saveBtn.innerText="Lagre",2000);}catch(e){alert(e.message);}}
function showStatus(m,t){ui.statusMsg.innerText=m;ui.statusMsg.style.color=t==="error"?"red":"green";}
function transitionToEditor(){ui.loginScreen.classList.add('hidden');ui.editorScreen.classList.remove('hidden');if(AppState.user)ui.projectName.innerText=AppState.user.email;}
function transitionToLogin(){ui.editorScreen.classList.add('hidden');ui.loginScreen.classList.remove('hidden');}
// Preview/GIF (Shortened)
window.openPreview=()=>{const f=getCurrentFrames();if(f.length===0)return alert("Ingen frames.");ui.previewModal.classList.remove('hidden');AppState.preview.active=true;AppState.preview.lastTime=performance.now();requestAnimationFrame(animatePreview);}
function closePreview(){ui.previewModal.classList.add('hidden');AppState.preview.active=false;}
function animatePreview(t){if(!AppState.preview.active)return;const d=getCurrentAnimData(),f=d.frames,fps=d.fps||8,interval=1000/fps;const dt=t-AppState.preview.lastTime;AppState.preview.lastTime=t;AppState.preview.accumulatedTime+=dt;if(AppState.preview.accumulatedTime>=interval){AppState.preview.frameIndex=(AppState.preview.frameIndex+1)%f.length;AppState.preview.accumulatedTime-=interval;}const ctx=ui.previewCanvas.getContext('2d'),w=ui.previewCanvas.width,h=ui.previewCanvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle=AppState.viewport.bgColor;ctx.fillRect(0,0,w,h);const fr=f[AppState.preview.frameIndex],img=AppState.loadedImage;if(fr&&img){const sx=fr.x,sy=fr.y,sw=fr.w,sh=fr.h,pad=0.9,sc=Math.min((w*pad)/sw,(h*pad)/sh),dw=sw*sc,dh=sh*sc;ctx.imageSmoothingEnabled=false;ctx.drawImage(img,sx,sy,sw,sh,(w-dw)/2,(h-dh)/2,dw,dh);}requestAnimationFrame(animatePreview);}
async function createGif(){const d=getCurrentAnimData(),f=d.frames;if(f.length===0)return;ui.downloadGifBtn.innerText="Genererer...";try{const wr=await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'),wb=await wr.blob(),wu=URL.createObjectURL(wb),gif=new GIF({workers:2,quality:10,workerScript:wu,background:AppState.viewport.bgColor,width:f[0].w,height:f[0].h}),img=AppState.loadedImage,fps=d.fps||8;f.forEach(r=>{const c=document.createElement('canvas');c.width=r.w;c.height=r.h;const x=c.getContext('2d');x.fillStyle=AppState.viewport.bgColor;x.fillRect(0,0,r.w,r.h);x.drawImage(img,r.x,r.y,r.w,r.h,0,0,r.w,r.h);gif.addFrame(c,{delay:1000/fps});});gif.on('finished',b=>{const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`${AppState.selectedAsset.data.originalName}.gif`;a.click();ui.downloadGifBtn.innerText="Last ned GIF";});gif.render();}catch(e){console.error(e);ui.downloadGifBtn.innerText="Feil";}}

/* Version: #23 */
