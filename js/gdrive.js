// GOOGLE DRIVE CLOUD SYNC & EXPLORER MODULE - PIZARRA PROFEDIEGO
import { state, saveState, restoreSnapshot } from './state.js';
import { showToast } from './uiController.js';

let renderCallback = null;
let tokenClient = null;
let autoSaveTimeout = null;

/**
 * Actualiza la insignia gráfica de estado de sincronización en el Navbar
 */
export function updateSyncBadge(statusText, type = 'local') {
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;

    if (type === 'syncing') {
        badge.innerHTML = `<i class="fa-solid fa-rotate fa-spin text-amber-500"></i> ${statusText}`;
        badge.className = 'text-[10px] text-amber-600 font-medium -mt-1 ml-0.5 flex items-center gap-1';
    } else if (type === 'drive') {
        badge.innerHTML = `<i class="fa-solid fa-cloud-check text-emerald-500"></i> ${statusText}`;
        badge.className = 'text-[10px] text-emerald-600 font-semibold -mt-1 ml-0.5 flex items-center gap-1';
    } else if (type === 'error') {
        badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red-500"></i> ${statusText}`;
        badge.className = 'text-[10px] text-red-500 font-medium -mt-1 ml-0.5 flex items-center gap-1';
    } else {
        badge.innerHTML = `<i class="fa-solid fa-circle text-[6px] text-emerald-500"></i> ${statusText}`;
        badge.className = 'text-[10px] text-slate-500 font-medium -mt-1 ml-0.5 flex items-center gap-1';
    }
}

/**
 * Sincroniza el título de la pizarra en los inputs de la barra principal y del modal
 */
export function syncBoardTitle(newTitle) {
    const topTitleInput = document.getElementById('board-title');
    const modalTitleInput = document.getElementById('boardTitle');
    
    if (topTitleInput && topTitleInput.value !== newTitle) topTitleInput.value = newTitle;
    if (modalTitleInput && modalTitleInput.value !== newTitle) modalTitleInput.value = newTitle;
    
    localStorage.setItem('profediego_board_title', newTitle);

    if (state.gdriveActiveFileId && state.gdriveAccessToken) {
        triggerAutoSaveToDrive();
    }
}

/**
 * Inicializa el cliente GIS OAuth 2.0 de Google con persistencia de sesión
 */
export function initGIS(renderFn) {
    if (renderFn) renderCallback = renderFn;

    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        try {
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: state.gdriveClientId,
                scope: state.gdriveScopes,
                callback: async (response) => {
                    if (response.error) {
                        showToast('Error de autenticación: ' + response.error, 'fa-solid fa-triangle-exclamation');
                        return;
                    }
                    state.gdriveAccessToken = response.access_token;
                    
                    // Guardar credenciales de sesión en localStorage (1 hora de validez)
                    const expiresIn = response.expires_in || 3600;
                    const expTime = Date.now() + (expiresIn * 1000);
                    localStorage.setItem('profediego_gdrive_token', response.access_token);
                    localStorage.setItem('profediego_gdrive_exp', expTime.toString());

                    await fetchUserProfile();
                    updateUIByRole();
                    showToast('Sesión con Google conectada', 'fa-brands fa-google-drive');
                }
            });

            // Verificar si existe una sesión previa no expirada en localStorage (Resistencia a F5)
            checkSavedSession();

        } catch (err) {
            console.warn("No se pudo inicializar GIS Client:", err);
        }
    }
}

/**
 * Restaura la sesión guardada si el token aún no ha expirado
 */
async function checkSavedSession() {
    const savedToken = localStorage.getItem('profediego_gdrive_token');
    const savedExp = localStorage.getItem('profediego_gdrive_exp');

    if (savedToken && savedExp) {
        const expTime = parseInt(savedExp, 10);
        if (Date.now() < expTime - 60000) { // Si quedan más de 60 segundos
            state.gdriveAccessToken = savedToken;
            await fetchUserProfile();
            updateUIByRole();
            return;
        }
    }
    
    // Si expiro o no existe token, intentar refresco silencioso si tokenClient está listo
    if (tokenClient) {
        try {
            tokenClient.requestAccessToken({ prompt: 'none' });
        } catch (e) {
            console.log("No fue posible restaurar sesión silenciosa:", e);
        }
    }
}

