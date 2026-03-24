import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { Save, RefreshCw, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

const SENSITIVE_KEYS = ['PASSWORD', 'SECRET', 'API_KEY', 'TOKEN', 'CREDENTIALS'];

export default function Settings() {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [isRestarting, setIsRestarting] = useState(false);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getSettings();
      setFormData({ ...data.envVars });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const isSensitiveKey = (key: string): boolean => {
    return SENSITIVE_KEYS.some(sensitive => key.toUpperCase().includes(sensitive));
  };

  const toggleKeyVisibility = (key: string) => {
    const newVisible = new Set(visibleKeys);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleKeys(newVisible);
  };

  const handleAddNewKey = () => {
    if (!newKeyName.trim()) {
      setError('Key name is required');
      return;
    }
    if (!newKeyValue.trim()) {
      setError('Key value is required');
      return;
    }
    
    // Check if key already exists
    if (newKeyName in formData) {
      setError('This key already exists');
      return;
    }

    setFormData({
      ...formData,
      [newKeyName]: newKeyValue,
    });
    setNewKeyName('');
    setNewKeyValue('');
  };

  const handleRemoveKey = (key: string) => {
    if (confirmRemoveKey === key) {
      const newData = { ...formData };
      delete newData[key];
      setFormData(newData);
      setConfirmRemoveKey(null);
    } else {
      setConfirmRemoveKey(key);
    }
  };

  const handleRestart = async () => {
    if (!confirmRestart) {
      setConfirmRestart(true);
      return;
    }

    try {
      setIsRestarting(true);
      setError('');
      setConfirmRestart(false);
      const response = await apiClient.restartBackend();
      setSuccessMessage(response.message || 'Restart command sent successfully. The server should restart shortly.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to restart backend');
    } finally {
      setIsRestarting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      await apiClient.updateSettings(formData);
      setSuccessMessage('Settings updated successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage environment variables and configuration</p>
        </div>
        <button onClick={loadSettings} className="secondary-button" disabled={isLoading}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {successMessage && <div className="success-banner">{successMessage}</div>}

      <form onSubmit={handleSubmit} className="settings-form">
        <div className="settings-section">
          <h2 className="section-title">Environment Variables</h2>
          <p className="section-help">
            Modify environment variables stored in the .env file. Changes will take effect on the next application restart.
          </p>

          <div className="env-vars-list">
            {Object.entries(formData)
              .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
              .map(([key, value]) => {
              const sensitive = isSensitiveKey(key);
              const isVisible = visibleKeys.has(key);

              return (
                <div key={key} className="env-var-item">
                  <div className="env-var-name">{key}</div>
                  <div className="env-var-input-group">
                    <input
                      type={sensitive && !isVisible ? 'password' : 'text'}
                      value={value}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [key]: e.target.value,
                        })
                      }
                      className="env-var-input"
                      placeholder="Enter value..."
                    />
                    {sensitive && (
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(key)}
                        className="visibility-toggle"
                        title={isVisible ? 'Hide' : 'Show'}
                      >
                        {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    )}
                    {confirmRemoveKey === key ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Delete?</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveKey(key)}
                          className="remove-button"
                          title="Confirm delete"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveKey(null)}
                          className="visibility-toggle"
                          title="Cancel"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemoveKey(key)}
                        className="remove-button"
                        title="Remove this variable"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {Object.keys(formData).length === 0 && (
              <div className="empty-vars">
                <p>No environment variables defined yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="settings-section">
          <h2 className="section-title">Add New Variable</h2>
          <div className="new-var-form">
            <input
              type="text"
              placeholder="Variable name (e.g., API_KEY)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="form-input"
            />
            <input
              type="text"
              placeholder="Variable value"
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              className="form-input"
            />
            <button
              type="button"
              onClick={handleAddNewKey}
              className="add-button"
            >
              <Plus size={18} />
              Add Variable
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            disabled={isSaving}
            className="primary-button"
          >
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      <div className="settings-section">
        <h2 className="section-title">System Actions</h2>
        <p className="section-help">
          Perform system-level operations on the backend server.
        </p>
        <div className="system-actions">
          {confirmRestart ? (
            <div
              role="alertdialog"
              aria-label="Confirm backend restart"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 6 }}
            >
              <p style={{ fontSize: 14, margin: 0 }}>Restart the backend server? This will temporarily disconnect all users.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleRestart} disabled={isRestarting} className="danger-button">
                  <RefreshCw size={18} className={isRestarting ? 'spinning' : ''} />
                  {isRestarting ? 'Restarting...' : 'Confirm Restart'}
                </button>
                <button onClick={() => setConfirmRestart(false)} className="secondary-button">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={handleRestart} disabled={isRestarting} className="danger-button">
              <RefreshCw size={18} />
              Restart Backend
            </button>
          )}
        </div>
      </div>

      <style>{`
        .settings-page {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .settings-section {
          padding: 24px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .section-title {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .section-help {
          margin: 0 0 16px 0;
          color: var(--text-secondary);
          font-size: 14px;
        }

        .env-vars-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .env-var-item {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 12px;
          align-items: center;
          padding: 12px;
          background: var(--bg-tertiary);
          border-radius: 6px;
        }

        .env-var-name {
          font-family: monospace;
          font-size: 13px;
          font-weight: 500;
          word-break: break-all;
          max-width: 180px;
        }

        .env-var-input-group {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .env-var-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 13px;
          font-family: monospace;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .visibility-toggle {
          padding: 6px;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .visibility-toggle:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .remove-button {
          padding: 6px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 4px;
          cursor: pointer;
          color: #ef4444;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .remove-button:hover {
          background: #ef4444;
          color: white;
        }

        .empty-vars {
          padding: 24px;
          text-align: center;
          color: var(--text-secondary);
          font-style: italic;
        }

        .new-var-form {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          gap: 12px;
          align-items: center;
        }

        .form-input {
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .form-input:focus {
          outline: none;
          border-color: var(--accent-primary);
          background: var(--bg-tertiary);
        }

        .add-button {
          padding: 10px 16px;
          background: var(--accent-primary);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .add-button:hover {
          background: #4f46e5;
        }

        .form-actions {
          display: flex;
          gap: 12px;
        }

        .system-actions {
          display: flex;
          gap: 12px;
        }

        .danger-button {
          padding: 10px 16px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .danger-button:hover:not(:disabled) {
          background: #b91c1c;
        }

        .danger-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .env-var-item {
            grid-template-columns: 1fr;
          }

          .new-var-form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
