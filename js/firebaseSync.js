// FIREBASE REALTIME DATABASE SYNC - PIZARRA PROFEDIEGO
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    set, 
    onValue, 
    update, 
    onDisconnect 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let renderCallback = null;
let isRemoteUpdating = false;
let syncDebounceTimeout = null;

function getUserId() {
    if (!window._uniqueSessionUserId) {
        window._uniqueSessionUserId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }
    return window._uniqueSessionUserId;
}

const roomId = state.currentRoomId || 'clase_general';
const userId = getUserId();

export function initFirebaseSync(renderFn) {
    renderCallback = renderFn;

    window.syncElementsToFirebase = syncElementsToFirebase;
    window.broadcastTeacherPermission = broadcastTeacherPermission;

    // 1. Escuchar cambios de trazos en tiempo real
    const elementsRef = ref(db, `rooms/${roomId}/elements`);
    onValue(elementsRef, (snapshot) => {
        const data = snapshot.val();
        if (data !== null && !isRemoteUpdating) {
            isRemoteUpdating = true;
            restoreSnapshot(data, renderCallback);
            isRemoteUpdating = false;
        }
    });

    // 2. Escuchar permisos de dibujo fijados por el profesor
    const permissionRef = ref(db, `rooms/${roomId}/permissions/studentDrawingAllowed`);
    onValue(permissionRef, (snapshot) => {
        const allowed = snapshot.val() || false;
        if (state.studentDrawingAllowed !== allowed) {
            state.studentDrawingAllowed = allowed;
            updateStudentDrawingUI();
            showToast(
                allowed ? 'El profesor ha activado la pizarra para alumnos' : 'El profesor ha bloqueado el dibujo de alumnos',
                allowed ? 'fa-solid fa-pen-nib' : 'fa-solid fa-lock'
            );
        }
    });

    // 3. Escuchar el archivo/pizarra activo enviado por el profesor (Sincronización de título)
    const activeFileRef = ref(db, `rooms/${roomId}/activeFile`);
    onValue(activeFileRef, (snapshot) => {
        const fileName = snapshot.val();
        if (fileName) {
            state.gdriveActiveFileName = fileName;
            const cleanName = fileName.replace(/^PIZARRA_/, '').replace(/\.json$/, '');
            
            const topTitleInput = document.getElementById('board-title');
            const modalTitleInput = document.getElementById('boardTitle');
            if (topTitleInput) topTitleInput.value = cleanName;
            if (modalTitleInput) modalTitleInput.value = cleanName;
        }
    });

    // 4. Escuchar ubicaciones en pantalla (Viewports) de alumnos
    const usersRef = ref(db, `rooms/${roomId}/users`);
    onValue(usersRef, (snapshot) => {
        const usersData = snapshot.val() || {};
        const activeList = [];

        Object.keys(usersData).forEach(uid => {
            if (uid !== userId) {
                activeList.push({
                    id: uid,
                    ...usersData[uid]
                });
            }
        });

        state.connectedStudents = activeList;
        updateConnectedCountUI();
        if (renderCallback) renderCallback();
    });

    setupPresence();
    setInterval(emitCurrentViewport, 500);
}

export function syncElementsToFirebase() {
    if (isRemoteUpdating) return;
    
    if (!state.gdriveIsTeacher && !state.studentDrawingAllowed) {
        return;
    }

    if (syncDebounceTimeout) clearTimeout(syncDebounceTimeout);
    syncDebounceTimeout = setTimeout(() => {
        set(ref(db, `rooms/${roomId}/elements`), state.elements);
    }, 100);
}

export function broadcastTeacherPermission(allowed) {
    if (!state.gdriveIsTeacher) return;
    state.studentDrawingAllowed = allowed;
    updateStudentDrawingUI();

    set(ref(db, `rooms/${roomId}/permissions/studentDrawingAllowed`), allowed);

    showToast(
        allowed ? 'Pizarra habilitada para alumnos' : 'Pizarra bloqueada para alumnos',
        allowed ? 'fa-solid fa-unlock' : 'fa-solid fa-lock'
    );
}

export function broadcastActiveFileToStudents(fileName) {
    if (!state.gdriveIsTeacher) return;
    set(ref(db, `rooms/${roomId}/activeFile`), fileName);
}

function setupPresence() {
    const userRef = ref(db, `rooms/${roomId}/users/${userId}`);
    onDisconnect(userRef).remove();
    emitCurrentViewport();
}

function emitCurrentViewport() {
    const canvas = document.getElementById('board-canvas');
    if (!canvas) return;

    const user = state.gdriveUser || {
        name: state.gdriveIsTeacher ? 'Profesor' : 'Alumno',
        picture: state.gdriveIsTeacher ? 'https://placehold.co/40x40/059669/ffffff?text=P' : 'https://placehold.co/40x40/3b82f6/ffffff?text=A',
        email: state.gdriveCurrentUserEmail || 'anonimo@clase.com'
    };

    const userRef = ref(db, `rooms/${roomId}/users/${userId}`);
    update(userRef, {
        name: user.name || (state.gdriveIsTeacher ? 'Profesor' : 'Alumno'),
        picture: user.picture,
        email: user.email,
        isTeacher: state.gdriveIsTeacher,
        lastSeen: Date.now(),
        viewport: {
            x: -state.pan.x / state.zoom,
            y: -state.pan.y / state.zoom,
            width: canvas.width / state.zoom,
            height: canvas.height / state.zoom
        }
    });
}

function updateConnectedCountUI() {
    const countBadge = document.getElementById('connected-students-count');
    const avatarsContainer = document.getElementById('connected-students-avatars');

    const studentsOnly = state.connectedStudents.filter(s => !s.isTeacher);

    if (countBadge) {
        countBadge.innerText = `${studentsOnly.length} Alumno(s)`;
    }

    if (avatarsContainer) {
        avatarsContainer.innerHTML = '';
        studentsOnly.forEach(student => {
            const img = document.createElement('img');
            img.src = student.picture || 'https://placehold.co/40x40/3b82f6/ffffff?text=A';
            img.title = `${student.name || 'Alumno'} (${student.email || ''})`;
            img.className = 'w-6 h-6 rounded-full border-2 border-indigo-500 object-cover shadow-sm';
            avatarsContainer.appendChild(img);
        });
    }
}

export function updateStudentDrawingUI() {
    const sidebar = document.getElementById('main-sidebar');
    const isTeacher = state.gdriveIsTeacher;
    const canDraw = isTeacher || state.studentDrawingAllowed;

    if (sidebar) {
        if (!canDraw) {
            sidebar.classList.add('pointer-events-none', 'opacity-40');
        } else {
            sidebar.classList.remove('pointer-events-none', 'opacity-40');
        }
    }
}