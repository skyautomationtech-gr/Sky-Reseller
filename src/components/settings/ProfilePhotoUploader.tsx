import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { compressImageFile } from '../../lib/imageCompressor';
import { logAuditAction } from '../../lib/auditLogger';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { 
  Camera, Store, User, UploadCloud, Trash2, Check, X, Loader2, 
  Lock, ChevronRight, Image as ImageIcon, ShieldCheck 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ProfilePhotoUploaderHandle {
  open: () => void;
  close: () => void;
}

export interface ProfilePhotoUploaderProps {
  user: UserProfile;
  canAccessFullApp?: boolean;
  onOpenLockedModal?: (featureName?: string) => void;
  onPhotoUpdated?: (newPhotoUrl: string) => void;
  onRefreshUser?: () => void;
  showToast?: (text: string, type: 'success' | 'error') => void;
  className?: string;
}

export const ProfilePhotoUploader = forwardRef<ProfilePhotoUploaderHandle, ProfilePhotoUploaderProps>(({
  user,
  canAccessFullApp = true,
  onOpenLockedModal,
  onPhotoUpdated,
  onRefreshUser,
  showToast,
  className = '',
}, ref) => {
  const currentPhoto = user.shopPhotoUrl || user.shopLogoUrl || user.profilePhotoUrl || '';
  
  const [isOpen, setIsOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>(currentPhoto);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRestricted = !canAccessFullApp || user.status === 'pending';

  useImperativeHandle(ref, () => ({
    open: () => {
      handleOpen();
    },
    close: () => {
      handleClose();
    },
  }));

  const handleOpen = () => {
    triggerHaptic('light');
    if (isRestricted) {
      if (onOpenLockedModal) {
        onOpenLockedModal('Profile & Shop Photo');
      } else if (showToast) {
        showToast('Photo changes require account approval', 'error');
      }
      return;
    }
    setPreviewUrl(currentPhoto);
    setErrorMessage('');
    setHasChanges(false);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isSaving || isProcessing) return;
    setIsOpen(false);
    setErrorMessage('');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    try {
      // Use existing client-side image compression standard (400x400, quality 0.85)
      const compressed = await compressImageFile(file, 400, 400, 0.85);
      setPreviewUrl(compressed);
      setHasChanges(true);
      triggerHaptic('light');
    } catch (err: any) {
      console.error('Image compression error:', err);
      setErrorMessage(err.message || 'Could not process the selected image.');
    } finally {
      setIsProcessing(false);
      // Reset input value so same file can be selected again if desired
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = () => {
    triggerHaptic('medium');
    setPreviewUrl('');
    setHasChanges(true);
    setErrorMessage('');
  };

  const handleSavePhoto = async () => {
    if (!hasChanges) {
      handleClose();
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    triggerHaptic('medium');

    try {
      const userRef = doc(db, 'users', user.uid);
      const updateData: Record<string, any> = {
        profilePhotoUrl: previewUrl || null,
        shopPhotoUrl: previewUrl || null,
        shopLogoUrl: previewUrl || null,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(userRef, updateData);

      // Audit Log
      await logAuditAction(
        user.uid,
        user.fullName || user.shopName || 'Reseller',
        user.role || 'reseller',
        'UPDATE_PROFILE_PHOTO',
        {
          previousPhoto: Boolean(currentPhoto),
          removed: !previewUrl,
          photoLength: previewUrl ? previewUrl.length : 0,
        }
      );

      triggerHaptic('success');
      if (showToast) {
        showToast(previewUrl ? 'Profile photo updated successfully!' : 'Photo removed successfully!', 'success');
      }

      onPhotoUpdated?.(previewUrl);
      onRefreshUser?.();
      setIsOpen(false);
    } catch (err: any) {
      console.error('Error saving profile photo:', err);
      setErrorMessage(err.message || 'Failed to update photo in database.');
      triggerHaptic('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Tappable Settings Row within Account & Profile */}
      <button
        type="button"
        onClick={handleOpen}
        className={`${DT.settingsRow} ${className} text-left w-full`}
        aria-label="Update Profile and Shop Photo"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`${DT.iconTile} bg-amber-50/70 text-amber-600 border border-amber-200/60`}>
            <Camera className={DT.iconSize} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={DT.settingsRowTitle}>Profile & Shop Photo</span>
              {isRestricted && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
            </div>
            <p className={DT.settingsRowHelper}>Logo for invoices, header & watermark</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {/* Thumbnail preview badge */}
          {currentPhoto ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200/80 shadow-2xs bg-slate-100 flex items-center justify-center">
              <img
                src={currentPhoto}
                alt="Current profile"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <span className="text-[11px] font-bold text-[#0E9AA7] bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
              Add Photo
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </div>
      </button>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Glass Bottom Sheet / Upload Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={handleClose}
            />

            <motion.div
              initial={{ opacity: 0, y: 80, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 80, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="relative w-full max-w-sm bg-white/95 backdrop-blur-2xl border border-white/80 rounded-t-[24px] sm:rounded-[20px] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.2)] z-10 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200/60 text-[#0E9AA7] flex items-center justify-center">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-[#04203F] leading-tight">
                      Profile & Shop Photo
                    </h3>
                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                      Square crop (1:1), compressed under 100KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSaving || isProcessing}
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Photo Preview Canvas */}
              <div className="flex flex-col items-center justify-center py-2">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-slate-200/80 shadow-md bg-slate-50 flex items-center justify-center">
                    {isProcessing ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin text-[#0E9AA7]" />
                        <span className="text-[10px] font-bold">Compressing...</span>
                      </div>
                    ) : previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Photo preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#04203F] text-white flex items-center justify-center text-2xl font-black">
                        {(user.shopName || user.fullName || 'S').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Overlaid Camera Action Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing || isSaving}
                    className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-[#0E9AA7] text-white flex items-center justify-center shadow-md border-2 border-white hover:bg-[#04203F] transition-colors disabled:opacity-50"
                    title="Select image from device"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 mt-2 font-medium">
                  {previewUrl ? 'Tap the camera button to change image' : 'Tap to select an image from your device'}
                </p>
              </div>

              {/* Actions Grid */}
              <div className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing || isSaving}
                    className="flex-1 h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 text-[#04203F] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>{previewUrl ? 'Choose Different' : 'Select from Device'}</span>
                  </button>

                  {previewUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={isProcessing || isSaving}
                      className="h-[38px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      title="Remove current photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                {/* Primary Save Button */}
                <button
                  type="button"
                  onClick={handleSavePhoto}
                  disabled={isProcessing || isSaving || !hasChanges}
                  className="w-full h-[40px] rounded-xl bg-[#04203F] hover:bg-[#031830] active:scale-[0.98] text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-teal-300" />
                      <span>Saving to Account...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-[#3DD055]" />
                      <span>Save & Apply Photo</span>
                    </>
                  )}
                </button>
              </div>

              {/* Privacy / Security Notice */}
              <div className="pt-1 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>Synchronized with your shop header, invoices & parcels</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
});

ProfilePhotoUploader.displayName = 'ProfilePhotoUploader';
