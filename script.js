/* Version: #11 */

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    currentProject: null,
    editorMode: 'edit',
    unsubscribeAssets: null,
    
    // Editor State
    selectedAsset: null,
    loadedImage: null,
    
    // Animation State (NYTT)
    frames: [],             // Liste over definerte frames (x,y,w,h)
    tempSelection: null,    // Den boksen du tegner akkurat nå
    isSelecting: false,     // Holder du musen inne for å tegne?
    selectionStart: {x:0, y:0}, 
    
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
    if (typeof auth === 'undefined') {
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

    // Viewport Tools (Buttons)
    ui.zoomInBtn.onclick = () => handleZoom(0.1);
    ui.zoomOutBtn.onclick = () => handleZoom(-0.1);
    
    ui.toolSelect.onclick = () => setTool('select');
    ui.toolPan.onclick = () => setTool('pan');
    
    ui.bgColorPicker.oninput = (e) => {
        AppState.viewport.bgColor = e.target.value;
        drawCanvas();
    };

    // Keyboard Shortcuts (NYTT)
    window.addEventListener('keydown', (e) => {
        if (e.key === '+' || e.key === '=') handleZoom(0.1);
        if (e.key === '-') handleZoom(-0.1);
        if (e.code === 'Space') {
            if(AppState.viewport.activeTool !== 'pan') setTool('pan');
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') setTool('select'); // Gå tilbake til select når space slippes
    });
}

// === VIEWPORT LOGIC ===

function initCanvas() {
    if(!ui.canvas) return;

    ui.canvas.addEventListener('mousedown', (e) => {
        const rect = ui.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (AppState.viewport.activeTool === 'pan') {
            AppState.viewport.isDragging = true;
            AppState.viewport.lastMouseX = e.clientX;
            AppState.viewport.lastMouseY = e.clientY;
            ui.canvas.style.cursor = "grabbing";
        } 
        else if (AppState.viewport.activeTool === 'select' && AppState.loadedImage) {
            // Start Selection Drawing (NYTT)
            const imgCoords = screenToImageCoords(mouseX, mouseY);
            
            AppState.isSelecting = true;
            AppState.selectionStart = imgCoords;
            AppState.tempSelection = { x: imgCoords.x, y: imgCoords.y, w: 0, h: 0 };
        }
    });

    window.addEventListener('mousemove', (e) => {
        // Håndter Panorering (Flytte bildet)
        if (AppState.viewport.isDragging && AppState.viewport.activeTool === 'pan') {
            const deltaX = e.clientX - AppState.viewport.lastMouseX;
            const deltaY = e.clientY - AppState.viewport.lastMouseY;
            AppState.viewport.offsetX += deltaX;
            AppState.viewport.offsetY += deltaY;
            AppState.viewport.lastMouseX = e.clientX;
            AppState.viewport.lastMouseY = e.clientY;
            drawCanvas();
        }
        
        // Håndter Tegning av boks (NYTT)
        if (AppState.isSelecting && AppState.viewport.activeTool === 'select') {
            const rect = ui.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const currentImgCoords = screenToImageCoords(mouseX, mouseY);
            
            // Beregn bredde/høyde basert på startpunktet
            AppState.tempSelection.w = currentImgCoords.x - AppState.selectionStart.x;
            AppState.tempSelection.h = currentImgCoords.y - AppState.selectionStart.y;
            
            drawCanvas();
        }
    });

    window.addEventListener('mouseup', () => {
        // Avslutt Panorering
        if (AppState.viewport.isDragging) {
            AppState.viewport.isDragging = false;
            ui.canvas.style.cursor = AppState.viewport.activeTool === 'pan' ? "grab" : "default";
        }
        
        // Avslutt Tegning (NYTT)
        if (AppState.isSelecting) {
            AppState.isSelecting = false;
            
            // Normaliser boksen (hvis man dro musen baklengs)
            let sel = AppState.tempSelection;
            if (sel.w < 0) { sel.x += sel.w; sel.w = Math.abs(sel.w); }
            if (sel.h < 0) { sel.y += sel.h; sel.h = Math.abs(sel.h); }
            
            // Lagre bare hvis boksen er stor nok (> 5px)
            if (sel.w > 5 && sel.h > 5) {
                console.log("Frame created:", sel);
                AppState.frames.push(sel); // Legg til i listen
                updateInspector(AppState.selectedAsset, AppState.loadedImage); // Oppdater listen
            }
            
            AppState.tempSelection = null; // Fjern den midlertidige røde streken
            drawCanvas();
        }
    });
    
    ui.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        handleZoom(e.deltaY > 0 ? -0.1 : 0.1);
    });

    drawCanvas();
}

// === MATH: COORDINATE SYSTEMS (CRITICAL) ===

