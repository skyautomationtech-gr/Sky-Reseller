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

  const configureCameraTrack = async () => {
    try {
      const videoElement = document.querySelector(`#${readerElementId} video`) as HTMLVideoElement | null;
      if (!videoElement) return;

      // Apply FIT_CENTER style directly to video element to prevent crop or zoom
      videoElement.style.objectFit = 'contain';
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.transform = 'none';

      if (videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          const advancedConstraints: any = {};

          // 1. Force zoom ratio to exactly 1.0x (Disable all digital zoom)
          if ('zoom' in capabilities) {
            advancedConstraints.zoom = 1.0;
          }

          // 2. Keep continuous autofocus enabled
          if ('focusMode' in capabilities) {
            advancedConstraints.focusMode = 'continuous';
          }

          // 3. Enable auto exposure
          if ('exposureMode' in capabilities) {
            advancedConstraints.exposureMode = 'continuous';
          }

          // 4. Enable auto white balance
          if ('whiteBalanceMode' in capabilities) {
            advancedConstraints.whiteBalanceMode = 'continuous';
          }

          if (Object.keys(advancedConstraints).length > 0) {
            try {
              await track.applyConstraints({
                advanced: [advancedConstraints],
              });
            } catch (err) {
              console.warn('Track constraints apply fallback:', err);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to configure camera track settings:', err);
    }
  };

  const startScanner = async () => {
    await stopScanner();

    const element = document.getElementById(readerElementId);
    if (!element) return;

    // Primary attempt: standard environment camera with ideal dimensions and aspect ratio
    try {
      const html5Qrcode = new Html5Qrcode(readerElementId);
      scannerRef.current = html5Qrcode;

      const cameraConstraints: MediaTrackConstraints = {
        facingMode: { ideal: 'environment' }, // Back camera only
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 1.333333 }, // Standard 4:3 camera aspect ratio
      };

      const qrConfig = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const boxSize = Math.max(180, Math.floor(minDim * 0.7));
          return { width: boxSize, height: boxSize };
        },
        aspectRatio: 1.333333, // Prevents stretching or aspect distortion
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true, // Hardware accelerated QR/Barcode detection
        },
      };

      await html5Qrcode.start(
        cameraConstraints,
        qrConfig,
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        (errorMessage) => {
          // ignore transient scan frame errors
        }
      );

      // Force 1.0x zoom ratio, continuous focus, auto exposure/WB, and FIT_CENTER styling
      await configureCameraTrack();
    } catch (err: any) {
      const isPermissionDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        (typeof err === 'string' && err.toLowerCase().includes('permission denied')) ||
        err?.message?.toLowerCase().includes('permission denied') ||
        err?.message?.toLowerCase().includes('notallowederror');

      if (isPermissionDenied) {
        console.warn('Camera permission denied by user.');
        await stopScanner();
        setPermissionError(
          'Camera access was denied. Please allow camera permissions in your browser or app settings and click "Retry Camera".'
        );
        return;
      }

      console.warn('Camera access / scanner start failed, trying simple environment facingMode fallback:', err);
      await stopScanner(); // Completely clean up state before fallback attempt

      try {
        const fallbackQrcode = new Html5Qrcode(readerElementId);
        scannerRef.current = fallbackQrcode;

        await fallbackQrcode.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.333333,
          },
          (decodedText) => {
            handleScanSuccess(decodedText);
          },
          () => {}
        );

        await configureCameraTrack();
      } catch (fallbackErr: any) {
        console.warn('Camera fallback start failed:', fallbackErr);
        await stopScanner();
        setPermissionError(
          'Camera access is needed to scan QR codes. Please allow camera permission in your browser settings.'
        );
      }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        await scanner.clear();
      } catch (err) {
        console.warn('Error clearing/stopping scanner:', err);
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto">
        <div className="relative w-full max-w-lg bg-white sm:rounded-2xl shadow-2xl border-0 sm:border border-slate-200 overflow-hidden h-full sm:h-auto flex flex-col my-0 sm:my-6 animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-900 text-white shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-400 shrink-0" />
              <h3 className="font-bold text-sm sm:text-base">Scan Product QR Code</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Camera / Permission Body */}
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 overflow-y-auto">
            {permissionError ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs sm:text-sm flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed flex-1">{permissionError}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPermissionError('');
                    startScanner();
                  }}
                  className="w-full sm:w-auto self-end px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs min-h-[44px] cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Retry Camera</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs sm:text-sm text-slate-600 text-center font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  Align product QR code or barcode within frame
                </p>
                <div
                  id={readerElementId}
                  className="w-full min-h-[260px] sm:min-h-[320px] max-h-[50vh] bg-slate-950 rounded-2xl overflow-hidden relative flex items-center justify-center border border-slate-800 shadow-inner"
                />
                <div className="flex items-center justify-between px-1 text-[10px] sm:text-xs text-slate-400 font-medium">
                  <span>Full Frame Mode</span>
                  <span>Auto-Focus Enabled</span>
                </div>
              </div>
            )}

            {/* Manual Input Fallback */}
            <form onSubmit={handleManualSubmit} className="pt-3 border-t border-slate-100 space-y-2">
              <label className="block text-xs sm:text-sm font-bold text-slate-800">
                Or enter SKU / Barcode / QR value manually:
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. SAT-PRD-1002"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 text-base sm:text-xs rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none min-h-[44px]"
                />
                <button
                  type="submit"
                  disabled={searching || !manualInput.trim()}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors shrink-0 disabled:opacity-50 min-h-[44px] cursor-pointer active:scale-98"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Search Product</span>
                </button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex justify-end shrink-0 sticky bottom-0 z-10">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors min-h-[44px] cursor-pointer"
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
