// ESTADO GLOBAL DE LA APLICACIÓN Y REGISTRO DE HISTORIAL (UNDO/REDO)

export const state = {
  // Pizarra y Lienzo
  elements: [],
  selectedIds: [],
  
  // Transformación de la Vista (Zoom y Pan)
  scale: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  lastMouseX: 0,
  lastMouseY: 0,

  // Herramienta y Estilo Activo
  activeTool: 'select', // 'select', 'hand', 'sticky', 'text', 'pencil', 'highlighter', 'shape', 'connector', 'eraser', 'image'
  activeShape: 'rect', // 'rect', 'rounded-rect', 'circle', 'diamond', 'triangle', 'hexagon', 'star', 'bubble'
  activeConnector: 'line', // 'line', 'arrow', 'curved', 'orthogonal', 'curved-arrow'
  strokeColor: '#1e293b',
  fillColor: 'transparent',
  strokeWidth: 3,
  strokeStyle: 'solid', // 'solid', 'dashed', 'dotted'
  opacity: 1,
  startArrow: 'none', // 'none', 'start', 'end', 'both'
  endArrow: 'none',
  fontSize: 16,
  stickyColor: '#fef08a',
  highlighterColor: 'rgba(250, 204, 21, 0.45)',
  highlighterWidth: 20,

  // Estados de Interacción
  isDrawing: false,
  isDragging: false,
  isResizing: false,
  resizeHandle: null,
  dragStart: { x: 0, y: 0 },
  currentDraftElement: null,

  // Puntos del Conector en Edición
  selectedConnectorPoint: null,

  // Configuración de Grilla y Guías
  gridType: 'grid', // 'none', 'grid', 'dots'
  gridSize: 30,
  enableSnapGuides: true,      // Guías de alineación magnetizadas
  enableLineJoinAssist: true,  // Asistencia para unificación de líneas
  orthoMode: false,            // Modo ortogonal restringido a X/Y estilo AutoCAD

  // Modo Oscuro
  isDarkMode: false,

  // Integración Google Drive y Roles
  gdriveClientId: '228340156976-5qlnsc03v8hhgip90f7q9l4f4ll6cqlp.apps.googleusercontent.com',
  gdriveTeacherEmail: 'profe.diego.pizarra@gmail.com',
  gdriveScopes: 'https://www.googleapis.com/auth/drive',
  gdriveAccessToken: null,
  gdriveUser: null,
  gdriveIsTeacher: false,
  gdriveCurrentUserEmail: null,
  gdriveActiveFileId: null,
  gdriveFolderHistory: [{ id: '1zHh9tJvJkL4fG4H_vQ8e0aX4y4m1Y3Z', name: 'Raíz' }],
  gdriveRootFolderId: '1zHh9tJvJkL4fG4H_vQ8e0aX4y4m1Y3Z',
  gdriveClipboardFile: null,
  gdriveAutoSync: true,

  // Colaboración en Tiempo Real y Permisos de Alumnos
  allowStudentDrawing: false,   // Permiso de dibujo concedido a alumnos por el profesor
  showStudentCursors: true,     // Mostrar/Ocultar punteros y ubicaciones de alumnos
  connectedUsers: [],           // Usuarios conectados en la sala en tiempo real
  activeBoardInfo: { fileId: null, fileName: 'Pizarra Libre' } // Información de la clase activa del profesor
};

// Pilas de Historial (Deshacer / Rehacer)
const undoStack = [];
const redoStack = [];
const MAX_UNDO_STEPS = 40;

/**
 * Guarda una captura del estado actual de la pizarra para la función Deshacer
 */
export function saveState() {
  const snapshot = JSON.stringify(state.elements);
  if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== snapshot) {
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO_STEPS) {
      undoStack.shift();
    }
    redoStack.length = 0;
    saveToLocalStorage();
  }
}

/**
 * Restaura el estado anterior de la pizarra
 */
