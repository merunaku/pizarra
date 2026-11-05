// GESTIÓN DE HERRAMIENTAS, INTERACCIONES Y EVENTOS DEL PUNTERO
import { state, saveState, deleteSelectedElements, duplicateSelectedElements } from './state.js';
import { render, screenToWorld, getBoundingBox } from './canvasEngine.js';
import { broadcastBoardState, updateCursorPosition } from './firebaseSync.js';
import { showToast } from './uiController.js';

let canvas = null;
let isPointerDown = false;
let pointerStartWorld = { x: 0, y: 0 };
let pointerStartScreen = { x: 0, y: 0 };
let activeResizeHandle = null;
let originalElementBounds = null;

/**
 * Inicializa los eventos de puntero y teclado sobre el canvas
 * @param {HTMLCanvasElement} canvasElement 
 */
export function setupToolEvents(canvasElement) {
  canvas = canvasElement;

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // Accesos directos por teclado
  window.addEventListener('keydown', handleKeyDown);
}

/**
 * Manejador de evento PointerDown (Clic o toque inicial)
 */
function handlePointerDown(e) {
  // 1. Verificar si el usuario tiene permiso para modificar el lienzo
  if (!state.gdriveIsTeacher && !state.allowStudentDrawing && state.activeTool !== 'select' && state.activeTool !== 'hand') {
    showToast('El dibujo está deshabilitado por el Profesor', 'fa-solid fa-lock');
    return;
  }

  isPointerDown = true;
  canvas.setPointerCapture(e.pointerId);

  pointerStartScreen = { x: e.clientX, y: e.clientY };
  const worldPos = screenToWorld(e.clientX, e.clientY);
  pointerStartWorld = worldPos;

  // Modificador Espacio o botón central del ratón para desplazamiento (Pan)
  if (e.button === 1 || state.activeTool === 'hand' || e.spaceKey) {
    state.isPanning = true;
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;
    return;
  }

  // Ocultar editor de texto inline si estuviera abierto
  hideInlineTextEditor();

  // 2. Lógica según la herramienta activa
  switch (state.activeTool) {
    case 'select': {
      // Verificar si se hizo clic sobre un tirador de redimensionamiento de un elemento seleccionado
      if (state.selectedIds.length === 1) {
        const selectedEl = state.elements.find(el => el.id === state.selectedIds[0]);
        if (selectedEl) {
          const handle = getHandleAtPosition(selectedEl, worldPos);
          if (handle) {
            state.isResizing = true;
            activeResizeHandle = handle;
            originalElementBounds = { ...getBoundingBox(selectedEl) };
            return;
          }
        }
      }

      // Buscar si se hizo clic en un elemento existente
      const clickedEl = findElementAtPosition(worldPos);
      if (clickedEl) {
        if (e.shiftKey) {
          // Selección múltiple con Shift
          if (state.selectedIds.includes(clickedEl.id)) {
            state.selectedIds = state.selectedIds.filter(id => id !== clickedEl.id);
          } else {
            state.selectedIds.push(clickedEl.id);
          }
        } else {
          if (!state.selectedIds.includes(clickedEl.id)) {
            state.selectedIds = [clickedEl.id];
          }
        }
        state.isDragging = true;
        state.dragStart = worldPos;
      } else {
        if (!e.shiftKey) {
          state.selectedIds = [];
        }
      }
      break;
    }

    case 'pencil': {
      state.currentDraftElement = {
        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'pencil',
        strokeColor: state.strokeColor,
        strokeWidth: state.strokeWidth,
        strokeStyle: state.strokeStyle,
        opacity: state.opacity,
        startArrow: state.startArrow,
        endArrow: state.endArrow,
        points: [worldPos]
      };
      break;
    }

    case 'highlighter': {
      state.currentDraftElement = {
        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'highlighter',
        highlighterColor: state.highlighterColor,
        highlighterWidth: state.highlighterWidth,
        opacity: 0.5,
        points: [worldPos]
      };
      break;
    }

    case 'eraser': {
      state.currentDraftElement = {
        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'eraser',
        strokeWidth: state.strokeWidth * 3,
        points: [worldPos]
      };
      eraseElementsAtPosition(worldPos);
      break;
    }

    case 'shape': {
      state.currentDraftElement = {
        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'shape',
        shapeType: state.activeShape,
        x: worldPos.x,
        y: worldPos.y,
        width: 0,
        height: 0,
        strokeColor: state.strokeColor,
        fillColor: state.fillColor,
        strokeWidth: state.strokeWidth,
        strokeStyle: state.strokeStyle,
        opacity: state.opacity
      };
      break;
    }

    case 'connector': {
      let startPoint = worldPos;

      // Asistencia para unificación de líneas (Snap a puntos existentes)
      if (state.enableLineJoinAssist) {
        const snapPt = findSnapEndpoint(worldPos);
        if (snapPt) startPoint = snapPt;
      }

      state.currentDraftElement = {
        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'connector',
        connectorType: state.activeConnector,
        startPoint: startPoint,
        endPoint: startPoint,
        strokeColor: state.strokeColor,
        strokeWidth: state.strokeWidth,
        strokeStyle: state.strokeStyle,
        opacity: state.opacity,
        startArrow: state.startArrow,
        endArrow: state.endArrow
      };
      break;
    }

    case 'text': {
      const newTextEl = {
        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'text',
        x: worldPos.x,
        y: worldPos.y,
        text: 'Texto',
        fontSize: state.fontSize,
        strokeColor: state.strokeColor,
        opacity: state.opacity
      };
      state.elements.push(newTextEl);
      state.selectedIds = [newTextEl.id];
      saveState();
      broadcastBoardState(state.elements);
      triggerInlineTextEditor(newTextEl);
      break;
    }

    case 'sticky': {
      const newStickyEl = {
        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'sticky',
        x: worldPos.x,
        y: worldPos.y,
        width: 180,
        height: 180,
        text: 'Escribe una nota...',
        stickyColor: state.stickyColor,
        fontSize: state.fontSize,
        opacity: state.opacity
      };
      state.elements.push(newStickyEl);
      state.selectedIds = [newStickyEl.id];
      saveState();
      broadcastBoardState(state.elements);
      break;
    }
  }

  render();
}

