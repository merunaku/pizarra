// CONTROLADOR DE INTERFAZ DE USUARIO Y EVENTOS DE PANELES (UI CONTROLLER)
import { 
  state, 
  saveState, 
  undo, 
  redo, 
  resetState, 
  deleteSelectedElements, 
  duplicateSelectedElements, 
  bringToFront, 
  sendToBack 
} from './state.js';
import { render } from './canvasEngine.js';
import { setStudentDrawingPermission } from './firebaseSync.js';

let renderCb = null;

/**
 * Inicializa todos los escuchadores de eventos para la interfaz gráfica
 * @param {Function} renderFn - Callback de renderizado del canvas
 */
export function setupUIController(renderFn) {
  renderCb = renderFn;

  // 1. Selector de Herramientas Principal en Barra Lateral
  setupToolbarButtons();

  // 2. Menús Desplegables (Flyouts) de Opciones
  setupFlyoutMenus();

  // 3. Barra Contextual Flotante de Propiedades (#context-toolbar)
  setupContextToolbarEvents();

  // 4. Botones de la Barra Superior (Navbar)
  setupHeaderControls();

  // 5. Ajustes de Dibujo, Guías, Modo Ortogonal y Permisos de Alumnos
  setupDrawingSettingToggles();

  // 6. Controles de Zoom y Minimapa
  setupZoomAndMinimapControls();

  // 7. Modales (Plantillas, Limpieza de Pizarra, Exportación)
  setupModalsAndTemplates();

  // 8. Opciones de Exportación e Importación (PNG, SVG, JSON)
  setupExportImport();
}

/**
 * Muestra una notificación emergente tipo Toast en la pantalla
 * @param {string} message - Mensaje a mostrar
 * @param {string} iconClass - Clase FontAwesome del icono
 */
export function showToast(message, iconClass = 'fa-solid fa-circle-check') {
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  if (!toast || !toastMsg || !toastIcon) return;

  toastMsg.innerText = message;
  toastIcon.className = `${iconClass} text-indigo-600 dark:text-indigo-400`;

  toast.classList.remove('opacity-0', 'translate-y-2', 'pointer-events-none');
  toast.classList.add('opacity-100', 'translate-y-0');

  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
  }, 2500);
}

/**
 * Configura la selección de herramientas de la barra lateral izquierda
 */
function setupToolbarButtons() {
  const toolButtons = document.querySelectorAll('#main-sidebar .tool-btn');
  toolButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.flyout-menu')) return;

      const tool = btn.dataset.tool;
      if (!tool) return;

      state.activeTool = tool;

      toolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      closeAllFlyouts();
      updateContextToolbar();
      if (renderCb) renderCb();
    });
  });
}

/**
 * Gestiona la apertura/cierre de submenús flotantes (Flyouts)
 */
