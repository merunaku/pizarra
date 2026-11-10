// CLASSROOM TEMPLATES MODULE - PIZARRA PROFEDIEGO
import { state, screenToWorld, saveState } from './state.js';
import { showToast } from './uiController.js';

let renderCallback = null;

export function setupTemplatesListeners(canvas, renderFn) {
    renderCallback = renderFn;

    const btnToggle = document.getElementById('btn-templates-toggle');
    const modal = document.getElementById('templates-modal');
    const btnClose = document.getElementById('btn-close-templates');

    if (btnToggle && modal) {
        btnToggle.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });
    }

    if (btnClose && modal) {
        btnClose.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    document.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', () => {
            const type = card.getAttribute('data-type');
            if (type) {
                insertTemplate(type, canvas);
                if (modal) modal.classList.add('hidden');
                showToast('Plantilla insertada con éxito', 'fa-solid fa-shapes');
            }
        });
    });
}

export function insertTemplate(type, canvas) {
    const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, canvas);
    const cx = center.x;
    const cy = center.y;

    if (type === 'kanban') {
        const columns = ['Por Hacer', 'En Proceso', 'Hecho'];
        columns.forEach((title, idx) => {
            const fx = cx - 320 + idx * 220;
            state.elements.push({
                id: 'f_' + Date.now() + '_' + idx,
                type: 'frame',
                title,
                x: fx,
                y: cy - 200,
                width: 200,
                height: 400
            });
            state.elements.push({
                id: 's_' + Date.now() + '_' + idx,
                type: 'sticky',
                x: fx + 15,
                y: cy - 150,
                width: 170,
                height: 120,
                color: '#fef08a',
                text: 'Tarea ' + (idx + 1)
            });
        });
    } else if (type === 'mindmap') {
        state.elements.push({
            id: 'node_c_' + Date.now(),
            type: 'shape',
            shapeType: 'rounded-rect',
            x: cx - 70,
            y: cy - 35,
            width: 140,
            height: 70,
            fillColor: '#bfdbfe',
            strokeColor: '#1d4ed8',
            text: 'Tema Central'
        });

        const subNodes = [
            { x: cx - 220, y: cy - 120, text: 'Concepto A', color: '#bbf7d0' },
            { x: cx + 120, y: cy - 120, text: 'Concepto B', color: '#fbcfe8' },
            { x: cx - 220, y: cy + 80, text: 'Concepto C', color: '#fed7aa' },
            { x: cx + 120, y: cy + 80, text: 'Concepto D', color: '#e9d5ff' }
        ];

        subNodes.forEach((node, i) => {
            const nid = 'node_' + i + '_' + Date.now();
            state.elements.push({
                id: nid,
                type: 'shape',
                shapeType: 'rounded-rect',
                x: node.x,
                y: node.y,
                width: 120,
                height: 50,
                fillColor: node.color,
                strokeColor: '#475569',
                text: node.text
            });
            state.elements.push({
                id: 'conn_' + i + '_' + Date.now(),
                type: 'connector',
                connType: 'curved',
                x: cx,
                y: cy,
                endX: node.x + 60,
                endY: node.y + 25,
                cp: { x: (cx + node.x) / 2, y: (cy + node.y) / 2 - 30 },
                strokeColor: '#64748b',
                strokeWidth: 2
            });
        });
    } else if (type === 'retrospective') {
        const sections = [
            { title: '¿Qué funcionó?', color: '#bbf7d0', x: cx - 220, y: cy - 180 },
            { title: '¿Qué se puede mejorar?', color: '#fbcfe8', x: cx + 20, y: cy - 180 },
            { title: 'Acciones a tomar', color: '#bfdbfe', x: cx - 100, y: cy + 30 }
        ];

        sections.forEach((sec, idx) => {
            state.elements.push({
                id: 'frame_retro_' + idx + '_' + Date.now(),
                type: 'frame',
                title: sec.title,
                x: sec.x,
                y: sec.y,
                width: 200,
                height: 190
            });
            state.elements.push({
                id: 'sticky_retro_' + idx + '_' + Date.now(),
                type: 'sticky',
                x: sec.x + 20,
                y: sec.y + 20,
                width: 160,
                height: 120,
                color: sec.color,
                text: 'Idea / Comentario'
            });
        });
    } else if (type === 'brainstorming') {
        const colors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e9d5ff'];
        colors.forEach((col, idx) => {
            const row = Math.floor(idx / 3);
            const colIdx = idx % 3;
            state.elements.push({
                id: 'brain_sticky_' + idx + '_' + Date.now(),
                type: 'sticky',
                x: cx - 240 + colIdx * 170,
                y: cy - 120 + row * 160,
                width: 140,
                height: 130,
                color: col,
                text: 'Idea ' + (idx + 1)
            });
        });
    }

    saveState();
    if (renderCallback) renderCallback();
}