import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import type { Model, CreateModelRequest, UpdateModelRequest, Lab, CreateLabRequest, UpdateLabRequest } from '../types';
import { Plus, Edit2, Trash2, Power, Filter, Settings, Search } from 'lucide-react';

interface ProviderModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  pricing?: any;
}

export default function Models() {
  const [models, setModels] = useState<Model[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [showCreateLabModal, setShowCreateLabModal] = useState(false);
  const [editingLab, setEditingLab] = useState<Lab | null>(null);
  const [selectedLab, setSelectedLab] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [modelsData, providerData, labsData] = await Promise.all([
        apiClient.getModels(),
        apiClient.getProviderModels(),
        apiClient.getLabs()
      ]);
      setModels(modelsData.items);
      setProviderModels(providerData.items);
      setLabs(labsData.items);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const getLabForModel = (modelId: string) => {
    const labId = modelId.split('/')[0];
    return labs.find(lab => lab.id === labId) || null;
  };

  const combinedModels = providerModels.map(providerModel => {
    const dbModel = models.find(m => m.id === providerModel.id);
    const lab = getLabForModel(providerModel.id);
    return {
      ...providerModel,
      displayName: dbModel?.displayName || providerModel.name,
      description: dbModel?.description || providerModel.description || '',
      provider: dbModel?.provider || 'openrouter',
      enabled: dbModel?.enabled ?? false,
      configured: !!dbModel,
      contextLength: providerModel.contextLength,
      pricing: providerModel.pricing,
      lab: lab,
    };
  }).filter(model => {
    // Lab filter
    if (selectedLab === 'all') {
      // pass
    } else if (selectedLab === 'no-lab') {
      if (model.lab) return false;
    } else if (model.lab?.id !== selectedLab) {
      return false;
    }
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        model.id.toLowerCase().includes(term) ||
        model.displayName.toLowerCase().includes(term) ||
        model.description.toLowerCase().includes(term) ||
        model.provider.toLowerCase().includes(term) ||
        (model.lab?.displayName.toLowerCase().includes(term))
      );
    }
    
    return true;
  });

  const handleToggleEnabled = async (model: any) => {
    try {
      if (model.configured) {
        await apiClient.updateModel(model.id, { enabled: !model.enabled });
      } else {
        // Create the model entry
        await apiClient.createModel({
          id: model.id,
          displayName: model.displayName,
          description: model.description,
          provider: model.provider,
          enabled: true,
        });
      }
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to update model');
    }
  };

  const handleDelete = async (modelId: string) => {
    if (!confirm('Are you sure you want to delete this model?')) return;
    
    try {
      await apiClient.deleteModel(modelId);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete model');
    }
  };

  const handleToggleLabEnabled = async (lab: Lab) => {
    try {
      await apiClient.updateLab(lab.id, {
        displayName: lab.displayName,
        description: lab.description,
        enabled: !lab.enabled,
      });
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to update lab');
    }
  };

  if (isLoading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading models...</p>
      </div>
    );
  }

  return (
    <div className="models-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Models</h1>
          <p className="page-subtitle">Manage available AI models</p>
        </div>
        <div className="header-actions">
          <div className="search-group">
            <Search size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search models..."
              className="search-input"
            />
          </div>
          <div className="filter-group">
            <Filter size={16} />
            <select
              value={selectedLab}
              onChange={(e) => setSelectedLab(e.target.value)}
              className="lab-filter"
            >
              <option value="all">All Labs</option>
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.displayName} ({lab.id})
                </option>
              ))}
            </select>
          </div>
          <button onClick={() => setShowCreateLabModal(true)} className="secondary-button">
            <Settings size={16} />
            Manage Labs
          </button>
          <button onClick={() => setShowCreateModal(true)} className="primary-button">
            <Plus size={18} />
            Add Model
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="models-grid">
        {combinedModels.map((model) => (
          <div key={model.id} className={`model-card ${!model.enabled ? 'disabled' : ''}`}>
            <div className="model-header">
              <div>
                <h3 className="model-name">{model.displayName}</h3>
                <p className="model-id">{model.id}</p>
              </div>
              <div className="model-tags">
                {model.lab && (
                  <span className="lab-tag">
                    {model.lab.displayName}
                  </span>
                )}
                <span className={`provider-tag ${model.provider}`}>
                  {model.provider}
                </span>
              </div>
            </div>

            <p className="model-description">{model.description}</p>
            {model.contextLength && (
              <p className="model-context">Context: {model.contextLength} tokens</p>
            )}

            <div className="model-actions">
              <button
                onClick={() => handleToggleEnabled(model)}
                className={`toggle-button ${model.enabled ? 'enabled' : 'disabled'}`}
                title={model.enabled ? 'Disable' : 'Enable'}
              >
                <Power size={16} />
                {model.configured ? (model.enabled ? 'Enabled' : 'Disabled') : 'Not Configured'}
              </button>

              {model.configured && (
                <>
                  <button
                    onClick={() => setEditingModel(models.find(m => m.id === model.id)!)}
                    className="icon-button"
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>

                  <button
                    onClick={() => handleDelete(model.id)}
                    className="icon-button danger"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreateLabModal && (
        <LabManagementModal
          labs={labs}
          onClose={() => setShowCreateLabModal(false)}
          onEditLab={setEditingLab}
          onToggleLabEnabled={handleToggleLabEnabled}
        />
      )}

      {editingLab && (
        <LabFormModal
          lab={editingLab}
          onClose={() => setEditingLab(null)}
          onSuccess={loadData}
        />
      )}

      {showCreateModal && (
        <ModelFormModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadData}
        />
      )}

      {editingModel && (
        <ModelFormModal
          model={editingModel}
          onClose={() => setEditingModel(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}

interface ModelFormModalProps {
  model?: Model;
  onClose: () => void;
  onSuccess: () => void;
}

function ModelFormModal({ model, onClose, onSuccess }: ModelFormModalProps) {
  const [formData, setFormData] = useState<CreateModelRequest>({
    id: model?.id || '',
    displayName: model?.displayName || '',
    description: model?.description || '',
    provider: model?.provider || 'openrouter',
    enabled: model?.enabled ?? true,
    metadata: model?.metadata || {},
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (model) {
        const { id, ...updateData } = formData;
        await apiClient.updateModel(model.id, updateData as UpdateModelRequest);
      } else {
        await apiClient.createModel(formData);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to save model');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{model ? 'Edit Model' : 'Add New Model'}</h2>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">Model ID</label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              disabled={!!model}
              required
              className="form-input"
              placeholder="e.g., gpt-4o"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="form-input"
              placeholder="e.g., GPT-4o"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="form-textarea"
              rows={3}
              placeholder="Brief description of the model..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Provider</label>
            <select
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value as 'openrouter' | 'hackclub' })}
              className="form-select"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="hackclub">Hack Club</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              />
              <span>Enabled</span>
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="secondary-button">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="primary-button">
              {isSubmitting ? 'Saving...' : model ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface LabManagementModalProps {
  labs: Lab[];
  onClose: () => void;
  onEditLab: (lab: Lab) => void;
  onToggleLabEnabled: (lab: Lab) => void;
}

function LabManagementModal({ labs, onClose, onEditLab, onToggleLabEnabled }: LabManagementModalProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredLabs = labs.filter(lab => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      lab.id.toLowerCase().includes(term) ||
      lab.displayName.toLowerCase().includes(term) ||
      (lab.description && lab.description.toLowerCase().includes(term))
    );
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Manage Labs</h2>
          <div className="modal-search">
            <Search size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search labs..."
              className="modal-search-input"
            />
          </div>
        </div>

        <div className="labs-list">
          {filteredLabs.length === 0 ? (
            <div className="empty-state">
              <p>{searchTerm ? 'No labs match your search.' : 'No labs discovered yet. Labs are automatically created from model IDs.'}</p>
            </div>
          ) : (
            filteredLabs.map((lab) => (
              <div key={lab.id} className={`lab-item ${!lab.enabled ? 'disabled' : ''}`}>
                <div className="lab-info">
                  <div>
                    <h3 className="lab-name">{lab.displayName}</h3>
                    <p className="lab-id">{lab.id}</p>
                    {lab.description && <p className="lab-description">{lab.description}</p>}
                  </div>
                  <span className={`status-badge ${lab.enabled ? 'enabled' : 'disabled'}`}>
                    {lab.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div className="lab-actions">
                  <button
                    onClick={() => onToggleLabEnabled(lab)}
                    className={`toggle-button ${lab.enabled ? 'enabled' : 'disabled'}`}
                    title={lab.enabled ? 'Disable lab and all its models' : 'Enable lab and all its models'}
                  >
                    <Power size={16} />
                  </button>

                  <button
                    onClick={() => onEditLab(lab)}
                    className="icon-button"
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="secondary-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface LabFormModalProps {
  lab?: Lab;
  onClose: () => void;
  onSuccess: () => void;
}

function LabFormModal({ lab, onClose, onSuccess }: LabFormModalProps) {
  const [formData, setFormData] = useState<CreateLabRequest>({
    id: lab?.id || '',
    displayName: lab?.displayName || '',
    description: lab?.description || '',
    enabled: lab?.enabled ?? true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (lab) {
        const { id, ...updateData } = formData;
        await apiClient.updateLab(lab.id, updateData as UpdateLabRequest);
      } else {
        await apiClient.createLab(formData);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to save lab');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{lab ? 'Edit Lab' : 'Add New Lab'}</h2>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">Lab ID</label>
            <input
              type="text"
              value={formData.id}
              disabled
              className="form-input"
              title="Lab ID is auto-generated from model IDs and cannot be changed"
            />
            <small className="form-help">Lab ID is automatically derived from model IDs (e.g., "openai" from "openai/gpt-4")</small>
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="form-input"
              placeholder="e.g., OpenAI"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="form-textarea"
              rows={3}
              placeholder="Brief description of the lab..."
            />
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              />
              <span>Enabled (enables/disables all models from this lab)</span>
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="secondary-button">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="primary-button">
              {isSubmitting ? 'Saving...' : lab ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