/**
 * Manejador de evento PointerMove (Movimiento del cursor o toque)
 */
function handlePointerMove(e) {
  const worldPos = screenToWorld(e.clientX, e.clientY);

  // Transmitir posición del puntero en tiempo real a Firebase
  updateCursorPosition(worldPos.x, worldPos.y);

  // Arrastre de la cámara (Pan)
  if (state.isPanning) {
    state.panX += e.clientX - state.lastMouseX;
    state.panY += e.clientY - state.lastMouseY;
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;
    render();
    return;
  }

  if (!isPointerDown) return;

  // Redimensionamiento de elemento
  if (state.isResizing && state.selectedIds.length === 1 && activeResizeHandle) {
    const selectedEl = state.elements.find(el => el.id === state.selectedIds[0]);
    if (selectedEl) {
      applyResize(selectedEl, activeResizeHandle, worldPos);
      render();
    }
    return;
  }

  // Arrastre/Movimiento de elementos seleccionados
  if (state.isDragging && state.selectedIds.length > 0) {
    const dx = worldPos.x - state.dragStart.x;
    const dy = worldPos.y - state.dragStart.y;

    state.elements.forEach(el => {
      if (state.selectedIds.includes(el.id)) {
        if (el.x !== undefined) el.x += dx;
        if (el.y !== undefined) el.y += dy;
        if (el.points) {
          el.points.forEach(p => { p.x += dx; p.y += dy; });
        }
        if (el.startPoint) {
          el.startPoint.x += dx; el.startPoint.y += dy;
        }
        if (el.endPoint) {
          el.endPoint.x += dx; el.endPoint.y += dy;
        }
      }
    });

    state.dragStart = worldPos;
    render();
    return;
  }

  // Actualización de borrador en construcción
  if (state.currentDraftElement) {
    if (state.activeTool === 'pencil' || state.activeTool === 'highlighter') {
      let currentPoint = worldPos;

      // Restricción Ortogonal AutoCAD para trazo libre
      if (state.orthoMode && state.currentDraftElement.points.length > 0) {
        const lastPt = state.currentDraftElement.points[state.currentDraftElement.points.length - 1];
        const dx = Math.abs(currentPoint.x - lastPt.x);
        const dy = Math.abs(currentPoint.y - lastPt.y);
        if (dx > dy) currentPoint = { x: currentPoint.x, y: lastPt.y };
        else currentPoint = { x: lastPt.x, y: currentPoint.y };
      }

      state.currentDraftElement.points.push(currentPoint);
    } else if (state.activeTool === 'eraser') {
      state.currentDraftElement.points.push(worldPos);
      eraseElementsAtPosition(worldPos);
    } else if (state.activeTool === 'shape') {
      let currentX = worldPos.x;
      let currentY = worldPos.y;

      // Restricción Ortogonal Estilo AutoCAD (Ejes estrictos X/Y)
      if (state.orthoMode) {
        const dx = Math.abs(currentX - pointerStartWorld.x);
        const dy = Math.abs(currentY - pointerStartWorld.y);
        if (dx > dy) {
          currentY = pointerStartWorld.y; // Bloquear en eje X
        } else {
          currentX = pointerStartWorld.x; // Bloquear en eje Y
        }
      }

      state.currentDraftElement.width = currentX - pointerStartWorld.x;
      state.currentDraftElement.height = currentY - pointerStartWorld.y;
    } else if (state.activeTool === 'connector') {
      let endPoint = worldPos;

      // Restricción Ortogonal AutoCAD para Conectores y Flechas
      if (state.orthoMode) {
        const dx = Math.abs(endPoint.x - state.currentDraftElement.startPoint.x);
        const dy = Math.abs(endPoint.y - state.currentDraftElement.startPoint.y);
        if (dx > dy) {
          endPoint = { x: endPoint.x, y: state.currentDraftElement.startPoint.y };
        } else {
          endPoint = { x: state.currentDraftElement.startPoint.x, y: endPoint.y };
        }
      }

      // Asistencia para unificación de líneas
      if (state.enableLineJoinAssist) {
        const snapPt = findSnapEndpoint(endPoint);
        if (snapPt) endPoint = snapPt;
      }

      state.currentDraftElement.endPoint = endPoint;
    }

    render();
  }
}

