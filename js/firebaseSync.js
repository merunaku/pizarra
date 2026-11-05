// FIREBASE REALTIME SYNC & MULTIUSER MONITOR MODULE - PIZARRA PROFEDIEGO
import { state, saveState, restoreSnapshot } from './state.js';
import { showToast } from './uiController.js';

let renderCallback = null;
let broadcastChannel = null;
let isRemoteUpdating = false;

/**
 * Inicializa el canal de comunicación en tiempo real
 */
export function initFirebaseSync(renderFn) {
    renderCallback = renderFn;

    // Registrar función global de sincronización de elementos
    window.syncElementsToFirebase = syncElementsToFirebase;
    window.broadcastTeacherPermission = broadcastTeacherPermission;

    // Uso de BroadcastChannel e Broadcast nativo de navegador para tiempo real de latencia ultra baja
    if ('BroadcastChannel' in window) {
        broadcastChannel = new BroadcastChannel('profediego_board_room');
        
        broadcastChannel.onmessage = (event) => {
            handleIncomingRealtimeMessage(event.data);
        };
    }

    // Intervalo continuo para emitir el Viewport (pantalla) del alumno o profesor
    setInterval(emitCurrentViewport, 400);
}

/**
 * Procesa los mensajes recibidos en el canal en tiempo real
 */
function handleIncomingRealtimeMessage(data) {
    if (!data || !data.type) return;

    if (data.type === 'SYNC_ELEMENTS' && data.senderId !== getUserId()) {
        isRemoteUpdating = true;
        restoreSnapshot(data.elements, renderCallback);
        isRemoteUpdating = false;
    } 
    else if (data.type === 'PERMISSION_CHANGE') {
        state.studentDrawingAllowed = data.studentDrawingAllowed;
        updateStudentDrawingUI();
        showToast(
            state.studentDrawingAllowed ? 'El profesor ha activado la pizarra para alumnos' : 'El profesor ha bloqueado el dibujo de alumnos',
            state.studentDrawingAllowed ? 'fa-solid fa-pen-nib' : 'fa-solid fa-lock'
        );
    } 
    else if (data.type === 'VIEWPORT_UPDATE' && data.senderId !== getUserId()) {
        updateStudentViewportData(data);
    } 
    else if (data.type === 'TEACHER_FILE_CHANGE') {
        const fileTag = document.getElementById('student-file-indicator');
        if (fileTag) {
            fileTag.innerText = `Archivo del Profesor: ${data.fileName}`;
            fileTag.classList.remove('hidden');
        }
    }
}

/**
 * Emite los cambios de la pizarra a todos los usuarios conectados
 */
export function syncElementsToFirebase() {
    if (isRemoteUpdating) return;
    
    // Si es un alumno y la pizarra está bloqueada, no permitir transmitir cambios
    if (!state.gdriveIsTeacher && !state.studentDrawingAllowed) {
        return;
    }

    if (broadcastChannel) {
        broadcastChannel.postMessage({
            type: 'SYNC_ELEMENTS',
            senderId: getUserId(),
            elements: state.elements
        });
    }
}

/**
 * El Profesor transmite la orden de permitir/bloquear el dibujo a los alumnos
 */
export function broadcastTeacherPermission(allowed) {
    state.studentDrawingAllowed = allowed;
    updateStudentDrawingUI();

    if (broadcastChannel) {
        broadcastChannel.postMessage({
            type: 'PERMISSION_CHANGE',
            senderId: getUserId(),
            studentDrawingAllowed: allowed
        });
    }

    showToast(
        allowed ? 'Pizarra habilitada para alumnos' : 'Pizarra bloqueada para alumnos',
        allowed ? 'fa-solid fa-unlock' : 'fa-solid fa-lock'
    );
}

/**
 * El Profesor transmite el archivo activo actualmente abierto de Google Drive
 */
export function broadcastActiveFileToStudents(fileName) {
    if (!state.gdriveIsTeacher) return;
    if (broadcastChannel) {
        broadcastChannel.postMessage({
            type: 'TEACHER_FILE_CHANGE',
            senderId: getUserId(),
            fileName
        });
    }
}

/**
 * Emite la posición visual actual (Viewport) del usuario
 */
function emitCurrentViewport() {
    const canvas = document.getElementById('board-canvas');
    if (!canvas || !broadcastChannel) return;

    const user = state.gdriveUser || {
        name: state.gdriveIsTeacher ? 'Profesor' : 'Alumno',
        picture: 'https://placehold.co/40x40/3b82f6/ffffff?text=A',
        email: state.gdriveCurrentUserEmail || 'anonimo@clase.com'
    };

    broadcastChannel.postMessage({
        type: 'VIEWPORT_UPDATE',
        senderId: getUserId(),
        user,
        isTeacher: state.gdriveIsTeacher,
        viewport: {
            x: -state.pan.x / state.zoom,
            y: -state.pan.y / state.zoom,
            width: canvas.width / state.zoom,
            height: canvas.height / state.zoom
        }
    });
}

/**
 * Registra y actualiza la ubicación en tiempo real de los alumnos conectados
 */
function updateStudentViewportData(data) {
    const existingIdx = state.connectedStudents.findIndex(s => s.id === data.senderId);
    const studentInfo = {
        id: data.senderId,
        name: data.user.name || 'Alumno',
        picture: data.user.picture || 'https://placehold.co/40x40/3b82f6/ffffff?text=A',
        email: data.user.email,
        isTeacher: data.isTeacher,
        viewport: data.viewport,
        lastSeen: Date.now()
    };

    if (existingIdx >= 0) {
        state.connectedStudents[existingIdx] = studentInfo;
    } else {
        state.connectedStudents.push(studentInfo);
    }

    // Limpiar usuarios inactivos por más de 5 segundos
    const now = Date.now();
    state.connectedStudents = state.connectedStudents.filter(s => now - s.lastSeen < 5000);

    updateConnectedCountUI();
    if (renderCallback) renderCallback();
}

/**
 * Actualiza el contador de alumnos en la interfaz
 */
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
            img.src = student.picture;
            img.title = `${student.name} (${student.email})`;
            img.className = 'w-6 h-6 rounded-full border-2 border-indigo-500 object-cover shadow-sm';
            avatarsContainer.appendChild(img);
        });
    }
}

/**
 * Ajusta la visibilidad de herramientas de edición para alumnos si el profesor bloquea el dibujo
 */
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

/**
 * Genera un identificador único por sesión
 */
function getUserId() {
    if (!window._uniqueSessionUserId) {
        window._uniqueSessionUserId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }
    return window._uniqueSessionUserId;
}