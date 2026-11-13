// REALTIME SYNC & PARTICIPANT PRESENCE - PIZARRA PROFEDIEGO
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { state, restoreSnapshot } from './state.js';
import { showToast } from './uiController.js';

const firebaseConfig = {
  apiKey: "AIzaSyCgwLhw_twx8FaQot6e4tFa-vTyKhOVruI",
  authDomain: "pizarra-profediego.firebaseapp.com",
  databaseURL: "https://pizarra-profediego-default-rtdb.firebaseio.com",
  projectId: "pizarra-profediego",
  storageBucket: "pizarra-profediego.firebasestorage.app",
  messagingSenderId: "399259351439",
  appId: "1:399259351439:web:e76fb20b6be38f8b4bb3fa"
};

let app = null;
let db = null;
let isRemoteUpdating = false;
let currentRoomId = 'clase_principal';
let teacherActiveBoardId = null;
let renderCallbackRef = null;
let lastElementsVal = null;
let activeElementsRef = null;
let heartbeatInterval = null;

function getCurrentBoardId() {
    return state.gdriveActiveFileId || state.activeBoardId || 'default';
}

function getTeacherBoardId() {
    return teacherActiveBoardId || state.teacherActiveBoardId || 'default';
}

export function initFirebaseSync(renderFn) {
    renderCallbackRef = renderFn;
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);

        window.syncFirebaseElements = syncFirebaseElements;

        listenTeacherBoardChange();
        listenBoardsCatalog(currentRoomId);
        switchRoomBoardListener(getCurrentBoardId());
        listenToPresence(currentRoomId);
        listenToSettings(currentRoomId);

        updateUserPresence();

        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(updateUserPresence, 3000);

        window.addEventListener('resize', updateUserPresence);
        window.addEventListener('beforeunload', removeUserPresence);

        showToast('Sincronización en directo conectada', 'fa-solid fa-wifi');
    } catch (e) {
        console.error("Error al inicializar Firebase:", e);
    }
}

function listenBoardsCatalog(roomId) {
    if (!db) return;
    const catalogRef = ref(db, `rooms/${roomId}/boards_catalog`);
    onValue(catalogRef, (snapshot) => {
        const val = snapshot.val();
        if (Array.isArray(val)) {
            state.sharedBoardsCatalog = val;
        } else if (val && typeof val === 'object') {
            state.sharedBoardsCatalog = Object.values(val);
        } else {
            state.sharedBoardsCatalog = [];
        }
    });
}

export function publishBoardsCatalog(boardsList) {
    if (!db || !Array.isArray(boardsList)) return;
    const isTeacher = state.userRole === 'teacher' || state.gdriveIsTeacher;
    if (!isTeacher) return;

    const cleanCatalog = boardsList.map(b => ({
        id: b.id,
        name: b.name || 'Sin título',
        updatedAt: b.updatedAt || null,
        thumbnailUrl: (b.thumbnailUrl && b.thumbnailUrl.startsWith('data:image')) ? b.thumbnailUrl : null
    }));

    state.sharedBoardsCatalog = cleanCatalog;
    const catalogRef = ref(db, `rooms/${currentRoomId}/boards_catalog`);
    set(catalogRef, cleanCatalog).catch(err => console.error("Error publicando catálogo de pizarras:", err));
}

export function getSharedBoardsCatalog() {
    return Array.isArray(state.sharedBoardsCatalog) ? state.sharedBoardsCatalog : [];
}

