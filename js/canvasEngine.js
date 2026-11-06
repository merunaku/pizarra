// CANVAS ENGINE & RENDERER - PIZARRA PROFEDIEGO
import { state } from './state.js';

export function resizeCanvas(canvas, renderCallback) {
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.width = parent ? parent.clientWidth : window.innerWidth;
    canvas.height = parent ? parent.clientHeight : window.innerHeight;
    if (renderCallback) renderCallback();
}

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

export function getWrappedLines(ctx, text, maxWidth) {
    if (!text) return [];
    const paragraphs = text.split('\n');
    const lines = [];

    for (let p = 0; p < paragraphs.length; p++) {
        const words = paragraphs[p].split(' ');
        let currentLine = '';

        for (let n = 0; n < words.length; n++) {
            const word = words[n];
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth) {
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = '';
                }
                if (ctx.measureText(word).width > maxWidth) {
                    let subWord = '';
                    for (let c = 0; c < word.length; c++) {
                        const testSub = subWord + word[c];
                        if (ctx.measureText(testSub).width > maxWidth && subWord) {
                            lines.push(subWord);
                            subWord = word[c];
                        } else {
                            subWord = testSub;
                        }
                    }
                    if (subWord) currentLine = subWord;
                } else {
                    currentLine = word;
                }
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
    }
    return lines;
}

export function getSmoothedPoints(points, iterations = 3) {
    if (!points || points.length <= 2) return points || [];
    let current = points.map(p => ({ x: p.x, y: p.y }));

    for (let i = 0; i < iterations; i++) {
        const next = [];
        next.push(current[0]);
        for (let j = 0; j < current.length - 1; j++) {
            const p0 = current[j];
            const p1 = current[j + 1];
            const q = { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y };
            const r = { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y };
            next.push(q);
            next.push(r);
        }
        next.push(current[current.length - 1]);
        current = next;
    }
    return current;
}

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

export function getEffectiveColor(colorStr, role = 'stroke') {
    if (!colorStr) {
        if (state.darkMode) {
            return role === 'fill' ? '#1e293b' : '#f8fafc';
        } else {
            return role === 'fill' ? '#ffffff' : '#1e293b';
        }
    }

    if (colorStr.startsWith('rgba')) {
        const match = colorStr.match(/rgba?\(([^)]+)\)/);
        if (match) {
            const parts = match[1].split(',').map(s => s.trim());
            const r = parseInt(parts[0]), g = parseInt(parts[1]), b = parseInt(parts[2]), a = parts[3] || '1';
            const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            if (state.darkMode && lum < 0.35 && role !== 'fill') {
                return `rgba(248, 250, 252, ${a})`;
            }
            if (!state.darkMode && lum > 0.75 && role !== 'fill') {
                return `rgba(30, 41, 59, ${a})`;
            }
        }
        return colorStr;
    }

    const lum = getLuminance(colorStr);

    if (state.darkMode) {
        if (role === 'stroke' || role === 'text') {
            if (lum < 0.35) {
                return '#f8fafc';
            }
        } else if (role === 'fill') {
            if (lum > 0.85) {
                return '#1e293b';
            }
        }
        return colorStr;
    } else {
        if (role === 'stroke' || role === 'text') {
            if (lum > 0.75) {
                return '#1e293b';
            }
        } else if (role === 'fill') {
            if (lum < 0.15) {
                return '#ffffff';
            }
        }
        return colorStr;
    }
}

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
        const padding = Math.max(8, (el.lineWidth || el.strokeWidth || 3) / 2);
        return {
            x: minX - padding,
            y: minY - padding,
            width: Math.max(10, maxX - minX + padding * 2),
            height: Math.max(10, maxY - minY + padding * 2)
        };
    }

    if (el.type === 'text') {
        const fSize = el.fontSize || 20;
        const maxWidth = el.width ? Math.max(40, el.width - 8) : 350;
        const rawText = el.text || 'Haz doble clic para editar';
        const charWidth = fSize * 0.58;
        const maxChars = Math.max(5, Math.floor(maxWidth / charWidth));

        const paragraphs = rawText.split('\n');
        let lineCount = 0;
        let maxLineW = 0;

        paragraphs.forEach(p => {
            if (!p) {
                lineCount++;
                return;
            }
            const words = p.split(' ');
            let curLen = 0;
            words.forEach(w => {
                if (curLen + w.length > maxChars && curLen > 0) {
                    lineCount++;
                    curLen = w.length;
                } else {
                    curLen += (curLen > 0 ? 1 : 0) + w.length;
                }
                const estimatedW = Math.min(maxWidth, curLen * charWidth);
                if (estimatedW > maxLineW) maxLineW = estimatedW;
            });
            if (curLen > 0) lineCount++;
        });

        const calculatedWidth = el.width ? el.width : Math.max(120, maxLineW + 16);
        const calculatedHeight = Math.max(fSize * 1.4, lineCount * (fSize * 1.35) + 12);
        return {
            x: el.x,
            y: el.y,
            width: calculatedWidth,
            height: calculatedHeight
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
        const pad = Math.max(10, (el.strokeWidth || el.lineWidth || 2) * 2);
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

export function getConnectorPoints(el) {
    if (el.points && el.points.length >= 2) {
        return el.points;
    }
    const start = { x: el.x || 0, y: el.y || 0 };
    const end = { x: el.endX !== undefined ? el.endX : start.x + 100, y: el.endY !== undefined ? el.endY : start.y + 100 };
    const isCurved = el.isCurved !== undefined ? el.isCurved : (el.connType && el.connType.startsWith('curved'));
    const isOrthogonal = el.isOrthogonal !== undefined ? el.isOrthogonal : (el.connType === 'orthogonal');

    if (isOrthogonal) {
        const dx = Math.abs(end.x - start.x);
        const dy = Math.abs(end.y - start.y);
        
        if (dx > dy) {
            return [start, { x: end.x, y: start.y }, end];
        } else {
            return [start, { x: start.x, y: end.y }, end];
        }
    }

    if (isCurved) {
        const cp = el.cp || { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 40 };
        return [start, cp, end];
    }
    return [start, end];
}

export function distToSegment(p, p1, p2) {
    const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
    let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (p1.x + t * (p2.x - p1.x)), p.y - (p1.y + t * (p2.y - p1.y)));
}

export function distToPath(pt, points) {
    if (!points || points.length === 0) return Infinity;
    if (points.length === 1) return Math.hypot(pt.x - points[0].x, pt.y - points[0].y);
    let minD = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const d = distToSegment(pt, points[i], points[i + 1]);
        if (d < minD) minD = d;
    }
    return minD;
}

