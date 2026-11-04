// CANVAS ENGINE & RENDERER - PIZARRA PROFEDIEGO
import { state } from './state.js';

/**
 * Ajusta la resolución del canvas al tamaño actual de la ventana
 */
export function resizeCanvas(canvas, renderFn) {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (renderFn) renderFn();
}

/**
 * Algoritmo de suavizado de esquinas de Chaikin para trazos continuos
 */
export function applyChaikinSmoothing(points, iterations) {
    if (!points || points.length <= 2 || iterations === 0) return points;
    let current = points;
    for (let iter = 0; iter < iterations; iter++) {
        const next = [current[0]];
        for (let i = 0; i < current.length - 1; i++) {
            const p0 = current[i];
            const p1 = current[i + 1];
            const q = { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y };
            const r = { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y };
            next.push(q, r);
        }
        next.push(current[current.length - 1]);
        current = next;
    }
    return current;
}

/**
 * Filtra y aplica el suavizado a un conjunto de puntos según el nivel indicado (0-10)
 */
export function getSmoothedPoints(rawPoints, smoothLevel) {
    if (!rawPoints || rawPoints.length <= 2 || smoothLevel === 0) return rawPoints;
    const minDist = 1.0 + (smoothLevel * 2.2);
    const filtered = [rawPoints[0]];
    for (let i = 1; i < rawPoints.length - 1; i++) {
        const last = filtered[filtered.length - 1];
        const dist = Math.hypot(rawPoints[i].x - last.x, rawPoints[i].y - last.y);
        if (dist >= minDist) {
            filtered.push(rawPoints[i]);
        }
    }
    filtered.push(rawPoints[rawPoints.length - 1]);
    if (filtered.length <= 2) return filtered;
    const iterations = Math.min(4, Math.ceil(smoothLevel / 2.5));
    return applyChaikinSmoothing(filtered, iterations);
}

/**
 * Calcula los límites rectangulares (Bounding Box) de cualquier elemento
 */
export function getElementBounds(el) {
    if (el.width !== undefined && el.height !== undefined) {
        return { x: el.x, y: el.y, width: el.width, height: el.height };
    }
    if (el.points && el.points.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        el.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        return { x: minX - 4, y: minY - 4, width: (maxX - minX) + 8, height: (maxY - minY) + 8 };
    }
    return { x: el.x - 5, y: el.y - 5, width: 120, height: 40 };
}

/**
 * Distancia de un punto a un segmento rectilíneo
 */
function distToSegment(p, a, b) {
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

/**
 * Distancia de un punto a una curva cuadrática Bézier
 */
function distToQuadraticCurve(p, p0, cp, p1) {
    let minDist = Infinity;
    const steps = 25;
    let prev = p0;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const curr = {
            x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * cp.x + t * t * p1.x,
            y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * cp.y + t * t * p1.y
        };
        const d = distToSegment(p, prev, curr);
        if (d < minDist) minDist = d;
        prev = curr;
    }
    return minDist;
}

/**
 * Determina si un punto dado está dentro de un elemento (Ajustado para conectores y curvas)
 */
export function isPointInElement(pt, el) {
    let checkPt = pt;
    if (el.rotation && el.type !== 'connector') {
        const bounds = getElementBounds(el);
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const cos = Math.cos(-el.rotation);
        const sin = Math.sin(-el.rotation);
        const dx = pt.x - cx;
        const dy = pt.y - cy;
        checkPt = {
            x: cx + dx * cos - dy * sin,
            y: cy + dx * sin + dy * cos
        };
    }

    if (el.type === 'connector') {
        const start = { x: el.x, y: el.y };
        const end = { x: el.endX !== undefined ? el.endX : el.x + 100, y: el.endY !== undefined ? el.endY : el.y + 100 };
        const threshold = Math.max(14, ((el.strokeWidth || 2) + 8)) / state.zoom;

        const isCurved = el.isCurved !== undefined ? el.isCurved : (el.connType && el.connType.startsWith('curved'));
        if (isCurved) {
            const cp = el.cp || { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 40 };
            return distToQuadraticCurve(pt, start, cp, end) <= threshold;
        } else {
            return distToSegment(pt, start, end) <= threshold;
        }
    }
    const b = getElementBounds(el);
    return checkPt.x >= b.x && checkPt.x <= b.x + b.width && checkPt.y >= b.y && checkPt.y <= b.y + b.height;
}

