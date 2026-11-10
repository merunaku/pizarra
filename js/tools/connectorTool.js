// OPERACIONES DE CONECTORES Y LÍNEAS
import { state, saveState } from '../state.js';
import { getConnectorPoints, distToSegment } from '../canvasEngine.js';

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
 * Une múltiples líneas/trazos o conectores seleccionados en un único trazo continuo
 */
export function joinSelectedLines() {
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