/**
 * Dispara el flujo explícito de inicio de sesión de Google
 */
export function handleAuthClick() {
    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'select_account consent' });
    } else {
        initGIS();
        if (tokenClient) {
            tokenClient.requestAccessToken({ prompt: 'select_account consent' });
        } else {
            showToast('Google Identity Services no está disponible aún', 'fa-solid fa-triangle-exclamation');
        }
    }
}

/**
 * Configura los eventos del modal y la interfaz del explorador de Google Drive
 */
export function setupGoogleDriveListeners(renderFn) {
    renderCallback = renderFn;

    // Exponer la función de Auto-Sync al ámbito global para invocation desde saveState()
    window.triggerAutoSaveToDrive = triggerAutoSaveToDrive;

    window.gdriveModule = {
        handleAuthClick,
        navigateToFolder,
        navigateToBreadcrumb,
        refreshCurrentFolder,
        promptCreateFolder,
        saveWhiteboardTest,
        copyFile,
        pasteFile,
        readWhiteboard,
        syncBoardTitle
    };

    // Listeners para cambio de título sincrónico
    const topTitleInput = document.getElementById('board-title');
    if (topTitleInput) {
        topTitleInput.addEventListener('input', (e) => syncBoardTitle(e.target.value));
    }

    const modalTitleInput = document.getElementById('boardTitle');
    if (modalTitleInput) {
        modalTitleInput.addEventListener('input', (e) => syncBoardTitle(e.target.value));
    }

    // Botones de la interfaz
    const btnAccount = document.getElementById('btn-gdrive-account');
    if (btnAccount) {
        btnAccount.addEventListener('click', () => {
            const modal = document.getElementById('modal-gdrive');
            if (modal) modal.classList.remove('hidden');
        });
    }

    const btnOpenModal = document.getElementById('btn-gdrive-open-modal');
    if (btnOpenModal) {
        btnOpenModal.addEventListener('click', () => {
            const menuExport = document.getElementById('menu-export');
            if (menuExport) menuExport.classList.add('hidden');
            const modal = document.getElementById('modal-gdrive');
            if (modal) modal.classList.remove('hidden');
        });
    }

    const btnCloseModal = document.getElementById('btn-close-gdrive');
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            const modal = document.getElementById('modal-gdrive');
            if (modal) modal.classList.add('hidden');
        });
    }

    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.addEventListener('click', handleAuthClick);
    }

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveWhiteboardTest(false));
    }

    const newFolderBtn = document.getElementById('newFolderBtn');
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', promptCreateFolder);
    }

    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn) {
        pasteBtn.addEventListener('click', pasteFile);
    }

    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshCurrentFolder);
    }

    const toggleSync = document.getElementById('toggle-autosync-gdrive');
    if (toggleSync) {
        toggleSync.checked = true; // Habilitar auto-sync por defecto
        state.gdriveAutoSync = true;
        toggleSync.addEventListener('change', (e) => {
            state.gdriveAutoSync = e.target.checked;
            if (e.target.checked) {
                showToast('Auto-Sync en tiempo real activado', 'fa-solid fa-rotate');
                triggerAutoSaveToDrive();
            } else {
                updateSyncBadge('Local (Guardado Automático)', 'local');
            }
        });
    }
}

/**
 * Obtiene el perfil del usuario autenticado
 */
