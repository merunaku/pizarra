// MODULO DE SINCRONIZACIÓN EN TIEMPO REAL Y PRESENCIA - FIREBASE REALTIME DATABASE
import { state, restoreSnapshot } from './state.js';
import { showToast } from './uiController.js';

// Configuración de credenciales de Firebase para Pizarra ProfeDiego
const firebaseConfig = {
  apiKey: "AIzaSyCgwLhw_twx8FaQot6e4tFa-vTyKhOVruI",
  authDomain: "pizarra-profediego.firebaseapp.com",
  databaseURL: "https://pizarra-profediego-default-rtdb.firebaseio.com",
  projectId: "pizarra-profediego",
  storageBucket: "pizarra-profediego.firebasestorage.app",
  messagingSenderId: "399259351439",
  appId: "1:399259351439:web:e76fb20b6be38f8b4bb3fa"
};

let db = null;
let currentRoomId = null;
let roomRef = null;
let isRemoteUpdating = false;
let userPresenceKey = null;
let renderCb = null;

/**
 * Inicializa la conexión con Firebase si no se ha hecho previamente
 */
function initFirebase() {
    if (!window.firebase) {
        console.warn("SDK de Firebase no está disponible.");
        return false;
    }

    if (!window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
    }

    db = window.firebase.database();
    return true;
}

/**
 * Conecta la pizarra en tiempo real a una sala específica (Mapeada por fileId de Drive o sala por defecto)
 * @param {string} roomId - ID de la sala / archivo
 * @param {Function} renderCallback - Callback de renderizado del canvas
 */
export function joinRoom(roomId = 'default_room', renderCallback) {
    if (!roomId) roomId = 'default_room';
    if (renderCallback) renderCb = renderCallback;

    if (!initFirebase()) return;

    // Limpiar escuchas previas si cambiamos de sala
    if (roomRef && currentRoomId) {
        roomRef.off();
    }

    currentRoomId = roomId;
    roomRef = db.ref(`rooms/${currentRoomId}`);

    // 1. Escuchar cambios de elementos en la pizarra
    roomRef.child('elements').on('value', (snapshot) => {
        const remoteData = snapshot.val();
        if (!remoteData || isRemoteUpdating) return;

        // Si es el profesor que está dibujando localmente, ignorar para evitar loops de render
        if (state.gdriveIsTeacher && state.isDrawing) return;

        isRemoteUpdating = true;
        try {
            const jsonContent = typeof remoteData === 'string' ? remoteData : JSON.stringify(remoteData);
            restoreSnapshot(jsonContent, renderCb);
        } catch (err) {
            console.error("Error al sincronizar elementos de Firebase:", err);
        }
        isRemoteUpdating = false;
    });

    // 2. Escuchar configuraciones de la sala (Permiso de dibujo a alumnos y nombre de clase activa)
    roomRef.child('settings').on('value', (snapshot) => {
        const settings = snapshot.val();
        if (settings) {
            if (typeof settings.allowStudentDrawing !== 'undefined') {
                state.allowStudentDrawing = settings.allowStudentDrawing;
                updateStudentPermissionUI();
            }
            if (settings.activeFileName) {
                state.activeBoardInfo.fileName = settings.activeFileName;
                updateActiveBoardBanner();
            }
        }
    });

    // 3. Registrar presencia del usuario actual
    registerUserPresence();

    // 4. Escuchar lista de usuarios/alumnos conectados y sus punteros
    roomRef.child('presence').on('value', (snapshot) => {
        const usersObj = snapshot.val() || {};
        const userList = [];
        Object.keys(usersObj).forEach(key => {
            userList.push({ id: key, ...usersObj[key] });
        });
        state.connectedUsers = userList;
        updateConnectedUsersUI();
        if (renderCb) renderCb();
    });
}

/**
 * Transmite el estado actual de los elementos a la sala de Firebase
 * @param {Array} elements - Lista de elementos del canvas
 */
export function broadcastBoardState(elements) {
    if (!roomRef || isRemoteUpdating) return;

    // Solo transmitir si es Profesor O si el Profesor concedió permiso de dibujo a Alumnos
    if (state.gdriveIsTeacher || state.allowStudentDrawing) {
        const dataToSave = JSON.stringify(elements || state.elements);
        roomRef.child('elements').set(dataToSave).catch((err) => {
            console.error("Error al transmitir cambios a Firebase:", err);
        });
    }
}

/**
 * Registra al usuario en la nodo de presencia con desconexión automática
 */
function registerUserPresence() {
    if (!roomRef) return;

    const presenceRef = roomRef.child('presence').push();
    userPresenceKey = presenceRef.key;

    const userData = {
        email: state.gdriveCurrentUserEmail || 'Alumno / Invitado',
        picture: state.gdriveUser?.picture || null,
        isTeacher: state.gdriveIsTeacher,
        x: 0,
        y: 0,
        lastSeen: Date.now()
    };

    presenceRef.set(userData);
    presenceRef.onDisconnect().remove();
}

