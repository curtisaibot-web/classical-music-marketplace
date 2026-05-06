import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { toast } from "sonner";

interface ImageCropModalProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
  aspect?: number;
  outputWidth?: number;
  outputHeight?: number;
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0,
  outputWidth = 600,
  outputHeight = 800,
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = imageSrc;
  });

  const rotCanvas = document.createElement("canvas");
  const rotCtx = rotCanvas.getContext("2d")!;

  const maxSize = Math.max(image.width, image.height);
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

  rotCanvas.width = safeArea;
  rotCanvas.height = safeArea;

  rotCtx.translate(safeArea / 2, safeArea / 2);
  rotCtx.rotate((rotation * Math.PI) / 180);
  rotCtx.translate(-safeArea / 2, -safeArea / 2);
  rotCtx.drawImage(image, safeArea / 2 - image.width / 2, safeArea / 2 - image.height / 2);

  const data = rotCtx.getImageData(0, 0, safeArea, safeArea);

  const cropCanvas = document.createElement("canvas");
  const cropCtx = cropCanvas.getContext("2d")!;
  cropCanvas.width = pixelCrop.width;
  cropCanvas.height = pixelCrop.height;

  cropCtx.putImageData(
    data,
    Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
    Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y),
  );

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext("2d")!;
  outputCtx.drawImage(cropCanvas, 0, 0, outputWidth, outputHeight);

  return new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/jpeg",
      0.92,
    );
  });
}

export function ImageCropModal({
  imageSrc,
  onCropComplete,
  onCancel,
  aspect = 3 / 4,
  outputWidth = 600,
  outputHeight = 800,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = useCallback((c: Point) => setCrop(c), []);
  const onZoomChange = useCallback((z: number) => setZoom(z), []);

  const onCropAreaComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation, outputWidth, outputHeight);
      onCropComplete(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to process image";
      toast.error(msg);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg flex flex-col gap-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="text-lg font-serif font-semibold text-foreground">Crop Profile Photo</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Drag to reposition · Pinch or scroll to zoom</p>
        </div>

        <div className="relative w-full bg-black" style={{ height: 340 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropAreaComplete}
            cropShape="rect"
            showGrid={false}
            style={{
              containerStyle: { borderRadius: 0 },
              cropAreaStyle: { border: "2px solid rgba(255,255,255,0.7)" },
            }}
          />
        </div>

        <div className="px-5 py-4 space-y-4 border-b border-border">
          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider
              min={1}
              max={3}
              step={0.05}
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Rotation</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Rotate 90°
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? "Applying…" : "Apply Crop"}
          </Button>
        </div>
      </div>
    </div>
  );
}
