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

