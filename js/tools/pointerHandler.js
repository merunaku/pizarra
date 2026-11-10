// CONTROLADOR DE INTERACCIÓN Y EVENTOS DE PUNTERO
import { state, screenToWorld, saveState } from '../state.js';
import { isPointInElement, getElementBounds, rotatePoint, getConnectorPoints } from '../canvasEngine.js';
import { openInlineEditor, closeInlineEditor, initTextEditor } from './textEditor.js';
import { addConnectorIntermediatePoint, removeConnectorIntermediatePoint } from './connectorTool.js';
import { setupImagePasteListener } from './imageTool.js';
import { closeAllFlyouts } from '../uiController.js';

let renderCallback = null;
let setToolCallback = null;
let updateContextToolbarCallback = null;

function getSnapPoint(worldPos) {
    if (!state.osnapEnabled) return worldPos;
    const snapThreshold = 12 / state.zoom;
    let closestSnap = null;
    let minDist = snapThreshold;

    state.elements.forEach(el => {
        const bounds = getElementBounds(el);
        const pointsToTest = [
            { x: bounds.x, y: bounds.y },
            { x: bounds.x + bounds.width, y: bounds.y },
            { x: bounds.x, y: bounds.y + bounds.height },
            { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
            { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
        ];

        if (el.points) pointsToTest.push(...el.points);

        pointsToTest.forEach(pt => {
            const d = Math.hypot(worldPos.x - pt.x, worldPos.y - pt.y);
            if (d < minDist) {
                minDist = d;
                closestSnap = { x: pt.x, y: pt.y };
            }
        });
    });

    state.osnapPoint = closestSnap;
    return closestSnap || worldPos;
}

export function setupCanvasListeners(canvas, ctx, renderFn, setToolFn, updateContextToolbarFn) {
    renderCallback = renderFn;
    setToolCallback = setToolFn;
    updateContextToolbarCallback = updateContextToolbarFn;

    initTextEditor(renderCallback);
    setupImagePasteListener(canvas, renderCallback);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'F8') {
            e.preventDefault();
            state.orthoMode = !state.orthoMode;
            const orthoBtn = document.getElementById('btn-toggle-ortho');
            if (orthoBtn) orthoBtn.classList.toggle('active', state.orthoMode);
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            closeInlineEditor();
            closeAllFlyouts();
            state.selectedIds = [];
            if (setToolCallback) setToolCallback('select');
            if (renderCallback) renderCallback();
        }
    });

    canvas.addEventListener('pointerdown', (e) => {
        if ((state.userRole === 'student' || !state.gdriveIsTeacher) && !state.studentDrawingAllowed) return;

        // RETENER CAPTURA DE PUNTERO: Evita soltar el objeto si el cursor sale del canvas o se mueve rápido
        try {
            canvas.setPointerCapture(e.pointerId);
        } catch (_) {}

        if (state.editingElementId) {
            closeInlineEditor();
        }

        let worldPos = screenToWorld(e.clientX, e.clientY, canvas);
        worldPos = getSnapPoint(worldPos);

        state.startPoint = worldPos;
        state.lastMousePos = { x: e.clientX, y: e.clientY };

        if (state.activeTool === 'hand' || e.button === 1) {
            state.isPanning = true;
            canvas.style.cursor = 'grabbing';
            return;
        }

        if (state.selectedIds.length === 1) {
            const selected = state.elements.find(el => el.id === state.selectedIds[0]);
            if (selected) {
                if (selected.type === 'connector') {
                    const pts = getConnectorPoints(selected);
                    for (let i = 0; i < pts.length; i++) {
                        if (Math.hypot(worldPos.x - pts[i].x, worldPos.y - pts[i].y) < 14 / state.zoom) {
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

                    let checkPos = worldPos;
                    if (selected.rotation) {
                        checkPos = rotatePoint(worldPos, -selected.rotation, { x: cx, y: cy });
                    }

                    const rotY = b.y - 24 / state.zoom;
                    if (Math.hypot(checkPos.x - cx, checkPos.y - rotY) <= 14 / state.zoom) {
                        state.isRotating = true;
                        state.rotationCenter = { x: cx, y: cy };
                        return;
                    }

                    const handleRadius = 14 / state.zoom;
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
                rotation: 0,
                points: [{ x: worldPos.x, y: worldPos.y }]
            };
        } else if (state.activeTool === 'highlighter') {
            state.tempElement = {
                id: newId,
                type: 'highlighter',
                color: state.hlColor,
                lineWidth: state.hlWidth,
                rotation: 0,
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
                strokeWidth: state.pencilWidth || 2,
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
                strokeWidth: state.pencilWidth || 2,
                strokeStyle: 'solid'
            };
        }
        if (renderCallback) renderCallback();
    });

    canvas.addEventListener('pointermove', (e) => {
        let worldPos = screenToWorld(e.clientX, e.clientY, canvas);
        worldPos = getSnapPoint(worldPos);

        if ((state.orthoMode || e.shiftKey) && state.isDrawing && state.startPoint) {
            const dx = Math.abs(worldPos.x - state.startPoint.x);
            const dy = Math.abs(worldPos.y - state.startPoint.y);
            if (dx > dy) worldPos.y = state.startPoint.y;
            else worldPos.x = state.startPoint.x;
        }

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

            state.alignmentGuides = [];
            let snapDx = dx;
            let snapDy = dy;

            if (state.selectedIds.length === 1) {
                const dragged = state.elements.find(e => e.id === state.selectedIds[0]);
                if (dragged && dragged.type !== 'connector' && dragged.type !== 'pencil') {
                    const b = getElementBounds(dragged);
                    const targetBox = { x: b.x + dx, y: b.y + dy, width: b.width, height: b.height };
                    const threshold = 6 / state.zoom;

                    const targetCx = targetBox.x + targetBox.width / 2;
                    const targetCy = targetBox.y + targetBox.height / 2;

                    state.elements.forEach(other => {
                        if (state.selectedIds.includes(other.id)) return;
                        const ob = getElementBounds(other);
                        const otherCx = ob.x + ob.width / 2;
                        const otherCy = ob.y + ob.height / 2;

                        if (Math.abs(targetBox.x - ob.x) < threshold) { snapDx = ob.x - b.x; state.alignmentGuides.push({ type: 'v', pos: ob.x }); }
                        else if (Math.abs(targetBox.x + targetBox.width - (ob.x + ob.width)) < threshold) { snapDx = ob.x + ob.width - (b.x + b.width); state.alignmentGuides.push({ type: 'v', pos: ob.x + ob.width }); }
                        else if (Math.abs(targetCx - otherCx) < threshold) { snapDx = otherCx - (b.x + b.width / 2); state.alignmentGuides.push({ type: 'v', pos: otherCx }); }

                        if (Math.abs(targetBox.y - ob.y) < threshold) { snapDy = ob.y - b.y; state.alignmentGuides.push({ type: 'h', pos: ob.y }); }
                        else if (Math.abs(targetBox.y + targetBox.height - (ob.y + ob.height)) < threshold) { snapDy = ob.y + ob.height - (b.y + b.height); state.alignmentGuides.push({ type: 'h', pos: ob.y + ob.height }); }
                        else if (Math.abs(targetCy - otherCy) < threshold) { snapDy = otherCy - (b.y + b.height / 2); state.alignmentGuides.push({ type: 'h', pos: otherCy }); }
                    });
                }
            }

            state.selectedIds.forEach(id => {
                const el = state.elements.find(e => e.id === id);
                if (el) {
                    if (el.x !== undefined) el.x += snapDx;
                    if (el.y !== undefined) el.y += snapDy;
                    if (el.endX !== undefined) el.endX += snapDx;
                    if (el.endY !== undefined) el.endY += snapDy;
                    if (el.cp) { el.cp.x += snapDx; el.cp.y += snapDy; }
                    if (el.points) el.points.forEach(p => { p.x += snapDx; p.y += snapDy; });
                }
            });
            state.startPoint = { x: worldPos.x, y: worldPos.y };
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

    const handlePointerEnd = (e) => {
        // LIBERAR CAPTURA DE PUNTERO
        try {
            canvas.releasePointerCapture(e.pointerId);
        } catch (_) {}

        state.osnapPoint = null;
        state.alignmentGuides = [];
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
            if (updateContextToolbarCallback) updateContextToolbarCallback();
        }
        if (state.isDrawing && state.tempElement) {
            if (state.tempElement.type === 'shape' || state.tempElement.type === 'connector') {
                if (Math.abs(state.tempElement.width || state.tempElement.endX - state.tempElement.x) < 5) {
                    state.tempElement.width = 120;
                    state.tempElement.height = 80;
                }
            }
            state.elements.push(state.tempElement);

            if (state.tempElement.type === 'pencil' || state.tempElement.type === 'highlighter') {
                state.selectedIds = [];
            } else {
                state.selectedIds = [state.tempElement.id];
            }

            state.tempElement = null;
            state.isDrawing = false;
            saveState();
            if (updateContextToolbarCallback) updateContextToolbarCallback();
            if (renderCallback) renderCallback();
        }
    };

    canvas.addEventListener('pointerup', handlePointerEnd);
    canvas.addEventListener('pointercancel', handlePointerEnd);

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
}