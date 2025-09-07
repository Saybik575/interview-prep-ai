import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Modal, Button } from "react-bootstrap";

const ResumeAnalysisPage = () => {
  const [jdText, setJdText] = useState("");
  const [file, setFile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const fileInputRef = useRef();
  const navigate = useNavigate();

  // Replace with actual userId from auth context
  const userId = "demoUser";

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`/api/resume/history?userId=${userId}`);
      setHistory(response.data);
    } catch (err) {
      console.error("Failed to fetch resume history", err);
      setHistory([]);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !jdText) {
      alert("Please provide both Job Description and Resume file.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("job_description", jdText);
    formData.append("userId", userId);

    try {
      const res = await axios.post("/api/resume", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setAnalysisResult(res.data);
      fetchHistory(); // Refresh history after new analysis
    } catch (err) {
      console.error("Error analyzing resume:", err);
      setAnalysisResult({ error: "Resume analysis failed." });
    }
    setLoading(false);
  };
  
  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const payload = { userId, docId: itemToDelete.docId };
      await axios.post("/api/resume/history/delete", payload);

      // Optimistically remove the item from local state
      setHistory((prevHistory) =>
        prevHistory.filter((item) => item.docId !== itemToDelete.docId)
      );
      alert("History entry deleted successfully.");
    } catch (err) {
      console.error("Failed to delete history entry:", err);
      alert("Failed to delete history entry.");
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };

  const getSuggestions = () => {
    if (!analysisResult) return [];
    const suggestions = [];
    if (analysisResult.grammar_issues?.length) {
      suggestions.push("Fix grammar and spelling issues.");
    }
    if (analysisResult.missing_keywords?.length) {
      suggestions.push("Add missing keywords to better match the job description.");
    }
    if ((analysisResult.ats_score || 0) < 70) {
      suggestions.push("Improve ATS score: optimize formatting and add measurable achievements.");
    }
    if ((analysisResult.similarity_with_jd || 0) < 50) {
      suggestions.push("Tailor your resume more closely to the job description.");
    }
    return suggestions;
  };

  // helper to clamp percent values to 0-100
  const clamp = (val) => {
    const n = Number(val) || 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg p-8">
        <button
          onClick={() => navigate("/dashboard")}
          className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Back to Dashboard
        </button>
        <h2 className="text-2xl font-bold mb-4">Resume Analysis</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            className="w-full p-2 border rounded"
            rows={4}
            placeholder="Paste Job Description here..."
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
          />
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files[0])}
            className="block"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            disabled={loading}
          >
            {loading ? "Analyzing..." : "Analyze Resume"}
          </button>
        </form>

        {analysisResult && !analysisResult.error && (
          <div className="mt-8 space-y-6">
            {/* Skills */}
            <div className="bg-gray-100 p-4 rounded shadow">
              <h3 className="font-semibold mb-2">Skills Found:</h3>
              <div className="flex flex-wrap gap-2">
                {(analysisResult.skills_found || []).length > 0 ? (
                  analysisResult.skills_found.map((skill) => (
                    <span
                      key={skill}
                      className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">No skills detected</span>
                )}
              </div>
            </div>

            {/* Scores */}
            <div className="flex gap-4">
              <div className="bg-gray-100 p-4 rounded shadow flex-1">
                <h3 className="font-semibold mb-2">Score</h3>
                <div className="text-2xl font-bold">
                  {`${clamp(analysisResult.score ?? 0)}/100`}
                </div>
              </div>
              <div className="bg-gray-100 p-4 rounded shadow flex-1">
                <h3 className="font-semibold mb-2">Similarity with JD</h3>
                <div className="flex items-center gap-2">
                  <div className="w-full bg-gray-300 rounded h-4">
                    <div
                      className="bg-green-500 h-4 rounded"
                      style={{
                        width: `${clamp(analysisResult.similarity_with_jd || 0)}%`,
                      }}
                    ></div>
                  </div>
                  <span className="ml-2 font-bold">
                    {clamp(analysisResult.similarity_with_jd || 0)}%
                  </span>
                </div>
              </div>
              <div className="bg-gray-100 p-4 rounded shadow flex-1">
                <h3 className="font-semibold mb-2">ATS Score</h3>
                <div className="flex items-center gap-2">
                  <div className="w-full bg-gray-300 rounded h-4">
                    <div
                      className="bg-yellow-500 h-4 rounded"
                      style={{
                        width: `${clamp(analysisResult.ats_score || 0)}%`,
                      }}
                    ></div>
                  </div>
                  <span className="ml-2 font-bold">
                    {clamp(analysisResult.ats_score || 0)}%
                  </span>
                </div>
              </div>
            </div>


            {/* Missing keywords */}
            <div className="bg-gray-100 p-4 rounded shadow">
              <h3 className="font-semibold mb-2">Missing Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {analysisResult.missing_keywords?.length ? (
                  analysisResult.missing_keywords.map((kw) => (
                    <span
                      key={kw}
                      className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-sm"
                    >
                      {kw}
                    </span>
                  ))
                ) : (
                  <span className="text-green-600">No missing keywords!</span>
                )}
              </div>
            </div>

            {/* Suggestions */}
            <div className="bg-gray-100 p-4 rounded shadow">
              <h3 className="font-semibold mb-2">Suggestions to Improve Resume</h3>
              <ul className="list-disc ml-6">
                {getSuggestions().length ? (
                  getSuggestions().map((s, idx) => <li key={idx}>{s}</li>)
                ) : (
                  <li>No suggestions. Great job!</li>
                )}
              </ul>
            </div>

            {/* Preview */}
            <div className="bg-gray-100 p-4 rounded shadow">
              <button
                onClick={() => setPreviewOpen((v) => !v)}
                className="mb-2 px-3 py-1 bg-gray-300 rounded"
              >
                {previewOpen ? "Hide" : "Show"} Resume Preview
              </button>
              {previewOpen && (
                <pre className="whitespace-pre-wrap text-sm bg-white p-2 rounded border max-h-96 overflow-auto">
                  {analysisResult.text_preview}
                </pre>
              )}
            </div>
          </div>
        )}

        {analysisResult?.error && (
          <div className="mt-6 text-red-600">{analysisResult.error}</div>
        )}

        {/* History */}
        <div className="mt-12">
          <h3 className="text-xl font-bold mb-4">History</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded shadow">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b">Date</th>
                  <th className="py-2 px-4 border-b">Score</th>
                  <th className="py-2 px-4 border-b">Similarity</th>
                  <th className="py-2 px-4 border-b">ATS Score</th>
                  <th className="py-2 px-4 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.length ? (
                  history.map((h, idx) => (
                    <tr key={h.docId}>
                      <td className="py-2 px-4 border-b">
                        {new Date(h.timestamp?._seconds * 1000).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 border-b">{clamp(h.score)}</td>
                      <td className="py-2 px-4 border-b">
                        {clamp(h.similarity_with_jd)}%
                      </td>
                      <td className="py-2 px-4 border-b">
                        {clamp(h.ats_score)}%
                      </td>
                      <td className="py-2 px-4 border-b">
                        <button
                          onClick={() => handleDeleteClick(h)}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-2 px-4">
                      No history found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
       <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Deletion</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this history entry? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ResumeAnalysisPage;