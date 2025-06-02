'use client';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { FaCheck, FaTimes, FaSave, FaThumbsUp, FaThumbsDown } from 'react-icons/fa';
import fs from 'fs';
import { Modal, Button } from 'react-bootstrap';

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
}

interface Evaluation {
  [key: string]: Entity[];
}

// Helper to find the first array of objects in a JSON object (generalized)
function findFirstEntityArray(obj: any): { key: string, value: any[] } | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      return { key, value };
    }
    if (typeof value === 'object') {
      const found = findFirstEntityArray(value);
      if (found) return found;
    }
  }
  return null;
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
      return JSON.stringify(v);
    }
    return String(v);
  };
  // Robust equality check for all types
  const isEqual = (a: any, b: any) => {
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return a === b;
  };
  if (isCorrected && !isEqual(val, origVal)) {
    return (
      <span>
        <span style={{ textDecoration: 'line-through', color: 'red' }}>{toDisplay(origVal)}</span>
        <span style={{ color: 'green' }}> ✓ {toDisplay(val)}</span>
      </span>
    );
  }
  return toDisplay(val);
}

export default function EvaluatePage() {
  const searchParams = useSearchParams();
  const filePath = searchParams.get('file');

  const [data, setData] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<Evaluation>({});
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
        // If evalData exists, use it; otherwise, use judged_structured_information or first array of objects
        if (evalData?.judged_structured_information) {
          setEvaluation(evalData.judged_structured_information);
        } else if (originalData.judged_structured_information) {
          setEvaluation(originalData.judged_structured_information);
        } else if (Array.isArray(originalData) && originalData.length > 0 && typeof originalData[0] === 'object') {
          // If the root is an array of objects, use it directly
          const evalObj: any = {};
          originalData.forEach((item, idx) => {
            evalObj[(idx + 1).toString()] = [{ ...item }];
          });
          setEvaluation(evalObj);
        } else {
          const found = findFirstEntityArray(originalData);
          if (found) {
            // Convert array to evaluation object: { '1': [item1], '2': [item2], ... }
            const evalObj: any = {};
            found.value.forEach((item, idx) => {
              evalObj[(idx + 1).toString()] = [{ ...item }];
            });
            setEvaluation(evalObj);
          } else {
            setEvaluation({});
          }
        }
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
  const allFields = Object.values(evaluation).flat().reduce((fields, entity) => {
    Object.keys(entity).forEach(f => fields.add(f));
    return fields;
  }, new Set<string>());

  const handleFieldChange = (entityId: string, index: number, field: string, value: any) => {
    setEvaluation(prev => ({
      ...prev,
      [entityId]: prev[entityId].map((entity, i) =>
        i === index ? { ...entity, [field]: value } : entity
      ),
    }));
    setCorrections(prev => ({
      ...prev,
      [entityId]: { ...(prev[entityId] || {}), [field]: true },
    }));
  };

  const handleScoreChange = (entityId: string, index: number, score: number) => {
    setEvaluation(prev => ({
      ...prev,
      [entityId]: prev[entityId].map((entity, i) =>
        i === index ? { ...entity, judge_score: [score] } : entity
      ),
    }));
    setEditMode(prev => ({ ...prev, [entityId]: score === 0 }));
  };

  const handleApprove = (entityId: string) => {
    const entity = evaluation[entityId]?.[0];
    if (entity) {
      const sentence = Array.isArray(entity.sentence) ? entity.sentence[0] : entity.sentence;
      const entityText = Array.isArray(entity.entity) ? entity.entity[0] : entity.entity;
      let start = Array.isArray(entity.start) ? entity.start[0] : entity.start;
      let end = Array.isArray(entity.end) ? entity.end[0] : entity.end;
      let corrections: Record<string, any> = {};
      if (sentence && entityText) {
        const lowerSentence = sentence.toLowerCase();
        const lowerEntity = entityText.toLowerCase();
        const idx = lowerSentence.indexOf(lowerEntity);
        if (idx !== -1 && (start !== idx || end !== idx + entityText.length)) {
          // Store the original start/end before updating
          corrections = { start: entity.start, end: entity.end };
          setEvaluation(prev => ({
            ...prev,
            [entityId]: prev[entityId].map((e, i) =>
              i === 0 ? { ...e, approved: true, corrections, start: [idx], end: [idx + entityText.length] } : e
            ),
          }));
          setEvaluationStatus(prev => ({ ...prev, [entityId]: 'approved' }));
          setEditMode(prev => ({ ...prev, [entityId]: false }));
          return;
        }
      }
      // If start/end are correct, approve as usual
      setEvaluation(prev => ({
        ...prev,
        [entityId]: prev[entityId].map((e, i) =>
          i === 0 ? { ...e, approved: true, corrections: undefined } : e
        ),
      }));
      setEvaluationStatus(prev => ({ ...prev, [entityId]: 'approved' }));
      setEditMode(prev => ({ ...prev, [entityId]: false }));
    }
  };

  const handleStartCorrection = (entityId: string, idx: number = 0) => {
    // Store original values for this entity
    const entity = evaluation[entityId]?.[idx];
    if (entity) {
      setOriginalValues(prev => ({
        ...prev,
        [entityId]: { ...entity },
      }));
      // Auto-correct start/end to first case-insensitive match
      const sentence = Array.isArray(entity.sentence) ? entity.sentence[idx] : entity.sentence;
      const entityText = Array.isArray(entity.entity) ? entity.entity[idx] : entity.entity;
      if (sentence && entityText) {
        const lowerSentence = sentence.toLowerCase();
        const lowerEntity = entityText.toLowerCase();
        const idx = lowerSentence.indexOf(lowerEntity);
        if (idx !== -1) {
          setEvaluation(prev => ({
            ...prev,
            [entityId]: prev[entityId].map((e, i) =>
              i === idx ? { ...e, approved: false, start: [idx], end: [idx + entityText.length] } : e
            ),
          }));
        } else {
          setEvaluation(prev => ({
            ...prev,
            [entityId]: prev[entityId].map((e, i) =>
              i === idx ? { ...e, approved: false } : e
            ),
          }));
        }
      } else {
        setEvaluation(prev => ({
          ...prev,
          [entityId]: prev[entityId].map((e, i) =>
            i === idx ? { ...e, approved: false } : e
          ),
        }));
      }
    }
    setEvaluationStatus(prev => ({ ...prev, [entityId]: 'corrected' }));
    setEditMode(prev => ({ ...prev, [entityId]: true }));
    setModalEntityId(entityId);
    setModalEntityIndex(idx);
  };

  const handleCloseModal = () => {
    setModalEntityId(null);
    setModalEntityIndex(0);
  };

  const handleSaveCorrection = (entityId: string) => {
    setEditMode(prev => ({ ...prev, [entityId]: false }));

    // Get the updated entity
    const entity = evaluation[entityId]?.[0];
    const orig = originalValues[entityId] || {};
    let corrections: Record<string, any> = {};

    // Find all corrected fields and store the old value in corrections
    Object.keys(entity).forEach(field => {
      if (field !== 'judge_score' && field !== 'approved' && entity[field] !== orig[field]) {
        corrections[field] = orig[field]; // Store the old value
      }
    });

    // If entity text was corrected, auto-adjust start/end
    if (corrections.entity && entity.sentence) {
      const sentence = Array.isArray(entity.sentence) ? entity.sentence[0] : entity.sentence;
      const entityText = entity.entity;
      if (entityText) {
        const lowerSentence = sentence.toLowerCase();
        const lowerEntity = entityText.toLowerCase();
        const idx = lowerSentence.indexOf(lowerEntity);
        if (idx !== -1) {
          corrections.start = orig.start;
          corrections.end = orig.end;
          setEvaluation(prev => ({
            ...prev,
            [entityId]: prev[entityId].map((e, i) =>
              i === 0 ? { ...e, start: [idx], end: [idx + entityText.length] } : e
            ),
          }));
        }
      }
    }

    setEvaluation(prev => ({
      ...prev,
      [entityId]: prev[entityId].map((e, i) =>
        i === 0 ? { ...e, approved: false, corrections } : e
      ),
    }));
  };

  const handleSave = async () => {
    if (!filePath) {
      setError('No file path provided');
      return;
    }

    setSaving(true);
    try {
      // Deep copy the original data
      const mergedData = JSON.parse(JSON.stringify(data));

      // Find the key in the original data that holds the entities
      let entityKey = null;
      if (mergedData && typeof mergedData === 'object') {
        for (const [key, value] of Object.entries(mergedData)) {
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            entityKey = key;
            break;
          }
        }
        if (!entityKey && mergedData.judged_structured_information) {
          entityKey = 'judged_structured_information';
        }
      }

      // Helper to get the evaluation entity for a given index/key
      const getEvalEntity = (idxOrKey: string|number) => evaluation[idxOrKey]?.[0];
      // Helper to get the original entity for a given index/key
      const getOrigEntity = (entities: any, idxOrKey: string|number) => {
        if (Array.isArray(entities)) return entities[Number(idxOrKey)];
        if (typeof entities === 'object') return entities[idxOrKey]?.[0];
        return undefined;
      };

      if (entityKey) {
        const entitiesObj = mergedData[entityKey];
        if (entitiesObj && typeof entitiesObj === 'object' && !Array.isArray(entitiesObj)) {
          // Object of arrays (your format)
          Object.entries(entitiesObj).forEach(([key, arr]) => {
            if (Array.isArray(arr) && arr[0]) {
              const origEntity = arr[0];
              const evalEntity = getEvalEntity(key);
              if (evalEntity) {
                // Build corrections object with old values only (deep equality check)
                const corrections: Record<string, any> = {};
                Object.keys(evalEntity).forEach(field => {
                  if (
                    field !== 'approved' &&
                    field !== 'corrections' &&
                    JSON.stringify(origEntity[field]) !== JSON.stringify(evalEntity[field])
                  ) {
                    corrections[field] = origEntity[field];
                  }
                });
                // Merge new values into entity
                let mergedEntity = { ...origEntity };
                Object.keys(evalEntity).forEach(field => {
                  if (field !== 'approved' && field !== 'corrections') {
                    mergedEntity[field] = evalEntity[field];
                  }
                });
                // Set approved status and corrections
                const correctionKeys = Object.keys(corrections);
                const allowed = new Set(['start', 'end']);
                const onlyStartEnd = correctionKeys.length > 0 && correctionKeys.every(k => allowed.has(k));
                if (evalEntity.approved === true && (correctionKeys.length === 0 || onlyStartEnd)) {
                  mergedEntity = { ...mergedEntity, approved: true };
                  if (onlyStartEnd) mergedEntity = { ...mergedEntity, corrections };
                  else delete mergedEntity.corrections;
                } else if (correctionKeys.length > 0) {
                  mergedEntity = { ...mergedEntity, approved: false, corrections };
                } else {
                  delete mergedEntity.approved;
                  delete mergedEntity.corrections;
                }
                arr[0] = mergedEntity;
              }
            }
          });
          mergedData[entityKey] = entitiesObj;
        } else if (Array.isArray(entitiesObj)) {
          // Flat array (fallback for other formats)
          entitiesObj.forEach((entity: any, idx: number) => {
            const evalEntity = getEvalEntity(idx + 1);
            if (evalEntity) {
              const origEntity = entity;
              const corrections: Record<string, any> = {};
              Object.keys(evalEntity).forEach(field => {
                if (
                  field !== 'approved' &&
                  field !== 'corrections' &&
                  JSON.stringify(origEntity[field]) !== JSON.stringify(evalEntity[field])
                ) {
                  corrections[field] = origEntity[field];
                }
              });
              let mergedEntity = { ...origEntity };
              Object.keys(evalEntity).forEach(field => {
                if (field !== 'approved' && field !== 'corrections') {
                  mergedEntity[field] = evalEntity[field];
                }
              });
              const correctionKeysArr = Object.keys(corrections);
              const allowedArr = new Set(['start', 'end']);
              const onlyStartEndArr = correctionKeysArr.length > 0 && correctionKeysArr.every(k => allowedArr.has(k));
              if (evalEntity.approved === true && (correctionKeysArr.length === 0 || onlyStartEndArr)) {
                mergedEntity = { ...mergedEntity, approved: true };
                if (onlyStartEndArr) mergedEntity = { ...mergedEntity, corrections };
                else delete mergedEntity.corrections;
              } else if (correctionKeysArr.length > 0) {
                mergedEntity = { ...mergedEntity, approved: false, corrections };
              } else {
                delete mergedEntity.approved;
                delete mergedEntity.corrections;
              }
              entitiesObj[idx] = mergedEntity;
            }
          });
          mergedData[entityKey] = entitiesObj;
        } else {
          setError('The detected entity key is not compatible. Please check your file format.');
          setSaving(false);
          return;
        }
      } else if (Array.isArray(mergedData)) {
        // If the root is an array, update each entity with evaluation info
        mergedData.forEach((entity: any, idx: number) => {
          const evalEntity = getEvalEntity(idx + 1);
          if (evalEntity) {
            const origEntity = entity;
            const corrections: Record<string, any> = {};
            Object.keys(evalEntity).forEach(field => {
              if (
                field !== 'approved' &&
                field !== 'corrections' &&
                JSON.stringify(origEntity[field]) !== JSON.stringify(evalEntity[field])
              ) {
                corrections[field] = origEntity[field];
              }
            });
            let mergedEntity = { ...origEntity };
            Object.keys(evalEntity).forEach(field => {
              if (field !== 'approved' && field !== 'corrections') {
                mergedEntity[field] = evalEntity[field];
              }
            });
            const correctionKeys = Object.keys(corrections);
            const allowed = new Set(['start', 'end']);
            const onlyStartEnd = correctionKeys.length > 0 && correctionKeys.every(k => allowed.has(k));
            if (evalEntity.approved === true && (correctionKeys.length === 0 || onlyStartEnd)) {
              mergedEntity = { ...mergedEntity, approved: true };
              if (onlyStartEnd) mergedEntity = { ...mergedEntity, corrections };
              else delete mergedEntity.corrections;
            } else if (correctionKeys.length > 0) {
              mergedEntity = { ...mergedEntity, approved: false, corrections };
            } else {
              delete mergedEntity.approved;
              delete mergedEntity.corrections;
            }
            mergedData[idx] = mergedEntity;
          }
        });
      } else {
        mergedData.evaluation = evaluation;
      }

      const evalPath = getEvalPath(filePath!);
      const response = await fetch(`/api/files?path=${encodeURIComponent(evalPath)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mergedData),
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
    return Object.keys(entity).some(field => field !== 'judge_score' && field !== 'corrected' && entity[field] !== orig[field]);
  }

  // Helper to check if all entities are evaluated
  const allEvaluated = Object.entries(evaluation).every(([entityId, entities]) => {
    const entity = Array.isArray(entities) ? entities[0] : null;
    if (!entity) return false;
    if (entity.approved === true || entity.approved === false) return true;
    return false;
  });

  // Helper to check if viewing _eval.json
  const isViewingEvalFile = filePath?.endsWith('_eval.json') ?? false;

  // Helper to check if save button should be shown
  // Always show if viewing _eval.json (for partial evaluation), or if not viewing _eval.json and no _eval.json exists
  const shouldShowSaveButton = (isViewingEvalFile) || (!isViewingEvalFile && !hasEvalFile);

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

  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) return (
    <div className="container">
      <div className="alert alert-warning" role="alert">
        No data available or file format is invalid.
      </div>
    </div>
  );

  const incompleteEntityId = Object.entries(evaluation).find(([entityId, entities]) => {
    const status = evaluationStatus[entityId] || 'pending';
    if (status === 'pending') return true;
    if (status === 'corrected' && !isEntityCorrected(entityId, entities[0])) return true;
    return false;
  })?.[0];

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
          {incompleteEntityId && (
            <div className="alert alert-warning d-flex align-items-center justify-content-between">
              <span>Evaluation is not complete. Please approve or correct all entities.</span>
              {/* <button className="btn btn-sm btn-primary ms-3" onClick={() => {
                const el = document.getElementById(`entity-row-${incompleteEntityId}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}>
                Complete Evaluation
              </button> */}
            </div>
          )}
          <div className="table-responsive w-100">
            <div className="row g-4">
              {Object.entries(evaluation).flatMap(([entityId, entities], idx) => {
                if (!Array.isArray(entities)) return null;
                return entities.map((entity, index) => {
                  let status: 'pending' | 'approved' | 'corrected' = 'pending';
                  if (entity.approved === true) status = 'approved';
                  else if (entity.approved === false) status = 'corrected';
                  const corrections = entity.corrections || {};
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
                      const found = findFirstEntityArray(data);
                      if (found && found.value && found.value[Number(entityId) - 1]) {
                        orig = found.value[Number(entityId) - 1];
                      }
                    }
                  }
                  if (isEdit && originalValues[entityId]) {
                    orig = originalValues[entityId];
                  }

                  // Prepare sentence highlight values
                  const origSentence = (Array.isArray(orig.sentence) ? orig.sentence[0] : (entity.sentence ? (Array.isArray(entity.sentence) ? entity.sentence[0] : entity.sentence) : '')) || '';
                  const origStart = typeof (Array.isArray(orig.start) ? orig.start[0] : (entity.start ? (Array.isArray(entity.start) ? entity.start[0] : entity.start) : undefined)) === 'number' ? (Array.isArray(orig.start) ? orig.start[0] : (entity.start ? (Array.isArray(entity.start) ? entity.start[0] : entity.start) : 0)) : 0;
                  const origEnd = typeof (Array.isArray(orig.end) ? orig.end[0] : (entity.end ? (Array.isArray(entity.end) ? entity.end[0] : entity.end) : undefined)) === 'number' ? (Array.isArray(orig.end) ? orig.end[0] : (entity.end ? (Array.isArray(entity.end) ? entity.end[0] : entity.end) : 0)) : 0;
                  const origEntityText = Array.isArray(orig.entity) ? orig.entity[0] : (entity.entity ? (Array.isArray(entity.entity) ? entity.entity[0] : entity.entity) : undefined);
                  const evalSentence = (Array.isArray(entity.sentence) ? entity.sentence[0] : entity.sentence) || '';
                  const evalStart = typeof (Array.isArray(entity.start) ? entity.start[0] : entity.start) === 'number' ? (Array.isArray(entity.start) ? entity.start[0] : entity.start) : 0;
                  const evalEnd = typeof (Array.isArray(entity.end) ? entity.end[0] : entity.end) === 'number' ? (Array.isArray(entity.end) ? entity.end[0] : entity.end) : 0;
                  const evalEntityText = Array.isArray(entity.entity) ? entity.entity[0] : entity.entity;

                  return (
                    <div key={entityId + '-' + index} className="col-md-6 col-lg-4" id={`entity-row-${entityId}`}>
                      <div className={`card h-100 ${isCorrected || isApprovedWithStartEnd ? 'border-warning' : ''}`}>
                        <div className="card-header d-flex justify-content-between align-items-center">
                          <h5 className="mb-0">Entity #{idx + 1}</h5>
                          {!(hasEvalFile && !(filePath?.endsWith('_eval.json') ?? false)) && (
                            <div>
                              {status === 'pending' && !allEvaluated ? (
                                <div className="btn-group">
                                  <button
                                    className="btn btn-outline-success btn-sm"
                                    onClick={() => handleApprove(entityId)}
                                    title="Approve"
                                  >
                                    <FaThumbsUp />
                                  </button>
                                  <button
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={() => handleStartCorrection(entityId, index)}
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
                          {[...allFields].map((field: string) => {
                            // Only show start/end correction/highlighting if those fields exist
                            if ((field === 'start' || field === 'end') && entity[field] === undefined) {
                              return null;
                            }
                            // Special handling for sentence/start/end triplets
                            if (field === 'sentence' && (entity['start'] !== undefined && entity['end'] !== undefined)) {
                              const sentences = Array.isArray(entity['sentence']) ? entity['sentence'] : [entity['sentence']];
                              const starts = Array.isArray(entity['start']) ? entity['start'] : [entity['start']];
                              const ends = Array.isArray(entity['end']) ? entity['end'] : [entity['end']];
                              const entityTexts = Array.isArray(entity['entity']) ? entity['entity'] : [entity['entity']];
                              return (
                                <div key={field} className="mb-3">
                                  <h6 className="text-muted mb-2">{field.replace(/_/g, ' ')}:</h6>
                                  <div className="p-2 bg-light rounded">
                                    {sentences.map((sentence, idx) => (
                                      <div key={idx} className="mb-2">
                                        {highlightEntity(
                                          sentence || '',
                                          Number(starts[idx]) || 0,
                                          Number(ends[idx]) || 0,
                                          entityTexts[idx]
                                        )}
                                        <div className="text-muted small mt-1">
                                          Start: {starts[idx]}, End: {ends[idx]}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            // For other array fields, show all values
                            const value = entity[field];
                            if (Array.isArray(value) && value.length > 0) {
                              // Special formatting for remarks, paper_title, doi, etc.
                              if (field === 'remarks' || field === 'paper_title' || field === 'doi') {
                                return (
                                  <div key={field} className="mb-2">
                                    <h6 className="text-muted mb-1">{field.replace(/_/g, ' ')}:</h6>
                                    <ul className="mb-0 ps-3">
                                      {value.map((v: any, idx: number) => (
                                        <li key={idx}>{v}</li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              }
                              // For judge_score, paper_location, show as comma-separated
                              if (field === 'judge_score' || field === 'paper_location') {
                                return (
                                  <div key={field} className="mb-2">
                                    <h6 className="text-muted mb-1">{field.replace(/_/g, ' ')}:</h6>
                                    <div>{value.join(', ')}</div>
                                  </div>
                                );
                              }
                              // Default: show each value on its own line
                              return (
                                <div key={field} className="mb-2">
                                  <h6 className="text-muted mb-1">{field.replace(/_/g, ' ')}:</h6>
                                  <ul className="mb-0 ps-3">
                                    {value.map((v: any, idx: number) => (
                                      <li key={idx}>{v}</li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            }
                            // Fallback for non-array fields
                            const currVal = value;
                            return (
                              <div key={field} className="mb-2">
                                <h6 className="text-muted mb-1">{field.replace(/_/g, ' ')}:</h6>
                                <div>{displayValue(currVal, false, undefined)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                });
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
            <form onSubmit={e => { e.preventDefault(); handleSaveCorrection(modalEntityId!); handleCloseModal(); }}>
              {Array.from(allFields).map(field => {
                const entity = evaluation[modalEntityId!]?.[modalEntityIndex] || {};
                const value = entity[field];
                const isArray = Array.isArray(value);
                // Helper to update array field
                const handleArrayChange = (idx: number, newVal: string) => {
                  setEvaluation(prev => ({
                    ...prev,
                    [modalEntityId!]: prev[modalEntityId!].map((e, i) =>
                      i === modalEntityIndex ? { ...e, [field]: value.map((v: any, j: number) => j === idx ? newVal : v) } : e
                    ),
                  }));
                  setCorrections(prev => ({
                    ...prev,
                    [modalEntityId!]: { ...(prev[modalEntityId!] || {}), [field]: true },
                  }));
                };
                // Helper to add/remove array element
                const handleAdd = () => {
                  setEvaluation(prev => ({
                    ...prev,
                    [modalEntityId!]: prev[modalEntityId!].map((e, i) =>
                      i === modalEntityIndex ? { ...e, [field]: [...(value || []), ''] } : e
                    ),
                  }));
                };
                const handleRemove = (idx: number) => {
                  setEvaluation(prev => ({
                    ...prev,
                    [modalEntityId!]: prev[modalEntityId!].map((e, i) =>
                      i === modalEntityIndex ? { ...e, [field]: value.filter((_: any, j: number) => j !== idx) } : e
                    ),
                  }));
                };
                if (isArray) {
                  return (
                    <div className="mb-2" key={field}>
                      <label className="fw-bold text-capitalize">{field.replace(/_/g, ' ')}:</label>
                      {value.map((v: any, idx: number) => (
                        <div className="input-group mb-1" key={idx}>
                          <input
                            type="text"
                            className="form-control"
                            value={v || ''}
                            onChange={e => handleArrayChange(idx, e.target.value)}
                            readOnly={field === 'sentence'}
                          />
                          <button type="button" className="btn btn-outline-danger" onClick={() => handleRemove(idx)} title="Remove">
                            &minus;
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn btn-outline-primary btn-sm" onClick={handleAdd} title={`Add ${field}`}>+ Add</button>
                    </div>
                  );
                } else {
                  return (
                    <div className="mb-2 row align-items-center" key={field}>
                      <label className="col-sm-3 col-form-label fw-bold text-capitalize" htmlFor={`correction-modal-${modalEntityId}-${field}`}>{field.replace(/_/g, ' ')}:</label>
                      <div className="col-sm-9">
                        <input
                          id={`correction-modal-${modalEntityId}-${field}`}
                          type="text"
                          className="form-control"
                          value={value || ''}
                          onChange={e => handleFieldChange(modalEntityId!, modalEntityIndex, field, e.target.value)}
                          readOnly={field === 'sentence'}
                        />
                      </div>
                    </div>
                  );
                }
              })}
              <div className="d-flex justify-content-end mt-3">
                <Button variant="secondary" onClick={handleCloseModal} className="me-2">Cancel</Button>
                <Button type="submit" variant="warning">Save Correction</Button>
              </div>
            </form>
          </Modal.Body>
        </Modal>
      )}
    </div>
  );
} 