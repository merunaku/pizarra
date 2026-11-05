// UI CONTROLLER & TOOLBAR ACTIONS - PIZARRA PROFEDIEGO
import { state, saveState, undo, redo, restoreSnapshot } from './state.js';
import { openInlineEditor, closeInlineEditor, addConnectorIntermediatePoint, removeConnectorIntermediatePoint, joinSelectedLines } from './tools.js';
import { getConnectorPoints, getLuminance } from './canvasEngine.js';
import { saveWhiteboardTest, syncBoardTitle } from './gdrive.js';

let renderCallback = null;

/**
 * Actualiza la paleta de opciones del menú del lápiz según el tema activo
 */
export function updateColorPalettesForMode() {
    const isDark = state.darkMode;

    const pencilColors = isDark 
        ? ['#f8fafc', '#f87171', '#60a5fa', '#4ade80']
        : ['#1e293b', '#ef4444', '#3b82f6', '#10b981'];

    const pencilDots = document.querySelectorAll('.pencil-color-opt');
    pencilDots.forEach((dot, idx) => {
        if (pencilColors[idx]) {
            dot.style.background = pencilColors[idx];
            dot.setAttribute('data-color', pencilColors[idx]);
        }
    });

    if (isDark && (state.pencilColor === '#1e293b' || getLuminance(state.pencilColor) < 0.35)) {
        state.pencilColor = '#f8fafc';
    } else if (!isDark && (state.pencilColor === '#f8fafc' || getLuminance(state.pencilColor) > 0.75)) {
        state.pencilColor = '#1e293b';
    }
}

/**
 * Muestra una notificación emergente estilo Toast
 */
export function showToast(msg, iconClass = 'fa-solid fa-circle-check') {
    const toast = document.getElementById('toast-notification');
    const icon = document.getElementById('toast-icon');
    const message = document.getElementById('toast-message');
    if (!toast) return;
    if (icon) icon.className = `${iconClass} text-indigo-600`;
    if (message) message.innerText = msg;
    toast.classList.remove('opacity-0', 'translate-y-2');
    setTimeout(() => toast.classList.add('opacity-0', 'translate-y-2'), 2500);
}

/**
 * Cierra todos los submenús flotantes (Flyouts)
 */
export function closeAllFlyouts() {
    document.querySelectorAll('.flyout-menu').forEach(m => m.classList.add('hidden'));
}

/**
 * Selecciona la herramienta activa y actualiza la interfaz
 */
export function setTool(toolName) {
    state.activeTool = toolName;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-tool="${toolName}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    closeInlineEditor();
    if (toolName !== 'select') state.selectedIds = [];
    updateContextToolbar();
    if (renderCallback) renderCallback();
}

/**
 * Sincroniza el estado de los botones de modo de flecha
 */
