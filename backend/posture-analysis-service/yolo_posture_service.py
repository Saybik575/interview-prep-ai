from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import cv2
import numpy as np
import base64
import os 

# --- 1. CONFIGURATION ---
app = Flask(__name__)
# Enable CORS for the React frontend (running on a different port)
CORS(app)

# Load YOLO model globally
MODEL_NAME = 'yolo11n-pose.pt'
try:
    model = YOLO(MODEL_NAME)
    print(f"✅ Successfully loaded model: {MODEL_NAME}")
except Exception as e:
    print(f"❌ Error loading model {MODEL_NAME}: {e}")
    print("Make sure the model file exists or will be downloaded automatically")
    model = None

# --- 2. POSTURE SCORING LOGIC ---

# YOLOv11 Keypoint Indices (0-based)
# 5: Left Shoulder, 11: Left Hip

def calculate_angle(a, b, c):
    """Calculates the angle (in degrees) formed by three keypoints a, b, and c."""
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)

    ba = a - b
    bc = c - b

    norm_a = np.linalg.norm(ba)
    norm_c = np.linalg.norm(bc)
    
    if norm_a == 0 or norm_c == 0:
        return 0.0

    cosine_angle = np.dot(ba, bc) / (norm_a * norm_c)
    cosine_angle = np.clip(cosine_angle, -1.0, 1.0)
    
    return np.degrees(np.arccos(cosine_angle))

def normalize_score(angle, ideal_angle, max_deviation):
    """
    Maps the deviation from the ideal angle to a score (0-100).
    
    Args:
        angle (float): The measured angle in degrees
        ideal_angle (float): The ideal/target angle in degrees
        max_deviation (float): Maximum acceptable deviation from ideal
        
    Returns:
        float: Score from 0-100 where 100 is perfect (at ideal angle)
    """
    deviation = abs(angle - ideal_angle)

    # If within the acceptable band, keep the existing linear mapping
    if deviation <= max_deviation:
        normalized_deviation = deviation / max_deviation
        score = 100 * (1 - normalized_deviation)
        return score

    # Soft falloff beyond the max_deviation: avoid instant zero scores
    # This provides a gentler decline so slightly larger deviations still
    # show a visible (lower) score rather than 0. The falloff scale (3.0)
    # controls how quickly score approaches 0 for very large deviations.
    falloff_scale = 3.0
    score = 100 * max(0.0, 1 - (deviation / (max_deviation * falloff_scale)))
    return score

def calculate_posture_score(keypoints):
    """Calculate posture score (0-100) using ONLY head slouch angle.

        Calibration (final adaptive):
            - Metric: Head Slouch Angle (Left Ear -> Left Shoulder -> Left Hip)
            - ideal_angle: 103.0° (shifted to observed average to restore higher baseline scores)
            - max_deviation: 12.0° (sensitivity retained; outside ~91°–115° drops quickly)
      - Output weighting: 100% head_score (no torso component)

    Args:
        keypoints: Array of keypoint coordinates from YOLO pose detection

    Returns:
        float: Head-based posture score (0-100) rounded to 2 decimals
    """
    # YOLOv11 Keypoint Indices
    LEFT_EAR = 3
    LEFT_SHOULDER = 5
    LEFT_HIP = 11

    # Ensure we have enough keypoints
    if len(keypoints) <= LEFT_HIP:
        return 0.0

    # Extract coordinates (x, y) - convert to numpy arrays
    le = np.array(keypoints[LEFT_EAR][:2])      # Left Ear
    ls = np.array(keypoints[LEFT_SHOULDER][:2]) # Left Shoulder  
    lh = np.array(keypoints[LEFT_HIP][:2])      # Left Hip

    # --- HEAD SLOUCH ANGLE ONLY ---
    head_slouch_angle = calculate_angle(le, ls, lh)

    # Final calibration: ideal 103.0°, max deviation 12.0° (sensitive band around new mean)
    head_score = normalize_score(head_slouch_angle, ideal_angle=103.0, max_deviation=12.0)

    # Debug output (torso removed)
    print(f"DEBUG - Head angle: {head_slouch_angle:.1f}°, Head-only score: {head_score:.1f}")

    # Final score is 100% head score
    return round(float(head_score), 2)


# --- 3. CORE API ENDPOINT (Base64 Handler for Production) ---

@app.route('/api/posture', methods=['POST'])
def analyze_posture_yolo():
    """
    The main production endpoint. Handles a Base64 image, runs YOLO,
    calculates the score, and returns annotated Base64 image.
    Supports multiple endpoint paths for compatibility.
    """
    if not model:
        return jsonify({"error": "ML Model not loaded."}), 503
        
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({"error": "No 'image' (Base64 string) provided"}), 400
        
        image_b64 = data['image']
        
        # --- Decode Image ---
        if "base64," in image_b64:
            _, image_b64 = image_b64.split("base64,")
            
        img_bytes = base64.b64decode(image_b64)
        img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img_cv = cv2.imdecode(img_arr, flags=cv2.IMREAD_COLOR)

        if img_cv is None:
            return jsonify({"error": "Failed to decode image data"}), 400

        # Flip the image horizontally
        img_cv = cv2.flip(img_cv, 1)

        # --- Run Inference ---
        results = model(img_cv, verbose=False)
        
        posture_score = 0.0
        annotated_image_b64 = image_b64 # Default to original if no detection

        if results and results[0].keypoints and results[0].keypoints.has_visible:
            
            # Extract keypoints for the first detected person
            keypoints_data = results[0].keypoints.xy[0].cpu().numpy()
            
            # --- Calculate Score ---
            posture_score = calculate_posture_score(keypoints_data)
            
            # --- Create Annotated Image ---
            annotated_img_cv = results[0].plot()
            
            # Encode annotated image back to Base64
            is_success, buffer = cv2.imencode(".jpg", annotated_img_cv)
            if is_success:
                annotated_image_b64 = base64.b64encode(buffer).decode('utf-8')
            
        
        return jsonify({
            "success": True,
            "posture_score": posture_score,
            "feedback": "Posture is upright." if posture_score > 70 else "Adjust your posture.",
            "annotated_image": annotated_image_b64
        })

    except Exception as e:
        app.logger.error(f"Error during pose analysis: {e}")
        return jsonify({"error": f"Internal server error during analysis: {str(e)}"}), 500


if __name__ == '__main__':
    print("Starting YOLO Posture Service...")
    print(f"Model loaded: {MODEL_NAME}")
    app.run(host='0.0.0.0', port=5001)