function setupFlyoutMenus() {
  const flyoutButtons = document.querySelectorAll('.has-flyout');

  flyoutButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const flyoutId = btn.dataset.flyout;
      const targetFlyout = document.getElementById(flyoutId);

      if (!targetFlyout) return;

      const isCurrentlyHidden = targetFlyout.classList.contains('hidden');
      closeAllFlyouts();

      if (isCurrentlyHidden) {
        targetFlyout.classList.remove('hidden');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.has-flyout') && !e.target.closest('.flyout-menu')) {
      closeAllFlyouts();
    }
  });

  // Color de Nota Adhesiva
  document.querySelectorAll('.sticky-color-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      state.stickyColor = opt.dataset.color;
      showToast('Color de nota adhesiva actualizado', 'fa-solid fa-note-sticky');
      closeAllFlyouts();
    });
  });

  // Color de Lápiz
  document.querySelectorAll('.pencil-color-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.pencil-color-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      state.strokeColor = opt.dataset.color;
    });
  });

  // Grosor de Lápiz
  const pencilWidthSlider = document.getElementById('pencil-width-slider');
  const pencilWidthVal = document.getElementById('pencil-width-val');
  if (pencilWidthSlider) {
    pencilWidthSlider.addEventListener('input', (e) => {
      state.strokeWidth = parseInt(e.target.value, 10);
      if (pencilWidthVal) pencilWidthVal.innerText = `${state.strokeWidth}px`;
    });
  }

  // Flecha en Trazo de Lápiz Libre
  document.querySelectorAll('.pencil-arrow-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.pencil-arrow-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const arrowMode = btn.dataset.arrow;
      if (arrowMode === 'start') {
        state.startArrow = 'start';
        state.endArrow = 'none';
      } else if (arrowMode === 'end') {
        state.startArrow = 'none';
        state.endArrow = 'end';
      } else if (arrowMode === 'both') {
        state.startArrow = 'start';
        state.endArrow = 'end';
      } else {
        state.startArrow = 'none';
        state.endArrow = 'none';
      }
    });
  });

  // Color de Destacador
  document.querySelectorAll('.hl-color-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.hl-color-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      state.highlighterColor = opt.dataset.color;
    });
  });

  // Grosor de Destacador
  const hlWidthSlider = document.getElementById('hl-width-slider');
  const hlWidthVal = document.getElementById('hl-width-val');
  if (hlWidthSlider) {
    hlWidthSlider.addEventListener('input', (e) => {
      state.highlighterWidth = parseInt(e.target.value, 10);
      if (hlWidthVal) hlWidthVal.innerText = `${state.highlighterWidth}px`;
    });
  }

  // Opciones de Formas Geométricas
  document.querySelectorAll('.shape-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeTool = 'shape';
      state.activeShape = opt.dataset.shape;

      document.querySelectorAll('#main-sidebar .tool-btn').forEach(b => b.classList.remove('active'));
      const shapeBtn = document.querySelector('[data-tool="shape"]');
      if (shapeBtn) shapeBtn.classList.add('active');

      closeAllFlyouts();
      updateContextToolbar();
    });
  });

  // Opciones de Conectores
  document.querySelectorAll('.conn-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeTool = 'connector';
      state.activeConnector = opt.dataset.conn;

      document.querySelectorAll('#main-sidebar .tool-btn').forEach(b => b.classList.remove('active'));
      const connBtn = document.querySelector('[data-tool="connector"]');
      if (connBtn) connBtn.classList.add('active');

      closeAllFlyouts();
      updateContextToolbar();
    });
  });
}

function closeAllFlyouts() {
  document.querySelectorAll('.flyout-menu').forEach(f => f.classList.add('hidden'));
}

/**
 * Actualiza la visibilidad y valores de los controles de la barra contextual flotante
 */
