// CANVAS TOOLS & POINTER EVENTS - PIZARRA PROFEDIEGO
import { state, screenToWorld, worldToScreen, saveState } from './state.js';
import { isPointInElement, getElementBounds, rotatePoint, getConnectorPoints, distToSegment, getEffectiveColor, getLuminance } from './canvasEngine.js';

let renderCallback = null;
let setToolCallback = null;
let updateContextToolbarCallback = null;
let renderScheduled = false;

const inlineEditor = document.getElementById('inline-text-editor');

function scheduleRender() {
    if (!renderScheduled) {
        renderScheduled = true;
        requestAnimationFrame(() => {
            if (renderCallback) renderCallback();
            renderScheduled = false;
        });
    }
}

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

export function joinSelectedLines() {
    if (!state.autoJoinEnabled) return;
    if (state.selectedIds.length < 2) return;

    const selectedLines = state.elements.filter(el => 
        state.selectedIds.includes(el.id) && 
        (el.type === 'pencil' || el.type === 'highlighter' || el.type === 'connector')
    );

    if (selectedLines.length < 2) return;

    let combinedPoints = [];
    selectedLines.forEach(el => {
        const pts = el.points || getConnectorPoints(el);
        if (combinedPoints.length === 0) {
            combinedPoints = [...pts];
        } else {
            const lastPt = combinedPoints[combinedPoints.length - 1];
            const startPt = pts[0];
            const endPt = pts[pts.length - 1];

            if (Math.hypot(lastPt.x - endPt.x, lastPt.y - endPt.y) < Math.hypot(lastPt.x - startPt.x, lastPt.y - startPt.y)) {
                combinedPoints.push(...[...pts].reverse());
            } else {
                combinedPoints.push(...pts);
            }
        }
    });

    const first = selectedLines[0];
    const newId = 'joined_' + Date.now();

    const joinedElement = {
        id: newId,
        type: first.type === 'connector' ? 'connector' : 'pencil',
        color: first.color || first.strokeColor || '#1e293b',
        lineWidth: first.lineWidth || first.strokeWidth || 3,
        strokeWidth: first.strokeWidth || first.lineWidth || 3,
        strokeColor: first.strokeColor || first.color || '#1e293b',
        points: combinedPoints,
        x: combinedPoints[0].x,
        y: combinedPoints[0].y,
        endX: combinedPoints[combinedPoints.length - 1].x,
        endY: combinedPoints[combinedPoints.length - 1].y
    };

    state.elements = state.elements.filter(e => !state.selectedIds.includes(e.id));
    state.elements.push(joinedElement);
    state.selectedIds = [newId];
    saveState();
}

function applyAutoCADOrthogonalSnap(startPt, currentPt) {
    const dx = Math.abs(currentPt.x - startPt.x);
    const dy = Math.abs(currentPt.y - startPt.y);

    if (dx > dy) {
        return { x: currentPt.x, y: startPt.y };
    } else {
        return { x: startPt.x, y: currentPt.y };
    }
}

