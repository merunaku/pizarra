// CANVAS ENGINE & RENDERER - PIZARRA PROFEDIEGO
import { state } from './state.js';

/**
 * Ajusta la dimensión del canvas según el tamaño del contenedor o ventana
 */
export function resizeCanvas(canvas, renderCallback) {
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.width = parent ? parent.clientWidth : window.innerWidth;
    canvas.height = parent ? parent.clientHeight : window.innerHeight;
    if (renderCallback) renderCallback();
}

/**
 * Rotación geométrica de un punto respecto a un centro
 */
export function rotatePoint(pt, angle, center) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = pt.x - center.x;
    const dy = pt.y - center.y;
    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos
    };
}

/**
 * Calcula la luminancia percibida de una cadena de color (Hex, RGB, RGBA)
 */
export function getLuminance(colorStr) {
    if (!colorStr) return 0;
    let r = 0, g = 0, b = 0;
    
    if (colorStr.startsWith('#')) {
        let hex = colorStr.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
    } else if (colorStr.startsWith('rgb')) {
        const match = colorStr.match(/\d+/g);
        if (match && match.length >= 3) {
            r = parseInt(match[0]);
            g = parseInt(match[1]);
            b = parseInt(match[2]);
        }
    }
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Retorna el color adaptado visualmente para el lienzo.
 * En Modo Oscuro (state.darkMode = true), los colores oscuros (luminancia < 0.35)
 * se transforman temporalmente a #f8fafc para garantizar máximo contraste.
 * En Modo Claro (state.darkMode = false), retorna el color original guardado.
 */
export function getEffectiveColor(colorStr, role = 'stroke') {
    if (!state.darkMode) {
        if (!colorStr) {
            if (role === 'fill') return '#ffffff';
            return '#1e293b';
        }
        return colorStr;
    }

    // Modo Oscuro activo:
    if (!colorStr) {
        if (role === 'fill') return '#1e293b';
        return '#f8fafc';
    }

    if (colorStr.startsWith('rgba')) {
        const match = colorStr.match(/rgba?\(([^)]+)\)/);
        if (match) {
            const parts = match[1].split(',').map(s => s.trim());
            const r = parseInt(parts[0]), g = parseInt(parts[1]), b = parseInt(parts[2]), a = parts[3] || '1';
            const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            if (lum < 0.35) {
                return `rgba(248, 250, 252, ${a})`;
            }
        }
        return colorStr;
    }

    const lum = getLuminance(colorStr);

    if (role === 'stroke' || role === 'text') {
        if (lum < 0.35) {
            return '#f8fafc';
        }
    } else if (role === 'fill') {
        if (lum < 0.2) {
            return '#1e293b';
        }
    }

    return colorStr;
}

/**
 * Obtiene los límites rectangulares exactos (bounding box) de cualquier elemento
 */
export function getElementBounds(el) {
    if (el.type === 'pencil' || el.type === 'highlighter') {
        if (!el.points || el.points.length === 0) return { x: el.x || 0, y: el.y || 0, width: 20, height: 20 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        el.points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        });
        const padding = Math.max(8, (el.lineWidth || 3) / 2);
        return {
            x: minX - padding,
            y: minY - padding,
            width: Math.max(10, maxX - minX + padding * 2),
            height: Math.max(10, maxY - minY + padding * 2)
        };
    }

    if (el.type === 'text') {
        const lines = (el.text || 'Haz doble clic para editar').split('\n');
        const fSize = el.fontSize || 20;
        let maxW = 120;
        lines.forEach(line => {
            const w = line.length * (fSize * 0.58);
            if (w > maxW) maxW = w;
        });
        const h = Math.max(fSize * 1.3, lines.length * (fSize * 1.35));
        return {
            x: el.x,
            y: el.y,
            width: maxW + 16,
            height: h + 8
        };
    }

    if (el.type === 'connector') {
        const pts = getConnectorPoints(el);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        });
        const pad = Math.max(10, (el.strokeWidth || 2) * 2);
        return {
            x: minX - pad,
            y: minY - pad,
            width: Math.max(20, maxX - minX + pad * 2),
            height: Math.max(20, maxY - minY + pad * 2)
        };
    }

    return {
        x: el.x || 0,
        y: el.y || 0,
        width: el.width || 100,
        height: el.height || 100
    };
}

