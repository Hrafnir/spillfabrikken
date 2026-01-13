/* Version: #13 */

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    
    // Editor Data
    selectedAsset: null,
    loadedImage: null,
    animations: {}, 
    currentAnimName: "Idle", 
    
    // Selection & Interaction
    selectedFrameIndex: -1,
    
    // Interaction Modes
    mode: 'idle', // 'idle', 'drawing', 'dragging_frame', 'resizing_frame', 'dragging_anchor', 'panning'
    
    // Temp storage for interactions
    dragStart: {x:0, y:0},      // Mouse pos start
    initialFrame: null,         // Snapshot of frame before edit
    resizeHandle: null,         // 'tl', 'tr', 'bl', 'br' (Top-Left, etc.)
    tempSelection: null,        // Red box while drawing
    
    // Viewport
    viewport: {
        zoom: 1.0,
        offsetX: 0, offsetY: 0,
        lastMouseX: 0, lastMouseY: 0,
        bgColor: '#222222',
        activeTool: 'select'
    }
};

const DEFAULT_ANIMS = ["Idle", "Walk", "Run", "Jump", "Attack", "Hurt", "Die"];

// === DOM ELEMENTS ===
const ui = {
    loginScreen: document.getElementById('login-overlay'),
    editorScreen: document.getElementById('editor-ui'),
    loginBtn: document.getElementById('login-btn'),
    registerBtn: document.getElementById('register-btn'),
    googleBtn: document.getElementById('google-btn'),
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    statusMsg: document.getElementById('status-msg'),
    logoutBtn: document.getElementById('logout-btn'),
    
    projectName: document.getElementById('project-name'),
    uploadBtn: document.getElementById('upload-asset-btn'),
    fileInput: document.getElementById('asset-file-input'),
    assetList: document.getElementById('asset-list'),
    inspector: document.getElementById('inspector-content'),
    
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
    if (typeof auth === 'undefined') return;
    setupEventListeners();
    initCanvas();
    initAuthListener();
});

function setupEventListeners() {
    ui.loginBtn.onclick = handleLogin;
    ui.registerBtn.onclick = handleRegister;
    ui.googleBtn.onclick = handleGoogleLogin;
    ui.logoutBtn.onclick = handleLogout;
    ui.uploadBtn.onclick = () => ui.fileInput.click(); 
    ui.fileInput.onchange = handleFileUpload;

    ui.zoomInBtn.onclick = () => handleZoom(0.1);
    ui.zoomOutBtn.onclick = () => handleZoom(-0.1);
    ui.toolSelect.onclick = () => setTool('select');
    ui.toolPan.onclick = () => setTool('pan');
    ui.bgColorPicker.oninput = (e) => { AppState.viewport.bgColor = e.target.value; drawCanvas(); };

    window.addEventListener('keydown', (e) => {
        if (ui.loginScreen.classList.contains('hidden') === false) return;
        if (e.key === '+' || e.key === '=') handleZoom(0.1);
        if (e.key === '-') handleZoom(-0.1);
        if (e.code === 'Space') if(AppState.viewport.activeTool !== 'pan') setTool('pan');
        if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedFrameIndex !== -1) {
            deleteFrame(AppState.selectedFrameIndex);
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') setTool('select');
    });
}

// === CANVAS LOGIC (THE BRAIN) ===

