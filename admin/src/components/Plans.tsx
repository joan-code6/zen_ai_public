import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import type { Plan, CreatePlanRequest, UpdatePlanRequest } from '../types';
import { Plus, Edit2, Trash2, Power, Zap } from 'lucide-react';

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getPlans();
      setPlans(data.items);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load plans');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleEnabled = async (plan: Plan) => {
    try {
      setError('');
      await apiClient.updatePlan(plan.id, { enabled: !plan.enabled });
      await loadPlans();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update plan');
    }
  };

  const handleDelete = async (planId: string) => {
    try {
      setError('');
      await apiClient.deletePlan(planId);
      setConfirmDelete(null);
      await loadPlans();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete plan');
    }
  };

  const formatTokenLimit = (limit: number) => {
    if (limit >= 1_000_000) return `${(limit / 1_000_000).toFixed(1)}M`;
    if (limit >= 1_000) return `${(limit / 1_000).toFixed(0)}K`;
    return String(limit);
  };

  if (isLoading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading plans...</p>
      </div>
    );
  }

  return (
    <div className="plans-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Plans</h1>
          <p className="page-subtitle">Manage subscription plans and token limits</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="primary-button">
          <Plus size={18} />
          Add Plan
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="plans-grid">
        {plans.map((plan) => (
          <div key={plan.id} className={`plan-card ${!plan.enabled ? 'disabled' : ''}`}>
            <div className="plan-header">
              <div>
                <h3 className="plan-name">{plan.displayName}</h3>
                <p className="plan-id">{plan.id}</p>
              </div>
              <span className={`status-badge ${plan.enabled ? 'enabled' : 'disabled'}`}>
                {plan.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>

            {plan.description && (
              <p className="plan-description">{plan.description}</p>
            )}

            <div className="plan-limit">
              <Zap size={16} />
              <span>{formatTokenLimit(plan.monthlyTokenLimit)} tokens / month</span>
            </div>

            <div className="plan-actions">
              <button
                onClick={() => handleToggleEnabled(plan)}
                className={`toggle-button ${plan.enabled ? 'enabled' : 'disabled'}`}
                title={plan.enabled ? 'Disable plan' : 'Enable plan'}
              >
                <Power size={16} />
                {plan.enabled ? 'Enabled' : 'Disabled'}
              </button>

              <button
                onClick={() => setEditingPlan(plan)}
                className="icon-button"
                title="Edit plan"
              >
                <Edit2 size={16} />
              </button>

              {confirmDelete === plan.id ? (
                <div className="inline-confirm">
                  <button
                    onClick={() => handleDelete(plan.id)}
                    className="confirm-btn danger"
                    title="Confirm delete"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="confirm-btn cancel"
                    title="Cancel"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(plan.id)}
                  className="icon-button danger"
                  title="Delete plan"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {plan.updatedAt && (
              <p className="plan-updated">
                Updated {new Date(plan.updatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        ))}

        {plans.length === 0 && (
          <div className="empty-state">
            <Zap size={48} />
            <p>No plans found</p>
          </div>
        )}
      </div>

      {showCreateModal && (
        <PlanFormModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadPlans}
        />
      )}

      {editingPlan && (
        <PlanFormModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSuccess={loadPlans}
        />
      )}

      <style>{`
        .plans-page {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .plans-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }

        .plan-card {
          padding: 20px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .plan-card:hover {
          border-color: var(--accent-primary);
          box-shadow: 0 4px 12px rgba(99,102,241,0.08);
        }

        .plan-card.disabled {
          opacity: 0.6;
        }

        .plan-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .plan-name {
          margin: 0 0 4px 0;
          font-size: 18px;
          font-weight: 600;
        }

        .plan-id {
          margin: 0;
          font-size: 12px;
          color: var(--text-muted);
          font-family: monospace;
        }

        .plan-description {
          margin: 0;
          font-size: 14px;
          color: var(--text-secondary);
        }

        .plan-limit {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--bg-tertiary);
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          color: var(--accent-primary);
        }

        .plan-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .plan-updated {
          margin: 0;
          font-size: 11px;
          color: var(--text-muted);
        }

        .status-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.enabled {
          background: rgba(34, 197, 94, 0.12);
          color: #22c55e;
        }

        .status-badge.disabled {
          background: rgba(107, 114, 128, 0.12);
          color: #6b7280;
        }

        .toggle-button {
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .toggle-button.enabled {
          background: rgba(34, 197, 94, 0.1);
          border-color: #22c55e;
          color: #22c55e;
        }

        .toggle-button.enabled:hover {
          background: #22c55e;
          color: white;
        }

        .toggle-button.disabled {
          background: rgba(107, 114, 128, 0.1);
          border-color: #6b7280;
          color: #6b7280;
        }

        .toggle-button.disabled:hover {
          background: #6b7280;
          color: white;
        }

        .icon-button {
          padding: 6px 8px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }

        .icon-button:hover {
          background: var(--accent-primary);
          color: white;
          border-color: var(--accent-primary);
        }

        .icon-button.danger:hover {
          background: #ef4444;
          border-color: #ef4444;
          color: white;
        }

        .inline-confirm {
          display: flex;
          gap: 6px;
        }

        .confirm-btn {
          padding: 6px 10px;
          border-radius: 4px;
          border: 1px solid;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .confirm-btn.danger {
          background: #ef4444;
          border-color: #ef4444;
          color: white;
        }

        .confirm-btn.cancel {
          background: transparent;
          border-color: var(--border-color);
          color: var(--text-secondary);
        }

        .empty-state {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 24px;
          color: var(--text-secondary);
          gap: 16px;
        }

        .empty-state svg {
          opacity: 0.4;
        }
      `}</style>
    </div>
  );
}

interface PlanFormModalProps {
  plan?: Plan;
  onClose: () => void;
  onSuccess: () => void;
}

function PlanFormModal({ plan, onClose, onSuccess }: PlanFormModalProps) {
  const [formData, setFormData] = useState<CreatePlanRequest>({
    id: plan?.id || '',
    displayName: plan?.displayName || '',
    description: plan?.description || '',
    monthlyTokenLimit: plan?.monthlyTokenLimit ?? 50000,
    enabled: plan?.enabled ?? true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');

    try {
      if (plan) {
        const { id, ...updateData } = formData;
        await apiClient.updatePlan(plan.id, updateData as UpdatePlanRequest);
      } else {
        await apiClient.createPlan(formData);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to save plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{plan ? 'Edit Plan' : 'Create New Plan'}</h2>

        {formError && <div className="error-banner" style={{ marginBottom: 12 }}>{formError}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">Plan ID</label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              disabled={!!plan}
              required
              className="form-input"
              placeholder="e.g., pro"
            />
            {!plan && (
              <small className="form-help">Unique identifier, cannot be changed later</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="form-input"
              placeholder="e.g., Pro Plan"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="form-textarea"
              rows={2}
              placeholder="Brief description..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Monthly Token Limit</label>
            <input
              type="number"
              min="0"
              value={formData.monthlyTokenLimit}
              onChange={(e) =>
                setFormData({ ...formData, monthlyTokenLimit: parseInt(e.target.value) || 0 })
              }
              required
              className="form-input"
            />
            <small className="form-help">
              Number of tokens users on this plan can use per month (0 = unlimited)
            </small>
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
              {isSubmitting ? 'Saving...' : plan ? 'Update Plan' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
