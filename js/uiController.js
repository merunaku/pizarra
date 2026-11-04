// UI CONTROLLER & TOOLBAR ACTIONS - PIZARRA PROFEDIEGO
import { state, saveState, undo, redo, restoreSnapshot } from './state.js';
import { openInlineEditor, closeInlineEditor } from './tools.js';

let renderCallback = null;

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
    const groupStyle = document.getElementById('ctx-stroke-style');
    const groupFont = document.getElementById('ctx-group-font');
    const groupSmoothing = document.getElementById('ctx-group-smoothing');
    const btnEditText = document.getElementById('ctx-edit-text');
    const sepEdit = document.getElementById('ctx-sep-edit');

    [groupFill, groupStroke, groupWidth, groupArrowSize, groupConnStyle, groupStyle, groupFont, groupSmoothing, btnEditText, sepEdit].forEach(g => g && g.classList.remove('hidden'));

    if (selected.type === 'text') {
        [groupFill, groupStroke, groupWidth, groupArrowSize, groupConnStyle, groupStyle, groupSmoothing].forEach(g => g && g.classList.add('hidden'));
    } else if (selected.type === 'sticky') {
        [groupStroke, groupWidth, groupArrowSize, groupConnStyle, groupStyle, groupSmoothing].forEach(g => g && g.classList.add('hidden'));
    } else if (selected.type === 'pencil' || selected.type === 'highlighter') {
        [groupFill, groupArrowSize, groupConnStyle, groupStyle, groupFont, btnEditText, sepEdit].forEach(g => g && g.classList.add('hidden'));
        if (groupSmoothing) {
            const smInput = document.getElementById('ctx-smoothing');
            if (smInput) smInput.value = selected.smoothing !== undefined ? selected.smoothing : state.smoothing;
        }
    } else if (selected.type === 'connector') {
        [groupFill, groupFont, groupSmoothing, btnEditText, sepEdit].forEach(g => g && g.classList.add('hidden'));
        
        if (groupArrowSize) {
            const arrowInput = document.getElementById('ctx-arrow-size');
            if (arrowInput) arrowInput.value = selected.arrowSize || 14;
        }

        // Sincronizar selectores de Tipo de Línea y Puntas de Flecha
        const connLineSelect = document.getElementById('ctx-conn-line');
        if (connLineSelect) {
            const isCurved = selected.isCurved !== undefined ? selected.isCurved : (selected.connType && selected.connType.startsWith('curved'));
            connLineSelect.value = isCurved ? 'curved' : 'line';
        }

        const connArrowSelect = document.getElementById('ctx-conn-arrow');
        if (connArrowSelect) {
            let mode = 'none';
            if (selected.arrowMode) {
                mode = selected.arrowMode;
            } else if (selected.connType) {
                if (selected.connType.includes('double')) mode = 'both';
                else if (selected.connType.includes('arrow')) mode = 'end';
            }
            connArrowSelect.value = mode;
        }
    } else {
        if (groupArrowSize) groupArrowSize.classList.add('hidden');
        if (groupConnStyle) groupConnStyle.classList.add('hidden');
    }
}

/**
 * Conecta los eventos de la interfaz de usuario
 */
