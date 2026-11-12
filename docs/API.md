# YOLOv8 API contract (V5)

The app is AI-ready but does **not** ship with a trained model or a deployed server.

Set **Settings → AI mode → YOLOv8 API**, and an **HTTPS** prediction URL (e.g. `https://example.com/api/predict`). The application POSTs a `multipart/form-data` request with a JPEG file field named `image`. The endpoint must allow CORS for the GitHub Pages origin. Do not put secrets or private API keys in the web app.

## JSON response

```json
{
  "model_version": "YOLOv8n-seg-project-v1",
  "damage_level": 2,
  "dirt_level": 1,
  "damage_percent": 24.6,
  "detections": [
    {"label": "insulator", "confidence": 0.96, "bbox": [0.15, 0.2, 0.75, 0.83]},
    {"label": "crack", "confidence": 0.88, "bbox": [0.44, 0.51, 0.53, 0.59]}
  ]
}
```

**The above numbers are examples for software testing, not results from a trained model.**

`bbox` = normalized `[left, top, right, bottom]` from 0 to 1 relative to the original input image. Damage severity must be an integer 0–5; dirt level 0–3; visually damaged area 0–100. The server must implement real severity assessment and segmentation-based visible damage percentage. YOLO object detection boxes alone do not measure damage area. Return a non-2xx HTTP error if the server cannot reliably produce a required field. The web app must not fall back to simulated results when API mode fails.

## Integration checkpoints

1. Train/export `best.pt`, verify class names (`insulator`, `crack`, `dirt`) and model suitability.
2. Implement Python API with inference + postprocessing, and validate schema/coordinate normalization.
3. Add server authentication, CORS allow-list, rate limits, image size limits and HTTPS.
4. Test from the deployed website and verify predictions against labeled test images.
5. Until validated, treat all model predictions as decision-support rather than certified equipment condition assessments.
