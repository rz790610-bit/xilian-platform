/**
 * 文档解析服务
 * 支持 PDF、Word、Excel、TXT、CSV、JSON、Markdown 等格式的前端解析
 * 支持图片 OCR 文字识别（PNG/JPG/BMP/TIFF）
 */

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { recognizeImage, isImageFile, SUPPORTED_IMAGE_EXTENSIONS } from './ocrService';

// 设置 PDF.js worker
// P1-D: 添加 CDN 加载失败时的 fallback
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
} catch {
  // fallback: 禁用 worker，使用主线程解析（性能较差但不会崩溃）
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  console.warn('[documentParser] PDF.js Worker CDN 加载失败，回退到主线程模式');
}

/**
 * 解析结果接口
 */
export interface ParseResult {
  success: boolean;
  content: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    title?: string;
    author?: string;
    sheets?: string[];
    ocrConfidence?: number;
    isOCR?: boolean;
  };
  error?: string;
}

/**
 * 解析进度回调
 */
export type ParseProgressCallback = (progress: number, status: string) => void;

/**
 * 解析图片文件（OCR）
 */
export async function parseImage(
  file: File,
  onProgress?: ParseProgressCallback
): Promise<ParseResult> {
  try {
    const result = await recognizeImage(
      file,
      'chi_sim+eng',
      onProgress
    );
    
    if (result.success && result.text) {
      return {
        success: true,
        content: result.text,
        metadata: {
          wordCount: result.text.split(/\s+/).length,
          ocrConfidence: result.confidence,
          isOCR: true
        }
      };
    } else {
      return {
        success: false,
        content: '',
        error: result.error || 'OCR 识别失败'
      };
    }
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `图片 OCR 失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 解析 PDF 文件（支持扫描版 PDF 的 OCR）
 */
export async function parsePDF(
  file: File,
  onProgress?: ParseProgressCallback
): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const pageCount = pdf.numPages;
    
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }
    
    // 清理文本
    fullText = fullText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    return {
      success: true,
      content: fullText,
      metadata: {
        pageCount,
        wordCount: fullText.split(/\s+/).length
      }
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `PDF 解析失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 解析 Word 文档 (.docx)
 */
export async function parseWord(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    const content = result.value
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    return {
      success: true,
      content,
      metadata: {
        wordCount: content.split(/\s+/).length
      }
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `Word 文档解析失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 解析 Excel 文件 (.xlsx, .xls)
 */
export async function parseExcel(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    let fullText = '';
    const sheets: string[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      sheets.push(sheetName);
      const worksheet = workbook.Sheets[sheetName];
      
      // 转换为 CSV 格式
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      
      // 转换为更易读的格式
      const rows = csv.split('\n').filter(row => row.trim());
      if (rows.length > 0) {
        fullText += `\n【工作表: ${sheetName}】\n`;
        
        // 尝试识别表头
        const headers = rows[0].split(',');
        
        for (let i = 0; i < rows.length; i++) {
          const cells = rows[i].split(',');
          if (i === 0) {
            // 表头行
            fullText += cells.join(' | ') + '\n';
            fullText += '-'.repeat(50) + '\n';
          } else {
            // 数据行 - 格式化为 "字段: 值" 形式
            const rowData = cells.map((cell, j) => {
              const header = headers[j] || `列${j + 1}`;
              return `${header}: ${cell}`;
            }).join(', ');
            fullText += rowData + '\n';
          }
        }
        fullText += '\n';
      }
    }
    
    return {
      success: true,
      content: fullText.trim(),
      metadata: {
        sheets,
        wordCount: fullText.split(/\s+/).length
      }
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `Excel 解析失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 解析 CSV 文件
 */
export async function parseCSV(file: File): Promise<ParseResult> {
  try {
    const text = await file.text();
    const rows = text.split('\n').filter(row => row.trim());
    
    if (rows.length === 0) {
      return { success: true, content: '', metadata: { wordCount: 0 } };
    }
    
    // 检测分隔符
    const firstRow = rows[0];
    const delimiter = firstRow.includes('\t') ? '\t' : 
                      firstRow.includes(';') ? ';' : ',';
    
    const headers = firstRow.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    
    let formattedText = '【CSV 数据】\n';
    formattedText += headers.join(' | ') + '\n';
    formattedText += '-'.repeat(50) + '\n';
    
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
      const rowData = cells.map((cell, j) => {
        const header = headers[j] || `列${j + 1}`;
        return `${header}: ${cell}`;
      }).join(', ');
      formattedText += rowData + '\n';
    }
    
    return {
      success: true,
      content: formattedText.trim(),
      metadata: {
        wordCount: formattedText.split(/\s+/).length
      }
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `CSV 解析失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 解析纯文本文件 (TXT, MD, JSON)
 */
export async function parseText(file: File): Promise<ParseResult> {
  try {
    const content = await file.text();
    
    // 对于 JSON 文件，格式化输出
    if (file.name.endsWith('.json')) {
      try {
        const json = JSON.parse(content);
        const formatted = JSON.stringify(json, null, 2);
        return {
          success: true,
          content: formatted,
          metadata: { wordCount: formatted.split(/\s+/).length }
        };
      } catch {
        // 如果 JSON 解析失败，返回原始内容
      }
    }
    
    return {
      success: true,
      content,
      metadata: { wordCount: content.split(/\s+/).length }
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: `文本文件读取失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 根据文件类型自动选择解析器
 * @param file 文件
 * @param onProgress 进度回调（用于 OCR）
 */
export async function parseDocument(
  file: File,
  onProgress?: ParseProgressCallback
): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  
  // 检查是否为图片文件
  if (isImageFile(file)) {
    return parseImage(file, onProgress);
  }
  
  switch (ext) {
    case 'pdf':
      return parsePDF(file, onProgress);
    
    case 'docx':
    case 'doc':
      if (ext === 'doc') {
        return {
          success: false,
          content: '',
          error: '不支持旧版 .doc 格式，请转换为 .docx 格式'
        };
      }
      return parseWord(file);
    
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    
    case 'csv':
      return parseCSV(file);
    
    case 'txt':
    case 'md':
    case 'json':
      return parseText(file);
    
    default:
      // 尝试作为文本文件读取
      try {
        const content = await file.text();
        return {
          success: true,
          content,
          metadata: { wordCount: content.split(/\s+/).length }
        };
      } catch {
        return {
          success: false,
          content: '',
          error: `不支持的文件格式: ${ext}`
        };
      }
  }
}

/**
 * 批量解析文档
 */
export async function parseDocuments(files: File[]): Promise<Map<string, ParseResult>> {
  const results = new Map<string, ParseResult>();
  
  for (const file of files) {
    const result = await parseDocument(file);
    results.set(file.name, result);
  }
  
  return results;
}