function switchRoomBoardListener(boardId) {
    if (!db) return;
    if (activeElementsRef) {
        off(activeElementsRef);
    }
    const cleanBoardId = (boardId || 'default').replace(/[.#$\[\]]/g, '_');
    activeElementsRef = ref(db, `rooms/${currentRoomId}/boards/${cleanBoardId}/elements`);

    onValue(activeElementsRef, (snapshot) => {
        lastElementsVal = snapshot.val();
        applyRoomElements();
    });
}

export function isTeacherOnline() {
    const users = state.presenceUsers || {};
    return Object.values(users).some(u => u && u.isTeacher === true);
}

export function syncFirebaseElements(elements) {
    if (!db || isRemoteUpdating) return;
    const isTeacher = state.userRole === 'teacher' || state.gdriveIsTeacher;

    if (!isTeacher) {
        // Si el profesor no está conectado o bloqueó el dibujo, el alumno practica en local sin sobrescribir Firebase
        if (!isTeacherOnline() || !state.studentDrawingAllowed) return;
    }

    const boardId = getCurrentBoardId().replace(/[.#$\[\]]/g, '_');
    const elementsRef = ref(db, `rooms/${currentRoomId}/boards/${boardId}/elements`);
    set(elementsRef, elements || []).catch(err => console.error("Error en realtime sync:", err));
}

export function applyRoomElements() {
    if (!lastElementsVal) return;

    isRemoteUpdating = true;
    restoreSnapshot(lastElementsVal, renderCallbackRef);
    isRemoteUpdating = false;
}

function listenToPresence(roomId) {
    if (!db) return;
    const presenceRef = ref(db, `rooms/${roomId}/presence`);
    onValue(presenceRef, (snapshot) => {
        const val = snapshot.val() || {};
        const now = Date.now();
        const currentBoard = getCurrentBoardId();

        const filteredPresence = {};
        Object.keys(val).forEach(uid => {
            const user = val[uid];
            if (!user) return;

            const userBoard = user.activeBoardId || 'default';
            const isActive = user.lastSeen && (now - user.lastSeen < 7000);

            if (userBoard === currentBoard && isActive && uid !== state.userId) {
                filteredPresence[uid] = user;
            }
        });

        state.presenceUsers = filteredPresence;
        if (renderCallbackRef) renderCallbackRef();
    });
}

function listenToSettings(roomId) {
    if (!db) return;
    const settingsRef = ref(db, `rooms/${roomId}/settings`);
    onValue(settingsRef, (snapshot) => {
        const settings = snapshot.val();
        if (settings) {
            if (settings.studentDrawingAllowed !== undefined) {
                state.studentDrawingAllowed = settings.studentDrawingAllowed;
                const toggleBtn = document.getElementById('btn-toggle-student-draw');
                if (toggleBtn) {
                    toggleBtn.classList.toggle('active', state.studentDrawingAllowed);
                }
            }
        }
    });
}

export function listenTeacherBoardChange(callback) {
    if (!db) return;
    const teacherBoardRef = ref(db, `rooms/${currentRoomId}/teacherActiveBoardId`);
    onValue(teacherBoardRef, (snapshot) => {
        const boardId = snapshot.val();
        if (boardId !== undefined && boardId !== null) {
            teacherActiveBoardId = boardId;
            state.teacherActiveBoardId = boardId;

            const isStudent = state.userRole === 'student' && !state.gdriveIsTeacher;

            if (isStudent && !state.studentManuallySelectedBoard) {
                state.activeBoardId = boardId;
                state.gdriveActiveFileId = boardId;
                switchRoomBoardListener(boardId);
            }
        }
        if (boardId && callback) {
            callback(boardId);
        }
    });
}

export function setTeacherActiveBoard(boardId) {
    if (!db) return;
    if (state.userRole !== 'teacher' && !state.gdriveIsTeacher) return;
    teacherActiveBoardId = boardId;
    state.teacherActiveBoardId = boardId;
    state.activeBoardId = boardId;
    state.gdriveActiveFileId = boardId;

    const teacherBoardRef = ref(db, `rooms/${currentRoomId}/teacherActiveBoardId`);
    set(teacherBoardRef, boardId);

    switchRoomBoardListener(boardId);
    updateUserPresence();
}

export function updateUserPresence() {
    if (!db) return;
    const canvas = document.getElementById('board-canvas') || document.getElementById('main-canvas');
    if (!canvas) return;

    const userRef = ref(db, `rooms/${currentRoomId}/presence/${state.userId}`);
    onDisconnect(userRef).remove();

    const isTeacher = state.userRole === 'teacher' || state.gdriveIsTeacher;
    const userColor = isTeacher ? '#059669' : '#2563eb';
    const userName = state.gdriveCurrentUserEmail ? state.gdriveCurrentUserEmail.split('@')[0] : (isTeacher ? 'Profesor' : 'Alumno');
    const activeBoardId = getCurrentBoardId();

    const viewBounds = {
        x: -state.pan.x / state.zoom,
        y: -state.pan.y / state.zoom,
        w: canvas.width / state.zoom,
        h: canvas.height / state.zoom
    };

    set(userRef, {
        name: userName,
        userName: userName,
        isTeacher: isTeacher,
        color: userColor,
        activeBoardId: activeBoardId,
        viewBounds,
        lastSeen: Date.now()
    }).catch(() => {});
}

export function removeUserPresence() {
    if (!db) return;
    const userRef = ref(db, `rooms/${currentRoomId}/presence/${state.userId}`);
    set(userRef, null);
}

export function notifyBoardSwitch(boardId, isManualSelection = true) {
    state.activeBoardId = boardId;
    state.gdriveActiveFileId = boardId;
    if (isManualSelection) {
        state.studentManuallySelectedBoard = true;
    }
    switchRoomBoardListener(boardId);
    updateUserPresence();
}

export function syncWithTeacherBoard() {
    state.studentManuallySelectedBoard = false;
    const tBoard = getTeacherBoardId();
    if (tBoard && tBoard !== 'default') {
        notifyBoardSwitch(tBoard, false);
    }
}

export function toggleStudentDrawingPermission(allowed) {
    if (!db) return;
    if (state.userRole !== 'teacher' && !state.gdriveIsTeacher) return;
    state.studentDrawingAllowed = allowed;
    const settingsRef = ref(db, `rooms/${currentRoomId}/settings`);
    update(settingsRef, { studentDrawingAllowed: allowed });
    showToast(allowed ? 'Transmisión de alumnos ACTIVADA' : 'Transmisión de alumnos BLOQUEADA', allowed ? 'fa-solid fa-unlock' : 'fa-solid fa-lock');
}