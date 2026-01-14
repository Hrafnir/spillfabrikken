/* Version: #24 */

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
const GRID_SIZE = 32;

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    editorMode: 'asset', // 'asset' | 'level'
    
    // ASSET EDITOR DATA
    selectedAsset: null, 
    loadedImage: null,
    animations: {},      
    currentAnimName: "Idle",
    
    // LEVEL EDITOR DATA
    level: {
        tiles: {}, // "x,y": { assetId, url, catId }
        activeBrush: null,
        showGrid: true
    },
    assetCache: {}, // url -> Image object
    
    // INTERACTION
    uploadTargetCategory: 'char',
    selectedFrameIndex: -1,
    mode: 'idle', // 'drawing', 'panning', 'painting'...
    
    dragStart: {x:0, y:0},
    initialFrame: null,
    resizeHandle: null,
    tempSelection: null,
    
    // VIEWPORT
    viewport: {
        zoom: 1.0, offsetX: 0, offsetY: 0,
        lastMouseX: 0, lastMouseY: 0,
        bgColor: '#222222', activeTool: 'select'
    },

    // PREVIEW
    preview: { active: false, lastTime: 0, frameIndex: 0, accumulatedTime: 0 }
};

// === UI ELEMENTS (Populated in initUI) ===
let ui = {};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    if (typeof auth === 'undefined') {
        console.error("Firebase Auth not loaded. Check internet or firebase-config.js");
        return;
    }
    
    // 1. Grab all DOM elements safely
    initUI();
    
    // 2. Setup Listeners
    setupEventListeners();
    
    // 3. Build dynamic menus
    buildAssetCategories(); 
    
    // 4. Start Canvas
    initCanvas();
    
    // 5. Check Login
    initAuthListener();
});

function initUI() {
    ui = {
        // Screens
        loginScreen: document.getElementById('login-overlay'),
        editorScreen: document.getElementById('editor-ui'),
        statusMsg: document.getElementById('status-msg'),
        
        // Panels
        leftPanel: document.getElementById('left-panel'),
        inspector: document.getElementById('inspector-content'),
        assetsSection: document.getElementById('assets-section'),
        
        // Canvas
        canvas: document.getElementById('game-canvas'),
        
        // Inputs
        emailInput: document.getElementById('email-input'),
        passwordInput: document.getElementById('password-input'),
        projectName: document.getElementById('project-name'),
        fileInput: document.getElementById('asset-file-input'),
        fpsSlider: document.getElementById('fps-slider'),
        fpsDisplay: document.getElementById('fps-display'),
        bgColorPicker: document.getElementById('bg-color-picker'),
        
        // Buttons (Auth)
        loginBtn: document.getElementById('login-btn'),
        registerBtn: document.getElementById('register-btn'),
        googleBtn: document.getElementById('google-btn'),
        logoutBtn: document.getElementById('logout-btn'),
        
        // Buttons (Editor)
        toggleBtn: document.getElementById('toggle-sidebar-btn'),
        saveBtn: document.getElementById('save-btn'),
        uploadBtn: document.getElementById('upload-asset-btn'),
        
        // Buttons (Mode)
        modeAssetBtn: document.getElementById('mode-asset-btn'),
        modeLevelBtn: document.getElementById('mode-level-btn'),
        
        // Buttons (Tools)
        toolSelect: document.getElementById('tool-select'),
        toolPan: document.getElementById('tool-pan'),
        toolBrush: document.getElementById('tool-brush'),
        toolEraser: document.getElementById('tool-eraser'),
        zoomInBtn: document.getElementById('zoom-in-btn'),
        zoomOutBtn: document.getElementById('zoom-out-btn'),
        zoomLabel: document.getElementById('zoom-level'),
        toggleGridBtn: document.getElementById('toggle-grid-btn'),
        
        // Preview
        previewModal: document.getElementById('preview-modal'),
        previewCanvas: document.getElementById('preview-canvas'),
        closePreviewBtn: document.getElementById('close-preview-btn'),
        downloadGifBtn: document.getElementById('download-gif-btn')
    };
}

