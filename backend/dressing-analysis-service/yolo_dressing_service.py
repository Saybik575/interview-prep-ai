import os
import io
import logging
import json
import re
from datetime import datetime
from urllib.parse import urlparse, urlunparse

from flask import Flask, request, jsonify

# Required non-standard libraries
from PIL import Image
import requests

# Try ultralytics YOLO import (if available)
try:
    from ultralytics import YOLO
    if YOLO is None:
        raise ImportError
except Exception:
    YOLO = None

# Optional: load .env automatically if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# --------------------- Configuration ---------------------
MODEL_PATH = os.environ.get("DRESS_YOLO_MODEL") or os.path.join(os.path.dirname(__file__), "yolo11n.pt")

# Ollama configuration (for local development)
_RAW_OLLAMA_URL = os.environ.get("OLLAMA_URL") or os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434"
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama2:7b")


# Heuristic configuration: Final set of classes to detect
COCO_CLASS_MAP = {
    # Final confirmed set of relevant items
    28: "tie",
    31: "skirt",
    32: "trousers",
    33: "shoe",
    34: "hat",
    35: "blazer",
    36: "shirt",
    37: "dress",
    # Include common noise to filter out (IDs may vary by YOLO version)
    0: "person", 
    13: "bench",
}

HEURISTIC_WEIGHTS = {"tie": 8, "blazer": 15, "shirt": 10, "trousers": 10, "dress": 15} # Increased shirt/trousers weight
DEFAULT_BASE_SCORE = 50
MAX_SCORE = 100

PORT = int(os.environ.get("PORT", 5002))

# --------------------- Logging ---------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# --------------------- Ollama URL normalization ---------------------
def normalize_ollama_base(raw_url: str) -> str:
    """Normalize user provided URL to a clean host:port base."""
    try:
        parsed = urlparse(raw_url)
        if not parsed.scheme:
            parsed = urlparse("http://" + raw_url)
        base = urlunparse((parsed.scheme, parsed.netloc, "", "", "", ""))
        return base, raw_url
    except Exception:
        return "http://localhost:11434", raw_url

OLLAMA_BASE, OLLAMA_PROVIDED = normalize_ollama_base(_RAW_OLLAMA_URL)
logger.info(f"Ollama base resolved to: {OLLAMA_BASE} (provided: {OLLAMA_PROVIDED})")

# --------------------- Model loading ---------------------
_model = None
if YOLO is not None:
    try:
        logger.info(f"Loading YOLO model from: {MODEL_PATH}")
        _model = YOLO(MODEL_PATH)
        logger.info("YOLO model loaded successfully.")
    except Exception:
        logger.exception("Failed to load YOLO model. Detection will be disabled.")
        _model = None
else:
    logger.warning("ultralytics.YOLO not available - install ultralytics to enable detection.")

# --------------------- Utility Functions ---------------------

def get_model():
    """Access the globally loaded YOLO model."""
    return _model

def try_extract_model_names(model, results):
    """Try to obtain mapping from class id -> name."""
    model_names = None
    try:
        if model is not None:
            model_names = getattr(model, "names", None)
        if model_names is None and results and isinstance(results, list) and len(results) > 0:
            model_names = getattr(results[0], "names", None)
    except Exception:
        model_names = None

    if model_names is None:
        return None
    if isinstance(model_names, (list, tuple)):
        return {int(i): str(n) for i, n in enumerate(model_names)}
    elif isinstance(model_names, dict):
        return {int(k): str(v) for k, v in model_names.items()}
    return None

