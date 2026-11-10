// EDITOR DE TEXTO EN LÍNEA
import { state, worldToScreen, saveState } from '../state.js';
import { getElementBounds, getEffectiveColor, getLuminance } from '../canvasEngine.js';

let renderCallbackRef = null;

export function initTextEditor(renderFn) {
    renderCallbackRef = renderFn;
    const inlineEditor = document.getElementById('inline-text-editor');
    if (!inlineEditor) return;

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

export function openInlineEditor(el) {
    const inlineEditor = document.getElementById('inline-text-editor');
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
        bgColor = getEffectiveColor(el.fillColor || (state.darkMode ? '#1e293b' : '#ffffff'), 'fill');
        const fillLum = getLuminance(bgColor);
        textColor = fillLum < 0.45 ? '#f8fafc' : '#0f172a';
    } else if (el.type === 'text') {
        bgColor = state.darkMode ? '#1e293b' : '#ffffff';
        textColor = getEffectiveColor(el.color || '#1e293b', 'text');
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
    const inlineEditor = document.getElementById('inline-text-editor');
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
    if (renderCallbackRef) renderCallbackRef();
}