function initCanvas() {
    if(!ui.canvas) return;

    ui.canvas.addEventListener('mousedown', (e) => {
        const mouse = getMousePos(e);
        const imgCoords = screenToImageCoords(mouse.x, mouse.y);
        
        AppState.viewport.lastMouseX = e.clientX;
        AppState.viewport.lastMouseY = e.clientY;

        // 1. PANNING
        if (AppState.viewport.activeTool === 'pan') {
            AppState.mode = 'panning';
            ui.canvas.style.cursor = "grabbing";
            return;
        }

        if (!AppState.loadedImage) return;

        // 2. CHECK INTERACTION WITH EXISTING FRAME
        if (AppState.selectedFrameIndex !== -1) {
            const frame = getCurrentFrames()[AppState.selectedFrameIndex];
            
            // A. Check Anchor Point (Pivot)
            const anchorScreen = imageToScreenCoords(frame.x + frame.anchor.x, frame.y + frame.anchor.y);
            if (dist(mouse.x, mouse.y, anchorScreen.x, anchorScreen.y) < 10) {
                AppState.mode = 'dragging_anchor';
                AppState.dragStart = imgCoords;
                AppState.initialFrame = JSON.parse(JSON.stringify(frame)); // Deep copy
                return;
            }

            // B. Check Resize Handles
            const handle = getResizeHandleHover(mouse.x, mouse.y, frame);
            if (handle) {
                AppState.mode = 'resizing_frame';
                AppState.resizeHandle = handle;
                AppState.dragStart = imgCoords;
                AppState.initialFrame = JSON.parse(JSON.stringify(frame));
                return;
            }
        }

        // C. Check Frame Body (Selection / Move)
        const hitIndex = getFrameAt(imgCoords.x, imgCoords.y);
        if (hitIndex !== -1) {
            AppState.selectedFrameIndex = hitIndex;
            AppState.mode = 'dragging_frame';
            AppState.dragStart = imgCoords;
            AppState.initialFrame = JSON.parse(JSON.stringify(getCurrentFrames()[hitIndex]));
            updateInspector();
            drawCanvas();
            return;
        }

        // 3. START DRAWING NEW
        AppState.selectedFrameIndex = -1;
        AppState.mode = 'drawing';
        AppState.dragStart = imgCoords;
        AppState.tempSelection = { x: imgCoords.x, y: imgCoords.y, w: 0, h: 0 };
        updateInspector();
        drawCanvas();
    });

    window.addEventListener('mousemove', (e) => {
        const mouse = getMousePos(e);
        const imgCoords = screenToImageCoords(mouse.x, mouse.y);

        // Cursor Updates (Hover effects)
        if (AppState.mode === 'idle' && AppState.selectedFrameIndex !== -1 && AppState.viewport.activeTool === 'select') {
             const frame = getCurrentFrames()[AppState.selectedFrameIndex];
             const handle = getResizeHandleHover(mouse.x, mouse.y, frame);
             if (handle) ui.canvas.style.cursor = handle + "-resize"; // e.g. "nw-resize"
             else ui.canvas.style.cursor = "default";
        }

        // LOGIC PER MODE
        if (AppState.mode === 'panning') {
            const dX = e.clientX - AppState.viewport.lastMouseX;
            const dY = e.clientY - AppState.viewport.lastMouseY;
            AppState.viewport.offsetX += dX;
            AppState.viewport.offsetY += dY;
            AppState.viewport.lastMouseX = e.clientX;
            AppState.viewport.lastMouseY = e.clientY;
            drawCanvas();
        }
        else if (AppState.mode === 'dragging_frame') {
            const frame = getCurrentFrames()[AppState.selectedFrameIndex];
            const dx = imgCoords.x - AppState.dragStart.x;
            const dy = imgCoords.y - AppState.dragStart.y;
            frame.x = AppState.initialFrame.x + dx;
            frame.y = AppState.initialFrame.y + dy;
            drawCanvas();
        }
        else if (AppState.mode === 'dragging_anchor') {
            const frame = getCurrentFrames()[AppState.selectedFrameIndex];
            // Anchor is relative to frame X/Y
            const dx = imgCoords.x - AppState.dragStart.x;
            const dy = imgCoords.y - AppState.dragStart.y;
            frame.anchor.x = AppState.initialFrame.anchor.x + dx;
            frame.anchor.y = AppState.initialFrame.anchor.y + dy;
            drawCanvas();
        }
        else if (AppState.mode === 'resizing_frame') {
            const frame = getCurrentFrames()[AppState.selectedFrameIndex];
            const dx = imgCoords.x - AppState.dragStart.x;
            const dy = imgCoords.y - AppState.dragStart.y;
            const init = AppState.initialFrame;
            
            // Math for resizing based on handle
            if (AppState.resizeHandle.includes('e')) frame.w = Math.max(1, init.w + dx);
            if (AppState.resizeHandle.includes('s')) frame.h = Math.max(1, init.h + dy);
            if (AppState.resizeHandle.includes('w')) {
                frame.x = Math.min(init.x + init.w - 1, init.x + dx);
                frame.w = Math.max(1, init.w - dx);
            }
            if (AppState.resizeHandle.includes('n')) {
                frame.y = Math.min(init.y + init.h - 1, init.y + dy);
                frame.h = Math.max(1, init.h - dy);
            }
            drawCanvas();
        }
        else if (AppState.mode === 'drawing') {
            AppState.tempSelection.w = imgCoords.x - AppState.dragStart.x;
            AppState.tempSelection.h = imgCoords.y - AppState.dragStart.y;
            drawCanvas();
        }
    });

    window.addEventListener('mouseup', () => {
        if (AppState.mode === 'panning') {
            ui.canvas.style.cursor = AppState.viewport.activeTool === 'pan' ? "grab" : "default";
        }
        
        if (AppState.mode === 'drawing') {
            let sel = AppState.tempSelection;
            // Normalize negative width/height
            if (sel.w < 0) { sel.x += sel.w; sel.w = Math.abs(sel.w); }
            if (sel.h < 0) { sel.y += sel.h; sel.h = Math.abs(sel.h); }

            if (sel.w > 2 && sel.h > 2) {
                const list = getCurrentFrames();
                // Add new frame with default Anchor (Bottom Center)
                list.push({
                    x: sel.x, y: sel.y, w: sel.w, h: sel.h,
                    anchor: { x: sel.w / 2, y: sel.h } 
                });
                AppState.selectedFrameIndex = list.length - 1;
                updateInspector();
            }
        }

        AppState.mode = 'idle';
        AppState.resizeHandle = null;
        AppState.tempSelection = null;
        drawCanvas();
    });
    
    ui.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        handleZoom(e.deltaY > 0 ? -0.1 : 0.1);
    });
}

