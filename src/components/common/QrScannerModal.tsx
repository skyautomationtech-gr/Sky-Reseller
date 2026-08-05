import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Product } from '../../types';
import { ProductDetailModal } from '../inventory/ProductDetailModal';
import { QrCode, Camera, AlertCircle, X, Search, Loader2 } from 'lucide-react';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ isOpen, onClose }) => {
  const [permissionError, setPermissionError] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [isProductDetailOpen, setIsProductDetailOpen] = useState<boolean>(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = 'qr-reader-container';

  useEffect(() => {
    if (isOpen) {
      setPermissionError('');
      setManualInput('');
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const startScanner = async () => {
    try {
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch (_) {}
      }

      const html5Qrcode = new Html5Qrcode(readerElementId);
      scannerRef.current = html5Qrcode;

      await html5Qrcode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        (errorMessage) => {
          // ignore transient scan frame errors
        }
      );
    } catch (err: any) {
      console.warn('Camera access / scanner start failed:', err);
      setPermissionError(
        'Camera access is needed to scan QR codes. Please allow camera permission in your browser settings.'
      );
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.error('Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
      }
    }
  };

  const handleScanSuccess = async (codeValue: string) => {
    if (!codeValue || searching) return;
    await lookupProductByCode(codeValue);
  };

  const lookupProductByCode = async (codeValue: string) => {
    setSearching(true);
    const cleanCode = codeValue.trim();

    try {
      const productsSnap = await getDocs(collection(db, 'products'));
      let found: Product | null = null;

      productsSnap.forEach((docSnap) => {
        const p = Object.assign({ id: docSnap.id }, docSnap.data()) as unknown as Product;
        if (
          p.sku?.toLowerCase() === cleanCode.toLowerCase() ||
          p.qrValue?.toLowerCase() === cleanCode.toLowerCase() ||
          p.barcodeValue?.toLowerCase() === cleanCode.toLowerCase() ||
          p.id === cleanCode
        ) {
          found = p;
        }
      });

      if (found) {
        setScannedProduct(found);
        setIsProductDetailOpen(true);
        stopScanner();
      } else {
        alert(`No product found matching code: "${cleanCode}"`);
      }
    } catch (err) {
      console.error('Error searching product by code:', err);
      alert('Failed to search product database.');
    } finally {
      setSearching(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      lookupProductByCode(manualInput);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-400" />
              <h3 className="font-bold text-sm">Scan Product QR Code</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Camera / Permission Body */}
          <div className="p-6 space-y-5">
            {permissionError ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{permissionError}</div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 text-center font-medium">
                  Point camera at the product's QR code or barcode
                </p>
                <div
                  id={readerElementId}
                  className="w-full h-64 bg-slate-900 rounded-2xl overflow-hidden border-2 border-dashed border-slate-300 relative flex items-center justify-center"
                />
              </div>
            )}

            {/* Manual Input Fallback */}
            <form onSubmit={handleManualSubmit} className="pt-3 border-t border-slate-100 space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Or enter SKU / Barcode / QR value manually:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. SKU-1002"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                />
                <button
                  type="submit"
                  disabled={searching || !manualInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-colors shrink-0 disabled:opacity-50"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Search</span>
                </button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Product Detail Modal */}
      <ProductDetailModal
        isOpen={isProductDetailOpen}
        product={scannedProduct}
        onClose={() => {
          setIsProductDetailOpen(false);
          setScannedProduct(null);
          onClose();
        }}
      />
    </>
  );
};
