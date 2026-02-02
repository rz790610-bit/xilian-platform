/**
 * OCR 文字识别服务
 * 使用 Tesseract.js 在浏览器端实现图片文字识别
 * 支持扫描版 PDF 和图片文件
 */

import Tesseract from 'tesseract.js';

/**
 * OCR 识别结果
 */
export interface OCRResult {
  success: boolean;
  text: string;
  confidence: number;
  language: string;
  error?: string;
}

/**
 * OCR 进度回调
 */
export type OCRProgressCallback = (progress: number, status: string) => void;

/**
 * 支持的图片格式
 */
export const SUPPORTED_IMAGE_FORMATS = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/bmp',
  'image/tiff',
  'image/webp',
  'image/gif'
];

/**
 * 支持的图片扩展名
 */
export const SUPPORTED_IMAGE_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp', '.gif'
];

/**
 * 检查文件是否为支持的图片格式
 */
export function isImageFile(file: File): boolean {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return SUPPORTED_IMAGE_FORMATS.includes(file.type) || 
         SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

/**
 * 对图片文件进行 OCR 识别
 * @param file 图片文件
 * @param language 识别语言，默认中英文
 * @param onProgress 进度回调
 */
export async function recognizeImage(
  file: File,
  language: string = 'chi_sim+eng',
  onProgress?: OCRProgressCallback
): Promise<OCRResult> {
  try {
    // 创建图片 URL
    const imageUrl = URL.createObjectURL(file);
    
    const result = await Tesseract.recognize(
      imageUrl,
      language,
      {
        logger: (m) => {
          if (onProgress && m.status) {
            const progress = m.progress || 0;
            let status = '准备中...';
            
            switch (m.status) {
              case 'loading tesseract core':
                status = '加载 OCR 引擎...';
                break;
              case 'initializing tesseract':
                status = '初始化...';
                break;
              case 'loading language traineddata':
                status = '加载语言包...';
                break;
              case 'initializing api':
                status = '初始化 API...';
                break;
              case 'recognizing text':
                status = `识别中... ${Math.round(progress * 100)}%`;
                break;
            }
            
            onProgress(progress, status);
          }
        }
      }
    );
    
    // 释放 URL
    URL.revokeObjectURL(imageUrl);
    
    return {
      success: true,
      text: result.data.text.trim(),
      confidence: result.data.confidence,
      language
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      confidence: 0,
      language,
      error: `OCR 识别失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 对图片 Blob 进行 OCR 识别
 * @param blob 图片 Blob
 * @param language 识别语言
 * @param onProgress 进度回调
 */
export async function recognizeBlob(
  blob: Blob,
  language: string = 'chi_sim+eng',
  onProgress?: OCRProgressCallback
): Promise<OCRResult> {
  try {
    const imageUrl = URL.createObjectURL(blob);
    
    const result = await Tesseract.recognize(
      imageUrl,
      language,
      {
        logger: (m) => {
          if (onProgress && m.status === 'recognizing text') {
            onProgress(m.progress || 0, `识别中... ${Math.round((m.progress || 0) * 100)}%`);
          }
        }
      }
    );
    
    URL.revokeObjectURL(imageUrl);
    
    return {
      success: true,
      text: result.data.text.trim(),
      confidence: result.data.confidence,
      language
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      confidence: 0,
      language,
      error: `OCR 识别失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 批量识别多张图片
 * @param files 图片文件数组
 * @param language 识别语言
 * @param onProgress 总体进度回调
 */
export async function recognizeMultipleImages(
  files: File[],
  language: string = 'chi_sim+eng',
  onProgress?: (current: number, total: number, text: string) => void
): Promise<string> {
  const results: string[] = [];
  
  for (let i = 0; i < files.length; i++) {
    if (onProgress) {
      onProgress(i + 1, files.length, `正在识别第 ${i + 1}/${files.length} 张图片...`);
    }
    
    const result = await recognizeImage(files[i], language);
    if (result.success && result.text) {
      results.push(`【第 ${i + 1} 页】\n${result.text}`);
    }
  }
  
  return results.join('\n\n');
}

/**
 * 获取可用的语言列表
 */
export const AVAILABLE_LANGUAGES = [
  { code: 'chi_sim', name: '简体中文' },
  { code: 'chi_tra', name: '繁体中文' },
  { code: 'eng', name: '英文' },
  { code: 'jpn', name: '日文' },
  { code: 'kor', name: '韩文' },
  { code: 'chi_sim+eng', name: '中英混合' },
  { code: 'chi_sim+jpn', name: '中日混合' }
];