export function updateContextToolbar() {
  const toolbar = document.getElementById('context-toolbar');
  if (!toolbar) return;

  if (state.selectedIds.length === 0 && state.activeTool === 'select') {
    toolbar.classList.add('hidden');
    return;
  }

  toolbar.classList.remove('hidden');

  const groupFill = document.getElementById('ctx-group-fill');
  const groupStroke = document.getElementById('ctx-group-stroke');
  const groupWidth = document.getElementById('ctx-group-width');
  const groupConnStyle = document.getElementById('ctx-group-conn-style');
  const groupConnArrows = document.getElementById('ctx-group-conn-arrows');
  const groupArrowSize = document.getElementById('ctx-group-arrow-size');
  const groupFont = document.getElementById('ctx-group-font');
  const groupSmoothing = document.getElementById('ctx-group-smoothing');
  const btnJoinLines = document.getElementById('ctx-join-lines');

  if (state.selectedIds.length > 0) {
    const primaryEl = state.elements.find(el => el.id === state.selectedIds[0]);
    if (primaryEl) {
      if (groupFill) groupFill.style.display = (primaryEl.type === 'shape') ? 'flex' : 'none';
      if (groupConnStyle) groupConnStyle.style.display = (primaryEl.type === 'connector') ? 'flex' : 'none';
      if (groupConnArrows) groupConnArrows.style.display = (primaryEl.type === 'connector' || primaryEl.type === 'pencil') ? 'flex' : 'none';
      if (groupArrowSize) groupArrowSize.style.display = (primaryEl.type === 'connector' || primaryEl.type === 'pencil') ? 'flex' : 'none';
      if (groupFont) groupFont.style.display = (primaryEl.type === 'text' || primaryEl.type === 'sticky') ? 'flex' : 'none';
      if (groupSmoothing) groupSmoothing.style.display = (primaryEl.type === 'pencil') ? 'flex' : 'none';

      // Mostrar botón "Unir Líneas" si hay 2 o más trazos/líneas seleccionadas
      if (btnJoinLines) {
        const selectedPencils = state.elements.filter(el => state.selectedIds.includes(el.id) && (el.type === 'pencil' || el.type === 'connector'));
        btnJoinLines.classList.toggle('hidden', selectedPencils.length < 2);
      }

      const strokeInput = document.getElementById('ctx-stroke-color');
      const fillInput = document.getElementById('ctx-fill-color');
      const widthInput = document.getElementById('ctx-stroke-width');
      const opacityInput = document.getElementById('ctx-opacity');
      const connLineSelect = document.getElementById('ctx-conn-line');
      const arrowSizeInput = document.getElementById('ctx-arrow-size');

      if (strokeInput && primaryEl.strokeColor) strokeInput.value = primaryEl.strokeColor;
      if (fillInput && primaryEl.fillColor) fillInput.value = primaryEl.fillColor;
      if (widthInput && primaryEl.strokeWidth) widthInput.value = primaryEl.strokeWidth;
      if (opacityInput && primaryEl.opacity !== undefined) opacityInput.value = primaryEl.opacity;
      if (connLineSelect && primaryEl.connectorType) connLineSelect.value = primaryEl.connectorType;
      if (arrowSizeInput && primaryEl.arrowSize) arrowSizeInput.value = primaryEl.arrowSize;
    }
  } else {
    if (groupFill) groupFill.style.display = (state.activeTool === 'shape') ? 'flex' : 'none';
    if (groupConnStyle) groupConnStyle.style.display = (state.activeTool === 'connector') ? 'flex' : 'none';
    if (groupConnArrows) groupConnArrows.style.display = (state.activeTool === 'connector' || state.activeTool === 'pencil') ? 'flex' : 'none';
    if (groupArrowSize) groupArrowSize.style.display = (state.activeTool === 'connector' || state.activeTool === 'pencil') ? 'flex' : 'none';
    if (groupFont) groupFont.style.display = (state.activeTool === 'text' || state.activeTool === 'sticky') ? 'flex' : 'none';
    if (groupSmoothing) groupSmoothing.style.display = (state.activeTool === 'pencil') ? 'flex' : 'none';
    if (btnJoinLines) btnJoinLines.classList.add('hidden');
  }
}

/**
 * Configura los eventos de los controles de la barra flotante (#context-toolbar)
 */
