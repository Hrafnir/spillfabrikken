/* Version: #12 */

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    // Editor State
    selectedAsset: null,
    loadedImage: null,
    
    // Animation Data Structure
    // Format: { "Idle": [frame1, frame2], "Run": [frame1...] }
    animations: {}, 
    currentAnimName: "Idle", 
    
    // Selection / Interaction State
    selectedFrameIndex: -1, // Hvilken boks er valgt? (-1 = ingen)
    isDraggingFrame: false, // Driver vi og flytter på en boks?
    isDrawingNew: false,    // Driver vi og tegner en ny boks?
    
    dragStart: {x:0, y:0},  // Hvor musen var da vi startet å dra
    tempSelection: null,    // Den røde boksen under tegning
    
    // Viewport
    viewport: {
        zoom: 1.0,
        offsetX: 0, offsetY: 0,
        isPanning: false,
        lastMouseX: 0, lastMouseY: 0,
        bgColor: '#222222',
        activeTool: 'select'
    }
};

// Standard kategorier som foreslås
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

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if (ui.loginScreen.classList.contains('hidden') === false) return; // Ikke reager hvis logget ut

        if (e.key === '+' || e.key === '=') handleZoom(0.1);
        if (e.key === '-') handleZoom(-0.1);
        if (e.code === 'Space') if(AppState.viewport.activeTool !== 'pan') setTool('pan');
        
        // Slett valgt frame
        if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedFrameIndex !== -1) {
            deleteFrame(AppState.selectedFrameIndex);
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') setTool('select');
    });
}

// === CANVAS INTERACTION LOGIC ===

function initCanvas() {
    if(!ui.canvas) return;

    ui.canvas.addEventListener('mousedown', (e) => {
        const rect = ui.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const imgCoords = screenToImageCoords(mouseX, mouseY);

        // 1. PAN TOOL
        if (AppState.viewport.activeTool === 'pan') {
            AppState.viewport.isPanning = true;
            AppState.viewport.lastMouseX = e.clientX;
            AppState.viewport.lastMouseY = e.clientY;
            ui.canvas.style.cursor = "grabbing";
            return;
        }

        // 2. SELECT TOOL
        if (AppState.viewport.activeTool === 'select' && AppState.loadedImage) {
            
            // Sjekk om vi traff en eksisterende frame (Reverse loop for å velge den øverste først)
            const currentFrames = getCurrentFrames();
            let hitIndex = -1;
            
            for (let i = currentFrames.length - 1; i >= 0; i--) {
                const f = currentFrames[i];
                if (imgCoords.x >= f.x && imgCoords.x <= f.x + f.w &&
                    imgCoords.y >= f.y && imgCoords.y <= f.y + f.h) {
                    hitIndex = i;
                    break;
                }
            }

            if (hitIndex !== -1) {
                // TRAFF EN BOKS -> KLARGJØR FLYTTING
                AppState.selectedFrameIndex = hitIndex;
                AppState.isDraggingFrame = true;
                AppState.dragStart = imgCoords; // Lagre hvor vi trykket i bildet
                updateInspector(); // Oppdater UI for å vise at den er valgt
                drawCanvas();
            } else {
                // TRAFF INGENTING -> START TEGNING AV NY
                AppState.selectedFrameIndex = -1; // Deselect
                AppState.isDrawingNew = true;
                AppState.dragStart = imgCoords;
                AppState.tempSelection = { x: imgCoords.x, y: imgCoords.y, w: 0, h: 0 };
                updateInspector();
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        // Håndter Panorering
        if (AppState.viewport.isPanning) {
            const deltaX = e.clientX - AppState.viewport.lastMouseX;
            const deltaY = e.clientY - AppState.viewport.lastMouseY;
            AppState.viewport.offsetX += deltaX;
            AppState.viewport.offsetY += deltaY;
            AppState.viewport.lastMouseX = e.clientX;
            AppState.viewport.lastMouseY = e.clientY;
            drawCanvas();
            return;
        }

        const rect = ui.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const currentImgCoords = screenToImageCoords(mouseX, mouseY);

        // Håndter Flytting av Frame
        if (AppState.isDraggingFrame && AppState.selectedFrameIndex !== -1) {
            const frame = getCurrentFrames()[AppState.selectedFrameIndex];
            const deltaX = currentImgCoords.x - AppState.dragStart.x;
            const deltaY = currentImgCoords.y - AppState.dragStart.y;
            
            frame.x += deltaX;
            frame.y += deltaY;
            
            AppState.dragStart = currentImgCoords; // Reset for neste steg
            drawCanvas();
        }

        // Håndter Tegning av Ny
        if (AppState.isDrawingNew) {
            AppState.tempSelection.w = currentImgCoords.x - AppState.dragStart.x;
            AppState.tempSelection.h = currentImgCoords.y - AppState.dragStart.y;
            drawCanvas();
        }
    });

    window.addEventListener('mouseup', () => {
        AppState.viewport.isPanning = false;
        ui.canvas.style.cursor = AppState.viewport.activeTool === 'pan' ? "grab" : "default";

        // Ferdig med flytting
        if (AppState.isDraggingFrame) {
            AppState.isDraggingFrame = false;
            // TODO: Her burde vi lagre til Firebase (Autosave)
        }

        // Ferdig med tegning
        if (AppState.isDrawingNew) {
            AppState.isDrawingNew = false;
            let sel = AppState.tempSelection;
            
            // Normaliser (hvis dratt negativt)
            if (sel.w < 0) { sel.x += sel.w; sel.w = Math.abs(sel.w); }
            if (sel.h < 0) { sel.y += sel.h; sel.h = Math.abs(sel.h); }

            // Lagre hvis stor nok
            if (sel.w > 5 && sel.h > 5) {
                const list = getCurrentFrames();
                list.push(sel);
                AppState.selectedFrameIndex = list.length - 1; // Velg den nye
                updateInspector();
            }
            AppState.tempSelection = null;
            drawCanvas();
        }
    });
    
    ui.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        handleZoom(e.deltaY > 0 ? -0.1 : 0.1);
    });
}

