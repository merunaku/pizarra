// STATE MANAGER - PIZARRA PROFEDIEGO

export const state = {
    elements: [],
    selectedIds: [],
    activeTool: 'pencil',
    activeShape: 'rect',
    activeConnector: 'line',
    activeFrame: 'free',
    darkMode: false,
    pencilColor: '#1e293b',
    pencilWidth: 3,
    pencilArrowMode: 'none',
    smoothing: 5,
    hlColor: 'rgba(250, 204, 21, 0.45)',
    hlWidth: 20,
    stickyColor: '#fef08a',
    pan: { x: 0, y: 0 },
    zoom: 1.0,
    isPanning: false,
    isDrawing: false,
    isDragging: false,
    isResizing: false,
    isRotating: false,
    activeHandle: null,
    startPoint: { x: 0, y: 0 },
    lastMousePos: { x: 0, y: 0 },
    history: [],
    historyIndex: -1,
    tempElement: null,
    editingElementId: null,
    alignmentGuides: [],
    
    // Dibujo Técnico: Ortogonal (F8) y Referencia a Objetos (OSNAP)
    orthoMode: false,
    osnapEnabled: true,
    osnapPoint: null,

    // Rol de usuario ('student' | 'teacher')
    userRole: 'student',

    // Firebase Realtime Sync & Presencia
    userId: 'user_' + Math.random().toString(36).substr(2, 9),
    userName: 'Usuario',
    studentDrawingAllowed: true,
    showParticipantViewports: true,
    presenceUsers: {},

    // Google Drive & Explorador
    gdriveClientId: '105539045721-rqso8ee1qvak0f35lm72dl0iqgaisqqe.apps.googleusercontent.com',
    gdriveTeacherEmail: 'ingeniero.diego.bustamante@gmail.com',
    gdriveRootFolderId: '1F9G2av-nBxT4lnOI9TeG4Do0cadbbESQ',
    gdriveScopes: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    gdriveAccessToken: null,
    gdriveCurrentUserEmail: null,
    gdriveIsTeacher: false,
    gdriveFolderHistory: [{ id: '1F9G2av-nBxT4lnOI9TeG4Do0cadbbESQ', name: 'Raíz' }],
    gdriveClipboardFile: null,
    gdriveUser: null,
    gdriveAutoSync: false,
    gdriveActiveFileId: null,
    gdriveActiveFileName: null
};

export function screenToWorld(sx, sy, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (sx - rect.left - state.pan.x) / state.zoom,
        y: (sy - rect.top - state.pan.y) / state.zoom
    };
}

export function worldToScreen(wx, wy) {
    return {
        x: wx * state.zoom + state.pan.x,
        y: wy * state.zoom + state.pan.y
    };
}

export function saveState() {
    const snapshot = JSON.stringify(state.elements);
    if (state.historyIndex >= 0 && state.history[state.historyIndex] === snapshot) return;
    
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    if (state.history.length > 40) state.history.shift();
    state.historyIndex = state.history.length - 1;
    
    updateUndoRedoButtons();
    
    try {
        localStorage.setItem('profediego_board_data', snapshot);
        localStorage.setItem('profediego_dark_mode', state.darkMode ? 'true' : 'false');
        localStorage.setItem('profediego_user_role', state.userRole);
        const titleInput = document.getElementById('board-title');
        if (titleInput) {
            localStorage.setItem('profediego_board_title', titleInput.value);
        }
        if (state.gdriveActiveFileId) {
            localStorage.setItem('profediego_active_file_id', state.gdriveActiveFileId);
        }
    } catch (e) {
        console.warn("No se pudo guardar en localStorage:", e);
    }

    if (typeof window.syncFirebaseElements === 'function') {
        window.syncFirebaseElements(state.elements);
    }

    if (typeof window.triggerAutoSaveToDrive === 'function') {
        window.triggerAutoSaveToDrive();
    }
}

export function undo(renderCallback, updateContextCb) {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreSnapshot(state.history[state.historyIndex], renderCallback);
        updateUndoRedoButtons();
        if (updateContextCb) updateContextCb();
    }
}

export function redo(renderCallback, updateContextCb) {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        restoreSnapshot(state.history[state.historyIndex], renderCallback);
        updateUndoRedoButtons();
        if (updateContextCb) updateContextCb();
    }
}

export function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = state.historyIndex <= 0;
    if (btnRedo) btnRedo.disabled = state.historyIndex >= state.history.length - 1;
}

export function restoreSnapshot(jsonStr, renderCallback) {
    try {
        const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        const elementsList = Array.isArray(data) ? data : (data.elements || []);
        
        state.elements = elementsList.map(el => {
            if (el.type === 'pencil' || el.type === 'highlighter') {
                if (el.arrowMode === undefined) el.arrowMode = 'none';
                if (el.arrowSize === undefined) el.arrowSize = 14;
                if (el.smoothing === undefined) el.smoothing = 5;
                if (el.lineWidth === undefined) el.lineWidth = el.type === 'highlighter' ? 20 : 3;
                if (el.rotation === undefined) el.rotation = 0;
            }
            if (el.type === 'connector') {
                if (el.arrowMode === undefined) {
                    if (el.connType && el.connType.includes('double')) el.arrowMode = 'both';
                    else if (el.connType && el.connType.includes('arrow')) el.arrowMode = 'end';
                    else el.arrowMode = 'none';
                }
                if (el.arrowSize === undefined) el.arrowSize = 14;
                if (el.strokeWidth === undefined) el.strokeWidth = 2;
                if (el.points && el.points.length >= 2) {
                    el.x = el.points[0].x;
                    el.y = el.points[0].y;
                    el.endX = el.points[el.points.length - 1].x;
                    el.endY = el.points[el.points.length - 1].y;
                }
            }
            if (el.type === 'image' && el.src) {
                const img = new Image();
                img.src = el.src;
                img.onload = () => { if (renderCallback) renderCallback(); };
                el.imgElement = img;
            }
            return el;
        });
        state.selectedIds = [];
        if (renderCallback) renderCallback();
    } catch (e) {
        console.error("Error al restaurar estado de la pizarra:", e);
    }
}

export function loadFromLocalStorage(renderCallback) {
    const savedData = localStorage.getItem('profediego_board_data');
    const savedTitle = localStorage.getItem('profediego_board_title');
    const savedDarkMode = localStorage.getItem('profediego_dark_mode');
    const savedActiveFileId = localStorage.getItem('profediego_active_file_id');
    const savedRole = localStorage.getItem('profediego_user_role');

    if (savedRole) {
        state.userRole = savedRole;
    }

    if (savedActiveFileId) {
        state.gdriveActiveFileId = savedActiveFileId;
    }

    if (savedDarkMode === 'true') {
        state.darkMode = true;
        document.documentElement.classList.add('dark');
        const icon = document.getElementById('darkmode-icon');
        if (icon) icon.className = 'fa-solid fa-sun text-amber-400 text-sm';
    }

    if (savedTitle) {
        const titleInput = document.getElementById('board-title');
        const modalTitleInput = document.getElementById('boardTitle');
        if (titleInput) titleInput.value = savedTitle;
        if (modalTitleInput) modalTitleInput.value = savedTitle;
    }
    
    if (savedData) {
        restoreSnapshot(savedData, renderCallback);
    }
}