function syncArrowModeButtons(arrowMode) {
    document.querySelectorAll('.ctx-arrow-btn').forEach(btn => {
        if (btn.getAttribute('data-arrow') === arrowMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Actualiza la visibilidad y campos de la barra flotante según la selección actual
 */
export function updateContextToolbar() {
    const ctxToolbar = document.getElementById('context-toolbar');
    if (!ctxToolbar) return;

    if (state.selectedIds.length === 0) {
        ctxToolbar.classList.add('hidden');
        return;
    }

    ctxToolbar.classList.remove('hidden');
    const selected = state.elements.find(e => e.id === state.selectedIds[0]);
    if (!selected) return;

    const groupFill = document.getElementById('ctx-group-fill');
    const groupStroke = document.getElementById('ctx-group-stroke');
    const groupWidth = document.getElementById('ctx-group-width');
    const groupArrowSize = document.getElementById('ctx-group-arrow-size');
    const groupConnStyle = document.getElementById('ctx-group-conn-style');
    const groupConnArrows = document.getElementById('ctx-group-conn-arrows');
    const groupStyle = document.getElementById('ctx-stroke-style');
    const groupFont = document.getElementById('ctx-group-font');
    const groupSmoothing = document.getElementById('ctx-group-smoothing');
    const btnEditText = document.getElementById('ctx-edit-text');
    const btnJoinLines = document.getElementById('ctx-join-lines');

    [groupFill, groupStroke, groupWidth, groupArrowSize, groupConnStyle, groupConnArrows, groupStyle, groupFont, groupSmoothing, btnEditText, btnJoinLines].forEach(g => g && g.classList.add('hidden'));

    if (state.selectedIds.length >= 2) {
        const lineCount = state.elements.filter(e => state.selectedIds.includes(e.id) && (e.type === 'pencil' || e.type === 'highlighter' || e.type === 'connector')).length;
        if (lineCount >= 2 && btnJoinLines) {
            btnJoinLines.classList.remove('hidden');
        }
    }

    if (selected.type === 'text') {
        [groupStroke, groupFont, btnEditText].forEach(g => g && g.classList.remove('hidden'));
        const strokeInput = document.getElementById('ctx-stroke-color');
        if (strokeInput) strokeInput.value = selected.color || '#1e293b';
        const fontInput = document.getElementById('ctx-font-size');
        if (fontInput) fontInput.value = selected.fontSize || 20;
    } else if (selected.type === 'sticky') {
        [groupFill, groupFont, btnEditText].forEach(g => g && g.classList.remove('hidden'));
        const fillInput = document.getElementById('ctx-fill-color');
        if (fillInput) fillInput.value = selected.color || '#fef08a';
        const fontInput = document.getElementById('ctx-font-size');
        if (fontInput) fontInput.value = selected.fontSize || 16;
    } else if (selected.type === 'pencil' || selected.type === 'highlighter') {
        [groupStroke, groupWidth, groupConnArrows, groupSmoothing].forEach(g => g && g.classList.remove('hidden'));

        const strokeInput = document.getElementById('ctx-stroke-color');
        if (strokeInput) strokeInput.value = selected.color || '#1e293b';

        const strokeWidthInput = document.getElementById('ctx-stroke-width');
        if (strokeWidthInput) strokeWidthInput.value = selected.lineWidth || 3;

        if (selected.arrowMode && selected.arrowMode !== 'none') {
            if (groupArrowSize) groupArrowSize.classList.remove('hidden');
        }

        if (groupArrowSize) {
            const arrowInput = document.getElementById('ctx-arrow-size');
            if (arrowInput) arrowInput.value = selected.arrowSize !== undefined ? selected.arrowSize : 14;
        }

        if (groupSmoothing) {
            const smInput = document.getElementById('ctx-smoothing');
            if (smInput) smInput.value = selected.smoothing !== undefined ? selected.smoothing : state.smoothing;
        }

        syncArrowModeButtons(selected.arrowMode || 'none');
    } else if (selected.type === 'connector') {
        [groupStroke, groupWidth, groupConnStyle, groupConnArrows, groupStyle].forEach(g => g && g.classList.remove('hidden'));

        let currentArrowMode = selected.arrowMode;
        if (!currentArrowMode && selected.connType) {
            if (selected.connType.includes('double')) currentArrowMode = 'both';
            else if (selected.connType.includes('arrow')) currentArrowMode = 'end';
            else currentArrowMode = 'none';
        }

        if (currentArrowMode && currentArrowMode !== 'none') {
            if (groupArrowSize) groupArrowSize.classList.remove('hidden');
        }

        if (groupArrowSize) {
            const arrowInput = document.getElementById('ctx-arrow-size');
            if (arrowInput) arrowInput.value = selected.arrowSize || 14;
        }

        const strokeInput = document.getElementById('ctx-stroke-color');
        if (strokeInput) strokeInput.value = selected.strokeColor || '#1e293b';

        const strokeWidthInput = document.getElementById('ctx-stroke-width');
        if (strokeWidthInput) strokeWidthInput.value = selected.strokeWidth || 2;

        const connLineSelect = document.getElementById('ctx-conn-line');
        if (connLineSelect) {
            if (selected.connType === 'orthogonal' || selected.isOrthogonal) {
                connLineSelect.value = 'orthogonal';
            } else {
                const isCurved = selected.isCurved !== undefined ? selected.isCurved : (selected.connType && selected.connType.startsWith('curved'));
                connLineSelect.value = isCurved ? 'curved' : 'line';
            }
        }

        syncArrowModeButtons(currentArrowMode || 'none');
    } else if (selected.type === 'shape') {
        [groupFill, groupStroke, groupWidth, groupStyle, groupFont, btnEditText].forEach(g => g && g.classList.remove('hidden'));

        const fillInput = document.getElementById('ctx-fill-color');
        if (fillInput) fillInput.value = selected.fillColor || '#ffffff';

        const strokeInput = document.getElementById('ctx-stroke-color');
        if (strokeInput) strokeInput.value = selected.strokeColor || '#1e293b';

        const strokeWidthInput = document.getElementById('ctx-stroke-width');
        if (strokeWidthInput) strokeWidthInput.value = selected.strokeWidth || 2;

        const styleSelect = document.getElementById('ctx-stroke-style');
        if (styleSelect) styleSelect.value = selected.strokeStyle || 'solid';

        const fontInput = document.getElementById('ctx-font-size');
        if (fontInput) fontInput.value = selected.fontSize || 16;
    }

    const opacityInput = document.getElementById('ctx-opacity');
    if (opacityInput) opacityInput.value = selected.opacity !== undefined ? selected.opacity : 1.0;
}

/**
 * Inicializa los controladores de eventos de toda la interfaz
 */
export function setupUIListeners(canvas, ctx, renderFn) {
    renderCallback = renderFn;

    // Vincular inputs de título de pizarra entre la barra superior y el modal
    const topBoardTitle = document.getElementById('board-title');
    if (topBoardTitle) {
        topBoardTitle.addEventListener('input', (e) => syncBoardTitle(e.target.value));
    }

    const modalBoardTitle = document.getElementById('boardTitle');
    if (modalBoardTitle) {
        modalBoardTitle.addEventListener('input', (e) => syncBoardTitle(e.target.value));
    }

    // Conmutador de Modo Oscuro / Claro
    const btnDarkMode = document.getElementById('btn-toggle-darkmode');
    if (btnDarkMode) {
        btnDarkMode.addEventListener('click', () => {
            state.darkMode = !state.darkMode;
            const html = document.documentElement;
            const icon = document.getElementById('darkmode-icon');

            if (state.darkMode) {
                html.classList.add('dark');
                if (icon) icon.className = 'fa-solid fa-sun text-amber-400 text-sm';
            } else {
                html.classList.remove('dark');
                if (icon) icon.className = 'fa-solid fa-moon text-sm';
            }

            updateColorPalettesForMode();
            saveState();
            if (renderCallback) renderCallback();
            showToast(state.darkMode ? 'Modo Oscuro Activado' : 'Modo Claro Activado', state.darkMode ? 'fa-solid fa-moon' : 'fa-solid fa-sun');
        });
    }

    // Botones de Selección de Herramientas
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tool = btn.getAttribute('data-tool');
            const flyoutId = btn.getAttribute('data-flyout');

            if (flyoutId) {
                const flyout = document.getElementById(flyoutId);
                const wasHidden = flyout ? flyout.classList.contains('hidden') : true;
                closeAllFlyouts();
                if (flyout && wasHidden) {
                    flyout.classList.remove('hidden');
                }
            } else {
                closeAllFlyouts();
            }

            if (tool) setTool(tool);
        });
    });

    // Cierre de Flyouts al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.has-flyout') && !e.target.closest('.flyout-menu')) {
            closeAllFlyouts();
        }
        const menuExport = document.getElementById('menu-export');
        if (menuExport && !e.target.closest('#btn-export-toggle') && !e.target.closest('#menu-export')) {
            menuExport.classList.add('hidden');
        }
    });

    // Opciones de Notas Adhesivas
    document.querySelectorAll('.sticky-color-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.stickyColor = opt.getAttribute('data-color');
            setTool('sticky');
            closeAllFlyouts();
        });
    });

    // Opciones del Lápiz
    document.querySelectorAll('.pencil-color-opt').forEach(dot => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.pencil-color-opt').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            state.pencilColor = dot.getAttribute('data-color');
            setTool('pencil');
        });
    });

    const pencilWidthSlider = document.getElementById('pencil-width-slider');
    const pencilWidthVal = document.getElementById('pencil-width-val');
    if (pencilWidthSlider) {
        pencilWidthSlider.addEventListener('input', (e) => {
            state.pencilWidth = parseInt(e.target.value);
            if (pencilWidthVal) pencilWidthVal.innerText = `${state.pencilWidth}px`;
        });
    }

    document.querySelectorAll('.pencil-arrow-opt').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.pencil-arrow-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.pencilArrowMode = btn.getAttribute('data-arrow');
        });
    });

    // Opciones del Destacador
    document.querySelectorAll('.hl-color-opt').forEach(dot => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.hl-color-opt').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            state.hlColor = dot.getAttribute('data-color');
            setTool('highlighter');
        });
    });

    const hlWidthSlider = document.getElementById('hl-width-slider');
    const hlWidthVal = document.getElementById('hl-width-val');
    if (hlWidthSlider) {
        hlWidthSlider.addEventListener('input', (e) => {
            state.hlWidth = parseInt(e.target.value);
            if (hlWidthVal) hlWidthVal.innerText = `${state.hlWidth}px`;
        });
    }

    // Selector de Formas
    document.querySelectorAll('.shape-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.activeShape = opt.getAttribute('data-shape');
            setTool('shape');
            closeAllFlyouts();
        });
    });

    // Selector de Conectores
    document.querySelectorAll('.conn-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.activeConnector = opt.getAttribute('data-conn');
            setTool('connector');
            closeAllFlyouts();
        });
    });

    // Acciones de la Barra Flotante (Contextual)
    document.querySelectorAll('.ctx-arrow-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-arrow');
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.arrowMode = mode;
            });
            syncArrowModeButtons(mode);
            saveState();
            if (renderCallback) renderCallback();
        });
    });

    const btnAddPoint = document.getElementById('ctx-add-point');
    if (btnAddPoint) {
        btnAddPoint.addEventListener('click', () => {
            if (state.selectedIds.length > 0) {
                const el = state.elements.find(m => m.id === state.selectedIds[0]);
                if (el && el.type === 'connector') {
                    const pts = getConnectorPoints(el);
                    const midX = (pts[0].x + pts[pts.length - 1].x) / 2;
                    const midY = (pts[0].y + pts[pts.length - 1].y) / 2;
                    addConnectorIntermediatePoint(el, { x: midX, y: midY });
                    saveState();
                    if (renderCallback) renderCallback();
                    showToast('Punto intermedio añadido', 'fa-solid fa-circle-plus');
                }
            }
        });
    }

    const btnRemovePoint = document.getElementById('ctx-remove-point');
    if (btnRemovePoint) {
        btnRemovePoint.addEventListener('click', () => {
            if (state.selectedIds.length > 0) {
                const el = state.elements.find(m => m.id === state.selectedIds[0]);
                if (el && el.type === 'connector' && el.points && el.points.length > 2) {
                    removeConnectorIntermediatePoint(el, el.points.length - 2);
                    saveState();
                    if (renderCallback) renderCallback();
                    showToast('Punto intermedio eliminado', 'fa-solid fa-circle-minus');
                }
            }
        });
    }

    const btnJoinLines = document.getElementById('ctx-join-lines');
    if (btnJoinLines) {
        btnJoinLines.addEventListener('click', () => {
            joinSelectedLines();
            updateContextToolbar();
            if (renderCallback) renderCallback();
            showToast('Líneas unidas con éxito', 'fa-solid fa-link');
        });
    }

    const btnToggleJumps = document.getElementById('ctx-toggle-jumps');
    if (btnToggleJumps) {
        btnToggleJumps.addEventListener('click', () => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el && el.type === 'connector') {
                    el.lineJumps = !el.lineJumps;
                }
            });
            saveState();
            if (renderCallback) renderCallback();
            showToast('Arcos de cruce actualizados', 'fa-solid fa-bridge');
        });
    }

    const ctxConnLine = document.getElementById('ctx-conn-line');
    if (ctxConnLine) {
        ctxConnLine.addEventListener('change', (e) => {
            const val = e.target.value;
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el && el.type === 'connector') {
                    if (val === 'orthogonal') {
                        el.connType = 'orthogonal';
                        el.isOrthogonal = true;
                        el.isCurved = false;
                    } else if (val === 'curved') {
                        el.connType = 'curved';
                        el.isCurved = true;
                        el.isOrthogonal = false;
                        if (!el.cp) {
                            const endX = el.endX !== undefined ? el.endX : el.x + 100;
                            const endY = el.endY !== undefined ? el.endY : el.y + 100;
                            el.cp = { x: (el.x + endX) / 2, y: (el.y + endY) / 2 - 40 };
                        }
                    } else {
                        el.connType = 'line';
                        el.isCurved = false;
                        el.isOrthogonal = false;
                    }
                }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxFill = document.getElementById('ctx-fill-color');
    if (ctxFill) {
        ctxFill.addEventListener('input', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.fillColor = e.target.value;
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxStroke = document.getElementById('ctx-stroke-color');
    if (ctxStroke) {
        ctxStroke.addEventListener('input', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) { el.strokeColor = e.target.value; el.color = e.target.value; }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxWidth = document.getElementById('ctx-stroke-width');
    if (ctxWidth) {
        ctxWidth.addEventListener('input', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) { el.strokeWidth = parseInt(e.target.value); el.lineWidth = parseInt(e.target.value); }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxArrowSize = document.getElementById('ctx-arrow-size');
    if (ctxArrowSize) {
        ctxArrowSize.addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el && (el.type === 'connector' || el.type === 'pencil' || el.type === 'highlighter')) {
                    el.arrowSize = size;
                }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxStyle = document.getElementById('ctx-stroke-style');
    if (ctxStyle) {
        ctxStyle.addEventListener('change', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.strokeStyle = e.target.value;
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxFont = document.getElementById('ctx-font-size');
    if (ctxFont) {
        ctxFont.addEventListener('change', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.fontSize = parseInt(e.target.value);
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxSmoothing = document.getElementById('ctx-smoothing');
    if (ctxSmoothing) {
        ctxSmoothing.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el && (el.type === 'pencil' || el.type === 'highlighter')) {
                    el.smoothing = val;
                }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxOpacity = document.getElementById('ctx-opacity');
    if (ctxOpacity) {
        ctxOpacity.addEventListener('input', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.opacity = parseFloat(e.target.value);
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxDelete = document.getElementById('ctx-delete');
    if (ctxDelete) {
        ctxDelete.addEventListener('click', () => {
            state.elements = state.elements.filter(e => !state.selectedIds.includes(e.id));
            state.selectedIds = [];
            updateContextToolbar();
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxDuplicate = document.getElementById('ctx-duplicate');
    if (ctxDuplicate) {
        ctxDuplicate.addEventListener('click', () => {
            const newSelected = [];
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) {
                    const clone = JSON.parse(JSON.stringify(el));
                    clone.id = 'el_' + Date.now() + Math.random();
                    clone.x += 20; clone.y += 20;
                    if (clone.endX !== undefined) clone.endX += 20;
                    if (clone.endY !== undefined) clone.endY += 20;
                    if (clone.cp) { clone.cp.x += 20; clone.cp.y += 20; }
                    state.elements.push(clone);
                    newSelected.push(clone.id);
                }
            });
            state.selectedIds = newSelected;
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxEditText = document.getElementById('ctx-edit-text');
    if (ctxEditText) {
        ctxEditText.addEventListener('click', () => {
            if (state.selectedIds.length > 0) {
                const el = state.elements.find(m => m.id === state.selectedIds[0]);
                if (el) openInlineEditor(el);
            }
        });
    }

    const ctxBringFront = document.getElementById('ctx-bring-front');
    if (ctxBringFront) {
        ctxBringFront.addEventListener('click', () => {
            state.selectedIds.forEach(id => {
                const index = state.elements.findIndex(e => e.id === id);
                if (index !== -1) {
                    const [el] = state.elements.splice(index, 1);
                    state.elements.push(el);
                }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxSendBack = document.getElementById('ctx-send-back');
    if (ctxSendBack) {
        ctxSendBack.addEventListener('click', () => {
            state.selectedIds.forEach(id => {
                const index = state.elements.findIndex(e => e.id === id);
                if (index !== -1) {
                    const [el] = state.elements.splice(index, 1);
                    state.elements.unshift(el);
                }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    // Botones Header
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) btnUndo.addEventListener('click', () => undo(renderCallback, updateContextToolbar));

    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) btnRedo.addEventListener('click', () => redo(renderCallback, updateContextToolbar));

    // Botones Zoom
    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            state.zoom = Math.min(5.0, state.zoom + 0.2);
            const dropdown = document.getElementById('zoom-dropdown');
            if (dropdown) dropdown.value = state.zoom.toFixed(2);
            if (renderCallback) renderCallback();
        });
    }

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            state.zoom = Math.max(0.05, state.zoom - 0.2);
            const dropdown = document.getElementById('zoom-dropdown');
            if (dropdown) dropdown.value = state.zoom.toFixed(2);
            if (renderCallback) renderCallback();
        });
    }

    const zoomDropdown = document.getElementById('zoom-dropdown');
    if (zoomDropdown) {
        zoomDropdown.addEventListener('change', (e) => {
            state.zoom = parseFloat(e.target.value);
            if (renderCallback) renderCallback();
        });
    }

    const btnZoomFit = document.getElementById('btn-zoom-fit');
    if (btnZoomFit) {
        btnZoomFit.addEventListener('click', () => {
            state.pan = { x: window.innerWidth / 4, y: window.innerHeight / 4 };
            state.zoom = 1.0;
            const dropdown = document.getElementById('zoom-dropdown');
            if (dropdown) dropdown.value = "1.0";
            if (renderCallback) renderCallback();
        });
    }

    const btnMinimap = document.getElementById('btn-toggle-minimap');
    if (btnMinimap) {
        btnMinimap.addEventListener('click', () => {
            const container = document.getElementById('minimap-container');
            if (container) container.classList.toggle('hidden');
            if (renderCallback) renderCallback();
        });
    }

    // Modal Limpiar Pizarra
    const btnClearBoard = document.getElementById('btn-clear-board');
    if (btnClearBoard) {
        btnClearBoard.addEventListener('click', () => {
            const modal = document.getElementById('modal-confirm-clear');
            if (modal) modal.classList.remove('hidden');
        });
    }

    const btnCancelClear = document.getElementById('btn-cancel-clear');
    if (btnCancelClear) {
        btnCancelClear.addEventListener('click', () => {
            const modal = document.getElementById('modal-confirm-clear');
            if (modal) modal.classList.add('hidden');
        });
    }

    const btnConfirmClear = document.getElementById('btn-confirm-clear');
    if (btnConfirmClear) {
        btnConfirmClear.addEventListener('click', () => {
            state.elements = [];
            state.selectedIds = [];
            const modal = document.getElementById('modal-confirm-clear');
            if (modal) modal.classList.add('hidden');
            saveState();
            if (renderCallback) renderCallback();
            showToast('Pizarra limpiada', 'fa-solid fa-trash-can');
        });
    }

    // Exportación
    const btnExportToggle = document.getElementById('btn-export-toggle');
    if (btnExportToggle) {
        btnExportToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = document.getElementById('menu-export');
            if (menu) menu.classList.toggle('hidden');
        });
    }

    const exportPng = document.getElementById('export-png');
    if (exportPng) {
        exportPng.addEventListener('click', () => {
            const title = document.getElementById('board-title')?.value || 'Pizarra ProfeDiego';
            const link = document.createElement('a');
            link.download = `${title}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('Exportado como PNG', 'fa-regular fa-file-image');
        });
    }

    const exportJson = document.getElementById('export-json');
    if (exportJson) {
        exportJson.addEventListener('click', () => {
            const title = document.getElementById('board-title')?.value || 'Pizarra ProfeDiego';
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.elements));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", `${title}.json`);
            dlAnchor.click();
            showToast('Pizarra descargada como JSON', 'fa-solid fa-file-code');
        });
    }

    const inputImportJson = document.getElementById('input-import-json');
    if (inputImportJson) {
        inputImportJson.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    restoreSnapshot(evt.target.result, renderCallback);
                    saveState();
                    showToast('Pizarra cargada con éxito', 'fa-solid fa-file-import');
                };
                reader.readAsText(file);
            }
        });
    }

    // Subir imagen desde botón
    const imageUploadInput = document.getElementById('image-upload-input');
    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const img = new Image();
                    img.src = evt.target.result;
                    img.onload = () => {
                        const newId = 'img_' + Date.now();
                        state.elements.push({
                            id: newId,
                            type: 'image',
                            x: (window.innerWidth / 2 - state.pan.x) / state.zoom - img.width / 4,
                            y: (window.innerHeight / 2 - state.pan.y) / state.zoom - img.height / 4,
                            width: img.width / 2,
                            height: img.height / 2,
                            src: evt.target.result,
                            imgElement: img
                        });
                        saveState();
                        if (renderCallback) renderCallback();
                        showToast('Imagen subida correctamente', 'fa-regular fa-image');
                    };
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Atajos de Teclado
    window.addEventListener('keydown', (e) => {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (state.selectedIds.length > 0) {
                state.elements = state.elements.filter(el => !state.selectedIds.includes(el.id));
                state.selectedIds = [];
                updateContextToolbar();
                saveState();
                if (renderCallback) renderCallback();
            }
        } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undo(renderCallback, updateContextToolbar);
        } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo(renderCallback, updateContextToolbar);
        } else if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            const k = e.key.toLowerCase();
            if (k === 'v') setTool('select');
            else if (k === 'h') setTool('hand');
            else if (k === 't') setTool('text');
            else if (k === 'p') setTool('pencil');
            else if (k === 'e') setTool('eraser');
        }
    });
}