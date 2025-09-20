// Простая обёртка для загрузки MediaPipe FaceLandmarker из CDN
// Важно: требует установки зависимостей @mediapipe/tasks-vision

export async function loadFaceLandmarker() {
  const vision = await import('@mediapipe/tasks-vision')
  const { FilesetResolver, FaceLandmarker, DrawingUtils } = vision as any
  const fileset = await FilesetResolver.forVisionTasks(
    // CDN с wasm-ресурсами Tasks Vision
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  )
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      // Официальный хост модели (.task) — Google Cloud Storage
      // (вариант: положить локально в public и дать путь вида import.meta.env.BASE_URL + 'mediapipe/face_landmarker.task')
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  })
  return { landmarker, DrawingUtils }
}