// === ANIMATION & INSPECTOR LOGIC ===

function getCurrentFrames() {
    // Sørg for at array finnes
    if (!AppState.animations[AppState.currentAnimName]) {
        AppState.animations[AppState.currentAnimName] = [];
    }
    return AppState.animations[AppState.currentAnimName];
}

function updateInspector() {
    if (!AppState.loadedImage) {
        ui.inspector.innerHTML = `<p class="info-text">Ingen bilde valgt.</p>`;
        return;
    }

    const animName = AppState.currentAnimName;
    const frames = getCurrentFrames();

    // 1. Bygg dropdown for animasjoner
    let animOptions = "";
    Object.keys(AppState.animations).forEach(key => {
        const isSel = key === animName ? "selected" : "";
        animOptions += `<option value="${key}" ${isSel}>${key} (${AppState.animations[key].length})</option>`;
    });

    // 2. Bygg liste over frames
    let framesListHtml = "";
    if (frames.length === 0) {
        framesListHtml = `<p style="font-size:12px;color:#666;font-style:italic;text-align:center;padding:10px;">Ingen frames tegnet. Tegn en boks på bildet.</p>`;
    } else {
        frames.forEach((f, i) => {
            const isSel = i === AppState.selectedFrameIndex;
            const style = isSel ? "background:#007acc; border-color:#009eff;" : "background:#333; border-color:#444;";
            
            framesListHtml += `
            <li style="${style} padding:5px; margin-bottom:4px; border:1px solid; border-radius:4px; display:flex; align-items:center; justify-content:space-between;">
                <span onclick="selectFrame(${i})" style="cursor:pointer; flex:1; font-size:12px;">Frame #${i+1}</span>
                <div style="display:flex; gap:2px;">
                    <button class="small-btn" onclick="moveFrameOrder(${i}, -1)" title="Flytt opp">▲</button>
                    <button class="small-btn" onclick="moveFrameOrder(${i}, 1)" title="Flytt ned">▼</button>
                    <button class="small-btn" onclick="deleteFrame(${i})" style="color:#ff5555" title="Slett">✖</button>
                </div>
            </li>`;
        });
    }

    ui.inspector.innerHTML = `
        <div style="padding-bottom:10px; border-bottom:1px solid #444;">
            <label style="font-size:10px;color:#888;">AKTIV ANIMASJON</label>
            <div style="display:flex; gap:5px; margin-top:5px;">
                <select id="anim-selector" onchange="changeAnimation(this.value)" style="flex:1; background:#222; color:#fff; border:1px solid #444; padding:5px;">
                    ${animOptions}
                </select>
                <button class="small-btn" onclick="createNewAnimation()">+</button>
            </div>
        </div>

        <div style="margin-top:10px; flex:1; overflow-y:auto;">
            <label style="font-size:10px;color:#888;">FRAMES (${frames.length})</label>
            <ul style="list-style:none; margin-top:5px;">
                ${framesListHtml}
            </ul>
        </div>
        
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid #444; font-size:11px; color:#888;">
            <b>Tips:</b><br>
            • Tegn for å lage ny frame<br>
            • Klikk for å velge<br>
            • Dra for å flytte<br>
            • DEL for å slette
        </div>
    `;
}