export function isPointInElement(pt, el) {
    if (el.type === 'pencil' || el.type === 'highlighter') {
        const pts = el.points || [];
        const threshold = Math.max(10, (el.lineWidth || el.strokeWidth || 3) / 2 + 5);
        return distToPath(pt, pts) <= threshold;
    }

    if (el.type === 'connector') {
        const pts = getConnectorPoints(el);
        const threshold = Math.max(10, (el.strokeWidth || el.lineWidth || 2) + 6);
        return distToPath(pt, pts) <= threshold;
    }

    const bounds = getElementBounds(el);
    let checkPt = pt;

    if (el.rotation) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        checkPt = rotatePoint(pt, -el.rotation, { x: cx, y: cy });
    }

    return (
        checkPt.x >= bounds.x &&
        checkPt.x <= bounds.x + bounds.width &&
        checkPt.y >= bounds.y &&
        checkPt.y <= bounds.y + bounds.height
    );
}

function setLineDashStyle(ctx, style) {
    if (style === 'dashed') ctx.setLineDash([8, 6]);
    else if (style === 'dotted') ctx.setLineDash([3, 4]);
    else ctx.setLineDash([]);
}

function trimPointsFromEnd(pts, dist) {
    if (!pts || pts.length < 2) return pts;
    const result = pts.map(p => ({ ...p }));
    let remaining = dist;

    for (let i = result.length - 1; i > 0; i--) {
        const pEnd = result[i];
        const pPrev = result[i - 1];
        const segLen = Math.hypot(pEnd.x - pPrev.x, pEnd.y - pPrev.y);

        if (segLen >= remaining) {
            const ratio = (segLen - remaining) / segLen;
            result[i] = {
                x: pPrev.x + (pEnd.x - pPrev.x) * ratio,
                y: pPrev.y + (pEnd.y - pPrev.y) * ratio
            };
            return result.slice(0, i + 1);
        } else {
            remaining -= segLen;
        }
    }
    return [result[0]];
}