function screenToImageCoords(screenX, screenY) {
    // 1. Juster for sentrering og panorering
    // ScreenX = Width/2 + OffsetX + (ImageX * Zoom) - (ImageWidth/2 * Zoom)
    // Vi må snu på denne formelen for å finne ImageX.
    
    const canvasW = ui.canvas.width;
    const canvasH = ui.canvas.height;
    const zoom = AppState.viewport.zoom;
    const img = AppState.loadedImage;
    
    // Startpunkt for tegning (øverste venstre hjørne av bildet på skjermen)
    const drawX = (canvasW / 2) + AppState.viewport.offsetX - (img.width / 2 * zoom);
    const drawY = (canvasH / 2) + AppState.viewport.offsetY - (img.height / 2 * zoom);
    
    // Hvor er musen relativt til dette hjørnet?
    const relativeX = screenX - drawX;
    const relativeY = screenY - drawY;
    
    // Skaler ned igjen for å finne piksel-koordinat i originalbildet
    return {
        x: relativeX / zoom,
        y: relativeY / zoom
    };
}

function imageToScreenCoords(imgX, imgY) {
    const canvasW = ui.canvas.width;
    const canvasH = ui.canvas.height;
    const zoom = AppState.viewport.zoom;
    const img = AppState.loadedImage;
    
    const drawX = (canvasW / 2) + AppState.viewport.offsetX - (img.width / 2 * zoom);
    const drawY = (canvasH / 2) + AppState.viewport.offsetY - (img.height / 2 * zoom);
    
    return {
        x: drawX + (imgX * zoom),
        y: drawY + (imgY * zoom),
        w: (imgX + 10) * zoom - (imgX * zoom) // Eksempel
    };
}

function setTool(toolName) {
    AppState.viewport.activeTool = toolName;
    if (toolName === 'select') {
        ui.toolSelect.classList.add('active'); ui.toolPan.classList.remove('active');
        ui.canvas.style.cursor = "default";
    } else {
        ui.toolSelect.classList.remove('active'); ui.toolPan.classList.add('active');
        ui.canvas.style.cursor = "grab";
    }
}

function handleZoom(amount) {
    let newZoom = AppState.viewport.zoom + amount;
    newZoom = Math.max(0.1, Math.min(newZoom, 10.0)); // Økt maks zoom til 10x
    AppState.viewport.zoom = Math.round(newZoom * 10) / 10;
    ui.zoomLabel.innerText = Math.round(AppState.viewport.zoom * 100) + "%";
    drawCanvas();
}

// === RENDERING ===

function drawCanvas() {
    const ctx = ui.canvas.getContext('2d');
    const w = ui.canvas.width;
    const h = ui.canvas.height;

    // 1. Background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = AppState.viewport.bgColor;
    ctx.fillRect(0, 0, w, h);

    if (!AppState.loadedImage) { drawPlaceholder(ctx, w, h); return; }

    // 2. Transform Camera
    ctx.save();
    ctx.translate(w/2 + AppState.viewport.offsetX, h/2 + AppState.viewport.offsetY);
    ctx.scale(AppState.viewport.zoom, AppState.viewport.zoom);

    // 3. Draw Image (Centered at 0,0 locally)
    const img = AppState.loadedImage;
    const x = -img.width / 2;
    const y = -img.height / 2;
    ctx.drawImage(img, x, y);
    
    // Draw Image Border
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1 / AppState.viewport.zoom;
    ctx.strokeRect(x, y, img.width, img.height);
    
    // 4. Draw Defined Frames (Saved Rectangles) (NYTT)
    ctx.strokeStyle = "#4cd137"; // Grønn for ferdige frames
    ctx.lineWidth = 2 / AppState.viewport.zoom;
    
    AppState.frames.forEach((frame, index) => {
        // Husk: frame.x er relativt til bildet (0,0 er topp-venstre i bildet).
        // Men vi tegner relativt til senter (-width/2, -height/2).
        ctx.strokeRect(x + frame.x, y + frame.y, frame.w, frame.h);
        
        // Tegn nummer
        ctx.fillStyle = "#4cd137";
        ctx.font = `${12 / AppState.viewport.zoom}px Arial`;
        ctx.fillText("#"+(index+1), x + frame.x, y + frame.y - (4 / AppState.viewport.zoom));
    });

    // 5. Draw Temp Selection (Red Box being drawn) (NYTT)
    if (AppState.tempSelection) {
        ctx.strokeStyle = "#ff3333";
        ctx.setLineDash([5 / AppState.viewport.zoom, 5 / AppState.viewport.zoom]); // Stiplet linje
        ctx.strokeRect(x + AppState.tempSelection.x, y + AppState.tempSelection.y, AppState.tempSelection.w, AppState.tempSelection.h);
        ctx.setLineDash([]);
    }

    ctx.restore();
}

function drawPlaceholder(ctx, w, h) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '20px Segoe UI';
    ctx.fillText("Velg en tegning", w/2, h/2);
}

// === ASSET SELECTION ===