/**
 * Renderiza el cuadro completo del lienzo
 */
export function render(canvas, ctx, minimapCanvas, minimapCtx) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.zoom, state.zoom);

    drawGrid(ctx, canvas);

    state.elements.forEach(el => drawElement(ctx, el));

    if (state.tempElement) drawElement(ctx, state.tempElement);

    drawSelectionOverlay(ctx);

    ctx.restore();

    renderMinimap(minimapCanvas, minimapCtx);
}

/**
 * Dibuja la cuadrícula infinita en el fondo
 */
function drawGrid(ctx, canvas) {
    const gridSpacing = 40;
    const startX = Math.floor(-state.pan.x / (gridSpacing * state.zoom)) * gridSpacing - gridSpacing;
    const startY = Math.floor(-state.pan.y / (gridSpacing * state.zoom)) * gridSpacing - gridSpacing;
    const endX = startX + (canvas.width / state.zoom) + gridSpacing * 2;
    const endY = startY + (canvas.height / state.zoom) + gridSpacing * 2;

    ctx.fillStyle = '#cbd5e1';
    for (let x = startX; x < endX; x += gridSpacing) {
        for (let y = startY; y < endY; y += gridSpacing) {
            ctx.beginPath();
            ctx.arc(x, y, 1.2 / Math.sqrt(state.zoom), 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/**
 * Renderiza un elemento individual en el lienzo
 */
function drawElement(ctx, el) {
    ctx.save();
    ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1.0;

    // Aplicar Transformación de Rotación
    if (el.rotation && el.type !== 'connector') {
        const bounds = getElementBounds(el);
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate(el.rotation);
        ctx.translate(-cx, -cy);
    }

    switch (el.type) {
        case 'sticky':
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.fillRect(el.x + 4, el.y + 4, el.width, el.height);
            ctx.fillStyle = el.color || '#fef08a';
            ctx.fillRect(el.x, el.y, el.width, el.height);
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.strokeRect(el.x, el.y, el.width, el.height);
            if (el.text) {
                ctx.fillStyle = '#1e293b';
                ctx.font = `${el.fontSize || 16}px Inter, sans-serif`;
                wrapText(ctx, el.text, el.x + 12, el.y + 24, el.width - 24, (el.fontSize || 16) * 1.3);
            }
            break;

        case 'text':
            ctx.fillStyle = el.color || '#1e293b';
            ctx.font = `${el.fontSize || 20}px Inter, sans-serif`;
            ctx.fillText(el.text || 'Haz doble clic para editar', el.x, el.y + (el.fontSize || 20));
            break;

        case 'pencil':
        case 'highlighter':
            if (el.points && el.points.length > 0) {
                const smoothVal = el.smoothing !== undefined ? el.smoothing : state.smoothing;
                const pts = getSmoothedPoints(el.points, smoothVal);

                if (pts.length === 1) {
                    ctx.beginPath();
                    ctx.arc(pts[0].x, pts[0].y, el.lineWidth / 2, 0, Math.PI * 2);
                    ctx.fillStyle = el.color;
                    ctx.fill();
                } else {
                    const hasArrows = el.arrowMode && el.arrowMode !== 'none';
                    // Escalar proporcionalmente la flecha según el grosor del trazo
                    const baseArrowSize = el.arrowSize || 14;
                    const arrowSize = Math.max(baseArrowSize, el.lineWidth * 2.8);
                    const offset = arrowSize * 0.85;

                    // Clonar la lista de puntos para recortar extremos sin alterar el historial
                    let strokePts = pts.map(p => ({ ...p }));

                    // Recortar punto final si hay flecha al final
                    if ((el.arrowMode === 'end' || el.arrowMode === 'both') && strokePts.length >= 2) {
                        const last = strokePts[strokePts.length - 1];
                        const prev = strokePts[Math.max(0, strokePts.length - 2)];
                        const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
                        strokePts[strokePts.length - 1] = {
                            x: last.x - offset * Math.cos(angle),
                            y: last.y - offset * Math.sin(angle)
                        };
                    }

                    // Recortar punto inicial si hay flecha al inicio
                    if ((el.arrowMode === 'start' || el.arrowMode === 'both') && strokePts.length >= 2) {
                        const first = strokePts[0];
                        const next = strokePts[Math.min(strokePts.length - 1, 1)];
                        const angle = Math.atan2(next.y - first.y, next.x - first.x);
                        strokePts[0] = {
                            x: first.x + offset * Math.cos(angle),
                            y: first.y + offset * Math.sin(angle)
                        };
                    }

                    ctx.beginPath();
                    ctx.strokeStyle = el.color;
                    ctx.lineWidth = el.lineWidth;
                    ctx.lineCap = hasArrows ? 'butt' : 'round';
                    ctx.lineJoin = 'round';

                    ctx.moveTo(strokePts[0].x, strokePts[0].y);
                    for (let i = 1; i < strokePts.length - 1; i++) {
                        const xc = (strokePts[i].x + strokePts[i + 1].x) / 2;
                        const yc = (strokePts[i].y + strokePts[i + 1].y) / 2;
                        ctx.quadraticCurveTo(strokePts[i].x, strokePts[i].y, xc, yc);
                    }
                    ctx.lineTo(strokePts[strokePts.length - 1].x, strokePts[strokePts.length - 1].y);
                    ctx.stroke();

                    // Dibujar puntas de flechas en los puntos finales exactos
                    if (hasArrows) {
                        if (el.arrowMode === 'end' || el.arrowMode === 'both') {
                            const pEnd = pts[pts.length - 1];
                            const pPrev = pts[Math.max(0, pts.length - 2)];
                            drawArrowHead(ctx, pPrev.x, pPrev.y, pEnd.x, pEnd.y, el.color, arrowSize);
                        }
                        if (el.arrowMode === 'start' || el.arrowMode === 'both') {
                            const pStart = pts[0];
                            const pNext = pts[Math.min(pts.length - 1, 1)];
                            drawArrowHead(ctx, pNext.x, pNext.y, pStart.x, pStart.y, el.color, arrowSize);
                        }
                    }
                }
            }
            break;

        case 'shape':
            drawShape(ctx, el);
            break;

        case 'connector':
            drawConnector(ctx, el);
            break;

        case 'frame':
            ctx.fillStyle = '#4f46e5';
            ctx.fillRect(el.x, el.y - 26, Math.max(120, ctx.measureText(el.title || 'Marco').width + 24), 26);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillText(el.title || 'Marco', el.x + 10, el.y - 8);

            ctx.strokeStyle = '#4f46e5';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.fillStyle = 'rgba(241, 245, 249, 0.2)';
            ctx.strokeRect(el.x, el.y, el.width, el.height);
            ctx.fillRect(el.x, el.y, el.width, el.height);
            ctx.setLineDash([]);
            break;

        case 'image':
            if (el.imgElement && el.imgElement.complete) {
                ctx.drawImage(el.imgElement, el.x, el.y, el.width, el.height);
            } else if (el.src) {
                const img = new Image();
                img.src = el.src;
                img.onload = () => { render(ctx.canvas, ctx); };
                el.imgElement = img;
            }
            break;
    }

    ctx.restore();
}

/**
 * Ajusta el estilo de punteado de líneas
 */
function setLineDashStyle(ctx, style) {
    if (style === 'dashed') ctx.setLineDash([8, 8]);
    else if (style === 'dotted') ctx.setLineDash([3, 3]);
    else ctx.setLineDash([]);
}

/**
 * Dibuja figuras geométricas (Rectángulo, Círculo, Rombo, Estrella, etc.)
 */
function drawShape(ctx, el) {
    ctx.fillStyle = el.fillColor || '#ffffff';
    ctx.strokeStyle = el.strokeColor || '#1e293b';
    ctx.lineWidth = el.strokeWidth || 2;
    setLineDashStyle(ctx, el.strokeStyle);

    const x = el.x, y = el.y, w = el.width, h = el.height;

    switch (el.shapeType) {
        case 'rect':
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            break;
        case 'rounded-rect':
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, y, w, h, 12);
            else ctx.rect(x, y, w, h);
            ctx.fill();
            ctx.stroke();
            break;
        case 'circle':
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        case 'triangle':
            ctx.beginPath();
            ctx.moveTo(x + w / 2, y);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case 'diamond':
            ctx.beginPath();
            ctx.moveTo(x + w / 2, y);
            ctx.lineTo(x + w, y + h / 2);
            ctx.lineTo(x + w / 2, y + h);
            ctx.lineTo(x, y + h / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case 'star':
            drawStar(ctx, x + w / 2, y + h / 2, 5, Math.min(Math.abs(w), Math.abs(h)) / 2, Math.min(Math.abs(w), Math.abs(h)) / 4);
            break;
        case 'hexagon':
            drawPolygon(ctx, x + w / 2, y + h / 2, 6, Math.min(Math.abs(w), Math.abs(h)) / 2);
            break;
        case 'bubble':
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, y, w, h - 16, 12);
            else ctx.rect(x, y, w, h - 16);
            ctx.moveTo(x + 20, y + h - 16);
            ctx.lineTo(x + 10, y + h);
            ctx.lineTo(x + 35, y + h - 16);
            ctx.fill();
            ctx.stroke();
            break;
    }
    ctx.setLineDash([]);

    if (el.text) {
        ctx.fillStyle = el.textColor || '#1e293b';
        ctx.font = `${el.fontSize || 16}px Inter, sans-serif`;
        wrapText(ctx, el.text, x + 10, y + h / 2 - 8, w - 20, (el.fontSize || 16) * 1.3);
    }
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawPolygon(ctx, cx, cy, sides, radius) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides;
        const px = cx + radius * Math.cos(angle);
        const py = cy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

/**
 * Renderiza conectores rectos o curvos cortando limpiamente la línea antes de la flecha
 */
function drawConnector(ctx, el) {
    ctx.strokeStyle = el.strokeColor || '#1e293b';
    const strokeWidth = el.strokeWidth || 2;
    ctx.lineWidth = strokeWidth;
    setLineDashStyle(ctx, el.strokeStyle);

    const startX = el.x, startY = el.y;
    const endX = el.endX !== undefined ? el.endX : el.x + 100;
    const endY = el.endY !== undefined ? el.endY : el.y + 100;
    const baseArrowSize = el.arrowSize || 14;
    const arrowSize = Math.max(baseArrowSize, strokeWidth * 2.8);

    // Determinar modo de flecha
    let mode = el.arrowMode;
    if (!mode) {
        if (el.connType && el.connType.includes('double')) mode = 'both';
        else if (el.connType && el.connType.includes('arrow')) mode = 'end';
        else mode = 'none';
    }

    const hasArrows = mode && mode !== 'none';
    ctx.lineCap = hasArrows ? 'butt' : 'round';

    const isCurved = el.isCurved !== undefined ? el.isCurved : (el.connType && el.connType.startsWith('curved'));
    const offset = arrowSize * 0.75;

    if (isCurved) {
        const cp = el.cp || { x: (startX + endX) / 2, y: (startY + endY) / 2 - 40 };
        
        const angleEnd = Math.atan2(endY - cp.y, endX - cp.x);
        const angleStart = Math.atan2(startY - cp.y, startX - cp.x);

        let lineStartX = startX;
        let lineStartY = startY;
        let lineEndX = endX;
        let lineEndY = endY;

        if (mode === 'end' || mode === 'both') {
            lineEndX = endX - offset * Math.cos(angleEnd);
            lineEndY = endY - offset * Math.sin(angleEnd);
        }
        if (mode === 'start' || mode === 'both') {
            lineStartX = startX + offset * Math.cos(angleStart);
            lineStartY = startY + offset * Math.sin(angleStart);
        }

        ctx.beginPath();
        ctx.moveTo(lineStartX, lineStartY);
        ctx.quadraticCurveTo(cp.x, cp.y, lineEndX, lineEndY);
        ctx.stroke();

        if (mode === 'end' || mode === 'both') {
            drawArrowHead(ctx, cp.x, cp.y, endX, endY, el.strokeColor, arrowSize);
        }
        if (mode === 'start' || mode === 'both') {
            drawArrowHead(ctx, cp.x, cp.y, startX, startY, el.strokeColor, arrowSize);
        }
    } else {
        const angle = Math.atan2(endY - startY, endX - startX);
        let lineStartX = startX;
        let lineStartY = startY;
        let lineEndX = endX;
        let lineEndY = endY;

        if (mode === 'end' || mode === 'both') {
            lineEndX = endX - offset * Math.cos(angle);
            lineEndY = endY - offset * Math.sin(angle);
        }
        if (mode === 'start' || mode === 'both') {
            lineStartX = startX + offset * Math.cos(angle);
            lineStartY = startY + offset * Math.sin(angle);
        }

        ctx.beginPath();
        ctx.moveTo(lineStartX, lineStartY);
        ctx.lineTo(lineEndX, lineEndY);
        ctx.stroke();

        if (mode === 'end' || mode === 'both') {
            drawArrowHead(ctx, startX, startY, endX, endY, el.strokeColor, arrowSize);
        }
        if (mode === 'start' || mode === 'both') {
            drawArrowHead(ctx, endX, endY, startX, startY, el.strokeColor, arrowSize);
        }
    }
    ctx.setLineDash([]);
}

/**
 * Renderiza la cabeza de una flecha orientada según el ángulo del vector
 */
function drawArrowHead(ctx, fromX, fromY, toX, toY, color, size = 14) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.fillStyle = color || '#1e293b';
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 5.5), toY - size * Math.sin(angle - Math.PI / 5.5));
    ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 5.5), toY - size * Math.sin(angle + Math.PI / 5.5));
    ctx.closePath();
    ctx.fill();
}