export function setupUIListeners(canvas, ctx, renderFn) {
    renderCallback = renderFn;

    // Listeners de la barra lateral de herramientas
    document.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.getAttribute('data-tool');
            setTool(tool);
        });
    });

    // Menús flyouts
    document.querySelectorAll('.has-flyout').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const flyoutId = btn.getAttribute('data-flyout');
            const flyout = document.getElementById(flyoutId);
            
            document.querySelectorAll('.flyout-menu').forEach(m => {
                if (m !== flyout) m.classList.add('hidden');
            });
            if (flyout) flyout.classList.toggle('hidden');
        });
    });

    // Clics fuera para cerrar flyouts
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.flyout-menu') && !e.target.closest('.has-flyout') && !e.target.closest('#btn-export-toggle')) {
            closeAllFlyouts();
        }
    });

    // Opciones de submenús
    document.querySelectorAll('.shape-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.activeShape = opt.getAttribute('data-shape');
            closeAllFlyouts();
            setTool('shape');
        });
    });

    document.querySelectorAll('.conn-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.activeConnector = opt.getAttribute('data-conn');
            closeAllFlyouts();
            setTool('connector');
        });
    });

    document.querySelectorAll('.sticky-color-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.stickyColor = opt.getAttribute('data-color');
            closeAllFlyouts();
            setTool('sticky');
        });
    });

    document.querySelectorAll('.pencil-color-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.pencilColor = opt.getAttribute('data-color');
            document.querySelectorAll('.pencil-color-opt').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        });
    });

    // Listeners de tipo de línea y flechas en la barra contextual
    const ctxConnLine = document.getElementById('ctx-conn-line');
    if (ctxConnLine) {
        ctxConnLine.addEventListener('change', (e) => {
            const isCurved = e.target.value === 'curved';
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el && el.type === 'connector') {
                    el.isCurved = isCurved;
                    if (isCurved && !el.cp) {
                        const endX = el.endX !== undefined ? el.endX : el.x + 100;
                        const endY = el.endY !== undefined ? el.endY : el.y + 100;
                        el.cp = { x: (el.x + endX) / 2, y: (el.y + endY) / 2 - 40 };
                    }
                }
            });
            saveState(); if (renderCallback) renderCallback();
        });
    }

    const ctxConnArrow = document.getElementById('ctx-conn-arrow');
    if (ctxConnArrow) {
        ctxConnArrow.addEventListener('change', (e) => {
            const arrowMode = e.target.value;
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el && el.type === 'connector') {
                    el.arrowMode = arrowMode;
                }
            });
            saveState(); if (renderCallback) renderCallback();
        });
    }

    const ctxFill = document.getElementById('ctx-fill-color');
    if (ctxFill) {
        ctxFill.addEventListener('input', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.fillColor = e.target.value;
            });
            saveState(); if (renderCallback) renderCallback();
        });
    }

    const ctxStroke = document.getElementById('ctx-stroke-color');
    if (ctxStroke) {
        ctxStroke.addEventListener('input', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) { el.strokeColor = e.target.value; el.color = e.target.value; }
            });
            saveState(); if (renderCallback) renderCallback();
        });
    }

    const ctxWidth = document.getElementById('ctx-stroke-width');
    if (ctxWidth) {
        ctxWidth.addEventListener('input', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) { el.strokeWidth = parseInt(e.target.value); el.lineWidth = parseInt(e.target.value); }
            });
            saveState(); if (renderCallback) renderCallback();
        });
    }

    const ctxArrowSize = document.getElementById('ctx-arrow-size');
    if (ctxArrowSize) {
        ctxArrowSize.addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el && el.type === 'connector') {
                    el.arrowSize = size;
                }
            });
            saveState(); if (renderCallback) renderCallback();
        });
    }

    const ctxStyle = document.getElementById('ctx-stroke-style');
    if (ctxStyle) {
        ctxStyle.addEventListener('change', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.strokeStyle = e.target.value;
            });
            saveState(); if (renderCallback) renderCallback();
        });
    }

    const ctxFont = document.getElementById('ctx-font-size');
    if (ctxFont) {
        ctxFont.addEventListener('change', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.fontSize = parseInt(e.target.value);
            });
            saveState(); if (renderCallback) renderCallback();
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
            saveState(); if (renderCallback) renderCallback();
        });
    }

    const ctxOpacity = document.getElementById('ctx-opacity');
    if (ctxOpacity) {
        ctxOpacity.addEventListener('input', (e) => {
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.opacity = parseFloat(e.target.value);
            });
            saveState(); if (renderCallback) renderCallback();
        });
    }

    const ctxDelete = document.getElementById('ctx-delete');
    if (ctxDelete) {
        ctxDelete.addEventListener('click', () => {
            state.elements = state.elements.filter(e => !state.selectedIds.includes(e.id));
            state.selectedIds = [];
            updateContextToolbar();
            saveState(); if (renderCallback) renderCallback();
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
            saveState(); if (renderCallback) renderCallback();
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
            saveState(); if (renderCallback) renderCallback();
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
            saveState(); if (renderCallback) renderCallback();
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
}
