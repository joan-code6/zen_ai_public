import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import type { AdminUser, Model, Lab, Plan, UserPlanResponse, UserStats } from '../types';
import { 
  Users as UsersIcon, 
  Lock, 
  Trash2, 
  Key, 
  ChevronRight,
  Search,
  Shield,
  FlaskConical,
  Plus,
  CreditCard,
  BarChart2,
  UserPlus,
} from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ uid: string; email: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Model/lab permissions state
  const [allowedModelIds, setAllowedModelIds] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [allowedLabIds, setAllowedLabIds] = useState<string[]>([]);
  const [availableLabs, setAvailableLabs] = useState<Lab[]>([]);
  const [isPermsLoading, setIsPermsLoading] = useState(false);
  const [isPermsSaving, setIsPermsSaving] = useState(false);

  // Plan state
  const [userPlan, setUserPlan] = useState<UserPlanResponse | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [isPlanSaving, setIsPlanSaving] = useState(false);

  // Stats state
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.listUsers(100, 0);
      setUsers(data.items);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserPermissions = async (uid: string) => {
    try {
      setIsPermsLoading(true);
      const [modelsRes, labsRes, planRes, plansRes, statsRes] = await Promise.all([
        apiClient.getUserModels(uid),
        apiClient.getUserLabs(uid),
        apiClient.getUserPlan(uid),
        apiClient.getPlans(),
        apiClient.getUserStats(uid),
      ]);
      setAllowedModelIds(modelsRes.allowedModelIds);
      setAvailableModels(modelsRes.availableModels);
      setAllowedLabIds(labsRes.allowedLabIds);
      setAvailableLabs(labsRes.availableLabs);
      setUserPlan(planRes);
      setSelectedPlanId(planRes.planId);
      setAvailablePlans(plansRes.items);
      setUserStats(statsRes);
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to load user data');
    } finally {
      setIsPermsLoading(false);
    }
  };

  const handleResetPassword = async (uid: string) => {
    try {
      setIsActionLoading(true);
      setActionError('');
      const result = await apiClient.resetUserPassword(uid);
      setTempPassword(result.temporaryPassword || '');
      setActionSuccess('Password reset successfully.');
      setConfirmReset(null);
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to reset password');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleToggleDisable = async (user: AdminUser) => {
    try {
      setIsActionLoading(true);
      setActionError('');
      await apiClient.disableUser(user.uid, !user.disabled);
      await loadUsers();
      setActionSuccess(`User ${user.disabled ? 'enabled' : 'disabled'} successfully.`);
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to update user');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    try {
      setIsActionLoading(true);
      setActionError('');
      await apiClient.deleteUser(uid);
      await loadUsers();
      setShowUserDetail(false);
      setConfirmDelete(null);
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to delete user');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleToggleModel = (modelId: string) => {
    setAllowedModelIds(prev =>
      prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]
    );
  };

  const handleToggleLab = (labId: string) => {
    setAllowedLabIds(prev =>
      prev.includes(labId) ? prev.filter(id => id !== labId) : [...prev, labId]
    );
  };

  const handleSavePermissions = async (uid: string) => {
    try {
      setIsPermsSaving(true);
      setActionError('');
      await Promise.all([
        apiClient.setUserModels(uid, allowedModelIds),
        apiClient.setUserLabs(uid, allowedLabIds),
      ]);
      setActionSuccess('Permissions saved successfully.');
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to save permissions');
    } finally {
      setIsPermsSaving(false);
    }
  };

  const handleSavePlan = async (uid: string) => {
    try {
      setIsPlanSaving(true);
      setActionError('');
      const result = await apiClient.setUserPlan(uid, selectedPlanId);
      setUserPlan(result);
      setActionSuccess('Plan updated successfully.');
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to update plan');
    } finally {
      setIsPlanSaving(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading users...</p>
      </div>
    );
  }

  return (
    <div className="users-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Manage user accounts and permissions</p>
        </div>
        {!showUserDetail && (
          <button onClick={() => setShowCreateModal(true)} className="primary-button">
            <UserPlus size={18} />
            Create User
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {actionError && <div className="error-banner">{actionError}</div>}
      {actionSuccess && <div className="success-banner">{actionSuccess}</div>}

      {tempPassword && (
        <div className="success-banner" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong>Temporary password generated:</strong>
          <code style={{ fontFamily: 'monospace', fontSize: 15, letterSpacing: 1 }}>{tempPassword}</code>
          <span style={{ fontSize: 13, opacity: 0.8 }}>User should log in and change it immediately.</span>
          <button onClick={() => setTempPassword('')} style={{ alignSelf: 'flex-start', marginTop: 4, padding: '4px 10px', cursor: 'pointer', borderRadius: 4, border: '1px solid currentColor', background: 'transparent', color: 'inherit', fontSize: 12 }}>Dismiss</button>
        </div>
      )}

      {!showUserDetail ? (
        <div className="users-list-container">
          <div className="search-bar">
            <Search size={20} />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <span className="search-count">{filteredUsers.length} users</span>
          </div>

          <div className="users-table">
            <div className="table-header">
              <div className="col-email">Email</div>
              <div className="col-name">Name</div>
              <div className="col-verified">Verified</div>
              <div className="col-created">Created</div>
              <div className="col-status">Status</div>
              <div className="col-actions">Actions</div>
            </div>

            {filteredUsers.map((user) => (
              <div key={user.uid} className="table-row">
                <div className="col-email">{user.email}</div>
                <div className="col-name">{user.displayName || '-'}</div>
                <div className="col-verified">
                  <span className={`badge ${user.emailVerified ? 'verified' : 'unverified'}`}>
                    {user.emailVerified ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div className="col-created">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                </div>
                <div className="col-status">
                  <span className={`badge ${user.disabled ? 'disabled' : 'active'}`}>
                    {user.disabled ? 'Disabled' : 'Active'}
                  </span>
                </div>
                <div className="col-actions">
                  <button
                    onClick={() => {
                      setSelectedUser(user);
                      setShowUserDetail(true);
                      setActionError('');
                      setActionSuccess('');
                      setTempPassword('');
                      setUserStats(null);
                      loadUserPermissions(user.uid);
                    }}
                    className="action-button"
                    title="View details"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredUsers.length === 0 && (
            <div className="empty-state">
              <UsersIcon size={48} />
              <p>No users found</p>
            </div>
          )}
        </div>
      ) : (
        <div className="user-detail-container">
          <button
            onClick={() => {
              setShowUserDetail(false);
              setSelectedUser(null);
              setConfirmDelete(null);
              setConfirmReset(null);
              setTempPassword('');
              setActionError('');
              setActionSuccess('');
              setUserStats(null);
              setUserPlan(null);
            }}
            className="back-button"
          >
            ← Back to Users
          </button>

          {selectedUser && (
            <div className="user-detail">
              <div className="detail-header">
                <div>
                  <h2>{selectedUser.displayName || selectedUser.email}</h2>
                  <p className="user-email">{selectedUser.email}</p>
                  <p className="user-uid">UID: {selectedUser.uid}</p>
                </div>
                <div className="detail-status">
                  <span className={`badge large ${selectedUser.disabled ? 'disabled' : 'active'}`}>
                    {selectedUser.disabled ? 'Disabled' : 'Active'}
                  </span>
                </div>
              </div>

              <div className="detail-grid">
                <div className="detail-section">
                  <h3>Account Information</h3>
                  <div className="info-row">
                    <label>Email Verified:</label>
                    <span>{selectedUser.emailVerified ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="info-row">
                    <label>Created:</label>
                    <span>
                      {selectedUser.createdAt
                        ? new Date(selectedUser.createdAt).toLocaleString()
                        : 'Unknown'}
                    </span>
                  </div>
                  <div className="info-row">
                    <label>Last Sign In:</label>
                    <span>
                      {selectedUser.lastSignIn
                        ? new Date(selectedUser.lastSignIn).toLocaleString()
                        : 'Never'}
                    </span>
                  </div>
                </div>

                <div className="detail-section">
                  <h3>
                    <BarChart2 size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                    Activity Stats
                  </h3>
                  {isPermsLoading || userStats === null ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading stats...</p>
                  ) : (
                    <div className="stats-grid">
                      <div className="stat-item">
                        <span className="stat-number">{userStats.chatCount}</span>
                        <span className="stat-label">Chats</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-number">{userStats.messageCount}</span>
                        <span className="stat-label">Messages</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <h3>
                    <CreditCard size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                    Subscription Plan
                  </h3>
                  {isPermsLoading ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading plan...</p>
                  ) : (
                    <div className="plan-section">
                      {userPlan && (
                        <div className="plan-usage">
                          <div className="plan-info-row">
                            <label>Current Plan:</label>
                            <span className="plan-badge">{userPlan.plan?.displayName || userPlan.planId}</span>
                          </div>
                          <div className="plan-info-row">
                            <label>Token Usage:</label>
                            <span>
                              {userPlan.usage.tokenUsed.toLocaleString()} / {userPlan.usage.tokenLimit.toLocaleString()}
                            </span>
                          </div>
                          <div className="plan-info-row">
                            <label>Period:</label>
                            <span>{userPlan.usage.period}</span>
                          </div>
                          <div className="usage-bar">
                            <div
                              className="usage-fill"
                              style={{
                                width: `${Math.min(100, userPlan.usage.tokenLimit > 0
                                  ? (userPlan.usage.tokenUsed / userPlan.usage.tokenLimit) * 100
                                  : 0
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="plan-change">
                        <label className="form-label" style={{ fontSize: 13 }}>Change Plan:</label>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <select
                            value={selectedPlanId}
                            onChange={(e) => setSelectedPlanId(e.target.value)}
                            className="form-select"
                            style={{ flex: 1 }}
                          >
                            {availablePlans.map(plan => (
                              <option key={plan.id} value={plan.id}>
                                {plan.displayName} ({plan.id})
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleSavePlan(selectedUser.uid)}
                            disabled={isPlanSaving || selectedPlanId === userPlan?.planId}
                            className="action-btn save-perms"
                            style={{ width: 'auto', padding: '8px 14px' }}
                          >
                            {isPlanSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <h3>Actions</h3>
                  <div className="action-buttons">
                    {confirmReset === selectedUser.uid ? (
                      <div className="inline-confirm">
                        <span>Reset password for this user?</span>
                        <div className="confirm-actions">
                          <button
                            onClick={() => handleResetPassword(selectedUser.uid)}
                            disabled={isActionLoading}
                            className="confirm-btn confirm-yes"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmReset(null)}
                            className="confirm-btn confirm-no"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmReset(selectedUser.uid)}
                        disabled={isActionLoading}
                        className="action-btn reset-password"
                      >
                        <Key size={18} />
                        Reset Password
                      </button>
                    )}

                    <button
                      onClick={() => handleToggleDisable(selectedUser)}
                      disabled={isActionLoading}
                      className={`action-btn toggle-disable ${selectedUser.disabled ? 'enable' : 'disable'}`}
                    >
                      <Lock size={18} />
                      {selectedUser.disabled ? 'Enable User' : 'Disable User'}
                    </button>

                    {confirmDelete?.uid === selectedUser.uid ? (
                      <div className="inline-confirm danger">
                        <span>Delete <strong>{confirmDelete.email}</strong>? This cannot be undone.</span>
                        <div className="confirm-actions">
                          <button
                            onClick={() => handleDeleteUser(selectedUser.uid)}
                            disabled={isActionLoading}
                            className="confirm-btn confirm-yes danger"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="confirm-btn confirm-no"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete({ uid: selectedUser.uid, email: selectedUser.email })}
                        disabled={isActionLoading}
                        className="action-btn delete-user"
                      >
                        <Trash2 size={18} />
                        Delete User
                      </button>
                    )}
                  </div>
                </div>

                <div className="detail-section perms-section">
                  <h3>
                    <Shield size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                    Model Access
                  </h3>
                  {isPermsLoading ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading permissions...</p>
                  ) : availableModels.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, fontStyle: 'italic' }}>
                      No models configured. Enable models in the Models section first.
                    </p>
                  ) : (
                    <div className="permissions-grid">
                      {availableModels.map(model => (
                        <label key={model.id} className="perm-toggle">
                          <input
                            type="checkbox"
                            checked={allowedModelIds.includes(model.id)}
                            onChange={() => handleToggleModel(model.id)}
                          />
                          <span className="perm-label">
                            <span className="perm-name">{model.displayName || model.id}</span>
                            <span className="perm-sub">{model.provider}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="detail-section perms-section">
                  <h3>
                    <FlaskConical size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                    Lab Access
                  </h3>
                  {isPermsLoading ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading permissions...</p>
                  ) : availableLabs.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, fontStyle: 'italic' }}>No labs available</p>
                  ) : (
                    <div className="permissions-grid">
                      {availableLabs.map(lab => (
                        <label key={lab.id} className="perm-toggle">
                          <input
                            type="checkbox"
                            checked={allowedLabIds.includes(lab.id)}
                            onChange={() => handleToggleLab(lab.id)}
                          />
                          <span className="perm-label">
                            <span className="perm-name">{lab.displayName || lab.id}</span>
                            {lab.description && <span className="perm-sub">{lab.description}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {!isPermsLoading && (availableModels.length > 0 || availableLabs.length > 0) && (
                    <button
                      onClick={() => handleSavePermissions(selectedUser.uid)}
                      disabled={isPermsSaving}
                      className="action-btn save-perms"
                      style={{ marginTop: 16 }}
                    >
                      {isPermsSaving ? 'Saving...' : 'Save Permissions'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadUsers();
          }}
        />
      )}

      <style>{`
        .users-page {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .users-list-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .search-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .search-input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 14px;
          outline: none;
          color: var(--text-primary);
        }

        .search-count {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .users-table {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
        }

        .table-header {
          display: grid;
          grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1fr;
          padding: 12px 16px;
          background: var(--bg-tertiary);
          font-weight: 600;
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          border-bottom: 1px solid var(--border-color);
        }

        .table-row {
          display: grid;
          grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1fr;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          align-items: center;
          gap: 12px;
        }

        .table-row:last-child {
          border-bottom: none;
        }

        .table-row:hover {
          background: rgba(99, 102, 241, 0.05);
        }

        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .badge.verified {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
        }

        .badge.unverified {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .badge.active {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .badge.disabled {
          background: rgba(107, 114, 128, 0.1);
          color: #6b7280;
        }

        .badge.large {
          padding: 8px 12px;
          font-size: 14px;
        }

        .action-button {
          padding: 6px 8px;
          background: var(--bg-tertiary);
          border: none;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .action-button:hover {
          background: var(--accent-primary);
          color: white;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          color: var(--text-secondary);
        }

        .empty-state svg {
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .user-detail-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .back-button {
          padding: 8px 16px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .back-button:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .user-detail {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          padding: 20px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .detail-header h2 {
          margin: 0 0 8px 0;
          font-size: 20px;
        }

        .user-email {
          color: var(--text-secondary);
          margin: 0 0 4px 0;
          font-size: 14px;
        }

        .user-uid {
          color: var(--text-muted);
          margin: 0;
          font-size: 12px;
          font-family: monospace;
        }

        .detail-status {
          display: flex;
          align-items: center;
        }

        .detail-grid {
          display: grid;
          gap: 20px;
        }

        .detail-section {
          padding: 20px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .detail-section h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-color);
          font-size: 14px;
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-row label {
          font-weight: 500;
          color: var(--text-secondary);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px;
          background: var(--bg-tertiary);
          border-radius: 8px;
          gap: 4px;
        }

        .stat-number {
          font-size: 24px;
          font-weight: 700;
          color: var(--accent-primary);
        }

        .stat-label {
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .plan-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .plan-usage {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .plan-info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .plan-info-row label {
          color: var(--text-secondary);
          font-weight: 500;
        }

        .plan-badge {
          padding: 3px 10px;
          background: rgba(99, 102, 241, 0.12);
          color: var(--accent-primary);
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
        }

        .usage-bar {
          height: 6px;
          background: var(--bg-tertiary);
          border-radius: 3px;
          overflow: hidden;
          margin-top: 4px;
        }

        .usage-fill {
          height: 100%;
          background: var(--accent-primary);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .plan-change {
          border-top: 1px solid var(--border-color);
          padding-top: 12px;
        }

        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .inline-confirm {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          background: rgba(249, 115, 22, 0.08);
          border: 1px solid rgba(249, 115, 22, 0.3);
          border-radius: 6px;
          font-size: 14px;
        }

        .inline-confirm.danger {
          background: rgba(239, 68, 68, 0.08);
          border-color: rgba(239, 68, 68, 0.3);
        }

        .confirm-actions {
          display: flex;
          gap: 8px;
        }

        .confirm-btn {
          padding: 6px 14px;
          border-radius: 4px;
          border: 1px solid;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .confirm-btn.confirm-yes {
          background: #f97316;
          border-color: #f97316;
          color: white;
        }

        .confirm-btn.confirm-yes.danger {
          background: #ef4444;
          border-color: #ef4444;
        }

        .confirm-btn.confirm-no {
          background: transparent;
          border-color: var(--border-color);
          color: var(--text-secondary);
        }

        .confirm-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-btn {
          padding: 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .reset-password {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          border-color: #3b82f6;
        }

        .reset-password:hover:not(:disabled) {
          background: #3b82f6;
          color: white;
        }

        .toggle-disable {
          background: rgba(249, 115, 22, 0.1);
          color: #f97316;
          border-color: #f97316;
        }

        .toggle-disable:hover:not(:disabled) {
          background: #f97316;
          color: white;
        }

        .toggle-disable.enable {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
          border-color: #22c55e;
        }

        .toggle-disable.enable:hover:not(:disabled) {
          background: #22c55e;
          color: white;
        }

        .delete-user {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-color: #ef4444;
        }

        .delete-user:hover:not(:disabled) {
          background: #ef4444;
          color: white;
        }

        .save-perms {
          background: rgba(99, 102, 241, 0.1);
          color: var(--accent-primary);
          border-color: var(--accent-primary);
          width: 100%;
        }

        .save-perms:hover:not(:disabled) {
          background: var(--accent-primary);
          color: white;
        }

        .permissions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 10px;
        }

        .perm-toggle {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .perm-toggle:hover {
          border-color: var(--accent-primary);
        }

        .perm-toggle input[type="checkbox"] {
          margin-top: 2px;
          accent-color: var(--accent-primary);
          width: 15px;
          height: 15px;
          flex-shrink: 0;
          cursor: pointer;
        }

        .perm-label {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .perm-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .perm-sub {
          font-size: 11px;
          color: var(--text-muted);
        }

        .form-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .form-select {
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
          background: var(--bg-primary);
          color: var(--text-primary);
          cursor: pointer;
        }

        .form-select:focus {
          outline: none;
          border-color: var(--accent-primary);
        }
      `}</style>
    </div>
  );
}

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const [formData, setFormData] = useState({ email: '', password: '', displayName: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return;
    }
    setIsSubmitting(true);
    setError('');

    try {
      await apiClient.createUser({
        email: formData.email,
        password: formData.password,
        displayName: formData.displayName || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          <Plus size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
          Create New User
        </h2>

        {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">Email Address *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="form-input"
              placeholder="user@example.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password *</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              className="form-input"
              placeholder="Minimum 6 characters"
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="form-input"
              placeholder="Optional display name"
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="secondary-button">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="primary-button">
              {isSubmitting ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