export async function fetchUserProfile() {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${state.gdriveAccessToken}` }
        });
        
        if (!res.ok) throw new Error("Token no válido");

        const data = await res.json();
        state.gdriveUser = data;
        state.gdriveCurrentUserEmail = data.email;
        state.gdriveIsTeacher = (data.email && data.email.toLowerCase() === state.gdriveTeacherEmail.toLowerCase());

        const avatar = document.getElementById('gdrive-user-avatar');
        const email = document.getElementById('gdrive-user-email');
        if (avatar && data.picture) avatar.src = data.picture;
        if (email) email.innerText = data.email || 'Cuenta de Google';

        const headerProfile = document.getElementById('header-user-profile');
        const headerAvatar = document.getElementById('header-user-avatar');
        const headerName = document.getElementById('header-user-name');
        if (headerProfile && headerAvatar && headerName) {
            if (data.picture) headerAvatar.src = data.picture;
            headerName.innerText = (data.name || data.email).split(' ')[0];
            headerProfile.classList.remove('hidden');
        }

        if (state.gdriveActiveFileId) {
            updateSyncBadge('Conectado a Drive', 'drive');
        } else {
            updateSyncBadge('Sesión Drive Activa', 'drive');
        }
    } catch (err) {
        console.error('Error al obtener perfil:', err);
        // Limpiar token inválido
        localStorage.removeItem('profediego_gdrive_token');
        localStorage.removeItem('profediego_gdrive_exp');
        state.gdriveAccessToken = null;
    }
}

/**
 * Dispara el guardado automático debounceado (tiempo real)
 */
export function triggerAutoSaveToDrive() {
    if (!state.gdriveAutoSync || !state.gdriveAccessToken || !state.gdriveIsTeacher) return;

    updateSyncBadge('Sincronizando...', 'syncing');

    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        saveWhiteboardTest(true);
    }, 1500); // 1.5 segundos de debounce
}

/**
 * Actualiza la interfaz según el rol del usuario (Profesor o Alumno)
 */
export function updateUIByRole() {
    const userInfo = document.getElementById('userInfo');
    const badge = document.getElementById('roleBadge');
    const boardTitleInput = document.getElementById('boardTitle');
    const saveBtn = document.getElementById('saveBtn');
    const newFolderBtn = document.getElementById('newFolderBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const gdriveUserLabel = document.getElementById('gdrive-user-label');

    if (userInfo) userInfo.innerText = `Conectado como: ${state.gdriveCurrentUserEmail || 'Usuario'}`;
    if (gdriveUserLabel) gdriveUserLabel.innerText = state.gdriveIsTeacher ? 'Drive (Profesor)' : 'Drive (Alumno)';

    if (badge) {
        if (state.gdriveIsTeacher) {
            badge.innerHTML = '<span class="badge teacher bg-emerald-600 text-white px-2 py-1 rounded text-xs font-bold"><i class="fa-solid fa-user-shield"></i> ROL: PROFESOR (Editor)</span>';
        } else {
            badge.innerHTML = '<span class="badge student bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold"><i class="fa-solid fa-graduation-cap"></i> ROL: ALUMNO (Solo Lectura)</span>';
        }
    }

    if (boardTitleInput) boardTitleInput.disabled = !state.gdriveIsTeacher;
    if (saveBtn) saveBtn.disabled = !state.gdriveIsTeacher;
    if (newFolderBtn) newFolderBtn.disabled = !state.gdriveIsTeacher;
    if (refreshBtn) refreshBtn.disabled = false;

    renderBreadcrumbs();
    listFolderContents();
}

/**
 * Retorna el ID de la carpeta actual seleccionada en la navegación
 */
export function getCurrentFolderId() {
    if (!state.gdriveFolderHistory || state.gdriveFolderHistory.length === 0) {
        state.gdriveFolderHistory = [{ id: state.gdriveRootFolderId, name: 'Raíz' }];
    }
    return state.gdriveFolderHistory[state.gdriveFolderHistory.length - 1].id;
}

/**
 * Renderiza la barra de navegación Breadcrumbs
 */
export function renderBreadcrumbs() {
    const container = document.getElementById('breadcrumbsView');
    if (!container) return;
    container.innerHTML = '<span class="text-slate-400 font-bold mr-1">Ruta:</span>';

    state.gdriveFolderHistory.forEach((folder, index) => {
        const span = document.createElement('span');
        span.className = 'cursor-pointer hover:underline text-indigo-600 font-bold';
        span.innerText = folder.name;
        span.onclick = () => navigateToBreadcrumb(index);
        container.appendChild(span);

        if (index < state.gdriveFolderHistory.length - 1) {
            container.appendChild(document.createTextNode(' / '));
        }
    });
}

/**
 * Navega hacia una carpeta específica
 */
export function navigateToFolder(folderId, folderName) {
    state.gdriveFolderHistory.push({ id: folderId, name: folderName });
    renderBreadcrumbs();
    listFolderContents();
}

/**
 * Navega a un nivel superior en los Breadcrumbs
 */
export function navigateToBreadcrumb(index) {
    state.gdriveFolderHistory = state.gdriveFolderHistory.slice(0, index + 1);
    renderBreadcrumbs();
    listFolderContents();
}

/**
 * Refresca los archivos de la carpeta actual
 */
export function refreshCurrentFolder() {
    listFolderContents();
}

/**
 * Obtiene la lista de pizarras disponibles en Google Drive para el menú de selección
 */
export async function fetchDriveBoards() {
    if (!state.gdriveAccessToken) return [];
    try {
        const query = encodeURIComponent("mimeType = 'application/json' and trashed = false");
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,thumbnailLink,modifiedTime)&orderBy=modifiedTime desc`, {
            headers: { Authorization: `Bearer ${state.gdriveAccessToken}` }
        });
        const data = await response.json();
        if (data.files) {
            return data.files.map(f => ({
                id: f.id,
                name: f.name.replace(/^PIZARRA_/, '').replace(/\.json$/, ''),
                thumbnailUrl: f.thumbnailLink,
                updatedAt: f.modifiedTime
            }));
        }
        return [];
    } catch (err) {
        console.error("Error al obtener pizarras de Drive:", err);
        return [];
    }
}

