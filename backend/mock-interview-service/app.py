import os
from flask import Flask, request, jsonify
import requests
import json
from flask_cors import CORS

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama2:7b")


app = Flask(__name__)
CORS(app)  # Enable CORS for all routes




@app.route("/interview", methods=["POST"])
def interview():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400
    job_position = data.get("job_position")
    difficulty = data.get("difficulty")
    messages = data.get("messages")
    if not job_position or not difficulty or not isinstance(messages, list):
        return jsonify({"error": "Missing or invalid fields: job_position, difficulty, messages (list) required."}), 400

    # Construct system/context message
    system_prompt = f"You are an AI interviewer for the position of {job_position} at {difficulty} level. Ask one question at a time, analyze answers, and provide feedback when appropriate."
    ollama_messages = [
        {"role": "system", "content": system_prompt}
    ] + messages

    payload = {
        "model": OLLAMA_MODEL,
        "messages": ollama_messages
    }
    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=300, stream=True)
        resp.raise_for_status()
        # Ollama streams JSON objects, one per line
        ai_message_content = ""
        for line in resp.iter_lines():
            if line:
                try:
                    obj = json.loads(line.decode('utf-8'))
                    if "message" in obj and "content" in obj["message"]:
                        ai_message_content += obj["message"]["content"]
                except Exception:
                    continue
        if not ai_message_content:
            return jsonify({"error": "No AI response from Ollama."}), 500
        return jsonify({"ai_message": {"role": "assistant", "content": ai_message_content}})
    except requests.RequestException as e:
        return jsonify({"error": f"Ollama server error: {str(e)}"}), 500
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

Respond in this JSON format:
{{
  "score": <score>,
  "positive_feedback": "<feedback>",
  "improvement": "<improvement>",
  "next_question": "<next_question>"
}}
"""

@app.route("/evaluate", methods=["POST"])
def evaluate():
    data = request.get_json()
    job_position = data.get("job_position")
    difficulty = data.get("difficulty")
    messages = data.get("messages", [])
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
        resp = requests.post(OLLAMA_URL, json=payload, timeout=300, stream=True)
        resp.raise_for_status()
        response_text = ""
        for line in resp.iter_lines():
            if line:
                try:
                    obj = json.loads(line.decode('utf-8'))
                    if "message" in obj and "content" in obj["message"]:
                        response_text += obj["message"]["content"]
                except Exception:
                    continue
        # Try to parse the response as JSON
        try:
            feedback = json.loads(response_text)
        except Exception:
            return jsonify({"error": "LLM did not return valid JSON.", "raw": response_text}), 500
        return jsonify(feedback)
    except requests.RequestException as e:
        return jsonify({"error": f"Ollama server error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500



if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
