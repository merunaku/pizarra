// REALTIME SYNC & PARTICIPANT PRESENCE - PIZARRA PROFEDIEGO
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
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

function getCurrentBoardId() {
    return state.gdriveActiveFileId || state.activeBoardId || 'default';
}

function getTeacherBoardId() {
    return teacherActiveBoardId || state.teacherActiveBoardId || 'default';
}

function isStudentOnTeacherBoard() {
    const isTeacher = state.userRole === 'teacher' || state.gdriveIsTeacher;
    if (isTeacher) return true;
    const current = getCurrentBoardId();
    const teacherBoard = getTeacherBoardId();
    return !teacherBoard || teacherBoard === 'default' || current === teacherBoard;
}

export function initFirebaseSync(renderFn) {
    renderCallbackRef = renderFn;
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);

        window.syncFirebaseElements = syncFirebaseElements;

        listenTeacherBoardChange();
        listenToRoom(currentRoomId);
        listenToPresence(currentRoomId);
        listenToSettings(currentRoomId);

        updateUserPresence();
        window.addEventListener('resize', updateUserPresence);

        showToast('Sincronización en directo conectada', 'fa-solid fa-wifi');
    } catch (e) {
        console.error("Error al inicializar Firebase:", e);
    }
}

export function syncFirebaseElements(elements) {
    if (!db || isRemoteUpdating) return;
    const isTeacher = state.userRole === 'teacher' || state.gdriveIsTeacher;

    if (!isTeacher) {
        if (!state.studentDrawingAllowed) return;
        if (!isStudentOnTeacherBoard()) return;
    }

    const elementsRef = ref(db, `boards/${currentRoomId}/elements`);
    set(elementsRef, elements || []).catch(err => console.error("Error en realtime sync:", err));
}

function listenToRoom(roomId) {
    if (!db) return;
    const elementsRef = ref(db, `boards/${roomId}/elements`);
    onValue(elementsRef, (snapshot) => {
        lastElementsVal = snapshot.val();
        applyRoomElements();
    });
}

export function applyRoomElements() {
    if (!lastElementsVal) return;
    const isTeacher = state.userRole === 'teacher' || state.gdriveIsTeacher;
    if (!isTeacher && !isStudentOnTeacherBoard()) return;

    isRemoteUpdating = true;
    restoreSnapshot(lastElementsVal, renderCallbackRef);
    isRemoteUpdating = false;
}

function listenToPresence(roomId) {
    if (!db) return;
    const presenceRef = ref(db, `boards/${roomId}/presence`);
    onValue(presenceRef, (snapshot) => {
        const val = snapshot.val() || {};
        const now = Date.now();
        
        const filteredPresence = {};
        Object.keys(val).forEach(uid => {
            const user = val[uid];
            const isRecent = !user.lastSeen || (now - user.lastSeen < 15000);

            if (isRecent) {
                filteredPresence[uid] = user;
            }
        });

        state.presenceUsers = filteredPresence;
        if (renderCallbackRef) renderCallbackRef();
    });
}

function listenToSettings(roomId) {
    if (!db) return;
    const settingsRef = ref(db, `boards/${roomId}/settings`);
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
    const teacherBoardRef = ref(db, `boards/${currentRoomId}/activeBoardId`);
    onValue(teacherBoardRef, (snapshot) => {
        const boardId = snapshot.val();
        if (boardId !== undefined && boardId !== null) {
            teacherActiveBoardId = boardId;
            state.teacherActiveBoardId = boardId;
            
            if (state.userRole === 'student' || !state.gdriveIsTeacher) {
                state.activeBoardId = boardId;
                state.gdriveActiveFileId = boardId;
                applyRoomElements();
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

    const teacherBoardRef = ref(db, `boards/${currentRoomId}/activeBoardId`);
    set(teacherBoardRef, boardId);
    updateUserPresence();
}

export function updateUserPresence() {
    if (!db) return;
    const canvas = document.getElementById('board-canvas') || document.getElementById('main-canvas');
    if (!canvas) return;

    const userRef = ref(db, `boards/${currentRoomId}/presence/${state.userId}`);
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
    });
}

export function notifyBoardSwitch(boardId) {
    state.activeBoardId = boardId;
    state.gdriveActiveFileId = boardId;
    updateUserPresence();
    applyRoomElements();
}

export function toggleStudentDrawingPermission(allowed) {
    if (!db) return;
    if (state.userRole !== 'teacher' && !state.gdriveIsTeacher) return;
    state.studentDrawingAllowed = allowed;
    const settingsRef = ref(db, `boards/${currentRoomId}/settings`);
    update(settingsRef, { studentDrawingAllowed: allowed });
    showToast(allowed ? 'Transmisión de alumnos ACTIVADA' : 'Transmisión de alumnos BLOQUEADA', allowed ? 'fa-solid fa-unlock' : 'fa-solid fa-lock');
}