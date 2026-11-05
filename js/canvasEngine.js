// MOTOR GRÁFICO Y RENDERIZADO DEL LIENZO (CANVAS ENGINE)
import { state } from './state.js';

let canvas = null;
let ctx = null;
let minimapCanvas = null;
let minimapCtx = null;

/**
 * Inicializa el motor del lienzo canvas y los contextos 2D
 * @param {HTMLCanvasElement} canvasElement - Elemento canvas principal
 */
export function initCanvasEngine(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d');

  minimapCanvas = document.getElementById('minimap-canvas');
  if (minimapCanvas) {
    minimapCtx = minimapCanvas.getContext('2d');
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

/**
 * Ajusta la resolución del canvas al tamaño exacto de la ventana
 */
export function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  render();
}

/**
 * Convierte coordenadas de pantalla (píxeles de la ventana) a coordenadas del lienzo infinito
 * @param {number} screenX 
 * @param {number} screenY 
 * @returns {{x: number, y: number}}
 */
export function screenToWorld(screenX, screenY) {
  return {
    x: (screenX - state.panX) / state.scale,
    y: (screenY - state.panY) / state.scale
  };
}

/**
 * Convierte coordenadas del lienzo infinito a coordenadas de pantalla
 * @param {number} worldX 
 * @param {number} worldY 
 * @returns {{x: number, y: number}}
 */
export function worldToScreen(worldX, worldY) {
  return {
    x: worldX * state.scale + state.panX,
    y: worldY * state.scale + state.panY
  };
}

/**
 * Bucle principal de renderizado gráfico
 */
export function render() {
  if (!ctx || !canvas) return;

  ctx.save();
  // Limpiar lienzo
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Dibujar Grilla de Fondo
  drawGrid();

  // Aplicar matriz de transformación global de la cámara (Zoom y Pan)
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.scale, state.scale);

  // 2. Dibujar Elementos Confirmados de la Pizarra
  state.elements.forEach(element => {
    drawElement(element);
  });

  // 3. Dibujar Elemento Temporal en Construcción
  if (state.currentDraftElement) {
    drawElement(state.currentDraftElement);
  }

  // 4. Dibujar Cuadro de Selección y Tiradores de Transformación
  drawSelectionOverlay();

  // 5. Dibujar Punteros y Ubicaciones de los Alumnos Conectados
  if (state.showStudentCursors) {
    drawStudentCursors();
  }

  ctx.restore();

  // 6. Actualizar Minimapa de Navegación
  renderMinimap();
}

/**
 * Renderiza un elemento individual en función de su tipo
 * @param {Object} el - Elemento del modelo de datos
 */
export function drawElement(el) {
  if (!el) return;
  ctx.save();
  ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1.0;

  switch (el.type) {
    case 'pencil':
      drawPencil(el);
      break;
    case 'highlighter':
      drawHighlighter(el);
      break;
    case 'eraser':
      drawEraser(el);
      break;
    case 'shape':
      drawShape(el);
      break;
    case 'connector':
      drawConnector(el);
      break;
    case 'text':
      drawText(el);
      break;
    case 'sticky':
      drawSticky(el);
      break;
    case 'image':
      drawImage(el);
      break;
  }

  ctx.restore();
}

/**
 * Renderiza trazos de Lápiz Libre
 */
function drawPencil(el) {
  if (!el.points || el.points.length === 0) return;

  ctx.beginPath();
  ctx.strokeStyle = el.strokeColor || state.strokeColor;
  ctx.lineWidth = el.strokeWidth || 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (el.strokeStyle === 'dashed') ctx.setLineDash([8, 8]);
  else if (el.strokeStyle === 'dotted') ctx.setLineDash([3, 5]);

  ctx.moveTo(el.points[0].x, el.points[0].y);
  for (let i = 1; i < el.points.length; i++) {
    ctx.lineTo(el.points[i].x, el.points[i].y);
  }
  ctx.stroke();

  // Dibujar flechas si están configuradas en el trazo de lápiz
  if (el.startArrow && el.startArrow !== 'none' && el.points.length > 1) {
    const p1 = el.points[0];
    const p2 = el.points[1];
    const angle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
    drawArrowHead(p1.x, p1.y, angle, el.strokeColor, el.strokeWidth * 4);
  }

  if (el.endArrow && el.endArrow !== 'none' && el.points.length > 1) {
    const p1 = el.points[el.points.length - 1];
    const p2 = el.points[el.points.length - 2];
    const angle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
    drawArrowHead(p1.x, p1.y, angle, el.strokeColor, el.strokeWidth * 4);
  }
}

