import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import type { AdminStats } from '../types';
import { TrendingUp, Users, MessageSquare, DollarSign, Zap, RefreshCw, BarChart2 } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getStats();
      setStats(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>Loading statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-error">
        <p>{error}</p>
        <button onClick={loadStats} className="retry-button">Retry</button>
      </div>
    );
  }

  const avgMessagesPerUser =
    stats && stats.userCount > 0
      ? (stats.messageCount / stats.userCount).toFixed(1)
      : '0.0';

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            System overview &mdash; updated{' '}
            {stats?.statsGeneratedAt
              ? new Date(stats.statsGeneratedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : ''}
          </p>
        </div>
        <button onClick={loadStats} className="secondary-button" disabled={isLoading}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Users</p>
            <p className="stat-value">{stats?.userCount.toLocaleString()}</p>
          </div>
        </div>

        <div className="stat-card secondary">
          <div className="stat-icon">
            <MessageSquare size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Chats</p>
            <p className="stat-value">{stats?.chatCount.toLocaleString()}</p>
          </div>
        </div>

        <div className="stat-card tertiary">
          <div className="stat-icon">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Messages</p>
            <p className="stat-value">{stats?.messageCount.toLocaleString()}</p>
          </div>
        </div>

        <div className="stat-card accent">
          <div className="stat-icon">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Estimated Cost</p>
            <p className="stat-value">${stats?.estimatedCost.toFixed(2)}</p>
            <p className="stat-meta">${stats?.costPerMessage.toFixed(4)} per message</p>
          </div>
        </div>

        <div className="stat-card amber">
          <div className="stat-icon">
            <BarChart2 size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Avg Messages / User</p>
            <p className="stat-value">{avgMessagesPerUser}</p>
          </div>
        </div>
      </div>

      <div className="info-section">
        <div className="info-card">
          <div className="info-header">
            <Zap size={20} />
            <h3>Current Configuration</h3>
          </div>
          <div className="info-content">
            <div className="info-row">
              <span className="info-label">Provider</span>
              <span className="info-value provider-badge">{stats?.provider}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Default Model</span>
              <span className="info-value">{stats?.defaultModel}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Last Updated</span>
              <span className="info-value">
                {stats?.configUpdatedAt &&
                  new Date(stats.configUpdatedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