/**
 * Ajusta y renderiza párrafos con salto de línea dentro de formas o notas
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) return;
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

/**
 * Renderiza la superposición visual de selección con puntos de control de rotación y tamaño
 */
function drawSelectionOverlay(ctx) {
    if (state.selectedIds.length === 0) return;

    state.selectedIds.forEach(id => {
        const el = state.elements.find(e => e.id === id);
        if (!el) return;

        if (el.type === 'connector') {
            const startX = el.x, startY = el.y;
            const endX = el.endX || el.x + 100, endY = el.endY || el.y + 100;
            const isCurved = el.isCurved !== undefined ? el.isCurved : (el.connType && el.connType.startsWith('curved'));
            
            drawHandleCircle(ctx, startX, startY, '#3b82f6');
            drawHandleCircle(ctx, endX, endY, '#3b82f6');
            
            if (isCurved) {
                const cp = el.cp || { x: (startX + endX) / 2, y: (startY + endY) / 2 - 40 };
                ctx.strokeStyle = '#f59e0b';
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(cp.x, cp.y);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                ctx.setLineDash([]);
                drawHandleCircle(ctx, cp.x, cp.y, '#f59e0b');
            }
        } else {
            ctx.save();
            const bounds = getElementBounds(el);
            const cx = bounds.x + bounds.width / 2;
            const cy = bounds.y + bounds.height / 2;

            if (el.rotation) {
                ctx.translate(cx, cy);
                ctx.rotate(el.rotation);
                ctx.translate(-cx, -cy);
            }

            ctx.strokeStyle = '#4f46e5';
            ctx.lineWidth = 1.5 / state.zoom;
            ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

            // Nodos de esquina
            drawHandleRect(ctx, bounds.x, bounds.y);
            drawHandleRect(ctx, bounds.x + bounds.width, bounds.y);
            drawHandleRect(ctx, bounds.x + bounds.width, bounds.y + bounds.height);
            drawHandleRect(ctx, bounds.x, bounds.y + bounds.height);

            // Manipulador de Rotación arriba del centro
            const rotY = bounds.y - 24 / state.zoom;
            ctx.strokeStyle = '#4f46e5';
            ctx.beginPath();
            ctx.moveTo(cx, bounds.y);
            ctx.lineTo(cx, rotY);
            ctx.stroke();
            drawHandleCircle(ctx, cx, rotY, '#6366f1');

            ctx.restore();
        }
    });
}

function drawHandleCircle(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / state.zoom;
    ctx.beginPath();
    ctx.arc(x, y, 6 / state.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function drawHandleRect(ctx, x, y) {
    const size = 8 / state.zoom;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 1.5 / state.zoom;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
}

/**
 * Renderiza el cuadro de vista previa del minimapa
 */
export function renderMinimap(minimapCanvas, minimapCtx) {
    const minimapContainer = document.getElementById('minimap-container');
    if (!minimapCtx || !minimapCanvas || !minimapContainer || minimapContainer.classList.contains('hidden')) return;

    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    minimapCtx.fillStyle = '#f8fafc';
    minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    state.elements.forEach(el => {
        minimapCtx.fillStyle = '#94a3b8';
        const b = getElementBounds(el);
        const mx = (b.x / 10) + minimapCanvas.width / 2;
        const my = (b.y / 10) + minimapCanvas.height / 2;
        minimapCtx.fillRect(mx, my, Math.max(2, b.width / 10), Math.max(2, b.height / 10));
    });
}