function setupEventListeners() {
    // Auth
    if(ui.loginBtn) ui.loginBtn.onclick = handleLogin;
    if(ui.registerBtn) ui.registerBtn.onclick = handleRegister;
    if(ui.googleBtn) ui.googleBtn.onclick = handleGoogleLogin;
    if(ui.logoutBtn) ui.logoutBtn.onclick = handleLogout;
    
    // Editor UI
    ui.toggleBtn.onclick = toggleSidebar;
    ui.saveBtn.onclick = saveCurrentWork;
    ui.fileInput.onchange = handleFileUpload;
    
    // Mode Switch
    ui.modeAssetBtn.onclick = () => setEditorMode('asset');
    ui.modeLevelBtn.onclick = () => setEditorMode('level');
    
    // Tools
    ui.toolSelect.onclick = () => setTool('select');
    ui.toolPan.onclick = () => setTool('pan');
    ui.toolBrush.onclick = () => setTool('brush');
    ui.toolEraser.onclick = () => setTool('eraser');
    ui.toggleGridBtn.onclick = toggleGrid;
    
    // Viewport
    ui.zoomInBtn.onclick = () => handleZoom(0.1);
    ui.zoomOutBtn.onclick = () => handleZoom(-0.1);
    ui.bgColorPicker.oninput = (e) => { AppState.viewport.bgColor = e.target.value; drawCanvas(); };
    
    // Preview
    ui.closePreviewBtn.onclick = closePreview;
    ui.downloadGifBtn.onclick = createGif;
    ui.fpsSlider.oninput = (e) => {
        const fps = parseInt(e.target.value);
        ui.fpsDisplay.innerText = fps;
        getCurrentAnimData().fps = fps;
    };

    // Keyboard Shortcuts
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', (e) => { 
        if (e.code === 'Space') setTool(AppState.editorMode === 'level' ? 'brush' : 'select'); 
    });
}

// === LOGIC START ===

function handleKeyDown(e) {
    if (!ui.loginScreen.classList.contains('hidden')) return; // Ignore if logging in
    
    if (e.key === '+' || e.key === '=') handleZoom(0.1);
    if (e.key === '-') handleZoom(-0.1);
    if (e.code === 'Space') if(AppState.viewport.activeTool !== 'pan') setTool('pan');
    
    // Asset Mode Keys
    if (AppState.editorMode === 'asset') {
        if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedFrameIndex !== -1) {
            deleteFrame(AppState.selectedFrameIndex);
        }
    }
    
    // Level Mode Keys
    if (AppState.editorMode === 'level') {
        if (e.key === 'b') setTool('brush');
        if (e.key === 'e') setTool('eraser');
    }
    
    // Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentWork();
    }
}

// === MODE SWITCHING ===
function setEditorMode(mode) {
    AppState.editorMode = mode;
    
    // Update Buttons
    ui.modeAssetBtn.classList.toggle('active', mode === 'asset');
    ui.modeLevelBtn.classList.toggle('active', mode === 'level');
    
    // Show/Hide Tools
    const levelTools = document.querySelectorAll('.level-only');
    levelTools.forEach(el => el.classList.toggle('hidden', mode !== 'level'));
    
    // Reset Viewport Offset
    AppState.viewport.offsetX = 0; 
    AppState.viewport.offsetY = 0;
    
    if (mode === 'level') {
        setTool('brush');
        document.getElementById('panel-title-assets').innerText = "Velg Pensel";
    } else {
        setTool('select');
        document.getElementById('panel-title-assets').innerText = "Mine Tegninger";
    }
    updateInspector();
    drawCanvas();
}

// === LEVEL EDITOR LOGIC ===
function toggleGrid() {
    AppState.level.showGrid = !AppState.level.showGrid;
    ui.toggleGridBtn.style.color = AppState.level.showGrid ? '#4cd137' : '#666';
    drawCanvas();
}

function handleLevelMouseDown(e, imgCoords) {
    if (AppState.viewport.activeTool === 'pan') {
        AppState.mode = 'panning'; 
        ui.canvas.style.cursor = "grabbing"; 
        return;
    }
    paintTile(imgCoords);
    AppState.mode = 'painting';
}

function paintTile(coords) {
    // Snap to Grid
    const gridX = Math.floor(coords.x / GRID_SIZE);
    const gridY = Math.floor(coords.y / GRID_SIZE);
    const key = `${gridX},${gridY}`;
    
    if (AppState.viewport.activeTool === 'brush') {
        if (!AppState.level.activeBrush) return;
        
        AppState.level.tiles[key] = {
            x: gridX, y: gridY,
            assetId: AppState.level.activeBrush.id,
            url: AppState.level.activeBrush.url
        };
        // Pre-cache image for rendering
        getAssetImage(AppState.level.activeBrush.url);
    } 
    else if (AppState.viewport.activeTool === 'eraser') {
        delete AppState.level.tiles[key];
    }
    drawCanvas();
}

