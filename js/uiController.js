// UI CONTROLLER & TOOLBAR ACTIONS - PIZARRA PROFEDIEGO
import { state, saveState, undo, redo, restoreSnapshot } from './state.js';
import { openInlineEditor, closeInlineEditor, addConnectorIntermediatePoint, removeConnectorIntermediatePoint, joinSelectedLines } from './tools.js';
import { getConnectorPoints, getLuminance } from './canvasEngine.js';
import { saveWhiteboardTest, syncBoardTitle } from './gdrive.js';
import { toggleStudentDrawingPermission, setTeacherActiveBoard, notifyBoardSwitch, syncWithTeacherBoard, updateUserPresence } from './firebaseSync.js';

let renderCallback = null;

export function applyRolePermissions(userRole) {
    const isTeacher = (userRole === 'teacher' || state.gdriveIsTeacher || state.userRole === 'teacher');
    state.userRole = isTeacher ? 'teacher' : 'student';

    document.body.classList.remove('role-teacher', 'role-student');
    document.body.classList.add(`role-${state.userRole}`);

    const teacherElements = document.querySelectorAll('.teacher-only, [data-requires-role="teacher"]');
    teacherElements.forEach(el => {
        if (isTeacher) {
            el.style.display = '';
            el.classList.remove('hidden');
        } else {
            el.style.display = 'none';
        }
    });

    updateUserPresence();
}

export function renderParticipantsList(renderFn) {
    const users = Array.isArray(state.allActiveUsers) ? state.allActiveUsers : [];
    const avatarsContainer = document.getElementById('participants-avatars');
    const countLabel = document.getElementById('participants-count-label');
    const dropdownCount = document.getElementById('participants-dropdown-count');
    const listEl = document.getElementById('participants-list');

    if (countLabel) countLabel.innerText = `Conectados (${users.length})`;
    if (dropdownCount) dropdownCount.innerText = `${users.length} en línea`;

    if (avatarsContainer) {
        avatarsContainer.innerHTML = users.slice(0, 5).map(u => {
            const initial = (u.name || 'U').charAt(0).toUpperCase();
            const ringColor = u.isTeacher ? 'border-emerald-500' : 'border-blue-500';
            const bgColor = u.isTeacher ? 'bg-emerald-600' : 'bg-blue-600';

            if (u.photoUrl) {
                return `<img src="${u.photoUrl}" alt="${u.name}" referrerpolicy="no-referrer"
                    class="w-6 h-6 rounded-full border-2 ${ringColor} object-cover bg-white shadow-sm"
                    onerror="this.outerHTML='<span class=\\'w-6 h-6 rounded-full border-2 border-white ${bgColor} text-white text-[10px] font-bold flex items-center justify-center\\'>${initial}</span>'" />`;
            }
            return `<span class="w-6 h-6 rounded-full border-2 border-white ${bgColor} text-white text-[10px] font-bold flex items-center justify-center shadow-sm">${initial}</span>`;
        }).join('');
    }

    if (listEl) {
        if (users.length === 0) {
            listEl.innerHTML = '<li class="text-[11px] text-slate-400 italic py-2 text-center">Sin participantes conectados</li>';
            return;
        }

        listEl.innerHTML = users.map(u => {
            const initial = (u.name || 'U').charAt(0).toUpperCase();
            const bgColor = u.isTeacher ? 'bg-emerald-600' : 'bg-blue-600';
            const roleBadge = u.isTeacher
                ? '<span class="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">Profesor</span>'
                : '<span class="text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">Alumno</span>';

            const boardStatus = u.isSameBoard
                ? '<span class="text-[10px] text-emerald-600 font-medium">En esta pizarra</span>'
                : `<span class="text-[10px] text-amber-600 font-medium truncate max-w-[130px]" title="${u.boardTitle || 'Otra pizarra'}">En: ${u.boardTitle || 'Otra pizarra'}</span>`;

            const avatarHtml = u.photoUrl
                ? `<img src="${u.photoUrl}" alt="${u.name}" referrerpolicy="no-referrer"
                    class="w-8 h-8 rounded-full border ${u.isTeacher ? 'border-emerald-400' : 'border-blue-400'} object-cover shrink-0"
                    onerror="this.outerHTML='<div class=\\'w-8 h-8 rounded-full ${bgColor} text-white text-xs font-bold flex items-center justify-center shrink-0\\'>${initial}</div>'" />`
                : `<div class="w-8 h-8 rounded-full ${bgColor} text-white text-xs font-bold flex items-center justify-center shrink-0">${initial}</div>`;

            const jumpBtn = (!u.isSelf && u.isSameBoard && u.viewBounds)
                ? `<button data-jump-uid="${u.uid}" title="Ir a donde está mirando" class="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-all shrink-0">
                    <i class="fa-solid fa-crosshairs text-xs"></i>
                   </button>`
                : '';

            return `
                <li class="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all">
                    <div class="flex items-center gap-2 min-w-0">
                        ${avatarHtml}
                        <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-1.5">
                                <span class="text-xs font-bold text-slate-800 truncate">${u.name}${u.isSelf ? ' (Tú)' : ''}</span>
                                ${roleBadge}
                            </div>
                            ${boardStatus}
                        </div>
                    </div>
                    ${jumpBtn}
                </li>
            `;
        }).join('');

        listEl.querySelectorAll('[data-jump-uid]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = users.find(x => x.uid === btn.dataset.jumpUid);
                if (target && target.viewBounds) {
                    const canvas = document.getElementById('board-canvas');
                    const centerX = target.viewBounds.x + target.viewBounds.w / 2;
                    const centerY = target.viewBounds.y + target.viewBounds.h / 2;
                    state.pan.x = (canvas ? canvas.width / 2 : window.innerWidth / 2) - centerX * state.zoom;
                    state.pan.y = (canvas ? canvas.height / 2 : window.innerHeight / 2) - centerY * state.zoom;
                    updateUserPresence();
                    if (renderFn || renderCallback) (renderFn || renderCallback)();
                    showToast(`Vista centrada en ${target.name}`, 'fa-solid fa-crosshairs');
                }
            });
        });
    }
}

