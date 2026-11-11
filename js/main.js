// MAIN BOOTSTRAPPER & ENTRYPOINT - PIZARRA PROFEDIEGO
import { loadFromLocalStorage, state } from './state.js';
import { resizeCanvas, render } from './canvasEngine.js';
import { setupCanvasListeners } from './tools.js';
import { setupUIListeners, setTool, updateContextToolbar, openBoardSelectionModal, applyRolePermissions } from './uiController.js';
import { setupGoogleDriveListeners, initGIS, fetchDriveBoards, loadBoardFromDrive } from './gdrive.js';
import { setupTemplatesListeners } from './templates.js';
import { initFirebaseSync, listenTeacherBoardChange, notifyBoardSwitch } from './firebaseSync.js';

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

    applyRolePermissions(state.userRole || 'student');

    setupCanvasListeners(canvas, ctx, renderFn, setTool, updateContextToolbar);
    setupUIListeners(canvas, ctx, renderFn);
    setupGoogleDriveListeners(renderFn);
    setupTemplatesListeners(canvas, renderFn);

    initGIS(renderFn);
    initFirebaseSync(renderFn);

    listenTeacherBoardChange((boardId) => {
        if ((state.userRole === 'student' || !state.gdriveIsTeacher) && boardId) {
            if (state.gdriveActiveFileId !== boardId) {
                loadBoardFromDrive(boardId, renderFn);
            }
        }
    });

    const btnOpenBoards = document.getElementById('btn-open-boards-menu');
    if (btnOpenBoards) {
        btnOpenBoards.addEventListener('click', async () => {
            const boards = await fetchDriveBoards();
            openBoardSelectionModal(boards, (selectedBoardId) => {
                loadBoardFromDrive(selectedBoardId, renderFn);
            });
        });
    }

    setTool('pencil');
    renderFn();
});