/**
 * Retorna los puntos de control de un conector
 */
export function getConnectorPoints(el) {
    if (el.points && el.points.length >= 2) {
        return el.points;
    }
    const start = { x: el.x || 0, y: el.y || 0 };
    const end = { x: el.endX !== undefined ? el.endX : start.x + 100, y: el.endY !== undefined ? el.endY : start.y + 100 };
    const isCurved = el.isCurved !== undefined ? el.isCurved : (el.connType && el.connType.startsWith('curved'));

    if (isCurved) {
        const cp = el.cp || { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 40 };
        return [start, cp, end];
    }
    return [start, end];
}

/**
 * Distancia de un punto a un segmento de línea recta
 */
export function distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

/**
 * Distancia de un punto a una curva cuadrática Bézier
 */
function distToQuadraticCurve(p, p0, p1, p2) {
    let minD = Infinity;
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const invT = 1 - t;
        const qx = invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x;
        const qy = invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y;
        const d = Math.hypot(p.x - qx, p.y - qy);
        if (d < minD) minD = d;
    }
    return minD;
}

/**
 * Comprueba si un punto (coordenadas del mundo) está dentro o sobre un elemento
 */
export function isPointInElement(pt, el) {
    if (!el) return false;

    if (el.type === 'pencil' || el.type === 'highlighter') {
        if (!el.points || el.points.length === 0) return false;
        const smoothVal = el.smoothing !== undefined ? el.smoothing : state.smoothing;
        const pts = getSmoothedPoints(el.points, smoothVal);
        const threshold = Math.max(12, (el.lineWidth || 3) / 2 + 6) / state.zoom;

        for (let i = 0; i < pts.length - 1; i++) {
            if (distToSegment(pt, pts[i], pts[i + 1]) <= threshold) {
                return true;
            }
        }
        return false;
    }

    if (el.type === 'connector') {
        const pts = getConnectorPoints(el);
        const threshold = Math.max(14, ((el.strokeWidth || 2) + 8)) / state.zoom;
        const isCurved = el.isCurved !== undefined ? el.isCurved : (el.connType && el.connType.startsWith('curved'));

        if (isCurved && pts.length === 3) {
            return distToQuadraticCurve(pt, pts[0], pts[1], pts[2]) <= threshold;
        }

        for (let i = 0; i < pts.length - 1; i++) {
            if (distToSegment(pt, pts[i], pts[i + 1]) <= threshold) {
                return true;
            }
        }
        return false;
    }

    const bounds = getElementBounds(el);
    let checkPt = pt;
    if (el.rotation) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        checkPt = rotatePoint(pt, -el.rotation, { x: cx, y: cy });
    }

    return checkPt.x >= bounds.x &&
           checkPt.x <= bounds.x + bounds.width &&
           checkPt.y >= bounds.y &&
           checkPt.y <= bounds.y + bounds.height;
}

/**
 * Suavizado de curva Chaikin
 */
function getSmoothedPoints(points, smoothLevel = 5) {
    if (!points || points.length <= 2 || smoothLevel === 0) return points || [];
    
    let current = points;
    const iterations = Math.min(3, Math.ceil(smoothLevel / 3));

    for (let it = 0; it < iterations; it++) {
        const smoothed = [];
        smoothed.push(current[0]);
        for (let i = 0; i < current.length - 1; i++) {
            const p0 = current[i];
            const p1 = current[i + 1];
            const q = { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y };
            const r = { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y };
            smoothed.push(q);
            smoothed.push(r);
        }
        smoothed.push(current[current.length - 1]);
        current = smoothed;
    }
    return current;
}