function trimPointsFromStart(pts, dist) {
    if (!pts || pts.length < 2) return pts;
    const result = pts.map(p => ({ ...p }));
    let remaining = dist;

    for (let i = 0; i < result.length - 1; i++) {
        const pStart = result[i];
        const pNext = result[i + 1];
        const segLen = Math.hypot(pNext.x - pStart.x, pNext.y - pStart.y);

        if (segLen >= remaining) {
            const ratio = remaining / segLen;
            result[i] = {
                x: pStart.x + (pNext.x - pStart.x) * ratio,
                y: pStart.y + (pNext.y - pStart.y) * ratio
            };
            return result.slice(i);
        } else {
            remaining -= segLen;
        }
    }
    return [result[result.length - 1]];
}

function getPointAtDistanceBack(pts, fromEnd, dist) {
    if (!pts || pts.length === 0) return { x: 0, y: 0 };
    if (pts.length === 1) return { ...pts[0] };

    const list = fromEnd ? [...pts].reverse() : [...pts];
    let remaining = dist;

    for (let i = 0; i < list.length - 1; i++) {
        const pA = list[i];
        const pB = list[i + 1];
        const segLen = Math.hypot(pB.x - pA.x, pB.y - pA.y);

        if (segLen >= remaining && segLen > 0) {
            const ratio = remaining / segLen;
            return {
                x: pA.x + (pB.x - pA.x) * ratio,
                y: pA.y + (pB.y - pA.y) * ratio
            };
        } else {
            remaining -= segLen;
        }
    }
    return { ...list[list.length - 1] };
}

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

