// MAIN BOOTSTRAPPER & ENTRYPOINT - PIZARRA PROFEDIEGO
import { loadFromLocalStorage } from './state.js';
import { resizeCanvas, render } from './canvasEngine.js';
import { setupCanvasListeners } from './tools.js';
import { setupUIListeners, setTool, updateContextToolbar } from './uiController.js';
import { setupGoogleDriveListeners, initGIS } from './gdrive.js';
import { setupTemplatesListeners } from './templates.js';
import { joinRoom } from './firebaseSync.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('board-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

    const renderFn = () => render(canvas, ctx, minimapCanvas, minimapCtx);

    resizeCanvas(canvas, renderFn);
    window.addEventListener('resize', () => resizeCanvas(canvas, renderFn));

    loadFromLocalStorage(renderFn);

    setupCanvasListeners(canvas, ctx, renderFn, setTool, updateContextToolbar);
    setupUIListeners(canvas, ctx, renderFn);
    setupGoogleDriveListeners(renderFn);
    setupTemplatesListeners(canvas, renderFn);

    initGIS(renderFn);

    setTool('pencil');
    renderFn();
});