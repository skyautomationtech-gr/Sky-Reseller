import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crop, ZoomIn, ZoomOut, Check, X, RotateCcw } from 'lucide-react';
import { triggerHaptic } from '../../../lib/nativeFeedback';

interface SquareCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onCropComplete: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

export const SquareCropModal: React.FC<SquareCropModalProps> = ({
  isOpen,
  imageSrc,
  onCropComplete,
  onCancel,
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset when a new image is loaded
  useEffect(() => {
    if (isOpen && imageSrc) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = imageSrc;
    }
  }, [isOpen, imageSrc]);

  if (!isOpen) return null;

  // Touch and Mouse dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPosition({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Perform square crop onto a 1024x1024 canvas
  const handleSaveCrop = () => {
    triggerHaptic('medium');
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    const cropBoxSize = container.clientWidth; // Square container width
    const canvas = document.createElement('canvas');
    const TARGET_SIZE = 1024;
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background fill
    ctx.fillStyle = '#050B1A';
    ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

    // Compute display scaling ratio
    const ratio = TARGET_SIZE / cropBoxSize;
    const renderedWidth = img.clientWidth * scale;
    const renderedHeight = img.clientHeight * scale;

    // Calculate source positions mapped to TARGET_SIZE
    const drawX = (position.x + (cropBoxSize - renderedWidth) / 2) * ratio;
    const drawY = (position.y + (cropBoxSize - renderedHeight) / 2) * ratio;
    const drawWidth = renderedWidth * ratio;
    const drawHeight = renderedHeight * ratio;

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    const croppedUrl = canvas.toDataURL('image/jpeg', 0.88);
    onCropComplete(croppedUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-3xl bg-[#071026] border border-white/20 p-5 shadow-2xl flex flex-col items-center">
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#0E9AA7]/20 border border-[#0E9AA7]/40 flex items-center justify-center text-[#3DD055]">
              <Crop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Crop to 1:1 Square</h3>
              <p className="text-[10px] text-slate-400">Drag & zoom to align your shop logo</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Square Viewport */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-2xl border-2 border-dashed border-[#3DD055] overflow-hidden bg-black/50 cursor-grab active:cursor-grabbing select-none flex items-center justify-center shadow-inner"
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="To crop"
            draggable={false}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transition: isDragging ? 'none' : 'transform 0.08s ease-out',
            }}
            className="max-w-none pointer-events-none select-none max-h-none object-contain"
          />

          {/* Guidelines Grid */}
          <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/20 opacity-30">
            <div className="border-r border-b border-white/20" />
            <div className="border-r border-b border-white/20" />
            <div className="border-b border-white/20" />
            <div className="border-r border-b border-white/20" />
            <div className="border-r border-b border-white/20" />
            <div className="border-b border-white/20" />
            <div className="border-r border-white/20" />
            <div className="border-r border-white/20" />
            <div />
          </div>
        </div>

        {/* Zoom Slider & Controls */}
        <div className="w-full mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1 text-[11px] font-semibold">
              <ZoomOut className="w-3.5 h-3.5 text-slate-400" /> Zoom:
            </span>
            <span className="font-mono text-[11px] text-[#3DD055]">{scale.toFixed(1)}x</span>
            <button
              type="button"
              onClick={() => {
                setScale(1);
                setPosition({ x: 0, y: 0 });
              }}
              className="text-[10px] text-[#0E9AA7] hover:underline flex items-center gap-0.5 cursor-pointer font-semibold"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
          <input
            type="range"
            min="0.8"
            max="3"
            step="0.05"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="w-full accent-[#3DD055] cursor-pointer"
          />
        </div>

        {/* Dual Live Preview: Circular & Square */}
        <div className="w-full mt-3 p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-around">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full border border-[#3DD055] overflow-hidden bg-black/40 flex items-center justify-center relative">
              <img
                src={imageSrc}
                alt="Circle Preview"
                style={{
                  transform: `translate(${position.x * 0.15}px, ${position.y * 0.15}px) scale(${scale * 0.6})`,
                }}
                className="pointer-events-none select-none max-w-none"
              />
            </div>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Circular View</span>
          </div>

          <div className="h-8 w-px bg-white/10" />

          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl border border-[#0E9AA7] overflow-hidden bg-black/40 flex items-center justify-center relative">
              <img
                src={imageSrc}
                alt="Square Preview"
                style={{
                  transform: `translate(${position.x * 0.15}px, ${position.y * 0.15}px) scale(${scale * 0.6})`,
                }}
                className="pointer-events-none select-none max-w-none"
              />
            </div>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Square View</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveCrop}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] hover:brightness-110 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#3DD055]/30 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply 1:1 Crop</span>
          </button>
        </div>
      </div>
    </div>
  );
};