export function undo(renderCallback) {
  if (undoStack.length > 1) {
    const currentState = undoStack.pop();
    redoStack.push(currentState);
    const previousState = undoStack[undoStack.length - 1];
    state.elements = JSON.parse(previousState);
    state.selectedIds = [];
    saveToLocalStorage();
    if (renderCallback) renderCallback();
  }
}

/**
 * Rehace la última acción deshecha
 */
export function redo(renderCallback) {
  if (redoStack.length > 0) {
    const nextState = redoStack.pop();
    undoStack.push(nextState);
    state.elements = JSON.parse(nextState);
    state.selectedIds = [];
    saveToLocalStorage();
    if (renderCallback) renderCallback();
  }
}

/**
 * Restablece o carga un snapshot directo en el estado
 */
export function restoreSnapshot(jsonString, renderCallback) {
  try {
    const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    if (Array.isArray(parsed)) {
      state.elements = parsed;
      state.selectedIds = [];
      saveState();
      if (renderCallback) renderCallback();
    }
  } catch (err) {
    console.error("Error al restaurar snapshot en state.js:", err);
  }
}

/**
 * Limpia la pizarra completa
 */
export function resetState(renderCallback) {
  state.elements = [];
  state.selectedIds = [];
  saveState();
  if (renderCallback) renderCallback();
}

/**
 * Elimina los elementos seleccionados
 */
export function deleteSelectedElements(renderCallback) {
  if (state.selectedIds.length === 0) return;
  state.elements = state.elements.filter(el => !state.selectedIds.includes(el.id));
  state.selectedIds = [];
  saveState();
  if (renderCallback) renderCallback();
}

/**
 * Duplica los elementos seleccionados desplazándolos ligeramente
 */
export function duplicateSelectedElements(renderCallback) {
  if (state.selectedIds.length === 0) return;
  const newElements = [];
  const newIds = [];

  state.elements.forEach(el => {
    if (state.selectedIds.includes(el.id)) {
      const copy = JSON.parse(JSON.stringify(el));
      copy.id = 'el_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      if (copy.x !== undefined) copy.x += 20;
      if (copy.y !== undefined) copy.y += 20;
      if (copy.points) {
        copy.points = copy.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
      }
      if (copy.startPoint) {
        copy.startPoint.x += 20; copy.startPoint.y += 20;
      }
      if (copy.endPoint) {
        copy.endPoint.x += 20; copy.endPoint.y += 20;
      }
      newElements.push(copy);
      newIds.push(copy.id);
    }
  });

  state.elements.push(...newElements);
  state.selectedIds = newIds;
  saveState();
  if (renderCallback) renderCallback();
}

/**
 * Trae al frente los elementos seleccionados
 */
export function bringToFront(renderCallback) {
  if (state.selectedIds.length === 0) return;
  const selected = state.elements.filter(el => state.selectedIds.includes(el.id));
  const unselected = state.elements.filter(el => !state.selectedIds.includes(el.id));
  state.elements = [...unselected, ...selected];
  saveState();
  if (renderCallback) renderCallback();
}

/**
 * Envía al fondo los elementos seleccionados
 */
export function sendToBack(renderCallback) {
  if (state.selectedIds.length === 0) return;
  const selected = state.elements.filter(el => state.selectedIds.includes(el.id));
  const unselected = state.elements.filter(el => !state.selectedIds.includes(el.id));
  state.elements = [...selected, ...unselected];
  saveState();
  if (renderCallback) renderCallback();
}

/**
 * Guardado automático de respaldo en LocalStorage
 */
export function saveToLocalStorage() {
  try {
    localStorage.setItem('profediego_board_elements', JSON.stringify(state.elements));
  } catch (e) {
    console.warn("No se pudo guardar en LocalStorage:", e);
  }
}

/**
 * Carga inicial desde LocalStorage
 */
export function loadFromLocalStorage(renderCallback) {
  try {
    const saved = localStorage.getItem('profediego_board_elements');
    if (saved) {
      state.elements = JSON.parse(saved);
      if (renderCallback) renderCallback();
    }
  } catch (e) {
    console.warn("Error cargando desde LocalStorage:", e);
  }
}