function setupContextToolbarEvents() {
  const fillColorInput = document.getElementById('ctx-fill-color');
  if (fillColorInput) {
    fillColorInput.addEventListener('input', (e) => {
      state.fillColor = e.target.value;
      applyPropertyToSelection('fillColor', e.target.value);
    });
  }

  const strokeColorInput = document.getElementById('ctx-stroke-color');
  if (strokeColorInput) {
    strokeColorInput.addEventListener('input', (e) => {
      state.strokeColor = e.target.value;
      applyPropertyToSelection('strokeColor', e.target.value);
    });
  }

  const strokeWidthInput = document.getElementById('ctx-stroke-width');
  if (strokeWidthInput) {
    strokeWidthInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.strokeWidth = val;
      applyPropertyToSelection('strokeWidth', val);
    });
  }

  const strokeStyleInput = document.getElementById('ctx-stroke-style');
  if (strokeStyleInput) {
    strokeStyleInput.addEventListener('change', (e) => {
      state.strokeStyle = e.target.value;
      applyPropertyToSelection('strokeStyle', e.target.value);
    });
  }

  const connLineSelect = document.getElementById('ctx-conn-line');
  if (connLineSelect) {
    connLineSelect.addEventListener('change', (e) => {
      state.activeConnector = e.target.value;
      applyPropertyToSelection('connectorType', e.target.value);
    });
  }

  // Flechas en Barra Contextual
  document.querySelectorAll('.ctx-arrow-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ctx-arrow-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.arrow;

      if (mode === 'start') {
        applyPropertyToSelection('startArrow', 'start');
        applyPropertyToSelection('endArrow', 'none');
      } else if (mode === 'end') {
        applyPropertyToSelection('startArrow', 'none');
        applyPropertyToSelection('endArrow', 'end');
      } else if (mode === 'both') {
        applyPropertyToSelection('startArrow', 'start');
        applyPropertyToSelection('endArrow', 'end');
      } else {
        applyPropertyToSelection('startArrow', 'none');
        applyPropertyToSelection('endArrow', 'none');
      }
    });
  });

  const arrowSizeInput = document.getElementById('ctx-arrow-size');
  if (arrowSizeInput) {
    arrowSizeInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      applyPropertyToSelection('arrowSize', val);
    });
  }

  const fontSizeInput = document.getElementById('ctx-font-size');
  if (fontSizeInput) {
    fontSizeInput.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      state.fontSize = val;
      applyPropertyToSelection('fontSize', val);
    });
  }

  const opacityInput = document.getElementById('ctx-opacity');
  if (opacityInput) {
    opacityInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.opacity = val;
      applyPropertyToSelection('opacity', val);
    });
  }

  const btnToggleJumps = document.getElementById('ctx-toggle-jumps');
  if (btnToggleJumps) {
    btnToggleJumps.addEventListener('click', () => {
      if (state.selectedIds.length > 0) {
        state.elements.forEach(el => {
          if (state.selectedIds.includes(el.id) && el.type === 'connector') {
            el.enableBridgeJumps = !el.enableBridgeJumps;
          }
        });
        saveState();
        if (renderCb) renderCb();
        showToast('Arcos en cruces conmutados', 'fa-solid fa-bridge');
      }
    });
  }

  const btnAddPoint = document.getElementById('ctx-add-point');
  if (btnAddPoint) {
    btnAddPoint.addEventListener('click', () => {
      if (state.selectedIds.length === 1) {
        const el = state.elements.find(e => e.id === state.selectedIds[0]);
        if (el && el.type === 'connector') {
          if (!el.controlPoints) el.controlPoints = [];
          const midX = (el.startPoint.x + el.endPoint.x) / 2;
          const midY = (el.startPoint.y + el.endPoint.y) / 2;
          el.controlPoints.push({ x: midX, y: midY - 30 });
          saveState();
          if (renderCb) renderCb();
          showToast('Punto de control añadido', 'fa-solid fa-circle-plus');
        }
      }
    });
  }

  const btnRemovePoint = document.getElementById('ctx-remove-point');
  if (btnRemovePoint) {
    btnRemovePoint.addEventListener('click', () => {
      if (state.selectedIds.length === 1) {
        const el = state.elements.find(e => e.id === state.selectedIds[0]);
        if (el && el.type === 'connector' && el.controlPoints && el.controlPoints.length > 0) {
          el.controlPoints.pop();
          saveState();
          if (renderCb) renderCb();
          showToast('Punto de control eliminado', 'fa-solid fa-circle-minus');
        }
      }
    });
  }

  const btnEditText = document.getElementById('ctx-edit-text');
  if (btnEditText) {
    btnEditText.addEventListener('click', () => {
      if (state.selectedIds.length === 1) {
        const el = state.elements.find(e => e.id === state.selectedIds[0]);
        if (el && (el.type === 'text' || el.type === 'sticky')) {
          const newText = prompt('Editar texto:', el.text || '');
          if (newText !== null) {
            el.text = newText;
            saveState();
            if (renderCb) renderCb();
          }
        }
      }
    });
  }

  const btnJoinLines = document.getElementById('ctx-join-lines');
  if (btnJoinLines) {
    btnJoinLines.addEventListener('click', () => {
      if (state.selectedIds.length >= 2) {
        const selected = state.elements.filter(el => state.selectedIds.includes(el.id) && (el.type === 'pencil' || el.type === 'connector'));
        if (selected.length >= 2) {
          let mergedPoints = [];
          selected.forEach(el => {
            if (el.points) mergedPoints.push(...el.points);
            else if (el.startPoint && el.endPoint) mergedPoints.push(el.startPoint, el.endPoint);
          });

          const newEl = {
            id: 'el_' + Date.now(),
            type: 'pencil',
            points: mergedPoints,
            strokeColor: selected[0].strokeColor || state.strokeColor,
            strokeWidth: selected[0].strokeWidth || state.strokeWidth,
            opacity: selected[0].opacity || 1
          };

          state.elements = state.elements.filter(el => !state.selectedIds.includes(el.id));
          state.elements.push(newEl);
          state.selectedIds = [newEl.id];
          saveState();
          if (renderCb) renderCb();
          showToast('Líneas unidas en un único trazo', 'fa-solid fa-link');
        }
      }
    });
  }

  const btnDelete = document.getElementById('ctx-delete');
  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      deleteSelectedElements(renderCb);
      updateContextToolbar();
    });
  }

  const btnDuplicate = document.getElementById('ctx-duplicate');
  if (btnDuplicate) {
    btnDuplicate.addEventListener('click', () => {
      duplicateSelectedElements(renderCb);
    });
  }

  const btnBringFront = document.getElementById('ctx-bring-front');
  if (btnBringFront) {
    btnBringFront.addEventListener('click', () => {
      bringToFront(renderCb);
    });
  }

  const btnSendBack = document.getElementById('ctx-send-back');
  if (btnSendBack) {
    btnSendBack.addEventListener('click', () => {
      sendToBack(renderCb);
    });
  }
}

