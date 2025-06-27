'use client';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { FaCheck, FaTimes, FaSave, FaThumbsUp, FaThumbsDown } from 'react-icons/fa';
import fs from 'fs';
import { Modal, Button, Form } from 'react-bootstrap';
import React from 'react';

interface Entity {
  [key: string]: any; // Allow dynamic fields
  entity?: string;
  label?: string;
  ontology_id?: string | null;
  ontology_label?: string | null;
  sentence?: string[];
  start?: number[];
  end?: number[];
  judge_score?: number[];
  remarks?: string[];
  paper_location?: string[];
  paper_title?: string;
  doi?: string[];
  corrected?: boolean;
  corrections?: Record<string, any>;
  approved?: boolean;
}

interface Evaluation {
  [key: string]: Entity[] | Record<string, Entity[]>;
}

// Universal JSON structure analysis interfaces
interface EntityCandidate {
  type: 'single_entity' | 'array_of_entities' | 'nested_collection';
  path: string;
  count: number;
  sample: any;
  confidence: number;
  data: any;
}

interface StructureAnalysis {
  type: string;
  entityCandidates: EntityCandidate[];
  bestCandidate: EntityCandidate | null;
  metadata: {
    totalObjects: number;
    maxDepth: number;
    hasArrays: boolean;
    hasNestedObjects: boolean;
  };
}

// Universal entity detection - completely dynamic, no hardcoded assumptions
function analyzeStructureDynamically(data: any, path: string = 'root'): StructureAnalysis {
  const candidates: EntityCandidate[] = [];
  let totalObjects = 0;
  let maxDepth = 0;
  let hasArrays = false;
  let hasNestedObjects = false;

  function analyzeNode(node: any, currentPath: string, depth: number) {
    maxDepth = Math.max(maxDepth, depth);
    
    if (Array.isArray(node)) {
      hasArrays = true;
      if (node.length > 0) {
        const firstItem = node[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          // Array of objects - high confidence entities
          candidates.push({
            type: 'array_of_entities',
            path: currentPath,
            count: node.length,
            sample: firstItem,
            confidence: calculateEntityConfidence(node),
            data: node
          });
          totalObjects += node.length;
        }
      }
    } else if (typeof node === 'object' && node !== null) {
      hasNestedObjects = true;
      totalObjects++;
      
      // Analyze if this object looks like a single entity
      const entityAnalysis = analyzeObjectStructure(node);
      
      if (entityAnalysis.looksLikeEntity) {
        candidates.push({
          type: 'single_entity',
          path: currentPath,
          count: 1,
          sample: node,
          confidence: entityAnalysis.confidence,
          data: node
        });
      }
      
      // Recursively analyze nested objects (limit depth to prevent infinite recursion)
      if (depth < 10) {
        Object.entries(node).forEach(([key, value]) => {
          const newPath = currentPath === 'root' ? key : `${currentPath}.${key}`;
          analyzeNode(value, newPath, depth + 1);
        });
      }
    }
  }

  analyzeNode(data, path, 0);

  // Determine the best candidate based on confidence and context
  const bestCandidate = selectBestCandidate(candidates, data);

  return {
    type: determineStructureType(data, candidates),
    entityCandidates: candidates.sort((a, b) => b.confidence - a.confidence),
    bestCandidate,
    metadata: {
      totalObjects,
      maxDepth,
      hasArrays,
      hasNestedObjects
    }
  };
}

function calculateEntityConfidence(data: any): number {
  if (Array.isArray(data)) {
    if (data.length === 0) return 0;
    
    const firstItem = data[0];
    if (typeof firstItem !== 'object' || firstItem === null) return 0.1;
    
    // Higher confidence for arrays with consistent object structure
    const allSimilar = data.every(item => 
      typeof item === 'object' && 
      item !== null && 
      Object.keys(item).length > 0
    );
    
    return allSimilar ? 0.9 : 0.6;
  }
  
  if (typeof data === 'object' && data !== null) {
    return analyzeObjectStructure(data).confidence;
  }
  
  return 0;
}

function analyzeObjectStructure(obj: any): { looksLikeEntity: boolean; confidence: number } {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { looksLikeEntity: false, confidence: 0 };
  }

  const keys = Object.keys(obj);
  const values = Object.values(obj);
  
  if (keys.length === 0) {
    return { looksLikeEntity: false, confidence: 0 };
  }

  // Dynamic structural analysis - no hardcoded field names
  const metrics = {
    size: keys.length,
    primitiveCount: values.filter(v => typeof v !== 'object' || v === null).length,
    arrayCount: values.filter(v => Array.isArray(v)).length,
    objectCount: values.filter(v => typeof v === 'object' && v !== null && !Array.isArray(v)).length,
    nullCount: values.filter(v => v === null).length,
    depth: calculateMaxDepth(obj)
  };

  const primitiveRatio = metrics.primitiveCount / values.length;
  
  // Dynamic scoring based on structural patterns
  let entityScore = 0;
  
  // Smaller objects with mixed content are more likely entities
  if (metrics.size <= 20 && primitiveRatio > 0.3) entityScore += 0.4;
  
  // Objects with few large arrays are less likely to be entities (more likely containers)
  if (metrics.arrayCount <= 2) entityScore += 0.3;
  else if (metrics.arrayCount > 5) entityScore -= 0.2;
  
  // Shallow objects are more likely entities
  if (metrics.depth <= 3) entityScore += 0.2;
  else if (metrics.depth > 6) entityScore -= 0.1;
  
  // Balanced mix of primitives and objects suggests entity
  if (primitiveRatio > 0.2 && primitiveRatio < 0.8) entityScore += 0.1;
  
  // Very large objects are less likely to be single entities
  if (metrics.size > 50) entityScore -= 0.3;
  
  return {
    looksLikeEntity: entityScore > 0.5,
    confidence: Math.max(0, Math.min(1, entityScore))
  };
}

