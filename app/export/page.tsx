'use client';

import { useState, useEffect } from 'react';
import { FaFolder, FaFile, FaDownload, FaTrash, FaInfoCircle } from 'react-icons/fa';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  evaluated?: boolean;
}

type ExportType = 'original' | 'evaluation' | 'both' | 'merged';

export default function ExportPage() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [exportType, setExportType] = useState<ExportType>('both');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files');
      if (!response.ok) throw new Error('Failed to fetch files');
      const data = await response.json();
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleFolderSelection = (path: string) => {
    setSelectedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedFolders.size === 0) {
      alert('Please select at least one folder to export');
      return;
    }

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folders: Array.from(selectedFolders),
          type: exportType,
        }),
      });

      if (!response.ok) throw new Error('Failed to export files');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'export.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export files');
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const response = await fetch('/api/export/delete-all', { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete all data');
      setShowDeleteModal(false);
      fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete all data');
    } finally {
      setDeleting(false);
    }
  };

  const renderFileNode = (node: FileNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFolders.has(node.path);
    const paddingLeft = `${level * 20}px`;

    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <div 
            className="d-flex align-items-center py-2 cursor-pointer"
            style={{ paddingLeft }}
          >
            <input
              type="checkbox"
              className="form-check-input me-2"
              checked={isSelected}
              onChange={() => toggleFolderSelection(node.path)}
            />
            <FaFolder 
              className="text-warning me-2" 
              onClick={() => toggleFolder(node.path)}
            />
            <span onClick={() => toggleFolder(node.path)}>{node.name}</span>
          </div>
          {isExpanded && node.children?.map(child => renderFileNode(child, level + 1))}
        </div>
      );
    }

    return null; // Don't show individual files in export view
  };

  if (loading) return (
    <div className="container">
      <div className="text-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="container">
      <div className="alert alert-danger" role="alert">
        {error}
      </div>
    </div>
  );

  return (
    <div className="container">
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h2 className="mb-0">Bulk Export</h2>
          <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteModal(true)} title="Delete all uploaded and evaluated data">
            <FaTrash className="me-1" /> Delete All Data
          </button>
        </div>
        <div className="card-body">
          <div className="mb-4">
            <label className="form-label">Export Type</label>
            <div className="d-flex align-items-center gap-2">
              <select 
                className="form-select w-auto"
                value={exportType}
                onChange={(e) => setExportType(e.target.value as ExportType)}
              >
                <option value="original">Original Files Only</option>
                <option value="evaluation">Evaluation Files Only</option>
                <option value="both">Both Original and Evaluation</option>
              </select>
              <span data-bs-toggle="tooltip" title={
                exportType === 'original' ? 'The raw uploaded JSON files.' :
                exportType === 'evaluation' ? 'Only the evaluation result files (*_eval.json).' :
                exportType === 'both' ? 'Both original and evaluation files.' :
                ''
              }>
                <FaInfoCircle className="text-info" />
              </span>
            </div>
          </div>
          
          <div className="mb-4">
            <h4>Select Folders to Export</h4>
            <div className="border rounded p-3" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {files.map(node => renderFileNode(node))}
            </div>
          </div>

          <button 
            className="btn btn-primary"
            onClick={handleExport}
            disabled={selectedFolders.size === 0}
          >
            <FaDownload className="me-2" />
            Export Selected Folders
          </button>
        </div>
      </div>
      {showDeleteModal && (
        <div className="modal show d-block" tabIndex={-1}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete All Data</h5>
                <button type="button" className="btn-close" onClick={() => setShowDeleteModal(false)}></button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete <b>all uploaded and evaluated data</b>? This action cannot be undone.</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={handleDeleteAll} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete All Data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 