/**
 * Truncamiento de puntos desde el final para dejar espacio exacto a la cabeza de la flecha
 */
function trimPointsFromEnd(pts, trimDistance) {
    if (pts.length < 2 || trimDistance <= 0) return pts;
    const result = [...pts];
    let remaining = trimDistance;

    while (result.length >= 2 && remaining > 0) {
        const pLast = result[result.length - 1];
        const pPrev = result[result.length - 2];
        const segLen = Math.hypot(pLast.x - pPrev.x, pLast.y - pPrev.y);

        if (segLen <= remaining) {
            remaining -= segLen;
            result.pop();
        } else {
            const ratio = (segLen - remaining) / segLen;
            result[result.length - 1] = {
                x: pPrev.x + (pLast.x - pPrev.x) * ratio,
                y: pPrev.y + (pLast.y - pPrev.y) * ratio
            };
            remaining = 0;
        }
    }
    return result;
}

/**
 * Truncamiento de puntos desde el inicio para dejar espacio exacto a la cabeza de la flecha
 */
function trimPointsFromStart(pts, trimDistance) {
    if (pts.length < 2 || trimDistance <= 0) return pts;
    const result = [...pts];
    let remaining = trimDistance;

    while (result.length >= 2 && remaining > 0) {
        const pFirst = result[0];
        const pNext = result[1];
        const segLen = Math.hypot(pNext.x - pFirst.x, pNext.y - pFirst.y);

        if (segLen <= remaining) {
            remaining -= segLen;
            result.shift();
        } else {
            const ratio = remaining / segLen;
            result[0] = {
                x: pFirst.x + (pNext.x - pFirst.x) * ratio,
                y: pFirst.y + (pNext.y - pFirst.y) * ratio
            };
            remaining = 0;
        }
    }
    return result;
}

/**
 * Obtiene el punto a una distancia hacia atrás sobre la curva para calcular la dirección de la flecha
 */
function getPointAtDistanceBack(pts, fromEnd = true, targetDistance = 15) {
    if (pts.length < 2) return pts[0] || { x: 0, y: 0 };
    let remaining = targetDistance;

    if (fromEnd) {
        for (let i = pts.length - 1; i > 0; i--) {
            const pCurrent = pts[i];
            const pPrev = pts[i - 1];
            const segLen = Math.hypot(pCurrent.x - pPrev.x, pCurrent.y - pPrev.y);
            if (segLen >= remaining) {
                const ratio = remaining / segLen;
                return {
                    x: pCurrent.x - (pCurrent.x - pPrev.x) * ratio,
                    y: pCurrent.y - (pCurrent.y - pPrev.y) * ratio
                };
            }
            remaining -= segLen;
        }
        return pts[0];
    } else {
        for (let i = 0; i < pts.length - 1; i++) {
            const pCurrent = pts[i];
            const pNext = pts[i + 1];
            const segLen = Math.hypot(pNext.x - pCurrent.x, pNext.y - pCurrent.y);
            if (segLen >= remaining) {
                const ratio = remaining / segLen;
                return {
                    x: pCurrent.x + (pNext.x - pCurrent.x) * ratio,
                    y: pCurrent.y + (pNext.y - pCurrent.y) * ratio
                };
            }
            remaining -= segLen;
        }
        return pts[pts.length - 1];
    }
}

/**
 * Renderiza el cuadro completo del lienzo
 */