function calculateMaxDepth(obj: any, currentDepth: number = 0): number {
  if (typeof obj !== 'object' || obj === null || currentDepth > 10) {
    return currentDepth;
  }
  
  let maxDepth = currentDepth;
  
  if (Array.isArray(obj)) {
    for (const item of obj) {
      maxDepth = Math.max(maxDepth, calculateMaxDepth(item, currentDepth + 1));
    }
  } else {
    for (const value of Object.values(obj)) {
      maxDepth = Math.max(maxDepth, calculateMaxDepth(value, currentDepth + 1));
    }
  }
  
  return maxDepth;
}

function determineStructureType(data: any, candidates: EntityCandidate[]): string {
  if (Array.isArray(data)) return 'direct_array';
  if (typeof data !== 'object' || data === null) return 'primitive';
  
  if (candidates.length === 0) return 'single_object';
  if (candidates.length === 1) return 'single_collection';
  return 'complex_structure';
}

function selectBestCandidate(candidates: EntityCandidate[], originalData: any): EntityCandidate | null {
  if (candidates.length === 0) {
    // No candidates found - treat the whole thing as a single entity if it's an object
    if (typeof originalData === 'object' && originalData !== null && !Array.isArray(originalData)) {
      return {
        type: 'single_entity',
        path: 'root',
        count: 1,
        sample: originalData,
        confidence: 0.5,
        data: originalData
      };
    }
    return null;
  }
  
  // Sort by confidence and prefer arrays over single objects (more entities to evaluate)
  const sorted = candidates.sort((a, b) => {
    if (Math.abs(a.confidence - b.confidence) < 0.1) {
      // Similar confidence - prefer more entities
      return b.count - a.count;
    }
    return b.confidence - a.confidence;
  });
  
  return sorted[0];
}

// Universal normalization function - handles any JSON structure
function universalNormalizeData(data: any): Evaluation {
  // Handle null/undefined
  if (!data) return {};
  
  // Direct array at root level
  if (Array.isArray(data)) {
    const evalObj: Evaluation = {};
    data.forEach((item, idx) => {
      if (typeof item === 'object' && item !== null) {
        evalObj[(idx + 1).toString()] = [{ ...item }];
      }
    });
    return evalObj;
  }
  
  // Analyze the structure dynamically
  const analysis = analyzeStructureDynamically(data);
  
  // Use the best candidate or fallback strategies
  if (analysis.bestCandidate) {
    const candidate = analysis.bestCandidate;
    
    if (candidate.type === 'array_of_entities') {
      const evalObj: Evaluation = {};
      candidate.data.forEach((item: any, idx: number) => {
        evalObj[(idx + 1).toString()] = [{ ...item }];
      });
      return evalObj;
    } else if (candidate.type === 'single_entity') {
      return { "1": [{ ...candidate.data }] };
    }
  }
  
  // Fallback: treat entire object as single entity
  if (typeof data === 'object' && data !== null) {
    return { "1": [{ ...data }] };
  }
  
  // Final fallback: empty object
  return {};
}

// Helper to highlight entity in sentence, with case-insensitive correction
function highlightEntity(sentence: string, start: number, end: number, entityText?: string) {
  if (entityText) {
    const lowerSentence = sentence.toLowerCase();
    const lowerEntity = entityText.toLowerCase();
    const idx = lowerSentence.indexOf(lowerEntity);
    if (idx !== -1) {
      start = idx;
      end = idx + entityText.length;
    }
  }
  // Fallback: if indices are still invalid, don't highlight
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    start < 0 ||
    end > sentence.length ||
    start >= end
  ) {
    return sentence;
  }
  return (
    <span>
      {sentence.slice(0, start)}
      <mark style={{ background: '#ffe066', padding: 0 }}>{sentence.slice(start, end)}</mark>
      {sentence.slice(end)}
    </span>
  );
}

// Helper to safely display any value in a table cell, fully dynamic and type-agnostic
function displayValue(val: any, isCorrected: boolean, origVal: any) {
  // Helper to stringify any value for display
  const toDisplay = (v: any) => {
    if (v == null) return '';
    if (typeof v === 'object') {
      if (Array.isArray(v)) return v.join(', ');
      // Render objects as formatted JSON
      return <pre style={{ margin: 0, display: 'inline', whiteSpace: 'pre-wrap' }}>{JSON.stringify(v, null, 2)}</pre>;
    }
    return String(v);
  };
  // Robust equality check for all types
  const isEqual = (a: any, b: any): boolean => {
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return a === b;
  };
  if (isCorrected && !isEqual(val, origVal)) {
    return (
      <span>
        <span className="text-decoration-line-through text-danger">
          {typeof origVal === 'object' && origVal !== null
            ? <pre style={{ margin: 0, display: 'inline', whiteSpace: 'pre-wrap' }}>{JSON.stringify(origVal, null, 2)}</pre>
            : toDisplay(origVal)}
        </span>
        <span className="text-success ms-2">
          ✓ {typeof val === 'object' && val !== null
            ? <pre style={{ margin: 0, display: 'inline', whiteSpace: 'pre-wrap' }}>{JSON.stringify(val, null, 2)}</pre>
            : toDisplay(val)}
        </span>
      </span>
    );
  }
  return toDisplay(val);
}

