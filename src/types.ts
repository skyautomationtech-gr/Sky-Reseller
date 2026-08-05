export type UserRole = 'super_admin' | 'admin' | 'reseller';

export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface UserProfile {
  uid: string;
  fullName: string;
  shopName: string;
  mobile: string;
  email: string;
  division: string;
  district: string;
  upazila: string;
  address: string;
  profilePhotoUrl: string;
  shopPhotoUrl: string;
  nidUrl?: string;
  role: UserRole;
  status: UserStatus;
  rejectReason?: string | null;
  lastSeenVersion?: string;
  createdAt: any; // Firestore Timestamp or Date
}

export interface GeoData {
  [division: string]: {
    [district: string]: string[];
  };
}

export interface Category {
  id: string;
  name: string;
  imageUrl?: string;
  status: 'active' | 'inactive';
  createdAt: any;
}

export interface Brand {
  id: string;
  name: string;
  logoUrl?: string;
  status: 'active' | 'inactive';
  createdAt: any;
}

export interface ProductMedia {
  url: string;
  path: string;
  isCover?: boolean;
  uploadedAt?: any;
}

export interface ProductVideoMedia {
  url: string;
  path: string;
  uploadedAt?: any;
}

export interface ProductVariant {
  id: string;
  colorName: string;
  colorSwatchUrl?: string;
  images: ProductMedia[];
  stock: number;
  priceAdjustment: number;
  sku: string;
  status: 'active' | 'inactive';
}

export interface Product {
  id: string;
  sku: string;
  barcodeValue: string;
  qrValue: string;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  name: string;
  costPrice: number;
  resellerPrice: number;
  retailPrice: number;
  stock: number;
  lowStockThreshold: number;
  warranty: string;
  description: string;
  images: ProductMedia[];
  videos: ProductVideoMedia[];
  hasVariants?: boolean;
  variants?: ProductVariant[];
  status: 'active' | 'inactive' | 'deleted';
  createdAt: any;
  updatedAt?: any;
}

export type OrderStatus = 'pending' | 'accepted' | 'packing' | 'ready_to_ship' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
export type OrderPaymentStatus = 'unpaid' | 'paid' | 'partial';

export interface Order {
  id: string;
  orderNumber: string;
  resellerId: string;
  resellerName: string;
  resellerShopName: string;
  productId: string;
  productName: string;
  productImage?: string;
  categoryId?: string;
  variantId?: string | null;
  variantColorName?: string | null;
  quantity: number;
  unitRetailPrice: number;
  unitResellerPrice: number;
  suggestedRetailPrice?: number;
  sellingPrice?: number;
  totalAmount: number;
  sellAmount: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  invoiceNumber?: string;
  invoiceGeneratedAt?: any;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  createdAt: any;
  updatedAt: any;
}

export interface Wallet {
  resellerId: string;
  balance: number;
  totalEarned: number;
  totalWithdrawn: number;
  updatedAt: any;
}

export type TransactionType = 'commission' | 'withdrawal' | 'adjustment';
export type TransactionStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'bkash' | 'nagad' | 'bank_transfer';

export interface WalletTransaction {
  id: string;
  resellerId: string;
  resellerName?: string;
  resellerShopName?: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  orderId?: string | null;
  orderNumber?: string | null;
  paymentMethod?: PaymentMethod | null;
  accountNumber?: string | null;
  rejectReason?: string | null;
  createdAt: any;
  updatedAt?: any;
}

export type CommissionType = 'sell_amount' | 'percentage' | 'fixed';

export interface CategoryCommissionOverride {
  categoryId: string;
  categoryName: string;
  commissionType: CommissionType;
  value: number;
}

export interface CommissionSettings {
  id?: string;
  defaultType: CommissionType;
  percentageValue: number;
  fixedValue: number;
  monthlyBonusThresholdOrders: number;
  monthlyBonusAmount: number;
  categoryOverrides?: CategoryCommissionOverride[];
  updatedAt?: any;
}

// Phase 5 Types
export type NoticeType = 'new_product' | 'offer' | 'holiday_notice' | 'maintenance' | 'payment_notice';
export type NoticeAudience = 'all' | 'specific';

export interface Notice {
  id: string;
  type: NoticeType;
  title: string;
  message: string;
  targetAudience: NoticeAudience;
  targetResellerId?: string | null;
  targetResellerName?: string | null;
  publishedBy: string;
  publishedByName?: string;
  createdAt: any;
}

export interface NoticeRead {
  id: string;
  noticeId: string;
  resellerId: string;
  readAt: any;
}

export type TicketCategory = 'order_issue' | 'payment_issue' | 'product_issue' | 'account_issue' | 'other';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface TicketReply {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  message: string;
  createdAt: any;
}

export interface SupportTicket {
  id: string;
  resellerId: string;
  resellerName: string;
  resellerShopName?: string;
  subject: string;
  category: TicketCategory;
  description: string;
  imageUrl?: string | null;
  status: TicketStatus;
  replies: TicketReply[];
  createdAt: any;
  updatedAt: any;
}

export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  performedByName: string;
  performedByRole: UserRole;
  targetId?: string | null;
  details: string;
  timestamp: any;
}

export interface UserLoginSession {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  deviceInfo: string;
  timestamp: any;
}

export interface CompanySettings {
  companyName: string;
  logoUrl?: string;
  bannerImages?: string[];
  address: string;
  phoneNumbers: string;
  email: string;
  currencySymbol: string;
  vatPercentage: number;
  defaultDeliveryCharge: number;
  updatedAt?: any;
}

export type ReleaseType = 'major' | 'minor' | 'patch' | 'hotfix';

export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  description: string;
  releaseType: ReleaseType;
  publishedAt: any;
  publishedBy: string;
  publishedByName?: string;
}

export interface AppVersionConfig {
  version: string;
  releasedAt: any;
  releaseNotes?: string;
}



