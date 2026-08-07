import React, { useState } from 'react';
import { Product } from '../../types';
import { QRCodeSVG } from 'qrcode.react';
import { X, Package, ShieldCheck, Tag, Layers, CheckCircle2, ChevronLeft, ChevronRight, QrCode } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
}) => {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  if (!isOpen || !product) return null;

  const images = product.images || [];
  const activeMedia = images[activeMediaIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-sm">Product Detail View</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 md:p-8 space-y-6 overflow-y-auto flex-1">
          {/* Top Section: Media + Key Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Gallery */}
            <div className="space-y-3">
              <div className="relative aspect-square rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center">
                {activeMedia ? (
                  <img
                    src={activeMedia.url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-slate-400 text-xs font-semibold">
                    No Image Available
                  </div>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveMediaIndex(idx)}
                      className={`w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0 transition-all ${
                        activeMediaIndex === idx ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200 opacity-70'
                      }`}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Meta */}
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">
                  {product.categoryName || 'Uncategorized'}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 leading-snug mt-1">
                  {product.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">SKU: {product.sku}</p>
              </div>

              {/* Pricing Cards */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Retail Price</span>
                  <span className="text-base font-extrabold text-slate-900">৳{product.retailPrice}</span>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                  <span className="text-[10px] text-blue-600 font-semibold block uppercase">Reseller Price</span>
                  <span className="text-base font-extrabold text-blue-700">৳{product.resellerPrice}</span>
                </div>
              </div>

              {/* Stock Status */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">Stock Availability:</span>
                <span className={`font-bold px-2.5 py-0.5 rounded-full ${
                  (product.stock || 0) <= (product.lowStockThreshold || 5)
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {product.stock || 0} Units In Stock
                </span>
              </div>

              {/* Warranty */}
              {product.warranty && (
                <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Warranty: {product.warranty}</span>
                </div>
              )}
            </div>
          </div>

          {/* Color Variants Section if available */}
          {product.hasVariants && product.variants && product.variants.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Color Variants ({product.variants.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.variants.map((v, idx) => (
                  <div
                    key={v.id || idx}
                    className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{v.colorName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">SKU: {v.sku}</p>
                    </div>
                    <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      {v.stock} in stock
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div className="space-y-1.5 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Description</h4>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200 whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}

          {/* QR Code & Barcode */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Product Barcode / QR Code</span>
              <p className="font-mono text-xs font-bold text-slate-800">{product.qrValue || product.sku}</p>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <QRCodeSVG value={product.qrValue || product.sku} size={50} level="M" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 bg-slate-100 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