// Helper to update nested value in an object immutably
function setNestedValue(obj: any, path: (string | number)[], value: any): any {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  if (Array.isArray(obj)) {
    const idx = Number(key);
    return obj.map((item, i) => (i === idx ? setNestedValue(item, rest, value) : item));
  }
  return {
    ...obj,
    [key]: rest.length ? setNestedValue(obj[key] ?? {}, rest, value) : value,
  };
}

// Helper to get nested value from an object
function getNestedValue(obj: any, path: (string | number)[]): any {
  return path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

// Helper: Deep equality check for all types
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual(a[key], b[key]));
  }
  return false;
}

// Helper: Prevent runaway recursion
const MAX_RENDER_DEPTH = 8;

// Fix renderFieldsReadOnly to prevent infinite recursion and robustly highlight corrections
function renderFieldsReadOnly({
  data,
  origData = {},
  corrections = {},
  path = [],
  level = 0,
  maxDepth = MAX_RENDER_DEPTH,
}: {
  data: Record<string, any>;
  origData?: Record<string, any>;
  corrections?: Record<string, any>;
  path?: (string | number)[];
  level?: number;
  maxDepth?: number;
}): React.ReactNode {
  if (typeof data !== 'object' || data === null || level > maxDepth) {
    return <></>;
  }
  return (
    <>
      {Object.entries(data).map(([key, value]) => {
        if (key === 'corrections') return <></>; // Do not render corrections block in card
        const fieldPath = [...path, key];
        const label = key.replace(/_/g, ' ');
        const style = { marginLeft: level * 20 };
        const fieldCorrection = (corrections as any)[key];
        const origValue = (origData as any)[key];
        // Prevent rendering if value is a direct self-reference (avoid runaway recursion)
        if (typeof value === 'object' && value === data) return <></>;
        // Array handling
        if (Array.isArray(value)) {
          return (
            <div key={key} style={style} className="mb-2">
              <div className="fw-bold">{label}:</div>
              {value.map((item: any, idx: number) => (
                <div key={idx} style={{ marginLeft: 20 }}>
                  {Array.isArray(fieldCorrection) && fieldCorrection[idx] !== undefined && !deepEqual(item, fieldCorrection[idx]) ? (
                    // Highlight changed array element
                    <div>
                      <span className="text-decoration-line-through text-danger">{JSON.stringify(fieldCorrection[idx])}</span>
                      <span className="text-success ms-2">&#10003; {JSON.stringify(item)}</span>
                    </div>
                  ) : (
                    typeof item === 'object' && item !== null ? (
                      renderFieldsReadOnly({ data: item, origData: Array.isArray(origValue) ? origValue[idx] : undefined, corrections: Array.isArray(fieldCorrection) ? fieldCorrection[idx] : {}, path: [...fieldPath, idx], level: level + 2, maxDepth })
                    ) : (
                      <div>{item ?? ''}</div>
                    )
                  )}
                </div>
              ))}
            </div>
          );
        } else if (typeof value === 'object' && value !== null) {
          // Object: recursively highlight only changed subfields
          return (
            <div key={key} style={style} className="mb-2 border-start ps-2">
              <div className="fw-bold">{label}:</div>
              {Object.keys(value).map(subKey => {
                const subValue = value[subKey];
                const origSubValue = origValue ? (origValue as any)[subKey] : undefined;
                const correctionSubValue = fieldCorrection ? (fieldCorrection as any)[subKey] : undefined;
                const subLabel = subKey.replace(/_/g, ' ');
                // If changed, highlight
                if (correctionSubValue !== undefined && !deepEqual(subValue, correctionSubValue)) {
                  return (
                    <div key={subKey} style={{ marginLeft: (level + 1) * 20 }} className="mb-2">
                      <span className="fw-bold">{subLabel}:</span> <span className="text-decoration-line-through text-danger">{JSON.stringify(correctionSubValue)}</span> <span className="text-success ms-2">&#10003; {JSON.stringify(subValue)}</span>
                    </div>
                  );
                }
                // If not changed and is object/array, recurse
                if (typeof subValue === 'object' && subValue !== null) {
                  return renderFieldsReadOnly({ data: subValue, origData: origSubValue, corrections: correctionSubValue, path: [...fieldPath, subKey], level: level + 1, maxDepth });
                }
                // Not changed, primitive
                return (
                  <div key={subKey} style={{ marginLeft: (level + 1) * 20 }} className="mb-2">
                    <span className="fw-bold">{subLabel}:</span> {String(subValue ?? '')}
                  </div>
                );
              })}
            </div>
          );
        } else {
          // Inline correction display for all fields
          if (fieldCorrection !== undefined && !deepEqual(value, fieldCorrection)) {
            return (
              <div key={key} style={style} className="mb-2">
                <span className="fw-bold">{label}:</span> <span className="text-decoration-line-through text-danger">{String(fieldCorrection)}</span> <span className="text-success ms-2">&#10003; {String(value)}</span>
              </div>
            );
          }
          return (
            <div key={key} style={style} className="mb-2">
              <span className="fw-bold">{label}:</span> {value ?? ''}
            </div>
          );
        }
      })}
    </>
  );
}

