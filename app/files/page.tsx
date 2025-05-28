'use client';

import { useState, useEffect, useRef } from 'react';
import { FaFolder, FaFile, FaDownload, FaTrash, FaCheck, FaEdit } from 'react-icons/fa';
import Link from 'next/link';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  evaluated?: boolean;
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const expandedFoldersKey = 'uploadedFiles_expandedFolders';
  const lastSelectedFileKey = 'uploadedFiles_lastSelectedFile';
  const fileRefs = useRef<{ [path: string]: HTMLDivElement | null }>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [evalCompleteness, setEvalCompleteness] = useState<{ [path: string]: boolean | null }>({});

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    // Restore expanded folders and scroll to last selected file
    const stored = localStorage.getItem(expandedFoldersKey);
    if (stored) {
      setExpandedFolders(new Set(JSON.parse(stored)));
    }
    const lastFile = localStorage.getItem(lastSelectedFileKey);
    if (lastFile && fileRefs.current[lastFile]) {
      setTimeout(() => {
        fileRefs.current[lastFile]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, []);

  useEffect(() => {
    // Persist expanded folders
    localStorage.setItem(expandedFoldersKey, JSON.stringify(Array.from(expandedFolders)));
  }, [expandedFolders]);

  // Expand uploaded directory if redirected from upload
  useEffect(() => {
    const expandDir = localStorage.getItem('expandDirectory');
    if (expandDir) {
      // Expand all parent directories in the path
      const parts = expandDir.split('/').filter(Boolean);
      let pathSoFar = '';
      const expanded = new Set<string>();
      for (const part of parts) {
        pathSoFar = pathSoFar ? pathSoFar + '/' + part : part;
        expanded.add(pathSoFar);
      }
      setExpandedFolders(prev => {
        const next = new Set(prev);
        for (const p of expanded) next.add(p);
        return next;
      });
      localStorage.removeItem('expandDirectory');
    }
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

  const handleDelete = async (path: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete file');
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    }
  };

  const handleFileClick = (path: string) => {
    localStorage.setItem(lastSelectedFileKey, path);
  };

  const getOriginalFilePath = (filePath: string) => filePath.endsWith('_eval.json') ? filePath.replace('_eval.json', '.json') : filePath;

  // Helper to check if an evaluation is complete
  const isEvaluationComplete = (evalData: any) => {
    if (!evalData || typeof evalData !== 'object') return false;
    const entities = evalData.judged_structured_information || evalData;
    return Object.entries(entities).every(([entityId, entityArr]) => {
      const arr = entityArr as any[];
      const entity = arr[0];
      if (!entity) return false;
      const status = entity.judge_score?.[0];
      if (status === 1) return true;
      if (status === 0) {
        const orig = entity.original || {};
        return Object.keys(entity).some(field => field !== 'judge_score' && field !== 'corrected' && entity[field] !== orig[field]);
      }
      return false;
    });
  };

  // After files are loaded, fetch completeness for all _eval.json files
  useEffect(() => {
    const fetchAllEvalCompleteness = async () => {
      const evalFiles: string[] = [];
      const walk = (nodes: FileNode[]) => {
        nodes.forEach(node => {
          if (node.type === 'directory' && node.children) walk(node.children);
          if (node.type === 'file' && node.name.endsWith('_eval.json')) evalFiles.push(node.path);
        });
      };
      walk(files);
      for (const path of evalFiles) {
        if (evalCompleteness[path] === undefined) {
          try {
            const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
            if (!res.ok) throw new Error('Not found');
            const data = await res.json();
            setEvalCompleteness(prev => ({ ...prev, [path]: isEvaluationComplete(data) }));
          } catch {
            setEvalCompleteness(prev => ({ ...prev, [path]: null }));
          }
        }
      }
    };
    if (files.length > 0) fetchAllEvalCompleteness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const renderFileNode = (node: FileNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const paddingLeft = `${level * 20}px`;
    const isEvalFile = node.name.endsWith('_eval.json');
    const originalPath = getOriginalFilePath(node.path);

    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <div 
            className="d-flex align-items-center py-2 cursor-pointer"
            style={{ paddingLeft }}
            onClick={() => toggleFolder(node.path)}
          >
            <FaFolder className="text-warning me-2" />
            <span>{node.name}</span>
          </div>
          {isExpanded && node.children?.map(child => renderFileNode(child, level + 1))}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className="d-flex align-items-center py-2"
        style={{ paddingLeft }}
        ref={el => { fileRefs.current[node.path] = el; }}
      >
        <FaFile className="text-primary me-2" />
        <span className="flex-grow-1">{node.name}</span>
        <div className="btn-group">
          {!isEvalFile ? (
            // Original .json file: only Evaluate if not evaluated, else View
            <>
              
                <Link 
                  href={`/evaluate?file=${encodeURIComponent(node.path)}`}
                  className="btn btn-sm btn-outline-warning"
                  title="View/Evaluate"
                  onClick={() => handleFileClick(node.path)}
                >
                  <FaEdit /> View/Evaluate
                </Link>
             
            </>
          ) : (
            // _eval.json file: check completeness
             
              <Link 
                href={`/evaluate?file=${encodeURIComponent(node.path)}`}
                className="btn btn-sm btn-outline-warning"
                title="View/Complete Evaluation"
                onClick={() => handleFileClick(node.path)}
              >
                <FaEdit /> View/Complete Evaluation
              </Link>
            )
  }
          <button
            className="btn btn-sm btn-outline-success"
            onClick={() => {
              const url = `/api/uploads?path=${encodeURIComponent(node.path)}`;
              const a = document.createElement('a');
              a.href = url;
              a.download = node.name;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            title="Download"
          >
            <FaDownload />
          </button>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={() => handleDelete(node.path)}
            title="Delete"
          >
            <FaTrash />
          </button>
        </div>
      </div>
    );
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

  // Helper to render file/folder as a table row (recursive for folders)
  function renderFileNodeRow(node: FileNode, level: number = 0): React.ReactNode {
    const isExpanded = expandedFolders.has(node.path);
    const paddingLeft = `${level * 24}px`;
    const isEvalFile = node.name.endsWith('_eval.json');
    const originalPath = getOriginalFilePath(node.path);

    if (node.type === 'directory') {
      return [
        <tr key={node.path}>
          <td style={{ paddingLeft }}>
            <span className="cursor-pointer" onClick={() => toggleFolder(node.path)}>
              <FaFolder className="text-warning me-2" />{node.name}
            </span>
          </td>
          <td>Folder</td>
          <td></td>
        </tr>,
        isExpanded && node.children?.map(child => renderFileNodeRow(child, level + 1))
      ];
    }

    return (
      <tr key={node.path} ref={el => { fileRefs.current[node.path] = el; }}>
        <td style={{ paddingLeft }}><FaFile className="text-primary me-2" />{node.name}</td>
        <td>File</td>
        <td>
          <div className="btn-group">
            {!isEvalFile ? (
              // Original .json file: only Evaluate if not evaluated, else View
              <>
              
                  <Link 
                    href={`/evaluate?file=${encodeURIComponent(node.path)}`}
                    className="btn btn-sm btn-outline-warning"
                    title="View/Evaluate"
                    onClick={() => handleFileClick(node.path)}
                  >
                    <FaEdit /> View/Evaluate
                  </Link>
                 
              </>
            ) : (
               
                <Link 
                  href={`/evaluate?file=${encodeURIComponent(node.path)}`}
                  className="btn btn-sm btn-outline-warning"
                  title="View/Complete Evaluation"
                  onClick={() => handleFileClick(node.path)}
                >
                  <FaEdit /> View/Complete Evaluation
                </Link>
              )
  }
            <button
              className="btn btn-sm btn-outline-success"
              onClick={() => {
                const url = `/api/uploads?path=${encodeURIComponent(node.path)}`;
                const a = document.createElement('a');
                a.href = url;
                a.download = node.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
              title="Download"
            >
              <FaDownload />
            </button>
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={() => handleDelete(node.path)}
              title="Delete"
            >
              <FaTrash />
            </button>
          </div>
        </td>
      </tr>
    );
  }

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
          <h2 className="mb-0">Uploaded Files</h2>
          <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteModal(true)} title="Delete all uploaded and evaluated data">
            <FaTrash className="me-1" /> Delete All Data
          </button>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-bordered align-middle">
              <thead>
                <tr>
                  <th style={{ width: '60%' }}>Name</th>
                  <th style={{ width: '15%' }}>Type</th>
                  <th style={{ width: '25%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map(node => renderFileNodeRow(node, 0))}
              </tbody>
            </table>
          </div>
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