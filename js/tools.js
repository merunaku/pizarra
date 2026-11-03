// CANVAS TOOLS & POINTER EVENTS - PIZARRA PROFEDIEGO
import { state, screenToWorld, worldToScreen, saveState } from './state.js';
import { isPointInElement, getElementBounds } from './canvasEngine.js';

let renderCallback = null;
let setToolCallback = null;
let updateContextToolbarCallback = null;

const inlineEditor = document.getElementById('inline-text-editor');

/**
 * Abre el editor de texto flotante en la posición del elemento seleccionado
 */
export function openInlineEditor(el) {
    if (!el || !inlineEditor) return;
    const pos = worldToScreen(el.x, el.y);
    const bounds = getElementBounds(el);

    inlineEditor.style.left = `${pos.x}px`;
    inlineEditor.style.top = `${pos.y}px`;
    inlineEditor.style.width = `${Math.max(140, bounds.width * state.zoom)}px`;
    inlineEditor.style.height = `${Math.max(60, bounds.height * state.zoom)}px`;
    inlineEditor.value = el.text || '';
    inlineEditor.style.display = 'block';
    inlineEditor.focus();
    state.editingElementId = el.id;
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
    }

    // EVENTO POINTERDOWN (Clic inicial)
    canvas.addEventListener('pointerdown', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY, canvas);
        state.startPoint = worldPos;
        state.lastMousePos = { x: e.clientX, y: e.clientY };

        // Herramienta mano o botón central del ratón
        if (state.activeTool === 'hand' || e.button === 1) {
            state.isPanning = true;
            canvas.style.cursor = 'grabbing';
            return;
        }

        // Detección de puntos de control en conectores seleccionados
        if (state.selectedIds.length === 1) {
            const selected = state.elements.find(el => el.id === state.selectedIds[0]);
            if (selected && selected.type === 'connector') {
                const startX = selected.x, startY = selected.y;
                const endX = selected.endX !== undefined ? selected.endX : selected.x + 100;
                const endY = selected.endY !== undefined ? selected.endY : selected.y + 100;
                const cp = selected.cp || { x: (startX + endX) / 2, y: (startY + endY) / 2 - 40 };

                if (Math.hypot(worldPos.x - cp.x, worldPos.y - cp.y) < 12 / state.zoom) {
                    state.isResizing = true;
                    state.activeHandle = 'cp';
                    return;
                }
                if (Math.hypot(worldPos.x - startX, worldPos.y - startY) < 12 / state.zoom) {
                    state.isResizing = true;
                    state.activeHandle = 'start';
                    return;
                }
                if (Math.hypot(worldPos.x - endX, worldPos.y - endY) < 12 / state.zoom) {
                    state.isResizing = true;
                    state.activeHandle = 'end';
                    return;
                }
            }
        }

        // Herramienta Selección
        if (state.activeTool === 'select') {
            const clicked = [...state.elements].reverse().find(el => isPointInElement(worldPos, el));
            if (clicked) {
                state.selectedIds = [clicked.id];
                state.isDragging = true;
            } else {
                state.selectedIds = [];
            }
            if (updateContextToolbarCallback) updateContextToolbarCallback();
            if (renderCallback) renderCallback();
            return;
        }

        // Creación de nuevos elementos según la herramienta
        const id = 'el_' + Date.now();
        if (state.activeTool === 'pencil' || state.activeTool === 'highlighter') {
            state.isDrawing = true;
            const isHighlighter = state.activeTool === 'highlighter';
            state.tempElement = {
                id,
                type: isHighlighter ? 'highlighter' : 'pencil',
                color: isHighlighter ? state.hlColor : state.pencilColor,
                lineWidth: isHighlighter ? state.hlWidth : state.pencilWidth,
                smoothing: state.smoothing,
                points: [{ x: worldPos.x, y: worldPos.y }]
            };
        } else if (state.activeTool === 'sticky') {
            state.elements.push({
                id,
                type: 'sticky',
                x: worldPos.x - 70,
                y: worldPos.y - 70,
                width: 140,
                height: 140,
                color: state.stickyColor,
                text: 'Nueva Nota'
            });
            state.selectedIds = [id];
            if (setToolCallback) setToolCallback('select');
            saveState();
            if (renderCallback) renderCallback();
        } else if (state.activeTool === 'text') {
            state.elements.push({
                id,
                type: 'text',
                x: worldPos.x,
                y: worldPos.y,
                text: 'Texto Nuevo',
                fontSize: 20,
                color: '#1e293b'
            });
            state.selectedIds = [id];
            if (setToolCallback) setToolCallback('select');
            saveState();
            if (renderCallback) renderCallback();
        } else if (state.activeTool === 'shape') {
            state.isDrawing = true;
            state.tempElement = {
                id,
                type: 'shape',
                shapeType: state.activeShape,
                x: worldPos.x,
                y: worldPos.y,
                width: 0,
                height: 0,
                fillColor: '#ffffff',
                strokeColor: '#1e293b',
                strokeWidth: 2,
                strokeStyle: 'solid'
            };
        } else if (state.activeTool === 'connector') {
            state.isDrawing = true;
            state.tempElement = {
                id,
                type: 'connector',
                connType: state.activeConnector,
                x: worldPos.x,
                y: worldPos.y,
                endX: worldPos.x,
                endY: worldPos.y,
                cp: { x: worldPos.x, y: worldPos.y - 30 },
                strokeColor: '#1e293b',
                strokeWidth: 2
            };
        } else if (state.activeTool === 'eraser') {
            const target = [...state.elements].reverse().find(el => isPointInElement(worldPos, el));
            if (target) {
                state.elements = state.elements.filter(e => e.id !== target.id);
                saveState();
                if (renderCallback) renderCallback();
            }
        }
    });

    // EVENTO POINTERMOVE (Arrastre / Dibujo en progreso)
    canvas.addEventListener('pointermove', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY, canvas);

        if (state.isPanning) {
            state.pan.x += e.clientX - state.lastMousePos.x;
            state.pan.y += e.clientY - state.lastMousePos.y;
            state.lastMousePos = { x: e.clientX, y: e.clientY };
            if (renderCallback) renderCallback();
            return;
        }

        if (state.isResizing && state.selectedIds.length === 1) {
            const el = state.elements.find(e => e.id === state.selectedIds[0]);
            if (el && el.type === 'connector') {
                if (state.activeHandle === 'cp') el.cp = { x: worldPos.x, y: worldPos.y };
                else if (state.activeHandle === 'start') { el.x = worldPos.x; el.y = worldPos.y; }
                else if (state.activeHandle === 'end') { el.endX = worldPos.x; el.endY = worldPos.y; }
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
                    el.x += dx;
                    el.y += dy;
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

    // EVENTO POINTERUP (Fin de interacción)
    canvas.addEventListener('pointerup', () => {
        if (state.isPanning) {
            state.isPanning = false;
            canvas.style.cursor = 'crosshair';
        }
        if (state.isDragging || state.isResizing) {
            state.isDragging = false;
            state.isResizing = false;
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
            if (setToolCallback) setToolCallback('select');
        }
    });

    // EVENTO DBLCLICK (Edición rápida)
    canvas.addEventListener('dblclick', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY, canvas);
        const clicked = [...state.elements].reverse().find(el => isPointInElement(worldPos, el));
        if (clicked) {
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
        const items = e.clipboardData || e.clipboardData.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
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
        }
    });
}
