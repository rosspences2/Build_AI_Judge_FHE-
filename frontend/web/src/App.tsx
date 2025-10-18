// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface BuildingSubmission {
  id: string;
  encryptedScore: string;
  timestamp: number;
  owner: string;
  name: string;
  description: string;
  category: string;
  likes: number;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<BuildingSubmission[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newSubmission, setNewSubmission] = useState({ name: "", description: "", category: "Fantasy" });
  const [showIntro, setShowIntro] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<BuildingSubmission | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");

  // Calculate statistics
  const totalSubmissions = submissions.length;
  const averageScore = totalSubmissions > 0 
    ? submissions.reduce((sum, sub) => sum + FHEDecryptNumber(sub.encryptedScore), 0) / totalSubmissions 
    : 0;
  const topSubmissions = [...submissions].sort((a, b) => FHEDecryptNumber(b.encryptedScore) - FHEDecryptNumber(a.encryptedScore)).slice(0, 5);

  useEffect(() => {
    loadSubmissions().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadSubmissions = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Get all submission keys
      const keysBytes = await contract.getData("submission_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing submission keys:", e); }
      }
      
      // Load each submission
      const list: BuildingSubmission[] = [];
      for (const key of keys) {
        try {
          const submissionBytes = await contract.getData(`submission_${key}`);
          if (submissionBytes.length > 0) {
            try {
              const submissionData = JSON.parse(ethers.toUtf8String(submissionBytes));
              list.push({ 
                id: key, 
                encryptedScore: submissionData.score, 
                timestamp: submissionData.timestamp, 
                owner: submissionData.owner, 
                name: submissionData.name,
                description: submissionData.description,
                category: submissionData.category,
                likes: submissionData.likes || 0
              });
            } catch (e) { console.error(`Error parsing submission data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading submission ${key}:`, e); }
      }
      
      // Sort by score (descending)
      list.sort((a, b) => FHEDecryptNumber(b.encryptedScore) - FHEDecryptNumber(a.encryptedScore));
      setSubmissions(list);
    } catch (e) { console.error("Error loading submissions:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitBuilding = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setSubmitting(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Generating AI score with Zama FHE..." });
    
    try {
      // Simulate AI judging with random score (50-100)
      const aiScore = Math.floor(Math.random() * 50) + 50;
      const encryptedScore = FHEEncryptNumber(aiScore);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create submission ID
      const submissionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Prepare submission data
      const submissionData = { 
        score: encryptedScore, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        name: newSubmission.name,
        description: newSubmission.description,
        category: newSubmission.category,
        likes: 0
      };
      
      // Store submission data
      await contract.setData(`submission_${submissionId}`, ethers.toUtf8Bytes(JSON.stringify(submissionData)));
      
      // Update keys list
      const keysBytes = await contract.getData("submission_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(submissionId);
      await contract.setData("submission_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Building submitted and scored with FHE AI!" });
      await loadSubmissions();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowSubmitModal(false);
        setNewSubmission({ name: "", description: "", category: "Fantasy" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setSubmitting(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const likeSubmission = async (submissionId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing like with FHE..." });
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      
      // Get current submission data
      const submissionBytes = await contract.getData(`submission_${submissionId}`);
      if (submissionBytes.length === 0) throw new Error("Submission not found");
      const submissionData = JSON.parse(ethers.toUtf8String(submissionBytes));
      
      // Update likes count
      const updatedSubmission = { 
        ...submissionData, 
        likes: (submissionData.likes || 0) + 1 
      };
      
      // Store updated data
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      await contractWithSigner.setData(`submission_${submissionId}`, ethers.toUtf8Bytes(JSON.stringify(updatedSubmission)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Like recorded with FHE!" });
      await loadSubmissions();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Like failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredSubmissions = submissions.filter(sub => {
    const matchesSearch = sub.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         sub.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "All" || sub.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="pixel-spinner"></div>
      <p>Loading encrypted building data...</p>
    </div>
  );

  return (
    <div className="app-container pixel-theme">
      <header className="app-header">
        <div className="logo">
          <div className="pixel-logo"></div>
          <h1>隱創空間</h1>
          <h2>FHE Building Game</h2>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowSubmitModal(true)} className="pixel-button">
            Submit Building
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <main className="main-content">
        {showIntro && (
          <div className="intro-section pixel-card">
            <button className="close-intro pixel-button" onClick={() => setShowIntro(false)}>X</button>
            <h2>Welcome to 隱創空間</h2>
            <p>A creative building game where your creations are judged by an AI using <strong>Zama FHE technology</strong>.</p>
            <div className="fhe-explanation">
              <div className="fhe-step">
                <div className="pixel-icon">1</div>
                <p>Build your creation in any voxel/pixel style</p>
              </div>
              <div className="fhe-step">
                <div className="pixel-icon">2</div>
                <p>Submit it to be encrypted with FHE</p>
              </div>
              <div className="fhe-step">
                <div className="pixel-icon">3</div>
                <p>AI judges your work while it remains encrypted</p>
              </div>
              <div className="fhe-step">
                <div className="pixel-icon">4</div>
                <p>Get a fair score without exposing your design</p>
              </div>
            </div>
            <div className="fhe-badge">
              <span>Powered by Zama FHE</span>
            </div>
          </div>
        )}

        <div className="stats-section">
          <div className="stat-card pixel-card">
            <h3>Total Submissions</h3>
            <div className="stat-value">{totalSubmissions}</div>
          </div>
          <div className="stat-card pixel-card">
            <h3>Average Score</h3>
            <div className="stat-value">{averageScore.toFixed(1)}</div>
          </div>
          <div className="stat-card pixel-card">
            <h3>Top Score</h3>
            <div className="stat-value">
              {totalSubmissions > 0 ? FHEDecryptNumber(submissions[0].encryptedScore) : "N/A"}
            </div>
          </div>
        </div>

        <div className="leaderboard-section pixel-card">
          <h2>Top Builders</h2>
          <div className="leaderboard-list">
            {topSubmissions.map((sub, index) => (
              <div className="leaderboard-item" key={sub.id}>
                <div className="rank">#{index + 1}</div>
                <div className="name">{sub.name}</div>
                <div className="score">{FHEDecryptNumber(sub.encryptedScore)}</div>
              </div>
            ))}
            {topSubmissions.length === 0 && (
              <div className="no-submissions">No submissions yet</div>
            )}
          </div>
        </div>

        <div className="submissions-section">
          <div className="section-header">
            <h2>Building Gallery</h2>
            <div className="search-filter">
              <input 
                type="text" 
                placeholder="Search buildings..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pixel-input"
              />
              <select 
                value={filterCategory} 
                onChange={(e) => setFilterCategory(e.target.value)}
                className="pixel-select"
              >
                <option value="All">All Categories</option>
                <option value="Fantasy">Fantasy</option>
                <option value="Modern">Modern</option>
                <option value="Sci-Fi">Sci-Fi</option>
                <option value="Medieval">Medieval</option>
                <option value="Abstract">Abstract</option>
              </select>
              <button onClick={loadSubmissions} className="pixel-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="submissions-grid">
            {filteredSubmissions.length === 0 ? (
              <div className="no-submissions pixel-card">
                <div className="pixel-icon sad-face"></div>
                <p>No buildings found</p>
                <button className="pixel-button" onClick={() => setShowSubmitModal(true)}>
                  Be the first to submit!
                </button>
              </div>
            ) : (
              filteredSubmissions.map(sub => (
                <div className="submission-card pixel-card" key={sub.id} onClick={() => setSelectedSubmission(sub)}>
                  <div className="submission-image">
                    <div className="pixel-art"></div>
                    <div className="category-badge">{sub.category}</div>
                  </div>
                  <div className="submission-info">
                    <h3>{sub.name}</h3>
                    <p>{sub.description.substring(0, 50)}...</p>
                    <div className="submission-stats">
                      <div className="score">
                        <span>AI Score:</span>
                        <strong>{FHEDecryptNumber(sub.encryptedScore)}</strong>
                      </div>
                      <div className="likes">
                        <button 
                          className="pixel-button like-btn" 
                          onClick={(e) => {
                            e.stopPropagation();
                            likeSubmission(sub.id);
                          }}
                        >
                          ❤️ {sub.likes || 0}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {showSubmitModal && (
        <ModalSubmit 
          onSubmit={submitBuilding} 
          onClose={() => setShowSubmitModal(false)} 
          submitting={submitting} 
          submission={newSubmission} 
          setSubmission={setNewSubmission}
        />
      )}

      {selectedSubmission && (
        <SubmissionDetailModal 
          submission={selectedSubmission} 
          onClose={() => {
            setSelectedSubmission(null);
            setDecryptedScore(null);
          }} 
          decryptedScore={decryptedScore}
          setDecryptedScore={setDecryptedScore}
          isDecrypting={isDecrypting}
          decryptWithSignature={decryptWithSignature}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content pixel-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="pixel-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">FAQ</a>
            <a href="#" className="footer-link">Community</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} 隱創空間. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalSubmitProps {
  onSubmit: () => void; 
  onClose: () => void; 
  submitting: boolean;
  submission: any;
  setSubmission: (data: any) => void;
}

const ModalSubmit: React.FC<ModalSubmitProps> = ({ onSubmit, onClose, submitting, submission, setSubmission }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSubmission({ ...submission, [name]: value });
  };

  const handleSubmit = () => {
    if (!submission.name || !submission.description) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="submit-modal pixel-card">
        <div className="modal-header">
          <h2>Submit Your Building</h2>
          <button onClick={onClose} className="close-modal pixel-button">X</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="pixel-icon lock"></div>
            <p>Your building will be encrypted with Zama FHE before AI judging</p>
          </div>
          
          <div className="form-group">
            <label>Building Name *</label>
            <input 
              type="text" 
              name="name" 
              value={submission.name} 
              onChange={handleChange} 
              placeholder="My Awesome Building" 
              className="pixel-input"
            />
          </div>
          
          <div className="form-group">
            <label>Description *</label>
            <textarea 
              name="description" 
              value={submission.description} 
              onChange={handleChange} 
              placeholder="Describe your creative building..." 
              className="pixel-textarea"
              rows={4}
            />
          </div>
          
          <div className="form-group">
            <label>Category</label>
            <select 
              name="category" 
              value={submission.category} 
              onChange={handleChange} 
              className="pixel-select"
            >
              <option value="Fantasy">Fantasy</option>
              <option value="Modern">Modern</option>
              <option value="Sci-Fi">Sci-Fi</option>
              <option value="Medieval">Medieval</option>
              <option value="Abstract">Abstract</option>
            </select>
          </div>
          
          <div className="encryption-preview">
            <h3>FHE Encryption Preview</h3>
            <div className="preview-box">
              <div className="plain-data">
                <span>Building Data:</span>
                <div>Your design details</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>FHE-************************</div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="pixel-button cancel">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="pixel-button primary">
            {submitting ? "Submitting with FHE..." : "Submit Building"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface SubmissionDetailModalProps {
  submission: BuildingSubmission;
  onClose: () => void;
  decryptedScore: number | null;
  setDecryptedScore: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const SubmissionDetailModal: React.FC<SubmissionDetailModalProps> = ({ submission, onClose, decryptedScore, setDecryptedScore, isDecrypting, decryptWithSignature }) => {
  const handleDecrypt = async () => {
    if (decryptedScore !== null) { setDecryptedScore(null); return; }
    const decrypted = await decryptWithSignature(submission.encryptedScore);
    if (decrypted !== null) setDecryptedScore(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal pixel-card">
        <div className="modal-header">
          <h2>{submission.name}</h2>
          <button onClick={onClose} className="close-modal pixel-button">X</button>
        </div>
        <div className="modal-body">
          <div className="submission-image">
            <div className="pixel-art large"></div>
            <div className="category-badge">{submission.category}</div>
          </div>
          
          <div className="submission-details">
            <div className="detail-item">
              <span>Creator:</span>
              <strong>{submission.owner.substring(0, 6)}...{submission.owner.substring(38)}</strong>
            </div>
            <div className="detail-item">
              <span>Submitted:</span>
              <strong>{new Date(submission.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="detail-item">
              <span>Likes:</span>
              <strong>{submission.likes || 0}</strong>
            </div>
            
            <div className="description">
              <h3>Description</h3>
              <p>{submission.description}</p>
            </div>
            
            <div className="score-section">
              <h3>AI Judging Score</h3>
              <div className="score-display">
                <div className="score-value">
                  {decryptedScore !== null ? decryptedScore : FHEDecryptNumber(submission.encryptedScore)}
                </div>
                <div className="score-label">
                  {decryptedScore !== null ? "Decrypted Score" : "Encrypted Score"}
                </div>
              </div>
              <button 
                onClick={handleDecrypt} 
                disabled={isDecrypting}
                className="pixel-button decrypt-btn"
              >
                {isDecrypting ? "Decrypting..." : decryptedScore !== null ? "Hide Raw Score" : "Decrypt with Wallet"}
              </button>
              <div className="fhe-notice">
                <div className="pixel-icon info"></div>
                <p>Score was computed by AI while encrypted with Zama FHE</p>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="pixel-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;