function applyPropertyToSelection(prop, value) {
  if (state.selectedIds.length === 0) return;
  state.elements.forEach(el => {
    if (state.selectedIds.includes(el.id)) {
      el[prop] = value;
    }
  });
  saveState();
  if (renderCb) renderCb();
}

/**
 * Configura los botones de la barra superior (Navbar)
 */
function setupHeaderControls() {
  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) btnUndo.addEventListener('click', () => undo(renderCb));

  const btnRedo = document.getElementById('btn-redo');
  if (btnRedo) btnRedo.addEventListener('click', () => redo(renderCb));

  const btnDark = document.getElementById('btn-toggle-darkmode');
  if (btnDark) {
    btnDark.addEventListener('click', () => {
      state.isDarkMode = !state.isDarkMode;
      document.documentElement.classList.toggle('dark', state.isDarkMode);
      const icon = document.getElementById('darkmode-icon');
      if (icon) {
        icon.className = state.isDarkMode ? 'fa-solid fa-sun text-amber-400 text-sm' : 'fa-solid fa-moon text-slate-600 text-sm';
      }
      showToast(state.isDarkMode ? 'Modo Oscuro activado' : 'Modo Claro activado', state.isDarkMode ? 'fa-solid fa-moon' : 'fa-solid fa-sun');
      if (renderCb) renderCb();
    });
  }
}

/**
 * Configura los conmutadores de guías, asistencia de líneas, modo ortogonal y permisos
 */