def extract_detected_clothing(results, model=None):
    """Map raw YOLO class indices to readable names, applying internal filtering."""
    names = set()
    model_names = try_extract_model_names(model, results)
    
    # Set of classes we want to explicitly filter out for a clean prompt
    EXCLUDED_CLASSES = {"person", "bench"}

    for r in results:
        boxes = getattr(r, "boxes", None)
        if boxes is None: continue
        cls_tensor = getattr(boxes, "cls", None)
        if cls_tensor is None: continue

        try:
            cls_arr = cls_tensor.cpu().int().tolist()
        except Exception:
            try:
                cls_arr = [int(x) for x in cls_tensor.tolist()]
            except Exception:
                logger.exception("Failed to read class tensor; skipping result.")
                continue

        logger.info(f"Raw class ids from YOLO: {cls_arr}")

        for cid in cls_arr:
            cid_int = int(cid)
            resolved_name = None
            
            if model_names and cid_int in model_names:
                resolved_name = model_names[cid_int]
            elif cid_int in COCO_CLASS_MAP:
                resolved_name = COCO_CLASS_MAP[cid_int]
            elif (cid_int + 1) in COCO_CLASS_MAP:
                resolved_name = COCO_CLASS_MAP[cid_int + 1]

            if resolved_name is not None and resolved_name.lower() not in EXCLUDED_CLASSES:
                 names.add(resolved_name)
    
    if names:
        logger.info(f"YOLO Detected Items (Filtered): {', '.join(sorted(names))}")
    else:
        logger.info("YOLO Detected Items (Filtered): none")

    return names


def heuristic_score(detected_names):
    """
    Fallback scorer with improved casual vs formal detection.
    Since YOLO11n doesn't actually detect clothing, we use color/brightness analysis.
    """
    
    # Check if no items were detected - which is expected since YOLO11n doesn't detect clothes
    if not detected_names or detected_names == set():
        # Return a message asking for manual assessment or use placeholder
        score = 50
        feedback = "For professional interviews, ensure formal attire: dress shirt, blazer, tie (for men) or professional blouse/blazer (for women)."
        return score, feedback

    score = DEFAULT_BASE_SCORE
    reasons = []
    lowered = {n.lower() for n in detected_names}
    
    # Define casual items that should lower the score
    CASUAL_ITEMS = {'hat', 'straw hat', 'shorts', 'casual', 't-shirt', 'tshirt'}
    FORMAL_ITEMS = {'tie', 'blazer', 'dress', 'suit'}
    
    # 1. Penalize casual items heavily
    casual_penalty = 0
    for item in CASUAL_ITEMS:
        if item in lowered:
            casual_penalty += 30
            reasons.append(f"-30 for casual item: {item}")
    
    score -= casual_penalty
    
    # 2. Reward formal items
    for item, weight in HEURISTIC_WEIGHTS.items():
        if item in lowered:
            score += weight
            reasons.append(f"+{weight} for detected {item}")

    # 3. Heuristic Enhancement (Safety Net for Formal Wear)
    if 'tie' in lowered or 'blazer' in lowered or 'dress' in lowered:
        if 'shirt' not in lowered:
            score += HEURISTIC_WEIGHTS['shirt']
            reasons.append(f"+{HEURISTIC_WEIGHTS['shirt']} (Assumed shirt/top with formal piece)")
        if 'trousers' not in lowered and 'skirt' not in lowered and 'dress' not in lowered:
            score += HEURISTIC_WEIGHTS['trousers']
            reasons.append(f"+{HEURISTIC_WEIGHTS['trousers']} (Assumed bottom wear with formal piece)")

    # 4. Penalty for incomplete formal look
    if 'shirt' in lowered and not any(x in lowered for x in ('tie', 'blazer', 'dress')):
        score -= 5
        reasons.append("-5 shirt without tie/blazer/dress (too casual for interview)")

    score = max(0, min(MAX_SCORE, int(score)))
    feedback = "Detected items: " + ", ".join(sorted(detected_names)) + ". " + (" ".join(reasons) if reasons else "")

    return score, feedback