function selectAsset(asset, li) {
    ui.assetList.querySelectorAll('li').forEach(i => i.style.backgroundColor = "transparent");
    li.style.backgroundColor = "#007acc";
    AppState.selectedAsset = asset;
    
    // Reset state for new image
    AppState.viewport.zoom = 1.0;
    AppState.viewport.offsetX = 0; AppState.viewport.offsetY = 0;
    ui.zoomLabel.innerText = "100%";
    AppState.frames = []; // Tøm frames listen for nytt bilde (senere henter vi disse fra DB)

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = asset.url;
    img.onload = () => {
        AppState.loadedImage = img;
        drawCanvas();
        updateInspector(asset, img);
    };
}

function updateInspector(asset, img) {
    // Generer liste over frames
    let framesHtml = "";
    if (AppState.frames.length > 0) {
        framesHtml = `<ul style="margin-top:10px; list-style:none;">`;
        AppState.frames.forEach((f, i) => {
            framesHtml += `
                <li style="background:#333; padding:5px; margin-bottom:2px; font-size:12px; display:flex; justify-content:space-between;">
                    <span>Frame #${i+1}</span>
                    <span style="color:#888;">${Math.round(f.w)}x${Math.round(f.h)}</span>
                </li>`;
        });
        framesHtml += `</ul>`;
    } else {
        framesHtml = `<p style="font-size:12px; color:#666; font-style:italic; margin-top:10px;">Ingen frames definert. Bruk musen til å tegne bokser på bildet.</p>`;
    }

    ui.inspector.innerHTML = `
        <h3>Animasjon</h3>
        <div style="margin-top: 15px;">
            <label style="font-size: 10px; color: #888;">KILDEFIL</label>
            <p style="font-weight: bold;">${asset.originalName}</p>
            
            <label style="font-size: 10px; color: #888; margin-top:10px; display:block;">FRAMES (${AppState.frames.length})</label>
            ${framesHtml}
        </div>
    `;
}

// === STANDARD BOILERPLATE (Auth, Upload etc) beholdes likt ===
function initAuthListener() {
    auth.onAuthStateChanged(u => {
        if(u) { AppState.user=u; ui.statusMsg.innerText="Klar"; setTimeout(()=>{transitionToEditor(); subscribeToAssets(u.uid);},500); }
        else { AppState.user=null; if(AppState.unsubscribeAssets) AppState.unsubscribeAssets(); transitionToLogin(); }
    });
}
function handleLogin() { const e=ui.emailInput.value, p=ui.passwordInput.value; auth.signInWithEmailAndPassword(e,p).catch(err=>showStatus(err.code,"error")); }
function handleRegister() { const e=ui.emailInput.value, p=ui.passwordInput.value; auth.createUserWithEmailAndPassword(e,p).then(()=>showStatus("OK","success")).catch(err=>showStatus(err.code,"error")); }
function handleGoogleLogin() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err=>console.error(err)); }
function handleLogout() { auth.signOut(); }
async function handleFileUpload(ev) {
    const f=ev.target.files[0]; if(!f) return;
    if(!f.type.startsWith('image/')) return alert("Kun bilder");
    ui.uploadBtn.innerText="..."; ui.uploadBtn.disabled=true;
    const uid=AppState.user.uid, ref=storage.ref().child(`users/${uid}/assets/${Date.now()}_${f.name}`);
    try { const snap=await ref.put(f), url=await snap.ref.getDownloadURL();
    await db.collection('users').doc(uid).collection('assets').add({originalName:f.name, url, type:f.type, createdAt:firebase.firestore.FieldValue.serverTimestamp()}); }
    catch(e){alert(e.message);} finally {ui.fileInput.value=''; ui.uploadBtn.innerText="+ Last opp"; ui.uploadBtn.disabled=false;}
}
function subscribeToAssets(uid) {
    ui.assetList.innerHTML='<li>Laster...</li>';
    AppState.unsubscribeAssets=db.collection('users').doc(uid).collection('assets').orderBy('createdAt','desc').onSnapshot(s=>{
        ui.assetList.innerHTML=''; s.forEach(d=>renderAssetItem(d.data(),d.id)); if(s.empty) ui.assetList.innerHTML='<li>Tomt</li>';
    });
}
function renderAssetItem(a,id) {
    const li=document.createElement('li'); li.innerHTML=`<img src="${a.url}" style="width:30px;height:30px;object-fit:contain;background:#222;margin-right:10px"><span>${a.originalName}</span>`;
    li.style.cssText="padding:5px;border-bottom:1px solid #333;display:flex;align-items:center;cursor:pointer";
    li.onclick=()=>selectAsset(a,li); ui.assetList.appendChild(li);
}
function showStatus(m,t){ ui.statusMsg.innerText=m; ui.statusMsg.style.color=t==="error"?"red":"green"; }
function transitionToEditor(){ui.loginScreen.classList.add('hidden');ui.editorScreen.classList.remove('hidden');if(AppState.user)ui.projectName.innerText=AppState.user.email;}
function transitionToLogin(){ui.editorScreen.classList.add('hidden');ui.loginScreen.classList.remove('hidden');}

/* Version: #11 */