function setupDrawingSettingToggles() {
  const snapToggle = document.getElementById('toggle-snap-guides');
  if (snapToggle) {
    snapToggle.checked = state.enableSnapGuides;
    snapToggle.addEventListener('change', (e) => {
      state.enableSnapGuides = e.target.checked;
      showToast(state.enableSnapGuides ? 'Guías magnetizadas activadas' : 'Guías desactivadas', 'fa-solid fa-compass');
    });
  }

  const lineJoinToggle = document.getElementById('toggle-line-join');
  if (lineJoinToggle) {
    lineJoinToggle.checked = state.enableLineJoinAssist;
    lineJoinToggle.addEventListener('change', (e) => {
      state.enableLineJoinAssist = e.target.checked;
      showToast(state.enableLineJoinAssist ? 'Asistencia para unificar líneas activada' : 'Asistencia desactivada', 'fa-solid fa-link');
    });
  }

  const orthoToggle = document.getElementById('toggle-ortho-mode');
  if (orthoToggle) {
    orthoToggle.checked = state.orthoMode;
    orthoToggle.addEventListener('change', (e) => {
      state.orthoMode = e.target.checked;
      showToast(state.orthoMode ? 'Modo Ortogonal AutoCAD Activado' : 'Modo Ortogonal Desactivado', 'fa-solid fa-ruler-combined');
    });
  }

  const allowStudentsToggle = document.getElementById('toggle-allow-students');
  if (allowStudentsToggle) {
    allowStudentsToggle.addEventListener('change', (e) => {
      state.allowStudentDrawing = e.target.checked;
      if (typeof setStudentDrawingPermission === 'function') {
        setStudentDrawingPermission(e.target.checked);
      }
    });
  }
}

/**
 * Controles de zoom y minimapa
 */
function setupZoomAndMinimapControls() {
  const btnZoomIn = document.getElementById('btn-zoom-in');
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      state.scale = Math.min(state.scale * 1.2, 8);
      updateZoomDropdownValue();
      if (renderCb) renderCb();
    });
  }

  const btnZoomOut = document.getElementById('btn-zoom-out');
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      state.scale = Math.max(state.scale / 1.2, 0.1);
      updateZoomDropdownValue();
      if (renderCb) renderCb();
    });
  }

  const zoomDropdown = document.getElementById('zoom-dropdown');
  if (zoomDropdown) {
    zoomDropdown.addEventListener('change', (e) => {
      state.scale = parseFloat(e.target.value);
      if (renderCb) renderCb();
    });
  }

  const btnZoomFit = document.getElementById('btn-zoom-fit');
  if (btnZoomFit) {
    btnZoomFit.addEventListener('click', () => {
      state.scale = 1.0;
      state.panX = 0;
      state.panY = 0;
      updateZoomDropdownValue();
      if (renderCb) renderCb();
    });
  }

  const btnMinimap = document.getElementById('btn-toggle-minimap');
  if (btnMinimap) {
    btnMinimap.addEventListener('click', () => {
      const container = document.getElementById('minimap-container');
      if (container) {
        container.classList.toggle('hidden');
      }
    });
  }
}

function updateZoomDropdownValue() {
  const dropdown = document.getElementById('zoom-dropdown');
  if (dropdown) {
    dropdown.value = state.scale.toFixed(1);
  }
}

/**
 * Modales de confirmación y plantillas educativas
 */
function setupModalsAndTemplates() {
  // Modal Limpieza
  const btnClear = document.getElementById('btn-clear-board');
  const modalClear = document.getElementById('modal-confirm-clear');
  const btnConfirmClear = document.getElementById('btn-confirm-clear');
  const btnCancelClear = document.getElementById('btn-cancel-clear');

  if (btnClear && modalClear) {
    btnClear.addEventListener('click', () => modalClear.classList.remove('hidden'));
  }
  if (btnCancelClear && modalClear) {
    btnCancelClear.addEventListener('click', () => modalClear.classList.add('hidden'));
  }
  if (btnConfirmClear && modalClear) {
    btnConfirmClear.addEventListener('click', () => {
      resetState(renderCb);
      modalClear.classList.add('hidden');
      showToast('Pizarra limpiada por completo', 'fa-solid fa-trash-can');
    });
  }

  // Modal Plantillas
  const btnTemplates = document.getElementById('btn-templates-toggle');
  const modalTemplates = document.getElementById('templates-modal');
  const btnCloseTemplates = document.getElementById('btn-close-templates');

  if (btnTemplates && modalTemplates) {
    btnTemplates.addEventListener('click', () => modalTemplates.classList.remove('hidden'));
  }
  if (btnCloseTemplates && modalTemplates) {
    btnCloseTemplates.addEventListener('click', () => modalTemplates.classList.add('hidden'));
  }

  document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.dataset.type;
      loadTemplate(type);
      if (modalTemplates) modalTemplates.classList.add('hidden');
    });
  });
}

