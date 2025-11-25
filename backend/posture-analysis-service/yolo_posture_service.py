# /mnt/data/yolo_posture_service.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import cv2
import numpy as np
import base64
import traceback

app = Flask(__name__)
CORS(app)

MODEL_NAME = 'yolo11n-pose.pt'
try:
    model = YOLO(MODEL_NAME)
    app.logger.info(f"✅ Successfully loaded model: {MODEL_NAME}")
except Exception as e:
    app.logger.error(f"❌ Error loading model {MODEL_NAME}: {e}")
    model = None

# ---------- utilities ----------

def calculate_angle(a, b, c):
    try:
        a = np.array(a, dtype=float); b = np.array(b, dtype=float); c = np.array(c, dtype=float)
    except Exception:
        return None
    ba = a - b; bc = c - b
    na = np.linalg.norm(ba); nc = np.linalg.norm(bc)
    if na == 0 or nc == 0:
        return None
    cosv = np.dot(ba, bc) / (na * nc)
    cosv = np.clip(cosv, -1.0, 1.0)
    return float(np.degrees(np.arccos(cosv)))

def normalize_score(angle, ideal_angle, max_deviation, falloff_scale=3.0):
    if angle is None:
        return 0.0
    deviation = abs(angle - ideal_angle)
    if deviation <= max_deviation:
        score = 100.0 - (50.0 * (deviation / max_deviation))
        return float(np.clip(score, 0.0, 100.0))
    max_dev_ext = max_deviation * max(1.0, falloff_scale)
    if deviation <= max_dev_ext:
        frac = (deviation - max_deviation) / (max_dev_ext - max_deviation)
        score = 50.0 * (1.0 - frac)
        return float(np.clip(score, 0.0, 100.0))
    return 0.0

def calculate_posture_score(keypoints, confidences=None):
    # unchanged scoring logic (kept exactly as in your file)
    LEFT_EAR = 3
    LEFT_SHOULDER = 5
    LEFT_HIP = 11

    try:
        kp = np.asarray(keypoints)
    except Exception:
        return 0.0
    if kp.ndim != 2 or kp.shape[1] < 2:
        return 0.0
    if max(LEFT_EAR, LEFT_SHOULDER, LEFT_HIP) >= len(kp):
        return 0.0

    le = kp[LEFT_EAR][:2]; ls = kp[LEFT_SHOULDER][:2]; lh = kp[LEFT_HIP][:2]
    angle = calculate_angle(le, ls, lh)

    IDEAL_ANGLE = 28.5
    MAX_DEV = 12.0
    score = normalize_score(angle, IDEAL_ANGLE, MAX_DEV, falloff_scale=3.0)
    app.logger.debug("Head angle: %s, score: %s", angle, score)
    return round(float(score), 2)

# ---------- API endpoint ----------

@app.route('/api/posture', methods=['POST'])
def analyze_posture_yolo():
    if not model:
        return jsonify({"error": "ML Model not loaded."}), 503

    try:
        image_b64 = None
        img_bytes = None

        # 1) If client sent multipart/form-data (file), prefer that (fast, no base64)
        if 'image' in request.files:
            f = request.files['image']
            img_bytes = f.read()

        else:
            # 2) Otherwise fall back to JSON base64 "image" field (backward compatible)
            payload = request.get_json(silent=True)
            if not payload or 'image' not in payload:
                return jsonify({"error": "No 'image' provided"}), 400
            image_b64 = payload['image']
            if "base64," in image_b64:
                _, image_b64 = image_b64.split("base64,", 1)
            try:
                img_bytes = base64.b64decode(image_b64)
            except Exception:
                return jsonify({"error": "Failed to decode base64 image"}), 400

        if not img_bytes:
            return jsonify({"error": "Failed to receive image bytes"}), 400

        img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img_cv = cv2.imdecode(img_arr, flags=cv2.IMREAD_COLOR)
        if img_cv is None:
            return jsonify({"error": "Failed to decode image into cv2 image"}), 400

            # Use original camera resolution (no forced resizing)

        results = model(img_cv, verbose=False, conf=0.5, max_det=1)

        posture_score = 0.0
        annotated_image_b64 = None

        if results and len(results) > 0:
            res0 = results[0]
            keypoints_array = None
            confidences = None
            try:
                kp_obj = getattr(res0, 'keypoints', None)
                if kp_obj is not None:
                    if hasattr(kp_obj, 'xy'):
                        kp_xy = kp_obj.xy
                        try:
                            candidate = kp_xy[0]
                            candidate = candidate.cpu().numpy() if hasattr(candidate, 'cpu') else np.asarray(candidate)
                            keypoints_array = np.asarray(candidate)
                        except Exception:
                            if isinstance(kp_xy, (list, tuple)) and len(kp_xy) > 0:
                                candidate = kp_xy[0]
                                candidate = candidate.cpu().numpy() if hasattr(candidate, 'cpu') else np.asarray(candidate)
                                keypoints_array = np.asarray(candidate)
                    if hasattr(kp_obj, 'conf'):
                        try:
                            c0 = kp_obj.conf[0]
                            confidences = c0.cpu().numpy() if hasattr(c0, 'cpu') else np.asarray(c0)
                        except Exception:
                            try:
                                if isinstance(kp_obj.conf, (list, tuple)) and len(kp_obj.conf) > 0:
                                    c0 = kp_obj.conf[0]
                                    confidences = c0.cpu().numpy() if hasattr(c0, 'cpu') else np.asarray(c0)
                            except Exception:
                                confidences = None
            except Exception:
                app.logger.debug("Keypoint extraction error: %s", traceback.format_exc())

            if keypoints_array is not None and keypoints_array.size > 0:
                posture_score = calculate_posture_score(keypoints_array, confidences=confidences)
                try:
                    annotated_img_cv = res0.plot()
                    # Do NOT flip here (keeps processing minimal and avoids mirroring)
                    ok, buf = cv2.imencode('.jpg', annotated_img_cv, [cv2.IMWRITE_JPEG_QUALITY, 60])
                    if ok:
                        annotated_image_b64 = base64.b64encode(buf).decode('utf-8')
                except Exception:
                    app.logger.debug("Annotated image generation failed: %s", traceback.format_exc())

        return jsonify({
            "success": True,
            "posture_score": posture_score,
            "feedback": "Posture is upright." if posture_score > 70 else "Adjust your posture.",
            "annotated_image": annotated_image_b64
        })

    except Exception as e:
        app.logger.error("Internal error during analysis: %s\n%s", e, traceback.format_exc())
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

if __name__ == '__main__':
    app.logger.info("Starting YOLO Posture Service...")
    app.run(host='0.0.0.0', port=5001)
