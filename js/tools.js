// FACHADA DE ARQUITECTURA MODULAR DE HERRAMIENTAS
export { addConnectorIntermediatePoint, removeConnectorIntermediatePoint, joinSelectedLines } from './tools/connectorTool.js';
export { openInlineEditor, closeInlineEditor } from './tools/textEditor.js';
export { processImageFile, setupImagePasteListener } from './tools/imageTool.js';
export { setupCanvasListeners } from './tools/pointerHandler.js';