function drawConnector(ctx, el) {
    const strokeColor = getEffectiveColor(el.strokeColor || el.color || '#1e293b', 'stroke');
    ctx.strokeStyle = strokeColor;
    const strokeWidth = el.strokeWidth || el.lineWidth || 2;
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
            for (let i = 0; i < strokePts.length - 1; i++) {
                ctx.lineTo(strokePts[i + 1].x, strokePts[i + 1].y);
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

function drawPencil(ctx, el) {
    if (!el.points || el.points.length === 0) return;
    const strokeColor = getEffectiveColor(el.strokeColor || el.color || '#1e293b', 'stroke');
    ctx.strokeStyle = strokeColor;
    const strokeWidth = el.strokeWidth || el.lineWidth || 3;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (el.type === 'highlighter') {
        ctx.globalCompositeOperation = state.darkMode ? 'screen' : 'multiply';
    }

    const pts = el.smoothing ? getSmoothedPoints(el.points, Math.min(5, el.smoothing)) : el.points;

    if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, strokeWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
    }

    if (el.type === 'highlighter') {
        ctx.globalCompositeOperation = 'source-over';
    }

    if (el.arrowMode && el.arrowMode !== 'none' && pts.length >= 2) {
        const arrowSize = el.arrowSize || 14;
        if (el.arrowMode === 'end' || el.arrowMode === 'both') {
            const pEnd = pts[pts.length - 1];
            const pRef = pts[Math.max(0, pts.length - 4)];
            drawArrowHead(ctx, pRef.x, pRef.y, pEnd.x, pEnd.y, strokeColor, arrowSize);
        }
        if (el.arrowMode === 'start' || el.arrowMode === 'both') {
            const pStart = pts[0];
            const pRef = pts[Math.min(pts.length - 1, 3)];
            drawArrowHead(ctx, pRef.x, pRef.y, pStart.x, pStart.y, strokeColor, arrowSize);
        }
    }
}

function drawShape(ctx, el) {
    const strokeColor = getEffectiveColor(el.strokeColor || '#1e293b', 'stroke');
    const fillColor = getEffectiveColor(el.fillColor || '#ffffff', 'fill');

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = el.strokeWidth || el.lineWidth || 2;
    setLineDashStyle(ctx, el.strokeStyle);

    const x = el.x;
    const y = el.y;
    const w = el.width || 100;
    const h = el.height || 100;
    const shapeType = el.shapeType || 'rect';

    ctx.beginPath();
    if (shapeType === 'rect') {
        ctx.rect(x, y, w, h);
    } else if (shapeType === 'rounded-rect') {
        const r = Math.min(20, Math.abs(w) / 4, Math.abs(h) / 4);
        ctx.roundRect(x, y, w, h, r);
    } else if (shapeType === 'circle') {
        ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    } else if (shapeType === 'diamond') {
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h / 2);
        ctx.lineTo(x + w / 2, y + h);
        ctx.lineTo(x, y + h / 2);
        ctx.closePath();
    } else if (shapeType === 'triangle') {
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
    } else if (shapeType === 'hexagon') {
        ctx.moveTo(x + w * 0.25, y);
        ctx.lineTo(x + w * 0.75, y);
        ctx.lineTo(x + w, y + h * 0.5);
        ctx.lineTo(x + w * 0.75, y + h);
        ctx.lineTo(x + w * 0.25, y + h);
        ctx.lineTo(x, y + h * 0.5);
        ctx.closePath();
    } else if (shapeType === 'star') {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const outerR = Math.min(Math.abs(w), Math.abs(h)) / 2;
        const innerR = outerR * 0.4;
        for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    } else if (shapeType === 'bubble') {
        const r = 16;
        const tailW = 20;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r - 15);
        ctx.quadraticCurveTo(x + w, y + h - 15, x + w - r, y + h - 15);
        ctx.lineTo(x + w * 0.4 + tailW, y + h - 15);
        ctx.lineTo(x + w * 0.2, y + h);
        ctx.lineTo(x + w * 0.4, y + h - 15);
        ctx.lineTo(x + r, y + h - 15);
        ctx.quadraticCurveTo(x, y + h - 15, x, y + h - r - 15);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    if (el.text) {
        const fSize = el.fontSize || 16;
        ctx.font = `${fSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const fillLum = getLuminance(fillColor);
        ctx.fillStyle = fillLum < 0.45 ? '#f8fafc' : '#0f172a';

        const margin = 16;
        const maxTextW = Math.max(20, Math.abs(w) - margin * 2);
        const lines = getWrappedLines(ctx, el.text, maxTextW);

        const lineHeight = fSize * 1.3;
        const totalTextHeight = lines.length * lineHeight;
        let startY = y + h / 2 - totalTextHeight / 2 + lineHeight / 2;

        lines.forEach(line => {
            ctx.fillText(line, x + w / 2, startY);
            startY += lineHeight;
        });
    }
}

function drawSticky(ctx, el) {
    const bgColor = el.color || '#fef08a';
    ctx.fillStyle = bgColor;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 5;

    ctx.fillRect(el.x, el.y, el.width || 160, el.height || 160);
    ctx.shadowColor = 'transparent';

    if (el.text) {
        const fSize = el.fontSize || 16;
        ctx.font = `${fSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const bgLum = getLuminance(bgColor);
        ctx.fillStyle = bgLum < 0.4 ? '#f8fafc' : '#1e293b';

        const margin = 14;
        const maxW = (el.width || 160) - margin * 2;
        
        const paragraphs = el.text.split('\n');
        let curY = el.y + margin;
        const lineHeight = fSize * 1.3;
        for (let p = 0; p < paragraphs.length; p++) {
            const lines = getWrappedLines(ctx, paragraphs[p], maxW);
            lines.forEach(line => {
                ctx.fillText(line, el.x + margin, curY);
                curY += lineHeight;
            });
        }
    }
}

function drawText(ctx, el) {
    const fSize = el.fontSize || 20;
    ctx.font = `${fSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = getEffectiveColor(el.color || '#1e293b', 'text');

    const rawText = el.text || 'Haz doble clic para editar';
    const maxWidth = el.width ? Math.max(40, el.width - 8) : 350;
    const lines = getWrappedLines(ctx, rawText, maxWidth);

    const lineHeight = fSize * 1.35;
    let curY = el.y;

    lines.forEach(line => {
        ctx.fillText(line, el.x, curY);
        curY += lineHeight;
    });
}

function drawFrame(ctx, el) {
    ctx.strokeStyle = state.darkMode ? '#475569' : '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(el.x, el.y, el.width || 300, el.height || 200);
    ctx.setLineDash([]);

    ctx.fillStyle = state.darkMode ? '#94a3b8' : '#64748b';
    ctx.font = 'bold 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(el.title || 'Marco', el.x + 4, el.y - 6);
}

function drawImage(ctx, el) {
    if (el.imgElement && el.imgElement.complete) {
        ctx.drawImage(el.imgElement, el.x, el.y, el.width || 200, el.height || 200);
    } else if (el.src) {
        if (!el.imgElement) {
            el.imgElement = new Image();
            el.imgElement.src = el.src;
        }
        ctx.strokeStyle = '#94a3b8';
        ctx.strokeRect(el.x, el.y, el.width || 100, el.height || 100);
    }
}

export function drawGrid(ctx, canvas) {
    ctx.save();
    ctx.strokeStyle = state.darkMode ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 1;

    const gridSize = 40 * state.zoom;
    const startX = state.pan.x % gridSize;
    const startY = state.pan.y % gridSize;

    ctx.beginPath();
    for (let x = startX; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = startY; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
    ctx.restore();
}

function drawStudentViewports(ctx) {
    if (!state.showStudentViewports || !state.connectedStudents) return;

    state.connectedStudents.forEach(student => {
        if (student.isTeacher || !student.viewport) return;

        const vp = student.viewport;
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2 / state.zoom;
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(vp.x, vp.y, vp.width, vp.height);

        ctx.fillStyle = '#2563eb';
        ctx.font = `bold ${Math.max(12, 14 / state.zoom)}px Inter, system-ui, sans-serif`;
        const tagText = ` 🎓 ${student.name} `;
        const textWidth = ctx.measureText(tagText).width;
        ctx.fillRect(vp.x, vp.y - (22 / state.zoom), textWidth + 8, 22 / state.zoom);

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, vp.x + 4, vp.y - (11 / state.zoom));
        ctx.restore();
    });
}

export function drawElement(ctx, el) {
    if (el.id === state.editingElementId && el.type === 'text') {
        return;
    }

    ctx.save();
    if (el.opacity !== undefined) {
        ctx.globalAlpha = el.opacity;
    }

    if (el.rotation && el.type !== 'pencil' && el.type !== 'highlighter' && el.type !== 'connector') {
        const bounds = getElementBounds(el);
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate(el.rotation);
        ctx.translate(-cx, -cy);
    }

    switch (el.type) {
        case 'pencil':
        case 'highlighter':
            drawPencil(ctx, el);
            break;
        case 'shape':
            drawShape(ctx, el);
            break;
        case 'sticky':
            drawSticky(ctx, el);
            break;
        case 'text':
            drawText(ctx, el);
            break;
        case 'connector':
            drawConnector(ctx, el);
            break;
        case 'frame':
            drawFrame(ctx, el);
            break;
        case 'image':
            drawImage(ctx, el);
            break;
    }

    ctx.restore();
}

function drawSelectionOverlay(ctx) {
    if (state.alignmentGuidesEnabled && state.alignmentGuides && state.alignmentGuides.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 1 / state.zoom;
        ctx.setLineDash([4, 4]);

        const canvas = ctx.canvas;
        const viewLeft = -state.pan.x / state.zoom;
        const viewRight = (canvas.width - state.pan.x) / state.zoom;
        const viewTop = -state.pan.y / state.zoom;
        const viewBottom = (canvas.height - state.pan.y) / state.zoom;

        state.alignmentGuides.forEach(g => {
            ctx.beginPath();
            if (g.type === 'v') {
                ctx.moveTo(g.pos, viewTop);
                ctx.lineTo(g.pos, viewBottom);
            } else if (g.type === 'h') {
                ctx.moveTo(viewLeft, g.pos);
                ctx.lineTo(viewRight, g.pos);
            }
            ctx.stroke();
        });
        ctx.restore();
    }

    if (state.selectedIds.length === 0) return;

    state.selectedIds.forEach(id => {
        const el = state.elements.find(e => e.id === id);
        if (!el) return;

        if (el.type === 'connector') {
            const pts = getConnectorPoints(el);
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

            drawHandleRect(ctx, bounds.x, bounds.y);
            drawHandleRect(ctx, bounds.x + bounds.width, bounds.y);
            drawHandleRect(ctx, bounds.x + bounds.width, bounds.y + bounds.height);
            drawHandleRect(ctx, bounds.x, bounds.y + bounds.height);

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

export function render(canvas, ctx, minimapCanvas, minimapCtx) {
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = state.darkMode ? '#0f172a' : '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx, canvas);

    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.zoom, state.zoom);

    state.elements.forEach(el => drawElement(ctx, el));

    if (state.tempElement) {
        drawElement(ctx, state.tempElement);
    }

    drawStudentViewports(ctx);
    drawSelectionOverlay(ctx);

    ctx.restore();

    renderMinimap(minimapCanvas, minimapCtx);
}

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