'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import React from 'react';
import path from 'path';
import { useDropzone } from 'react-dropzone';
import { FaUpload, FaFolder, FaFile } from 'react-icons/fa';

interface JsonFile {
  name: string;
  path: string;
  directory: string;
}

interface GroupedFiles {
  [directory: string]: JsonFile[];
}

interface DirectoryNode {
  name: string;
  path: string;
  children: { [key: string]: DirectoryNode };
  files: JsonFile[];
}

function buildDirectoryTree(files: JsonFile[] = []): DirectoryNode {
  const root: DirectoryNode = {
    name: 'root',
    path: '',
    children: {},
    files: []
  };

  (files || []).forEach(file => {
    // Use directory split for all parent folders, then add the file as a leaf
    const dirParts = file.directory.split('/').filter(Boolean);
    let current = root;
    dirParts.forEach((part, index) => {
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: (current.path ? current.path + '/' : '') + part,
          children: {},
          files: []
        };
      }
      current = current.children[part];
    });
    current.files.push(file);
  });

  return root;
}

function DirectoryTree({ 
  node, 
  onFileSelect,
  searchTerm,
  expandedNodes,
  onToggleNode 
}: { 
  node: DirectoryNode; 
  onFileSelect: (file: JsonFile) => void;
  searchTerm: string;
  expandedNodes: Set<string>;
  onToggleNode: (path: string) => void;
}) {
  const hasMatchingContent = useMemo(() => {
    const matchesSearch = (file: JsonFile) => 
      file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.directory.toLowerCase().includes(searchTerm.toLowerCase());

    const checkNode = (node: DirectoryNode): boolean => {
      if (node.files.some(matchesSearch)) return true;
      return Object.values(node.children).some(checkNode);
    };

    return checkNode(node);
  }, [node, searchTerm]);

  if (!hasMatchingContent && searchTerm) return null;

  const isExpanded = expandedNodes.has(node.path);

  return (
    <div className={styles.treeNode}>
      {Object.keys(node.children).length > 0 && (
        <button 
          className={styles.expandButton}
          onClick={() => onToggleNode(node.path)}
        >
          {isExpanded ? '▼' : '▶'} {node.name === 'root' ? 'Root' : node.name}
        </button>
      )}
      
      {isExpanded && (
        <div className={styles.treeContent}>
          {Object.values(node.children).map((child) => (
            <div key={child.path} className={styles.treeChild}>
              <DirectoryTree 
                node={child} 
                onFileSelect={onFileSelect}
                searchTerm={searchTerm}
                expandedNodes={expandedNodes}
                onToggleNode={onToggleNode}
              />
            </div>
          ))}
          
          {node.files.map((file, index) => {
            const matches = searchTerm ? 
              file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              file.directory.toLowerCase().includes(searchTerm.toLowerCase())
              : true;

            if (!matches) return null;

            return (
              <div
                key={index}
                className={styles.treeFile}
                onClick={() => onFileSelect(file)}
              >
                <span className={styles.fileIcon}>📄</span>
                <span className={styles.fileName}>{file.name}</span>
                {searchTerm && (
                  <span className={styles.matchIndicator}>🔍</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReplaceMergeModal({ open, directory, onReplace, onMerge, onCancel }: {
  open: boolean;
  directory: string;
  onReplace: () => void;
  onMerge: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2>Directory Exists</h2>
        <p>
          A directory named <b>{directory}</b> already exists.<br />
          Would you like to <b>Replace</b> (overwrite) or <b>Merge</b> (add/update only new files)?
        </p>
        <div className={styles.modalActions}>
          <button className={styles.replaceButton} onClick={onReplace}>Replace</button>
          <button className={styles.mergeButton} onClick={onMerge}>Merge</button>
          <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [jsonFiles, setJsonFiles] = useState<JsonFile[]>([]);
  const [groupedFiles, setGroupedFiles] = useState<GroupedFiles>({});
  const [directoryTree, setDirectoryTree] = useState<DirectoryNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedView, setSelectedView] = useState<'tree' | 'grid'>('tree');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['']));
  const [sortOrder, setSortOrder] = useState<'name' | 'date'>('name');
  const [showModal, setShowModal] = useState(false);
  const [modalDirectory, setModalDirectory] = useState('');
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'files' | 'bulk'>('upload');
  const [allFiles, setAllFiles] = useState<any[]>([]);
  const [refreshFiles, setRefreshFiles] = useState(0);
  const [bulkExportLoading, setBulkExportLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Unified upload logic with progress, redirect, and minimum display time
  const uploadFilesWithProgress = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);
    const startTime = Date.now();

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      // Find the full relative directory path (if any)
      let fullDirPath = '';
      if (files.length > 0 && 'webkitRelativePath' in files[0]) {
        const relPath = (files[0] as any).webkitRelativePath;
        if (relPath) {
          const parts = relPath.split('/');
          parts.pop(); // remove filename
          fullDirPath = parts.join('/');
        }
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          const minDisplay = 1000; // ms
          const elapsed = Date.now() - startTime;
          const finish = () => {
            setSuccess('Successfully uploaded files');
            if (fullDirPath) {
              localStorage.setItem('expandDirectory', fullDirPath);
            }
            setTimeout(() => {
              router.push('/files');
            }, 800);
            resolve();
          };
          if (xhr.status >= 200 && xhr.status < 300) {
            if (elapsed < minDisplay) {
              setTimeout(finish, minDisplay - elapsed);
            } else {
              finish();
            }
          } else {
            setError('Upload failed');
            reject(new Error('Upload failed'));
          }
        };
        xhr.onerror = () => {
          setError('Upload failed');
          reject(new Error('Upload failed'));
        };
        xhr.send(formData);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [router]);

  // Use unified upload for drag-and-drop
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    await uploadFilesWithProgress(acceptedFiles);
  }, [uploadFilesWithProgress]);

  // Restore useDropzone destructuring
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
  });

  // Use unified upload for file input
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, mode?: 'replace' | 'merge') => {
    const files = event.target.files || pendingFiles;
    if (!files) return;
    await uploadFilesWithProgress(files);
  };

  const handleFileSelect = (file: JsonFile) => {
    router.push(`/evaluate?file=${encodeURIComponent(file.path)}`);
  };

  const handleToggleNode = (path: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const filteredFiles = useMemo(() => {
    if (!searchTerm) return groupedFiles;

    return Object.entries(groupedFiles).reduce((acc, [dir, files]) => {
      const filtered = files.filter(file => 
        file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.directory.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filtered.length > 0) {
        acc[dir] = filtered;
      }
      return acc;
    }, {} as GroupedFiles);
  }, [groupedFiles, searchTerm]);

  const sortedFiles = useMemo(() => {
    return Object.entries(filteredFiles || {}).reduce((acc, [dir, files]) => {
      acc[dir] = [...(files || [])].sort((a, b) => {
        if (sortOrder === 'name') {
          return a.name.localeCompare(b.name);
        }
        // For date sorting, we'd need to add a timestamp to the file interface
        return 0;
      });
      return acc;
    }, {} as GroupedFiles);
  }, [filteredFiles, sortOrder]);

  // Fetch all uploaded files for the files tab
  useEffect(() => {
    if (activeTab === 'files' || activeTab === 'bulk') {
      fetch('/api/files')
        .then(res => res.json())
        .then(data => setAllFiles(data.files || []));
    }
  }, [activeTab, refreshFiles]);

  // Delete file handler
  const handleDeleteFile = async (file: any) => {
    if (!window.confirm(`Delete ${file.name} and its evaluation?`)) return;
    await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: `/uploads/${file.name}` })
    });
    setRefreshFiles(x => x + 1);
  };

  // Download file handler
  const handleDownloadFile = (file: any) => {
    window.open(`/api/uploads?path=${encodeURIComponent(file.name)}`);
  };

  // Bulk export handler
  const handleBulkExport = async (type: string) => {
    setBulkExportLoading(true);
    const res = await fetch(`/api/files?type=${type}`, { method: 'PUT' });
    if (type === 'merged') {
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json.merged, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bulk_merged_evaluations.json';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bulk_export.zip';
      a.click();
      URL.revokeObjectURL(url);
    }
    setBulkExportLoading(false);
  };

  // Group files by folder for bulk export
  const groupedByFolder = React.useMemo(() => {
    const groups: { [folder: string]: any[] } = {};
    allFiles.forEach(file => {
      const folder = path.dirname(file.name) || 'root';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(file);
    });
    return groups;
  }, [allFiles]);

  // Helper to check if a file is an evaluation file
  const isEvalFile = (file: any) => file.name.endsWith('_eval.json');
  // Helper to get the original file for an eval file
  const getOriginalFile = (evalFile: any) => {
    const origName = evalFile.name.replace('_eval.json', '.json');
    return allFiles.find(f => f.name === origName);
  };

  // Before the return statement, define inputProps for the file input
  const inputProps = {
    type: 'file',
    ref: fileInputRef,
    style: { display: 'none' },
    multiple: true,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleFileUpload(e),
    webkitdirectory: '',
    directory: '',
  };

  return (
    <div className="container">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h2 className="mb-0">Upload Files</h2>
            </div>
            <div className="card-body">
              <div
                {...getRootProps()}
                className={`dropzone p-5 text-center border rounded ${
                  isDragActive ? 'border-primary bg-light' : 'border-secondary'
                }`}
                style={{ cursor: 'pointer' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  {...inputProps}
                />
                <FaUpload className="mb-3" size={48} />
                <h4>Drag and drop a directory here</h4>
                <p className="text-muted">or click to select a directory</p>
                <p className="text-muted small">
                  <FaFolder className="me-1" />
                  All JSON files in the directory and its subdirectories will be uploaded
                </p>
              </div>

              {uploading && (
                <div className="mt-3 text-center">
                  <div className="progressContainer">
                    <div className="progress" style={{ height: 24 }}>
                      <div
                        className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                        role="progressbar"
                        style={{ width: `${uploadProgress}%` }}
                        aria-valuenow={uploadProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        {uploadProgress}%
                      </div>
                    </div>
                    <p className="mt-2">Uploading files... ({uploadProgress}%)</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="alert alert-danger mt-3" role="alert">
                  {error}
                </div>
              )}

              {success && (
                <div className="alert alert-success mt-3" role="alert">
                  {success}
                </div>
              )}

              <div className="mt-4">
                <h4>Instructions</h4>
                <ul className="list-unstyled">
                  <li className="mb-2">
                    <FaFolder className="text-warning me-2" />
                    Upload entire directories containing JSON files
                  </li>
                  <li className="mb-2">
                    <FaFile className="text-primary me-2" />
                    Files will be organized in the same directory structure
                  </li>
                  <li className="mb-2">
                    <FaFile className="text-success me-2" />
                    Evaluation files will be saved alongside original files
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
