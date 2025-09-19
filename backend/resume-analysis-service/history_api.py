from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
from google.cloud import firestore

load_dotenv()

app = Flask(__name__)
CORS(app)
db = firestore.Client()

@app.route('/resume/history/delete', methods=['POST'])
def delete_resume_history():
    user_id = request.json.get('userId', None)
    doc_id = request.json.get('docId', None)
    if not user_id or not doc_id:
        return jsonify({'error': 'Missing userId or docId'}), 400
    try:
        doc_ref = db.collection('resume_analysis').document(doc_id)
        doc = doc_ref.get()
        if not doc.exists:
            return jsonify({'error': 'Document not found'}), 404
        data = doc.to_dict()
        if data.get('userId') != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        doc_ref.delete()
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error deleting history: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/resume/history', methods=['GET'])
def get_resume_history():
    user_id = request.args.get('userId', 'demoUser')
    try:
        docs = db.collection('resume_analysis').where('userId', '==', user_id).order_by('timestamp', direction=firestore.Query.DESCENDING).stream()
        history = []
        for doc in docs:
            data = doc.to_dict()
            history.append({
                'docId': doc.id,
                'timestamp': data.get('timestamp').isoformat() if data.get('timestamp') else '',
                'score': data.get('score'),
                'similarity_with_jd': data.get('similarity_with_jd'),
                'ats_score': data.get('ats_score')
            })
        print(f"History API: Returned {len(history)} records for userId={user_id}")
        return jsonify(history)
    except Exception as e:
        print(f"Error fetching resume history: {e}")
        return jsonify({'error': 'Failed to fetch history'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8001)