/**
 * Renderiza trazos de Destacador Neón
 */
function drawHighlighter(el) {
  if (!el.points || el.points.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.beginPath();
  ctx.strokeStyle = el.highlighterColor || 'rgba(250, 204, 21, 0.45)';
  ctx.lineWidth = el.highlighterWidth || 20;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'round';

  ctx.moveTo(el.points[0].x, el.points[0].y);
  for (let i = 1; i < el.points.length; i++) {
    ctx.lineTo(el.points[i].x, el.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Renderiza el borrador sobre el lienzo
 */
function drawEraser(el) {
  if (!el.points || el.points.length === 0) return;

  ctx.beginPath();
  ctx.strokeStyle = state.isDarkMode ? '#0f172a' : '#ffffff';
  ctx.lineWidth = (el.strokeWidth || 10) * 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.moveTo(el.points[0].x, el.points[0].y);
  for (let i = 1; i < el.points.length; i++) {
    ctx.lineTo(el.points[i].x, el.points[i].y);
  }
  ctx.stroke();
}

/**
 * Renderiza Formas Geométricas
 */
function drawShape(el) {
  ctx.beginPath();
  ctx.strokeStyle = el.strokeColor || '#1e293b';
  ctx.fillStyle = el.fillColor || 'transparent';
  ctx.lineWidth = el.strokeWidth || 2;

  if (el.strokeStyle === 'dashed') ctx.setLineDash([8, 8]);
  else if (el.strokeStyle === 'dotted') ctx.setLineDash([3, 5]);

  const x = el.x;
  const y = el.y;
  const w = el.width;
  const h = el.height;

  switch (el.shapeType) {
    case 'rect':
      ctx.rect(x, y, w, h);
      break;
    case 'rounded-rect':
      drawRoundedRect(x, y, w, h, 12);
      break;
    case 'circle':
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      break;
    case 'diamond':
      drawDiamond(x, y, w, h);
      break;
    case 'triangle':
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case 'hexagon':
      drawHexagon(x, y, w, h);
      break;
    case 'star':
      drawStar(x + w / 2, y + h / 2, 5, Math.abs(w / 2), Math.abs(w / 4));
      break;
    case 'bubble':
      drawBubble(x, y, w, h);
      break;
  }

  if (el.fillColor && el.fillColor !== 'transparent') ctx.fill();
  if (el.strokeWidth > 0) ctx.stroke();
}

/**
 * Renderiza Conectores y Flechas
 */
function drawConnector(el) {
  ctx.beginPath();
  ctx.strokeStyle = el.strokeColor || '#1e293b';
  ctx.lineWidth = el.strokeWidth || 2;

  if (el.strokeStyle === 'dashed') ctx.setLineDash([8, 8]);
  else if (el.strokeStyle === 'dotted') ctx.setLineDash([3, 5]);

  const start = el.startPoint;
  const end = el.endPoint;

  if (!start || !end) return;

  ctx.moveTo(start.x, start.y);

  if (el.connectorType === 'orthogonal') {
    const midX = start.x + (end.x - start.x) / 2;
    ctx.lineTo(midX, start.y);
    ctx.lineTo(midX, end.y);
    ctx.lineTo(end.x, end.y);
  } else if (el.connectorType === 'curved' || el.connectorType === 'curved-arrow') {
    const cpX = (start.x + end.x) / 2;
    const cpY = start.y - 40;
    ctx.quadraticCurveTo(cpX, cpY, end.x, end.y);
  } else {
    ctx.lineTo(end.x, end.y);
  }

  ctx.stroke();

  // Dibujar flechas en los extremos según configuración
  let arrowSize = el.arrowSize || 14;

  if (el.connectorType === 'arrow' || el.connectorType === 'curved-arrow' || el.endArrow === 'end' || el.endArrow === 'both') {
    let angle = Math.atan2(end.y - start.y, end.x - start.x);
    if (el.connectorType === 'orthogonal') {
      const midX = start.x + (end.x - start.x) / 2;
      angle = Math.atan2(end.y - end.y, end.x - midX);
    }
    drawArrowHead(end.x, end.y, angle, el.strokeColor, arrowSize);
  }

  if (el.startArrow === 'start' || el.startArrow === 'both') {
    let angle = Math.atan2(start.y - end.y, start.x - end.x);
    if (el.connectorType === 'orthogonal') {
      const midX = start.x + (end.x - start.x) / 2;
      angle = Math.atan2(start.y - start.y, start.x - midX);
    }
    drawArrowHead(start.x, start.y, angle, el.strokeColor, arrowSize);
  }
}

/**
 * Renderiza Cajas de Texto Libre
 */
function drawText(el) {
  ctx.font = `${el.fontSize || 16}px Inter, sans-serif`;
  ctx.fillStyle = el.strokeColor || '#1e293b';
  ctx.textBaseline = 'top';

  const lines = (el.text || '').split('\n');
  const lineHeight = (el.fontSize || 16) * 1.35;

  lines.forEach((line, i) => {
    ctx.fillText(line, el.x, el.y + i * lineHeight);
  });
}

/**
 * Renderiza Notas Adhesivas (Sticky Notes)
 */
function drawSticky(el) {
  const x = el.x;
  const y = el.y;
  const w = el.width || 180;
  const h = el.height || 180;

  ctx.save();
  // Sombra leve para efecto 3D
  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  ctx.beginPath();
  ctx.fillStyle = el.stickyColor || '#fef08a';
  drawRoundedRect(x, y, w, h, 10);
  ctx.fill();

  ctx.restore();

  // Texto de la nota
  ctx.font = `500 ${el.fontSize || 16}px Inter, sans-serif`;
  ctx.fillStyle = '#1e293b';
  ctx.textBaseline = 'top';

  const padding = 12;
  const lines = (el.text || '').split('\n');
  const lineHeight = (el.fontSize || 16) * 1.35;

  lines.forEach((line, i) => {
    ctx.fillText(line, x + padding, y + padding + i * lineHeight, w - padding * 2);
  });
}

/**
 * Renderiza Imágenes Insertadas
 */
function drawImage(el) {
  if (!el.imgElement) {
    if (el.src) {
      const img = new Image();
      img.src = el.src;
      img.onload = () => {
        el.imgElement = img;
        render();
      };
    }
    return;
  }

  ctx.drawImage(el.imgElement, el.x, el.y, el.width, el.height);
}

/**
 * Renderiza la Grilla de Fondo
 */
function drawGrid() {
  if (state.gridType === 'none') return;

  const width = canvas.width;
  const height = canvas.height;
  const step = state.gridSize * state.scale;

  const startX = state.panX % step;
  const startY = state.panY % step;

  ctx.save();
  ctx.strokeStyle = state.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  ctx.lineWidth = 1;

  if (state.gridType === 'grid') {
    ctx.beginPath();
    for (let x = startX; x < width; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let y = startY; y < height; y += step) {
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();
  } else if (state.gridType === 'dots') {
    ctx.fillStyle = state.isDarkMode ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.22)';
    for (let x = startX; x < width; x += step) {
      for (let y = startY; y < height; y += step) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }
  ctx.restore();
}

/**
 * Renderiza la Capa de Selección (Bounding Box y Tiradores)
 */
function drawSelectionOverlay() {
  if (!state.selectedIds || state.selectedIds.length === 0) return;

  state.elements.forEach(el => {
    if (state.selectedIds.includes(el.id)) {
      ctx.save();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1.5 / state.scale;
      ctx.setLineDash([4 / state.scale, 4 / state.scale]);

      const bbox = getBoundingBox(el);
      ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h);

      // Dibujar los 4 tiradores de las esquinas
      ctx.fillStyle = '#ffffff';
      ctx.setLineDash([]);
      const handleSize = 8 / state.scale;
      const handles = [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.w, y: bbox.y },
        { x: bbox.x, y: bbox.y + bbox.h },
        { x: bbox.x + bbox.w, y: bbox.y + bbox.h }
      ];

      handles.forEach(hPos => {
        ctx.fillRect(hPos.x - handleSize / 2, hPos.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(hPos.x - handleSize / 2, hPos.y - handleSize / 2, handleSize, handleSize);
      });

      ctx.restore();
    }
  });
}

/**
 * Dibuja los punteros y nombres/ubicaciones de otros alumnos en tiempo real
 */
function drawStudentCursors() {
  if (!state.connectedUsers) return;

  state.connectedUsers.forEach(user => {
    if (user.email === state.gdriveCurrentUserEmail) return;

    ctx.save();
    ctx.translate(user.x, user.y);

    const scaleFactor = 1 / state.scale;
    ctx.scale(scaleFactor, scaleFactor);

    // Flecha del Puntero
    ctx.beginPath();
    ctx.fillStyle = user.isTeacher ? '#10b981' : '#3b82f6';
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(4, 12);
    ctx.lineTo(9, 20);
    ctx.lineTo(12, 18);
    ctx.lineTo(7, 11);
    ctx.lineTo(14, 11);
    ctx.closePath();
    ctx.fill();

    // Etiqueta con Email/Nombre
    const label = (user.email || 'Alumno').split('@')[0];
    ctx.font = '600 11px Inter, sans-serif';
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = user.isTeacher ? '#059669' : '#2563eb';
    ctx.beginPath();
    drawRoundedRect(12, 12, textWidth + 12, 20, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 18, 22);

    ctx.restore();
  });
}

/**
 * Renderiza el Minimapa de Navegación
 */
export function renderMinimap() {
  if (!minimapCtx || !minimapCanvas) return;

  minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  minimapCtx.fillStyle = state.isDarkMode ? '#0f172a' : '#f8fafc';
  minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  if (state.elements.length === 0) return;

  // Calcular límites de todos los elementos
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.elements.forEach(el => {
    const bbox = getBoundingBox(el);
    if (bbox.x < minX) minX = bbox.x;
    if (bbox.y < minY) minY = bbox.y;
    if (bbox.x + bbox.w > maxX) maxX = bbox.x + bbox.w;
    if (bbox.y + bbox.h > maxY) maxY = bbox.y + bbox.h;
  });

  const margin = 200;
  minX -= margin; minY -= margin;
  maxX += margin; maxY += margin;

  const worldWidth = maxX - minX || 1;
  const worldHeight = maxY - minY || 1;

  const scaleX = minimapCanvas.width / worldWidth;
  const scaleY = minimapCanvas.height / worldHeight;
  const minimapScale = Math.min(scaleX, scaleY);

  minimapCtx.save();
  minimapCtx.scale(minimapScale, minimapScale);
  minimapCtx.translate(-minX, -minY);

  // Renderizar miniatura simplificada de elementos
  state.elements.forEach(el => {
    minimapCtx.fillStyle = el.strokeColor || '#6366f1';
    const bbox = getBoundingBox(el);
    minimapCtx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  });

  // Renderizar encuadre del viewport actual
  const viewportX = -state.panX / state.scale;
  const viewportY = -state.panY / state.scale;
  const viewportW = window.innerWidth / state.scale;
  const viewportH = window.innerHeight / state.scale;

  minimapCtx.strokeStyle = '#4f46e5';
  minimapCtx.lineWidth = 2 / minimapScale;
  minimapCtx.strokeRect(viewportX, viewportY, viewportW, viewportH);

  minimapCtx.restore();
}

/**
 * Calcula la caja delimitadora (Bounding Box) de cualquier elemento
 * @param {Object} el 
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function getBoundingBox(el) {
  if (el.type === 'pencil' || el.type === 'highlighter' || el.type === 'eraser') {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (el.points || []).forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    return { x: minX - 5, y: minY - 5, w: (maxX - minX) + 10, h: (maxY - minY) + 10 };
  } else if (el.type === 'connector') {
    const s = el.startPoint || { x: 0, y: 0 };
    const e = el.endPoint || { x: 0, y: 0 };
    const minX = Math.min(s.x, e.x);
    const minY = Math.min(s.y, e.y);
    const w = Math.abs(e.x - s.x) || 10;
    const h = Math.abs(e.y - s.y) || 10;
    return { x: minX - 5, y: minY - 5, w: w + 10, h: h + 10 };
  } else {
    return {
      x: el.x || 0,
      y: el.y || 0,
      w: el.width || 100,
      h: el.height || 100
    };
  }
}

// FUNCIONES AUXILIARES DE DIBUJO DE FORMAS GEOMÉTRICAS

function drawArrowHead(x, y, angle, color, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color || '#1e293b';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size / 2);
  ctx.lineTo(-size, size / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRoundedRect(x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDiamond(x, y, w, h) {
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

function drawHexagon(x, y, w, h) {
  ctx.moveTo(x + w * 0.25, y);
  ctx.lineTo(x + w * 0.75, y);
  ctx.lineTo(x + w, y + h * 0.5);
  ctx.lineTo(x + w * 0.75, y + h);
  ctx.lineTo(x + w * 0.25, y + h);
  ctx.lineTo(x, y + h * 0.5);
  ctx.closePath();
}

function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
  let rot = (Math.PI / 2) * 3;
  let step = Math.PI / spikes;
  ctx.moveTo(cx, cy - outerRadius);

  for (let i = 0; i < spikes; i++) {
    let x = cx + Math.cos(rot) * outerRadius;
    let y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    let y2 = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y2);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}

function drawBubble(x, y, w, h) {
  const r = 12;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h * 0.7, x, y + h * 0.7, r);
  ctx.lineTo(x + w * 0.3, y + h * 0.7);
  ctx.lineTo(x + w * 0.15, y + h);
  ctx.lineTo(x + w * 0.18, y + h * 0.7);
  ctx.arcTo(x, y + h * 0.7, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}