/**
 * Carga plantillas en el lienzo
 */
function loadTemplate(type) {
  if (type === 'kanban') {
    state.elements.push(
      { id: 't_1', type: 'shape', shapeType: 'rect', x: 100, y: 100, width: 250, height: 400, strokeColor: '#3b82f6', fillColor: 'rgba(239, 246, 255, 0.7)', strokeWidth: 2 },
      { id: 't_2', type: 'text', x: 120, y: 115, text: 'POR HACER', fontSize: 20, strokeColor: '#1e40af' },
      { id: 't_3', type: 'shape', shapeType: 'rect', x: 380, y: 100, width: 250, height: 400, strokeColor: '#f59e0b', fillColor: 'rgba(254, 243, 199, 0.7)', strokeWidth: 2 },
      { id: 't_4', type: 'text', x: 400, y: 115, text: 'EN PROCESO', fontSize: 20, strokeColor: '#92400e' },
      { id: 't_5', type: 'shape', shapeType: 'rect', x: 660, y: 100, width: 250, height: 400, strokeColor: '#10b981', fillColor: 'rgba(209, 250, 229, 0.7)', strokeWidth: 2 },
      { id: 't_6', type: 'text', x: 680, y: 115, text: 'HECHO', fontSize: 20, strokeColor: '#065f46' }
    );
  } else if (type === 'mindmap') {
    state.elements.push(
      { id: 'm_central', type: 'shape', shapeType: 'rounded-rect', x: 400, y: 250, width: 180, height: 80, strokeColor: '#6366f1', fillColor: '#e0e7ff', strokeWidth: 3 },
      { id: 'm_text_central', type: 'text', x: 430, y: 275, text: 'Idea Central', fontSize: 18, strokeColor: '#312e81' },
      { id: 'm_node1', type: 'shape', shapeType: 'circle', x: 180, y: 150, width: 110, height: 110, strokeColor: '#3b82f6', fillColor: '#dbeafe', strokeWidth: 2 },
      { id: 'm_conn1', type: 'connector', connectorType: 'curved', startPoint: { x: 290, y: 205 }, endPoint: { x: 400, y: 270 }, strokeColor: '#3b82f6', strokeWidth: 2 }
    );
  } else if (type === 'retrospective') {
    state.elements.push(
      { id: 'r_1', type: 'shape', shapeType: 'rect', x: 100, y: 100, width: 380, height: 220, strokeColor: '#10b981', fillColor: 'rgba(209, 250, 229, 0.6)', strokeWidth: 2 },
      { id: 'r_t1', type: 'text', x: 120, y: 120, text: '¿Qué funcionó bien?', fontSize: 18, strokeColor: '#065f46' },
      { id: 'r_2', type: 'shape', shapeType: 'rect', x: 500, y: 100, width: 380, height: 220, strokeColor: '#ef4444', fillColor: 'rgba(254, 226, 226, 0.6)', strokeWidth: 2 },
      { id: 'r_t2', type: 'text', x: 520, y: 120, text: '¿Qué se puede mejorar?', fontSize: 18, strokeColor: '#991b1b' },
      { id: 'r_3', type: 'shape', shapeType: 'rect', x: 100, y: 340, width: 780, height: 220, strokeColor: '#3b82f6', fillColor: 'rgba(219, 234, 254, 0.6)', strokeWidth: 2 },
      { id: 'r_t3', type: 'text', x: 120, y: 360, text: 'Compromisos y Acciones', fontSize: 18, strokeColor: '#1e40af' }
    );
  } else if (type === 'brainstorming') {
    state.elements.push(
      { id: 'b_title', type: 'text', x: 350, y: 60, text: 'Lluvia de Ideas - Módulo Colaborativo', fontSize: 22, strokeColor: '#4338ca' },
      { id: 'b_s1', type: 'sticky', x: 150, y: 140, width: 160, height: 160, text: 'Idea 1...', stickyColor: '#fef08a' },
      { id: 'b_s2', type: 'sticky', x: 340, y: 140, width: 160, height: 160, text: 'Idea 2...', stickyColor: '#bfdbfe' },
      { id: 'b_s3', type: 'sticky', x: 530, y: 140, width: 160, height: 160, text: 'Idea 3...', stickyColor: '#fbcfe8' },
      { id: 'b_s4', type: 'sticky', x: 720, y: 140, width: 160, height: 160, text: 'Idea 4...', stickyColor: '#bbf7d0' }
    );
  }
  saveState();
  if (renderCb) renderCb();
  showToast('Plantilla insertada con éxito', 'fa-solid fa-shapes');
}

