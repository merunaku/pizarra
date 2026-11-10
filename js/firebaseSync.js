// REALTIME SYNC & PARTICIPANT PRESENCE - PIZARRA PROFEDIEGO
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
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
let renderCallbackRef = null;

export function initFirebaseSync(renderFn) {
    renderCallbackRef = renderFn;
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);

        window.syncFirebaseElements = syncFirebaseElements;

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
    if (!state.gdriveIsTeacher && !state.studentDrawingAllowed) return;

    const elementsRef = ref(db, `boards/${currentRoomId}/elements`);
    set(elementsRef, elements).catch(err => console.error("Error en realtime sync:", err));
}

function listenToRoom(roomId) {
    if (!db) return;
    const elementsRef = ref(db, `boards/${roomId}/elements`);
    onValue(elementsRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
            isRemoteUpdating = true;
            restoreSnapshot(val, renderCallbackRef);
            isRemoteUpdating = false;
        }
    });
}

function listenToPresence(roomId) {
    if (!db) return;
    const presenceRef = ref(db, `boards/${roomId}/presence`);
    onValue(presenceRef, (snapshot) => {
        const val = snapshot.val() || {};
        state.presenceUsers = val;
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

export function updateUserPresence() {
    if (!db) return;
    const canvas = document.getElementById('board-canvas');
    if (!canvas) return;

    const userRef = ref(db, `boards/${currentRoomId}/presence/${state.userId}`);
    const userColor = state.gdriveIsTeacher ? '#059669' : '#2563eb';

    const viewBounds = {
        x: -state.pan.x / state.zoom,
        y: -state.pan.y / state.zoom,
        w: canvas.width / state.zoom,
        h: canvas.height / state.zoom
    };

    set(userRef, {
        name: state.gdriveCurrentUserEmail ? state.gdriveCurrentUserEmail.split('@')[0] : 'Participante',
        isTeacher: state.gdriveIsTeacher,
        color: userColor,
        viewBounds
    });
}

export function toggleStudentDrawingPermission(allowed) {
    if (!db || !state.gdriveIsTeacher) return;
    state.studentDrawingAllowed = allowed;
    const settingsRef = ref(db, `boards/${currentRoomId}/settings`);
    update(settingsRef, { studentDrawingAllowed: allowed });
    showToast(allowed ? 'Transmisión de alumnos ACTIVADA' : 'Transmisión de alumnos BLOQUEADA', allowed ? 'fa-solid fa-unlock' : 'fa-solid fa-lock');
}