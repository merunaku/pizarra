// CANVAS TOOLS & POINTER EVENTS - PIZARRA PROFEDIEGO
import { state, screenToWorld, worldToScreen, saveState } from './state.js';
import { isPointInElement, getElementBounds, rotatePoint, getConnectorPoints, distToSegment } from './canvasEngine.js';

let renderCallback = null;
let setToolCallback = null;
let updateContextToolbarCallback = null;

const inlineEditor = document.getElementById('inline-text-editor');

/**
 * Inserta un nuevo punto intermedio en la posición indicada sobre el conector
 */
export function addConnectorIntermediatePoint(el, pt) {
    if (!el.points) {
        el.points = getConnectorPoints(el);
    }
    let minD = Infinity;
    let insertIdx = 1;
    for (let i = 0; i < el.points.length - 1; i++) {
        const d = distToSegment(pt, el.points[i], el.points[i + 1]);
        if (d < minD) {
            minD = d;
            insertIdx = i + 1;
        }
    }
    el.points.splice(insertIdx, 0, { x: pt.x, y: pt.y });
    el.x = el.points[0].x;
    el.y = el.points[0].y;
    el.endX = el.points[el.points.length - 1].x;
    el.endY = el.points[el.points.length - 1].y;
}

/**
 * Elimina un punto intermedio específico de un conector
 */
export function removeConnectorIntermediatePoint(el, index) {
    if (!el || !el.points || el.points.length <= 2) return;
    if (index > 0 && index < el.points.length - 1) {
        el.points.splice(index, 1);
        el.x = el.points[0].x;
        el.y = el.points[0].y;
        el.endX = el.points[el.points.length - 1].x;
        el.endY = el.points[el.points.length - 1].y;
    }
}

/**
 * Abre el editor de texto flotante e inline sobre el elemento especificado
 */
export function openInlineEditor(el) {
    if (!el || !inlineEditor) return;
    state.editingElementId = el.id;

    const canvas = document.getElementById('board-canvas');
    if (!canvas) return;

    const bounds = getElementBounds(el);
    const screenPos = worldToScreen(bounds.x, bounds.y);

    let bgColor = 'transparent';
    let textColor = state.darkMode ? '#f8fafc' : '#1e293b';

    if (el.type === 'sticky') {
        bgColor = el.color || '#fef08a';
        textColor = '#1e293b'; // Texto oscuro siempre legible sobre la nota adhesiva
    } else if (el.type === 'shape') {
        bgColor = el.fillColor || (state.darkMode ? '#1e293b' : '#ffffff');
        textColor = el.textColor || el.strokeColor || (state.darkMode ? '#f8fafc' : '#1e293b');
    } else if (el.type === 'text') {
        bgColor = state.darkMode ? '#1e293b' : '#ffffff';
        textColor = el.color || (state.darkMode ? '#f8fafc' : '#1e293b');
    }

    inlineEditor.style.left = `${screenPos.x}px`;
    inlineEditor.style.top = `${screenPos.y}px`;
    inlineEditor.style.width = `${Math.max(140, bounds.width * state.zoom)}px`;
    inlineEditor.style.height = `${Math.max(80, bounds.height * state.zoom)}px`;
    inlineEditor.style.fontSize = `${(el.fontSize || 16) * state.zoom}px`;
    inlineEditor.style.color = textColor;
    inlineEditor.style.backgroundColor = bgColor;
    inlineEditor.style.display = 'block';
    inlineEditor.value = el.text || '';

    setTimeout(() => {
        inlineEditor.focus();
        inlineEditor.select();
    }, 50);
}

/**
 * Cierra el editor de texto flotante y guarda los cambios
 */
export function closeInlineEditor() {
    if (state.editingElementId) {
        const el = state.elements.find(e => e.id === state.editingElementId);
        if (el && inlineEditor) {
            el.text = inlineEditor.value.trim();
            saveState();
            if (renderCallback) renderCallback();
        }
    }
    state.editingElementId = null;
    if (inlineEditor) inlineEditor.style.display = 'none';
}

/**
 * Configura los eventos del mouse, táctiles y teclado en el lienzo
 */
