import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2 } from 'lucide-react';

const CROP_SIZE = 280;
const OUTPUT_SIZE = 512;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export default function AvatarCropDialog({ open, imageSrc, fileName = 'avatar.jpg', mimeType = 'image/jpeg', onOpenChange, onConfirm }) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dragStartRef = useRef(null);

  useEffect(() => {
    if (!open || !imageSrc) return undefined;
    let active = true;
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setError('');

    loadImage(imageSrc)
      .then((image) => {
        if (!active) return;
        setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      })
      .catch(() => {
        if (!active) return;
        setError('Failed to load image');
      });

    return () => {
      active = false;
    };
  }, [open, imageSrc]);

  const baseScale = useMemo(() => {
    if (!imageSize.width || !imageSize.height) return 1;
    return Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height);
  }, [imageSize.height, imageSize.width]);

  const renderedWidth = imageSize.width * baseScale * zoom;
  const renderedHeight = imageSize.height * baseScale * zoom;
  const maxOffsetX = Math.max(0, (renderedWidth - CROP_SIZE) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - CROP_SIZE) / 2);

  useEffect(() => {
    setPosition((current) => ({
      x: clamp(current.x, -maxOffsetX, maxOffsetX),
      y: clamp(current.y, -maxOffsetY, maxOffsetY),
    }));
  }, [maxOffsetX, maxOffsetY]);

  const handlePointerDown = (event) => {
    if (!imageSrc || saving) return;
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      startX: position.x,
      startY: position.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (event) => {
    if (!dragStartRef.current) return;
    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    setPosition({
      x: clamp(dragStartRef.current.startX + deltaX, -maxOffsetX, maxOffsetX),
      y: clamp(dragStartRef.current.startY + deltaY, -maxOffsetY, maxOffsetY),
    });
  };

  const stopDragging = () => {
    dragStartRef.current = null;
    setDragging(false);
  };

  useEffect(() => {
    if (!dragging) return undefined;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [dragging, maxOffsetX, maxOffsetY]);

  const handleConfirm = async () => {
    if (!imageSrc || !imageSize.width || !imageSize.height) return;
    setSaving(true);
    setError('');

    try {
      const image = await loadImage(imageSrc);
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      const effectiveScale = baseScale * zoom;
      const left = (CROP_SIZE - imageSize.width * effectiveScale) / 2 + position.x;
      const top = (CROP_SIZE - imageSize.height * effectiveScale) / 2 + position.y;
      const sx = clamp((0 - left) / effectiveScale, 0, imageSize.width);
      const sy = clamp((0 - top) / effectiveScale, 0, imageSize.height);
      const sw = clamp(CROP_SIZE / effectiveScale, 1, imageSize.width - sx);
      const sh = clamp(CROP_SIZE / effectiveScale, 1, imageSize.height - sy);

      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('Failed to crop image'));
        }, mimeType === 'image/png' ? 'image/png' : 'image/jpeg', 0.92);
      });

      const extension = mimeType === 'image/png' ? 'png' : 'jpg';
      const croppedFile = new File([blob], `cropped-${fileName.replace(/\.[^.]+$/, '')}.${extension}`, {
        type: mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
      });

      await onConfirm(croppedFile, URL.createObjectURL(blob));
      onOpenChange(false);
    } catch (err) {
      setError(err.message || 'Failed to crop image');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100vw-1rem),32rem)] max-w-[32rem] rounded-[28px] border border-slate-200 bg-white p-0 overflow-hidden">
        <div className="p-5 sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle>Adjust Profile Photo</DialogTitle>
            <DialogDescription>
              Drag and zoom until your photo fits naturally inside the circle.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-5">
            <div className="flex justify-center">
              <div
                className="relative overflow-hidden rounded-[32px] bg-slate-950 shadow-inner touch-none"
                style={{ width: CROP_SIZE, height: CROP_SIZE }}
                onPointerDown={handlePointerDown}
              >
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt="Crop preview"
                    draggable={false}
                    className="absolute left-1/2 top-1/2 max-w-none select-none"
                    style={{
                      width: `${imageSize.width}px`,
                      height: `${imageSize.height}px`,
                      transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${baseScale * zoom})`,
                      transformOrigin: 'center center',
                    }}
                  />
                ) : null}
                <div className="pointer-events-none absolute inset-0 bg-black/45" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[228px] w-[228px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_999px_rgba(15,23,42,0.45)]" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                <span>Zoom</span>
                <span>{zoom.toFixed(1)}x</span>
              </div>
              <Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={([value]) => setZoom(value)} />
            </div>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </div>

          <DialogFooter className="mt-6 flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={saving || !imageSrc}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? 'Applying...' : 'Use This Photo'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