export function generateBoardThumbnail() {
    const canvas = document.getElementById('board-canvas');
    if (!canvas) return null;
    try {
        return canvas.toDataURL('image/png', 0.5);
    } catch (e) {
        return null;
    }
}

export function openBoardSelectionModal(boardsList, onSelectBoard) {
    const existing = document.querySelector('.board-modal-overlay');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'board-modal-overlay';

    const teacherBoardId = state.teacherActiveBoardId || state.gdriveActiveFileId;
    const isStudent = state.userRole === 'student' && !state.gdriveIsTeacher;
    const isSelfTeacher = state.userRole === 'teacher' || state.gdriveIsTeacher;
    const teacherOnline = isSelfTeacher || Boolean(state.isTeacherOnline) || Object.values(state.presenceUsers || {}).some(u => u && u.isTeacher === true);

    const followTeacherBtnHtml = (isStudent && teacherOnline) ? `
        <button id="btn-follow-teacher" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all">
            <i class="fa-solid fa-satellite-dish"></i> Unirme a Pizarra del Profesor
        </button>
    ` : '';

    const boardsHtml = boardsList && boardsList.length > 0 ? boardsList.map(board => {
        const isTeacherOpen = teacherOnline && (board.id === teacherBoardId);
        const storedThumb = localStorage.getItem('profediego_thumb_' + board.id) || board.thumbnailUrl;

        let badgeHtml = '';
        if (isTeacherOpen) {
            badgeHtml = `<span class="absolute top-2 right-2 bg-emerald-600 text-white font-bold text-[10px] px-2.5 py-1 rounded-full shadow-md flex items-center gap-1 z-10">
                <i class="fa-solid fa-satellite-dish fa-spin"></i> Profesor en Vivo
            </span>`;
        }

        const thumbMedia = storedThumb 
            ? `<img src="${storedThumb}" alt="${board.name}" class="w-full h-full object-cover" />`
            : `<div class="w-full h-full bg-slate-800 flex flex-col items-center justify-center p-3 text-slate-300">
                <i class="fa-solid fa-chalkboard text-3xl mb-1 text-indigo-400"></i>
                <span class="text-[11px] font-bold text-center truncate max-w-full">${board.name}</span>
               </div>`;

        return `
        <div class="board-card relative ${isTeacherOpen ? 'border-emerald-500 ring-2 ring-emerald-400' : ''}" data-id="${board.id}">
            ${badgeHtml}
            <div class="board-thumb-container relative">
                ${thumbMedia}
            </div>
            <div class="board-card-info">
                <span class="board-card-title">${board.name}</span>
                <span class="board-card-meta">${board.updatedAt ? new Date(board.updatedAt).toLocaleDateString() : 'Pizarra interactiva'}</span>
            </div>
        </div>
        `;
    }).join('') : '<p style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 2rem;">No hay pizarras disponibles.</p>';

    modal.innerHTML = `
        <div class="board-modal-content">
            <div class="board-modal-header">
                <div class="flex items-center gap-3">
                    <h3>Seleccionar Pizarra</h3>
                    ${followTeacherBtnHtml}
                </div>
                <button class="board-modal-close" id="closeBoardModal">&times;</button>
            </div>
            <div class="board-grid">
                ${boardsHtml}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const btnClose = modal.querySelector('#closeBoardModal');
    if (btnClose) btnClose.addEventListener('click', () => modal.remove());

    const btnFollow = modal.querySelector('#btn-follow-teacher');
    if (btnFollow) {
        btnFollow.addEventListener('click', () => {
            syncWithTeacherBoard();
            if (onSelectBoard) onSelectBoard(state.teacherActiveBoardId);
            showToast('Sincronizado con la clase del profesor', 'fa-solid fa-satellite-dish');
            modal.remove();
        });
    }
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    modal.querySelectorAll('.board-card').forEach(card => {
        card.addEventListener('click', () => {
            const selectedId = card.dataset.id;
            state.gdriveActiveFileId = selectedId;
            state.activeBoardId = selectedId;

            const isTeacher = state.userRole === 'teacher' || state.gdriveIsTeacher;
            if (isTeacher) {
                setTeacherActiveBoard(selectedId);
            } else {
                notifyBoardSwitch(selectedId, true);
            }

            if (onSelectBoard) onSelectBoard(selectedId);
            modal.remove();
        });
    });
}

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
        [groupStroke, groupWidth, groupConnArrows, groupSmoothing, groupArrowSize].forEach(g => g && g.classList.remove('hidden'));

        const strokeInput = document.getElementById('ctx-stroke-color');
        if (strokeInput) strokeInput.value = selected.color || '#1e293b';

        const strokeWidthInput = document.getElementById('ctx-stroke-width');
        if (strokeWidthInput) strokeWidthInput.value = selected.lineWidth || selected.strokeWidth || 3;

        const arrowInput = document.getElementById('ctx-arrow-size');
        if (arrowInput) arrowInput.value = selected.arrowSize !== undefined ? selected.arrowSize : 14;

        if (groupSmoothing) {
            const smInput = document.getElementById('ctx-smoothing');
            if (smInput) smInput.value = selected.smoothing !== undefined ? selected.smoothing : state.smoothing;
        }

        syncArrowModeButtons(selected.arrowMode || 'none');
    } else if (selected.type === 'connector') {
        [groupStroke, groupWidth, groupConnStyle, groupConnArrows, groupStyle, groupArrowSize].forEach(g => g && g.classList.remove('hidden'));

        let currentArrowMode = selected.arrowMode;
        if (!currentArrowMode && selected.connType) {
            if (selected.connType.includes('double')) currentArrowMode = 'both';
            else if (selected.connType.includes('arrow')) currentArrowMode = 'end';
            else currentArrowMode = 'none';
        }

        const arrowInput = document.getElementById('ctx-arrow-size');
        if (arrowInput) arrowInput.value = selected.arrowSize || 14;

        const strokeInput = document.getElementById('ctx-stroke-color');
        if (strokeInput) strokeInput.value = selected.strokeColor || '#1e293b';

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
        if (strokeInput) strokeInput.value = selected.strokeColor || '#1e293b';

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

    const btnParticipants = document.getElementById('btn-participants-toggle');
    const participantsDropdown = document.getElementById('participants-dropdown');
    if (btnParticipants && participantsDropdown) {
        btnParticipants.addEventListener('click', (e) => {
            e.stopPropagation();
            participantsDropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#participants-widget')) {
                participantsDropdown.classList.add('hidden');
            }
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

    const btnOrtho = document.getElementById('btn-toggle-ortho');
    if (btnOrtho) {
        btnOrtho.addEventListener('click', () => {
            state.orthoMode = !state.orthoMode;
            btnOrtho.classList.toggle('active', state.orthoMode);
            showToast(state.orthoMode ? 'Modo Ortogonal ACTIVADO (F8)' : 'Modo Ortogonal DESACTIVADO', 'fa-solid fa-compass');
        });
    }

    const btnOsnap = document.getElementById('btn-toggle-osnap');
    if (btnOsnap) {
        btnOsnap.addEventListener('click', () => {
            state.osnapEnabled = !state.osnapEnabled;
            btnOsnap.classList.toggle('active', state.osnapEnabled);
            showToast(state.osnapEnabled ? 'Referencia a Objetos ACTIVADA' : 'Referencia DESACTIVADA', 'fa-solid fa-magnet');
        });
    }

    const btnStudentDraw = document.getElementById('btn-toggle-student-draw');
    if (btnStudentDraw) {
        btnStudentDraw.addEventListener('click', () => {
            toggleStudentDrawingPermission(!state.studentDrawingAllowed);
        });
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

    document.querySelectorAll('.sticky-color-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.stickyColor = opt.getAttribute('data-color');
            setTool('sticky');
            closeAllFlyouts();
        });
    });

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
            const val = parseInt(e.target.value, 10);
            state.pencilWidth = val;
            if (pencilWidthVal) pencilWidthVal.innerText = `${val}px`;

            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) {
                    el.lineWidth = val;
                    el.strokeWidth = val;
                }
            });
            saveState();
            if (renderCallback) renderCallback();
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
            const val = parseInt(e.target.value, 10);
            state.hlWidth = val;
            if (hlWidthVal) hlWidthVal.innerText = `${val}px`;

            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) {
                    el.lineWidth = val;
                    el.strokeWidth = val;
                }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    document.querySelectorAll('.shape-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.activeShape = opt.getAttribute('data-shape');
            setTool('shape');
            closeAllFlyouts();
        });
    });

    document.querySelectorAll('.conn-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            state.activeConnector = opt.getAttribute('data-conn');
            setTool('connector');
            closeAllFlyouts();
        });
    });

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
            const val = parseInt(e.target.value, 10);
            state.selectedIds.forEach(id => {
                const el = state.elements.find(m => m.id === id);
                if (el) { 
                    el.strokeWidth = val; 
                    el.lineWidth = val; 
                }
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxArrowSize = document.getElementById('ctx-arrow-size');
    if (ctxArrowSize) {
        ctxArrowSize.addEventListener('input', (e) => {
            const size = parseInt(e.target.value, 10);
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
                if (el) el.fontSize = parseInt(e.target.value, 10);
            });
            saveState();
            if (renderCallback) renderCallback();
        });
    }

    const ctxSmoothing = document.getElementById('ctx-smoothing');
    if (ctxSmoothing) {
        ctxSmoothing.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
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

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) btnUndo.addEventListener('click', () => undo(renderCallback, updateContextToolbar));

    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) btnRedo.addEventListener('click', () => redo(renderCallback, updateContextToolbar));

    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            state.zoom = Math.min(5.0, state.zoom + 0.2);
            const dropdown = document.getElementById('zoom-dropdown');
            if (dropdown) dropdown.value = state.zoom.toFixed(2);
            updateUserPresence();
            if (renderCallback) renderCallback();
        });
    }

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            state.zoom = Math.max(0.05, state.zoom - 0.2);
            const dropdown = document.getElementById('zoom-dropdown');
            if (dropdown) dropdown.value = state.zoom.toFixed(2);
            updateUserPresence();
            if (renderCallback) renderCallback();
        });
    }

    const zoomDropdown = document.getElementById('zoom-dropdown');
    if (zoomDropdown) {
        zoomDropdown.addEventListener('change', (e) => {
            state.zoom = parseFloat(e.target.value);
            updateUserPresence();
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
            updateUserPresence();
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