// === EXPOSED FUNCTIONS FOR HTML (ONCLICK) ===
window.changeAnimation = (name) => {
    AppState.currentAnimName = name;
    AppState.selectedFrameIndex = -1; // Reset selection
    updateInspector();
    drawCanvas();
};

window.createNewAnimation = () => {
    const name = prompt("Navn på ny animasjon (f.eks. 'Attack'):");
    if (name && name.trim() !== "") {
        if (!AppState.animations[name]) {
            AppState.animations[name] = [];
            changeAnimation(name);
        } else {
            alert("Den finnes allerede!");
        }
    }
};

window.selectFrame = (index) => {
    AppState.selectedFrameIndex = index;
    updateInspector();
    drawCanvas();
};

window.deleteFrame = (index) => {
    const list = getCurrentFrames();
    list.splice(index, 1);
    AppState.selectedFrameIndex = -1;
    updateInspector();
    drawCanvas();
};

window.moveFrameOrder = (index, direction) => {
    const list = getCurrentFrames();
    const newIndex = index + direction;
    
    if (newIndex >= 0 && newIndex < list.length) {
        // Bytt plass
        const temp = list[index];
        list[index] = list[newIndex];
        list[newIndex] = temp;
        
        // Følg med valget
        AppState.selectedFrameIndex = newIndex;
        updateInspector();
        drawCanvas();
    }
};

// === RENDERING ENGINE ===

function drawCanvas() {
    const ctx = ui.canvas.getContext('2d');
    const w = ui.canvas.width; const h = ui.canvas.height;

    // Background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = AppState.viewport.bgColor;
    ctx.fillRect(0, 0, w, h);

    if (!AppState.loadedImage) return;

    // Camera Transform
    ctx.save();
    ctx.translate(w/2 + AppState.viewport.offsetX, h/2 + AppState.viewport.offsetY);
    ctx.scale(AppState.viewport.zoom, AppState.viewport.zoom);

    // Draw Image
    const img = AppState.loadedImage;
    const x = -img.width / 2; const y = -img.height / 2;
    ctx.drawImage(img, x, y);
    
    // Draw Frames
    const frames = getCurrentFrames();
    frames.forEach((f, i) => {
        const isSel = i === AppState.selectedFrameIndex;
        
        ctx.strokeStyle = isSel ? "#ffff00" : "#4cd137"; // Gul hvis valgt, grønn ellers
        ctx.lineWidth = (isSel ? 3 : 2) / AppState.viewport.zoom;
        ctx.strokeRect(x + f.x, y + f.y, f.w, f.h);
        
        // Fyll bittelitt for å vise hover/select tydeligere
        if (isSel) {
            ctx.fillStyle = "rgba(255, 255, 0, 0.2)";
            ctx.fillRect(x + f.x, y + f.y, f.w, f.h);
        }

        // Nummer
        ctx.fillStyle = isSel ? "#ffff00" : "#4cd137";
        ctx.font = `${12 / AppState.viewport.zoom}px Arial`;
        ctx.fillText("#"+(i+1), x + f.x, y + f.y - (4 / AppState.viewport.zoom));
    });

    // Temp Selection
    if (AppState.tempSelection) {
        ctx.strokeStyle = "#ff3333";
        ctx.setLineDash([5/AppState.viewport.zoom, 5/AppState.viewport.zoom]);
        ctx.strokeRect(x + AppState.tempSelection.x, y + AppState.tempSelection.y, AppState.tempSelection.w, AppState.tempSelection.h);
        ctx.setLineDash([]);
    }

    ctx.restore();
}

// === MATH & UTILS ===

function screenToImageCoords(screenX, screenY) {
    const zoom = AppState.viewport.zoom;
    const img = AppState.loadedImage;
    const drawX = (ui.canvas.width / 2) + AppState.viewport.offsetX - (img.width / 2 * zoom);
    const drawY = (ui.canvas.height / 2) + AppState.viewport.offsetY - (img.height / 2 * zoom);
    return { x: (screenX - drawX) / zoom, y: (screenY - drawY) / zoom };
}