export function openInlineEditor(el) {
    if (!el || !inlineEditor) return;
    state.editingElementId = el.id;

    const canvas = document.getElementById('board-canvas');
    if (!canvas) return;

    if (el.type === 'text' && !el.width) {
        el.width = 320;
    }

    const bounds = getElementBounds(el);
    const screenPos = worldToScreen(bounds.x, bounds.y);

    let bgColor = state.darkMode ? '#1e293b' : '#ffffff';
    let textColor = state.darkMode ? '#f8fafc' : '#1e293b';

    if (el.type === 'sticky') {
        bgColor = el.color || '#fef08a';
        const bgLum = getLuminance(bgColor);
        textColor = bgLum < 0.4 ? '#f8fafc' : '#1e293b';
    } else if (el.type === 'shape') {
        bgColor = getEffectiveColor(el.fillColor || (state.darkMode ? '#1e293b' : '#ffffff'), 'fill', el.type);
        const fillLum = getLuminance(bgColor);
        textColor = fillLum < 0.45 ? '#f8fafc' : '#0f172a';
    } else if (el.type === 'text') {
        bgColor = state.darkMode ? '#1e293b' : '#ffffff';
        textColor = getEffectiveColor(el.color || '#1e293b', 'text', el.type);
    }

    inlineEditor.style.left = `${screenPos.x}px`;
    inlineEditor.style.top = `${screenPos.y}px`;
    inlineEditor.style.width = `${Math.max(140, bounds.width * state.zoom)}px`;
    inlineEditor.style.height = `${Math.max(60, bounds.height * state.zoom)}px`;
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

export function closeInlineEditor() {
    if (state.editingElementId) {
        const editingId = state.editingElementId;
        state.editingElementId = null;

        const el = state.elements.find(e => e.id === editingId);
        if (el && inlineEditor) {
            const trimmed = inlineEditor.value.trim();
            el.text = trimmed;

            if (el.type === 'text' && !el.width) {
                el.width = 320;
            }
            if (el.type === 'text' && !trimmed) {
                state.elements = state.elements.filter(e => e.id !== editingId);
                state.selectedIds = state.selectedIds.filter(id => id !== editingId);
            }
            saveState();
        }
    }
    if (inlineEditor) inlineEditor.style.display = 'none';
    scheduleRender();
}

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

    canvas.addEventListener('pointerdown', (e) => {
        if (!state.gdriveIsTeacher && !state.studentDrawingAllowed) {
            return;
        }

        if (state.editingElementId) {
            closeInlineEditor();
        }

        const worldPos = screenToWorld(e.clientX, e.clientY, canvas);
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
                                scheduleRender();
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
                        const cos = Math.cos(-selected.rotation);
                        const sin = Math.sin(-selected.rotation);
                        const dx = worldPos.x - cx;
                        const dy = worldPos.y - cy;
                        checkPos = { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
                    }

                    const rotY = b.y - 24 / state.zoom;
                    if (Math.hypot(checkPos.x - cx, checkPos.y - rotY) <= 14 / state.zoom) {
                        state.isRotating = true;
                        state.rotationCenter = { x: cx, y: cy };
                        return;
                    }

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
            scheduleRender();
            return;
        }

        if (state.activeTool === 'eraser') {
            if (clickedEl) {
                state.elements = state.elements.filter(el => el.id !== clickedEl.id);
                state.selectedIds = state.selectedIds.filter(id => id !== clickedEl.id);
                saveState();
                scheduleRender();
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
                strokeColor: state.pencilColor,
                lineWidth: state.pencilWidth,
                strokeWidth: state.pencilWidth,
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
                strokeColor: state.hlColor,
                lineWidth: state.hlWidth,
                strokeWidth: state.hlWidth,
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
            const isOrthogonal = state.activeConnector === 'orthogonal';
            const isCurved = state.activeConnector.startsWith('curved');
            let arrowMode = 'none';
            if (state.activeConnector.includes('arrow')) arrowMode = 'end';

            state.tempElement = {
                id: newId,
                type: 'connector',
                connType: state.activeConnector,
                isOrthogonal,
                isCurved,
                arrowMode,
                arrowSize: 14,
                x: worldPos.x,
                y: worldPos.y,
                endX: worldPos.x,
                endY: worldPos.y,
                cp: { x: worldPos.x, y: worldPos.y - 30 },
                strokeColor: state.pencilColor,
                color: state.pencilColor,
                strokeWidth: 2,
                lineWidth: 2,
                strokeStyle: 'solid'
            };
        }
        scheduleRender();
    });

    canvas.addEventListener('pointermove', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY, canvas);

        if (state.isPanning) {
            state.pan.x += e.clientX - state.lastMousePos.x;
            state.pan.y += e.clientY - state.lastMousePos.y;
            state.lastMousePos = { x: e.clientX, y: e.clientY };
            scheduleRender();
            return;
        }

        if (state.isRotating && state.selectedIds.length === 1 && state.rotationCenter) {
            const el = state.elements.find(e => e.id === state.selectedIds[0]);
            if (el) {
                const angle = Math.atan2(worldPos.y - state.rotationCenter.y, worldPos.x - state.rotationCenter.x);
                el.rotation = angle + Math.PI / 2;
                scheduleRender();
            }
            return;
        }

        if (state.isResizing && state.selectedIds.length === 1) {
            const el = state.elements.find(e => e.id === state.selectedIds[0]);
            if (el) {
                if (el.type === 'connector' && state.activeHandle.startsWith('pt_')) {
                    const idx = parseInt(state.activeHandle.split('_')[1]);
                    if (!el.points) el.points = getConnectorPoints(el);
                    
                    let targetPos = worldPos;
                    if (el.isOrthogonal && idx > 0) {
                        targetPos = applyAutoCADOrthogonalSnap(el.points[idx - 1], worldPos);
                    }

                    if (el.points && el.points[idx]) {
                        el.points[idx] = targetPos;
                        el.x = el.points[0].x;
                        el.y = el.points[0].y;
                        el.endX = el.points[el.points.length - 1].x;
                        el.endY = el.points[el.points.length - 1].y;
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
                    } else if (h === 'sw') {
                        newW = Math.max(minSize, init.x + init.width - localPos.x);
                        newH = Math.max(minSize, localPos.y - init.y);
                        newX = init.x + init.width - newW;
                    } else if (h === 'ne') {
                        newW = Math.max(minSize, localPos.x - init.x);
                        newH = Math.max(minSize, init.y + init.height - localPos.y);
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
                scheduleRender();
            }
            return;
        }

        if (state.isDragging && state.selectedIds.length > 0) {
            const dx = worldPos.x - state.startPoint.x;
            const dy = worldPos.y - state.startPoint.y;

            state.alignmentGuides = [];
            let snapDx = dx;
            let snapDy = dy;

            if (state.alignmentGuidesEnabled && state.selectedIds.length === 1) {
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
            state.startPoint = { x: state.startPoint.x + snapDx, y: state.startPoint.y + snapDy };
            scheduleRender();
            return;
        }

        if (state.isDrawing && state.tempElement) {
            if (state.tempElement.type === 'pencil' || state.tempElement.type === 'highlighter') {
                state.tempElement.points.push({ x: worldPos.x, y: worldPos.y });
            } else if (state.tempElement.type === 'shape') {
                state.tempElement.width = worldPos.x - state.tempElement.x;
                state.tempElement.height = worldPos.y - state.tempElement.y;
            } else if (state.tempElement.type === 'connector') {
                let targetPos = worldPos;
                if (state.tempElement.isOrthogonal) {
                    targetPos = applyAutoCADOrthogonalSnap({ x: state.tempElement.x, y: state.tempElement.y }, worldPos);
                }
                state.tempElement.endX = targetPos.x;
                state.tempElement.endY = targetPos.y;
            }
            scheduleRender();
        }
    });

    canvas.addEventListener('pointerup', () => {
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
            scheduleRender();
            return;
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
            scheduleRender();
        }
    });

    canvas.addEventListener('dblclick', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY, canvas);
        const clicked = [...state.elements].reverse().find(el => isPointInElement(worldPos, el));
        if (clicked) {
            if (clicked.type === 'connector') {
                addConnectorIntermediatePoint(clicked, worldPos);
                saveState();
                scheduleRender();
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
        scheduleRender();
    }, { passive: false });
}