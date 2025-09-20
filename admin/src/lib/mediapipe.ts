// Простая обёртка для загрузки MediaPipe FaceLandmarker из CDN
// Важно: требует установки зависимостей @mediapipe/tasks-vision

export async function loadFaceLandmarker() {
  const vision = await import('@mediapipe/tasks-vision')
  const { FilesetResolver, FaceLandmarker, DrawingUtils } = vision as any
  const fileset = await FilesetResolver.forVisionTasks(
    // CDN с wasm и .task файлами
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  )
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/face_landmarker.task'
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  })
  return { landmarker, DrawingUtils }
}


