import React, { useState, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Product, Category, Brand, UserProfile } from '../../types';
import { 
  readFileToRows, 
  processProductImportRows, 
  ParsedProductRow, 
  downloadSampleProductTemplate 
} from '../../lib/bulkImportHelper';
import { 
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, 
  X, Download, ArrowRight, RefreshCw, Layers, ShieldCheck, 
  Sparkles, FileText, ChevronRight, Eye, Check, AlertCircle, 
  Database, Info, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BulkProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (summary: { created: number; updated: number; failed: number; total: number }) => void;
  user: UserProfile;
  existingProducts: Product[];
  categories: Category[];
  brands: Brand[];
  onRefreshData: () => Promise<any>;
  onNavigateToApprovals?: () => void;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'summary';

export const BulkProductImportModal: React.FC<BulkProductImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  user,
  existingProducts,
  categories,
  brands,
  onRefreshData,
  onNavigateToApprovals
}) => {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parsingError, setParsingError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [importMode, setImportMode] = useState<'approval' | 'direct'>('approval');

  // Parsed Rows & Filter
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([]);
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

      const { rows, headers } = await readFileToRows(file);
      if (rows.length === 0) {
        throw new Error('The uploaded file contains no data rows or is empty.');
      }

      const parsed = processProductImportRows(rows, existingProducts);
      setParsedRows(parsed);
      setCurrentStep('preview');
    } catch (err: any) {
      console.error('File parsing error:', err);
      setParsingError(err.message || 'Failed to read the file. Please verify format.');
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

  // Run the batch import to Firestore
  const handleExecuteImport = async () => {
    setCurrentStep('importing');
    setImportProgress(0);
    setImportStatusText('Preparing database records...');

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

    // Local caches to avoid duplicate category/brand lookups/creations
    const catMap = new Map<string, Category>();
    categories.forEach(c => catMap.set(c.name.trim().toLowerCase(), c));

    const brandMap = new Map<string, Brand>();
    brands.forEach(b => brandMap.set(b.name.trim().toLowerCase(), b));

    // Also build a fast lookup for existing products
    const prodBySkuMap = new Map<string, Product>();
    const prodByIdMap = new Map<string, Product>();
    existingProducts.forEach(p => {
      if (p.sku) prodBySkuMap.set(p.sku.trim().toLowerCase(), p);
      if (p.id) prodByIdMap.set(p.id.trim(), p);
    });

    const isPendingApproval = importMode === 'approval';
    const batchId = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    try {
      for (let i = 0; i < totalCount; i++) {
        const item = validRowsToImport[i];
        const progressPercent = Math.round(((i + 1) / totalCount) * 100);
        setImportProgress(progressPercent);
        setImportStatusText(`Importing (${i + 1}/${totalCount}): ${item.name}`);

        try {
          // 1. Resolve Category
          const normCatName = (item.categoryName || 'General').trim();
          let matchedCat = catMap.get(normCatName.toLowerCase());
          if (!matchedCat) {
            // Auto create category if not found
            const catDocRef = await addDoc(collection(db, 'categories'), {
              name: normCatName,
              status: 'active',
              createdAt: serverTimestamp()
            });
            matchedCat = {
              id: catDocRef.id,
              name: normCatName,
              status: 'active',
              createdAt: new Date()
            };
            catMap.set(normCatName.toLowerCase(), matchedCat);
          }

          // 2. Resolve Brand
          const normBrandName = (item.brandName || 'Generic').trim();
          let matchedBrand = brandMap.get(normBrandName.toLowerCase());
          if (!matchedBrand) {
            // Auto create brand if not found
            const brandDocRef = await addDoc(collection(db, 'brands'), {
              name: normBrandName,
              logoUrl: '',
              status: 'active',
              createdAt: serverTimestamp()
            });
            matchedBrand = {
              id: brandDocRef.id,
              name: normBrandName,
              status: 'active',
              createdAt: new Date()
            };
            brandMap.set(normBrandName.toLowerCase(), matchedBrand);
          }

          // 3. Determine if product exists (by matched ID or SKU)
          let existingProduct: Product | undefined = undefined;
          if (item.matchedExistingId && prodByIdMap.has(item.matchedExistingId)) {
            existingProduct = prodByIdMap.get(item.matchedExistingId);
          } else if (item.sku && prodBySkuMap.has(item.sku.trim().toLowerCase())) {
            existingProduct = prodBySkuMap.get(item.sku.trim().toLowerCase());
          }

          const productPayload: any = {
            sku: item.sku.trim(),
            barcodeValue: item.barcodeValue || (existingProduct ? existingProduct.barcodeValue : `890${Math.floor(100000000 + Math.random() * 900000000)}`),
            qrValue: existingProduct ? existingProduct.qrValue : `SAT-PROD-${item.sku}-${Date.now()}`,
            categoryId: matchedCat.id,
            categoryName: matchedCat.name,
            brandId: matchedBrand.id,
            brandName: matchedBrand.name,
            name: item.name.trim(),
            costPrice: item.costPrice || 0,
            resellerPrice: item.sellingPrice || 0,
            retailPrice: item.retailPrice || 0,
            stock: item.stock,
            lowStockThreshold: item.lowStockThreshold || 5,
            warranty: item.warranty || (existingProduct ? existingProduct.warranty : '6 Months'),
            description: item.description || (existingProduct ? existingProduct.description : ''),
            hasVariants: item.hasVariants,
            variants: item.variants || [],
            status: isPendingApproval ? 'inactive' : (item.status || 'active'),
            approvalStatus: isPendingApproval ? 'pending' : 'approved',
            isImported: true,
            importBatchId: batchId,
            importFileName: fileName,
            importedAt: serverTimestamp(),
            importedBy: user.fullName || user.email || 'Admin',
            approvedAt: isPendingApproval ? null : serverTimestamp(),
            approvedBy: isPendingApproval ? null : (user.fullName || 'Admin'),
            updatedAt: serverTimestamp()
          };

          if (existingProduct) {
            // Upsert / Update existing
            productPayload.images = existingProduct.images || [];
            productPayload.videos = existingProduct.videos || [];
            await updateDoc(doc(db, 'products', existingProduct.id), productPayload);
            updatedCount++;
          } else {
            // Create New
            productPayload.images = [];
            productPayload.videos = [];
            productPayload.createdAt = serverTimestamp();
            const newDocRef = await addDoc(collection(db, 'products'), productPayload);
            // Cache newly created product to avoid intra-file duplicates
            prodBySkuMap.set(item.sku.trim().toLowerCase(), {
              id: newDocRef.id,
              ...productPayload,
              createdAt: new Date()
            } as Product);
            createdCount++;
          }
        } catch (itemErr: any) {
          console.error(`Error importing row ${item.rowIndex}:`, itemErr);
          failedCount++;
          failedRows.push({
            row: item.rowIndex,
            name: item.name || 'Unnamed',
            error: itemErr.message || 'Firestore write error'
          });
        }
      }

      // Refresh parent dataset
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
      console.error('Global import error:', globalErr);
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
        row.sku.toLowerCase().includes(q) ||
        row.categoryName.toLowerCase().includes(q) ||
        row.brandName.toLowerCase().includes(q);
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
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-linear-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white border border-white/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg">Bulk Import Products</h3>
                <span className="bg-amber-400/20 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Super Admin
                </span>
              </div>
              <p className="text-xs text-blue-100/90 mt-0.5">
                Import and bulk upsert inventory from Main Inventory App (.xlsx & .csv)
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
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800">Standard Inventory Export Format</h4>
                    <p className="text-[11px] text-slate-500">Need a sample sheet? Download our pre-formatted template with all supported headers.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => downloadSampleProductTemplate('xlsx')}
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Download .XLSX</span>
                  </button>
                  <button
                    onClick={() => downloadSampleProductTemplate('csv')}
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
                    ? 'border-blue-600 bg-blue-50/60 scale-[0.99]'
                    : 'border-slate-300 hover:border-blue-500 bg-slate-50/50 hover:bg-blue-50/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                
                <div className="w-16 h-16 rounded-3xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto mb-4 shadow-inner">
                  {isParsing ? (
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                  ) : (
                    <Upload className="w-8 h-8 text-blue-600" />
                  )}
                </div>

                <h4 className="text-base sm:text-lg font-bold text-slate-800">
                  {isParsing ? 'Parsing spreadsheet data...' : 'Click to upload or drag and drop file'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Supports .XLSX, .XLS, or .CSV exported from Sky Automation Tech Inventory or warehouse management system.
                </p>

                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-600 shadow-2xs">
                  <span>Supported Max Size: 25 MB</span>
                </div>
              </div>

              {/* Error Message */}
              {parsingError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl flex items-start gap-3 text-xs">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <p className="font-bold">Error reading file</p>
                    <p className="mt-0.5">{parsingError}</p>
                  </div>
                </div>
              )}

              {/* Column Mapping Guide */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>Recognized Header Columns</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px]">
                  {[
                    { key: 'Product ID', desc: 'Optional ID for upsert' },
                    { key: 'SKU', desc: 'Unique item code' },
                    { key: 'Product Name', desc: 'Required title' },
                    { key: 'Category', desc: 'Auto-linked' },
                    { key: 'Brand', desc: 'Auto-linked' },
                    { key: 'Cost Price (৳)', desc: 'Admin purchase price' },
                    { key: 'Selling Price (৳)', desc: 'Reseller unit price' },
                    { key: 'Total Stock', desc: 'Stock inventory quantity' },
                    { key: 'Low Stock Threshold', desc: 'Alert level' },
                    { key: 'Stock Status', desc: 'In Stock / Out of Stock' },
                    { key: 'Variants Breakdown', desc: 'Color/Model (Stock: N)' },
                    { key: 'Barcode Value', desc: 'UPC / Barcode' },
                  ].map((col, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200/60 p-2 rounded-xl">
                      <div className="font-bold text-slate-800 truncate">{col.key}</div>
                      <div className="text-[10px] text-slate-500 truncate">{col.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Live Data Preview Table */}
          {currentStep === 'preview' && (
            <div className="space-y-5">
              {/* File Info Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50 border border-blue-200/80 p-3.5 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 truncate max-w-xs sm:max-w-md">{fileName}</h4>
                    <p className="text-[11px] text-slate-500">{fileSize} • {parsedRows.length} total rows parsed</p>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 px-3 py-1.5 rounded-xl transition-colors"
                >
                  Change File
                </button>
              </div>

              {/* Import Mode Destination Selector */}
              <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl space-y-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Import Destination & Workflow</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setImportMode('approval')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      importMode === 'approval'
                        ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'approval'}
                      onChange={() => setImportMode('approval')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>Send to Approval Center</span>
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded">Recommended</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Items are placed in staging. Admins can review, adjust pricing, and approve them in batch before they appear live to resellers.
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => setImportMode('direct')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      importMode === 'direct'
                        ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'direct'}
                      onChange={() => setImportMode('direct')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        <span>Direct Live Publish</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Immediately publishes all valid imported products to the active reseller catalog without review queue.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status KPI Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div 
                  onClick={() => setPreviewFilter('all')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    previewFilter === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div className="text-[10px] uppercase font-bold opacity-80">Total Rows</div>
                  <div className="text-lg font-black mt-0.5">{parsedRows.length}</div>
                </div>

                <div 
                  onClick={() => setPreviewFilter('new')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    previewFilter === 'new' ? 'bg-emerald-700 text-white border-emerald-700 shadow-md' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-400'
                  }`}
                >
                  <div className="text-[10px] uppercase font-bold opacity-80 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> New to Add
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
                    <RefreshCw className="w-3 h-3" /> Existing (Upsert)
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
                    <AlertTriangle className="w-3 h-3" /> Errors / Skipped
                  </div>
                  <div className="text-lg font-black mt-0.5">{totalInvalidCount}</div>
                </div>
              </div>

              {/* Table Controls (Filter & Search) */}
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
                  placeholder="Filter preview items..."
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>

              {/* Table Container */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2.5">Row</th>
                        <th className="px-3 py-2.5">Action</th>
                        <th className="px-3 py-2.5">Product Name</th>
                        <th className="px-3 py-2.5">SKU</th>
                        <th className="px-3 py-2.5">Category / Brand</th>
                        <th className="px-3 py-2.5">Cost Price</th>
                        <th className="px-3 py-2.5">Selling Price</th>
                        <th className="px-3 py-2.5">Stock</th>
                        <th className="px-3 py-2.5">Variants</th>
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
                                <RefreshCw className="w-3 h-3" /> Upsert
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                <CheckCircle2 className="w-3 h-3" /> New
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-slate-900 max-w-[180px] truncate" title={row.name}>
                              {row.name || <span className="text-rose-500 italic">Missing Name</span>}
                            </div>
                            {row.errors.length > 0 && (
                              <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                                {row.errors.join(', ')}
                              </div>
                            )}
                            {row.warnings.length > 0 && (
                              <div className="text-[10px] text-amber-600 font-medium mt-0.5 truncate max-w-[180px]" title={row.warnings.join(' • ')}>
                                ⚠️ {row.warnings[0]}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] font-semibold text-slate-700">
                            {row.sku}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="text-slate-800 font-semibold truncate max-w-[120px]">{row.categoryName}</div>
                            <div className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]">{row.brandName}</div>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-slate-700">
                            ৳{row.costPrice.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-blue-700">
                            ৳{row.sellingPrice.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.stock <= row.lowStockThreshold ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                            }`}>
                              {row.stock} pcs
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {row.hasVariants ? (
                              <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-md" title={row.variantsText}>
                                <Layers className="w-3 h-3" /> {row.variants.length} Variants
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">Standard</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredPreviewRows.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No rows match your current filter or search criteria.
                  </div>
                )}
              </div>

              {/* Upsert Strategy Notice */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs text-slate-600">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Upsert Behavior:</strong> Items with matching SKUs or Product IDs will automatically update stock quantity, reseller price, retail price, and variants in Firestore. New items will be created. Missing categories or brands will be created automatically.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Importing Progress */}
          {currentStep === 'importing' && (
            <div className="py-12 px-4 text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-inner animate-pulse">
                <Database className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-extrabold text-slate-900">Importing Products to Catalog...</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto truncate font-mono">{importStatusText}</p>
              </div>

              <div className="max-w-md mx-auto space-y-2">
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200">
                  <div 
                    className="bg-linear-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-300"
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
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-sm ${
                  importMode === 'approval' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                  {importMode === 'approval' ? <ShieldCheck className="w-10 h-10" /> : <CheckCircle2 className="w-10 h-10" />}
                </div>
                <h4 className="text-xl font-black text-slate-900">
                  {importMode === 'approval' ? 'Products Submitted for Approval!' : 'Product Import Completed!'}
                </h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  {importMode === 'approval' 
                    ? 'All valid products are now held in the Admin Approval Center. Review, edit prices, or batch-approve them whenever you are ready.'
                    : 'Your inventory catalog has been updated and published live successfully.'}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-center">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Processed</div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">{importResults.total}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center text-emerald-800">
                  <div className="text-[10px] font-bold uppercase">{importMode === 'approval' ? 'Staged (New)' : 'Newly Added'}</div>
                  <div className="text-xl font-black mt-0.5">{importResults.created}</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl text-center text-indigo-800">
                  <div className="text-[10px] font-bold uppercase">{importMode === 'approval' ? 'Staged (Update)' : 'Upserted / Updated'}</div>
                  <div className="text-xl font-black mt-0.5">{importResults.updated}</div>
                </div>
                <div className={`p-4 rounded-2xl text-center border ${importResults.failed > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <div className="text-[10px] font-bold uppercase">Errors / Skipped</div>
                  <div className="text-xl font-black mt-0.5">{importResults.failed}</div>
                </div>
              </div>

              {/* Failed Rows List if any */}
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
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Select File to Import</span>
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
                  {totalValidCount} valid products ready
                </span>
                <button
                  type="button"
                  disabled={totalValidCount === 0}
                  onClick={handleExecuteImport}
                  className={`px-6 py-2.5 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 ${
                    importMode === 'approval' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <span>{importMode === 'approval' ? `Submit for Approval (${totalValidCount})` : `Direct Import & Publish (${totalValidCount})`}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {currentStep === 'importing' && (
            <div className="w-full text-center text-xs font-bold text-slate-500">
              Please keep this window open while data is being synced...
            </div>
          )}

          {currentStep === 'summary' && (
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Import Another File
              </button>
              <div className="flex items-center gap-2">
                {importMode === 'approval' && onNavigateToApprovals && (
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseModal();
                      onNavigateToApprovals();
                    }}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Open Product Approvals</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Done & View Catalog</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