export function setupCanvasListeners(canvas, ctx, renderFn, setToolFn, updateContextToolbarFn) {
    renderCallback = renderFn;
    setToolCallback = setToolFn;
    updateContextToolbarCallback = updateContextToolbarFn;

    if (inlineEditor) {
        inlineEditor.addEventListener('blur', closeInlineEditor);
        inlineEditor.addEventListener('input', () => {
            if (state.editingElementId) {
                const el = state.elements.find(e => e.id === state.editingElementId);
                if (el) {
                    el.text = inlineEditor.value;
                    if (renderCallback) renderCallback();
                }
            }
        });
        inlineEditor.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                closeInlineEditor();
            }
        });
    }

    // EVENTO POINTERDOWN (Clic inicial)
    canvas.addEventListener('pointerdown', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY, canvas);
        state.startPoint = worldPos;
        state.lastMousePos = { x: e.clientX, y: e.clientY };

        if (state.activeTool === 'hand' || e.button === 1) {
            state.isPanning = true;
            canvas.style.cursor = 'grabbing';
            return;
        }

        // Detección de manipuladores de Selección / Rotación / Tamaño / Puntos de Conector
        if (state.selectedIds.length === 1) {
            const selected = state.elements.find(el => el.id === state.selectedIds[0]);
            if (selected) {
                if (selected.type === 'connector') {
                    const pts = getConnectorPoints(selected);
                    for (let i = 0; i < pts.length; i++) {
                        if (Math.hypot(worldPos.x - pts[i].x, worldPos.y - pts[i].y) < 14 / state.zoom) {
                            // Alt + Clic en punto intermedio para eliminarlo
                            if (e.altKey && i > 0 && i < pts.length - 1) {
                                removeConnectorIntermediatePoint(selected, i);
                                saveState();
                                if (renderCallback) renderCallback();
                                return;
                            }
                            state.isResizing = true;
                            state.activeHandle = 'pt_' + i;
                            return;
                        }
                    }
                } else {
                    const b = getElementBounds(selected);
                    const cx = b.x + b.width / 2;
                    const cy = b.y + b.height / 2;

                    // Ajustar punto clicado si hay rotación existente
                    let checkPos = worldPos;
                    if (selected.rotation) {
                        const cos = Math.cos(-selected.rotation);
                        const sin = Math.sin(-selected.rotation);
                        const dx = worldPos.x - cx;
                        const dy = worldPos.y - cy;
                        checkPos = { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
                    }

                    // Check Manipulador de Rotación
                    const rotY = b.y - 24 / state.zoom;
                    if (Math.hypot(checkPos.x - cx, checkPos.y - rotY) <= 14 / state.zoom) {
                        state.isRotating = true;
                        state.rotationCenter = { x: cx, y: cy };
                        return;
                    }

                    // Check Manipuladores de Esquinas
                    const handleRadius = 12 / state.zoom;
                    const corners = [
                        { name: 'nw', x: b.x, y: b.y },
                        { name: 'ne', x: b.x + b.width, y: b.y },
                        { name: 'se', x: b.x + b.width, y: b.y + b.height },
                        { name: 'sw', x: b.x, y: b.y + b.height }
                    ];

                    for (const c of corners) {
                        if (Math.hypot(checkPos.x - c.x, checkPos.y - c.y) <= handleRadius) {
                            state.isResizing = true;
                            state.activeHandle = c.name;
                            state.resizeInitialBounds = getElementBounds(selected);
                            state.resizeRotation = selected.rotation || 0;
                            state.resizeCenter = {
                                x: state.resizeInitialBounds.x + state.resizeInitialBounds.width / 2,
                                y: state.resizeInitialBounds.y + state.resizeInitialBounds.height / 2
                            };
                            if (selected.points) {
                                state.resizeInitialPoints = selected.points.map(p => ({ ...p }));
                            }
                            return;
                        }
                    }
                }
            }
        }

        // Selección o Creación de Elementos
        const clickedEl = [...state.elements].reverse().find(el => isPointInElement(worldPos, el));

        if (state.activeTool === 'select') {
            if (clickedEl) {
                if (!e.shiftKey && !state.selectedIds.includes(clickedEl.id)) {
                    state.selectedIds = [clickedEl.id];
                } else if (e.shiftKey) {
                    if (state.selectedIds.includes(clickedEl.id)) {
                        state.selectedIds = state.selectedIds.filter(id => id !== clickedEl.id);
                    } else {
                        state.selectedIds.push(clickedEl.id);
                    }
                }
                state.isDragging = true;
            } else {
                state.selectedIds = [];
            }
            if (updateContextToolbarCallback) updateContextToolbarCallback();
            if (renderCallback) renderCallback();
            return;
        }

        if (state.activeTool === 'eraser') {
            if (clickedEl) {
                state.elements = state.elements.filter(el => el.id !== clickedEl.id);
                state.selectedIds = state.selectedIds.filter(id => id !== clickedEl.id);
                saveState();
                if (renderCallback) renderCallback();
            }
            return;
        }

        // Creación de nuevos elementos según la herramienta activa
        state.isDrawing = true;
        const newId = 'el_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        if (state.activeTool === 'pencil') {
            state.tempElement = {
                id: newId,
                type: 'pencil',
                color: state.pencilColor,
                lineWidth: state.pencilWidth,
                arrowMode: state.pencilArrowMode,
                arrowSize: 14,
                smoothing: state.smoothing,
                points: [{ x: worldPos.x, y: worldPos.y }]
            };
        } else if (state.activeTool === 'highlighter') {
            state.tempElement = {
                id: newId,
                type: 'highlighter',
                color: state.hlColor,
                lineWidth: state.hlWidth,
                points: [{ x: worldPos.x, y: worldPos.y }]
            };
        } else if (state.activeTool === 'sticky') {
            state.tempElement = {
                id: newId,
                type: 'sticky',
                x: worldPos.x - 80,
                y: worldPos.y - 80,
                width: 160,
                height: 160,
                color: state.stickyColor,
                text: ''
            };
            state.elements.push(state.tempElement);
            state.selectedIds = [newId];
            state.tempElement = null;
            state.isDrawing = false;
            saveState();
            openInlineEditor(state.elements[state.elements.length - 1]);
            if (setToolCallback) setToolCallback('select');
        } else if (state.activeTool === 'text') {
            state.tempElement = {
                id: newId,
                type: 'text',
                x: worldPos.x,
                y: worldPos.y,
                text: '',
                fontSize: 20,
                color: state.pencilColor
            };
            state.elements.push(state.tempElement);
            state.selectedIds = [newId];
            state.tempElement = null;
            state.isDrawing = false;
            saveState();
            openInlineEditor(state.elements[state.elements.length - 1]);
            if (setToolCallback) setToolCallback('select');
        } else if (state.activeTool === 'shape') {
            state.tempElement = {
                id: newId,
                type: 'shape',
                shapeType: state.activeShape,
                x: worldPos.x,
                y: worldPos.y,
                width: 1,
                height: 1,
                fillColor: '#ffffff',
                strokeColor: state.pencilColor,
                strokeWidth: 2,
                strokeStyle: 'solid',
                text: ''
            };
        } else if (state.activeTool === 'connector') {
            const isCurved = state.activeConnector.startsWith('curved');
            let arrowMode = 'none';
            if (state.activeConnector.includes('arrow')) arrowMode = 'end';

            state.tempElement = {
                id: newId,
                type: 'connector',
                connType: state.activeConnector,
                isCurved,
                arrowMode,
                arrowSize: 14,
                x: worldPos.x,
                y: worldPos.y,
                endX: worldPos.x,
                endY: worldPos.y,
                cp: { x: worldPos.x, y: worldPos.y - 30 },
                strokeColor: state.pencilColor,
                strokeWidth: 2,
                strokeStyle: 'solid'
            };
        }
        if (renderCallback) renderCallback();
    });

    // EVENTO POINTERMOVE (Arrastrar, Escalar, Rotar, Dibujar)
    canvas.addEventListener('pointermove', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY, canvas);

        if (state.isPanning) {
            state.pan.x += e.clientX - state.lastMousePos.x;
            state.pan.y += e.clientY - state.lastMousePos.y;
            state.lastMousePos = { x: e.clientX, y: e.clientY };
            if (renderCallback) renderCallback();
            return;
        }

        if (state.isRotating && state.selectedIds.length === 1 && state.rotationCenter) {
            const el = state.elements.find(e => e.id === state.selectedIds[0]);
            if (el) {
                const angle = Math.atan2(worldPos.y - state.rotationCenter.y, worldPos.x - state.rotationCenter.x);
                el.rotation = angle + Math.PI / 2;
                if (renderCallback) renderCallback();
            }
            return;
        }

        if (state.isResizing && state.selectedIds.length === 1) {
            const el = state.elements.find(e => e.id === state.selectedIds[0]);
            if (el) {
                if (el.type === 'connector' && state.activeHandle.startsWith('pt_')) {
                    const idx = parseInt(state.activeHandle.split('_')[1]);
                    if (!el.points) el.points = getConnectorPoints(el);
                    if (el.points && el.points[idx]) {
                        el.points[idx] = { x: worldPos.x, y: worldPos.y };
                        el.x = el.points[0].x;
                        el.y = el.points[0].y;
                        el.endX = el.points[el.points.length - 1].x;
                        el.endY = el.points[el.points.length - 1].y;
                        if (el.points.length === 3) el.cp = { x: el.points[1].x, y: el.points[1].y };
                    }
                } else if (state.resizeInitialBounds && state.resizeCenter) {
                    const h = state.activeHandle;
                    const init = state.resizeInitialBounds;
                    const centerInit = state.resizeCenter;
                    const rad = state.resizeRotation || 0;
                    const minSize = 10;

                    // Proyectar la posición del cursor al sistema de coordenadas locales unrotadas
                    const localPos = rotatePoint(worldPos, -rad, centerInit);

                    let newW = init.width;
                    let newH = init.height;
                    let newX = init.x;
                    let newY = init.y;

                    if (h === 'se') {
                        newW = Math.max(minSize, localPos.x - init.x);
                        newH = Math.max(minSize, localPos.y - init.y);
                        newX = init.x;
                        newY = init.y;
                    } else if (h === 'sw') {
                        newW = Math.max(minSize, init.x + init.width - localPos.x);
                        newH = Math.max(minSize, localPos.y - init.y);
                        newX = init.x + init.width - newW;
                        newY = init.y;
                    } else if (h === 'ne') {
                        newW = Math.max(minSize, localPos.x - init.x);
                        newH = Math.max(minSize, init.y + init.height - localPos.y);
                        newX = init.x;
                        newY = init.y + init.height - newH;
                    } else if (h === 'nw') {
                        newW = Math.max(minSize, init.x + init.width - localPos.x);
                        newH = Math.max(minSize, init.y + init.height - localPos.y);
                        newX = init.x + init.width - newW;
                        newY = init.y + init.height - newH;
                    }

                    // Calcular desplazamiento del centro local y proyectar al plano general
                    const localCenterInit = { x: init.x + init.width / 2, y: init.y + init.height / 2 };
                    const localCenterNew = { x: newX + newW / 2, y: newY + newH / 2 };
                    const deltaLocal = { x: localCenterNew.x - localCenterInit.x, y: localCenterNew.y - localCenterInit.y };

                    const deltaWorld = rotatePoint({ x: deltaLocal.x, y: deltaLocal.y }, rad, { x: 0, y: 0 });
                    const worldCenterNew = { x: centerInit.x + deltaWorld.x, y: centerInit.y + deltaWorld.y };

                    el.width = newW;
                    el.height = newH;
                    el.x = worldCenterNew.x - newW / 2;
                    el.y = worldCenterNew.y - newH / 2;

                    if (el.points && state.resizeInitialPoints) {
                        const scaleX = init.width > 0 ? newW / init.width : 1;
                        const scaleY = init.height > 0 ? newH / init.height : 1;
                        const shiftX = deltaWorld.x - deltaLocal.x;
                        const shiftY = deltaWorld.y - deltaLocal.y;
                        el.points = state.resizeInitialPoints.map(p => ({
                            x: newX + (p.x - init.x) * scaleX + shiftX,
                            y: newY + (p.y - init.y) * scaleY + shiftY
                        }));
                    }
                }
                if (renderCallback) renderCallback();
            }
            return;
        }

        if (state.isDragging && state.selectedIds.length > 0) {
            const dx = worldPos.x - state.startPoint.x;
            const dy = worldPos.y - state.startPoint.y;
            state.selectedIds.forEach(id => {
                const el = state.elements.find(e => e.id === id);
                if (el) {
                    if (el.x !== undefined) el.x += dx;
                    if (el.y !== undefined) el.y += dy;
                    if (el.endX !== undefined) el.endX += dx;
                    if (el.endY !== undefined) el.endY += dy;
                    if (el.cp) { el.cp.x += dx; el.cp.y += dy; }
                    if (el.points) el.points.forEach(p => { p.x += dx; p.y += dy; });
                }
            });
            state.startPoint = worldPos;
            if (renderCallback) renderCallback();
            return;
        }

        if (state.isDrawing && state.tempElement) {
            if (state.tempElement.type === 'pencil' || state.tempElement.type === 'highlighter') {
                state.tempElement.points.push({ x: worldPos.x, y: worldPos.y });
            } else if (state.tempElement.type === 'shape') {
                state.tempElement.width = worldPos.x - state.tempElement.x;
                state.tempElement.height = worldPos.y - state.tempElement.y;
            } else if (state.tempElement.type === 'connector') {
                state.tempElement.endX = worldPos.x;
                state.tempElement.endY = worldPos.y;
                state.tempElement.cp = {
                    x: (state.tempElement.x + worldPos.x) / 2,
                    y: (state.tempElement.y + worldPos.y) / 2 - 40
                };
            }
            if (renderCallback) renderCallback();
        }
    });

    // EVENTO POINTERUP (Finalizar acciones de puntero)
    canvas.addEventListener('pointerup', () => {
        if (state.isPanning) {
            state.isPanning = false;
            canvas.style.cursor = 'crosshair';
        }
        if (state.isDragging || state.isResizing || state.isRotating) {
            state.isDragging = false;
            state.isResizing = false;
            state.isRotating = false;
            state.resizeInitialBounds = null;
            state.resizeInitialPoints = null;
            state.rotationCenter = null;
            saveState();
        }
        if (state.isDrawing && state.tempElement) {
            if (state.tempElement.type === 'shape' || state.tempElement.type === 'connector') {
                if (Math.abs(state.tempElement.width || state.tempElement.endX - state.tempElement.x) < 5) {
                    state.tempElement.width = 120;
                    state.tempElement.height = 80;
                }
            }
            state.elements.push(state.tempElement);
            state.selectedIds = [state.tempElement.id];
            state.tempElement = null;
            state.isDrawing = false;
            saveState();
            if (updateContextToolbarCallback) updateContextToolbarCallback();
            if (renderCallback) renderCallback();
        }
    });

    // EVENTO DBLCLICK (Edición rápida y adición de puntos intermedios)
    canvas.addEventListener('dblclick', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY, canvas);
        const clicked = [...state.elements].reverse().find(el => isPointInElement(worldPos, el));
        if (clicked) {
            if (clicked.type === 'connector') {
                addConnectorIntermediatePoint(clicked, worldPos);
                saveState();
                if (renderCallback) renderCallback();
                return;
            }
            openInlineEditor(clicked);
        }
    });

    // EVENTO WHEEL (Zoom dinámico con la rueda del ratón)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.min(Math.max(0.05, state.zoom * zoomFactor), 5.0);

        const mouseWorldBefore = screenToWorld(e.clientX, e.clientY, canvas);
        state.zoom = newZoom;
        const mouseWorldAfter = screenToWorld(e.clientX, e.clientY, canvas);

        state.pan.x += (mouseWorldAfter.x - mouseWorldBefore.x) * state.zoom;
        state.pan.y += (mouseWorldAfter.y - mouseWorldBefore.y) * state.zoom;

        const zoomDropdown = document.getElementById('zoom-dropdown');
        if (zoomDropdown) zoomDropdown.value = state.zoom.toFixed(2);
        if (renderCallback) renderCallback();
    }, { passive: false });

    // PEGAR IMÁGENES DESDE EL PORTAPAPELES (CTRL + V)
    window.addEventListener('paste', (e) => {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            if (document.activeElement.id !== 'inline-text-editor') return;
        }

        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
        const files = (e.clipboardData || e.originalEvent?.clipboardData)?.files;

        if (files && files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                if (files[i].type.startsWith('image/')) {
                    processImageFile(files[i], canvas);
                }
            }
        } else if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) processImageFile(blob, canvas);
                }
            }
        }
    });
}

function processImageFile(blob, canvas) {
    const reader = new FileReader();
    reader.onload = (evt) => {
        const img = new Image();
        img.src = evt.target.result;
        img.onload = () => {
            const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, canvas);
            const newId = 'img_' + Date.now();
            state.elements.push({
                id: newId,
                type: 'image',
                x: center.x - img.width / 4,
                y: center.y - img.height / 4,
                width: img.width / 2,
                height: img.height / 2,
                src: evt.target.result,
                imgElement: img
            });
            saveState();
            if (renderCallback) renderCallback();
        };
    };
    reader.readAsDataURL(blob);
}