function getChangedFields(newVal: any, origVal: any): any {
  if (deepEqual(newVal, origVal)) return undefined;
  if (typeof newVal !== 'object' || newVal === null) return origVal;
  if (Array.isArray(newVal)) {
    // Only return changed indices, keep undefined for unchanged
    return newVal.map((item: any, idx: number) => getChangedFields(item, origVal ? origVal[idx] : undefined));
  }
  // For objects, only keep changed keys
  const changed: Record<string, any> = {};
  Object.keys(newVal).forEach(key => {
    const subChange = getChangedFields(newVal[key], origVal ? origVal[key] : undefined);
    if (subChange !== undefined) changed[key] = origVal ? origVal[key] : undefined;
  });
  return Object.keys(changed).length > 0 ? changed : undefined;
}

// Recursive field renderer for the modal, with highlight for changed fields
function renderFields({
  data,
  origData,
  path = [],
  onChange,
  level = 0,
}: {
  data: any;
  origData: any;
  path?: (string | number)[];
  onChange: (path: (string | number)[], value: any) => void;
  level?: number;
}): React.ReactNode {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  return Object.entries(data).map(([key, value]) => {
    const fieldPath = [...path, key];
    const label = key.replace(/_/g, ' ');
    const style = { marginLeft: level * 20 };
    const origValue = origData ? origData[key] : undefined;
    const isChanged = JSON.stringify(value) !== JSON.stringify(origValue);
    const highlightClass = isChanged ? 'changed-field' : '';
    if (Array.isArray(value)) {
      return (
        <div key={key} style={style} className={`mb-2 ${highlightClass}`}>
          <label className="form-label fw-bold">{label}:</label>
          {value.map((item: any, idx: number) => (
            <div key={idx} style={{ marginLeft: 20 }}>
              {typeof item === 'object' && item !== null ? (
                renderFields({ data: item, origData: origValue, path: [...fieldPath, idx], onChange, level: level + 2 })
              ) : (
                <input
                  className="form-control mb-1"
                  value={String(item ?? '')}
                  onChange={e => {
                    const arr = [...value];
                    arr[idx] = e.target.value;
                    onChange(fieldPath, arr);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      );
    } else if (typeof value === 'object' && value !== null) {
      return (
        <div key={key} style={style} className={`mb-2 border-start ps-2 ${highlightClass}`}>
          <label className="form-label fw-bold">{label}:</label>
          {renderFields({ data: value, origData: origValue, path: fieldPath, onChange, level: level + 1 })}
        </div>
      );
    } else {
      return (
        <div key={key} style={style} className={`mb-2 ${highlightClass}`}>
          <label className="form-label fw-bold">{label}:</label>
          <input
            className="form-control"
            value={String(value ?? '')}
            onChange={e => onChange(fieldPath, e.target.value)}
          />
        </div>
      );
    }
  });
}

export default function EvaluatePage() {
  const searchParams = useSearchParams();
  const filePath = searchParams.get('file');

  const [data, setData] = useState<any>(null);
  const [structureAnalysis, setStructureAnalysis] = useState<StructureAnalysis | null>(null);
  const [evaluations, setEvaluations] = useState<{ [path: string]: Evaluation }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [corrections, setCorrections] = useState<{ [key: string]: { [field: string]: boolean } }>({});
  const [editMode, setEditMode] = useState<{ [key: string]: boolean }>({});
  const [evaluationStatus, setEvaluationStatus] = useState<{ [key: string]: 'pending' | 'approved' | 'corrected' }>({});
  const [originalValues, setOriginalValues] = useState<{ [entityId: string]: { [field: string]: any } }>({});
  const [hasEvalFile, setHasEvalFile] = useState(false);
  const [modalEntityId, setModalEntityId] = useState<string | null>(null);
  const [modalEntityIndex, setModalEntityIndex] = useState<number>(0);
  const [modalCandidatePath, setModalCandidatePath] = useState<string | null>(null);

  const getEvalPath = (filePath: string) => filePath.endsWith('_eval.json') ? filePath : filePath.replace('.json', '_eval.json');

  useEffect(() => {
    if (!filePath) {
      setError('No file specified');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch original file
        const response = await fetch(`/api/files?path=${encodeURIComponent(filePath)}`);
        if (!response.ok) {
          setError('Original file not found. Please check the file path.');
          setLoading(false);
          return;
        }
        const originalData = await response.json();

        // Try to fetch evaluation file
        const evalPath = getEvalPath(filePath);
        const evalResponse = await fetch(`/api/files?path=${encodeURIComponent(evalPath)}`);
        let evalData = null;
        if (evalResponse.ok) {
          evalData = await evalResponse.json();
        }

        setData(originalData);
        
        // Always analyze the ORIGINAL data structure, not the eval data
        const analysis = analyzeStructureDynamically(originalData);
        setStructureAnalysis(analysis);
        
        // For each candidate, set up evaluation state
        const evals: { [path: string]: Evaluation } = {};
        
        if (analysis.entityCandidates.length > 0) {
          analysis.entityCandidates.forEach(candidate => {
            // Use original data for structure, but merge with eval data if available
            const candidateData = candidate.data;
            const normalizedData = universalNormalizeData(candidateData);
            
            // If we have eval data, try to merge it
            if (evalData) {
              // Try to find corresponding eval data for this candidate
              const evalAnalysis = analyzeStructureDynamically(evalData);
              const evalCandidate = evalAnalysis.entityCandidates.find(
                ec => ec.path === candidate.path
              );
              
              if (evalCandidate) {
                // Merge eval data with original structure
                const evalNormalized = universalNormalizeData(evalCandidate.data);
                
                // Merge the data, keeping original structure but updating with eval values
                Object.keys(evalNormalized).forEach(entityId => {
                  if (normalizedData[entityId] && Array.isArray(normalizedData[entityId])) {
                    normalizedData[entityId] = Array.isArray(normalizedData[entityId])
                      ? (normalizedData[entityId] as Array<Entity>).map((entity: Entity, idx: number) => {
                          const evalEntity = evalNormalized[entityId] && Array.isArray(evalNormalized[entityId]) 
                            ? evalNormalized[entityId][idx] 
                            : null;
                          if (evalEntity) {
                            // Merge eval data with original entity, preserving all original fields
                            return {
                              ...entity,
                              ...evalEntity,
                              // Ensure we don't lose original data
                              ...Object.keys(entity).reduce((acc, key) => {
                                if (evalEntity[key] === undefined) {
                                  acc[key] = entity[key];
                                }
                                return acc;
                              }, {} as any)
                            };
                          }
                          return entity;
                        })
                      : [];
                  }
                });
              } else {
                // If no matching candidate found in eval data, check if eval data has a 'root' structure
                if (evalData && typeof evalData === 'object') {
                  const evalNormalized = universalNormalizeData(evalData);
                  Object.keys(evalNormalized).forEach(entityId => {
                    if (normalizedData[entityId] && Array.isArray(normalizedData[entityId])) {
                      normalizedData[entityId] = Array.isArray(normalizedData[entityId])
                        ? (normalizedData[entityId] as Array<Entity>).map((entity: Entity, idx: number) => {
                            const evalEntity = evalNormalized[entityId] && Array.isArray(evalNormalized[entityId]) 
                              ? evalNormalized[entityId][idx] 
                              : null;
                            if (evalEntity) {
                              return {
                                ...entity,
                                ...evalEntity,
                                ...Object.keys(entity).reduce((acc, key) => {
                                  if (evalEntity[key] === undefined) {
                                    acc[key] = entity[key];
                                  }
                                  return acc;
                                }, {} as any)
                              };
                            }
                            return entity;
                          })
                        : [];
                    }
                  });
                }
              }
            }
            
            evals[candidate.path] = normalizedData;
          });
        } else {
          // Fallback: if no candidates found, treat the whole data as a single entity
          const normalizedData = universalNormalizeData(originalData);
          
          // If we have eval data, merge it
          if (evalData) {
            const evalNormalized = universalNormalizeData(evalData);
            Object.keys(evalNormalized).forEach(entityId => {
              if (normalizedData[entityId] && Array.isArray(normalizedData[entityId])) {
                normalizedData[entityId] = Array.isArray(normalizedData[entityId])
                  ? (normalizedData[entityId] as Array<Entity>).map((entity: Entity, idx: number) => {
                      const evalEntity = evalNormalized[entityId] && Array.isArray(evalNormalized[entityId]) 
                        ? evalNormalized[entityId][idx] 
                        : null;
                      if (evalEntity) {
                        return {
                          ...entity,
                          ...evalEntity,
                          ...Object.keys(entity).reduce((acc, key) => {
                            if (evalEntity[key] === undefined) {
                              acc[key] = entity[key];
                            }
                            return acc;
                          }, {} as any)
                        };
                      }
                      return entity;
                    })
                  : [];
              }
            });
          }
          
          evals['root'] = normalizedData;
        }
        
        // Ensure we always have at least one evaluation entry
        if (Object.keys(evals).length === 0) {
          evals['root'] = universalNormalizeData(originalData);
        }
        
        // Debug logging
        console.log('Original data:', originalData);
        console.log('Eval data:', evalData);
        console.log('Analysis:', analysis);
        console.log('Evaluations:', evals);
        
        setEvaluations(evals);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filePath]);

  // Check if _eval.json exists for the current file
  useEffect(() => {
    if (!filePath || filePath.endsWith('_eval.json')) {
      setHasEvalFile(false);
      return;
    }
    const evalPath = filePath.replace('.json', '_eval.json');
    fetch(`/api/files?path=${encodeURIComponent(evalPath)}`)
      .then(res => setHasEvalFile(res.ok))
      .catch(() => setHasEvalFile(false));
  }, [filePath]);

  // Helper to get all unique fields from all entities
  const allFields = Object.values(evaluations['root'] || {}).flat().reduce((fields, entity) => {
    Object.keys(entity).forEach(f => fields.add(f));
    return fields;
  }, new Set<string>());

  const handleFieldChange = (candidatePath: string, entityId: string, index: number, field: string, value: any) => {
    setEvaluations(prev => ({
      ...prev,
      [candidatePath]: {
        ...prev[candidatePath],
        [entityId]: prev[candidatePath][entityId].map((entity, i) =>
          i === index ? { ...entity, [field]: value } : entity
        ),
      },
    }));
    setCorrections(prev => ({
      ...prev,
      [entityId]: { ...(prev[entityId] || {}), [field]: true },
    }));
  };

  const handleScoreChange = (candidatePath: string, entityId: string, index: number, score: number) => {
    setEvaluations(prev => ({
      ...prev,
      [candidatePath]: {
        ...prev[candidatePath],
        [entityId]: prev[candidatePath][entityId].map((entity, i) =>
          i === index ? { ...entity, judge_score: [score] } : entity
        ),
      },
    }));
    setEditMode(prev => ({ ...prev, [entityId]: score === 0 }));
  };

  const handleApprove = (candidatePath: string, entityId: string) => {
    setEvaluations(prev => {
      const newEvals = { ...prev };
      if (!newEvals[candidatePath]) {
        newEvals[candidatePath] = {};
      }
      
      const entities = newEvals[candidatePath];
      if (Array.isArray(entities)) {
        const entityIndex = parseInt(entityId) - 1;
        if (entities[entityIndex]) {
          entities[entityIndex] = {
            ...entities[entityIndex],
            approved: true,
            corrected: false
          };
        }
      } else if (typeof entities === 'object' && entities !== null) {
        if (entities[entityId] && Array.isArray(entities[entityId])) {
          entities[entityId] = entities[entityId].map(entity => ({
            ...entity,
            approved: true,
            corrected: false
          }));
        }
      }
      
      return newEvals;
    });
  };

  const handleStartCorrection = (candidatePath: string, entityId: string, idx: number = 0) => {
    setModalEntityId(entityId);
    setModalEntityIndex(idx);
    setModalCandidatePath(candidatePath);
    
    // Store original values for comparison
    setOriginalValues(prev => {
      const newOrig = { ...prev };
      const entities = evaluations[candidatePath];
      let entity: Entity | null = null;
      
      if (Array.isArray(entities)) {
        const entityIndex = parseInt(entityId) - 1;
        entity = entities[entityIndex] || null;
      } else if (typeof entities === 'object' && entities !== null) {
        const entityIdKey = entityId as keyof typeof entities;
        if (entities[entityIdKey] && Array.isArray(entities[entityIdKey])) {
          entity = entities[entityIdKey][idx] || null;
        }
      }
      
      if (entity) {
        newOrig[entityId] = { ...entity };
      }
      
      return newOrig;
    });
    
    // Mark as needing correction
    setEvaluations(prev => {
      const newEvals = { ...prev };
      if (!newEvals[candidatePath]) {
        newEvals[candidatePath] = {};
      }
      
      const entities = newEvals[candidatePath];
      if (Array.isArray(entities)) {
        const entityIndex = parseInt(entityId) - 1;
        if (entities[entityIndex]) {
          entities[entityIndex] = {
            ...entities[entityIndex],
            approved: false,
            corrected: true
          };
        }
      } else if (typeof entities === 'object' && entities !== null) {
        const entityIdKey = entityId as keyof typeof entities;
        if (entities[entityIdKey] && Array.isArray(entities[entityIdKey])) {
          entities[entityIdKey] = entities[entityIdKey].map(entity => ({
            ...entity,
            approved: false,
            corrected: true
          }));
        }
      }
      
      return newEvals;
    });
  };

  const handleCloseModal = () => {
    setModalEntityId(null);
    setModalEntityIndex(0);
    setModalCandidatePath(null);
  };

  const handleSave = async () => {
    if (!filePath) {
      setError('No file path provided');
      return;
    }

    setSaving(true);
    try {
      // Prepare a clean, serializable version of the evaluations state
      const cleanEvaluations: Record<string, any> = {};

      Object.entries(evaluations).forEach(([section, entities]) => {
        if (Array.isArray(entities)) {
          cleanEvaluations[section] = entities.map(entity => ({ ...entity }));
        } else if (typeof entities === 'object' && entities !== null) {
          cleanEvaluations[section] = {};
          Object.entries(entities).forEach(([entityId, entityArr]) => {
            if (Array.isArray(entityArr)) {
              cleanEvaluations[section][entityId] = entityArr.map(entity => ({ ...entity }));
            }
          });
        }
      });

      const evalPath = getEvalPath(filePath!);
      const response = await fetch(`/api/files?path=${encodeURIComponent(evalPath)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanEvaluations, null, 2),
      });

      if (!response.ok) throw new Error('Failed to save evaluation');
      alert('Evaluation saved successfully');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save evaluation');
    } finally {
      setSaving(false);
    }
  };

  // Helper to check if an entity is corrected (any field changed from original)
  function isEntityCorrected(entityId: string, entity: Entity): boolean {
    const orig = originalValues[entityId] || {};
    return Object.keys(entity).some(field => field !== 'judge_score' && field !== 'corrected' && field !== 'corrections' && entity[field] !== orig[field]);
  }

  // Helper to check if all entities are evaluated
  const allEvaluated = Object.entries(evaluations).every(([entityId, entities]) => {
    const entity = Array.isArray(entities) ? entities[0] : null;
    if (!entity) return false;
    if (entity.approved === true || entity.approved === false) return true;
    return false;
  })

  // Helper to check if viewing _eval.json
  const isViewingEvalFile = filePath?.endsWith('_eval.json') ?? false;

  // Helper to check if save button should be shown
  // Always show if viewing _eval.json (for partial evaluation), or if not viewing _eval.json and no _eval.json exists
  const shouldShowSaveButton = (isViewingEvalFile) || (!isViewingEvalFile && !hasEvalFile);

  // Place handleSaveCorrection here so it has access to state
  const handleSaveCorrection = (entityId: string) => {
    if (!modalCandidatePath) return;
    setEvaluations((prev: any) => {
      const newEvals = { ...prev };
      if (!newEvals[modalCandidatePath]) {
        newEvals[modalCandidatePath] = {};
      }
      const entities = newEvals[modalCandidatePath];
      const orig = originalValues[entityId] || {};
      if (Array.isArray(entities)) {
        const entityIndex = parseInt(entityId) - 1;
        if (entities[entityIndex]) {
          const entity = entities[entityIndex];
          const corrections: any = {};
          Object.keys(entity).forEach(field => {
            if (field !== 'approved' && field !== 'corrections' && field !== 'corrected') {
              const changed = getChangedFields(entity[field], orig[field]);
              if (changed !== undefined) corrections[field] = orig[field];
            }
          });
          entities[entityIndex] = {
            ...entity,
            corrections,
            approved: false,
            corrected: Object.keys(corrections).length > 0
          };
        }
      } else if (typeof entities === 'object' && entities !== null) {
        const entityIdKey = entityId as keyof typeof entities;
        if (entities[entityIdKey] && Array.isArray(entities[entityIdKey])) {
          entities[entityIdKey] = (entities[entityIdKey] as any[]).map((entity: any) => {
            const corrections: any = {};
            Object.keys(entity).forEach(field => {
              if (field !== 'approved' && field !== 'corrections' && field !== 'corrected') {
                const changed = getChangedFields(entity[field], orig[field]);
                if (changed !== undefined) corrections[field] = orig[field];
              }
            });
            return {
              ...entity,
              corrections,
              approved: false,
              corrected: Object.keys(corrections).length > 0
            };
          });
        }
      }
      return newEvals;
    });
  };

  const stripMetaFields = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) return obj;
    const { approved, corrected, corrections, ...rest } = obj;
    // Recursively strip from nested objects/arrays
    Object.keys(rest).forEach(key => {
      if (typeof rest[key] === 'object' && rest[key] !== null) {
        rest[key] = stripMetaFields(rest[key]);
      }
    });
    if (Array.isArray(obj)) {
      return obj.map(stripMetaFields);
    }
    return rest;
  };

  // Build the list of entities to display from the original data, not from the evaluation state
  const allEntityCards: Array<{
    entity: Entity;
    entityId: string;
    candidatePath: string;
    idx: number;
    allFields: Set<string>;
    evalInfo: Partial<Entity>;
  }> = [];

  if (structureAnalysis && structureAnalysis.entityCandidates.length > 0) {
    structureAnalysis.entityCandidates.forEach(candidate => {
      // Always extract from the original data
      const candidateData = candidate.data;
      const normalizedData = universalNormalizeData(candidateData);
      const allFields = Object.values(normalizedData).flat().reduce((fields, entity: Entity) => {
        Object.keys(entity).forEach(f => fields.add(f));
        return fields;
      }, new Set<string>());
      Object.entries(normalizedData).forEach(([entityId, entities]) => {
        if (!Array.isArray(entities)) return;
        (entities as Array<Entity>).forEach((entity: Entity, idx: number) => {
          // Merge in evaluation info if present
          let evalInfo: Partial<Entity> = {};
          const evalSection = evaluations[candidate.path];
          if (evalSection && Array.isArray(evalSection[entityId])) {
            evalInfo = (evalSection[entityId] as Array<Entity>)[idx] || {};
          }
          allEntityCards.push({ entity, entityId, candidatePath: candidate.path, idx, allFields, evalInfo });
        });
      });
    });
  }
  // Fallback: add root entities if no candidates
  if (allEntityCards.length === 0 && data) {
    const normalizedData = universalNormalizeData(data);
    const allFields = Object.values(normalizedData).flat().reduce((fields, entity: Entity) => {
      Object.keys(entity).forEach(f => fields.add(f));
      return fields;
    }, new Set<string>());
    Object.entries(normalizedData).forEach(([entityId, entities]) => {
      if (!Array.isArray(entities)) return;
      (entities as Array<Entity>).forEach((entity: Entity, idx: number) => {
        let evalInfo: Partial<Entity> = {};
        const evalSection = evaluations['root'];
        if (evalSection && Array.isArray(evalSection[entityId])) {
          evalInfo = (evalSection[entityId] as Array<Entity>)[idx] || {};
        }
        allEntityCards.push({ entity, entityId, candidatePath: 'root', idx, allFields, evalInfo });
      });
    });
  }

  if (loading) return (
    <div className="container">
      <div className="text-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div className="container">
      <div className="alert alert-danger" role="alert">
        {error}
      </div>
    </div>
  )
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) return (
    <div className="container">
      <div className="alert alert-warning" role="alert">
        No data available or file format is invalid.
      </div>
    </div>
  )

  return (
    <div className="container-fluid">
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h2 className="mb-0">Evaluate: {filePath}</h2>
          {shouldShowSaveButton && (
            <button 
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                  Saving...
                </>
              ) : (
                <>
                  <FaSave className="me-2" />
                  Save Evaluation
                </>
              )}
            </button>
          )}
        </div>
        <div className="card-body">
          <div className="table-responsive w-100">
            <div className="row g-4">
              {allEntityCards.map(({ entity, entityId, candidatePath, idx, allFields, evalInfo }) => {
                let status: 'pending' | 'approved' | 'corrected' = 'pending';
                if (evalInfo.approved === true) status = 'approved';
                else if (evalInfo.approved === false || evalInfo.corrected === true) status = 'corrected';
                const corrections = evalInfo.corrections || {};
                const correctionKeys = Object.keys(corrections);
                const onlyStartEnd = correctionKeys.length > 0 && correctionKeys.every(k => k === 'start' || k === 'end');
                const isCorrected = status === 'corrected' && Object.keys(corrections).length > 0;
                const isApprovedWithStartEnd = status === 'approved' && onlyStartEnd;
                const isEdit = editMode[entityId] && status === 'corrected';

                // Get the original entity robustly by key or index
                let orig: any = {};
                if (Array.isArray(data)) {
                  orig = data[Number(entityId) - 1] || data[idx];
                } else if (data && typeof data === 'object') {
                  if (data[entityId] && Array.isArray(data[entityId]) && data[entityId][0]) {
                    orig = data[entityId][0];
                  } else {
                    // Use universal analysis to find the original entity
                    const analysis = analyzeStructureDynamically(data);
                    if (analysis.bestCandidate && analysis.bestCandidate.type === 'array_of_entities') {
                      const entityIndex = Number(entityId) - 1;
                      if (analysis.bestCandidate.data && analysis.bestCandidate.data[entityIndex]) {
                        orig = analysis.bestCandidate.data[entityIndex];
                      }
                    } else if (analysis.bestCandidate && analysis.bestCandidate.type === 'single_entity') {
                      orig = analysis.bestCandidate.data;
                    }
                  }
                }
                if (isEdit && originalValues[entityId]) {
                  orig = originalValues[entityId];
                }

                return (
                  <div key={`${candidatePath}-${entityId}-${idx}`} className="col-lg-4 col-md-6 col-12" id={`entity-row-${entityId}`}> 
                    <div className={`card h-100 ${isCorrected || isApprovedWithStartEnd ? 'border-warning' : ''}`}> 
                      <div className="card-header d-flex justify-content-between align-items-center"> 
                        <div>
                          <h5 className="mb-0">Entity #{idx + 1}</h5>
                          <div className="text-muted small">Section: {candidatePath}</div>
                        </div>
                        {!(hasEvalFile && !(filePath?.endsWith('_eval.json') ?? false)) && (
                          <div>
                            {status === 'pending' && !allEvaluated ? (
                              <div className="btn-group">
                                <button
                                  className="btn btn-outline-success btn-sm"
                                  onClick={() => handleApprove(candidatePath, entityId)}
                                  title="Approve"
                                >
                                  <FaThumbsUp />
                                </button>
                                <button
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => handleStartCorrection(candidatePath, entityId, idx)}
                                  title="Needs Correction"
                                >
                                  <FaThumbsDown />
                                </button>
                              </div>
                            ) : status === 'approved' ? (
                              <span className="badge bg-success">Approved</span>
                            ) : status === 'corrected' ? (
                              <span className="badge bg-warning text-dark">Corrected</span>
                            ) : (
                              <span className="badge bg-secondary">Pending</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="card-body">
                        {renderFieldsReadOnly({
                          data: Object.fromEntries([...allFields].map(f => [f, entity[f]])),
                          origData: orig,
                          corrections: entity.corrections || {},
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {modalEntityId !== null && (
        <Modal show onHide={handleCloseModal} size="lg" centered>
          <Modal.Header closeButton>
            <Modal.Title>Provide Corrections</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {(() => {
              // Get the correct entities based on candidate path
              const candidateEntities = evaluations[modalCandidatePath || 'root'];
              let entity: Entity = {};
              if (Array.isArray(candidateEntities)) {
                const entityIndex = parseInt(modalEntityId) - 1;
                entity = candidateEntities[entityIndex] || {};
              } else if (typeof candidateEntities === 'object' && candidateEntities !== null) {
                const entityIdKey = modalEntityId as keyof typeof candidateEntities;
                if (candidateEntities[entityIdKey] && Array.isArray(candidateEntities[entityIdKey])) {
                  entity = candidateEntities[entityIdKey][modalEntityIndex || 0] || {};
                }
              }
              // Get all fields from the entity, including nested objects and arrays
              const allEntityFields = Object.keys(entity).filter(field => 
                field !== 'approved' && field !== 'corrections' && field !== 'corrected'
              );
              if (allEntityFields.length === 0) {
                return (
                  <div className="text-muted">No editable fields available for this entity.</div>
                );
              }
              // Handler for updating nested values
              const handleNestedFieldChange = (fieldPath: (string | number)[], value: any) => {
                handleFieldChange(
                  modalCandidatePath || 'root',
                  modalEntityId!,
                  modalEntityIndex || 0,
                  fieldPath[0] as string,
                  setNestedValue(entity, fieldPath.slice(1), value)
                );
              };
              // Get original values for highlighting
              const origEntity = originalValues[modalEntityId!] || {};
              return (
                <form onSubmit={e => { e.preventDefault(); handleSaveCorrection(modalEntityId!); handleCloseModal(); }}>
                  {renderFields({
                    data: Object.fromEntries(allEntityFields.map(f => [f, entity[f]])),
                    origData: origEntity,
                    onChange: handleNestedFieldChange,
                  })}
                  <div className="d-flex justify-content-end mt-3">
                    <Button variant="secondary" onClick={handleCloseModal} className="me-2">
                      Cancel
                    </Button>
                    <Button type="submit" variant="warning">
                      Save Correction
                    </Button>
                  </div>
                </form>
              );
            })()}
          </Modal.Body>
        </Modal>
      )}
    </div>
  );
}