function getAssetImage(url) {
    if (AppState.assetCache[url]) return AppState.assetCache[url];
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = () => drawCanvas();
    AppState.assetCache[url] = img;
    return img;
}

// === CANVAS RENDERER ===
function drawCanvas() {
    if(!ui.canvas) return;
    const ctx = ui.canvas.getContext('2d');
    const w = ui.canvas.width; const h = ui.canvas.height;
    
    // Clear
    ctx.clearRect(0, 0, w, h); 
    ctx.fillStyle = AppState.viewport.bgColor; 
    ctx.fillRect(0, 0, w, h);
    
    // Camera Transform
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
    // Draw Tiles
    Object.values(AppState.level.tiles).forEach(tile => {
        const img = getAssetImage(tile.url);
        if (img && img.complete) {
            ctx.drawImage(img, tile.x * GRID_SIZE, tile.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
        }
    });
    
    // Draw Grid Overlay
    if (AppState.level.showGrid) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1 / AppState.viewport.zoom;
        ctx.beginPath();
        const range = 50; 
        for(let i = -range; i <= range; i++) {
            ctx.moveTo(i*GRID_SIZE, -range*GRID_SIZE); ctx.lineTo(i*GRID_SIZE, range*GRID_SIZE);
            ctx.moveTo(-range*GRID_SIZE, i*GRID_SIZE); ctx.lineTo(range*GRID_SIZE, i*GRID_SIZE);
        }
        ctx.stroke();
        
        // Axis
        ctx.strokeStyle = "#444"; ctx.lineWidth = 2 / AppState.viewport.zoom;
        ctx.beginPath();
        ctx.moveTo(0, -range*GRID_SIZE); ctx.lineTo(0, range*GRID_SIZE);
        ctx.moveTo(-range*GRID_SIZE, 0); ctx.lineTo(range*GRID_SIZE, 0);
        ctx.stroke();
    }
}

function drawAssetMode(ctx) {
    if (!AppState.loadedImage) { 
        ctx.fillStyle="#444"; ctx.textAlign="center"; ctx.font="20px Arial"; ctx.fillText("Velg tegning", 0, 0); return; 
    }
    
    const img = AppState.loadedImage; 
    const x = -img.width/2; const y = -img.height/2;
    
    ctx.drawImage(img, x, y); 
    ctx.strokeStyle="#444"; ctx.lineWidth=1/AppState.viewport.zoom; 
    ctx.strokeRect(x,y,img.width,img.height);
    
    const frames = getCurrentFrames();
    frames.forEach((f, i) => {
        const isSel = i === AppState.selectedFrameIndex; 
        ctx.strokeStyle = isSel ? "#ffff00" : "#4cd137"; 
        ctx.lineWidth = (isSel ? 2 : 1) / AppState.viewport.zoom; 
        ctx.strokeRect(x+f.x, y+f.y, f.w, f.h);
        
        if(f.anchor){ 
            const ax = x+f.x+f.anchor.x; const ay = y+f.y+f.anchor.y; const s = 5/AppState.viewport.zoom; 
            ctx.strokeStyle="#00ffff"; ctx.beginPath(); 
            ctx.moveTo(ax-s, ay); ctx.lineTo(ax+s, ay); 
            ctx.moveTo(ax, ay-s); ctx.lineTo(ax, ay+s); ctx.stroke(); 
        }
        
        if(isSel){ 
            ctx.fillStyle="#fff"; const hs=4/AppState.viewport.zoom; 
            [[x+f.x, y+f.y], [x+f.x+f.w, y+f.y], [x+f.x, y+f.y+f.h], [x+f.x+f.w, y+f.y+f.h]].forEach(c=>ctx.fillRect(c[0]-hs, c[1]-hs, hs*2, hs*2)); 
        }
        
        ctx.fillStyle = isSel ? "#ffff00" : "#4cd137"; 
        ctx.font=`${10/AppState.viewport.zoom}px Arial`; 
        ctx.fillText("#"+(i+1), x+f.x, y+f.y - 3/AppState.viewport.zoom);
    });
    
    if(AppState.tempSelection){ 
        const s = AppState.tempSelection; 
        ctx.strokeStyle="#ff3333"; ctx.setLineDash([5,5]); 
        ctx.strokeRect(x+s.x, y+s.y, s.w, s.h); ctx.setLineDash([]); 
    }
}