/**
 * Carga una pizarra seleccionada desde Drive
 */
export async function loadBoardFromDrive(boardId, renderFn) {
    if (renderFn) renderCallback = renderFn;
    await readWhiteboard(boardId);
}

/**
 * Lista carpetas y archivos guardados en Google Drive
 */
export async function listFolderContents() {
    const list = document.getElementById('boardsList');
    if (!list) return;

    if (!state.gdriveAccessToken) {
        list.innerHTML = '<li class="p-3 text-slate-400 text-xs italic">Inicia sesión con Google para acceder a las carpetas.</li>';
        return;
    }

    list.innerHTML = '<li class="p-3 text-slate-400 text-xs italic"><i class="fa-solid fa-spinner fa-spin"></i> Cargando contenido...</li>';

    const currentFolderId = getCurrentFolderId();
    const query = encodeURIComponent(`'${currentFolderId}' in parents and trashed = false`);

    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime)&orderBy=folder,name`, {
            headers: { Authorization: `Bearer ${state.gdriveAccessToken}` }
        });

        const data = await response.json();
        list.innerHTML = '';

        if (data.files && data.files.length > 0) {
            data.files.forEach(item => {
                const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                const isCurrentActive = (item.id === state.gdriveActiveFileId);
                const li = document.createElement('li');
                li.className = 'flex items-center justify-between p-2.5 mb-1.5 rounded-xl border text-xs transition-all ' +
                    (isFolder ? 'bg-slate-100 border-indigo-200 border-l-4 border-l-indigo-600' : 
                     (isCurrentActive ? 'bg-emerald-50 border-emerald-400 border-l-4 border-l-emerald-600 font-bold' : 'bg-white border-slate-200 hover:border-indigo-300'));

                const safeName = item.name.replace(/'/g, "\\'");

                if (isFolder) {
                    li.innerHTML = `
                        <div class="item-title flex items-center gap-2 cursor-pointer font-bold text-slate-700" onclick="window.gdriveModule.navigateToFolder('${item.id}', '${safeName}')">
                            <i class="fa-solid fa-folder text-indigo-500 text-sm"></i>
                            <span>${item.name}</span>
                        </div>
                        <span class="text-[10px] text-slate-400 italic">Carpeta</span>
                    `;
                } else {
                    let copyBtnHtml = state.gdriveIsTeacher ? `<button class="btn-secondary px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[11px] mr-1" onclick="window.gdriveModule.copyFile('${item.id}', '${safeName}')">📄 Copiar</button>` : '';
                    let activeTag = isCurrentActive ? '<span class="text-[10px] bg-emerald-200 text-emerald-800 font-bold px-1.5 py-0.5 rounded ml-1">Abierto</span>' : '';
                    li.innerHTML = `
                        <div class="item-title flex items-center gap-2 cursor-pointer font-semibold text-slate-700" onclick="window.gdriveModule.readWhiteboard('${item.id}', '${safeName}')">
                            <i class="fa-solid fa-file-code text-indigo-600 text-sm"></i>
                            <span>${item.name}</span> ${activeTag}
                        </div>
                        <div class="flex items-center gap-1">
                            ${copyBtnHtml}
                            <button class="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded font-bold text-[11px]" onclick="window.gdriveModule.readWhiteboard('${item.id}', '${safeName}')">Abrir</button>
                        </div>
                    `;
                }
                list.appendChild(li);
            });
        } else {
            list.innerHTML = '<li class="p-3 text-slate-400 text-xs italic">Esta carpeta está vacía.</li>';
        }
    } catch (err) {
        console.error('Error al listar contenido:', err);
        list.innerHTML = '<li class="p-3 text-red-500 text-xs">Error al cargar la carpeta.</li>';
    }
}

/**
 * Crea una nueva carpeta en la ubicación actual
 */
export async function promptCreateFolder() {
    const folderName = prompt('Nombre de la nueva carpeta:');
    if (!folderName || !folderName.trim()) return;

    const currentFolderId = getCurrentFolderId();

    try {
        const response = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${state.gdriveAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName.trim(),
                mimeType: 'application/vnd.google-apps.folder',
                parents: [currentFolderId]
            })
        });

        const newFolder = await response.json();

        if (response.ok) {
            await setPublicReadPermission(newFolder.id);
            showToast(`Carpeta "${folderName}" creada`, 'fa-solid fa-folder-plus');
            listFolderContents();
        } else {
            alert('Error creando carpeta: ' + newFolder.error.message);
        }
    } catch (err) {
        console.error('Error al crear carpeta:', err);
    }
}

/**
 * Guardado inteligente: Sobrescribe el archivo activo si ya existe o crea uno nuevo si es primera vez.
 */
export async function saveWhiteboardTest(silent = false) {
    const titleInput = document.getElementById('boardTitle') || document.getElementById('board-title');
    const title = titleInput ? titleInput.value.trim() : 'Clase sin título';
    const saveBtn = document.getElementById('saveBtn');
    const currentFolderId = getCurrentFolderId();

    if (!state.gdriveAccessToken) {
        if (!silent) showToast('Inicia sesión en Google primero', 'fa-solid fa-lock');
        return;
    }

    if (saveBtn && !silent) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Guardando...';
    }

    const rawTitle = title.replace(/^PIZARRA_/, '').replace(/\.json$/, '');
    const fileName = `PIZARRA_${rawTitle}.json`;
    const whiteboardData = state.elements;

    try {
        if (state.gdriveActiveFileId) {
            // SOBRESCRIBIR ARCHIVO EXISTENTE (Evita duplicados)
            // 1. Actualizar Nombre / Metadatos en Drive
            await fetch(`https://www.googleapis.com/drive/v3/files/${state.gdriveActiveFileId}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${state.gdriveAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: fileName })
            });

            // 2. Actualizar Contenido del Archivo
            const contentResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${state.gdriveActiveFileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${state.gdriveAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(whiteboardData, null, 2)
            });

            if (contentResponse.ok) {
                updateSyncBadge('Sincronizado con Drive', 'drive');
                if (!silent) showToast('Pizarra actualizada en Google Drive', 'fa-solid fa-cloud-arrow-up');
                listFolderContents();
            }
        } else {
            // CREAR UN NUEVO ARCHIVO
            const metadataResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${state.gdriveAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: fileName,
                    mimeType: 'application/json',
                    parents: [currentFolderId]
                })
            });

            const file = await metadataResponse.json();

            if (!metadataResponse.ok) {
                alert('Error al crear archivo: ' + file.error.message);
                updateSyncBadge('Error al sincronizar', 'error');
                return;
            }

            const contentResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${state.gdriveAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(whiteboardData, null, 2)
            });

            if (contentResponse.ok) {
                state.gdriveActiveFileId = file.id;
                localStorage.setItem('profediego_active_file_id', file.id);
                await setPublicReadPermission(file.id);
                updateSyncBadge('Sincronizado con Drive', 'drive');
                if (!silent) showToast('Pizarra guardada y enlazada con Drive', 'fa-solid fa-cloud-arrow-up');
                listFolderContents();
            }
        }
    } catch (err) {
        console.error('Error en subida:', err);
        updateSyncBadge('Error de conexión con Drive', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = !state.gdriveIsTeacher;
            saveBtn.innerText = 'Guardar en carpeta actual';
        }
    }
}

