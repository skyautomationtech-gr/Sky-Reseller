import React, { useState, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Brand, UserProfile } from '../../types';
import { 
  readFileToRows, 
  processBrandImportRows, 
  ParsedBrandRow, 
  downloadSampleBrandTemplate 
} from '../../lib/bulkImportHelper';
import { 
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, 
  X, Download, ArrowRight, RefreshCw, Tag, ShieldCheck, 
  Sparkles, FileText, Check, AlertCircle, Database, Info
} from 'lucide-react';

interface BulkBrandImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (summary: { created: number; updated: number; failed: number; total: number }) => void;
  user?: UserProfile;
  existingBrands: Brand[];
  onRefreshData: () => Promise<any>;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'summary';

export const BulkBrandImportModal: React.FC<BulkBrandImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  user,
  existingBrands,
  onRefreshData
}) => {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parsingError, setParsingError] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // Parsed Rows & Filter
  const [parsedRows, setParsedRows] = useState<ParsedBrandRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'update' | 'new' | 'invalid'>('all');
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewLimit, setPreviewLimit] = useState<number>(5);

  // Import Progress & Stats
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('');
  const [importResults, setImportResults] = useState<{
    created: number;
    updated: number;
    failed: number;
    total: number;
    failedRows: { row: number; name: string; error: string }[];
  }>({
    created: 0,
    updated: 0,
    failed: 0,
    total: 0,
    failedRows: []
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setCurrentStep('upload');
    setFileName('');
    setFileSize('');
    setParsingError('');
    setParsedRows([]);
    setImportProgress(0);
    setImportStatusText('');
    setPreviewLimit(5);
    setImportResults({ created: 0, updated: 0, failed: 0, total: 0, failedRows: [] });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCloseModal = () => {
    handleReset();
    onClose();
  };

  const handleFileProcess = async (file: File) => {
    setParsingError('');
    setIsParsing(true);

    try {
      const validExtensions = ['.csv', '.xlsx', '.xls'];
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!validExtensions.includes(fileExt)) {
        throw new Error('Unsupported file format. Please upload a .csv, .xlsx, or .xls file.');
      }

      setFileName(file.name);
      setFileSize((file.size / 1024).toFixed(1) + ' KB');

      const { rows } = await readFileToRows(file);
      if (rows.length === 0) {
        throw new Error('The uploaded file contains no data rows or is empty.');
      }

      const parsed = processBrandImportRows(rows, existingBrands);
      setParsedRows(parsed);
      setCurrentStep('preview');
    } catch (err: any) {
      console.error('Brand file parsing error:', err);
      setParsingError(err.message || 'Failed to read the file. Please check file structure.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  // Run the batch import to Firestore brands collection
  const handleExecuteImport = async () => {
    setCurrentStep('importing');
    setImportProgress(0);
    setImportStatusText('Preparing brand records...');

    const validRowsToImport = parsedRows.filter(r => r.isValid);
    const totalCount = validRowsToImport.length;

    if (totalCount === 0) {
      setImportResults({
        created: 0,
        updated: 0,
        failed: parsedRows.length,
        total: parsedRows.length,
        failedRows: parsedRows.map(r => ({ row: r.rowIndex, name: r.name || 'Unnamed', error: r.errors.join(', ') }))
      });
      setCurrentStep('summary');
      return;
    }

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const failedRows: { row: number; name: string; error: string }[] = [];

    // Local brand lookup map
    const brandNameMap = new Map<string, Brand>();
    const brandIdMap = new Map<string, Brand>();
    existingBrands.forEach(b => {
      if (b.name) brandNameMap.set(b.name.trim().toLowerCase(), b);
      if (b.id) brandIdMap.set(b.id.trim(), b);
    });

    try {
      for (let i = 0; i < totalCount; i++) {
        const item = validRowsToImport[i];
        const progressPercent = Math.round(((i + 1) / totalCount) * 100);
        setImportProgress(progressPercent);
        setImportStatusText(`Saving (${i + 1}/${totalCount}): ${item.name}`);

        try {
          const normName = item.name.trim();
          let existingBrand: Brand | undefined = undefined;

          if (item.matchedExistingId && brandIdMap.has(item.matchedExistingId)) {
            existingBrand = brandIdMap.get(item.matchedExistingId);
          } else if (brandNameMap.has(normName.toLowerCase())) {
            existingBrand = brandNameMap.get(normName.toLowerCase());
          }

          const brandPayload: any = {
            name: normName,
            logoUrl: item.logoUrl || (existingBrand ? existingBrand.logoUrl : ''),
            status: item.status || 'active',
            updatedAt: serverTimestamp()
          };

          if (existingBrand) {
            // Update existing brand
            await updateDoc(doc(db, 'brands', existingBrand.id), brandPayload);
            updatedCount++;
          } else {
            // Create new brand
            brandPayload.createdAt = serverTimestamp();
            const newDocRef = await addDoc(collection(db, 'brands'), brandPayload);
            // Cache to prevent duplicate in same batch
            const newBrandObj: Brand = {
              id: newDocRef.id,
              name: normName,
              logoUrl: brandPayload.logoUrl,
              status: brandPayload.status,
              createdAt: new Date()
            };
            brandNameMap.set(normName.toLowerCase(), newBrandObj);
            brandIdMap.set(newDocRef.id, newBrandObj);
            createdCount++;
          }
        } catch (itemErr: any) {
          console.error(`Error importing brand row ${item.rowIndex}:`, itemErr);
          failedCount++;
          failedRows.push({
            row: item.rowIndex,
            name: item.name || 'Unnamed',
            error: itemErr.message || 'Firestore write error'
          });
        }
      }

      await onRefreshData();

      const finalStats = {
        created: createdCount,
        updated: updatedCount,
        failed: failedCount + (parsedRows.length - totalCount),
        total: parsedRows.length,
        failedRows: [
          ...parsedRows.filter(r => !r.isValid).map(r => ({ row: r.rowIndex, name: r.name || 'Unnamed', error: r.errors.join(', ') })),
          ...failedRows
        ]
      };

      setImportResults(finalStats);
      setCurrentStep('summary');
      onSuccess(finalStats);
    } catch (globalErr: any) {
      console.error('Global brand import error:', globalErr);
      setImportStatusText('Import failed: ' + (globalErr.message || 'Unknown error'));
    }
  };

  // Preview filtering logic
  const filteredPreviewRows = parsedRows.filter(row => {
    let matchesFilter = true;
    if (previewFilter === 'valid') matchesFilter = row.isValid;
    else if (previewFilter === 'update') matchesFilter = row.isValid && row.isUpdate;
    else if (previewFilter === 'new') matchesFilter = row.isValid && !row.isUpdate;
    else if (previewFilter === 'invalid') matchesFilter = !row.isValid;

    let matchesSearch = true;
    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      matchesSearch = 
        row.name.toLowerCase().includes(q) ||
        (row.associatedSubBrands?.some(sb => sb.toLowerCase().includes(q)) || false) ||
        (row.associatedCategories?.some(ac => ac.toLowerCase().includes(q)) || false);
    }

    return matchesFilter && matchesSearch;
  });

  const totalValidCount = parsedRows.filter(r => r.isValid).length;
  const totalUpdateCount = parsedRows.filter(r => r.isValid && r.isUpdate).length;
  const totalNewCount = parsedRows.filter(r => r.isValid && !r.isUpdate).length;
  const totalInvalidCount = parsedRows.filter(r => !r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-linear-to-r from-purple-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white border border-white/20">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg">Bulk Import Brands</h3>
                <span className="bg-amber-400/20 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Super Admin
                </span>
              </div>
              <p className="text-xs text-purple-100/90 mt-0.5">
                Bulk import brand directory and deduplicate case-insensitively (.csv & .xlsx)
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Step 1: Upload */}
          {currentStep === 'upload' && (
            <div className="space-y-6">
              {/* Template Download Callout */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800">Download Brand Sample Sheet</h4>
                    <p className="text-[11px] text-slate-500">Headers: Brand ID, Brand Name, Associated Sub-Brands, Associated Categories.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => downloadSampleBrandTemplate('xlsx')}
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Download .XLSX</span>
                  </button>
                  <button
                    onClick={() => downloadSampleBrandTemplate('csv')}
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Download .CSV</span>
                  </button>
                </div>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-purple-600 bg-purple-50/60 scale-[0.99]'
                    : 'border-slate-300 hover:border-purple-500 bg-slate-50/50 hover:bg-purple-50/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                
                <div className="w-16 h-16 rounded-3xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto mb-4 shadow-inner">
                  {isParsing ? (
                    <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
                  ) : (
                    <Upload className="w-8 h-8 text-purple-600" />
                  )}
                </div>

                <h4 className="text-base sm:text-lg font-bold text-slate-800">
                  {isParsing ? 'Processing brand file...' : 'Click to select or drag and drop brand spreadsheet'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Supports .CSV, .XLSX, or .XLS brand exports. Case-insensitive deduplication will prevent duplicate brand records.
                </p>
              </div>

              {/* Error Message */}
              {parsingError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl flex items-start gap-3 text-xs">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <p className="font-bold">Error parsing brand file</p>
                    <p className="mt-0.5">{parsingError}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Live Data Preview */}
          {currentStep === 'preview' && (
            <div className="space-y-5">
              {/* File Info Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-purple-50 border border-purple-200/80 p-3.5 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-xs">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 truncate max-w-xs sm:max-w-md">{fileName}</h4>
                    <p className="text-[11px] text-slate-500">{fileSize} • {parsedRows.length} brands detected</p>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="text-xs font-bold text-purple-700 hover:text-purple-900 bg-white border border-purple-200 px-3 py-1.5 rounded-xl transition-colors"
                >
                  Change File
                </button>
              </div>

              {/* KPI Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div 
                  onClick={() => setPreviewFilter('all')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    previewFilter === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div className="text-[10px] uppercase font-bold opacity-80">Total Brands</div>
                  <div className="text-lg font-black mt-0.5">{parsedRows.length}</div>
                </div>

                <div 
                  onClick={() => setPreviewFilter('new')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    previewFilter === 'new' ? 'bg-emerald-700 text-white border-emerald-700 shadow-md' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-400'
                  }`}
                >
                  <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> New Brands
                  </div>
                  <div className="text-lg font-black mt-0.5">{totalNewCount}</div>
                </div>

                <div 
                  onClick={() => setPreviewFilter('update')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    previewFilter === 'update' ? 'bg-indigo-700 text-white border-indigo-700 shadow-md' : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:border-indigo-400'
                  }`}
                >
                  <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Existing (Deduplicated)
                  </div>
                  <div className="text-lg font-black mt-0.5">{totalUpdateCount}</div>
                </div>

                <div 
                  onClick={() => setPreviewFilter('invalid')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    previewFilter === 'invalid' ? 'bg-rose-700 text-white border-rose-700 shadow-md' : 'bg-rose-50 text-rose-800 border-rose-200 hover:border-rose-400'
                  }`}
                >
                  <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Errors
                  </div>
                  <div className="text-lg font-black mt-0.5">{totalInvalidCount}</div>
                </div>
              </div>

              {/* Table Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Preview:</span>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    {[5, 10, 25, 100].map(limit => (
                      <button
                        key={limit}
                        onClick={() => setPreviewLimit(limit)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                          previewLimit === limit ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {limit === 100 ? 'All' : `${limit} Rows`}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Filter brands..."
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-600 focus:outline-hidden"
                />
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2.5">Row</th>
                        <th className="px-3 py-2.5">Action</th>
                        <th className="px-3 py-2.5">Brand Name</th>
                        <th className="px-3 py-2.5">Sub-Brands</th>
                        <th className="px-3 py-2.5">Categories</th>
                        <th className="px-3 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPreviewRows.slice(0, previewLimit === 100 ? filteredPreviewRows.length : previewLimit).map((row, idx) => (
                        <tr key={idx} className={row.isValid ? (row.isUpdate ? 'bg-indigo-50/30' : 'hover:bg-slate-50/60') : 'bg-rose-50/40'}>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 font-bold">
                            #{row.rowIndex}
                          </td>
                          <td className="px-3 py-2.5">
                            {!row.isValid ? (
                              <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                <XCircle className="w-3 h-3" /> Error
                              </span>
                            ) : row.isUpdate ? (
                              <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                <RefreshCw className="w-3 h-3" /> Merge/Update
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                <CheckCircle2 className="w-3 h-3" /> New Brand
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              {row.logoUrl ? (
                                <img src={row.logoUrl} alt="" className="w-5 h-5 rounded-md object-cover border border-slate-200" />
                              ) : (
                                <div className="w-5 h-5 rounded-md bg-purple-100 text-purple-700 text-[10px] font-bold flex items-center justify-center">
                                  {row.name ? row.name.charAt(0) : '?'}
                                </div>
                              )}
                              <span>{row.name || <span className="text-rose-500 italic">Missing Name</span>}</span>
                            </div>
                            {row.warnings.length > 0 && (
                              <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                                ⚠️ {row.warnings[0]}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {row.associatedSubBrands && row.associatedSubBrands.length > 0 ? (
                              <span className="text-[11px] truncate max-w-[150px] inline-block" title={row.associatedSubBrands.join(', ')}>
                                {row.associatedSubBrands.join(', ')}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {row.associatedCategories && row.associatedCategories.length > 0 ? (
                              <span className="text-[11px] truncate max-w-[150px] inline-block" title={row.associatedCategories.join(', ')}>
                                {row.associatedCategories.join(', ')}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Deduplication Notice */}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-start gap-2.5 text-xs text-slate-600">
                <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Case-Insensitive Deduplication:</strong> Brand names matching existing entries (e.g., "hoco" vs "Hoco") will be merged without generating duplicate records.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {currentStep === 'importing' && (
            <div className="py-12 px-4 text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto shadow-inner animate-pulse">
                <Database className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-extrabold text-slate-900">Importing Brands...</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto truncate font-mono">{importStatusText}</p>
              </div>

              <div className="max-w-md mx-auto space-y-2">
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200">
                  <div 
                    className="bg-linear-to-r from-purple-600 to-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-500">
                  <span>Progress</span>
                  <span>{importProgress}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Summary Result */}
          {currentStep === 'summary' && (
            <div className="space-y-6">
              <div className="text-center space-y-2 py-4">
                <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h4 className="text-xl font-black text-slate-900">Brand Import Completed!</h4>
                <p className="text-xs text-slate-500">Brands have been synchronized into the system.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-center">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Processed</div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">{importResults.total}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center text-emerald-800">
                  <div className="text-[10px] font-bold uppercase">Newly Added</div>
                  <div className="text-xl font-black mt-0.5">{importResults.created}</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl text-center text-indigo-800">
                  <div className="text-[10px] font-bold uppercase">Merged / Updated</div>
                  <div className="text-xl font-black mt-0.5">{importResults.updated}</div>
                </div>
                <div className={`p-4 rounded-2xl text-center border ${importResults.failed > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <div className="text-[10px] font-bold uppercase">Errors</div>
                  <div className="text-xl font-black mt-0.5">{importResults.failed}</div>
                </div>
              </div>

              {importResults.failedRows.length > 0 && (
                <div className="border border-rose-200 rounded-2xl p-4 bg-rose-50/50 space-y-2">
                  <h5 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Failed Rows ({importResults.failedRows.length})</span>
                  </h5>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2 text-xs">
                    {importResults.failedRows.map((f, i) => (
                      <div key={i} className="bg-white p-2 rounded-xl border border-rose-200/80 flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-700">Row #{f.row}: {f.name}</span>
                        <span className="text-rose-600 font-semibold">{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          {currentStep === 'upload' && (
            <>
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Select Brand File</span>
              </button>
            </>
          )}

          {currentStep === 'preview' && (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors"
              >
                Back / Change File
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  {totalValidCount} brands ready
                </span>
                <button
                  type="button"
                  disabled={totalValidCount === 0}
                  onClick={handleExecuteImport}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <span>Confirm & Import ({totalValidCount})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {currentStep === 'importing' && (
            <div className="w-full text-center text-xs font-bold text-slate-500">
              Importing brands, please wait...
            </div>
          )}

          {currentStep === 'summary' && (
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 text-xs font-bold text-purple-600 hover:text-purple-800 transition-colors"
              >
                Import Another File
              </button>
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Done & View Brands</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
