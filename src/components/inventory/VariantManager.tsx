import React, { useState, useRef } from 'react';
import { ProductVariant, ProductMedia } from '../../types';
import { Plus, Trash2, Upload, Palette, Check, Image as ImageIcon } from 'lucide-react';
import { storage } from '../../lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

interface VariantManagerProps {
  hasVariants: boolean;
  setHasVariants: (val: boolean) => void;
  variants: ProductVariant[];
  setVariants: React.Dispatch<React.SetStateAction<ProductVariant[]>>;
  baseSku: string;
  productId: string;
}

export const VariantManager: React.FC<VariantManagerProps> = ({
  hasVariants,
  setHasVariants,
  variants,
  setVariants,
  baseSku,
  productId,
}) => {
  const [uploadingVariantIndex, setUploadingVariantIndex] = useState<number | null>(null);
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const handleAddVariant = () => {
    const newVariant: ProductVariant = {
      id: `var_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      colorName: '',
      colorSwatchUrl: '#0f172a',
      images: [],
      stock: 10,
      priceAdjustment: 0,
      sku: `${baseSku}-${variants.length + 1}`,
      status: 'active',
    };
    setVariants([...variants, newVariant]);
  };

  const handleUpdateVariant = (index: number, field: keyof ProductVariant, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-update SKU suffix if colorName changes
    if (field === 'colorName') {
      const suffix = value ? value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) : `V${index + 1}`;
      updated[index].sku = `${baseSku}-${suffix}`;
    }

    setVariants(updated);
  };

  const handleDeleteVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleVariantImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingVariantIndex(index);
    const currentVariant = variants[index];
    const newImages = [...currentVariant.images];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 700;
              const MAX_HEIGHT = 700;
              let width = img.width;
              let height = img.height;
              if (width > height) {
                if (width > MAX_WIDTH) {
                  height *= MAX_WIDTH / width;
                  width = MAX_WIDTH;
                }
              } else {
                if (height > MAX_HEIGHT) {
                  width *= MAX_HEIGHT / height;
                  height = MAX_HEIGHT;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              // Compressed to ensure small size (< 80KB) to prevent Firestore 1MB document limit error
              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
              resolve(compressedDataUrl);
            };
            img.onerror = () => resolve(event.target?.result as string || '');
            img.src = event.target?.result as string;
          };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });

        if (dataUrl) {
          newImages.push({
            url: dataUrl,
            path: '',
            isCover: newImages.length === 0,
            uploadedAt: new Date().toISOString()
          });
        }
      }

      const updated = [...variants];
      updated[index] = { ...updated[index], images: newImages };
      setVariants(updated);
    } catch (err) {
      console.error('Error uploading variant image:', err);
    } finally {
      setUploadingVariantIndex(null);
      if (fileInputRefs.current[index]) {
        fileInputRefs.current[index]!.value = '';
      }
    }
  };

  return (
    <div className="space-y-4 bg-slate-50/70 p-5 rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Palette className="w-4 h-4 text-blue-600" />
            Product Variants (Color & Specifications)
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Enable color variants to manage per-color stock, images, pricing adjustments, and SKUs.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={hasVariants}
            onChange={(e) => {
              setHasVariants(e.target.checked);
              if (e.target.checked && variants.length === 0) {
                handleAddVariant();
              }
            }}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          <span className="ml-2 text-xs font-bold text-slate-700">{hasVariants ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      {hasVariants && (
        <div className="space-y-4 pt-3 border-t border-slate-200">
          {variants.map((variant, idx) => (
            <div key={variant.id || idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4 relative group">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-900">Color Variant</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={variant.status === 'active'}
                      onChange={(e) => handleUpdateVariant(idx, 'status', e.target.checked ? 'active' : 'inactive')}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDeleteVariant(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Remove Variant"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Color Name */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Color Name *</label>
                  <input
                    type="text"
                    required
                    value={variant.colorName}
                    onChange={(e) => handleUpdateVariant(idx, 'colorName', e.target.value)}
                    placeholder="e.g. Midnight Black, Rose Gold"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                </div>

                {/* Color Swatch */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Color Swatch / Code</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={variant.colorSwatchUrl && variant.colorSwatchUrl.startsWith('#') ? variant.colorSwatchUrl : '#0f172a'}
                      onChange={(e) => handleUpdateVariant(idx, 'colorSwatchUrl', e.target.value)}
                      className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={variant.colorSwatchUrl || ''}
                      onChange={(e) => handleUpdateVariant(idx, 'colorSwatchUrl', e.target.value)}
                      placeholder="#HEX or image URL"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* SKU */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Variant SKU</label>
                  <input
                    type="text"
                    value={variant.sku}
                    onChange={(e) => handleUpdateVariant(idx, 'sku', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Stock */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={variant.stock}
                    onChange={(e) => handleUpdateVariant(idx, 'stock', parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>

                {/* Price Adjustment */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Price Adjustment (+/- BDT)</label>
                  <input
                    type="number"
                    value={variant.priceAdjustment}
                    onChange={(e) => handleUpdateVariant(idx, 'priceAdjustment', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Added to base price for this color</p>
                </div>
              </div>

              {/* Variant Images */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-600 uppercase">Variant Images ({variant.images?.length || 0})</span>
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[idx]?.click()}
                    className="bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-[11px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Color Photos
                  </button>
                  <input
                    type="file"
                    ref={(el) => (fileInputRefs.current[idx] = el)}
                    onChange={(e) => handleVariantImageUpload(idx, e)}
                    multiple
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                {variant.images && variant.images.length > 0 && (
                  <div className="grid grid-cols-5 gap-2 pt-1">
                    {variant.images.map((img, imgIdx) => (
                      <div key={imgIdx} className="relative group/img rounded-lg border border-slate-200 overflow-hidden aspect-square">
                        <img src={img.url} alt={`Variant ${idx} img ${imgIdx}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            const updatedImages = variant.images.filter((_, i) => i !== imgIdx);
                            const updated = [...variants];
                            updated[idx] = { ...updated[idx], images: updatedImages };
                            setVariants(updated);
                          }}
                          className="absolute inset-0 bg-rose-600/70 text-white opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center font-bold text-xs"
                          title="Remove image"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddVariant}
            className="w-full py-3 bg-white hover:bg-slate-50 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl text-xs font-bold text-blue-600 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Another Color Variant
          </button>
        </div>
      )}
    </div>
  );
};
