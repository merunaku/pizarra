// PUNTO DE ENTRADA Y ORQUESTRACIÓN DE LA APLICACIÓN (MAIN ENTRY POINT)
import { loadFromLocalStorage } from './state.js';
import { initCanvasEngine, render } from './canvasEngine.js';
import { setupToolEvents } from './tools.js';
import { setupUIController, showToast } from './uiController.js';
import { initGIS, setupGoogleDriveListeners } from './gdrive.js';
import { joinRoom } from './firebaseSync.js';

/**
 * Evento principal de arranque al cargar el DOM de la página
 */
window.addEventListener('DOMContentLoaded', () => {
  // 1. Obtener referencia del elemento canvas principal
  const canvasElement = document.getElementById('board-canvas');
  if (!canvasElement) {
    console.error("No se encontró el elemento canvas #board-canvas en el DOM.");
    return;
  }

  // 2. Inicializar el motor gráfico del lienzo (Canvas Engine)
  initCanvasEngine(canvasElement);

  // 3. Vincular controladores de eventos del puntero, gestos multitáctiles y herramientas
  setupToolEvents(canvasElement);

  // 4. Inicializar controladores de la interfaz gráfica y eventos de modales/paneles
  setupUIController(render);

  // 5. Configurar escuchadores y modal del explorador de Google Drive
  setupGoogleDriveListeners(render);

  // 6. Cargar estado previo de la pizarra desde LocalStorage si existe
  loadFromLocalStorage(render);

  // 7. Inicializar Google Identity Services (GIS) para verificar sesión OAuth2 guardada
  initGIS(render);

  // 8. Conectar automáticamente a la sala por defecto o al archivo activo en Firebase Realtime DB
  const activeFileId = localStorage.getItem('profediego_active_file_id') || 'default_room';
  if (typeof joinRoom === 'function') {
    joinRoom(activeFileId, render);
  }

  // 9. Configurar cargador de imágenes desde el selector de archivos local
  setupImageUploadInput();

  // 10. Renderizado inicial del lienzo
  render();

  console.log("Pizarra ProfeDiego inicializada con éxito.");
});

/**
 * Configura la inserción de imágenes desde el disco local sobre el canvas
 */
function setupImageUploadInput() {
  const imageInput = document.getElementById('image-upload-input');
  if (!imageInput) return;

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor, selecciona un archivo de imagen válido', 'fa-solid fa-triangle-exclamation');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        // Calcular dimensiones proporcionales para el canvas
        const maxWidth = 320;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = img.width * scale;
        const height = img.height * scale;

        // Insertar en el centro de la vista actual
        const centerX = (window.innerWidth / 2 - width / 2);
        const centerY = (window.innerHeight / 2 - height / 2);

        const newImageElement = {
          id: 'el_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          type: 'image',
          src: event.target.result,
          imgElement: img,
          x: centerX,
          y: centerY,
          width: width,
          height: height,
          opacity: 1
        };

        import('./state.js').then(({ state, saveState }) => {
          state.elements.push(newImageElement);
          state.selectedIds = [newImageElement.id];
          saveState();

          import('./firebaseSync.js').then(({ broadcastBoardState }) => {
            broadcastBoardState(state.elements);
          });

          render();
          showToast('Imagen insertada en la pizarra', 'fa-regular fa-image');
        });
      };
    };

    reader.readAsDataURL(file);

    // Limpiar el input para permitir volver a subir la misma imagen si se desea
    imageInput.value = '';
  });
}