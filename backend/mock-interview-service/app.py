# app.py - FULL CORRECTED CODE (Final JSON Stability Fix)
import os
import json
import argparse
import logging
import traceback
import re
from datetime import datetime
from typing import Optional, Tuple
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS

# Google GenAI SDK
import google.generativeai as genai
from google.generativeai import types

# Load .env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Config
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")
GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL_NAME", "gemini-2.5-flash-lite")


# Configure API key for google-generativeai
genai.configure(api_key=GEMINI_API_KEY)

# Create model instance
model = genai.GenerativeModel(GEMINI_MODEL_NAME)

# Flask
app = Flask(__name__)
# 🌟 Ensure CORS handles all interview routes correctly
CORS(app, resources={r"/api/interview/*": {"origins": "*"}}, supports_credentials=True) 
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


# ---------------- Helpers (Code remains unchanged except fallback) ----------------

def _strip_code_fence(text: Optional[str]) -> Optional[str]:
    if not text:
        return text
    s = text.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*```$", "", s, flags=re.IGNORECASE)
    return s.strip()

def _attempt_repair_json(s: str, min_length: int = 20, max_iters: int = 1200) -> Tuple[Optional[dict], str]:
    if not s or len(s) < min_length:
        return None, s
    trimmed = s.strip()
    start = trimmed.find("{")
    if start != -1:
        trimmed = trimmed[start:]
    iters = 0
    while iters < max_iters and len(trimmed) >= min_length:
        try:
            obj = json.loads(trimmed)
            if isinstance(obj, dict):
                return obj, trimmed
            return None, trimmed
        except Exception:
            trimmed = trimmed[:-1]
            iters += 1
    return None, trimmed

def _extract_text_from_response(resp) -> Tuple[str, object]:
    """Robustly extracts text, handling finish_reason and ensuring a fallback."""
    
    # 🌟 FIX: Updated fallback text to remove the "I encountered an issue" error message.
    fallback_text = "Hello, let's begin your interview. To start, please tell me about your most challenging project."

    if not hasattr(resp, 'candidates') or not resp.candidates:
        logger.warning("Response returned no candidates. Using fallback.")
        return fallback_text, resp
    
    candidate = resp.candidates[0]
    
    if candidate.finish_reason.name in ["SAFETY", "RECITATION", "REJECTED", "OTHER", "STOP"]:
        reason = candidate.finish_reason.name
        logger.warning(f"Response blocked by finish_reason: {reason} ({candidate.finish_reason.value}). Status: {candidate.safety_ratings}. Using fallback.")
        # If the reason is not a normal STOP, return the fallback text
        if reason != "STOP":
            return fallback_text, resp
        
    try:
        # Standard way: access text property
        raw = resp.text
        if raw and isinstance(raw, str) and raw.strip():
            return raw, resp
    except Exception as e:
        # The Invalid operation warning happens here.
        logger.warning(f"Failed to get text via resp.text: {e}. Attempting direct part extraction.")
        
    # Manual way: traverse parts
    if hasattr(candidate, 'content') and candidate.content:
        for part in candidate.content.parts:
            if hasattr(part, 'text') and part.text:
                return part.text, resp

    logger.warning("Failed to extract any text from response parts. Using fallback.")
    return fallback_text, resp

def _summarize_history_2bullets(history_text: str) -> str:
    if not history_text or not history_text.strip():
        return "No prior history."
    
    if len(history_text) < 150:
        return history_text[:100]
    
    prompt = (
        f"Compress this interview into 2 bullets (max 10 words each):\n"
        f"{history_text[:800]}\n"
        "Bullets:"
    )
    
    try:
        resp = model.generate_content(
            prompt,
            generation_config=types.GenerationConfig(temperature=0.0, max_output_tokens=80)
        )
        raw, _ = _extract_text_from_response(resp)
        summary = _strip_code_fence(raw) or "No prior history."
        if len(summary) > 100:
            summary = summary[:97] + "..."
        logger.info(f"History summary: {summary} (reduced from {len(history_text)} chars)")
        return summary
    except Exception as e:
        logger.exception("summarize failed: %s", str(e))
        return history_text[:80] + "..."

def is_ai_question(msg):
    if msg.get("role") != "assistant":
        return False
    content = msg.get("content", "").strip()
    if any(k in content.lower() for k in ["score:", "positive:", "improvement:", "interview is now complete"]):
        return False
    if content:
        return True
    return False


# ---------------- Endpoints ----------------

# 🌟 FIX: Add the missing /api/interview/history endpoint (as a placeholder)
@app.route("/api/interview/history", methods=["GET", "OPTIONS"])
def get_history_placeholder():
    if request.method == "OPTIONS":
        return '', 200
    
    # The actual history retrieval is done by the Node.js proxy to query Firestore.
    # This endpoint exists to prevent a CORS or 404 error if the frontend (or proxy) 
    # hits the Flask port directly, but it provides no data.
    logger.info("Received GET request for history. Returning empty list.")
    return jsonify([])


@app.route("/api/interview/start", methods=["POST", "OPTIONS"])
def start_interview():
    if request.method == "OPTIONS":
        return '', 200
    
    data = request.get_json() or {}
    category = data.get("category")
    job_position = data.get("job_position") or data.get("position") or "General"
    difficulty = data.get("difficulty", "Beginner")
    user_id = data.get("userId", "anon")
    session_id = data.get("sessionId") or f"mock_sess_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    prompt = (
        f"You are an AI interviewer for a {job_position} ({difficulty} level) role in {category}. "
        "Ask one concise, relevant interview question. Do not provide a general opening statement or ask about experience."
    )
    
    # 🌟 FIX: Use the generic fallback set in the helper function
    fallback = "Hello, let's begin your interview. To start, please tell me about your most challenging project."

    try:
        resp = model.generate_content(
            prompt,
            generation_config=types.GenerationConfig(temperature=0.55, max_output_tokens=220) 
        )
        text, _ = _extract_text_from_response(resp)
        if not text or not text.strip():
            text = fallback
        return jsonify({"ai_message": {"role": "assistant", "content": text}, "sessionId": session_id})
    except Exception as e:
        tb = traceback.format_exc()
        logger.exception("start_interview error: %s", str(e))
        return jsonify({
            "error": "Failed to generate initial question.", 
            "stack": tb[:1200], 
            "ai_message": {"role": "assistant", "content": fallback}
        }), 500


@app.route("/api/interview/evaluate", methods=["POST", "OPTIONS"])
def evaluate():
    if request.method == "OPTIONS":
        return '', 200
    
    data = request.get_json() or {}
    category = data.get("category")
    job_position = data.get("job_position") or data.get("position")
    difficulty = data.get("difficulty")
    messages = data.get("messages", [])
    num_questions = data.get("num_questions", 5)
    session_id = data.get("sessionId", "unknown")

    if not job_position or not difficulty or not messages:
        return jsonify({"error": "Missing required fields."}), 400

    last_ai = next((m for m in messages[::-1] if m.get("role") == "assistant"), None)
    last_user = next((m for m in messages[::-1] if m.get("role") == "user"), None)
    if not last_ai or not last_user:
        return jsonify({"error": "Need at least one AI question and one user answer."}), 400

    user_answer = last_user.get("content", "") or ""

    questions_asked = len([m for m in messages if is_ai_question(m)])
    
    if questions_asked >= num_questions:
        final_message_override = "The interview is now complete. Thank you for participating! You can review your feedback above."
    else:
        final_message_override = None

    ai_patterns = [r"\bchatgpt\b", r"\bgpt-?\d?\b", r"\bopenai\b", r"generated by", r"as chatgpt", r"assistant said", r"chat gpt"]
    for pat in ai_patterns:
        if re.search(pat, user_answer, flags=re.IGNORECASE):
            logger.info("Detected likely AI-pasted answer; short-circuiting evaluation.")
            return jsonify({
                "score": 0,
                "positive_feedback": "",
                "improvement": "It appears your answer includes AI-generated content. Please respond in your own words so we can evaluate your thinking.",
                "next_question": f"Please re-answer in your own words: {last_ai.get('content')}"
            })

    # summarize history
    conversation_history = [m for m in messages if m.get("role") in ["user", "assistant"]]
    history_text = "\n".join([f"{m.get('role')}: {m.get('content')}" for m in conversation_history])
    try:
        summary = _summarize_history_2bullets(history_text)
    except Exception:
        summary = "No prior history."

    if final_message_override:
         next_q_instruction = "Do NOT provide a next question. The interview is over. Set the 'next_question' key to: '" + final_message_override + "'"
    else:
        next_q_instruction = "Provide the next interview question relevant to the role."
    
    eval_prompt = (
        f"Role: {job_position} (category: {category}) Difficulty: {difficulty}\n"
        "Provide ONLY a JSON object with keys: score (0-10), positive_feedback, improvement, next_question.\n"
        "NO extra text outside JSON. Be concise but insightful in your feedback.\n\n"
        f"Summary of conversation so far:\n{summary}\n\n"
        f"Question:\n{last_ai.get('content')}\n\n"
        f"Answer:\n{user_answer}\n\n"
        f"Next Action: {next_q_instruction}"
    )

    def call_eval(max_tokens: int):
        try:
            resp = model.generate_content(
                eval_prompt,
                generation_config=types.GenerationConfig(temperature=0.0, max_output_tokens=max_tokens) 
            )
            raw, full = _extract_text_from_response(resp)
            try:
                usage = getattr(resp, "usage_metadata", None) or getattr(resp, "usage", None)
                logger.info("Eval usage metadata: %s", str(usage))
            except Exception:
                pass
            return (raw or "").strip(), full
        except Exception as e:
            logger.exception("Error in call_eval: %s", str(e))
            return "", None

    try:
        raw_text, full_resp = call_eval(1200)
        if not raw_text:
            raw_text, full_resp = call_eval(2048)
        if not raw_text:
            logger.warning("Evaluation returned empty after retry")
            return jsonify({"error": "AI did not return valid JSON evaluation."}), 500

        cleaned = raw_text.strip()
        logger.info("Raw response length: %d. First 200 chars: %s", len(raw_text), raw_text[:200])
        
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        cleaned = re.sub(r'\s*```\s*$', '', cleaned, flags=re.MULTILINE)
        cleaned = cleaned.strip()
        
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        
        # 🌟 CRITICAL FIX: Aggressively repair JSON by checking for unbalanced braces
        if start == -1 or end == -1 or end <= start:
            logger.warning("No JSON block found. Cleaned: %s", cleaned[:500])
            return jsonify({"error": "AI did not return JSON.", "raw_text_preview": raw_text[:800]}), 500

        block = cleaned[start:end+1]
        logger.info("Extracted block length: %d", len(block))

        opens = block.count("{")
        closes = block.count("}")
        
        # If braces are unbalanced and the block ends abruptly, try to close it.
        if closes < opens:
             # Look for the last comma before the abrupt end and assume the field is incomplete
             last_comma = block.rfind(',')
             if last_comma > -1:
                 block = block[:last_comma] + '}'
                 
             # Fallback: just add closing braces
             else:
                 block = block + ("}" * (opens - closes))
                 
             logger.info("Aggressive JSON repair applied. New block length: %d", len(block))


        try:
            parsed = json.loads(block)
        except Exception as parse_error:
            logger.info("Final JSON parse failed even after repair. Error: %s", str(parse_error))
            return jsonify({"error": "JSON parsing failed.", "raw_text_preview": raw_text[:800]}), 500

        feedback = {
            "score": int(parsed.get("score", 0)),
            "positive_feedback": parsed.get("positive_feedback", "") or parsed.get("positives", ""),
            "improvement": parsed.get("improvement", "") or parsed.get("areas_for_improvement", ""),
            "next_question": parsed.get("next_question", "") or parsed.get("nextQuestion", "") or f"What else can you tell me about your experience with {job_position}?"
        }
        
        if final_message_override:
            feedback["next_question"] = final_message_override

        return jsonify(feedback)

    except Exception as exc:
        tb = traceback.format_exc()
        logger.exception("Unexpected error in evaluate: %s\n%s", str(exc), tb)
        return jsonify({"error": f"Internal server error: {str(exc)}"}), 500


# Entrypoint
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mock Interview Flask Service (categorized roles)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 5004)), help="Port to run the service on.")
    args = parser.parse_args()
    logger.info("Starting mock interview service on port %s", args.port)
    app.run(host="0.0.0.0", port="5004", debug=True)