// === INIT ASSET MODE INTERACTIONS ===
function initCanvas() {
    if(!ui.canvas) return;
    ui.canvas.addEventListener('mousedown', (e) => {
        const mouse = getMousePos(e);
        const imgCoords = screenToImageCoords(mouse.x, mouse.y);
        AppState.viewport.lastMouseX = e.clientX; AppState.viewport.lastMouseY = e.clientY;

        // Route to appropriate handler
        if (AppState.editorMode === 'level') {
            handleLevelMouseDown(e, imgCoords);
            return;
        }

        // Asset Mode
        if (AppState.viewport.activeTool === 'pan') { AppState.mode = 'panning'; ui.canvas.style.cursor = "grabbing"; return; }
        if (!AppState.loadedImage) return;

        // Check Frames
        if (AppState.selectedFrameIndex !== -1) {
            const frame = getCurrentFrames()[AppState.selectedFrameIndex];
            const anchorScreen = imageToScreenCoords(frame.x + (frame.anchor?frame.anchor.x:frame.w/2), frame.y + (frame.anchor?frame.anchor.y:frame.h));
            if (dist(mouse.x, mouse.y, anchorScreen.x, anchorScreen.y) < 10) { 
                AppState.mode = 'dragging_anchor'; AppState.dragStart = imgCoords; 
                AppState.initialFrame = JSON.parse(JSON.stringify(frame)); 
                if(!AppState.initialFrame.anchor) AppState.initialFrame.anchor = {x:frame.w/2, y:frame.h}; 
                return; 
            }
            const handle = getResizeHandleHover(mouse.x, mouse.y, frame);
            if (handle) { 
                AppState.mode = 'resizing_frame'; AppState.resizeHandle = handle; 
                AppState.dragStart = imgCoords; AppState.initialFrame = JSON.parse(JSON.stringify(frame)); 
                return; 
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

        if (AppState.editorMode === 'level') {
            if (AppState.mode === 'painting') paintTile(imgCoords);
            if (AppState.mode === 'panning') {
                AppState.viewport.offsetX += e.clientX - AppState.viewport.lastMouseX;
                AppState.viewport.offsetY += e.clientY - AppState.viewport.lastMouseY;
                AppState.viewport.lastMouseX = e.clientX; AppState.viewport.lastMouseY = e.clientY;
                drawCanvas();
            }
            return;
        }

        // Asset Mode
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
            if(!f.anchor) f.anchor = {x: f.w/2, y: f.h}; 
            f.anchor.x = AppState.initialFrame.anchor.x + (imgCoords.x - AppState.dragStart.x); 
            f.anchor.y = AppState.initialFrame.anchor.y + (imgCoords.y - AppState.dragStart.y); 
            drawCanvas(); 
        }
        else if (AppState.mode === 'resizing_frame') { 
            const f = getCurrentFrames()[AppState.selectedFrameIndex]; 
            const dx = imgCoords.x - AppState.dragStart.x; const dy = imgCoords.y - AppState.dragStart.y; const i = AppState.initialFrame; 
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
        
        if(AppState.editorMode === 'asset' && AppState.mode === 'drawing') {
            let s = AppState.tempSelection; 
            if(s.w<0){s.x+=s.w; s.w=Math.abs(s.w);} if(s.h<0){s.y+=s.h; s.h=Math.abs(s.h);}
            if(s.w>2 && s.h>2) { 
                const list = getCurrentFrames(); 
                list.push({x:s.x, y:s.y, w:s.w, h:s.h, anchor:{x:s.w/2, y:s.h}}); 
                AppState.selectedFrameIndex = list.length-1; updateInspector(); 
            }
        }
        AppState.mode = 'idle'; AppState.resizeHandle = null; AppState.tempSelection = null;
        drawCanvas();
    });
    
    ui.canvas.addEventListener('wheel', (e) => { e.preventDefault(); handleZoom(e.deltaY>0?-0.1:0.1); });
}

// === UTILS ===
function getMousePos(e){const r=ui.canvas.getBoundingClientRect(); return{x:e.clientX-r.left, y:e.clientY-r.top};}
function dist(x1,y1,x2,y2){return Math.sqrt((x2-x1)**2+(y2-y1)**2);}
function screenToImageCoords(sx,sy){const z=AppState.viewport.zoom; 
    if(AppState.editorMode === 'level') { const dx = (ui.canvas.width/2) + AppState.viewport.offsetX; const dy = (ui.canvas.height/2) + AppState.viewport.offsetY; return {x:(sx-dx)/z, y:(sy-dy)/z}; }
    const img=AppState.loadedImage; if(!img)return{x:0,y:0};
    const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z); const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);
    return {x:(sx-dx)/z,y:(sy-dy)/z};
}
function imageToScreenCoords(ix,iy){const z=AppState.viewport.zoom;
    if(AppState.editorMode === 'level') { const dx = (ui.canvas.width/2) + AppState.viewport.offsetX; const dy = (ui.canvas.height/2) + AppState.viewport.offsetY; return {x:dx+(ix*z), y:dy+(iy*z)}; }
    const img=AppState.loadedImage; if(!img)return{x:0,y:0};
    const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z); const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);
    return {x:dx+(ix*z),y:dy+(iy*z)};
}
function getFrameAt(ix,iy){const fs=getCurrentFrames();for(let i=fs.length-1;i>=0;i--){const f=fs[i];if(ix>=f.x&&ix<=f.x+f.w&&iy>=f.y&&iy<=f.y+f.h)return i;}return -1;}
function getResizeHandleHover(mx,my,f){const z=AppState.viewport.zoom,m=8;const tl=imageToScreenCoords(f.x,f.y),tr=imageToScreenCoords(f.x+f.w,f.y),bl=imageToScreenCoords(f.x,f.y+f.h),br=imageToScreenCoords(f.x+f.w,f.y+f.h);if(dist(mx,my,tl.x,tl.y)<m)return'nw';if(dist(mx,my,tr.x,tr.y)<m)return'ne';if(dist(mx,my,bl.x,bl.y)<m)return'sw';if(dist(mx,my,br.x,br.y)<m)return'se';return null;}
function setTool(t){AppState.viewport.activeTool=t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if(t==='select') ui.toolSelect.classList.add('active'); if(t==='pan') ui.toolPan.classList.add('active');
    if(t==='brush') ui.toolBrush.classList.add('active'); if(t==='eraser') ui.toolEraser.classList.add('active');
    ui.canvas.style.cursor = t==='pan' ? "grab" : "default";
}
function handleZoom(a){let z=AppState.viewport.zoom+a;z=Math.max(0.1,Math.min(z,10.0));AppState.viewport.zoom=Math.round(z*10)/10;ui.zoomLabel.innerText=Math.round(z*100)+"%";drawCanvas();}
function getCurrentAnimData() { if (!AppState.animations[AppState.currentAnimName]) AppState.animations[AppState.currentAnimName] = { fps: 8, frames: [] }; return AppState.animations[AppState.currentAnimName]; }
function getCurrentFrames() { return getCurrentAnimData().frames; }