/**
 * Emite la posición del cursor/puntero del usuario en coordenadas del mundo
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 */
export function updateCursorPosition(x, y) {
    if (!db || !currentRoomId || !userPresenceKey) return;
    db.ref(`rooms/${currentRoomId}/presence/${userPresenceKey}`).update({
        x: Math.round(x),
        y: Math.round(y),
        lastSeen: Date.now()
    });
}

/**
 * Cambia la configuración de permiso de dibujo para alumnos (Exclusivo Profesor)
 * @param {boolean} allowed - Habilitar o deshabilitar
 */
export function setStudentDrawingPermission(allowed) {
    if (!state.gdriveIsTeacher || !roomRef) return;
    roomRef.child('settings').update({ allowStudentDrawing: allowed });
    showToast(allowed ? 'Dibujo habilitado para Alumnos' : 'Dibujo bloqueado para Alumnos', 'fa-solid fa-pen-nib');
}

/**
 * Notifica a todos los alumnos el nombre de la clase o archivo activo
 * @param {string} fileName - Nombre del archivo/clase activa
 */
export function broadcastActiveBoardName(fileName) {
    if (!roomRef) return;
    roomRef.child('settings').update({ activeFileName: fileName });
}

/**
 * Actualiza el banner de clase activa en la barra superior para los alumnos
 */
function updateActiveBoardBanner() {
    const banner = document.getElementById('student-active-board-banner');
    if (banner) {
        if (state.activeBoardInfo.fileName && state.activeBoardInfo.fileName !== 'Pizarra Libre') {
            banner.innerText = `📖 Clase Activa: ${state.activeBoardInfo.fileName}`;
            banner.classList.remove('hidden');
        } else {
            banner.innerText = `📖 Pizarra Libre`;
            banner.classList.remove('hidden');
        }
    }
}

/**
 * Actualiza las insignias visuales según los permisos recibidos
 */
function updateStudentPermissionUI() {
    const badge = document.getElementById('student-drawing-status-badge');
    const toggleTeacher = document.getElementById('toggle-allow-students');

    if (toggleTeacher && state.gdriveIsTeacher) {
        toggleTeacher.checked = state.allowStudentDrawing;
    }

    if (badge && !state.gdriveIsTeacher) {
        if (state.allowStudentDrawing) {
            badge.innerHTML = '<i class="fa-solid fa-pen"></i> Dibujo Habilitado';
            badge.className = 'px-2 py-0.5 text-[11px] bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded font-bold border border-emerald-300 dark:border-emerald-800 flex items-center gap-1';
        } else {
            badge.innerHTML = '<i class="fa-solid fa-lock"></i> Solo Lectura (Profesor)';
            badge.className = 'px-2 py-0.5 text-[11px] bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 rounded font-bold border border-amber-300 dark:border-amber-800 flex items-center gap-1';
        }
    }
}

/**
 * Actualiza la lista desplegable y el contador de usuarios conectados
 */
function updateConnectedUsersUI() {
    const countBadge = document.getElementById('connected-users-count');
    const listContainer = document.getElementById('connected-users-list');

    if (countBadge) {
        countBadge.innerText = `${state.connectedUsers.length}`;
    }

    if (listContainer) {
        listContainer.innerHTML = '';
        if (state.connectedUsers.length === 0) {
            listContainer.innerHTML = '<div class="text-[11px] text-slate-400 italic px-1">Sin otros usuarios</div>';
            return;
        }

        state.connectedUsers.forEach(user => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs transition-colors';
            
            const avatarHtml = user.picture 
                ? `<img src="${user.picture}" class="w-6 h-6 rounded-full border border-indigo-400 object-cover">`
                : `<div class="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-[10px]">${(user.email || 'A')[0].toUpperCase()}</div>`;

            const roleHtml = user.isTeacher 
                ? '<span class="text-[9px] bg-emerald-500 text-white font-bold px-1 rounded">PROFE</span>'
                : '<span class="text-[9px] bg-blue-500 text-white font-bold px-1 rounded">ALUMNO</span>';

            const isSelf = user.email === state.gdriveCurrentUserEmail;

            div.innerHTML = `
                ${avatarHtml}
                <span class="truncate flex-1 font-medium text-slate-700 dark:text-slate-200">${user.email.split('@')[0]} ${isSelf ? '(Tú)' : ''}</span>
                ${roleHtml}
            `;
            listContainer.appendChild(div);
        });
    }
}

// Exposición global
window.joinRoom = joinRoom;
window.broadcastBoardState = broadcastBoardState;
window.updateCursorPosition = updateCursorPosition;
window.setStudentDrawingPermission = setStudentDrawingPermission;