/**
 * Manejador de evento PointerUp (Finalización de clic o toque)
 */
function handlePointerUp(e) {
  if (state.isPanning) {
    state.isPanning = false;
  }

  if (state.isResizing) {
    state.isResizing = false;
    activeResizeHandle = null;
    originalElementBounds = null;
    saveState();
    broadcastBoardState(state.elements);
  }

  if (state.isDragging) {
    state.isDragging = false;
    saveState();
    broadcastBoardState(state.elements);
  }

  if (state.currentDraftElement) {
    // Si la forma creada tiene dimensiones válidas o es un trazo, confirmarla
    if (state.activeTool === 'shape') {
      if (Math.abs(state.currentDraftElement.width) > 5 || Math.abs(state.currentDraftElement.height) > 5) {
        state.elements.push(state.currentDraftElement);
        saveState();
        broadcastBoardState(state.elements);
      }
    } else if (state.activeTool === 'connector') {
      const dist = Math.hypot(
        state.currentDraftElement.endPoint.x - state.currentDraftElement.startPoint.x,
        state.currentDraftElement.endPoint.y - state.currentDraftElement.startPoint.y
      );
      if (dist > 5) {
        state.elements.push(state.currentDraftElement);
        saveState();
        broadcastBoardState(state.elements);
      }
    } else if (state.activeTool === 'pencil' || state.activeTool === 'highlighter') {
      if (state.currentDraftElement.points.length > 1) {
        state.elements.push(state.currentDraftElement);
        saveState();
        broadcastBoardState(state.elements);
      }
    }

    state.currentDraftElement = null;
  }

  isPointerDown = false;
  if (canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
  render();
}

/**
 * Manejador de evento Wheel (Zoom y desplazamiento con rueda del ratón)
 */
function handleWheel(e) {
  e.preventDefault();

  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const newScale = Math.min(Math.max(state.scale * zoomFactor, 0.1), 8);

  const mouseX = e.clientX;
  const mouseY = e.clientY;

  state.panX = mouseX - (mouseX - state.panX) * (newScale / state.scale);
  state.panY = mouseY - (mouseY - state.panY) * (newScale / state.scale);
  state.scale = newScale;

  render();
}

/**
 * Atajos de teclado del sistema
 */
function handleKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelectedElements(render);
    broadcastBoardState(state.elements);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelectedElements(render);
    broadcastBoardState(state.elements);
  } else if (e.key.toLowerCase() === 'v') {
    state.activeTool = 'select';
  } else if (e.key.toLowerCase() === 'p') {
    state.activeTool = 'pencil';
  } else if (e.key.toLowerCase() === 'e') {
    state.activeTool = 'eraser';
  } else if (e.key.toLowerCase() === 't') {
    state.activeTool = 'text';
  }
}

/**
 * Busca un elemento en las coordenadas especificadas del mundo
 */
function findElementAtPosition(pos) {
  for (let i = state.elements.length - 1; i >= 0; i--) {
    const el = state.elements[i];
    const bbox = getBoundingBox(el);
    if (pos.x >= bbox.x && pos.x <= bbox.x + bbox.w && pos.y >= bbox.y && pos.y <= bbox.y + bbox.h) {
      return el;
    }
  }
  return null;
}

