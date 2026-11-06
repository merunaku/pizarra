// UI CONTROLLER & TOOLBAR ACTIONS - PIZARRA PROFEDIEGO
import { state, saveState, undo, redo } from './state.js';
import { openInlineEditor, closeInlineEditor, addConnectorIntermediatePoint, removeConnectorIntermediatePoint, joinSelectedLines } from './tools.js';
import { getConnectorPoints, getLuminance } from './canvasEngine.js';
import { syncBoardTitle } from './gdrive.js';
import { broadcastTeacherPermission, updateStudentDrawingUI } from './firebaseSync.js';

let renderCallback = null;

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

export function closeAllFlyouts() {
    document.querySelectorAll('.flyout-menu').forEach(m => m.classList.add('hidden'));
}

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

function syncArrowModeButtons(arrowMode) {
    document.querySelectorAll('.ctx-arrow-btn').forEach(btn => {
        if (btn.getAttribute('data-arrow') === arrowMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// CORRECCIÓN INICIALIZACIÓN DE ROL Y TÍTULOS
export function applyRoleUIRestrictions() {
    const isTeacher = state.gdriveIsTeacher;

    const teacherOnlyElements = [
        document.getElementById('saveBtn'),
        document.getElementById('newFolderBtn'),
        document.getElementById('btn-clear-board'),
        document.getElementById('teacher-control-panel')
    ];

    teacherOnlyElements.forEach(el => {
        if (el) {
            if (!isTeacher) {
                el.classList.add('hidden');
            } else {
                el.classList.remove('hidden');
            }
        }
    });

    const boardTitleInput = document.getElementById('board-title');
    if (boardTitleInput) {
        boardTitleInput.disabled = !isTeacher;
    }

    // Asegurar que la barra lateral del profesor inicie habilitada de inmediato
    updateStudentDrawingUI();
}

export function handleLogout() {
    localStorage.removeItem('profediego_gdrive_token');
    localStorage.removeItem('profediego_gdrive_exp');
    state.gdriveAccessToken = null;
    state.gdriveUser = null;
    state.gdriveCurrentUserEmail = null;
    state.gdriveIsTeacher = false;

    const headerProfile = document.getElementById('header-user-profile');
    if (headerProfile) headerProfile.classList.add('hidden');

    applyRoleUIRestrictions();
    showToast('Sesión cerrada correctamente', 'fa-solid fa-right-from-bracket');
}

// CORRECCIÓN DE LA BARRA DE HERRAMIENTAS CONTEXTUAL
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

    if (state.selectedIds.length >= 2 && state.autoJoinEnabled) {
        const lineCount = state.elements.filter(e => state.selectedIds.includes(e.id) && (e.type === 'pencil' || e.type === 'highlighter' || e.type === 'connector')).length;
        if (lineCount >= 2 && btnJoinLines) {
            btnJoinLines.classList.remove('hidden');
        }
    }

    if (selected.type === 'text') {
        [groupStroke, groupFont, btnEditText].forEach(g => g && g.classList.remove('hidden'));
        const strokeInput = document.getElementById('ctx-stroke-color');
        if (strokeInput) strokeInput.value = selected.strokeColor || selected.color || '#1e293b';
        const fontInput = document.getElementById('ctx-font-size');
        if (fontInput) fontInput.value = selected.fontSize || 20;
    } else if (selected.type === 'sticky') {
        [groupFill, groupFont, btnEditText].forEach(g => g && g.classList.remove('hidden'));
        const fillInput = document.getElementById('ctx-fill-color');
        if (fillInput) fillInput.value = selected.fillColor || selected.color || '#fef08a';
        const fontInput = document.getElementById('ctx-font-size');
        if (fontInput) fontInput.value = selected.fontSize || 16;
    } else if (selected.type === 'pencil' || selected.type === 'highlighter') {
        [groupStroke, groupWidth, groupConnArrows, groupSmoothing].forEach(g => g && g.classList.remove('hidden'));

        const strokeInput = document.getElementById('ctx-stroke-color');
        if (strokeInput) strokeInput.value = selected.strokeColor || selected.color || '#1e293b';

        const strokeWidthInput = document.getElementById('ctx-stroke-width');
        if (strokeWidthInput) strokeWidthInput.value = selected.strokeWidth || selected.lineWidth || 3;

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
        if (strokeInput) strokeInput.value = selected.strokeColor || selected.color || '#1e293b';

        const strokeWidthInput = document.getElementById('ctx-stroke-width');
        if (strokeWidthInput) strokeWidthInput.value = selected.strokeWidth || selected.lineWidth || 2;

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
        if (strokeInput) strokeInput.value = selected.strokeColor || selected.color || '#1e293b';

        const strokeWidthInput = document.getElementById('ctx-stroke-width');
        if (strokeWidthInput) strokeWidthInput.value = selected.strokeWidth || selected.lineWidth || 2;

        const styleSelect = document.getElementById('ctx-stroke-style');
        if (styleSelect) styleSelect.value = selected.strokeStyle || 'solid';

        const fontInput = document.getElementById('ctx-font-size');
        if (fontInput) fontInput.value = selected.fontSize || 16;
    }

    const opacityInput = document.getElementById('ctx-opacity');
    if (opacityInput) opacityInput.value = selected.opacity !== undefined ? selected.opacity : 1.0;
}

export function setupUIListeners(canvas, ctx, renderFn) {
    renderCallback = renderFn;

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }

    const toggleStudentDraw = document.getElementById('toggle-student-drawing');
    if (toggleStudentDraw) {
        toggleStudentDraw.addEventListener('change', (e) => {
            broadcastTeacherPermission(e.target.checked);
        });
    }

    const toggleStudentViewports = document.getElementById('toggle-student-viewports');
    if (toggleStudentViewports) {
        toggleStudentViewports.addEventListener('change', (e) => {
            state.showStudentViewports = e.target.checked;
            if (renderCallback) renderCallback();
            showToast(
                e.target.checked ? 'Ubicación de alumnos visible' : 'Ubicación de alumnos oculta',
                'fa-solid fa-eye'
            );
        });
    }

    const toggleSnapGuides = document.getElementById('toggle-snap-guides');
    if (toggleSnapGuides) {
        toggleSnapGuides.addEventListener('change', (e) => {
            state.alignmentGuidesEnabled = e.target.checked;
            showToast(e.target.checked ? 'Guías de alineación activadas' : 'Guías de alineación desactivadas');
        });
    }

    const toggleAutoJoin = document.getElementById('toggle-autojoin-lines');
    if (toggleAutoJoin) {
        toggleAutoJoin.addEventListener('change', (e) => {
            state.autoJoinEnabled = e.target.checked;
            showToast(e.target.checked ? 'Asistencia para unir líneas activada' : 'Asistencia para unir líneas desactivada');
        });
    }

    const topBoardTitle = document.getElementById('board-title');
    if (topBoardTitle) {
        topBoardTitle.addEventListener('input', (e) => syncBoardTitle(e.target.value));
    }

    const modalBoardTitle = document.getElementById('boardTitle');
    if (modalBoardTitle) {
        modalBoardTitle.addEventListener('input', (e) => syncBoardTitle(e.target.value));
    }

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

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.has-flyout') && !e.target.closest('.flyout-menu')) {
            closeAllFlyouts();
        }
        const menuExport = document.getElementById('menu-export');
        if (menuExport && !e.target.closest('#btn-export-toggle') && !e.target.closest('#menu-export')) {
            menuExport.classList.add('hidden');
        }
    });

    // EVENTOS DE LA BARRA FLOTANTE (CON UNIFICACIÓN DE PROPIEDADES)
    document.querySelectorAll('.ctx-arrow-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-arrow');
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) el.arrowMode = mode;
            });
            syncArrowModeButtons(mode);
            updateContextToolbar();
            saveState();
            if (renderCallback) renderCallback();
        });
    });

    const ctxStroke = document.getElementById('ctx-stroke-color');
    if (ctxStroke) {
        ctxStroke.addEventListener('input', (e) => {
            const val = e.target.value;
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) { el.strokeColor = val; el.color = val; }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxWidth = document.getElementById('ctx-stroke-width');
    if (ctxWidth) {
        ctxWidth.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) { el.strokeWidth = val; el.lineWidth = val; }
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
                if (el) el.arrowSize = size;
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

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
                    showToast('Codo / Punto añadido', 'fa-solid fa-circle-plus');
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
                    showToast('Codo eliminado', 'fa-solid fa-circle-minus');
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

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) btnUndo.addEventListener('click', () => undo(renderCallback, updateContextToolbar));

    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) btnRedo.addEventListener('click', () => redo(renderCallback, updateContextToolbar));
}