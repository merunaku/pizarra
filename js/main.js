// MAIN ENTRYPOINT MODULE - PIZARRA PROFEDIEGO
import { state, loadFromLocalStorage, saveState } from './state.js';
import { resizeCanvas, render } from './canvasEngine.js';
import { setupCanvasListeners } from './tools.js';
import { setupUIListeners, setTool, updateContextToolbar } from './uiController.js';
import { setupGoogleDriveListeners } from './gdrive.js';
import { setupTemplatesListeners } from './templates.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('board-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

    // Función wrapper para renderizar la aplicación con las referencias actuales
    const renderApp = () => render(canvas, ctx, minimapCanvas, minimapCtx);

    // Configurar tamaño inicial del lienzo y evento de redimensionamiento
    resizeCanvas(canvas, renderApp);
    window.addEventListener('resize', () => resizeCanvas(canvas, renderApp));

    // Cargar datos previos guardados en memoria local
    loadFromLocalStorage(renderApp);

    // Configurar controladores del canvas y herramientas
    setupCanvasListeners(canvas, ctx, renderApp, setTool, updateContextToolbar);

    // Configurar controladores de la interfaz de usuario y menús
    setupUIListeners(canvas, ctx, renderApp);

    // Configurar integración con Google Drive Cloud Sync
    setupGoogleDriveListeners(renderApp);

    // Configurar módulo de plantillas de clase
    setupTemplatesListeners(canvas, renderApp);

    // Establecer herramienta inicial por defecto
    setTool('pencil');

    // Guardar captura inicial y renderizar primera vista
    saveState();
    renderApp();
});
