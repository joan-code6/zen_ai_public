import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import type { AdminConfig, UpdateConfigRequest } from '../types';
import { Save, RefreshCw } from 'lucide-react';

export default function Configuration() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [formData, setFormData] = useState<UpdateConfigRequest>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getConfig();
      setConfig(data);
      setFormData({
        defaultModel: data.defaultModel,
        provider: data.provider,
        costPerMessage: data.costPerMessage,
        defaultPlanId: data.defaultPlanId,
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const updated = await apiClient.updateConfig(formData);
      setConfig(updated);
      setSuccessMessage('Configuration updated successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="configuration-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuration</h1>
          <p className="page-subtitle">System settings and preferences</p>
        </div>
        <button onClick={loadConfig} className="secondary-button" disabled={isLoading}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {successMessage && <div className="success-banner">{successMessage}</div>}

      <form onSubmit={handleSubmit} className="config-form">
        <div className="config-section">
          <h2 className="section-title">AI Provider</h2>
          <div className="form-group">
            <label className="form-label">Active Provider</label>
            <select
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value as 'openrouter' | 'hackclub' })}
              className="form-select"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="hackclub">Hack Club AI</option>
            </select>
            <p className="form-help">
              Switch between OpenRouter and Hack Club AI providers
            </p>
          </div>
        </div>

        <div className="config-section">
          <h2 className="section-title">Default Model</h2>
          <div className="form-group">
            <label className="form-label">Model Selection</label>
            <select
              value={formData.defaultModel}
              onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
              className="form-select"
            >
              {config?.availableModels
                .filter(m => m.enabled)
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName} ({model.provider})
                  </option>
                ))}
            </select>
            <p className="form-help">
              Default model used for new chats
            </p>
          </div>
        </div>

        <div className="config-section">
          <h2 className="section-title">Cost Tracking</h2>
          <div className="form-group">
            <label className="form-label">Cost Per Message (USD)</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={formData.costPerMessage}
              onChange={(e) => setFormData({ ...formData, costPerMessage: parseFloat(e.target.value) })}
              className="form-input"
            />
            <p className="form-help">
              Estimated cost per message for analytics and budgeting
            </p>
          </div>
        </div>

        <div className="config-section">
          <h2 className="section-title">Default Plan</h2>
          <div className="form-group">
            <label className="form-label">Default Subscription Plan</label>
            <select
              value={formData.defaultPlanId || ''}
              onChange={(e) => setFormData({ ...formData, defaultPlanId: e.target.value })}
              className="form-select"
            >
              {config?.availablePlans
                .filter(p => p.enabled)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.displayName} ({plan.monthlyTokenLimit.toLocaleString()} tokens/mo)
                  </option>
                ))}
            </select>
            <p className="form-help">
              Plan assigned to new users by default. Manage plans in the{' '}
              <a href="/plans" className="inline-link">Plans</a> section.
            </p>
          </div>
        </div>

        <div className="config-section">
          <h2 className="section-title">Available Models</h2>
          <div className="models-list">
            {config?.availableModels.map((model) => (
              <div key={model.id} className="model-item">
                <div className="model-info">
                  <span className="model-name">{model.displayName}</span>
                  <span className="model-id">{model.id}</span>
                </div>
                <div className="model-meta">
                  <span className={`provider-tag ${model.provider}`}>{model.provider}</span>
                  <span className={`status-tag ${model.enabled ? 'enabled' : 'disabled'}`}>
                    {model.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="form-help">
            Manage models in the <a href="/models" className="inline-link">Models</a> section
          </p>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={isSaving} className="primary-button">
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {config?.updatedAt && (
        <div className="config-footer">
          <p className="footer-text">
            Last updated: {new Date(config.updatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
