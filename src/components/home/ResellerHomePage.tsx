import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, getDoc 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Product, ProductVariant, UserProfile, Wallet, Category, CompanySettings, CartItem } from '../../types';
import { ProductDetailModal } from '../inventory/ProductDetailModal';
import { CreateOrderModal } from '../orders/CreateOrderModal';
import { SocialShareModal } from '../inventory/SocialShareModal';
import { AIMarketingModal } from '../marketing/AIMarketingModal';
import { SkyLogo } from '../common/SkyLogo';
import { 
  Store, Search, Wallet as WalletIcon, ShoppingBag, Clock, ArrowRight, 
  Sparkles, Layers, ChevronRight, AlertCircle, Headphones, Watch, Zap, 
  Cable, Speaker, BatteryCharging, Smartphone, Package, Check, ChevronLeft,
  ShoppingCart, Trash2, Plus, Minus, AlertTriangle, Share2, Bot
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

  const [shareModalProduct, setShareModalProduct] = useState<Product | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const [aiModalProduct, setAiModalProduct] = useState<Product | null>(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);

  const [orderProduct, setOrderProduct] = useState<Product | null>(null);
  const [orderVariant, setOrderVariant] = useState<ProductVariant | null>(null);
  const [isOrderOpen, setIsOrderOpen] = useState(false);

  // Variant selector modal if product has multiple variants
  const [variantModalProduct, setVariantModalProduct] = useState<Product | null>(null);
  const [variantActionType, setVariantActionType] = useState<'buy_now' | 'add_to_cart' | null>(null);

  // Shopping Cart States
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutCartItems, setCheckoutCartItems] = useState<CartItem[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(`cart_${user.uid}`);
      if (savedCart) {
        setCart(JSON.parse(savedCart));
      }
    } catch (e) {
      console.error('Failed to load cart:', e);
    }
  }, [user.uid]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

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

  const addToCart = (product: Product, variant: ProductVariant | null) => {
    const cartItemId = `${product.id}_${variant ? variant.id : 'default'}`;
    const stockLimit = variant ? variant.stock : product.stock;

    if (stockLimit <= 0) {
      setToastMessage('This item is currently out of stock.');
      return;
    }

    setCart((prevCart) => {
      const existingItemIndex = prevCart.findIndex((item) => item.id === cartItemId);
      let updatedCart;

      if (existingItemIndex > -1) {
        updatedCart = [...prevCart];
        const currentItem = updatedCart[existingItemIndex];
        if (currentItem.quantity < stockLimit) {
          currentItem.quantity += 1;
          setToastMessage(`Increased "${product.name}" quantity in cart.`);
        } else {
          setToastMessage(`Cannot add more. Stock limit of ${stockLimit} reached.`);
        }
      } else {
        const vAdj = variant ? (variant.priceAdjustment || 0) : 0;
        const defaultSellingPrice = product.retailPrice + vAdj;

        const newItem: CartItem = {
          id: cartItemId,
          product,
          variant,
          quantity: 1,
          sellingPrice: defaultSellingPrice
        };
        updatedCart = [...prevCart, newItem];
        setToastMessage(`Added "${product.name}" to cart.`);
      }

      localStorage.setItem(`cart_${user.uid}`, JSON.stringify(updatedCart));
      return updatedCart;
    });

    setIsCartOpen(true);
  };

  const removeFromCart = (id: string) => {
    setCart((prevCart) => {
      const updatedCart = prevCart.filter((item) => item.id !== id);
      localStorage.setItem(`cart_${user.uid}`, JSON.stringify(updatedCart));
      return updatedCart;
    });
    setToastMessage('Item removed from cart.');
  };

  const updateCartQuantity = (id: string, newQty: number) => {
    setCart((prevCart) => {
      const updatedCart = prevCart.map((item) => {
        if (item.id === id) {
          const limit = item.variant ? item.variant.stock : item.product.stock;
          const qty = Math.max(1, Math.min(limit, newQty));
          return { ...item, quantity: qty };
        }
        return item;
      });
      localStorage.setItem(`cart_${user.uid}`, JSON.stringify(updatedCart));
      return updatedCart;
    });
  };

  const updateCartSellingPrice = (id: string, newPrice: number) => {
    setCart((prevCart) => {
      const updatedCart = prevCart.map((item) => {
        if (item.id === id) {
          return { ...item, sellingPrice: Math.max(0, newPrice) };
        }
        return item;
      });
      localStorage.setItem(`cart_${user.uid}`, JSON.stringify(updatedCart));
      return updatedCart;
    });
  };

  const clearCart = () => {
    setCart([]);
    localStorage.removeItem(`cart_${user.uid}`);
  };

  const handleBuyNowClick = (product: Product) => {
    if ((product.stock || 0) <= 0) return;

    if (product.hasVariants && product.variants && product.variants.length > 0) {
      const activeVariants = product.variants.filter((v) => v.status === 'active');
      if (activeVariants.length > 1) {
        setVariantActionType('buy_now');
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

  const handleAddToCartClick = (product: Product) => {
    if ((product.stock || 0) <= 0) return;

    if (product.hasVariants && product.variants && product.variants.length > 0) {
      const activeVariants = product.variants.filter((v) => v.status === 'active');
      if (activeVariants.length > 1) {
        setVariantActionType('add_to_cart');
        setVariantModalProduct(product);
        return;
      } else if (activeVariants.length === 1) {
        addToCart(product, activeVariants[0]);
        return;
      }
    }

    addToCart(product, null);
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Shopping Cart Card */}
        <div 
          onClick={() => setIsCartOpen(true)}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-orange-500 transition-all cursor-pointer flex items-center justify-between group relative overflow-hidden"
        >
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Shopping Cart</span>
            <span className="text-xl font-extrabold text-slate-900 block">
              {cart.reduce((acc, item) => acc + item.quantity, 0)} Items
            </span>
            <span className="text-[10px] font-semibold text-[#f57224] group-hover:underline">View & Place Order →</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#f57224] flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          {cart.length > 0 && (
            <span className="absolute top-2.5 right-2.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#f57224]"></span>
            </span>
          )}
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
                          onAddToCart={(prod) => handleAddToCartClick(prod)}
                          onBuyNow={(prod) => handleBuyNowClick(prod)}
                          onShareClick={(prod) => {
                            setShareModalProduct(prod);
                            setIsShareModalOpen(true);
                          }}
                          onAICopyClick={(prod) => {
                            setAiModalProduct(prod);
                            setIsAIModalOpen(true);
                          }}
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
                        onAddToCart={(prod) => handleAddToCartClick(prod)}
                        onBuyNow={(prod) => handleBuyNowClick(prod)}
                        onShareClick={(prod) => {
                          setShareModalProduct(prod);
                          setIsShareModalOpen(true);
                        }}
                        onAICopyClick={(prod) => {
                          setAiModalProduct(prod);
                          setIsAIModalOpen(true);
                        }}
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
        user={user}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailProduct(null);
        }}
      />

      {/* SOCIAL SHARE & MARKETING POST MAKER MODAL */}
      <SocialShareModal
        product={shareModalProduct}
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          setShareModalProduct(null);
        }}
        user={user}
      />

      {/* GEMINI AI MARKETING ASSISTANT MODAL */}
      <AIMarketingModal
        product={aiModalProduct}
        initialProduct={aiModalProduct}
        isOpen={isAIModalOpen}
        onClose={() => {
          setIsAIModalOpen(false);
          setAiModalProduct(null);
        }}
        user={user}
        onOpenSocialShare={(prod) => {
          setIsAIModalOpen(false);
          setShareModalProduct(prod);
          setIsShareModalOpen(true);
        }}
      />

      {/* CREATE ORDER MODAL PRE-FILLED */}
      <CreateOrderModal
        isOpen={isOrderOpen}
        onClose={() => {
          setIsOrderOpen(false);
          setOrderProduct(null);
          setOrderVariant(null);
          setCheckoutCartItems(null);
        }}
        user={user}
        initialProduct={orderProduct}
        initialVariant={orderVariant}
        cartItems={checkoutCartItems || undefined}
        onOrderCreated={() => {
          setIsOrderOpen(false);
          setOrderProduct(null);
          setOrderVariant(null);
          if (checkoutCartItems) {
            clearCart();
          }
          setCheckoutCartItems(null);
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
                      if (variantActionType === 'add_to_cart') {
                        addToCart(prod, v);
                      } else {
                        setOrderProduct(prod);
                        setOrderVariant(v);
                        setIsOrderOpen(true);
                      }
                      setVariantActionType(null);
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

      {/* FLOATING CART FAB BUTTON */}
      {cart.length > 0 && !isCartOpen && (
        <button
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-22 right-6 z-40 bg-[#f57224] hover:bg-[#e0651d] text-white p-3.5 rounded-full shadow-2xl transition-all scale-100 hover:scale-105 active:scale-95 flex items-center justify-center group cursor-pointer select-none ring-2 ring-white"
          title="View Shopping Cart"
        >
          <div className="relative">
            <ShoppingCart className="w-6 h-6" />
            <span className="absolute -top-3 -right-3 bg-white text-[#f57224] text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border-2 border-[#f57224] shadow-md">
              {cart.reduce((acc, item) => acc + item.quantity, 0)}
            </span>
          </div>
        </button>
      )}

      {/* TOAST MESSAGE POPUP */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-slate-800 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* SHOPPING CART DRAWER OVERLAY */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop overlay */}
          <div 
            onClick={() => setIsCartOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-300"
          />

          {/* Sliding Drawer Container */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-right duration-250 ease-out">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#f57224] flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-slate-900">Your Cart</h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {cart.reduce((acc, item) => acc + item.quantity, 0)} Items Selected
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-[10px] text-rose-600 hover:text-rose-700 font-extrabold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer select-none"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center text-xs font-bold transition-all cursor-pointer select-none"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Scrollable Items list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 p-8">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center">
                    <ShoppingCart className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">Your cart is empty</h4>
                    <p className="text-xs text-slate-500 max-w-[220px]">
                      Add products from the marketplace to bundle them into a single custom order.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsCartOpen(false)}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/10 transition-all active:scale-95 cursor-pointer select-none"
                  >
                    Start Shopping
                  </button>
                </div>
              ) : (
                cart.map((item) => {
                  const itemCostPrice = item.product.resellerPrice + (item.variant ? (item.variant.priceAdjustment || 0) : 0);
                  const limit = item.variant ? item.variant.stock : item.product.stock;
                  const itemProfit = item.sellingPrice - itemCostPrice;
                  const totalLineProfit = itemProfit * item.quantity;

                  return (
                    <div 
                      key={item.id}
                      className="bg-white border border-slate-200/80 rounded-xl p-3 space-y-3 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between relative text-left"
                    >
                      {/* Product details info row */}
                      <div className="flex items-start gap-3">
                        {/* Image */}
                        <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-lg overflow-hidden shrink-0">
                          {item.product.images?.[0]?.url ? (
                            <img 
                              src={item.product.images[0].url} 
                              alt={item.product.name} 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50">
                              <Package className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        {/* Title and Category */}
                        <div className="flex-1 space-y-0.5 min-w-0">
                          <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider block">
                            {item.product.categoryName || 'Others'}
                          </span>
                          <h4 className="text-xs font-extrabold text-slate-900 leading-tight truncate">
                            {item.product.name}
                          </h4>
                          {item.variant && (
                            <div className="flex items-center gap-1">
                              <span 
                                className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0"
                                style={{ backgroundColor: item.variant.colorName.toLowerCase() }}
                              />
                              <span className="text-[10px] font-bold text-slate-600">{item.variant.colorName}</span>
                            </div>
                          )}
                          <div className="text-[10px] font-semibold text-slate-500">
                            Available Stock: <span className="text-slate-800 font-extrabold">{limit} items</span>
                          </div>
                        </div>

                        {/* Quick Trash */}
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-slate-300 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Controls and prices */}
                      <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-slate-100 items-end">
                        
                        {/* Qty Counter */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Quantity</span>
                          <div className="flex items-center border border-slate-200 rounded-lg max-w-[100px] h-8 bg-slate-50 overflow-hidden">
                            <button
                              onClick={() => {
                                if (item.quantity > 1) {
                                  updateCartQuantity(item.id, item.quantity - 1);
                                } else {
                                  removeFromCart(item.id);
                                }
                              }}
                              className="w-8 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer select-none"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="flex-1 text-center text-xs font-bold text-slate-800 select-none">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => {
                                if (item.quantity < limit) {
                                  updateCartQuantity(item.id, item.quantity + 1);
                                } else {
                                  setToastMessage(`Limit reached. Only ${limit} in stock.`);
                                }
                              }}
                              className="w-8 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer select-none"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Customer Selling Price Input */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <span>Selling Price</span>
                            <span className="text-[9px] font-semibold text-slate-400 lowercase italic">min: ৳{itemCostPrice}</span>
                          </div>
                          <div className="relative h-8">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">৳</span>
                            <input
                              type="number"
                              value={item.sellingPrice}
                              onChange={(e) => updateCartSellingPrice(item.id, parseFloat(e.target.value) || 0)}
                              className="w-full h-full pl-6 pr-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                        </div>

                      </div>

                      {/* Profit Estimation strip */}
                      <div className="bg-slate-50 border border-slate-100 p-2 rounded-lg flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-medium">Estimated Commission:</span>
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className="text-slate-400 font-semibold">
                            (৳{item.sellingPrice} - ৳{itemCostPrice}) × {item.quantity} =
                          </span>
                          <span className={totalLineProfit >= 0 ? 'text-emerald-600 font-extrabold' : 'text-rose-600 font-extrabold'}>
                            ৳{totalLineProfit}
                          </span>
                        </div>
                      </div>

                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Summary & Checkout */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-4 shadow-inner text-left">
                {/* Math breakdown */}
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal Wholesale Cost (You Pay):</span>
                    <span className="font-bold text-slate-800">
                      ৳{cart.reduce((acc, item) => {
                        const itemCost = item.product.resellerPrice + (item.variant ? (item.variant.priceAdjustment || 0) : 0);
                        return acc + (itemCost * item.quantity);
                      }, 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Subtotal Selling Price (Customer Pays):</span>
                    <span className="font-bold text-slate-800">
                      ৳{cart.reduce((acc, item) => acc + (item.sellingPrice * item.quantity), 0)}
                    </span>
                  </div>
                  
                  {/* Total Profit */}
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                    <span className="text-sm font-bold text-slate-900">Estimated Total Profit:</span>
                    <span className="text-base font-extrabold text-emerald-600">
                      ৳{cart.reduce((acc, item) => {
                        const itemCost = item.product.resellerPrice + (item.variant ? (item.variant.priceAdjustment || 0) : 0);
                        return acc + ((item.sellingPrice - itemCost) * item.quantity);
                      }, 0)}
                    </span>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  onClick={() => {
                    // Check if any selling price is lower than reseller price
                    const invalidItems = cart.filter(item => {
                      const cost = item.product.resellerPrice + (item.variant ? (item.variant.priceAdjustment || 0) : 0);
                      return item.sellingPrice < cost;
                    });

                    if (invalidItems.length > 0) {
                      setToastMessage(`Error: "${invalidItems[0].product.name}" selling price cannot be lower than cost price.`);
                      return;
                    }

                    setCheckoutCartItems(cart);
                    setIsCartOpen(false);
                    setIsOrderOpen(true);
                  }}
                  className="w-full py-3 bg-[#f57224] hover:bg-[#e0651d] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 active:scale-98 transition-all cursor-pointer select-none"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Checkout & Place Order</span>
                </button>
              </div>
            )}

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
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  onShareClick?: (product: Product) => void;
  onAICopyClick?: (product: Product) => void;
  isGridMode?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onDetailClick,
  onAddToCart,
  onBuyNow,
  onShareClick,
  onAICopyClick,
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
          className="relative aspect-square bg-slate-100 overflow-hidden"
        >
          <div 
            onClick={onDetailClick}
            className="w-full h-full cursor-pointer"
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
          </div>

          {/* Badges Overlays */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start pointer-events-none">
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

          {/* Quick Floating Buttons (AI Copy + Poster Maker) */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
            {onAICopyClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAICopyClick(product);
                }}
                className="w-8 h-8 rounded-full bg-blue-600/90 hover:bg-blue-600 backdrop-blur-xs text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95 cursor-pointer"
                title="Generate AI Marketing Caption (Facebook / TikTok)"
              >
                <Bot className="w-4 h-4 text-amber-300" />
              </button>
            )}

            {onShareClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShareClick(product);
                }}
                className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-orange-600 backdrop-blur-xs text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95 cursor-pointer"
                title="Create Custom Watermarked Poster & Share Caption"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
              </button>
            )}
          </div>

          <span className="absolute bottom-2.5 right-2.5 bg-slate-900/80 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5 rounded-md pointer-events-none">
            SKU: {product.sku}
          </span>
        </div>

        {/* Card Body Info */}
        <div className="p-3.5 space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600">
                {product.categoryName || 'Gadgets'}
              </span>
              <div className="flex items-center gap-2">
                {onAICopyClick && (
                  <button
                    onClick={() => onAICopyClick(product)}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 hover:underline cursor-pointer"
                    title="Generate AI Facebook / TikTok Post"
                  >
                    <Bot className="w-3 h-3 text-blue-600" />
                    <span>AI Copy</span>
                  </button>
                )}
                {onShareClick && (
                  <button
                    onClick={() => onShareClick(product)}
                    className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>Poster</span>
                  </button>
                )}
              </div>
            </div>
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
      <div className="p-3 pt-0 grid grid-cols-2 gap-2">
        <button
          onClick={() => onAddToCart(product)}
          disabled={isOutOfStock}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1 cursor-pointer select-none ${
            isOutOfStock
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200'
              : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 hover:border-amber-300 active:scale-95'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span className="whitespace-nowrap">Add Cart</span>
        </button>
        <button
          onClick={() => onBuyNow(product)}
          disabled={isOutOfStock}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer select-none ${
            isOutOfStock
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-[#f57224] hover:bg-[#e0651d] text-white active:scale-95'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span className="whitespace-nowrap">Buy Now</span>
        </button>
      </div>
    </div>
  );
};