// --- BOILERPLATE ---
function initAuthListener(){auth.onAuthStateChanged(u=>{if(u){AppState.user=u;ui.statusMsg.innerText="Klar";setTimeout(()=>{toggleSidebar();subscribeToAssets(u.uid);},500);}else{AppState.user=null;transitionToLogin();}});}
function handleLogin(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.signInWithEmailAndPassword(e,p).catch(err=>showStatus(err.code,"error"));}
function handleRegister(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.createUserWithEmailAndPassword(e,p).then(()=>showStatus("OK","success")).catch(err=>showStatus(err.code,"error"));}
function handleGoogleLogin(){auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err=>console.error(err));}
function handleLogout(){auth.signOut();}
function transitionToEditor(){ui.loginScreen.classList.add('hidden');ui.editorScreen.classList.remove('hidden');if(AppState.user)ui.projectName.innerText=AppState.user.email;}
function transitionToLogin(){ui.editorScreen.classList.add('hidden');ui.loginScreen.classList.remove('hidden');}
function showStatus(m,t){ui.statusMsg.innerText=m;ui.statusMsg.style.color=t==="error"?"red":"green";}
function toggleSidebar(){ui.leftPanel.classList.toggle('collapsed');setTimeout(drawCanvas,300);}

function buildAssetCategories(){ui.assetsSection.innerHTML='';ui.assetsSection.appendChild(ui.fileInput);ASSET_CATEGORIES.forEach(c=>{const b=document.createElement('div');b.className='category-block';b.innerHTML=`<div class="category-header" onclick="toggleCategory('${c.id}')"><div style="display:flex;align-items:center;"><span class="cat-indicator" style="background-color:${c.color}"></span><span>${c.name}</span></div><button class="tiny-btn" onclick="triggerUpload('${c.id}',event)">+ Ny</button></div><ul id="cat-list-${c.id}" class="asset-list-ul"></ul>`;ui.assetsSection.appendChild(b);});}
window.toggleCategory=id=>{const l=document.getElementById(`cat-list-${id}`);if(l)l.classList.toggle('collapsed');};
window.triggerUpload=(id,e)=>{e.stopPropagation();AppState.uploadTargetCategory=id;ui.fileInput.click();};
window.deleteAsset=async(id,url,e)=>{e.stopPropagation();if(!confirm("Slette?"))return;try{await firebase.storage().refFromURL(url).delete();await db.collection('users').doc(AppState.user.uid).collection('assets').doc(id).delete();}catch(e){console.error(e);}};

