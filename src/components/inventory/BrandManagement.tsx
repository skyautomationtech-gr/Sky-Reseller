import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Brand, Product } from '../../types';
import { Tag, Plus, Edit2, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface BrandManagementProps {
  isAdminOrSuperAdmin: boolean;
}

export const BrandManagement: React.FC<BrandManagementProps> = ({ isAdminOrSuperAdmin }) => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const defaultBrands = [
    'KZ',
    'JBL',
    'Hoco',
    'Awei',
    'Oraimo',
    'Joyroom',
    'Xiaomi',
    'Baseus',
    'Others',
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const brandSnap = await getDocs(collection(db, 'brands'));
      let brandList: Brand[] = brandSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Brand));

      if (brandList.length === 0) {
        // Pre-seed default brands
        for (const brandName of defaultBrands) {
          const docRef = await addDoc(collection(db, 'brands'), {
            name: brandName,
            logoUrl: '',
            status: 'active',
            createdAt: serverTimestamp(),
          });
          brandList.push({ id: docRef.id, name: brandName, status: 'active', createdAt: new Date() });
        }
      }

      setBrands(brandList);

      const prodSnap = await getDocs(collection(db, 'products'));
      const prodList: Product[] = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prodList);
    } catch (err) {
      console.error('Error fetching brands:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingBrand(null);
    setName('');
    setLogoUrl('');
    setStatus('active');
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setName(brand.name);
    setLogoUrl(brand.logoUrl || '');
    setStatus(brand.status);
    setError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Brand name is required');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      if (editingBrand) {
        await updateDoc(doc(db, 'brands', editingBrand.id), {
          name: name.trim(),
          logoUrl: logoUrl.trim(),
          status,
        });
      } else {
        await addDoc(collection(db, 'brands'), {
          name: name.trim(),
          logoUrl: logoUrl.trim(),
          status,
          createdAt: serverTimestamp(),
        });
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save brand');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteBrand = async () => {
    if (!brandToDelete) return;
    const id = brandToDelete.id;
    setIsDeleting(true);
    try {
      setBrands(prev => prev.filter(b => b.id !== id));
      await deleteDoc(doc(db, 'brands', id));
      setBrandToDelete(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert(`Failed to delete brand: ${err.message || err}`);
      fetchData();
    } finally {
      setIsDeleting(false);
    }
  };

  const getProductCount = (brandId: string) => {
    return products.filter(p => p.brandId === brandId && p.status !== 'deleted').length;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Brand Management</h2>
          <p className="text-xs text-slate-500">Manage manufacturers and tech accessory brands.</p>
        </div>
        {isAdminOrSuperAdmin && (
          <button
            onClick={handleOpenAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Brand</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Mobile Cards View (<640px) */}
        <div className="sm:hidden p-3 space-y-3">
          {brands.map((brand) => {
            const count = getProductCount(brand.id);
            return (
              <div 
                key={brand.id}
                className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {brand.logoUrl ? (
                      <img src={brand.logoUrl} alt={brand.name} className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0 text-base">
                        {brand.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">{brand.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">ID: {brand.id.slice(0, 8)}</p>
                    </div>
                  </div>
                  {brand.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                      <XCircle className="w-3 h-3" /> Inactive
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1 rounded-full">
                    {count} Products
                  </span>
                  {isAdminOrSuperAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(brand)}
                        className="p-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl font-bold text-xs flex items-center gap-1 min-h-[44px] min-w-[44px] justify-center"
                        title="Edit Brand"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setBrandToDelete(brand)}
                        className="p-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl font-bold text-xs flex items-center gap-1 min-h-[44px] min-w-[44px] justify-center"
                        title="Delete Brand"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {brands.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs">
              No brands found.
            </div>
          )}
        </div>

        {/* Desktop Table View (>=640px) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Brand Name</th>
                <th className="px-6 py-4">Products Count</th>
                <th className="px-6 py-4">Status</th>
                {isAdminOrSuperAdmin && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {brands.map((brand) => {
                const count = getProductCount(brand.id);
                return (
                  <tr key={brand.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {brand.logoUrl ? (
                          <img src={brand.logoUrl} alt={brand.name} className="w-10 h-10 rounded-xl object-cover border border-slate-200" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                            {brand.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-900">{brand.name}</p>
                          <span className="text-[10px] text-slate-400">ID: {brand.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        {count} Products
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {brand.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                          <XCircle className="w-3 h-3" /> Inactive
                        </span>
                      )}
                    </td>
                    {isAdminOrSuperAdmin && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(brand)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Brand"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setBrandToDelete(brand)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Brand"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {brands.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-xs">
                    No brands found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">
                {editingBrand ? 'Edit Brand' : 'Add New Brand'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Brand Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. JBL"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Logo URL (Optional)
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                />
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

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
                  <span>{editingBrand ? 'Update Brand' : 'Save Brand'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {brandToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Brand</h3>
                <p className="text-xs text-slate-500">Are you sure you want to delete this brand?</p>
              </div>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
              <p className="text-slate-500">Brand Name:</p>
              <p className="font-semibold text-slate-900 text-sm mt-0.5">{brandToDelete.name}</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBrandToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteBrand}
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
