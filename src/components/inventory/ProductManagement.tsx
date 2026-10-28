import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { normalizeProduct } from '../../lib/productHelper';
import { compressImageFile } from '../../lib/imageCompressor';
import { Product, Category, Brand, UserProfile, ProductMedia, ProductVideoMedia, ProductVariant } from '../../types';
import { VariantManager } from './VariantManager';
import { SocialShareModal } from './SocialShareModal';
import { AIMarketingModal } from '../marketing/AIMarketingModal';
import { BulkProductImportModal } from './BulkProductImportModal';
import { CreateOrderModal } from '../orders/CreateOrderModal';
import { useAccess } from '../../hooks/useAccess';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { 
  Package, Plus, Edit2, Trash2, Search, AlertTriangle, 
  CheckCircle2, XCircle, QrCode as QrIcon, Loader2, 
  Upload, Play, Download, Eye, ChevronLeft, ChevronRight, Palette, RotateCw, Sparkles, Share2, Bot,
  FileSpreadsheet, Filter, LayoutList, LayoutGrid, ArrowUpDown, Copy, Check, MessageCircle,
  ExternalLink, Lock, CheckCheck, SlidersHorizontal, X, ShoppingBag, Calculator, ChevronDown,
  Layers, Info, ShieldCheck, CheckSquare, Sparkle
} from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';
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

  // Access & Permissions
  const { canAccessFullApp, canViewPrices, isPending } = useAccess(user);

  // Filters, Search, Views & Sorting
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'profit_desc' | 'name_asc'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'low_stock' | 'pending_approvals'>('all');
  
  // Advanced Filter Bottom Sheet
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [filterPriceMax, setFilterPriceMax] = useState<number>(0);
  const [filterWarranty, setFilterWarranty] = useState<string>('all');
  const [filterHasVideo, setFilterHasVideo] = useState<boolean>(false);
  const [groupByCategory, setGroupByCategory] = useState<boolean>(false);

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingQrProduct, setViewingQrProduct] = useState<Product | null>(null);
  const [viewingProductDetails, setViewingProductDetails] = useState<Product | null>(null);
  const [shareModalProduct, setShareModalProduct] = useState<Product | null>(null);
  const [shareModalCaption, setShareModalCaption] = useState<string | undefined>(undefined);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [aiModalProduct, setAiModalProduct] = useState<Product | null>(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  // Profit Calculator & Marketing Action States for Detail Sheet
  const [calcSellingPrice, setCalcSellingPrice] = useState<number | ''>('');
  const [calcQuantity, setCalcQuantity] = useState<number>(1);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [downloadingAll, setDownloadingAll] = useState<boolean>(false);

  // Ordering from Catalog Bottom Sheet
  const [isOrderModalOpen, setIsOrderModalOpen] = useState<boolean>(false);
  const [orderModalProduct, setOrderModalProduct] = useState<Product | null>(null);
  const [orderModalVariant, setOrderModalVariant] = useState<ProductVariant | null>(null);

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

  const { isRefreshing, formattedLastUpdated, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    const totalCount = await fetchData();
    showToast(`✓ Products refreshed! ${totalCount} items found`, 'success');
  };

  usePageRefresh('products', handleRefresh);

  useEffect(() => {
    fetchData();

    // Real-time products listener (syncs immediately when Sky Inventory pushes new products or edits price/stock)
    const unsubProducts = onSnapshot(collection(db, 'products'), (prodSnap) => {
      const prodList: Product[] = prodSnap.docs.map(docSnap => normalizeProduct(docSnap.id, docSnap.data()));
      const validList = prodList.filter(p => p.status !== 'deleted');
      setProducts(validList);
      setLoading(false);
    }, (err) => {
      console.error('Realtime products listener error:', err);
      setLoading(false);
    });

    const handleFilterChange = (e: any) => {
      if (e.detail?.filter) {
        setStatusFilter(e.detail.filter);
      }
    };
    window.addEventListener('sky_product_filter', handleFilterChange);

    return () => {
      unsubProducts();
      window.removeEventListener('sky_product_filter', handleFilterChange);
    };
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
      const prodList: Product[] = prodSnap.docs.map(doc => normalizeProduct(doc.id, doc.data()));

      setCategories(catList);
      setBrands(brandList);
      const validList = prodList.filter(p => p.status !== 'deleted');
      setProducts(validList);
      return validList.length;
    } catch (err) {
      console.error('Error fetching inventory:', err);
      return 0;
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
          try {
            fileUrl = await compressImageFile(file, 800, 800, 0.75);
          } catch (compErr) {
            console.warn('Image compression failed, fallback:', compErr);
            fileUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string || '');
              reader.onerror = () => resolve('');
              reader.readAsDataURL(file);
            });
          }
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
        costPrice: isAdmin ? parseFloat(costPrice) || 0 : (editingProduct ? editingProduct.costPrice : 0),
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

  const handleApproveProduct = async (p: Product) => {
    try {
      await updateDoc(doc(db, 'products', p.id), {
        status: 'active',
        approvalStatus: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: user.fullName || 'Admin',
        updatedAt: serverTimestamp(),
      });
      fetchData();
    } catch (err: any) {
      console.error('Error approving product:', err);
      alert(`Failed to approve: ${err.message}`);
    }
  };

  const handleRejectProduct = async (p: Product) => {
    try {
      const reason = window.prompt("Reason for rejection:");
      if (reason === null) return;
      await updateDoc(doc(db, 'products', p.id), {
        status: 'inactive',
        approvalStatus: 'rejected',
        rejectReason: reason,
        updatedAt: serverTimestamp(),
      });
      fetchData();
    } catch (err: any) {
      console.error('Error rejecting product:', err);
      alert(`Failed to reject: ${err.message}`);
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

  // Initialize calculator values whenever viewing details changes
  useEffect(() => {
    if (viewingProductDetails) {
      const activeVariant = viewingProductDetails.hasVariants && viewingProductDetails.variants ? viewingProductDetails.variants[selectedVariantIndex] : null;
      const initialRetail = viewingProductDetails.retailPrice + (activeVariant ? (activeVariant.priceAdjustment || 0) : 0);
      setCalcSellingPrice(initialRetail);
      setCalcQuantity(1);
      setCopyFeedback(false);
    }
  }, [viewingProductDetails, selectedVariantIndex]);

  // Catalog Summary KPI metrics
  const summaryCounts = useMemo(() => {
    const activeProds = products.filter(p => p.approvalStatus !== 'pending');
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    activeProds.forEach(p => {
      const threshold = p.lowStockThreshold || 5;
      if ((p.stock || 0) <= 0) outOfStock++;
      else if ((p.stock || 0) <= threshold) lowStock++;
      else inStock++;
    });
    return {
      total: activeProds.length,
      inStock,
      lowStock,
      outOfStock
    };
  }, [products]);

  // Max price for range filter
  const maxResellerPriceInCatalog = useMemo(() => {
    let max = 0;
    products.forEach(p => {
      if ((p.resellerPrice || 0) > max) max = p.resellerPrice;
    });
    return max > 0 ? Math.ceil(max) : 10000;
  }, [products]);

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch = !q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.categoryName || '').toLowerCase().includes(q) ||
          (p.brandName || '').toLowerCase().includes(q);

        const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
        const matchesBrand = selectedBrand === 'all' || p.brandId === selectedBrand;

        let matchesStatus = true;
        if (statusFilter === 'active') matchesStatus = p.status === 'active' && p.approvalStatus !== 'pending';
        else if (statusFilter === 'inactive') matchesStatus = p.status === 'inactive' && p.approvalStatus !== 'pending';
        else if (statusFilter === 'low_stock') matchesStatus = (p.stock || 0) <= (p.lowStockThreshold || 5) && p.approvalStatus !== 'pending';
        else if (statusFilter === 'pending_approvals') matchesStatus = p.approvalStatus === 'pending';
        else if (statusFilter === 'all') matchesStatus = p.approvalStatus !== 'pending';

        // Filter bottom sheet criteria
        let matchesSheetStock = true;
        if (filterStockStatus === 'in_stock') matchesSheetStock = (p.stock || 0) > (p.lowStockThreshold || 5);
        else if (filterStockStatus === 'low_stock') matchesSheetStock = (p.stock || 0) > 0 && (p.stock || 0) <= (p.lowStockThreshold || 5);
        else if (filterStockStatus === 'out_of_stock') matchesSheetStock = (p.stock || 0) <= 0;

        const matchesPrice = filterPriceMax === 0 || (p.resellerPrice || 0) <= filterPriceMax;
        const matchesWarranty = filterWarranty === 'all' || (p.warranty || '').toLowerCase().includes(filterWarranty.toLowerCase());
        const matchesVideo = !filterHasVideo || (p.videos && p.videos.length > 0);

        return matchesSearch && matchesCat && matchesBrand && matchesStatus && matchesSheetStock && matchesPrice && matchesWarranty && matchesVideo;
      })
      .sort((a, b) => {
        if (sortBy === 'price_asc') return (a.resellerPrice || 0) - (b.resellerPrice || 0);
        if (sortBy === 'price_desc') return (b.resellerPrice || 0) - (a.resellerPrice || 0);
        if (sortBy === 'profit_desc') {
          const profitA = (a.retailPrice || 0) - (a.resellerPrice || 0);
          const profitB = (b.retailPrice || 0) - (b.resellerPrice || 0);
          return profitB - profitA;
        }
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        // Default newest
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
  }, [products, searchQuery, selectedCategory, selectedBrand, statusFilter, filterStockStatus, filterPriceMax, filterWarranty, filterHasVideo, sortBy]);

  // Grouping by category
  const groupedProductsList = useMemo(() => {
    if (!groupByCategory) return null;
    const map = new Map<string, Product[]>();
    filteredProducts.forEach(p => {
      const cat = p.categoryName || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    });
    return Array.from(map.entries());
  }, [groupByCategory, filteredProducts]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'all') count++;
    if (selectedBrand !== 'all') count++;
    if (filterStockStatus !== 'all') count++;
    if (filterPriceMax > 0) count++;
    if (filterWarranty !== 'all') count++;
    if (filterHasVideo) count++;
    return count;
  }, [selectedCategory, selectedBrand, filterStockStatus, filterPriceMax, filterWarranty, filterHasVideo]);

  const clearAllFilters = () => {
    setSelectedCategory('all');
    setSelectedBrand('all');
    setFilterStockStatus('all');
    setFilterPriceMax(0);
    setFilterWarranty('all');
    setFilterHasVideo(false);
    setSearchQuery('');
  };

  const getCoverImage = (p: Product) => {
    if (!p.images || p.images.length === 0) return null;
    const cover = p.images.find(img => img.isCover);
    if (cover) return cover.url;
    return typeof p.images[0] === 'string' ? p.images[0] : p.images[0].url;
  };

  const getStockChip = (p: Product) => {
    const stock = p.stock || 0;
    const threshold = p.lowStockThreshold || 5;
    if (stock <= 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          <span>Out of Stock</span>
        </span>
      );
    }
    if (stock <= threshold) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>Low Stock</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>In Stock</span>
      </span>
    );
  };

  // Media download helper
  const handleDownloadFile = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  // Download all images helper
  const handleDownloadAllImages = async (mediaList: ProductMedia[], sku: string) => {
    if (!mediaList || mediaList.length === 0) return;
    setDownloadingAll(true);
    try {
      for (let i = 0; i < mediaList.length; i++) {
        await handleDownloadFile(mediaList[i].url, `${sku}_image_${i + 1}.jpg`);
        await new Promise(r => setTimeout(r, 200));
      }
      showToast('All images downloaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to download some images', 'error');
    } finally {
      setDownloadingAll(false);
    }
  };

  // Copy ready-to-post marketing caption
  const copyProductCaption = (prod: Product, variant: ProductVariant | null, retail: number) => {
    const text = `📱 *${prod.name}* ${variant ? `(${variant.colorName})` : ''}
🏷️ Brand: ${prod.brandName || 'Brand'}
📁 Category: ${prod.categoryName}
📦 SKU: ${variant ? variant.sku : prod.sku}
💰 Price: ৳${retail.toLocaleString()}
🛡️ Warranty: ${prod.warranty || 'Standard Warranty'}

${prod.description ? `📝 Details:\n${prod.description}\n` : ''}
⚡ 100% Original product. Fast delivery nationwide!
👉 Inbox us or call to place your order.`;

    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    triggerHaptic('success');
    setTimeout(() => setCopyFeedback(false), 2500);
  };

  const shareOnWhatsApp = (prod: Product, variant: ProductVariant | null, retail: number) => {
    const text = `📱 *${prod.name}* ${variant ? `(${variant.colorName})` : ''}
💰 Price: ৳${retail.toLocaleString()}
📦 SKU: ${variant ? variant.sku : prod.sku}
🛡️ Warranty: ${prod.warranty || 'Standard Warranty'}
${prod.description ? `\n${prod.description.slice(0, 150)}...` : ''}`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const renderListRow = (p: Product) => {
    const coverImg = getCoverImage(p);
    const profit = (p.retailPrice || 0) - (p.resellerPrice || 0);

    return (
      <div
        key={p.id}
        onClick={() => {
          setViewingProductDetails(p);
          setActiveMediaIndex(0);
          setSelectedVariantIndex(0);
        }}
        className="p-3 sm:p-3.5 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3 cursor-pointer group select-none min-h-[76px]"
      >
        {/* Left Side: 72px Square Thumbnail */}
        <div className="w-[72px] h-[72px] rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 shrink-0 relative">
          {coverImg ? (
            <img
              src={coverImg}
              alt={p.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <Package className="w-6 h-6 opacity-40" />
            </div>
          )}
          {p.videos && p.videos.length > 0 && (
            <span className="absolute bottom-1 right-1 bg-black/75 text-white p-0.5 rounded text-[8px] flex items-center">
              <Play className="w-2.5 h-2.5 fill-current" />
            </span>
          )}
        </div>

        {/* Center: Details (Brand, Category, Name, SKU) */}
        <div className="min-w-0 flex-1 pr-1 space-y-0.5">
          <p className="text-[11px] font-medium text-slate-500 truncate leading-tight">
            {p.brandName || 'Brand'} • {p.categoryName}
          </p>
          <h4 className="font-bold text-slate-900 text-[13px] sm:text-[14px] leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors">
            {p.name}
          </h4>
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              SKU: {p.sku}
            </span>
            {p.hasVariants && (
              <span className="text-[10px] text-indigo-600 bg-indigo-50 font-bold px-1.5 py-0.5 rounded border border-indigo-100/60">
                Variants
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Stock chip, Reseller price, Retail struck-through, Profit tag */}
        <div className="shrink-0 text-right space-y-1">
          <div className="flex items-center justify-end">
            {getStockChip(p)}
          </div>

          {!canViewPrices ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
              <Lock className="w-2.5 h-2.5" />
              <span>Price locked</span>
            </span>
          ) : (
            <div className="space-y-0.5">
              <span className="font-extrabold font-mono text-slate-900 text-sm block leading-none">
                ৳{p.resellerPrice?.toFixed(0)}
              </span>
              <span className="font-semibold font-mono text-slate-400 text-[11px] line-through block leading-none">
                ৳{p.retailPrice?.toFixed(0)}
              </span>
              {profit > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-1.5 py-0.2 rounded inline-block">
                  Profit: ৳{profit.toFixed(0)}
                </span>
              )}
            </div>
          )}

          {isAdmin && (
            <p className="font-mono text-[10px] text-slate-500 font-bold">
              {p.stock} pcs
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 pb-12">
      {/* 1. Header: Title, Subtitle, KPI Summary Strip & Admin Actions */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">Product Catalog & Inventory</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isReseller 
                ? 'Product information, stock reference & marketing toolkit with live profit calculations.'
                : 'Inventory master catalog, stock levels, pricing configurations, and asset management.'}
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {isSuperAdmin && (
              <button
                onClick={() => setIsBulkImportOpen(true)}
                className="h-8.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Import Products (.csv / .xlsx)"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Import Products</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={handleOpenAdd}
                className="h-8.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
            )}
          </div>
        </div>

        {/* Small Summary KPI Strip (Total / In Stock / Low Stock / Out of Stock) */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center">
          <div className="bg-slate-50/80 py-1.5 px-2 rounded-xl border border-slate-100">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total</span>
            <span className="text-sm font-extrabold text-slate-900 font-mono">{summaryCounts.total}</span>
          </div>
          <div className="bg-emerald-50/60 py-1.5 px-2 rounded-xl border border-emerald-100/60">
            <span className="text-[10px] uppercase font-bold text-emerald-600 block tracking-wider">In Stock</span>
            <span className="text-sm font-extrabold text-emerald-700 font-mono">{summaryCounts.inStock}</span>
          </div>
          <div className="bg-amber-50/60 py-1.5 px-2 rounded-xl border border-amber-100/60">
            <span className="text-[10px] uppercase font-bold text-amber-600 block tracking-wider">Low Stock</span>
            <span className="text-sm font-extrabold text-amber-700 font-mono">{summaryCounts.lowStock}</span>
          </div>
          <div className="bg-rose-50/60 py-1.5 px-2 rounded-xl border border-rose-100/60">
            <span className="text-[10px] uppercase font-bold text-rose-600 block tracking-wider">Out of Stock</span>
            <span className="text-sm font-extrabold text-rose-700 font-mono">{summaryCounts.outOfStock}</span>
          </div>
        </div>
      </div>

      {/* 2. Sticky Top Bar: Search (40px) + Filters Button + Sort + View Toggle */}
      <div className="sticky top-14 sm:top-16 z-20 bg-white/95 backdrop-blur-md p-2.5 rounded-2xl border border-slate-200/90 shadow-xs space-y-2">
        <div className="flex items-center gap-2">
          {/* Search Bar (40px height) */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search product by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-8 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-slate-50/60"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filters Button (opens Bottom Sheet) */}
          <button
            onClick={() => setIsFilterSheetOpen(true)}
            className={`h-10 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
              activeFiltersCount > 0 
                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' 
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="Filter options"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-white text-blue-600 font-black text-[10px] flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Sort Dropdown */}
          <div className="relative shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-10 pl-2.5 pr-7 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 focus:ring-2 focus:ring-blue-600 appearance-none cursor-pointer"
            >
              <option value="newest">Sort: Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="profit_desc">Highest Profit</option>
              <option value="name_asc">Name: A to Z</option>
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-3.5 pointer-events-none" />
          </div>

          {/* View Toggle (List vs Grid) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => { triggerHaptic('light'); setViewMode('list'); }}
              className={`p-2 rounded-lg transition-all cursor-pointer ${
                viewMode === 'list' 
                  ? 'bg-white text-blue-600 shadow-2xs' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="List View (Compact)"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => { triggerHaptic('light'); setViewMode('grid'); }}
              className={`p-2 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid' 
                  ? 'bg-white text-blue-600 shadow-2xs' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Grid View (Dense)"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Category Chips Row (Horizontal Scroll) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap pt-0.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`h-7.5 px-3 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Products ({products.filter(p => p.approvalStatus !== 'pending').length})
          </button>
          {categories.map((c) => {
            const count = products.filter(p => p.categoryId === c.id && p.approvalStatus !== 'pending').length;
            const isSelected = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(isSelected ? 'all' : c.id)}
                className={`h-7.5 px-3 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{c.name}</span>
                <span className={`text-[10px] font-semibold px-1 rounded ${isSelected ? 'bg-blue-700 text-white' : 'bg-slate-200/80 text-slate-600'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Filter Tags & Results Count Strip */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
            <span className="text-[11px] font-bold text-slate-500 shrink-0">
              {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
            </span>

            {/* Group by category toggle */}
            <button
              onClick={() => setGroupByCategory(!groupByCategory)}
              className={`ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                groupByCategory ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Group by Category</span>
            </button>

            {/* Removable Active Filter Chips */}
            {selectedCategory !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                Cat: {categories.find(c => c.id === selectedCategory)?.name || 'Selected'}
                <button onClick={() => setSelectedCategory('all')} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
            {selectedBrand !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                Brand: {brands.find(b => b.id === selectedBrand)?.name || 'Selected'}
                <button onClick={() => setSelectedBrand('all')} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
            {filterStockStatus !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                Stock: {filterStockStatus.replace('_', ' ')}
                <button onClick={() => setFilterStockStatus('all')} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
            {filterPriceMax > 0 && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                ≤ ৳{filterPriceMax}
                <button onClick={() => setFilterPriceMax(0)} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
            {filterWarranty !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                {filterWarranty}
                <button onClick={() => setFilterWarranty('all')} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
            {filterHasVideo && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                Has Video
                <button onClick={() => setFilterHasVideo(false)} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
          </div>

          {activeFiltersCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 shrink-0 underline cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* 3. Skeleton Loading State (Rows, not spinners) */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center gap-3 animate-pulse">
              <div className="w-[72px] h-[72px] rounded-xl bg-slate-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
                <div className="h-3 bg-slate-100 rounded w-1/4" />
              </div>
              <div className="w-20 space-y-1.5 text-right">
                <div className="h-4 bg-slate-200 rounded ml-auto w-16" />
                <div className="h-3 bg-slate-100 rounded ml-auto w-12" />
                <div className="h-3 bg-slate-100 rounded ml-auto w-14" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">No products found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            We couldn't find any products matching your current filters or search term. Try adjusting your query.
          </p>
          <button
            onClick={clearAllFilters}
            className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Reset All Filters
          </button>
        </div>
      ) : viewMode === 'list' ? (
        /* 4. DEFAULT COMPACT LIST VIEW (Flatter, reference-table look with 72px square thumbnail) */
        <div className="space-y-3">
          {groupByCategory && groupedProductsList ? (
            groupedProductsList.map(([catName, prods]) => (
              <div key={catName} className="space-y-1.5">
                {/* Sticky Section Header for Category */}
                <div className="sticky top-32 z-10 bg-slate-100/90 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-800">
                  <span>{catName}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{prods.length} items</span>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100 overflow-hidden shadow-2xs">
                  {prods.map((p) => renderListRow(p))}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100 overflow-hidden shadow-2xs">
              {filteredProducts.map((p) => renderListRow(p))}
            </div>
          )}
        </div>
      ) : (
        /* 5. GRID VIEW (Dense, information-packed, no big badges, no buttons) */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
          {filteredProducts.map((p) => {
            const coverImg = getCoverImage(p);
            const profit = (p.retailPrice || 0) - (p.resellerPrice || 0);

            return (
              <div
                key={p.id}
                onClick={() => {
                  setViewingProductDetails(p);
                  setActiveMediaIndex(0);
                  setSelectedVariantIndex(0);
                }}
                className="bg-white p-2.5 rounded-xl border border-slate-200/80 hover:border-blue-400/80 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between cursor-pointer group select-none"
              >
                <div>
                  {/* Square Image Container */}
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-slate-100 mb-2 border border-slate-100">
                    {coverImg ? (
                      <img
                        src={coverImg}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Package className="w-8 h-8 opacity-40" />
                      </div>
                    )}
                    {/* Video badge */}
                    {p.videos && p.videos.length > 0 && (
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white p-1 rounded-md text-[9px] font-bold flex items-center gap-0.5">
                        <Play className="w-2.5 h-2.5 fill-current" />
                      </div>
                    )}
                  </div>

                  {/* Brand & Category in 1 line */}
                  <p className="text-[11px] font-medium text-slate-500 truncate mb-0.5">
                    {p.brandName || 'Brand'} • {p.categoryName}
                  </p>

                  {/* Product Name (13-14px, 2 lines max) */}
                  <h4 className="font-bold text-slate-900 text-[13px] leading-tight line-clamp-2 min-h-[32px] group-hover:text-blue-600 transition-colors">
                    {p.name}
                  </h4>

                  {/* SKU */}
                  <p className="font-mono text-[10px] text-slate-400 mt-0.5">SKU: {p.sku}</p>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    {getStockChip(p)}
                    {isAdmin && (
                      <span className="font-mono text-[10px] text-slate-500 font-bold">{p.stock} pcs</span>
                    )}
                  </div>

                  {/* Pricing Box */}
                  {!canViewPrices ? (
                    <div className="bg-amber-50 border border-amber-200/80 rounded-lg p-1.5 flex items-center gap-1.5 text-amber-800 text-[11px] font-bold">
                      <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>Price locked</span>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Reseller</span>
                        <span className="font-extrabold font-mono text-blue-600 text-sm">৳{p.resellerPrice?.toFixed(0)}</span>
                      </div>
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="text-[9px] font-semibold text-slate-400 uppercase">Retail</span>
                        <span className="text-slate-400 line-through font-mono">৳{p.retailPrice?.toFixed(0)}</span>
                      </div>
                      {profit > 0 && (
                        <div className="flex items-center justify-end pt-0.5">
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-1.5 py-0.2 rounded">
                            Profit: ৳{profit.toFixed(0)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Advanced Filters Bottom Sheet Modal */}
      {isFilterSheetOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Sheet Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Catalog Filters</h3>
              </div>
              <button
                onClick={() => setIsFilterSheetOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Filters Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Category Filter */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs bg-white cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Brand Filter */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">Brand</label>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs bg-white cursor-pointer"
                >
                  <option value="all">All Brands</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Stock Status Filter */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">Stock Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'all', label: 'All Products' },
                    { id: 'in_stock', label: 'In Stock' },
                    { id: 'low_stock', label: 'Low Stock' },
                    { id: 'out_of_stock', label: 'Out of Stock' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFilterStockStatus(s.id as any)}
                      className={`h-9 px-3 rounded-xl font-bold border text-xs transition-colors cursor-pointer ${
                        filterStockStatus === s.id
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range Slider (Reseller Price) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">Max Reseller Price</label>
                  <span className="font-mono font-bold text-blue-600">
                    {filterPriceMax === 0 ? 'Any Price' : `Up to ৳${filterPriceMax.toLocaleString()}`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={maxResellerPriceInCatalog}
                  step="50"
                  value={filterPriceMax}
                  onChange={(e) => setFilterPriceMax(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>৳0</span>
                  <span>৳{maxResellerPriceInCatalog.toLocaleString()}</span>
                </div>
              </div>

              {/* Warranty Filter */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">Warranty</label>
                <select
                  value={filterWarranty}
                  onChange={(e) => setFilterWarranty(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs bg-white cursor-pointer"
                >
                  <option value="all">Any Warranty</option>
                  <option value="6 Months">6 Months Warranty</option>
                  <option value="1 Year">1 Year Warranty</option>
                  <option value="Replacement">Replacement Guarantee</option>
                  <option value="Standard">Standard Warranty</option>
                  <option value="No Warranty">No Warranty</option>
                </select>
              </div>

              {/* Has Video Toggle */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 text-xs block">Has Product Video</span>
                  <span className="text-[11px] text-slate-500">Show items with marketing video demonstration</span>
                </div>
                <input
                  type="checkbox"
                  checked={filterHasVideo}
                  onChange={(e) => setFilterHasVideo(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Reset Filters
              </button>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(false)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Apply Filters ({filteredProducts.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Catalog-Only Product Detail Bottom Sheet */}
      {viewingProductDetails && (() => {
        const activeVariant = viewingProductDetails.hasVariants && viewingProductDetails.variants ? viewingProductDetails.variants[selectedVariantIndex] : null;
        const currentResellerPrice = viewingProductDetails.resellerPrice + (activeVariant ? (activeVariant.priceAdjustment || 0) : 0);
        const currentRetailPrice = viewingProductDetails.retailPrice + (activeVariant ? (activeVariant.priceAdjustment || 0) : 0);
        const currentStock = activeVariant ? activeVariant.stock : viewingProductDetails.stock;
        const currentImages = (activeVariant && activeVariant.images && activeVariant.images.length > 0) ? activeVariant.images : viewingProductDetails.images;
        const currentSku = activeVariant ? activeVariant.sku : viewingProductDetails.sku;
        const currentMedia = currentImages && currentImages[activeMediaIndex] ? currentImages[activeMediaIndex] : (currentImages && currentImages[0]);

        // Profit calculations
        const sellingPriceNum = typeof calcSellingPrice === 'number' ? calcSellingPrice : currentRetailPrice;
        const unitProfit = Math.max(-9999, sellingPriceNum - currentResellerPrice);
        const totalProfit = unitProfit * calcQuantity;
        const marginPct = sellingPriceNum > 0 ? ((unitProfit / sellingPriceNum) * 100).toFixed(1) : '0';

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
              {/* Drag Handle on mobile */}
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-2 sm:hidden shrink-0" />

              {/* Sheet Header */}
              <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <span className="font-bold text-blue-600">{viewingProductDetails.categoryName}</span>
                    <span>•</span>
                    <span>{viewingProductDetails.brandName || 'Brand'}</span>
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight truncate mt-0.5">
                    {viewingProductDetails.name}
                  </h3>
                </div>
                <button
                  onClick={() => setViewingProductDetails(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 shrink-0 cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sheet Scrollable Body */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
                {/* Media Gallery (Images + Videos) */}
                <div className="space-y-2">
                  <div className="relative aspect-video sm:aspect-[16/10] max-h-[38vh] w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center">
                    {currentMedia ? (
                      <img
                        src={currentMedia.url}
                        alt={viewingProductDetails.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-slate-500 text-xs flex flex-col items-center gap-2">
                        <Package className="w-10 h-10" />
                        <span>No image available</span>
                      </div>
                    )}

                    {/* Navigation arrows if multiple */}
                    {currentImages && currentImages.length > 1 && (
                      <>
                        <button
                          onClick={() => setActiveMediaIndex(prev => (prev === 0 ? currentImages.length - 1 : prev - 1))}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setActiveMediaIndex(prev => (prev === currentImages.length - 1 ? 0 : prev + 1))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {/* Media counter */}
                    {currentImages && currentImages.length > 0 && (
                      <div className="absolute bottom-2 left-2.5 bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                        {activeMediaIndex + 1} / {currentImages.length}
                      </div>
                    )}

                    {/* Download single image button */}
                    {currentMedia && (
                      <button
                        onClick={() => handleDownloadFile(currentMedia.url, `${currentSku}_img_${activeMediaIndex + 1}.jpg`)}
                        className="absolute bottom-2 right-2.5 bg-white/95 hover:bg-white text-slate-900 text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                        title="Download this image"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600" />
                        <span>Download</span>
                      </button>
                    )}
                  </div>

                  {/* Thumbnails strip & "Download All Images" button */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                      {currentImages?.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveMediaIndex(idx)}
                          className={`w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0 cursor-pointer transition-all ${
                            activeMediaIndex === idx ? 'border-blue-600 ring-2 ring-blue-600/30' : 'border-slate-200 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img src={img.url} alt={`thumb ${idx}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>

                    {currentImages && currentImages.length > 0 && (
                      <button
                        onClick={() => handleDownloadAllImages(currentImages, currentSku)}
                        disabled={downloadingAll}
                        className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                      >
                        {downloadingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <Download className="w-3.5 h-3.5 text-blue-600" />}
                        <span>Download All</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Color Variant Selector if hasVariants */}
                {viewingProductDetails.hasVariants && viewingProductDetails.variants && viewingProductDetails.variants.length > 0 && (
                  <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-blue-600" /> Color Variants:
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
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 text-xs font-bold transition-all cursor-pointer ${
                              isSelected ? 'border-blue-600 bg-white text-blue-900 shadow-2xs' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                              style={{ backgroundColor: v.colorSwatchUrl && v.colorSwatchUrl.startsWith('#') ? v.colorSwatchUrl : '#0f172a' }}
                            />
                            <span>{v.colorName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({v.stock > 0 ? 'In Stock' : 'Out'})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Specifications Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">SKU Code</span>
                    <span className="font-mono font-bold text-slate-800 text-xs">{currentSku}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock Availability</span>
                    <span className="font-bold text-slate-900 text-xs">
                      {currentStock > 0 ? 'In Stock' : 'Out of Stock'}
                      {isAdmin && ` (${currentStock} pcs)`}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Warranty</span>
                    <span className="font-bold text-slate-800 text-xs">{viewingProductDetails.warranty || 'Standard Warranty'}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Category & Brand</span>
                    <span className="font-bold text-slate-800 text-xs truncate block">
                      {viewingProductDetails.categoryName} • {viewingProductDetails.brandName || 'Brand'}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {viewingProductDetails.description && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Description</span>
                    <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-line leading-relaxed">
                      {viewingProductDetails.description}
                    </p>
                  </div>
                )}

                {/* Price Box & Interactive Profit Calculator */}
                {!canViewPrices ? (
                  <div className="p-4 bg-amber-50 border border-amber-200/90 rounded-2xl flex items-start gap-3">
                    <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-amber-900">Wholesale Prices Locked</h4>
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        Your account is pending verification. Once approved by our team, reseller wholesale pricing, suggested retail rates, and the interactive profit calculator will be activated.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-blue-800 tracking-wider">Wholesale Price</span>
                        <p className="text-xl font-black text-blue-700 font-mono">৳{currentResellerPrice.toFixed(0)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Suggested Retail</span>
                        <p className="text-base font-bold text-slate-700 font-mono">৳{currentRetailPrice.toFixed(0)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Standard Profit</span>
                        <p className="text-base font-extrabold text-emerald-700 font-mono">
                          ৳{(currentRetailPrice - currentResellerPrice).toFixed(0)}
                        </p>
                      </div>
                    </div>

                    {/* Interactive Profit Calculator */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Calculator className="w-4 h-4 text-blue-600" />
                        <span>Interactive Reseller Profit Calculator</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 uppercase">Your Resale Price (৳)</label>
                          <input
                            type="number"
                            value={calcSellingPrice}
                            onChange={(e) => setCalcSellingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder={currentRetailPrice.toString()}
                            className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold focus:ring-2 focus:ring-blue-600"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 uppercase">Order Quantity</label>
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => setCalcQuantity(Math.max(1, calcQuantity - 1))}
                              className="w-10 h-10 rounded-l-xl bg-slate-200 hover:bg-slate-300 font-bold text-sm flex items-center justify-center cursor-pointer"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={calcQuantity}
                              onChange={(e) => setCalcQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-full h-10 border-y border-slate-300 text-center text-xs font-bold font-mono bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => setCalcQuantity(calcQuantity + 1)}
                              className="w-10 h-10 rounded-r-xl bg-slate-200 hover:bg-slate-300 font-bold text-sm flex items-center justify-center cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Calculation results strip */}
                      <div className="bg-white p-3 rounded-xl border border-blue-200/80 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <span className="text-[9px] font-bold uppercase text-slate-400 block">Profit / Unit</span>
                          <span className={`text-xs sm:text-sm font-black font-mono ${unitProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            ৳{unitProfit.toFixed(0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold uppercase text-slate-400 block">Total Profit</span>
                          <span className={`text-xs sm:text-sm font-black font-mono ${totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            ৳{totalProfit.toFixed(0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold uppercase text-slate-400 block">Margin %</span>
                          <span className="text-xs sm:text-sm font-black font-mono text-blue-600">
                            {marginPct}%
                          </span>
                        </div>
                      </div>

                      {unitProfit < 0 && (
                        <p className="text-[11px] text-rose-600 font-bold">
                          ⚠️ Selling price is below wholesale cost! You will make a loss on this item.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Marketing & Sharing Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Marketing & Promotion Tools</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => copyProductCaption(viewingProductDetails, activeVariant, currentRetailPrice)}
                      className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {copyFeedback ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                      <span>{copyFeedback ? '✓ Caption Copied!' : 'Copy Product Details'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => shareOnWhatsApp(viewingProductDetails, activeVariant, currentRetailPrice)}
                      className="h-10 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4 text-emerald-600" />
                      <span>Share on WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAiModalProduct(viewingProductDetails);
                        setIsAIModalOpen(true);
                      }}
                      className="h-10 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Bot className="w-4 h-4 text-indigo-600" />
                      <span>AI Marketing Assistant</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShareModalProduct(viewingProductDetails);
                        setIsShareModalOpen(true);
                      }}
                      className="h-10 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Create Branded Social Post</span>
                    </button>
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setViewingQrProduct(viewingProductDetails);
                      }}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
                    >
                      <QrIcon className="w-4 h-4 text-blue-600" />
                      <span>View QR & Barcode</span>
                    </button>

                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const prod = viewingProductDetails;
                            setViewingProductDetails(null);
                            handleOpenEdit(prod);
                          }}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                        >
                          Edit Product
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            const prod = viewingProductDetails;
                            setViewingProductDetails(null);
                            setProductToDelete(prod);
                          }}
                          className="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sheet Sticky Footer: Secondary Order Flow Button */}
              <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
                <div className="text-xs text-slate-500">
                  <span className="font-bold text-slate-800">SKU: {currentSku}</span>
                  <span className="mx-1">•</span>
                  <span>{currentStock > 0 ? 'Available for ordering' : 'Backorder'}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!canAccessFullApp) {
                      showToast('Your reseller account requires approval before placing orders.', 'error');
                      return;
                    }
                    setOrderModalProduct(viewingProductDetails);
                    setOrderModalVariant(activeVariant);
                    setIsOrderModalOpen(true);
                  }}
                  disabled={!canAccessFullApp}
                  className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Order this product</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add / Edit Product Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-hidden">
          <div className="fixed sm:relative inset-0 sm:inset-auto w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl bg-white sm:rounded-3xl border-0 sm:border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200">
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 text-white shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-blue-600/30 shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm sm:text-base">
                    {editingProduct ? 'Edit Product Details' : 'Add New Product'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Specify inventory parameters and media assets</p>
                </div>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex-1 flex flex-col overflow-hidden">
              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
                {formError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-xl font-medium">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      required
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs bg-white"
                    >
                      <option value="">Select Category</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Brand <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={brandId}
                      onChange={(e) => setBrandId(e.target.value)}
                      required
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs bg-white"
                    >
                      <option value="">Select Brand</option>
                      {brands.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Product Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. JBL Go 3 Speaker"
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      SKU Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Barcode (Auto-Generated)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={editingProduct ? (editingProduct.barcodeValue || 'Auto-generated on save') : 'Auto-generated on save'}
                      placeholder="Auto-generated barcode"
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-base sm:text-xs font-mono cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      QR Code (Auto-Generated)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={editingProduct ? (editingProduct.qrValue || 'Auto-generated on save') : 'Auto-generated on save'}
                      placeholder="Auto-generated QR code"
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-base sm:text-xs font-mono cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {isAdmin && (
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider text-rose-600">
                        Cost Price (BDT) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        required
                        value={costPrice}
                        onChange={(e) => setCostPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:border-transparent text-base sm:text-xs font-mono font-bold"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Reseller Price (BDT) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      required
                      value={resellerPrice}
                      onChange={(e) => setResellerPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Retail Price (BDT) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      required
                      value={retailPrice}
                      onChange={(e) => setRetailPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Stock Quantity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      required
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Low Stock Threshold
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      required
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(e.target.value)}
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Warranty
                    </label>
                    <input
                      type="text"
                      value={warranty}
                      onChange={(e) => setWarranty(e.target.value)}
                      placeholder="e.g. 6 Months"
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Product Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter product details, specifications..."
                    className="w-full p-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs min-h-[80px]"
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
                                  className="bg-white text-slate-900 px-2 py-1 rounded-lg text-[10px] font-bold shadow-sm hover:bg-slate-100 min-h-[32px]"
                                  title="Set as Cover"
                                >
                                  Cover
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveMedia('image', idx)}
                                className="bg-rose-600 text-white p-1.5 rounded-lg text-xs font-bold hover:bg-rose-700 shadow-sm min-h-[32px] min-w-[32px]"
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

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-base sm:text-xs bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="sticky bottom-0 z-20 bg-slate-50 px-4 sm:px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-3 sm:py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm sm:text-xs font-bold transition-colors min-h-[44px] sm:min-h-[38px] flex items-center justify-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-3 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-xs font-extrabold transition-all shadow-md shadow-blue-600/30 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-98 min-h-[44px] sm:min-h-[38px] cursor-pointer"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
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

      {/* Social Share & Marketing Post Maker Modal */}
      <SocialShareModal
        product={shareModalProduct}
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          setShareModalProduct(null);
          setShareModalCaption(undefined);
        }}
        user={user}
        initialCaption={shareModalCaption}
      />

      {/* Gemini AI Marketing Assistant Modal */}
      <AIMarketingModal
        product={aiModalProduct}
        initialProduct={aiModalProduct}
        isOpen={isAIModalOpen}
        onClose={() => {
          setIsAIModalOpen(false);
          setAiModalProduct(null);
        }}
        user={user}
        onOpenSocialShare={(prod, caption) => {
          setIsAIModalOpen(false);
          setShareModalProduct(prod);
          setShareModalCaption(caption);
          setIsShareModalOpen(true);
        }}
      />
      {/* Bulk CSV / Excel Import Modal */}
      <BulkProductImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={(summary) => {
          handleRefresh();
        }}
        user={user}
        existingProducts={products}
        categories={categories}
        brands={brands}
        onRefreshData={handleRefresh}
        onNavigateToApprovals={() => setStatusFilter('pending_approvals')}
      />

      {/* Catalog Order Delegation Modal */}
      {isOrderModalOpen && (
        <CreateOrderModal
          isOpen={isOrderModalOpen}
          onClose={() => {
            setIsOrderModalOpen(false);
            setOrderModalProduct(null);
            setOrderModalVariant(null);
          }}
          user={user}
          onOrderCreated={() => {
            setIsOrderModalOpen(false);
            setViewingProductDetails(null);
            setOrderModalProduct(null);
            setOrderModalVariant(null);
            showToast('Order created successfully!', 'success');
          }}
          initialProduct={orderModalProduct}
          initialVariant={orderModalVariant}
        />
      )}
    </div>
  );
};