export function render(canvas, ctx, minimapCanvas, minimapCtx) {
    if (!ctx || !canvas) return;

    if (state.darkMode) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

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

    ctx.fillStyle = state.darkMode ? '#334155' : '#cbd5e1';
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
            if (el.text && el.id !== state.editingElementId) {
                const bgLum = getLuminance(el.color || '#fef08a');
                ctx.fillStyle = bgLum < 0.4 ? '#f8fafc' : '#1e293b';
                ctx.font = `${el.fontSize || 16}px Inter, sans-serif`;
                wrapText(ctx, el.text, el.x + 12, el.y + 24, el.width - 24, (el.fontSize || 16) * 1.3);
            }
            break;

        case 'text':
            if (el.id !== state.editingElementId) {
                ctx.fillStyle = getEffectiveColor(el.color || '#1e293b', 'text');
                ctx.font = `${el.fontSize || 20}px Inter, sans-serif`;
                const lines = (el.text || 'Haz doble clic para editar').split('\n');
                const fSize = el.fontSize || 20;
                lines.forEach((l, idx) => {
                    ctx.fillText(l, el.x + 4, el.y + fSize + idx * (fSize * 1.3));
                });
            }
            break;

        case 'pencil':
        case 'highlighter':
            if (el.points && el.points.length > 0) {
                const smoothVal = el.smoothing !== undefined ? el.smoothing : state.smoothing;
                const pts = getSmoothedPoints(el.points, smoothVal);
                const effectiveColor = getEffectiveColor(el.color, 'stroke');

                if (pts.length === 1) {
                    ctx.beginPath();
                    ctx.arc(pts[0].x, pts[0].y, el.lineWidth / 2, 0, Math.PI * 2);
                    ctx.fillStyle = effectiveColor;
                    ctx.fill();
                } else {
                    const hasArrows = el.arrowMode && el.arrowMode !== 'none';
                    const arrowSize = el.arrowSize !== undefined ? el.arrowSize : Math.max(14, (el.lineWidth || 2) * 2.5);
                    const offset = arrowSize * 0.85;

                    let strokePts = pts.map(p => ({ ...p }));

                    if (el.arrowMode === 'end' || el.arrowMode === 'both') {
                        strokePts = trimPointsFromEnd(strokePts, offset);
                    }
                    if (el.arrowMode === 'start' || el.arrowMode === 'both') {
                        strokePts = trimPointsFromStart(strokePts, offset);
                    }

                    if (strokePts.length >= 2) {
                        ctx.beginPath();
                        ctx.strokeStyle = effectiveColor;
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
                    }

                    if (hasArrows) {
                        const refDist = Math.max(15, arrowSize);
                        if (el.arrowMode === 'end' || el.arrowMode === 'both') {
                            const pEnd = pts[pts.length - 1];
                            const pRef = getPointAtDistanceBack(pts, true, refDist);
                            drawArrowHead(ctx, pRef.x, pRef.y, pEnd.x, pEnd.y, effectiveColor, arrowSize);
                        }
                        if (el.arrowMode === 'start' || el.arrowMode === 'both') {
                            const pStart = pts[0];
                            const pRef = getPointAtDistanceBack(pts, false, refDist);
                            drawArrowHead(ctx, pRef.x, pRef.y, pStart.x, pStart.y, effectiveColor, arrowSize);
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
            ctx.fillStyle = state.darkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(241, 245, 249, 0.2)';
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
    const fillColor = getEffectiveColor(el.fillColor || (state.darkMode ? '#1e293b' : '#ffffff'), 'fill');
    const strokeColor = getEffectiveColor(el.strokeColor || '#1e293b', 'stroke');

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
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

    if (el.text && el.id !== state.editingElementId) {
        const fillLum = getLuminance(fillColor);
        const textColor = fillLum < 0.4 ? '#f8fafc' : getEffectiveColor(el.textColor || el.strokeColor || '#1e293b', 'text');
        ctx.fillStyle = textColor;
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
 * Renderiza conectores rectos o curvos con soporte para múltiples puntos intermedios
 */
function drawConnector(ctx, el) {
    const strokeColor = getEffectiveColor(el.strokeColor || '#1e293b', 'stroke');
    ctx.strokeStyle = strokeColor;
    const strokeWidth = el.strokeWidth || 2;
    ctx.lineWidth = strokeWidth;
    setLineDashStyle(ctx, el.strokeStyle);

    const arrowSize = el.arrowSize !== undefined ? el.arrowSize : Math.max(14, strokeWidth * 2.5);

    let mode = el.arrowMode;
    if (!mode) {
        if (el.connType && el.connType.includes('double')) mode = 'both';
        else if (el.connType && el.connType.includes('arrow')) mode = 'end';
        else mode = 'none';
    }

    const hasArrows = mode && mode !== 'none';
    ctx.lineCap = hasArrows ? 'butt' : 'round';

    const pts = getConnectorPoints(el);
    const isCurved = el.isCurved !== undefined ? el.isCurved : (el.connType && el.connType.startsWith('curved'));
    const offset = arrowSize * 0.8;

    let strokePts = pts.map(p => ({ ...p }));

    if (mode === 'end' || mode === 'both') {
        strokePts = trimPointsFromEnd(strokePts, offset);
    }
    if (mode === 'start' || mode === 'both') {
        strokePts = trimPointsFromStart(strokePts, offset);
    }

    if (strokePts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(strokePts[0].x, strokePts[0].y);

        if (isCurved) {
            if (strokePts.length === 3) {
                ctx.quadraticCurveTo(strokePts[1].x, strokePts[1].y, strokePts[2].x, strokePts[2].y);
            } else {
                for (let i = 1; i < strokePts.length - 1; i++) {
                    const xc = (strokePts[i].x + strokePts[i + 1].x) / 2;
                    const yc = (strokePts[i].y + strokePts[i + 1].y) / 2;
                    ctx.quadraticCurveTo(strokePts[i].x, strokePts[i].y, xc, yc);
                }
                ctx.lineTo(strokePts[strokePts.length - 1].x, strokePts[strokePts.length - 1].y);
            }
        } else {
            for (let i = 1; i < strokePts.length; i++) {
                ctx.lineTo(strokePts[i].x, strokePts[i].y);
            }
        }
        ctx.stroke();
    }

    if (hasArrows && pts.length >= 2) {
        const refDist = Math.max(15, arrowSize);
        if (mode === 'end' || mode === 'both') {
            const pEnd = pts[pts.length - 1];
            const pRef = getPointAtDistanceBack(pts, true, refDist);
            drawArrowHead(ctx, pRef.x, pRef.y, pEnd.x, pEnd.y, strokeColor, arrowSize);
        }
        if (mode === 'start' || mode === 'both') {
            const pStart = pts[0];
            const pRef = getPointAtDistanceBack(pts, false, refDist);
            drawArrowHead(ctx, pRef.x, pRef.y, pStart.x, pStart.y, strokeColor, arrowSize);
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
    const paragraphs = text.split('\n');
    for (let p = 0; p < paragraphs.length; p++) {
        const words = paragraphs[p].split(' ');
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
        y += lineHeight;
    }
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
            const pts = getConnectorPoints(el);
            const isCurved = el.isCurved !== undefined ? el.isCurved : (el.connType && el.connType.startsWith('curved'));

            if (isCurved && pts.length > 2) {
                ctx.strokeStyle = '#f59e0b';
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(pts[i].x, pts[i].y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }

            pts.forEach((p, idx) => {
                const color = (idx === 0 || idx === pts.length - 1) ? '#3b82f6' : '#f59e0b';
                drawHandleCircle(ctx, p.x, p.y, color);
            });
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
    minimapCtx.fillStyle = state.darkMode ? '#0f172a' : '#f8fafc';
    minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    state.elements.forEach(el => {
        minimapCtx.fillStyle = state.darkMode ? '#64748b' : '#94a3b8';
        const b = getElementBounds(el);
        const mx = (b.x / 10) + minimapCanvas.width / 2;
        const my = (b.y / 10) + minimapCanvas.height / 2;
        minimapCtx.fillRect(mx, my, Math.max(2, b.width / 10), Math.max(2, b.height / 10));
    });
}