// GESTIÓN DE IMÁGENES Y PORTAPAPELES
import { state, screenToWorld, saveState } from '../state.js';

export function processImageFile(blob, canvas, renderCallback) {
    const reader = new FileReader();
    reader.onload = (evt) => {
        const img = new Image();
        img.src = evt.target.result;
        img.onload = () => {
            const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, canvas);
            const newId = 'img_' + Date.now();
            state.elements.push({
                id: newId,
                type: 'image',
                x: center.x - img.width / 4,
                y: center.y - img.height / 4,
                width: img.width / 2,
                height: img.height / 2,
                src: evt.target.result,
                imgElement: img
            });
            saveState();
            if (renderCallback) renderCallback();
        };
    };
    reader.readAsDataURL(blob);
}

export function setupImagePasteListener(canvas, renderCallback) {
    window.addEventListener('paste', (e) => {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            if (document.activeElement.id !== 'inline-text-editor') return;
        }

        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
        const files = (e.clipboardData || e.originalEvent?.clipboardData)?.files;

        if (files && files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                if (files[i].type.startsWith('image/')) {
                    processImageFile(files[i], canvas, renderCallback);
                }
            }
        } else if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) processImageFile(blob, canvas, renderCallback);
                }
            }
        }
    });
}