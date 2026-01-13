/* Version: #14 */

// === GLOBAL APP STATE ===
const AppState = {
    user: null,
    
    // Editor Data
    selectedAsset: null,
    loadedImage: null,
    animations: {},     // { "Idle": [...], "Run": [...] }
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
    // Basic
    loginScreen: document.getElementById('login-overlay'),
    editorScreen: document.getElementById('editor-ui'),
    statusMsg: document.getElementById('status-msg'),
    
    // Editor Panels
    inspector: document.getElementById('inspector-content'), // VIKTIG
    assetList: document.getElementById('asset-list'),
    canvas: document.getElementById('game-canvas'),
    
    // Inputs/Buttons
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    projectName: document.getElementById('project-name'),
    uploadBtn: document.getElementById('upload-asset-btn'),
    fileInput: document.getElementById('asset-file-input'),
    
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
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') setTool('select'); });
}

// === CANVAS LOGIC ===
function initCanvas() {
    if(!ui.canvas) return;

    ui.canvas.addEventListener('mousedown', (e) => {
        const mouse = getMousePos(e);
        const imgCoords = screenToImageCoords(mouse.x, mouse.y);
        AppState.viewport.lastMouseX = e.clientX;
        AppState.viewport.lastMouseY = e.clientY;

        // 1. Pan
        if (AppState.viewport.activeTool === 'pan') {
            AppState.mode = 'panning'; ui.canvas.style.cursor = "grabbing"; return;
        }
        
        if (!AppState.loadedImage) return;

        // 2. Interact with existing frame
        if (AppState.selectedFrameIndex !== -1) {
            const frame = getCurrentFrames()[AppState.selectedFrameIndex];
            
            // Check Anchor
            const anchorScreen = imageToScreenCoords(frame.x + frame.anchor.x, frame.y + frame.anchor.y);
            if (dist(mouse.x, mouse.y, anchorScreen.x, anchorScreen.y) < 10) {
                AppState.mode = 'dragging_anchor'; AppState.dragStart = imgCoords;
                AppState.initialFrame = JSON.parse(JSON.stringify(frame)); return;
            }
            // Check Resize
            const handle = getResizeHandleHover(mouse.x, mouse.y, frame);
            if (handle) {
                AppState.mode = 'resizing_frame'; AppState.resizeHandle = handle;
                AppState.dragStart = imgCoords; AppState.initialFrame = JSON.parse(JSON.stringify(frame)); return;
            }
        }

        // 3. Hit test or New
        const hitIndex = getFrameAt(imgCoords.x, imgCoords.y);
        if (hitIndex !== -1) {
            AppState.selectedFrameIndex = hitIndex;
            AppState.mode = 'dragging_frame';
            AppState.dragStart = imgCoords;
            AppState.initialFrame = JSON.parse(JSON.stringify(getCurrentFrames()[hitIndex]));
            updateInspector(); drawCanvas();
        } else {
            AppState.selectedFrameIndex = -1;
            AppState.mode = 'drawing';
            AppState.dragStart = imgCoords;
            AppState.tempSelection = { x: imgCoords.x, y: imgCoords.y, w: 0, h: 0 };
            updateInspector(); drawCanvas();
        }
    });

    window.addEventListener('mousemove', (e) => {
        const mouse = getMousePos(e);
        const imgCoords = screenToImageCoords(mouse.x, mouse.y);

        // Cursor style
        if (AppState.mode === 'idle' && AppState.selectedFrameIndex !== -1 && AppState.viewport.activeTool === 'select') {
             const f = getCurrentFrames()[AppState.selectedFrameIndex];
             const h = getResizeHandleHover(mouse.x, mouse.y, f);
             ui.canvas.style.cursor = h ? h + "-resize" : "default";
        }

        // Interaction
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

// === INSPECTOR (MENYEN TIL HØYRE) ===

function getCurrentFrames() {
    if(!AppState.animations[AppState.currentAnimName]) AppState.animations[AppState.currentAnimName] = [];
    return AppState.animations[AppState.currentAnimName];
}

function updateInspector() {
    // 1. Sjekk om containeren finnes
    if (!ui.inspector) { console.error("Missing inspector element!"); return; }

    // 2. Hvis ingen bilde er lastet
    if (!AppState.loadedImage) {
        ui.inspector.innerHTML = `<div style="padding:20px; color:#888; text-align:center;">Velg en tegning fra venstre meny for å begynne.</div>`;
        return;
    }

    const animName = AppState.currentAnimName;
    const frames = getCurrentFrames();

    // 3. Bygg Animasjons-Dropdown
    let animOptions = "";
    Object.keys(AppState.animations).forEach(k => {
        animOptions += `<option value="${k}" ${k === animName ? "selected" : ""}>${k}</option>`;
    });

    // 4. Bygg Frame List
    let framesListHtml = "";
    if (frames.length === 0) {
        framesListHtml = `<p style="padding:10px; font-style:italic; color:#666; font-size:12px;">Ingen frames definert.<br>Tegn en boks på bildet.</p>`;
    } else {
        frames.forEach((f, i) => {
            const isSel = i === AppState.selectedFrameIndex;
            const cssClass = isSel ? "selected-item" : "";
            framesListHtml += `
            <li class="${cssClass}" onclick="selectFrame(${i})">
                <span style="flex:1; font-size:13px;">Frame #${i+1}</span>
                <span style="font-size:10px; color:#aaa; margin-right:10px;">${Math.round(f.w)}x${Math.round(f.h)}</span>
                <button onclick="deleteFrame(${i}, event)" style="background:none; border:none; color:#ff6666; font-weight:bold; cursor:pointer;">✖</button>
            </li>`;
        });
    }

    // 5. Sett inn HTML
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
        
        <div style="margin-top:auto; padding-top:10px; border-top:1px solid #333; font-size:11px; color:#666;">
            <b>Tips:</b> Tegn boks = Ny frame. Klikk = Velg. Dra = Flytt. Dra i hjørner = Endre str.
        </div>
    `;
}

// === PUBLIC FUNCTIONS (For HTML onclick) ===
window.changeAnimation = (name) => { AppState.currentAnimName = name; AppState.selectedFrameIndex = -1; updateInspector(); drawCanvas(); };
window.createNewAnimation = () => { const n = prompt("Navn:"); if(n && !AppState.animations[n]){ AppState.animations[n]=[]; changeAnimation(n); }};
window.selectFrame = (i) => { AppState.selectedFrameIndex = i; updateInspector(); drawCanvas(); };
window.deleteFrame = (i, e) => { 
    if(e) e.stopPropagation(); 
    getCurrentFrames().splice(i, 1); 
    AppState.selectedFrameIndex = -1; 
    updateInspector(); drawCanvas(); 
};
window.deleteAsset = async (docId, fileUrl, event) => {
    event.stopPropagation();
    if(!confirm("Slette filen?")) return;
    try {
        await firebase.storage().refFromURL(fileUrl).delete();
        await db.collection('users').doc(AppState.user.uid).collection('assets').doc(docId).delete();
    } catch(e){console.error(e);}
};

// === ASSET LOADING ===
function selectAsset(asset, li) {
    // Clear styles
    Array.from(ui.assetList.children).forEach(c => c.classList.remove('selected-item'));
    li.classList.add('selected-item');
    
    AppState.selectedAsset = asset;
    // Default anims init
    AppState.animations = {}; 
    DEFAULT_ANIMS.forEach(n => AppState.animations[n] = []);
    AppState.currentAnimName = "Idle";
    AppState.selectedFrameIndex = -1;

    const img = new Image(); img.crossOrigin = "Anonymous"; img.src = asset.url;
    img.onload = () => { AppState.loadedImage = img; drawCanvas(); updateInspector(); };
}

// === MATH & DRAWING ===
function drawCanvas() {
    const ctx = ui.canvas.getContext('2d');
    const w = ui.canvas.width; const h = ui.canvas.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = AppState.viewport.bgColor; ctx.fillRect(0, 0, w, h);
    if (!AppState.loadedImage) { 
        ctx.fillStyle="#444"; ctx.textAlign="center"; ctx.font="20px Arial"; ctx.fillText("Ingen tegning valgt", w/2, h/2); return; 
    }
    
    ctx.save();
    ctx.translate(w/2 + AppState.viewport.offsetX, h/2 + AppState.viewport.offsetY);
    ctx.scale(AppState.viewport.zoom, AppState.viewport.zoom);
    
    const img = AppState.loadedImage;
    const x = -img.width/2; const y = -img.height/2;
    ctx.drawImage(img, x, y);
    ctx.strokeStyle="#444"; ctx.lineWidth=1/AppState.viewport.zoom; ctx.strokeRect(x,y,img.width,img.height);

    // Draw Frames
    const frames = getCurrentFrames();
    frames.forEach((f, i) => {
        const isSel = i === AppState.selectedFrameIndex;
        ctx.strokeStyle = isSel ? "#ffff00" : "#4cd137";
        ctx.lineWidth = (isSel ? 2 : 1) / AppState.viewport.zoom;
        ctx.strokeRect(x+f.x, y+f.y, f.w, f.h);
        
        // Anchor
        if(f.anchor){
            const ax = x+f.x+f.anchor.x; const ay = y+f.y+f.anchor.y;
            const s = 5/AppState.viewport.zoom;
            ctx.strokeStyle="#00ffff"; ctx.beginPath();
            ctx.moveTo(ax-s, ay); ctx.lineTo(ax+s, ay); ctx.moveTo(ax, ay-s); ctx.lineTo(ax, ay+s); ctx.stroke();
        }
        
        // Resize Handles
        if(isSel){
            ctx.fillStyle="#fff"; const hs=4/AppState.viewport.zoom;
            [[x+f.x, y+f.y], [x+f.x+f.w, y+f.y], [x+f.x, y+f.y+f.h], [x+f.x+f.w, y+f.y+f.h]]
            .forEach(c=>ctx.fillRect(c[0]-hs, c[1]-hs, hs*2, hs*2));
        }
        
        // Label
        ctx.fillStyle = isSel ? "#ffff00" : "#4cd137";
        ctx.font=`${10/AppState.viewport.zoom}px Arial`;
        ctx.fillText("#"+(i+1), x+f.x, y+f.y - 3/AppState.viewport.zoom);
    });
    
    // Temp Selection
    if(AppState.tempSelection){
        const s = AppState.tempSelection;
        ctx.strokeStyle="#ff3333"; ctx.setLineDash([5,5]);
        ctx.strokeRect(x+s.x, y+s.y, s.w, s.h); ctx.setLineDash([]);
    }
    ctx.restore();
}

// Helpers
function getMousePos(e){const r=ui.canvas.getBoundingClientRect(); return{x:e.clientX-r.left, y:e.clientY-r.top};}
function dist(x1,y1,x2,y2){return Math.sqrt((x2-x1)**2+(y2-y1)**2);}
function screenToImageCoords(sx,sy){const z=AppState.viewport.zoom,img=AppState.loadedImage;if(!img)return{x:0,y:0};const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z);const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);return{x:(sx-dx)/z,y:(sy-dy)/z};}
function imageToScreenCoords(ix,iy){const z=AppState.viewport.zoom,img=AppState.loadedImage;if(!img)return{x:0,y:0};const dx=(ui.canvas.width/2)+AppState.viewport.offsetX-(img.width/2*z);const dy=(ui.canvas.height/2)+AppState.viewport.offsetY-(img.height/2*z);return{x:dx+(ix*z),y:dy+(iy*z)};}
function getFrameAt(ix,iy){const fs=getCurrentFrames();for(let i=fs.length-1;i>=0;i--){const f=fs[i];if(ix>=f.x&&ix<=f.x+f.w&&iy>=f.y&&iy<=f.y+f.h)return i;}return -1;}
function getResizeHandleHover(mx,my,f){const z=AppState.viewport.zoom,m=8;const tl=imageToScreenCoords(f.x,f.y),tr=imageToScreenCoords(f.x+f.w,f.y),bl=imageToScreenCoords(f.x,f.y+f.h),br=imageToScreenCoords(f.x+f.w,f.y+f.h);if(dist(mx,my,tl.x,tl.y)<m)return'nw';if(dist(mx,my,tr.x,tr.y)<m)return'ne';if(dist(mx,my,bl.x,bl.y)<m)return'sw';if(dist(mx,my,br.x,br.y)<m)return'se';return null;}
function setTool(t){AppState.viewport.activeTool=t;if(t==='select'){ui.toolSelect.classList.add('active');ui.toolPan.classList.remove('active');ui.canvas.style.cursor="default";}else{ui.toolSelect.classList.remove('active');ui.toolPan.classList.add('active');ui.canvas.style.cursor="grab";}}
function handleZoom(a){let z=AppState.viewport.zoom+a;z=Math.max(0.1,Math.min(z,10.0));AppState.viewport.zoom=Math.round(z*10)/10;ui.zoomLabel.innerText=Math.round(z*100)+"%";drawCanvas();}

// Boilerplate
function initAuthListener(){auth.onAuthStateChanged(u=>{if(u){AppState.user=u;ui.statusMsg.innerText="Klar";setTimeout(()=>{transitionToEditor();subscribeToAssets(u.uid);},500);}else{AppState.user=null;transitionToLogin();}});}
function handleLogin(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.signInWithEmailAndPassword(e,p).catch(err=>showStatus(err.code,"error"));}
function handleRegister(){const e=ui.emailInput.value,p=ui.passwordInput.value;auth.createUserWithEmailAndPassword(e,p).then(()=>showStatus("OK","success")).catch(err=>showStatus(err.code,"error"));}
function handleGoogleLogin(){auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err=>console.error(err));}
function handleLogout(){auth.signOut();}
async function handleFileUpload(ev){const f=ev.target.files[0];if(!f)return;if(!f.type.startsWith('image/'))return alert("Kun bilder");ui.uploadBtn.innerText="...";ui.uploadBtn.disabled=true;const uid=AppState.user.uid, ref=storage.ref().child(`users/${uid}/assets/${Date.now()}_${f.name}`);try{const snap=await ref.put(f),url=await snap.ref.getDownloadURL();await db.collection('users').doc(uid).collection('assets').add({originalName:f.name,url,type:f.type,createdAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(e){alert(e.message);}finally{ui.fileInput.value='';ui.uploadBtn.innerText="+ Last opp";ui.uploadBtn.disabled=false;}}
function subscribeToAssets(uid){ui.assetList.innerHTML='<li>Laster...</li>';AppState.unsubscribeAssets=db.collection('users').doc(uid).collection('assets').orderBy('createdAt','desc').onSnapshot(s=>{ui.assetList.innerHTML='';s.forEach(d=>renderAssetItem(d.data(),d.id));if(s.empty)ui.assetList.innerHTML='<li>Tomt</li>';});}
function renderAssetItem(a,id){const li=document.createElement('li');li.innerHTML=`<div style="display:flex;align-items:center;flex:1;"><img src="${a.url}" style="width:30px;height:30px;object-fit:contain;background:#222;margin-right:10px"><span style="font-size:13px;">${a.originalName}</span></div><button onclick="deleteAsset('${id}','${a.url}',event)" style="background:none;border:none;color:#ff5555;font-weight:bold;cursor:pointer;">X</button>`;li.onclick=()=>selectAsset(a,li);ui.assetList.appendChild(li);}
function showStatus(m,t){ui.statusMsg.innerText=m;ui.statusMsg.style.color=t==="error"?"red":"green";}
function transitionToEditor(){ui.loginScreen.classList.add('hidden');ui.editorScreen.classList.remove('hidden');if(AppState.user)ui.projectName.innerText=AppState.user.email;}
function transitionToLogin(){ui.editorScreen.classList.add('hidden');ui.loginScreen.classList.remove('hidden');}

/* Version: #14 */
