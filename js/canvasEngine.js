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
 * Determina si un punto dado está dentro de un elemento
 */
export function isPointInElement(pt, el) {
    if (el.type === 'connector') {
        const endX = el.endX !== undefined ? el.endX : el.x + 100;
        const endY = el.endY !== undefined ? el.endY : el.y + 100;
        return Math.hypot(pt.x - el.x, pt.y - el.y) < 15 || Math.hypot(pt.x - endX, pt.y - endY) < 15;
    }
    const b = getElementBounds(el);
    return pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height;
}

/**
 * Bucle principal de dibujo en el canvas
 */
export function render(canvas, ctx, minimapCanvas, minimapCtx) {
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.zoom, state.zoom);

    // 1. Dibujar rejilla de fondo
    drawGrid(canvas, ctx);

    // 2. Dibujar elementos confirmados
    state.elements.forEach(el => drawElement(ctx, el));

    // 3. Dibujar elemento temporal (en construcción)
    if (state.tempElement) {
        drawElement(ctx, state.tempElement);
    }

    // 4. Dibujar borde y controles de selección
    drawSelectionOverlay(ctx);

    ctx.restore();

    // 5. Actualizar minimapa si está visible
    renderMinimap(minimapCanvas, minimapCtx);
}

/**
 * Dibuja la rejilla de puntos finos en el lienzo infinito
 */
function drawGrid(canvas, ctx) {
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
 * Renderiza un elemento individual en función de su tipo
 */
function drawElement(ctx, el) {
    ctx.save();
    ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1.0;

    switch (el.type) {
        case 'sticky':
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.fillRect(el.x + 4, el.y + 4, el.width, el.height);
            // Fondo
            ctx.fillStyle = el.color || '#fef08a';
            ctx.fillRect(el.x, el.y, el.width, el.height);
            // Borde tenue
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.strokeRect(el.x, el.y, el.width, el.height);
            // Texto contenido
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
                ctx.beginPath();
                ctx.strokeStyle = el.color;
                ctx.lineWidth = el.lineWidth;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                const smoothVal = el.smoothing !== undefined ? el.smoothing : state.smoothing;
                const pts = getSmoothedPoints(el.points, smoothVal);

                if (pts.length === 1) {
                    ctx.beginPath();
                    ctx.arc(pts[0].x, pts[0].y, el.lineWidth / 2, 0, Math.PI * 2);
                    ctx.fillStyle = el.color;
                    ctx.fill();
                } else {
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length - 1; i++) {
                        const xc = (pts[i].x + pts[i + 1].x) / 2;
                        const yc = (pts[i].y + pts[i + 1].y) / 2;
                        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
                    }
                    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
                    ctx.stroke();
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
 * Configura los patrones de líneas punteadas en el contexto
 */
function setLineDashStyle(ctx, style) {
    if (style === 'dashed') ctx.setLineDash([8, 8]);
    else if (style === 'dotted') ctx.setLineDash([3, 3]);
    else ctx.setLineDash([]);
}

/**
 * Renderiza formas geométricas (rectángulo, círculo, estrella, rombo, etc.)
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
            ctx.roundRect(x, y, w, h, 12);
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
            drawStar(ctx, x + w / 2, y + h / 2, 5, Math.min(w, h) / 2, Math.min(w, h) / 4);
            break;
        case 'hexagon':
            drawPolygon(ctx, x + w / 2, y + h / 2, 6, Math.min(w, h) / 2);
            break;
        case 'bubble':
            ctx.beginPath();
            ctx.roundRect(x, y, w, h - 16, 12);
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
 * Renderiza conectores rectos y curvos
 */
function drawConnector(ctx, el) {
    ctx.strokeStyle = el.strokeColor || '#1e293b';
    ctx.lineWidth = el.strokeWidth || 2;
    setLineDashStyle(ctx, el.strokeStyle);

    const startX = el.x, startY = el.y;
    const endX = el.endX !== undefined ? el.endX : el.x + 100;
    const endY = el.endY !== undefined ? el.endY : el.y + 100;

    if (el.connType === 'curved') {
        const cp = el.cp || { x: (startX + endX) / 2, y: (startY + endY) / 2 - 40 };
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(cp.x, cp.y, endX, endY);
        ctx.stroke();

        if (el.connType === 'arrow' || el.connType === 'double-arrow') {
            drawArrowHead(ctx, cp.x, cp.y, endX, endY, el.strokeColor);
        }
        if (el.connType === 'double-arrow') {
            drawArrowHead(ctx, cp.x, cp.y, startX, startY, el.strokeColor);
        }
    } else {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        if (el.connType === 'arrow' || el.connType === 'double-arrow') {
            drawArrowHead(ctx, startX, startY, endX, endY, el.strokeColor);
        }
        if (el.connType === 'double-arrow') {
            drawArrowHead(ctx, endX, endY, startX, startY, el.strokeColor);
        }
    }
    ctx.setLineDash([]);
}

function drawArrowHead(ctx, fromX, fromY, toX, toY, color) {
    const headlen = 10;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.fillStyle = color || '#1e293b';
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
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
 * Dibuja la superposición de selección y los puntos de control de redimensionamiento y curvatura
 */
function drawSelectionOverlay(ctx) {
    if (state.selectedIds.length === 0) return;

    state.selectedIds.forEach(id => {
        const el = state.elements.find(e => e.id === id);
        if (!el) return;

        if (el.type === 'connector') {
            const startX = el.x, startY = el.y;
            const endX = el.endX || el.x + 100, endY = el.endY || el.y + 100;
            
            drawHandleCircle(ctx, startX, startY, '#3b82f6');
            drawHandleCircle(ctx, endX, endY, '#3b82f6');
            
            if (el.connType === 'curved') {
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
            const bounds = getElementBounds(el);
            ctx.strokeStyle = '#4f46e5';
            ctx.lineWidth = 1.5 / state.zoom;
            ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

            drawHandleRect(ctx, bounds.x, bounds.y);
            drawHandleRect(ctx, bounds.x + bounds.width, bounds.y);
            drawHandleRect(ctx, bounds.x + bounds.width, bounds.y + bounds.height);
            drawHandleRect(ctx, bounds.x, bounds.y + bounds.height);
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
