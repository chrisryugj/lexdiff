'use client';

import { useEffect, useState } from 'react';
import type { StorageStats } from '@/lib/types';

export default function StatsCard() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      setLoading(true);
      const res = await fetch('/api/stats');
      const data = await res.json();

      if (data.success) {
        setStats(data.stats);
      } else {
        setError(data.error || 'Failed to load stats');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600 text-sm">{error || 'No stats available'}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Total Files */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-sm font-medium text-gray-500 mb-2">Total Files</div>
        <div className="text-3xl font-bold text-gray-900">{stats.totalFiles}</div>
      </div>

      {/* Storage Usage */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-sm font-medium text-gray-500 mb-2">Storage Used</div>
        <div className="text-3xl font-bold text-gray-900">
          {stats.totalSizeGB} GB
        </div>
        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                stats.usagePercent > 80
                  ? 'bg-red-500'
                  : stats.usagePercent > 50
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(stats.usagePercent, 100)}%` }}
            ></div>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats.usagePercent}% of {stats.maxSizeGB} GB
          </div>
        </div>
      </div>

      {/* Expiring Soon */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-sm font-medium text-gray-500 mb-2">
          Expiring in 24h
        </div>
        <div className="text-3xl font-bold text-orange-600">
          {stats.filesExpiringIn24h}
        </div>
        {stats.filesExpiringIn24h > 0 && (
          <div className="text-xs text-orange-600 mt-1">⚠️ Action required</div>
        )}
      </div>

      {/* Refresh Button */}
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center">
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          Refresh Stats
        </button>
      </div>
    </div>
  );
}