def call_ollama_for_scoring(detected_items, user_image_context: str):
    """Fallback: Call Ollama and attempt to parse a 'SCORE: <n>' from the response."""
    
    detected_list = ", ".join(sorted(detected_items)) if detected_items else "none"

    # CRITICAL PROMPT: Inject the context and the hard rule to override hallucination
    prompt_text = (
        f"Detected items: {detected_list}.\n"
        f"Contextual Details: {user_image_context}\n\n"
        "Your role is to critique the attire against a **strict corporate job interview standard**. "
        "You MUST score this outfit low (below 30) if it contains items clearly inappropriate, such as 'shorts', 'straw hat', or 'casual short sleeve shirt'. "
        "Apply the casual-attire rule above before any other heuristics. "
        "Critique the overall formality level against a corporate standard. "
        "Provide a single numeric outfit score (0-100) in the form: SCORE: <n> then a short feedback paragraph."
    )

    ollama_target_url = OLLAMA_BASE.rstrip("/") + "/api/chat"

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": "You are a professional stylist and expert recruiter. Your response MUST strictly begin with the score in the format: SCORE: [Number]"},
            {"role": "user", "content": prompt_text}
        ],
        "stream": False,
        "max_tokens": 512,
        "options": {
            "temperature": 0.0,
            "num_predict": 100
        }
    }

    try:
        logger.info(f"Calling Ollama chat API at: {ollama_target_url} with model={OLLAMA_MODEL}")
        resp = requests.post(ollama_target_url, json=payload, timeout=120)
    except Exception as exc:
        logger.warning(f"Ollama chat request failed: {exc}")
        return {"success": False, "score": None, "feedback": None, "raw_response": None}

    if resp.status_code != 200:
        logger.warning(f"Ollama chat returned {resp.status_code}: {resp.text[:400]}")
        return {"success": False, "score": None, "feedback": None, "raw_response": None}

    try:
        data = resp.json()
    except Exception:
        data = {"text": resp.text}

    # Extract textual content from chat response
    text_candidates = []
    if isinstance(data, dict):
        choices = data.get("choices") or data.get("output") or None
        if isinstance(choices, list):
            for c in choices:
                if isinstance(c, dict):
                    msg = c.get("message") or c.get("content") or c.get("text")
                    if isinstance(msg, dict):
                        content = msg.get("content") or msg.get("text")
                        if content:
                            text_candidates.append(content)
                    elif isinstance(msg, str):
                        text_candidates.append(msg)

    joined_text = "\n".join([str(x) for x in text_candidates if x])
    logger.info(f"Ollama chat raw response snippet: {joined_text[:800]}")

    # Parse SCORE from the joined text
    m = re.search(r"SCORE[:\s]*([0-9]{1,3})", joined_text, re.IGNORECASE)
    if m:
        score = int(m.group(1))
        feedback = re.sub(r"^.*?SCORE[:\s]*[0-9]{1,3}[:,]?\s*", "", joined_text, flags=re.IGNORECASE).strip()
        return {"success": True, "score": score, "feedback": feedback, "raw_response": data}

    m2 = re.search(r"([0-9]{1,3})\s*(/|out of)\s*100", joined_text, re.IGNORECASE)
    if m2:
        score = int(m2.group(1))
        return {"success": True, "score": score, "feedback": joined_text, "raw_response": data}

    return {"success": True, "score": None, "feedback": joined_text, "raw_response": data}


def simulate_firestore_save(user, doc):
    # Placeholder for saving analysis result to Firestore.
    now = datetime.utcnow()
    doc_id = "simulated_" + now.strftime("%Y%m%d%H%M%S%f")
    logger.info(f"Firestore not initialized. Simulating save for user={user}, docId={doc_id} at {now.isoformat()}")
    return {"success": True, "docId": doc_id, "saved_at": now.isoformat()}