/**
 * Copia la referencia de un archivo al portapapeles
 */
export function copyFile(fileId, fileName) {
    state.gdriveClipboardFile = { id: fileId, name: fileName };
    const bar = document.getElementById('clipboardBar');
    if (bar) {
        bar.style.display = 'block';
        bar.innerHTML = `📋 Archivo listo para pegar: <strong>${fileName}</strong>`;
    }
    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn && state.gdriveIsTeacher) {
        pasteBtn.disabled = false;
    }
    showToast(`Copiado "${fileName}". Navega a la carpeta destino`, 'fa-regular fa-copy');
}

/**
 * Pega el archivo copiado en la carpeta actual
 */
export async function pasteFile() {
    if (!state.gdriveClipboardFile) return;

    const currentFolderId = getCurrentFolderId();
    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn) {
        pasteBtn.disabled = true;
        pasteBtn.innerText = 'Pegando...';
    }

    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${state.gdriveClipboardFile.id}/copy`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${state.gdriveAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: `Copia de ${state.gdriveClipboardFile.name}`,
                parents: [currentFolderId]
            })
        });

        const copiedFile = await response.json();

        if (response.ok) {
            await setPublicReadPermission(copiedFile.id);
            showToast('Archivo pegado con éxito', 'fa-solid fa-paste');
            listFolderContents();
        } else {
            alert('Error al pegar archivo: ' + copiedFile.error.message);
        }
    } catch (err) {
        console.error('Error duplicando archivo:', err);
    } finally {
        if (pasteBtn) {
            pasteBtn.disabled = false;
            pasteBtn.innerText = '📋 Pegar aquí';
        }
    }
}

/**
 * Asigna permisos de lectura pública (anyone / reader)
 */
export async function setPublicReadPermission(fileId) {
    try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${state.gdriveAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                role: 'reader',
                type: 'anyone'
            })
        });
    } catch (err) {
        console.error('Error asignando permisos:', err);
    }
}

/**
 * Lee el contenido de la pizarra guardada y la carga en el lienzo activo
 */
export async function readWhiteboard(fileId, fileName = '') {
    const fileContentPre = document.getElementById('fileContent');
    if (fileContentPre) fileContentPre.innerText = 'Cargando contenido...';

    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${state.gdriveAccessToken}` }
        });
        const content = await response.text();

        if (fileContentPre) {
            fileContentPre.innerText = content.substring(0, 500) + (content.length > 500 ? '...' : '');
        }

        // Establecer como el archivo activo de trabajo
        state.gdriveActiveFileId = fileId;
        localStorage.setItem('profediego_active_file_id', fileId);

        if (fileName) {
            const cleanTitle = fileName.replace(/^PIZARRA_/, '').replace(/\.json$/, '');
            syncBoardTitle(cleanTitle);
        }

        restoreSnapshot(content, renderCallback);
        saveState();

        updateSyncBadge('Sincronizado con Drive', 'drive');

        const modal = document.getElementById('modal-gdrive');
        if (modal) modal.classList.add('hidden');

        showToast('Pizarra cargada en pantalla', 'fa-solid fa-chalkboard');
    } catch (err) {
        console.error('Error leyendo archivo:', err);
        if (fileContentPre) fileContentPre.innerText = 'Error al leer el archivo.';
    }
}