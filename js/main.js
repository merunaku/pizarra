// MAIN BOOTSTRAPPER & ENTRYPOINT - PIZARRA PROFEDIEGO
import { loadFromLocalStorage, state } from './state.js';
import { resizeCanvas, render } from './canvasEngine.js';
import { setupCanvasListeners } from './tools.js';
import { setupUIListeners, setTool, updateContextToolbar, openBoardSelectionModal, applyRolePermissions } from './uiController.js';
import { setupGoogleDriveListeners, initGIS, fetchDriveBoards, loadBoardFromDrive } from './gdrive.js';
import { setupTemplatesListeners } from './templates.js';
import { initFirebaseSync, listenTeacherBoardChange, updateUserPresence, getSharedBoardsCatalog } from './firebaseSync.js';

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

    let panThrottleTimer = null;
    canvas.addEventListener('mousemove', () => {
        if (state.isPanning) {
            if (!panThrottleTimer) {
                panThrottleTimer = setTimeout(() => {
                    updateUserPresence();
                    panThrottleTimer = null;
                }, 100);
            }
        }
    });

    listenTeacherBoardChange((boardId) => {
        const isStudent = state.userRole === 'student' && !state.gdriveIsTeacher;
        if (isStudent && boardId && !state.studentManuallySelectedBoard) {
            if (state.gdriveActiveFileId !== boardId) {
                state.gdriveActiveFileId = boardId;
                state.activeBoardId = boardId;

                const catalog = getSharedBoardsCatalog();
                const found = catalog.find(b => b.id === boardId);
                if (found && found.name) {
                    const topTitleInput = document.getElementById('board-title');
                    if (topTitleInput) topTitleInput.value = found.name;
                }

                if (state.gdriveAccessToken) {
                    loadBoardFromDrive(boardId, renderFn);
                }
            }
        }
    });

    const btnOpenBoards = document.getElementById('btn-open-boards-menu');
    if (btnOpenBoards) {
        btnOpenBoards.addEventListener('click', async () => {
            const isTeacher = state.userRole === 'teacher' || state.gdriveIsTeacher;
            let boards = [];

            if (isTeacher) {
                boards = await fetchDriveBoards();
            } else {
                boards = getSharedBoardsCatalog();
                if (boards.length === 0 && state.gdriveAccessToken) {
                    boards = await fetchDriveBoards();
                }
            }

            openBoardSelectionModal(boards, (selectedBoardId) => {
                const chosen = boards.find(b => b.id === selectedBoardId);
                if (chosen && chosen.name) {
                    const topTitleInput = document.getElementById('board-title');
                    if (topTitleInput) topTitleInput.value = chosen.name;
                    localStorage.setItem('profediego_board_title', chosen.name);
                }

                if (state.gdriveAccessToken) {
                    loadBoardFromDrive(selectedBoardId, renderFn);
                }
            });
        });
    }

    setTool('pencil');
    renderFn();
});