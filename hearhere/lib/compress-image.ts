/**
 * 客户端图片压缩 — 上传 API 前的必经之路。
 *
 * 背景：Vercel Serverless 单次请求体上限 4.5MB，
 * 手机截图动辄 3-8MB，不压缩直接传会 413 崩溃。
 * 目标：等比缩放到最长边 ≤ 1024px，JPEG quality 0.8，
 * 单张控制在 ~250-400KB，5 张总 payload < 1.5MB。
 */

const MAX_DIMENSION = 800; // 兼顾 OCR 准确率与模型处理速度
const JPEG_QUALITY = 0.8;

export interface CompressedImage {
  blob: Blob;        // 压缩后的 JPEG Blob，可直接 append 到 FormData
  previewUrl: string; // 本地预览 URL（URL.createObjectURL）
  originalSize: number;
  compressedSize: number;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const originalSize = file.size;

  // 读图
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // 等比缩放：最长边 ≤ MAX_DIMENSION
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  // Canvas 重绘
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 Canvas，无法压缩图片");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  // 导出 JPEG Blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("图片压缩失败"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });

  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    originalSize,
    compressedSize: blob.size,
  };
}

/** 释放预览 URL，避免内存泄漏 */
export function revokePreview(img: CompressedImage): void {
  URL.revokeObjectURL(img.previewUrl);
}

/** Blob → base64 data URL（用于 Zustand 暂存截图，路径C） */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}