/**
 * Elimina elementos que colisionan con la posición de la goma de borrar
 */
function eraseElementsAtPosition(pos) {
  const threshold = 15;
  const toDelete = new Set();

  state.elements.forEach(el => {
    const bbox = getBoundingBox(el);
    if (pos.x >= bbox.x - threshold && pos.x <= bbox.x + bbox.w + threshold &&
        pos.y >= bbox.y - threshold && pos.y <= bbox.y + bbox.h + threshold) {
      toDelete.add(el.id);
    }
  });

  if (toDelete.size > 0) {
    state.elements = state.elements.filter(el => !toDelete.has(el.id));
    saveState();
    broadcastBoardState(state.elements);
  }
}

/**
 * Busca puntos extremos de conectores/líneas cercanos para alineación magnética
 */
function findSnapEndpoint(pos) {
  const SNAP_THRESHOLD = 16;
  for (const el of state.elements) {
    if (el.type === 'connector') {
      const distStart = Math.hypot(el.startPoint.x - pos.x, el.startPoint.y - pos.y);
      if (distStart < SNAP_THRESHOLD) return el.startPoint;

      const distEnd = Math.hypot(el.endPoint.x - pos.x, el.endPoint.y - pos.y);
      if (distEnd < SNAP_THRESHOLD) return el.endPoint;
    }
  }
  return null;
}

/**
 * Detecta si el cursor está sobre un tirador de esquina de selección
 */
function getHandleAtPosition(el, pos) {
  const bbox = getBoundingBox(el);
  const handleSize = 10 / state.scale;

  const handles = {
    'nw': { x: bbox.x, y: bbox.y },
    'ne': { x: bbox.x + bbox.w, y: bbox.y },
    'sw': { x: bbox.x, y: bbox.y + bbox.h },
    'se': { x: bbox.x + bbox.w, y: bbox.y + bbox.h }
  };

  for (const [key, hPos] of Object.entries(handles)) {
    if (Math.abs(pos.x - hPos.x) <= handleSize && Math.abs(pos.y - hPos.y) <= handleSize) {
      return key;
    }
  }
  return null;
}

/**
 * Aplica redimensionamiento a un elemento según el tirador seleccionado
 */
function applyResize(el, handle, pos) {
  if (!originalElementBounds) return;

  if (handle === 'se') {
    el.width = Math.max(20, pos.x - el.x);
    el.height = Math.max(20, pos.y - el.y);
  } else if (handle === 'sw') {
    const newW = originalElementBounds.x + originalElementBounds.w - pos.x;
    if (newW > 20) {
      el.x = pos.x;
      el.width = newW;
    }
    el.height = Math.max(20, pos.y - el.y);
  } else if (handle === 'ne') {
    el.width = Math.max(20, pos.x - el.x);
    const newH = originalElementBounds.y + originalElementBounds.h - pos.y;
    if (newH > 20) {
      el.y = pos.y;
      el.height = newH;
    }
  } else if (handle === 'nw') {
    const newW = originalElementBounds.x + originalElementBounds.w - pos.x;
    const newH = originalElementBounds.y + originalElementBounds.h - pos.y;
    if (newW > 20) {
      el.x = pos.x;
      el.width = newW;
    }
    if (newH > 20) {
      el.y = pos.y;
      el.height = newH;
    }
  }
}

/**
 * Despliega el editor de texto flotante inline sobre el canvas
 */
function triggerInlineTextEditor(textEl) {
  const editor = document.getElementById('inline-text-editor');
  if (!editor) return;

  const screenPos = {
    x: textEl.x * state.scale + state.panX,
    y: textEl.y * state.scale + state.panY
  };

  editor.style.left = `${screenPos.x}px`;
  editor.style.top = `${screenPos.y}px`;
  editor.style.fontSize = `${(textEl.fontSize || 16) * state.scale}px`;
  editor.style.color = textEl.strokeColor || '#1e293b';
  editor.value = textEl.text || '';
  editor.style.display = 'block';
  editor.focus();

  editor.oninput = () => {
    textEl.text = editor.value;
    render();
  };

  editor.onblur = () => {
    textEl.text = editor.value;
    hideInlineTextEditor();
    saveState();
    broadcastBoardState(state.elements);
    render();
  };
}

function hideInlineTextEditor() {
  const editor = document.getElementById('inline-text-editor');
  if (editor) {
    editor.style.display = 'none';
  }
}