/**
 * Configura los botones de exportación (PNG, SVG, JSON) e importación
 */
function setupExportImport() {
  const btnExportToggle = document.getElementById('btn-export-toggle');
  const menuExport = document.getElementById('menu-export');

  if (btnExportToggle && menuExport) {
    btnExportToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      menuExport.classList.toggle('hidden');
    });

    document.addEventListener('click', () => menuExport.classList.add('hidden'));
  }

  const exportPngBtn = document.getElementById('export-png');
  if (exportPngBtn) exportPngBtn.addEventListener('click', exportPNG);

  const exportSvgBtn = document.getElementById('export-svg');
  if (exportSvgBtn) exportSvgBtn.addEventListener('click', exportSVG);

  const exportJsonBtn = document.getElementById('export-json');
  if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportJSON);

  const inputImportJson = document.getElementById('input-import-json');
  if (inputImportJson) {
    inputImportJson.addEventListener('change', importJSON);
  }
}

function exportPNG() {
  const canvas = document.getElementById('board-canvas');
  if (!canvas) return;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  tempCtx.fillStyle = state.isDarkMode ? '#0f172a' : '#ffffff';
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(canvas, 0, 0);

  const link = document.createElement('a');
  link.download = `pizarra_${Date.now()}.png`;
  link.href = tempCanvas.toDataURL('image/png');
  link.click();

  showToast('Pizarra descargada como PNG', 'fa-regular fa-file-image');
}

function exportSVG() {
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${window.innerWidth}" height="${window.innerHeight}">`;
  svgContent += `<rect width="100%" height="100%" fill="${state.isDarkMode ? '#0f172a' : '#ffffff'}"/>`;

  state.elements.forEach(el => {
    if (el.type === 'shape' && el.shapeType === 'rect') {
      svgContent += `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${el.fillColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}"/>`;
    } else if (el.type === 'text') {
      svgContent += `<text x="${el.x}" y="${el.y + 16}" font-family="sans-serif" font-size="${el.fontSize || 16}" fill="${el.strokeColor}">${el.text}</text>`;
    }
  });

  svgContent += '</svg>';

  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const link = document.createElement('a');
  link.download = `pizarra_${Date.now()}.svg`;
  link.href = URL.createObjectURL(blob);
  link.click();

  showToast('Pizarra descargada como SVG', 'fa-solid fa-bezier-curve');
}

function exportJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.elements, null, 2));
  const link = document.createElement('a');
  link.download = `pizarra_backup_${Date.now()}.json`;
  link.href = dataStr;
  link.click();

  showToast('Respaldo local descargado (JSON)', 'fa-solid fa-file-code');
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (Array.isArray(parsed)) {
        state.elements = parsed;
        saveState();
        if (renderCb) renderCb();
        showToast('Pizarra cargada desde archivo JSON', 'fa-solid fa-file-import');
      }
    } catch (err) {
      alert('El archivo JSON no tiene un formato válido.');
    }
  };
  reader.readAsText(file);
}