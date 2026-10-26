/**
 * Client-side Canvas Image Compression Utility
 * Resizes and compresses image files into small, high-quality JPEG Data URLs.
 * Keeps file payload under ~40KB–100KB to ensure smooth Firestore writes and avoid 1MB document limit errors.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1000,
  maxHeight = 800,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        reject(new Error('Failed to read image file.'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // Calculate aspect-ratio scaling
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }

          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(src);
            return;
          }

          // Enable high-quality smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // White background fallback for transparent images converted to JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        } catch (err) {
          console.warn('Canvas image compression failed, using original source:', err);
          resolve(src);
        }
      };

      img.onerror = () => {
        reject(new Error('Could not parse image file.'));
      };

      img.src = src;
    };

    reader.onerror = () => {
      reject(new Error('Could not read image file.'));
    };

    reader.readAsDataURL(file);
  });
}
