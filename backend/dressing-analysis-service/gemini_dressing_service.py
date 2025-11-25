import os
import io
import logging
import json
import base64
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import google.generativeai as genai

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# --------------------- Configuration ---------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
PORT = int(os.environ.get("PORT", 5002))

# --------------------- Logging ---------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# --------------------- Initialize Gemini ---------------------
if not GEMINI_API_KEY:
    logger.error("❌ GEMINI_API_KEY not found in environment variables!")
    logger.error("   Please set GEMINI_API_KEY in your .env file")
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        logger.info("✅ Gemini API configured successfully")
    except Exception as e:
        logger.error(f"❌ Failed to configure Gemini API: {e}")

# --------------------- Flask App ---------------------
app = Flask(__name__)
CORS(app)

# --------------------- Dressing Analysis with Gemini ---------------------
def analyze_dressing_with_gemini(image: Image.Image, user_id: str = "demoUser"):
    """
    Analyze professional attire using Gemini Vision API.
    Returns score (0-100), feedback, and suggestions.
    """
    try:
        # Use Gemini 2.0 Flash - supports vision and text (verified available)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Detailed prompt for professional dressing analysis
        prompt = """You are an expert interview coach analyzing professional attire for job interviews.

Analyze this person's clothing and appearance for a professional job interview. Evaluate:

1. **Formality Level** (0-25 points):
   - Is the attire formal/business professional?
   - Appropriate for corporate interviews?
   - Score: Formal suit/blazer (20-25), Business casual (15-20), Casual (5-15), Too casual (0-10)

2. **Color Appropriateness** (0-25 points):
   - Professional colors (navy, black, grey, white, light blue)?
   - Avoid loud/bright colors for interviews
   - Score: Conservative professional colors (20-25), Acceptable colors (15-20), Questionable (5-15), Inappropriate (0-10)

3. **Grooming & Neatness** (0-25 points):
   - Clothing appears clean, pressed, well-fitted?
   - Professional appearance?
   - Score: Excellent (20-25), Good (15-20), Acceptable (10-15), Needs improvement (0-10)

4. **Overall Professional Impression** (0-25 points):
   - Would this attire make a good first impression in an interview?
   - Score: Excellent impression (20-25), Good (15-20), Acceptable (10-15), Poor (0-10)

Provide your response in this EXACT JSON format (no markdown, just valid JSON):
{
    "score": <total score 0-100>,
    "formality_score": <0-25>,
    "color_score": <0-25>,
    "grooming_score": <0-25>,
    "impression_score": <0-25>,
    "feedback": "<2-3 sentence summary of strengths>",
    "suggestions": [
        "<specific improvement suggestion 1>",
        "<specific improvement suggestion 2>",
        "<specific improvement suggestion 3 if needed>"
    ],
    "detected_items": ["<clothing item 1>", "<clothing item 2>", "..."]
}

Be encouraging but honest. Focus on constructive feedback."""

        # Generate content with image
        response = model.generate_content([prompt, image])
        
        # Parse response
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        # Parse JSON
        analysis = json.loads(response_text)
        
        logger.info(f"Gemini analysis complete - Score: {analysis.get('score', 0)}/100")
        
        return {
            "success": True,
            "score": analysis.get("score", 50),
            "formality_score": analysis.get("formality_score", 0),
            "color_score": analysis.get("color_score", 0),
            "grooming_score": analysis.get("grooming_score", 0),
            "impression_score": analysis.get("impression_score", 0),
            "feedback": analysis.get("feedback", "Analysis complete."),
            "suggestions": analysis.get("suggestions", []),
            "detected_items": analysis.get("detected_items", []),
            "timestamp": datetime.utcnow().isoformat(),
            "userId": user_id
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {e}")
        logger.error(f"Raw response: {response_text[:500]}")
        return {
            "success": False,
            "score": 50,
            "feedback": "Unable to analyze image properly. Please ensure clear visibility of your attire.",
            "suggestions": ["Try taking a clearer photo", "Ensure good lighting", "Show upper body clearly"],
            "detected_items": [],
            "error": "Response parsing error"
        }
    except Exception as e:
        logger.error(f"Gemini analysis error: {e}")
        return {
            "success": False,
            "score": 50,
            "feedback": "Analysis temporarily unavailable. Default neutral score applied.",
            "suggestions": ["Wear formal business attire", "Choose professional colors", "Ensure clothing is neat and pressed"],
            "detected_items": [],
            "error": str(e)
        }

# --------------------- API Endpoints ---------------------

@app.route('/analyze-dressing', methods=['POST'])
@app.route('/analyze-dress', methods=['POST'])  # Alternative endpoint for compatibility
def analyze_dressing():
    """
    Endpoint to analyze professional dressing using Gemini Vision API.
    Expects: multipart/form-data with 'image' file and optional 'userId'
    Returns: JSON with score, feedback, and suggestions
    """
    try:
        # Check if image is provided
        if 'image' not in request.files:
            return jsonify({
                "success": False,
                "error": "No image file provided",
                "score": 0
            }), 400
        
        file = request.files['image']
        user_id = request.form.get('userId', 'demoUser')
        
        if file.filename == '':
            return jsonify({
                "success": False,
                "error": "Empty filename",
                "score": 0
            }), 400
        
        # Read and validate image
        try:
            image_bytes = file.read()
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if needed
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            logger.info(f"Processing dressing analysis for user: {user_id}")
            
        except Exception as e:
            logger.error(f"Failed to read image: {e}")
            return jsonify({
                "success": False,
                "error": "Invalid image file",
                "score": 0
            }), 400
        
        # Check if Gemini is configured
        if not GEMINI_API_KEY:
            logger.warning("Gemini API key not configured - returning default response")
            return jsonify({
                "success": False,
                "score": 50,
                "feedback": "Service temporarily unavailable. Please configure GEMINI_API_KEY.",
                "suggestions": ["Wear formal business attire", "Choose professional colors"],
                "detected_items": [],
                "error": "API key not configured"
            }), 200
        
        # Analyze with Gemini
        result = analyze_dressing_with_gemini(image, user_id)
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.exception("Unexpected error in /analyze-dressing endpoint")
        return jsonify({
            "success": False,
            "error": str(e),
            "score": 50,
            "feedback": "An unexpected error occurred during analysis.",
            "suggestions": []
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    gemini_status = "configured" if GEMINI_API_KEY else "not configured"
    return jsonify({
        "status": "healthy",
        "service": "dressing-analysis-gemini",
        "gemini_api": gemini_status,
        "timestamp": datetime.utcnow().isoformat()
    }), 200

# --------------------- Main ---------------------
if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("Starting Dressing Analysis Service (Gemini Vision API)")
    logger.info("=" * 60)
    logger.info(f"Port: {PORT}")
    logger.info(f"Gemini API: {'✅ Configured' if GEMINI_API_KEY else '❌ Not Configured'}")
    logger.info("=" * 60)
    
    app.run(host='0.0.0.0', port=PORT, debug=False)
