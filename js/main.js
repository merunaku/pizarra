// MAIN BOOTSTRAPPER & ENTRYPOINT - PIZARRA PROFEDIEGO
import { loadFromLocalStorage, state } from './state.js';
import { resizeCanvas, render } from './canvasEngine.js';
import { setupCanvasListeners } from './tools.js';
import { setupUIListeners, setTool, updateContextToolbar, openBoardSelectionModal, applyRolePermissions } from './uiController.js';
import { setupGoogleDriveListeners, initGIS, fetchDriveBoards, loadBoardFromDrive } from './gdrive.js';
import { setupTemplatesListeners } from './templates.js';
import { initFirebaseSync, listenTeacherBoardChange } from './firebaseSync.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('board-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

    const renderFn = () => render(canvas, ctx, minimapCanvas, minimapCtx);

    // Ajustar resolución del canvas y listener de redimensionamiento
    resizeCanvas(canvas, renderFn);
    window.addEventListener('resize', () => resizeCanvas(canvas, renderFn));

    // Cargar estado inicial local
    loadFromLocalStorage(renderFn);

    // Aplicar filtrado de herramientas según el rol activo (Profesor vs Alumno)
    applyRolePermissions(state.userRole || 'student');

    // Configuración de módulos e interacciones
    setupCanvasListeners(canvas, ctx, renderFn, setTool, updateContextToolbar);
    setupUIListeners(canvas, ctx, renderFn);
    setupGoogleDriveListeners(renderFn);
    setupTemplatesListeners(canvas, renderFn);

    // Inicializar autenticación e integración en la nube
    initGIS(renderFn);
    initFirebaseSync(renderFn);

    // Cambio automático de pizarra para alumnos impulsado por el profesor
    listenTeacherBoardChange((boardId) => {
        if (state.userRole === 'student' && boardId) {
            loadBoardFromDrive(boardId, renderFn);
        }
    });

    // Abrir menú modal de selección de pizarras con vistas previas
    const btnOpenBoards = document.getElementById('btn-open-boards-menu');
    if (btnOpenBoards) {
        btnOpenBoards.addEventListener('click', async () => {
            const boards = await fetchDriveBoards();
            openBoardSelectionModal(boards, (selectedBoardId) => {
                loadBoardFromDrive(selectedBoardId, renderFn);
            });
        });
    }

    // Herramienta inicial por defecto
    setTool('pencil');
    renderFn();
});