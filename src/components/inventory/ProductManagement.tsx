import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Product, Category, Brand, UserProfile, ProductMedia, ProductVideoMedia, ProductVariant } from '../../types';
import { VariantManager } from './VariantManager';
import { 
  Package, Plus, Edit2, Trash2, Search, AlertTriangle, 
  CheckCircle2, XCircle, QrCode as QrIcon, Loader2, 
  Upload, Play, Download, Eye, ChevronLeft, ChevronRight, Palette
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import JsBarcode from 'jsbarcode';

interface ProductManagementProps {
  user: UserProfile;
}

export const ProductManagement: React.FC<ProductManagementProps> = ({ user }) => {
  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = user.role === 'admin' || isSuperAdmin;
  const isReseller = user.role === 'reseller';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'low_stock'>('all');

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingQrProduct, setViewingQrProduct] = useState<Product | null>(null);
  const [viewingProductDetails, setViewingProductDetails] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  // Form Fields
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [resellerPrice, setResellerPrice] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [stock, setStock] = useState('10');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [warranty, setWarranty] = useState('6 Months');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<ProductMedia[]>([]);
  const [videos, setVideos] = useState<ProductVideoMedia[]>([]);
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (viewingQrProduct && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, viewingQrProduct.barcodeValue || viewingQrProduct.sku, {
          format: 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 12,
          background: '#ffffff',
          lineColor: '#0f172a',
        });
      } catch (e) {
        console.error('Barcode render error:', e);
      }
    }
  }, [viewingQrProduct]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catSnap, brandSnap, prodSnap] = await Promise.all([
        getDocs(collection(db, 'categories')),
        getDocs(collection(db, 'brands')),
        getDocs(collection(db, 'products'))
      ]);

      const catList: Category[] = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      const brandList: Brand[] = brandSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Brand));
      const prodList: Product[] = prodSnap.docs.map(doc => {
        const data = doc.data();
        // Normalize legacy image strings to ProductMedia objects if needed
        const rawImages = data.images || [];
        const normalizedImages: ProductMedia[] = rawImages.map((img: any, idx: number) => {
          if (typeof img === 'string') {
            return { url: img, path: '', isCover: idx === 0 };
          }
          return img;
        });
        const rawVideos = data.videos || [];
        const normalizedVideos: ProductVideoMedia[] = rawVideos.map((vid: any) => {
          if (typeof vid === 'string') {
            return { url: vid, path: '' };
          }
          return vid;
        });

        return {
          id: doc.id,
          ...data,
          images: normalizedImages,
          videos: normalizedVideos,
        } as Product;
      });

      setCategories(catList);
      setBrands(brandList);
      setProducts(prodList.filter(p => p.status !== 'deleted'));
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateSku = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `SAT-PRD-${randomNum}`;
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setCategoryId(categories[0]?.id || '');
    setBrandId(brands[0]?.id || '');
    setName('');
    setSku(generateSku());
    setCostPrice('');
    setResellerPrice('');
    setRetailPrice('');
    setStock('25');
    setLowStockThreshold('5');
    setWarranty('6 Months');
    setDescription('');
    setImages([]);
    setVideos([]);
    setHasVariants(false);
    setVariants([]);
    setStatus('active');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setCategoryId(product.categoryId);
    setBrandId(product.brandId);
    setName(product.name);
    setSku(product.sku);
    setCostPrice(product.costPrice?.toString() || '');
    setResellerPrice(product.resellerPrice?.toString() || '');
    setRetailPrice(product.retailPrice?.toString() || '');
    setStock(product.stock?.toString() || '0');
    setLowStockThreshold(product.lowStockThreshold?.toString() || '5');
    setWarranty(product.warranty || '');
    setDescription(product.description || '');
    setImages(product.images || []);
    setVideos(product.videos || []);
    setHasVariants(product.hasVariants || false);
    setVariants(product.variants || []);
    setStatus(product.status === 'inactive' ? 'inactive' : 'active');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newImages = [...images];
    const newVideos = [...videos];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov)$/i);
      const isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|webp)$/i);

      if (!isImage && !isVideo) {
        alert(`File "${file.name}" is not a supported image or video format.`);
        continue;
      }

      if (isImage && file.size > 15 * 1024 * 1024) {
        alert(`Image "${file.name}" exceeds 15MB size limit.`);
        continue;
      }
      if (isVideo && file.size > 50 * 1024 * 1024) {
        alert(`Video "${file.name}" exceeds 50MB size limit.`);
        continue;
      }

      setUploadingFiles(prev => [...prev, { name: file.name, progress: 30 }]);

      try {
        await new Promise(r => setTimeout(r, 100));
        setUploadingFiles(prev => prev.map(f => f.name === file.name ? { ...f, progress: 70 } : f));

        let fileUrl = '';
        if (isVideo) {
          fileUrl = URL.createObjectURL(file);
        } else {
          fileUrl = await new Promise<string>((resolve) => {
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
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                resolve(dataUrl);
              };
              img.onerror = () => resolve(event.target?.result as string || '');
              img.src = event.target?.result as string;
            };
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
          });
        }

        setUploadingFiles(prev => prev.map(f => f.name === file.name ? { ...f, progress: 100 } : f));
        await new Promise(r => setTimeout(r, 150));

        if (isVideo && fileUrl) {
          newVideos.push({
            url: fileUrl,
            path: '',
            uploadedAt: new Date().toISOString()
          });
        } else if (!isVideo && fileUrl) {
          newImages.push({
            url: fileUrl,
            path: '',
            isCover: newImages.length === 0,
            uploadedAt: new Date().toISOString()
          });
        }
      } catch (err: any) {
        console.error('File load error:', err);
        alert(`Failed to load ${file.name}: ${err.message || err}`);
      } finally {
        setUploadingFiles(prev => prev.filter(f => f.name !== file.name));
      }
    }

    setImages(newImages);
    setVideos(newVideos);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveMedia = async (type: 'image' | 'video', index: number) => {
    if (type === 'image') {
      const item = images[index];
      if (item.path) {
        try {
          await deleteObject(ref(storage, item.path));
        } catch (err) {
          console.error('Error deleting from storage:', err);
        }
      }
      const updated = images.filter((_, i) => i !== index);
      if (item.isCover && updated.length > 0) {
        updated[0].isCover = true;
      }
      setImages(updated);
    } else {
      const item = videos[index];
      if (item.path) {
        try {
          await deleteObject(ref(storage, item.path));
        } catch (err) {
          console.error('Error deleting from storage:', err);
        }
      }
      setVideos(videos.filter((_, i) => i !== index));
    }
  };

  const handleSetCover = (index: number) => {
    setImages(images.map((img, i) => ({
      ...img,
      isCover: i === index
    })));
  };

  const handleDownloadMedia = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'sky-product-media';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(url, '_blank');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId || !brandId) {
      setFormError('Please fill in product name, category, and brand.');
      return;
    }

    let finalStock = parseInt(stock, 10) || 0;
    let finalVariants: ProductVariant[] = [];

    if (hasVariants) {
      if (variants.length === 0) {
        setFormError('Please add at least one color variant when variants are enabled.');
        return;
      }
      for (const v of variants) {
        if (!v.colorName || v.colorName.trim() === '') {
          setFormError('All color variants must have a Color Name.');
          return;
        }
        if (v.stock === undefined || v.stock < 0) {
          setFormError(`Stock quantity for color "${v.colorName || 'Unnamed'}" is required.`);
          return;
        }
      }
      finalStock = variants.reduce((acc, v) => acc + (v.stock || 0), 0);
      finalVariants = variants;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const selectedCat = categories.find(c => c.id === categoryId);
      const selectedBrand = brands.find(b => b.id === brandId);

      const barcodeValue = `890${Math.floor(100000000 + Math.random() * 900000000)}`;
      const qrValue = `SAT-PROD-${sku}-${Date.now()}`;

      const productData = {
        sku: sku.trim(),
        barcodeValue: editingProduct ? editingProduct.barcodeValue : barcodeValue,
        qrValue: editingProduct ? editingProduct.qrValue : qrValue,
        categoryId,
        categoryName: selectedCat?.name || 'General',
        brandId,
        brandName: selectedBrand?.name || 'Generic',
        name: name.trim(),
        costPrice: isSuperAdmin ? parseFloat(costPrice) || 0 : (editingProduct ? editingProduct.costPrice : 0),
        resellerPrice: parseFloat(resellerPrice) || 0,
        retailPrice: parseFloat(retailPrice) || 0,
        stock: finalStock,
        lowStockThreshold: parseInt(lowStockThreshold, 10) || 5,
        warranty: warranty.trim(),
        description: description.trim(),
        images,
        videos,
        hasVariants,
        variants: finalVariants,
        status,
        updatedAt: serverTimestamp(),
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
      } else {
        await addDoc(collection(db, 'products'), {
          ...productData,
          createdAt: serverTimestamp(),
        });
      }

      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    const id = productToDelete.id;
    setIsDeleting(true);
    try {
      // Optimistic update
      setProducts(prev => prev.filter(p => p.id !== id));
      await deleteDoc(doc(db, 'products', id));
      setProductToDelete(null);
      fetchData();
    } catch (err: any) {
      console.error('Delete error:', err);
      // Soft-delete fallback
      try {
        await updateDoc(doc(db, 'products', id), {
          status: 'deleted',
          updatedAt: serverTimestamp(),
        });
        setProductToDelete(null);
        fetchData();
      } catch (fallbackErr: any) {
        console.error('Fallback delete error:', fallbackErr);
        alert(`Failed to delete product: ${fallbackErr.message || fallbackErr}`);
        fetchData();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const matchesBrand = selectedBrand === 'all' || p.brandId === selectedBrand;

    let matchesStatus = true;
    if (statusFilter === 'active') matchesStatus = p.status === 'active';
    else if (statusFilter === 'inactive') matchesStatus = p.status === 'inactive';
    else if (statusFilter === 'low_stock') matchesStatus = p.stock <= (p.lowStockThreshold || 5);

    return matchesSearch && matchesCat && matchesBrand && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const getCoverImage = (p: Product) => {
    if (!p.images || p.images.length === 0) return null;
    const cover = p.images.find(img => img.isCover);
    if (cover) return cover.url;
    return typeof p.images[0] === 'string' ? p.images[0] : p.images[0].url;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Product Catalog & Inventory</h2>
          <p className="text-xs text-slate-500">
            {isReseller ? 'Browse accessories catalog, check reseller prices, and download marketing media.' : 'Manage inventory, pricing, stock levels, and media uploads.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={handleOpenAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Product</span>
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="all">All Brands</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {(['all', 'active', 'low_stock'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold capitalize transition-all ${
                  statusFilter === tab ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Product List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Product</th>
                {!isReseller && <th className="px-6 py-4">SKU</th>}
                <th className="px-6 py-4">Category / Brand</th>
                {isSuperAdmin && <th className="px-6 py-4">Cost Price</th>}
                <th className="px-6 py-4">Reseller Price</th>
                <th className="px-6 py-4">Retail Price</th>
                <th className="px-6 py-4">Stock</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredProducts.map((p) => {
                const isLowStock = p.stock <= (p.lowStockThreshold || 5);
                const coverImg = getCoverImage(p);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {coverImg ? (
                          <img src={coverImg} alt={p.name} className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <p 
                            onClick={() => { setViewingProductDetails(p); setActiveMediaIndex(0); setSelectedVariantIndex(0); }}
                            className="font-bold text-slate-900 hover:text-blue-600 cursor-pointer transition-colors"
                          >
                            {p.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-slate-400">
                              {p.images?.length || 0} images • {p.videos?.length || 0} videos
                            </span>
                            {p.hasVariants && p.variants && p.variants.length > 0 && (
                              <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200" title={`${p.variants.length} color variants`}>
                                <Palette className="w-3 h-3 text-blue-600" />
                                <div className="flex items-center gap-1">
                                  {p.variants.map((v, vIdx) => (
                                    <span
                                      key={vIdx}
                                      className="w-2.5 h-2.5 rounded-full border border-slate-300 inline-block"
                                      style={{ backgroundColor: v.colorSwatchUrl && v.colorSwatchUrl.startsWith('#') ? v.colorSwatchUrl : '#0f172a' }}
                                      title={`${v.colorName}: ${v.stock} in stock`}
                                    />
                                  ))}
                                </div>
                                <span className="text-[10px] font-bold text-slate-600">({p.variants.length})</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {!isReseller && (
                      <td className="px-6 py-4 font-mono text-xs text-slate-600 font-semibold">
                        {p.sku}
                      </td>
                    )}

                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900 text-xs">{p.categoryName}</p>
                      <p className="text-slate-500 text-[11px]">{p.brandName}</p>
                    </td>

                    {isSuperAdmin && (
                      <td className="px-6 py-4 font-mono text-xs text-slate-700 font-bold">
                        ৳ {p.costPrice?.toFixed(2)}
                      </td>
                    )}

                    <td className="px-6 py-4 font-mono text-xs text-blue-600 font-bold">
                      ৳ {p.resellerPrice?.toFixed(2)}
                    </td>

                    <td className="px-6 py-4 font-mono text-xs text-slate-900 font-bold">
                      ৳ {p.retailPrice?.toFixed(2)}
                    </td>

                    <td className="px-6 py-4">
                      {isReseller ? (
                        p.stock > 0 ? (
                          <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                            In Stock
                          </span>
                        ) : (
                          <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                            Out of Stock
                          </span>
                        )
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold text-xs ${isLowStock ? 'text-rose-600' : 'text-slate-900'}`}>
                            {p.stock} units
                          </span>
                          {isLowStock && (
                            <span className="bg-rose-50 text-rose-600 text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Low Stock
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {p.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                          <XCircle className="w-3 h-3" /> Inactive
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setViewingProductDetails(p); setActiveMediaIndex(0); }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Details & Media Gallery"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!isReseller && (
                          <button
                            onClick={() => setViewingQrProduct(p)}
                            className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="View QR & Barcode"
                          >
                            <QrIcon className="w-4 h-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleOpenEdit(p)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit Product"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductToDelete(p);
                              }}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors relative z-10"
                              title="Delete Product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-xs">
                    No products found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Detail & Media Gallery Modal (For Reseller / Admin) */}
      {viewingProductDetails && (() => {
        const activeVariant = viewingProductDetails.hasVariants && viewingProductDetails.variants ? viewingProductDetails.variants[selectedVariantIndex] : null;
        const currentResellerPrice = viewingProductDetails.resellerPrice + (activeVariant ? (activeVariant.priceAdjustment || 0) : 0);
        const currentRetailPrice = viewingProductDetails.retailPrice + (activeVariant ? (activeVariant.priceAdjustment || 0) : 0);
        const currentStock = activeVariant ? activeVariant.stock : viewingProductDetails.stock;
        const currentImages = (activeVariant && activeVariant.images && activeVariant.images.length > 0) ? activeVariant.images : viewingProductDetails.images;
        const currentSku = activeVariant ? activeVariant.sku : viewingProductDetails.sku;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 my-8">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="bg-blue-100 text-blue-700 font-bold text-xs px-3 py-1 rounded-lg">
                    {viewingProductDetails.categoryName}
                  </span>
                  <h3 className="font-bold text-slate-900 text-lg">{viewingProductDetails.name}</h3>
                </div>
                <button
                  onClick={() => setViewingProductDetails(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-xl p-2"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 max-h-[75vh] overflow-y-auto">
                {/* Left Column: Media Gallery & Carousel / Downloads */}
                <div className="space-y-4">
                  {/* Main Media Preview */}
                  <div className="bg-slate-900 rounded-2xl overflow-hidden aspect-square relative flex items-center justify-center border border-slate-200 shadow-md">
                    {currentImages && currentImages.length > 0 ? (
                      <img 
                        src={currentImages[activeMediaIndex]?.url || currentImages[0].url} 
                        alt={viewingProductDetails.name} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-slate-500 text-xs flex flex-col items-center gap-2">
                        <Package className="w-12 h-12" />
                        <span>No images available</span>
                      </div>
                    )}

                    {/* Navigation Arrows if multiple images */}
                    {currentImages && currentImages.length > 1 && (
                      <>
                        <button
                          onClick={() => setActiveMediaIndex(prev => (prev === 0 ? currentImages.length - 1 : prev - 1))}
                          className="absolute left-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setActiveMediaIndex(prev => (prev === currentImages.length - 1 ? 0 : prev + 1))}
                          className="absolute right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Thumbnails & Download buttons for Images */}
                  {currentImages && currentImages.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Image Gallery & Marketing Downloads</p>
                      <div className="grid grid-cols-4 gap-2">
                        {currentImages.map((img, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => setActiveMediaIndex(idx)}
                            className={`relative group rounded-xl border-2 overflow-hidden aspect-square cursor-pointer transition-all ${
                              activeMediaIndex === idx ? 'border-blue-600 ring-2 ring-blue-600/20' : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <img src={img.url} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadMedia(img.url, `${currentSku}_image_${idx + 1}.jpg`);
                                }}
                                className="bg-white text-slate-900 p-2 rounded-lg shadow-md hover:bg-blue-600 hover:text-white transition-colors"
                                title="Download Image for Marketing"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Videos Section */}
                  {viewingProductDetails.videos && viewingProductDetails.videos.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Product Videos & Clips</p>
                      <div className="space-y-3">
                        {viewingProductDetails.videos.map((vid, idx) => (
                          <div key={idx} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-200 p-3 space-y-2">
                            <video src={vid.url} controls className="w-full rounded-lg max-h-48 object-cover" />
                            <div className="flex justify-between items-center text-xs text-white">
                              <span>Video Clip #{idx + 1}</span>
                              <button
                                onClick={() => handleDownloadMedia(vid.url, `${viewingProductDetails.sku}_video_${idx + 1}.mp4`)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" /> Download Video
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Specifications & Pricing */}
                <div className="space-y-5">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Brand: {viewingProductDetails.brandName}</span>
                    <h3 className="text-xl font-bold text-slate-900 mt-1">{viewingProductDetails.name}</h3>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">SKU: {currentSku}</p>
                  </div>

                  {/* Color Variant Selector if hasVariants */}
                  {viewingProductDetails.hasVariants && viewingProductDetails.variants && viewingProductDetails.variants.length > 0 && (
                    <div className="space-y-2 pt-1 pb-1 border-y border-slate-100">
                      <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-blue-600" /> Select Color Variant:
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {viewingProductDetails.variants.map((v, vIdx) => {
                          const isSelected = selectedVariantIndex === vIdx;
                          return (
                            <button
                              key={v.id || vIdx}
                              type="button"
                              onClick={() => {
                                setSelectedVariantIndex(vIdx);
                                setActiveMediaIndex(0);
                              }}
                              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                                isSelected ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <span
                                className="w-4 h-4 rounded-full border border-slate-300 shrink-0 shadow-xs"
                                style={{ backgroundColor: v.colorSwatchUrl && v.colorSwatchUrl.startsWith('#') ? v.colorSwatchUrl : '#0f172a' }}
                              />
                              <span>{v.colorName}</span>
                              <span className="text-[10px] font-normal text-slate-500">({v.stock} avail)</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Reseller Price</span>
                      <p className="text-xl font-bold text-blue-600 font-mono mt-0.5">৳ {currentResellerPrice.toFixed(2)}</p>
                      {activeVariant?.priceAdjustment ? (
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({activeVariant.priceAdjustment >= 0 ? `+${activeVariant.priceAdjustment}` : activeVariant.priceAdjustment} adj)
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Retail Price</span>
                      <p className="text-xl font-bold text-slate-900 font-mono mt-0.5">৳ {currentRetailPrice.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs text-slate-600">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="font-semibold text-slate-700">Stock Availability:</span>
                      <span className="font-bold text-slate-900">
                        {currentStock} units {activeVariant ? `(${activeVariant.colorName})` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="font-semibold text-slate-700">Warranty:</span>
                      <span className="font-bold text-slate-900">{viewingProductDetails.warranty || 'Standard Warranty'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="font-semibold text-slate-700">Category:</span>
                      <span className="font-bold text-slate-900">{viewingProductDetails.categoryName}</span>
                    </div>
                  </div>

                  {viewingProductDetails.description && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Description</h4>
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                        {viewingProductDetails.description}
                      </p>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 space-y-1">
                    <p className="font-bold">Marketing Toolkit</p>
                    <p className="text-blue-600 text-[11px]">
                      Download product images and videos directly to your device for publishing on Facebook, Instagram, TikTok, or WhatsApp status.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add / Edit Product Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Category *
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-white"
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Brand *
                  </label>
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-white"
                  >
                    <option value="">Select Brand</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. JBL Go 3 Waterproof Bluetooth Speaker"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {isSuperAdmin && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Cost Price (BDT) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm font-mono"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Reseller Price (BDT) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={resellerPrice}
                    onChange={(e) => setResellerPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Retail Price (BDT) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={retailPrice}
                    onChange={(e) => setRetailPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Stock Quantity
                  </label>
                  <input
                    type="number"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Low Stock Threshold
                  </label>
                  <input
                    type="number"
                    required
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Warranty
                  </label>
                  <input
                    type="text"
                    value={warranty}
                    onChange={(e) => setWarranty(e.target.value)}
                    placeholder="e.g. 6 Months"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Product Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter product details, specifications..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                />
              </div>

              {/* Product Variants Section */}
              <VariantManager
                hasVariants={hasVariants}
                setHasVariants={setHasVariants}
                variants={variants}
                setVariants={setVariants}
                baseSku={sku || 'SAT-PRD'}
                productId={editingProduct ? editingProduct.id : 'new'}
              />

              {/* Native File Upload Area */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Product Media (Images & Videos)
                </label>
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50 hover:bg-blue-50/30 transition-all group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    multiple
                    accept="image/*,video/mp4,video/quicktime"
                    className="hidden"
                  />
                  <div className="w-12 h-12 bg-white text-blue-600 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 mb-1">Click to upload or drag and drop</p>
                  <p className="text-[11px] text-slate-500">
                    Images (JPG, PNG, WEBP — max 5MB) & Videos (MP4, MOV — max 50MB)
                  </p>
                </div>

                {/* Upload Progress */}
                {uploadingFiles.length > 0 && (
                  <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {uploadingFiles.map((f, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                          <span className="truncate max-w-[200px]">{f.name}</span>
                          <span>{f.progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${f.progress}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Images Preview Grid */}
                {images.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-700 uppercase mb-2">Uploaded Images ({images.length})</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {images.map((img, idx) => (
                        <div key={idx} className="relative group bg-slate-100 rounded-xl border border-slate-200 overflow-hidden aspect-square">
                          <img src={img.url} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                          
                          {img.isCover && (
                            <span className="absolute top-2 left-2 bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                              Cover
                            </span>
                          )}

                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            {!img.isCover && (
                              <button
                                type="button"
                                onClick={() => handleSetCover(idx)}
                                className="bg-white text-slate-900 px-2 py-1 rounded-lg text-[10px] font-bold shadow-sm hover:bg-slate-100"
                                title="Set as Cover"
                              >
                                Cover
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMedia('image', idx)}
                              className="bg-rose-600 text-white p-1.5 rounded-lg text-xs font-bold hover:bg-rose-700 shadow-sm"
                              title="Remove Image"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Videos Preview Grid */}
                {videos.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-700 uppercase mb-2">Uploaded Videos ({videos.length})</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {videos.map((vid, idx) => (
                        <div key={idx} className="relative group bg-slate-900 rounded-xl border border-slate-200 overflow-hidden aspect-video flex items-center justify-center">
                          <video src={vid.url} className="w-full h-full object-cover" muted />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="w-10 h-10 bg-white/90 text-slate-900 rounded-full flex items-center justify-center shadow-lg">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveMedia('video', idx)}
                            className="absolute top-2 right-2 bg-rose-600 text-white p-1.5 rounded-lg text-xs font-bold hover:bg-rose-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove Video"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-white"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingProduct ? 'Update Product' : 'Save Product'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code & Barcode Modal */}
      {viewingQrProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 text-center p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="font-bold text-slate-900 text-base">Product Barcode & QR</h3>
              <button
                onClick={() => setViewingQrProduct(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div>
              <p className="font-bold text-slate-900 text-sm mb-1">{viewingQrProduct.name}</p>
              <p className="font-mono text-xs text-slate-500">SKU: {viewingQrProduct.sku}</p>
            </div>

            <div className="flex flex-col items-center justify-center space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <div className="bg-white p-3 rounded-xl shadow-xs inline-block">
                <QRCodeSVG value={viewingQrProduct.qrValue || viewingQrProduct.sku} size={140} />
              </div>
              <span className="text-[10px] text-slate-500 font-medium">QR Code (Scannable ID)</span>

              <div className="w-full pt-2">
                <svg ref={barcodeRef} className="mx-auto max-w-full" />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingQrProduct(null)}
                className="w-full bg-slate-900 text-white text-xs font-semibold py-2.5 rounded-xl hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Product</h3>
                <p className="text-xs text-slate-500">Are you sure you want to delete this product?</p>
              </div>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
              <p className="text-slate-500">Product Name:</p>
              <p className="font-semibold text-slate-900 text-sm mt-0.5">{productToDelete.name}</p>
              <p className="text-slate-400 font-mono text-[11px] mt-1">SKU: {productToDelete.sku}</p>
            </div>
            <p className="text-xs text-rose-600 font-medium">
              ⚠️ This item will be permanently removed from inventory.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteProduct}
                disabled={isDeleting}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Yes, Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
