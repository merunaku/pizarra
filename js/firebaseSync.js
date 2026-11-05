// FIREBASE REALTIME DATABASE SYNC MODULE - PIZARRA PROFEDIEGO
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { state, restoreSnapshot } from "./state.js";

// Configuración de credenciales de Firebase para Pizarra ProfeDiego
const firebaseConfig = {
  apiKey: "AIzaSyCgwLhw_twx8FaQot6e4tFa-vTyKhOVruI",
  authDomain: "pizarra-profediego.firebaseapp.com",
  databaseURL: "https://pizarra-profediego-default-rtdb.firebaseio.com",
  projectId: "pizarra-profediego",
  storageBucket: "pizarra-profediego.firebasestorage.app",
  messagingSenderId: "399259351439",
  appId: "1:399259351439:web:e76fb20b6be38f8b4bb3fa"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentRoomId = null;
let roomRef = null;
let isRemoteUpdate = false;
let renderCb = null;

/**
 * Conecta la pizarra en tiempo real a una sala mapeada por el fileId de Google Drive
 */
export function joinRoom(roomId, renderCallback) {
  if (!roomId) return;
  if (renderCallback) renderCb = renderCallback;

  if (roomRef && currentRoomId) {
    off(roomRef);
  }

  currentRoomId = roomId;
  roomRef = ref(db, `rooms/${currentRoomId}`);

  const roomTag = document.getElementById('currentRoomIdText') || document.getElementById('sync-status-badge');
  if (roomTag && roomTag.id === 'currentRoomIdText') {
    roomTag.innerText = roomId.substring(0, 12) + '...';
  }

  onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    if (!data || !data.elements) return;

    if (state.gdriveIsTeacher && !isRemoteUpdate) return;

    isRemoteUpdate = true;
    restoreSnapshot(data.elements, renderCb);
    isRemoteUpdate = false;
  });
}

/**
 * Transmite el estado actual de los elementos a la sala de Firebase
 */
export function broadcastBoardState(elements) {
  if (!currentRoomId || isRemoteUpdate) return;
  if (state.gdriveCurrentUserEmail && !state.gdriveIsTeacher) return;

  const roomDataRef = ref(db, `rooms/${currentRoomId}`);
  set(roomDataRef, {
    title: document.getElementById('board-title')?.value || 'Pizarra ProfeDiego',
    updatedAt: Date.now(),
    elements: elements || state.elements
  }).catch((error) => {
    console.error("Error al transmitir cambios a la sala de Firebase:", error);
  });
}

window.joinRoom = joinRoom;
window.broadcastBoardState = broadcastBoardState;