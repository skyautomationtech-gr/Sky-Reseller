import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, getDoc 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Product, ProductVariant, UserProfile, Wallet, Category, CompanySettings } from '../../types';
import { ProductDetailModal } from '../inventory/ProductDetailModal';
import { CreateOrderModal } from '../orders/CreateOrderModal';
import { SkyLogo } from '../common/SkyLogo';
import { 
  Store, Search, Wallet as WalletIcon, ShoppingBag, Clock, ArrowRight, 
  Sparkles, Layers, ChevronRight, AlertCircle, Headphones, Watch, Zap, 
  Cable, Speaker, BatteryCharging, Smartphone, Package, Check, ChevronLeft
} from 'lucide-react';

interface ResellerHomePageProps {
  user: UserProfile;
  onNavigateTab: (tab: string) => void;
}

const CATEGORY_ICONS: { [key: string]: React.ElementType } = {
  'earphones': Headphones,
  'headphone': Headphones,
  'smart watch': Watch,
  'watch': Watch,
  'charger': Zap,
  'cable': Cable,
  'speaker': Speaker,
  'power bank': BatteryCharging,
  'mobile accessories': Smartphone,
  'accessories': Smartphone,
};

export const ResellerHomePage: React.FC<ResellerHomePageProps> = ({ user, onNavigateTab }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [bannerImages, setBannerImages] = useState<string[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  // Stats
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [todayOrdersCount, setTodayOrdersCount] = useState<number>(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number>(0);

  // Modals
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [orderProduct, setOrderProduct] = useState<Product | null>(null);
  const [orderVariant, setOrderVariant] = useState<ProductVariant | null>(null);
  const [isOrderOpen, setIsOrderOpen] = useState(false);

  // Variant selector modal if product has multiple variants
  const [variantModalProduct, setVariantModalProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, [user.uid]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Products
      const pQuery = query(collection(db, 'products'), where('status', '==', 'active'));
      const pSnap = await getDocs(pQuery);
      const pList: Product[] = [];
      pSnap.forEach((docSnap) => {
        pList.push(Object.assign({ id: docSnap.id }, docSnap.data()) as unknown as Product);
      });
      setProducts(pList);

      // 2. Fetch Categories
      const cQuery = query(collection(db, 'categories'), where('status', '==', 'active'));
      const cSnap = await getDocs(cQuery);
      const cList: Category[] = [];
      cSnap.forEach((docSnap) => {
        cList.push(Object.assign({ id: docSnap.id }, docSnap.data()) as unknown as Category);
      });
      setCategories(cList);

      // 3. Fetch Company Banner Settings
      const sRef = doc(db, 'settings', 'general');
      const sSnap = await getDoc(sRef);
      if (sSnap.exists()) {
        const sData = sSnap.data() as CompanySettings;
        if (sData.bannerImages && sData.bannerImages.length > 0) {
          setBannerImages(sData.bannerImages);
        }
      }

      // 4. Fetch Quick Stats (Wallet & Orders)
      const wSnap = await getDoc(doc(db, 'wallets', user.uid));
      if (wSnap.exists()) {
        setWalletBalance((wSnap.data() as Wallet).balance || 0);
      }

      const oQuery = query(collection(db, 'orders'), where('resellerId', '==', user.uid));
      const oSnap = await getDocs(oQuery);
      
      let todayCount = 0;
      let pendingCount = 0;
      const todayStr = new Date().toDateString();

      oSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === 'pending') pendingCount++;

        if (data.createdAt) {
          const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          if (date.toDateString() === todayStr) {
            todayCount++;
          }
        }
      });

      setTodayOrdersCount(todayCount);
      setPendingOrdersCount(pendingCount);

    } catch (err) {
      console.error('Error fetching reseller home data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to handle clicking "Order Now" on a product card
  const handleOrderClick = (product: Product) => {
    if ((product.stock || 0) <= 0) return;

    if (product.hasVariants && product.variants && product.variants.length > 0) {
      const activeVariants = product.variants.filter((v) => v.status === 'active');
      if (activeVariants.length > 1) {
        setVariantModalProduct(product);
        return;
      } else if (activeVariants.length === 1) {
        setOrderProduct(product);
        setOrderVariant(activeVariants[0]);
        setIsOrderOpen(true);
        return;
      }
    }

    setOrderProduct(product);
    setOrderVariant(null);
    setIsOrderOpen(true);
  };

  // Build full list of categories combining defaults and custom DB categories
  const defaultCategoryNames = [
    'Earphones', 'Smart Watch', 'Charger', 'Cable', 'Speaker', 
    'Power Bank', 'Mobile Accessories', 'Others'
  ];

  const dbCategoryNames = categories.map((c) => c.name);
  const allCategoryNames = Array.from(new Set([...defaultCategoryNames, ...dbCategoryNames]));

  const getCategoryIcon = (catName: string) => {
    const key = catName.toLowerCase();
    for (const [k, icon] of Object.entries(CATEGORY_ICONS)) {
      if (key.includes(k)) return icon;
    }
    return Package;
  };

  // Filter products by search term
  const filteredProducts = products.filter((p) => {
    const matchSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.categoryName || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch;
  });

  // Group filtered products by category for "All" view
  const categoryGroups = allCategoryNames.map((catName) => {
    const items = filteredProducts.filter(
      (p) => (p.categoryName || 'Others').toLowerCase() === catName.toLowerCase()
    );
    return { name: catName, items };
  }).filter((group) => group.items.length > 0);

  // Handle case where product category doesn't match standard names exactly
  const knownGroupedIds = new Set(categoryGroups.flatMap(g => g.items.map(i => i.id)));
  const unclassifiedItems = filteredProducts.filter(p => !knownGroupedIds.has(p.id));
  if (unclassifiedItems.length > 0) {
    categoryGroups.push({ name: 'Others', items: unclassifiedItems });
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. TOP BANNER / HERO SECTION */}
      <div className="relative rounded-2xl overflow-hidden shadow-xl bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white p-6 sm:p-8">
        {bannerImages.length > 0 ? (
          <div className="relative aspect-[21/9] sm:aspect-[24/8] max-h-64 rounded-xl overflow-hidden mb-4">
            <img 
              src={bannerImages[currentBannerIndex]} 
              alt="Promo Banner" 
              className="w-full h-full object-cover rounded-xl"
            />
            {bannerImages.length > 1 && (
              <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
                {bannerImages.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setCurrentBannerIndex(idx)}
                    className={`h-2 rounded-full transition-all ${
                      currentBannerIndex === idx ? 'w-6 bg-white' : 'w-2 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-2">
            <div className="max-w-xl space-y-3">
              <SkyLogo size="lg" showText={true} />
              <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed pt-1">
                Browse official gadget inventory at wholesale prices. Order directly for your customers and enjoy automated wallet payout tracking.
              </p>
              <div className="pt-1 text-[11px] text-blue-200/70 font-mono">
                💡 Admin can upload custom banner images under <span className="underline cursor-pointer" onClick={() => onNavigateTab('settings')}>Settings</span>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 p-4 rounded-xl shrink-0 space-y-2 max-w-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <Store className="w-4 h-4" />
                <span>{user.shopName || 'Reseller Shop'}</span>
              </div>
              <p className="text-[11px] text-slate-200">
                Approved Reseller Partner ID: <span className="font-mono text-white font-bold">{user.uid.slice(0, 8)}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. QUICK STATS STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Wallet Balance Card */}
        <div 
          onClick={() => onNavigateTab('wallet')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Wallet Balance</span>
            <span className="text-xl font-extrabold text-slate-900 block">৳{walletBalance.toLocaleString()}</span>
            <span className="text-[10px] font-semibold text-emerald-600 group-hover:underline">View Wallet & Payouts →</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <WalletIcon className="w-5 h-5" />
          </div>
        </div>

        {/* Today's Orders */}
        <div 
          onClick={() => onNavigateTab('orders')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-500 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today's Orders</span>
            <span className="text-xl font-extrabold text-slate-900 block">{todayOrdersCount} Orders</span>
            <span className="text-[10px] font-semibold text-blue-600 group-hover:underline">Manage Orders →</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        {/* Pending Orders */}
        <div 
          onClick={() => onNavigateTab('orders')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-500 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Processing</span>
            <span className="text-xl font-extrabold text-slate-900 block">{pendingOrdersCount} Pending</span>
            <span className="text-[10px] font-semibold text-amber-600 group-hover:underline">Check Status →</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. CATEGORY ROW (horizontal scrollable) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Categories</h2>
          {selectedCategory !== 'All' && (
            <button 
              onClick={() => setSelectedCategory('All')}
              className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Show All Categories
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
          {/* All Button */}
          <button
            onClick={() => setSelectedCategory('All')}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl min-w-[72px] shrink-0 transition-all ${
              selectedCategory === 'All'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-600'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              selectedCategory === 'All' ? 'bg-white/20' : 'bg-slate-100 text-slate-600'
            }`}>
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold whitespace-nowrap">All</span>
          </button>

          {allCategoryNames.map((catName) => {
            const Icon = getCategoryIcon(catName);
            const isSelected = selectedCategory.toLowerCase() === catName.toLowerCase();
            return (
              <button
                key={catName}
                onClick={() => setSelectedCategory(catName)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl min-w-[80px] shrink-0 transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-600'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isSelected ? 'bg-white/20' : 'bg-slate-100 text-blue-600'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold whitespace-nowrap truncate max-w-[80px]">{catName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. STICKY SEARCH BAR */}
      <div className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur-md pt-2 pb-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search products by name, SKU, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 text-xs bg-white border border-slate-300 rounded-2xl shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 hover:text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* LOADING STATE (Skeleton Cards) */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 animate-pulse">
                <div className="w-full aspect-square bg-slate-100 rounded-xl" />
                <div className="h-4 bg-slate-100 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
                <div className="h-8 bg-slate-100 rounded-xl w-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. PRODUCT SECTIONS (Daraz-style) */}
      {!loading && (
        <>
          {/* MODE A: "All" selected -> Stacked vertical sections with horizontal scroll row */}
          {selectedCategory === 'All' ? (
            categoryGroups.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                <Package className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-base font-bold text-slate-800">No Products Available</h3>
                <p className="text-xs text-slate-500">
                  {searchTerm ? `No active products found matching "${searchTerm}".` : 'Catalog is currently empty.'}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {categoryGroups.map((group) => (
                  <div key={group.name} className="space-y-3">
                    {/* Section Header */}
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-5 bg-blue-600 rounded-full" />
                        <h2 className="text-base font-bold text-slate-900">{group.name}</h2>
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                          {group.items.length}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedCategory(group.name)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 group"
                      >
                        <span>See All</span>
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>

                    {/* Horizontal Scroll Row */}
                    <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-thin scrollbar-thumb-slate-300">
                      {group.items.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          onDetailClick={() => {
                            setDetailProduct(product);
                            setIsDetailOpen(true);
                          }}
                          onOrderClick={() => handleOrderClick(product)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* MODE B: Specific category selected -> Grid view */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-6 bg-blue-600 rounded-full" />
                  <h2 className="text-lg font-bold text-slate-900">{selectedCategory} Catalog</h2>
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                    {filteredProducts.filter(p => (p.categoryName || 'Others').toLowerCase() === selectedCategory.toLowerCase()).length} Items
                  </span>
                </div>
                <button
                  onClick={() => setSelectedCategory('All')}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs transition-all flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to All
                </button>
              </div>

              {filteredProducts.filter(p => (p.categoryName || 'Others').toLowerCase() === selectedCategory.toLowerCase()).length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                  <Package className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-base font-bold text-slate-800">No Products in {selectedCategory}</h3>
                  <p className="text-xs text-slate-500">There are currently no products listed under this category.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredProducts
                    .filter(p => (p.categoryName || 'Others').toLowerCase() === selectedCategory.toLowerCase())
                    .map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        isGridMode
                        onDetailClick={() => {
                          setDetailProduct(product);
                          setIsDetailOpen(true);
                        }}
                        onOrderClick={() => handleOrderClick(product)}
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* PRODUCT DETAIL MODAL */}
      <ProductDetailModal
        product={detailProduct}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailProduct(null);
        }}
      />

      {/* CREATE ORDER MODAL PRE-FILLED */}
      <CreateOrderModal
        isOpen={isOrderOpen}
        onClose={() => {
          setIsOrderOpen(false);
          setOrderProduct(null);
          setOrderVariant(null);
        }}
        user={user}
        initialProduct={orderProduct}
        initialVariant={orderVariant}
        onOrderCreated={() => {
          setIsOrderOpen(false);
          setOrderProduct(null);
          setOrderVariant(null);
          onNavigateTab('orders');
        }}
      />

      {/* COLOR VARIANT SELECTION POPOVER MODAL */}
      {variantModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Select Color Variant</h3>
              <button 
                onClick={() => setVariantModalProduct(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              <span className="font-bold text-slate-900">{variantModalProduct.name}</span> has color options available. Choose one to proceed:
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {variantModalProduct.variants
                ?.filter(v => v.status === 'active')
                .map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      const prod = variantModalProduct;
                      setVariantModalProduct(null);
                      setOrderProduct(prod);
                      setOrderVariant(v);
                      setIsOrderOpen(true);
                    }}
                    disabled={v.stock <= 0}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-xs text-left disabled:opacity-40"
                  >
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-4 h-4 rounded-full border border-slate-300 shrink-0" 
                        style={{ backgroundColor: v.colorName.toLowerCase() }} 
                      />
                      <span className="font-bold text-slate-900">{v.colorName}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {v.stock > 0 ? `${v.stock} in stock` : 'Out of stock'}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 6. SINGLE PRODUCT CARD COMPONENT
interface ProductCardProps {
  product: Product;
  onDetailClick: () => void;
  onOrderClick: () => void;
  isGridMode?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onDetailClick,
  onOrderClick,
  isGridMode = false
}) => {
  const coverImage = product.images?.[0]?.url;
  const isOutOfStock = (product.stock || 0) <= 0;
  const isLowStock = !isOutOfStock && (product.stock || 0) <= (product.lowStockThreshold || 5);

  const activeVariants = (product.hasVariants && product.variants)
    ? product.variants.filter(v => v.status === 'active')
    : [];

  const resellerProfit = product.retailPrice - product.resellerPrice;

  return (
    <div 
      className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group ${
        isGridMode ? 'w-full' : 'w-56 sm:w-64 shrink-0'
      }`}
    >
      <div>
        {/* Card Image Area */}
        <div 
          onClick={onDetailClick}
          className="relative aspect-square bg-slate-100 overflow-hidden cursor-pointer"
        >
          {coverImage ? (
            <img 
              src={coverImage} 
              alt={product.name} 
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                isOutOfStock ? 'opacity-40 filter grayscale' : ''
              }`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
              <Package className="w-8 h-8 mb-1 opacity-50" />
              <span className="text-[10px] font-semibold">No Image</span>
            </div>
          )}

          {/* Badges Overlays */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start">
            {isOutOfStock ? (
              <span className="bg-rose-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-xs uppercase">
                Out of Stock
              </span>
            ) : isLowStock ? (
              <span className="bg-amber-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-xs">
                Low Stock ({product.stock})
              </span>
            ) : null}
          </div>

          <span className="absolute bottom-2.5 right-2.5 bg-slate-900/80 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5 rounded-md">
            SKU: {product.sku}
          </span>
        </div>

        {/* Card Body Info */}
        <div className="p-3.5 space-y-2">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 block">
              {product.categoryName || 'Gadgets'}
            </span>
            <h3 
              onClick={onDetailClick}
              className="text-xs font-extrabold text-slate-900 leading-snug line-clamp-2 hover:text-blue-600 cursor-pointer mt-0.5"
            >
              {product.name}
            </h3>
          </div>

          {/* Variants Color Swatches Preview */}
          {activeVariants.length > 0 && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[9px] font-medium text-slate-400">Colors:</span>
              <div className="flex items-center gap-1">
                {activeVariants.slice(0, 4).map((v) => (
                  <span
                    key={v.id}
                    title={v.colorName}
                    className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                    style={{ backgroundColor: v.colorName.toLowerCase() }}
                  />
                ))}
                {activeVariants.length > 4 && (
                  <span className="text-[9px] font-bold text-slate-500">+{activeVariants.length - 4}</span>
                )}
              </div>
            </div>
          )}

          {/* Pricing Row */}
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-slate-400 font-semibold">Reseller Price:</span>
              <span className="text-sm font-extrabold text-blue-700">৳{product.resellerPrice}</span>
            </div>
            <div className="flex items-baseline justify-between text-[10px]">
              <span className="text-slate-400">Suggested Retail:</span>
              <span className="text-slate-500 font-medium line-through">৳{product.retailPrice}</span>
            </div>

            {resellerProfit > 0 && (
              <div className="pt-1 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                <span className="text-emerald-700 font-bold">Reseller Profit:</span>
                <span className="text-emerald-700 font-extrabold">৳{resellerProfit}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="p-3.5 pt-0">
        <button
          onClick={onOrderClick}
          disabled={isOutOfStock}
          className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 ${
            isOutOfStock
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-98'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>{isOutOfStock ? 'Out of Stock' : 'Order Now'}</span>
        </button>
      </div>
    </div>
  );
};