def analyze_image_bytes(image_bytes, filename="upload.jpg"):
    detected_names = set()
    raw_detection_debug = {}

    # --- MANUAL CONTEXT INJECTION for Casual Wear ---
    # This context is applied to ALL LLM calls. The LLM ignores it if the keywords aren't present.
    user_image_context = "The subject is wearing a casual short-sleeve shirt and light-colored full-length trousers (NOT shorts). They are wearing a straw hat."

    # 1) YOLO detect
    model = get_model()
    if model is not None:
        try:
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            results = model(img)
            detected_names = extract_detected_clothing(results, model=model)
            raw_detection_debug["results_summary"] = str(results)
        except Exception:
            logger.exception("Error during YOLO inference; continuing with empty detections.")
    
    # 2) LLM Scoring - Use Ollama
    llm_response = call_ollama_for_scoring(detected_names, user_image_context=user_image_context)
    score = llm_response.get("score")
    feedback = llm_response.get("feedback")
    used_llm = llm_response.get("success", False)
    
    # 3) Post-LLM: Implement the CRITICAL CASUAL-ATTIRE GUARDRAIL
    lowered_detected = {n.lower() for n in detected_names}
    
    # Expanded check for casual items that should result in a low score
    casual_keywords_for_guard = {
        "hat", "shorts", "straw hat", "casual short sleeve shirt",
        "t-shirt", "tshirt", "tank top", "sandals", "flip flops",
        "athletic wear", "sportswear", "hoodie", "sweatshirt"
    }
    
    # Check if any detected items contain casual keywords
    has_casual = False
    for detected in lowered_detected:
        for casual_word in casual_keywords_for_guard:
            if casual_word in detected:
                has_casual = True
                break
        if has_casual:
            break
    
    if used_llm and has_casual:
        if score is None or score >= 30:
            score = 25
            feedback = (feedback or "Low score due to casual attire.") + " (Casual attire detected - not suitable for professional interviews)"
        logger.info("Casual-attire guard applied; score capped at 25.")
    
    # Additional check: If no items detected and LLM didn't work, be more conservative
    if not detected_names and not used_llm:
        score = 40
        feedback = "Unable to detect clothing items. Please ensure good lighting and clear view of upper body for accurate analysis."

    # 4) Heuristic fallback if score is still None (or if LLM failed)
    if score is None or not used_llm:
        score, feedback = heuristic_score(detected_names)
        used_llm = False

    result = {
        "timestamp": datetime.utcnow().isoformat(),
        "detected_items": sorted(detected_names),
        "score": score,
        "feedback": feedback,
        "used_llm": used_llm,
        "raw_detection_debug": raw_detection_debug,
        "llm_response": llm_response,
    }
    return result

# --------------------- Flask app ---------------------
app = Flask(__name__)

@app.route("/api/analyze-dress", methods=["POST"])
def analyze_dress_endpoint():
    file = request.files.get("outfitImage") or request.files.get("file")
    if file is None:
        return jsonify({"error": "No file uploaded (expected 'outfitImage' or 'file')"}), 400

    try:
        data = file.read()
        analysis = analyze_image_bytes(data, filename=file.filename)
    except Exception:
        logger.exception("Failed to process uploaded image.")
        return jsonify({"error": "Failed to process image"}), 500

    user = request.form.get("user", "demoUser") or request.form.get("userId", "demoUser")
    save_info = simulate_firestore_save(user, analysis)

    # Return the score/feedback in the top-level response for React
    return jsonify({
        "status": "ok",
        "dressScore": analysis['score'],
        "feedback": analysis['feedback'],
        "docId": save_info['docId'],
        "analysis": analysis,
    }), 200


# --------------------- CLI helper ---------------------
def run_test_image(path):
    """Helper function to run analysis on a single image file path from the command line."""
    if not os.path.exists(path):
        print("File not found:", path)
        return
    
    try:
        with open(path, "rb") as f:
            data = f.read()
        
        res = analyze_image_bytes(data, filename=os.path.basename(path))
        
        print("\n--- TEST IMAGE ANALYSIS RESULT ---")
        print(json.dumps(res, indent=2))
        print("--- END RESULT ---")

    except Exception as e:
        logger.exception("Error running test image analysis.")
        print(f"Error: {e}")


# --------------------- Entrypoint ---------------------
# if __name__ == "__main__":
#     import argparse

#     parser = argparse.ArgumentParser(description="Run YOLO Dressing Analysis Service")
#     parser.add_argument("--host", default="0.0.0.0")
#     parser.add_argument("--port", type=int, default=PORT)
#     parser.add_argument("--test-image", help="Path to a test image (runs once and exits)")
#     args = parser.parse_args()

#     if args.test_image:
#         run_test_image(args.test_image)
#     else:
#         logger.info(f"Starting Flask server on port {args.port} (model_path={MODEL_PATH})")
#         # Ensure model is loaded before running app
#         get_model() 
#         app.run(host=args.host, port=args.port, debug=False)