function handleZoom(amount) {
    let z = AppState.viewport.zoom + amount;
    z = Math.max(0.1, Math.min(z, 10.0));
    AppState.viewport.zoom = Math.round(z * 10) / 10;
    ui.zoomLabel.innerText = Math.round(z * 100) + "%";
    drawCanvas();
}

function setTool(t) {
    AppState.viewport.activeTool = t;
    if(t==='select'){ui.toolSelect.classList.add('active');ui.toolPan.classList.remove('active');ui.canvas.style.cursor="default";}
    else{ui.toolSelect.classList.remove('active');ui.toolPan.classList.add('active');ui.canvas.style.cursor="grab";}
}

// === ASSET & BOILERPLATE ===

function selectAsset(asset, li) {
    ui.assetList.querySelectorAll('li').forEach(i => i.style.backgroundColor = "transparent");
    li.style.backgroundColor = "#007acc";
    AppState.selectedAsset = asset;
    
    // Initialiser animasjons-strukturen hvis den er tom
    // (Senere: Her laster vi fra DB)
    AppState.animations = {}; 
    DEFAULT_ANIMS.forEach(name => AppState.animations[name] = []);
    AppState.currentAnimName = "Idle";
    AppState.selectedFrameIndex = -1;

    const img = new Image(); img.crossOrigin = "Anonymous"; img.src = asset.url;
    img.onload = () => { AppState.loadedImage = img; drawCanvas(); updateInspector(); };
}

// Resten er uendret Auth/Upload boilerplate...
function initAuthListener(){auth.onAuthStateChanged(u=>{if(u){AppState.user=u;ui.statusMsg.innerText="Klar";setTimeout(()=>{transitionToEditor();subscribeToAssets(u.uid);},500);}else{AppState.user=null;if(AppState.unsubscribeAssets)AppState.unsubscribeAssets();transitionToLogin();}});}
function handleLogin(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.signInWithEmailAndPassword(e,p).catch(err=>showStatus(err.code,"error"));}
function handleRegister(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.createUserWithEmailAndPassword(e,p).then(()=>showStatus("OK","success")).catch(err=>showStatus(err.code,"error"));}
function handleGoogleLogin(){auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err=>console.error(err));}
function handleLogout(){auth.signOut();}
async function handleFileUpload(ev){
    const f=ev.target.files[0]; if(!f) return; if(!f.type.startsWith('image/')) return alert("Kun bilder");
    ui.uploadBtn.innerText="..."; ui.uploadBtn.disabled=true; const uid=AppState.user.uid, ref=storage.ref().child(`users/${uid}/assets/${Date.now()}_${f.name}`);
    try{const snap=await ref.put(f), url=await snap.ref.getDownloadURL(); await db.collection('users').doc(uid).collection('assets').add({originalName:f.name, url, type:f.type, createdAt:firebase.firestore.FieldValue.serverTimestamp()});}
    catch(e){alert(e.message);} finally {ui.fileInput.value=''; ui.uploadBtn.innerText="+ Last opp"; ui.uploadBtn.disabled=false;}
}
function subscribeToAssets(uid){
    ui.assetList.innerHTML='<li>Laster...</li>';
    AppState.unsubscribeAssets=db.collection('users').doc(uid).collection('assets').orderBy('createdAt','desc').onSnapshot(s=>{
        ui.assetList.innerHTML=''; s.forEach(d=>renderAssetItem(d.data(),d.id)); if(s.empty) ui.assetList.innerHTML='<li>Tomt</li>';
    });
}
function renderAssetItem(a,id){const li=document.createElement('li');li.innerHTML=`<img src="${a.url}" style="width:30px;height:30px;object-fit:contain;background:#222;margin-right:10px"><span>${a.originalName}</span>`;li.style.cssText="padding:5px;border-bottom:1px solid #333;display:flex;align-items:center;cursor:pointer";li.onclick=()=>selectAsset(a,li);ui.assetList.appendChild(li);}
function showStatus(m,t){ui.statusMsg.innerText=m;ui.statusMsg.style.color=t==="error"?"red":"green";}
function transitionToEditor(){ui.loginScreen.classList.add('hidden');ui.editorScreen.classList.remove('hidden');if(AppState.user)ui.projectName.innerText=AppState.user.email;}
function transitionToLogin(){ui.editorScreen.classList.add('hidden');ui.loginScreen.classList.remove('hidden');}

/* Version: #12 */
