'use client';

import { useEffect, useState } from 'react';
import type { FileSearchStore } from '@/lib/types';

export default function StoreList() {
  const [stores, setStores] = useState<FileSearchStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    fetchStores();
  }, []);

  async function fetchStores() {
    try {
      setLoading(true);
      const res = await fetch('/api/stores');
      const data = await res.json();

      if (data.success) {
        setStores(data.stores);
      } else {
        setError(data.error || 'Failed to load stores');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createStore() {
    if (!newStoreName.trim()) {
      alert('Store name is required');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: newStoreName }),
      });

      const data = await res.json();

      if (data.success) {
        alert(data.message);
        setNewStoreName('');
        setShowCreateForm(false);
        await fetchStores();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteStore(storeName: string, force = false) {
    const confirmed = confirm(
      `Delete store "${storeName}"?${force ? ' (FORCED - all files will be deleted)' : ''}`
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/stores/${extractStoreId(storeName)}?force=${force}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        alert(data.message);
        await fetchStores();
      } else {
        // If failed without force, try with force
        if (!force && data.error?.includes('contains files')) {
          const retryForce = confirm(
            'Store contains files. Force delete (all files will be deleted)?'
          );
          if (retryForce) {
            await deleteStore(storeName, true);
          }
        } else {
          alert(`Error: ${data.error}`);
        }
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }

  function extractStoreId(storeName: string): string {
    return storeName.replace('fileSearchStores/', '');
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
        <p className="mt-4 text-gray-500">Loading stores...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchStores}
          className="mt-2 text-sm text-red-700 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            File Search Stores ({stores.length}/10)
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Maximum 10 stores per project
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          disabled={stores.length >= 10}
        >
          {showCreateForm ? 'Cancel' : '+ New Store'}
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Create New Store</h3>
          <div className="flex gap-4">
            <input
              type="text"
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              placeholder="Store display name (e.g., lexdiff-law-store)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creating}
            />
            <button
              onClick={createStore}
              disabled={creating || !newStoreName.trim()}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Stores Grid */}
      {stores.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">No stores found</p>
          <p className="text-gray-400 text-sm mt-2">
            Create your first File Search Store to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stores.map((store) => (
            <div
              key={store.name}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {store.displayName || 'Unnamed Store'}
              </h3>
              <p className="text-xs text-gray-400 mb-4 font-mono break-all">
                {store.name}
              </p>
              <div className="text-sm text-gray-600 space-y-1 mb-4">
                <div>
                  <span className="font-medium">Created:</span>{' '}
                  {store.createTime
                    ? new Date(store.createTime).toLocaleString()
                    : 'Unknown'}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => deleteStore(store.name)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