// === MATH HELPER FUNCTIONS ===

function getMousePos(e) {
    const rect = ui.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function dist(x1, y1, x2, y2) { return Math.sqrt((x2-x1)**2 + (y2-y1)**2); }

function screenToImageCoords(sx, sy) {
    const zoom = AppState.viewport.zoom;
    const img = AppState.loadedImage;
    if(!img) return {x:0, y:0};
    const drawX = (ui.canvas.width/2) + AppState.viewport.offsetX - (img.width/2 * zoom);
    const drawY = (ui.canvas.height/2) + AppState.viewport.offsetY - (img.height/2 * zoom);
    return { x: (sx - drawX) / zoom, y: (sy - drawY) / zoom };
}

function imageToScreenCoords(ix, iy) {
    const zoom = AppState.viewport.zoom;
    const img = AppState.loadedImage;
    if(!img) return {x:0, y:0};
    const drawX = (ui.canvas.width/2) + AppState.viewport.offsetX - (img.width/2 * zoom);
    const drawY = (ui.canvas.height/2) + AppState.viewport.offsetY - (img.height/2 * zoom);
    return { x: drawX + (ix * zoom), y: drawY + (iy * zoom) };
}

function getFrameAt(ix, iy) {
    const frames = getCurrentFrames();
    // Check in reverse to hit top-most first
    for (let i = frames.length - 1; i >= 0; i--) {
        const f = frames[i];
        if (ix >= f.x && ix <= f.x + f.w && iy >= f.y && iy <= f.y + f.h) return i;
    }
    return -1;
}

function getResizeHandleHover(mx, my, frame) {
    const zoom = AppState.viewport.zoom;
    const margin = 8; // detection radius in pixels
    
    // Convert frame corners to screen space
    const tl = imageToScreenCoords(frame.x, frame.y);
    const tr = imageToScreenCoords(frame.x + frame.w, frame.y);
    const bl = imageToScreenCoords(frame.x, frame.y + frame.h);
    const br = imageToScreenCoords(frame.x + frame.w, frame.y + frame.h);
    
    if (dist(mx, my, tl.x, tl.y) < margin) return 'nw';
    if (dist(mx, my, tr.x, tr.y) < margin) return 'ne';
    if (dist(mx, my, bl.x, bl.y) < margin) return 'sw';
    if (dist(mx, my, br.x, br.y) < margin) return 'se';
    
    return null;
}

// === RENDERING ENGINE ===

function drawCanvas() {
    const ctx = ui.canvas.getContext('2d');
    const w = ui.canvas.width; const h = ui.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = AppState.viewport.bgColor;
    ctx.fillRect(0, 0, w, h);

    if (!AppState.loadedImage) {
        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.textAlign="center"; 
        ctx.font="20px Arial"; ctx.fillText("Velg et bilde for å starte", w/2, h/2);
        return; 
    }

    ctx.save();
    ctx.translate(w/2 + AppState.viewport.offsetX, h/2 + AppState.viewport.offsetY);
    ctx.scale(AppState.viewport.zoom, AppState.viewport.zoom);

    const img = AppState.loadedImage;
    const x = -img.width / 2; const y = -img.height / 2;
    ctx.drawImage(img, x, y);
    ctx.strokeStyle = "#444"; ctx.lineWidth = 1/AppState.viewport.zoom;
    ctx.strokeRect(x, y, img.width, img.height);

    // Draw Frames
    const frames = getCurrentFrames();
    frames.forEach((f, i) => {
        const isSel = i === AppState.selectedFrameIndex;
        ctx.strokeStyle = isSel ? "#ffff00" : "#4cd137";
        ctx.lineWidth = (isSel ? 2 : 1) / AppState.viewport.zoom;
        ctx.strokeRect(x + f.x, y + f.y, f.w, f.h);

        // Draw Anchor Point (Blue Cross)
        if (f.anchor) {
            const ax = x + f.x + f.anchor.x;
            const ay = y + f.y + f.anchor.y;
            const size = 5 / AppState.viewport.zoom;
            ctx.strokeStyle = "#00ffff"; // Cyan
            ctx.beginPath();
            ctx.moveTo(ax - size, ay); ctx.lineTo(ax + size, ay);
            ctx.moveTo(ax, ay - size); ctx.lineTo(ax, ay + size);
            ctx.stroke();
        }

        // Draw Resize Handles (White squares) if selected
        if (isSel) {
            ctx.fillStyle = "#ffffff";
            const hSize = 4 / AppState.viewport.zoom;
            const corners = [
                {cx: x+f.x, cy: y+f.y}, 
                {cx: x+f.x+f.w, cy: y+f.y},
                {cx: x+f.x, cy: y+f.y+f.h}, 
                {cx: x+f.x+f.w, cy: y+f.y+f.h}
            ];
            corners.forEach(c => ctx.fillRect(c.cx - hSize, c.cy - hSize, hSize*2, hSize*2));
        }

        // Draw Number
        ctx.fillStyle = isSel ? "#ffff00" : "#4cd137";
        ctx.font = `${10 / AppState.viewport.zoom}px Arial`;
        ctx.fillText("#"+(i+1), x + f.x, y + f.y - (3 / AppState.viewport.zoom));
    });

    // Drawing Temp Selection
    if (AppState.tempSelection) {
        ctx.strokeStyle = "#ff3333";
        ctx.setLineDash([5/AppState.viewport.zoom, 5/AppState.viewport.zoom]);
        ctx.strokeRect(x + AppState.tempSelection.x, y + AppState.tempSelection.y, AppState.tempSelection.w, AppState.tempSelection.h);
        ctx.setLineDash([]);
    }
    ctx.restore();
}

// === INSPECTOR & DATA ===

function getCurrentFrames() {
    if (!AppState.animations[AppState.currentAnimName]) AppState.animations[AppState.currentAnimName] = [];
    return AppState.animations[AppState.currentAnimName];
}

function updateInspector() {
    if (!AppState.loadedImage) {
        ui.inspector.innerHTML = `<div style="padding:10px; color:#888;">Velg en tegning fra venstre meny for å starte.</div>`;
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
        framesListHtml = `<p style="padding:10px; font-style:italic; color:#666;">Ingen frames. Tegn en boks!</p>`;
    } else {
        frames.forEach((f, i) => {
            const isSel = i === AppState.selectedFrameIndex;
            const bg = isSel ? "#007acc" : "#333";
            framesListHtml += `
            <li style="background:${bg}; padding:5px; margin-bottom:2px; border-radius:3px; display:flex; justify-content:space-between; align-items:center;">
                <span onclick="selectFrame(${i})" style="cursor:pointer; flex:1;">Frame #${i+1}</span>
                <span style="font-size:10px; color:#ccc; margin-right:5px;">${Math.round(f.w)}x${Math.round(f.h)}</span>
                <button onclick="deleteFrame(${i})" style="background:none; border:none; color:#ff6666; cursor:pointer;">✖</button>
            </li>`;
        });
    }

    ui.inspector.innerHTML = `
        <div style="border-bottom:1px solid #444; padding-bottom:10px;">
            <label style="font-size:10px; color:#888;">ANIMASJON</label>
            <div style="display:flex; gap:5px; margin-top:5px;">
                <select onchange="changeAnimation(this.value)" style="flex:1; background:#222; color:white; border:1px solid #444; padding:5px;">${animOptions}</select>
                <button onclick="createNewAnimation()" class="small-btn">+</button>
            </div>
        </div>
        <div style="margin-top:10px; overflow-y:auto; flex:1;">
             <label style="font-size:10px; color:#888;">FRAMES (${frames.length})</label>
             <ul style="list-style:none; margin-top:5px;">${framesListHtml}</ul>
        </div>
    `;
}

// === EXPOSED FUNCTIONS ===
window.changeAnimation = (name) => { AppState.currentAnimName = name; AppState.selectedFrameIndex = -1; updateInspector(); drawCanvas(); };
window.createNewAnimation = () => { const n = prompt("Navn:"); if(n && !AppState.animations[n]){ AppState.animations[n]=[]; changeAnimation(n); }};
window.selectFrame = (i) => { AppState.selectedFrameIndex = i; updateInspector(); drawCanvas(); };
window.deleteFrame = (i) => { getCurrentFrames().splice(i, 1); AppState.selectedFrameIndex = -1; updateInspector(); drawCanvas(); };

// === ASSET DELETION (NYTT) ===
window.deleteAsset = async (docId, fileUrl, event) => {
    event.stopPropagation(); // Stop click form selecting item
    if(!confirm("Er du sikker på at du vil slette denne tegningen?")) return;
    
    try {
        // 1. Delete from Storage
        const ref = firebase.storage().refFromURL(fileUrl);
        await ref.delete();
        // 2. Delete from Firestore
        await db.collection('users').doc(AppState.user.uid).collection('assets').doc(docId).delete();
    } catch(e) { console.error(e); alert("Kunne ikke slette: " + e.message); }
};

// === STANDARD BOILERPLATE ===
function selectAsset(asset, li) {
    ui.assetList.querySelectorAll('li').forEach(i => i.style.backgroundColor = "transparent");
    li.style.backgroundColor = "#007acc";
    AppState.selectedAsset = asset;
    AppState.animations = {}; DEFAULT_ANIMS.forEach(n => AppState.animations[n] = []);
    AppState.currentAnimName = "Idle"; AppState.selectedFrameIndex = -1;
    const img = new Image(); img.crossOrigin = "Anonymous"; img.src = asset.url;
    img.onload = () => { AppState.loadedImage = img; drawCanvas(); updateInspector(); };
}

function initAuthListener(){auth.onAuthStateChanged(u=>{if(u){AppState.user=u;ui.statusMsg.innerText="Klar";setTimeout(()=>{transitionToEditor();subscribeToAssets(u.uid);},500);}else{AppState.user=null;if(AppState.unsubscribeAssets)AppState.unsubscribeAssets();transitionToLogin();}});}
function handleLogin(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.signInWithEmailAndPassword(e,p).catch(err=>showStatus(err.code,"error"));}
function handleRegister(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.createUserWithEmailAndPassword(e,p).then(()=>showStatus("OK","success")).catch(err=>showStatus(err.code,"error"));}
function handleGoogleLogin(){auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err=>console.error(err));}
function handleLogout(){auth.signOut();}
async function handleFileUpload(ev){const f=ev.target.files[0];if(!f)return;if(!f.type.startsWith('image/'))return alert("Kun bilder");ui.uploadBtn.innerText="...";ui.uploadBtn.disabled=true;const uid=AppState.user.uid, ref=storage.ref().child(`users/${uid}/assets/${Date.now()}_${f.name}`);try{const snap=await ref.put(f),url=await snap.ref.getDownloadURL();await db.collection('users').doc(uid).collection('assets').add({originalName:f.name,url,type:f.type,createdAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(e){alert(e.message);}finally{ui.fileInput.value='';ui.uploadBtn.innerText="+ Last opp";ui.uploadBtn.disabled=false;}}
function subscribeToAssets(uid){ui.assetList.innerHTML='<li>Laster...</li>';AppState.unsubscribeAssets=db.collection('users').doc(uid).collection('assets').orderBy('createdAt','desc').onSnapshot(s=>{ui.assetList.innerHTML='';s.forEach(d=>renderAssetItem(d.data(),d.id));if(s.empty)ui.assetList.innerHTML='<li>Tomt</li>';});}
function renderAssetItem(a,id){
    const li=document.createElement('li');
    li.innerHTML=`
        <div style="display:flex;align-items:center;flex:1;">
            <img src="${a.url}" style="width:30px;height:30px;object-fit:contain;background:#222;margin-right:10px">
            <span style="font-size:13px;">${a.originalName}</span>
        </div>
        <button onclick="deleteAsset('${id}', '${a.url}', event)" style="background:none;border:none;color:#ff5555;font-weight:bold;cursor:pointer;padding:5px;">X</button>
    `;
    li.style.cssText="padding:5px;border-bottom:1px solid #333;display:flex;align-items:center;cursor:pointer;justify-content:space-between;";
    li.onclick=()=>selectAsset(a,li);
    ui.assetList.appendChild(li);
}
function showStatus(m,t){ui.statusMsg.innerText=m;ui.statusMsg.style.color=t==="error"?"red":"green";}
function transitionToEditor(){ui.loginScreen.classList.add('hidden');ui.editorScreen.classList.remove('hidden');if(AppState.user)ui.projectName.innerText=AppState.user.email;}
function transitionToLogin(){ui.editorScreen.classList.add('hidden');ui.loginScreen.classList.remove('hidden');}
// Math
function getMousePos(e){const r=ui.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function dist(x1,y1,x2,y2){return Math.sqrt((x2-x1)**2+(y2-y1)**2);}
function screenToImageCoords(sx,sy){const z=AppState.viewport.zoom,img=AppState.loadedImage;if(!img)return{x:0,y:0};const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z);const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);return{x:(sx-dx)/z,y:(sy-dy)/z};}
function imageToScreenCoords(ix,iy){const z=AppState.viewport.zoom,img=AppState.loadedImage;if(!img)return{x:0,y:0};const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z);const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);return{x:dx+(ix*z),y:dy+(iy*z)};}
function getFrameAt(ix,iy){const fs=getCurrentFrames();for(let i=fs.length-1;i>=0;i--){const f=fs[i];if(ix>=f.x&&ix<=f.x+f.w&&iy>=f.y&&iy<=f.y+f.h)return i;}return -1;}
function getResizeHandleHover(mx,my,f){const z=AppState.viewport.zoom,m=8;const tl=imageToScreenCoords(f.x,f.y),tr=imageToScreenCoords(f.x+f.w,f.y),bl=imageToScreenCoords(f.x,f.y+f.h),br=imageToScreenCoords(f.x+f.w,f.y+f.h);if(dist(mx,my,tl.x,tl.y)<m)return'nw';if(dist(mx,my,tr.x,tr.y)<m)return'ne';if(dist(mx,my,bl.x,bl.y)<m)return'sw';if(dist(mx,my,br.x,br.y)<m)return'se';return null;}
function setTool(t){AppState.viewport.activeTool=t;if(t==='select'){ui.toolSelect.classList.add('active');ui.toolPan.classList.remove('active');ui.canvas.style.cursor="default";}else{ui.toolSelect.classList.remove('active');ui.toolPan.classList.add('active');ui.canvas.style.cursor="grab";}}
function handleZoom(a){let z=AppState.viewport.zoom+a;z=Math.max(0.1,Math.min(z,10.0));AppState.viewport.zoom=Math.round(z*10)/10;ui.zoomLabel.innerText=Math.round(z*100)+"%";drawCanvas();}

/* Version: #13 */