async function handleFileUpload(ev){const f=ev.target.files[0];if(!f)return;if(!f.type.startsWith('image/'))return alert("Kun bilder");const catId=AppState.uploadTargetCategory||'char';ui.uploadBtn.innerText="...";ui.uploadBtn.disabled=true;const uid=AppState.user.uid,ref=storage.ref().child(`users/${uid}/assets/${catId}/${Date.now()}_${f.name}`);try{const snap=await ref.put(f),url=await snap.ref.getDownloadURL();await db.collection('users').doc(uid).collection('assets').add({originalName:f.name,url,type:f.type,category:catId,createdAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(e){alert(e.message);}finally{ui.fileInput.value='';ui.uploadBtn.innerText="+ Ny";ui.uploadBtn.disabled=false;}}
function subscribeToAssets(uid){ASSET_CATEGORIES.forEach(c=>document.getElementById(`cat-list-${c.id}`).innerHTML='');AppState.unsubscribeAssets=db.collection('users').doc(uid).collection('assets').orderBy('createdAt','desc').onSnapshot(s=>{ASSET_CATEGORIES.forEach(c=>document.getElementById(`cat-list-${c.id}`).innerHTML='');if(s.empty)return;s.forEach(d=>renderAssetItem(d.data(),d.id,d.data().category||'char'));});}
function renderAssetItem(a,id,catId){const l=document.getElementById(`cat-list-${catId}`);if(!l)return;const li=document.createElement('li');li.className='asset-item';li.innerHTML=`<img src="${a.url}" class="asset-thumb"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;">${a.originalName}</span><button onclick="deleteAsset('${id}','${a.url}',event)" style="background:none;border:none;color:#f55;font-weight:bold;cursor:pointer;">X</button>`;li.onclick=()=>selectAsset(a,id,li);l.appendChild(li);}

function selectAsset(assetData, docId, li) {
    if(AppState.editorMode === 'level') {
        document.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected-item'));
        li.classList.add('selected-item');
        AppState.level.activeBrush = { ...assetData, id: docId };
        ui.inspector.innerHTML = `<div style="padding:10px;"><p style="font-size:12px;color:#aaa;text-transform:uppercase;">Valgt Pensel</p><div style="margin-top:10px;display:flex;align-items:center;"><img src="${assetData.url}" style="width:40px;height:40px;background:#333;margin-right:10px;object-fit:contain;"><b>${assetData.originalName}</b></div><hr style="border:0;border-top:1px solid #444;margin:15px 0;"><p style="font-size:11px;color:#888;">Klikk på rutenettet for å male.</p></div>`;
        return;
    }
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

window.openPreview=()=>{const f=getCurrentFrames();if(f.length===0)return alert("Ingen frames.");ui.previewModal.classList.remove('hidden');AppState.preview.active=true;AppState.preview.lastTime=performance.now();requestAnimationFrame(animatePreview);}
function closePreview(){ui.previewModal.classList.add('hidden');AppState.preview.active=false;}
function animatePreview(t){if(!AppState.preview.active)return;const d=getCurrentAnimData(),f=d.frames,fps=d.fps||8,interval=1000/fps;const dt=t-AppState.preview.lastTime;AppState.preview.lastTime=t;AppState.preview.accumulatedTime+=dt;if(AppState.preview.accumulatedTime>=interval){AppState.preview.frameIndex=(AppState.preview.frameIndex+1)%f.length;AppState.preview.accumulatedTime-=interval;}const ctx=ui.previewCanvas.getContext('2d'),w=ui.previewCanvas.width,h=ui.previewCanvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle=AppState.viewport.bgColor;ctx.fillRect(0,0,w,h);ctx.strokeStyle="rgba(255,255,255,0.2)";ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();const fr=f[AppState.preview.frameIndex],img=AppState.loadedImage;if(fr&&img){const sx=fr.x,sy=fr.y,sw=fr.w,sh=fr.h,pad=0.9,sc=Math.min((w*pad)/sw,(h*pad)/sh),dw=sw*sc,dh=sh*sc;const dx=(w-dw)/2,dy=(h-dh)/2;ctx.imageSmoothingEnabled=false;ctx.drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh);ctx.fillStyle="white";ctx.font="10px Arial";ctx.fillText(`F: ${AppState.preview.frameIndex+1}/${f.length}`,5,15);}requestAnimationFrame(animatePreview);}
async function createGif(){const d=getCurrentAnimData(),f=d.frames;if(f.length===0)return;ui.downloadGifBtn.innerText="Genererer...";try{const wr=await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'),wb=await wr.blob(),wu=URL.createObjectURL(wb),gif=new GIF({workers:2,quality:10,workerScript:wu,background:AppState.viewport.bgColor,width:f[0].w,height:f[0].h}),img=AppState.loadedImage,fps=d.fps||8;f.forEach(r=>{const c=document.createElement('canvas');c.width=r.w;c.height=r.h;const x=c.getContext('2d');x.fillStyle=AppState.viewport.bgColor;x.fillRect(0,0,r.w,r.h);x.drawImage(img,r.x,r.y,r.w,r.h,0,0,r.w,r.h);gif.addFrame(c,{delay:1000/fps});});gif.on('finished',b=>{const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`${AppState.selectedAsset.data.originalName}.gif`;a.click();ui.downloadGifBtn.innerText="Last ned GIF";});gif.render();}catch(e){console.error(e);ui.downloadGifBtn.innerText="Feil";}}

function updateInspector() {
    if(!ui.inspector) return;
    if(AppState.editorMode === 'level') {
        if(!AppState.level.activeBrush) ui.inspector.innerHTML=`<div style="padding:20px;text-align:center;color:#888;font-size:12px;">Velg en ting å bygge med.</div>`;
        return;
    }
    if (!AppState.loadedImage) { ui.inspector.innerHTML = `<div style="padding:20px; color:#888; text-align:center; font-size:12px;">Velg en tegning.</div>`; return; }
    const animName = AppState.currentAnimName; const frames = getCurrentFrames();
    let animOptions = ""; Object.keys(AppState.animations).forEach(k => { animOptions += `<option value="${k}" ${k === animName ? "selected" : ""}>${k}</option>`; });
    let framesListHtml = "";
    if (frames.length === 0) { framesListHtml = `<p style="padding:10px; font-style:italic; color:#666; font-size:11px;">Ingen frames.</p>`; } 
    else { frames.forEach((f, i) => { const isSel = i === AppState.selectedFrameIndex; framesListHtml += `<li class="${isSel ? "selected-item" : ""}" onclick="selectFrame(${i})"><span style="flex:1; font-size:12px;">Frame #${i+1}</span><button onclick="deleteFrame(${i}, event)" style="background:none; border:none; color:#ff6666; font-weight:bold; cursor:pointer;">✖</button></li>`; }); }
    ui.inspector.innerHTML = `<div class="inspector-section"><label class="inspector-label">Aktiv Animasjon</label><div class="anim-row"><select class="anim-select" onchange="changeAnimation(this.value)">${animOptions}</select><button class="small-btn" onclick="createNewAnimation()">+</button></div><button class="primary-btn" style="width:100%; margin-top:5px; font-size:12px;" onclick="openPreview()">▶ Spill av</button></div><div style="flex:1; display:flex; flex-direction:column; overflow:hidden;"><label class="inspector-label" style="padding:0 5px;">Frames (${frames.length})</label><ul id="frame-list" style="list-style:none; overflow-y:auto; flex:1; margin-top:5px; border-top:1px solid #333;">${framesListHtml}</ul></div><div style="margin-top:auto; padding-top:10px; border-top:1px solid #333; font-size:10px; color:#666;">Tips: Husk å trykke <b>Lagre</b>!</div>`;
}

/* Version: #24 */
