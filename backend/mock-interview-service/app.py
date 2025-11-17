import os
from flask import Flask, request, jsonify
import requests
import json
from flask_cors import CORS
import argparse
from datetime import datetime # <-- FIX: Explicitly import datetime class

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama2:7b")


app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# --- Interview Logic Routes ---

@app.route("/interview/start", methods=["POST"])
def start_interview():
    # This route must exist to handle the initial setup request from the client
    data = request.get_json()
    job_position = data.get("job_position")
    difficulty = data.get("difficulty")
    user_id = data.get("userId") # Passed for history logging

    # Generate the initial system message and the first question
    system_prompt = (
        f"You are an AI interviewer for the position of {job_position} at {difficulty} level. "
        "Your first message should be a brief greeting and the first technical question relevant to the role. "
        "Ask only one question at a time. Do not provide feedback in this first message."
    )
    ollama_messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Please start the interview now for {job_position} at {difficulty} level."}
    ]

    payload = {
        "model": OLLAMA_MODEL,
        "messages": ollama_messages
    }
    
    # --- Ollama API Call (Simpler structure for starting convo) ---
    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=300)
        resp.raise_for_status()
        # Non-streaming response expected for start message
        response_data = resp.json()
        ai_message_content = response_data['message']['content']
        
        # NOTE: In a real app, you would log the session start to Firestore and get a real ID.
        # FIX: Use imported datetime class to generate session ID
        session_id = f"mock_sess_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        return jsonify({
            "ai_message": {"role": "assistant", "content": ai_message_content},
            "sessionId": session_id # Return a temporary ID
        })
    except requests.RequestException as e:
        return jsonify({"error": f"Ollama server error (Start Interview): {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


def build_evaluation_prompt(question, answer, history, job_position, difficulty):
    return f"""
You are an expert technical interviewer for the position of {job_position} at {difficulty} level.
Evaluate the following candidate answer to the interview question below.

Question: {question}
Candidate's Answer: {answer}

Conversation History (for context): {history}

Provide:
- A score out of 10 for the answer (as 'score')
- Positive feedback (as 'positive_feedback')
- Areas for improvement (as 'improvement')
- The next interview question (as 'next_question')

Respond strictly in this JSON format:
{{
  "score": <score>,
  "positive_feedback": "<feedback>",
  "improvement": "<improvement>",
  "next_question": "<next_question>"
}}
"""

@app.route("/interview/evaluate", methods=["POST"])
def evaluate():
    data = request.get_json()
    job_position = data.get("job_position")
    difficulty = data.get("difficulty")
    messages = data.get("messages", [])
    session_id = data.get("sessionId")
    if not job_position or not difficulty or not messages:
        return jsonify({"error": "Missing required fields."}), 400

    # Find the last AI question and last user answer
    last_ai = next((m for m in reversed(messages) if m["role"] == "assistant"), None)
    last_user = next((m for m in reversed(messages) if m["role"] == "user"), None)
    if not last_ai or not last_user:
        return jsonify({"error": "Need at least one AI question and one user answer."}), 400

    # Build prompt
    history_str = "\n".join([f"{m['role']}: {m['content']}" for m in messages[:-2]])
    prompt = build_evaluation_prompt(
        last_ai["content"],
        last_user["content"],
        history_str,
        job_position,
        difficulty
    )
    
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": prompt}
        ]
    }
    
    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=300) # Use the non-streaming endpoint for evaluation
        resp.raise_for_status()
        response_text = resp.json()['message']['content']
        
        # Try to parse the response as JSON
        try:
            feedback = json.loads(response_text)
        except Exception:
            return jsonify({"error": "LLM did not return valid JSON.", "raw": response_text}), 500
            
        # NOTE: In a real app, you would save this question/answer pair to Firestore here.

        return jsonify(feedback)
    except requests.RequestException as e:
        return jsonify({"error": f"Ollama server error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


# --- Entrypoint with Port Argument Handling ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mock Interview Flask Service")
    parser.add_argument("--port", type=int, default=5001, help="Port to run the service on.")
    args = parser.parse_args()

    app.run(host="0.0.0.0", port=args.port, debug=True)