import { readFile } from 'fs/promises'
import path from 'path'
import mammoth from 'mammoth'
import WordExtractor from 'word-extractor'

export interface ExtractedFileText {
  success: boolean
  text?: string
  mimeType?: string
  filename?: string
  error?: string
  extractionMethod?: 'utf8' | 'mammoth' | 'word-extractor'
}

function looksLikeTextMime(mimeType: string) {
  if (mimeType.startsWith('text/')) return true
  // Check for text/x- type mime types (python, java, c, go, rust, etc.)
  if (mimeType.startsWith('text/x-')) return true
  // Check for application types that are actually text
  return mimeType === 'application/javascript'
    || mimeType === 'application/typescript'
    || mimeType === 'application/json'
    || mimeType === 'application/xml'
    || mimeType.includes('json')
    || mimeType.includes('xml')
    || mimeType.includes('javascript')
    || mimeType.includes('typescript')
    || mimeType.includes('markdown')
}

function sampleLooksBinary(buffer: Buffer) {
  const sampleSize = Math.min(buffer.length, 2048)
  if (sampleSize === 0) return false

  let nulCount = 0
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) nulCount++
  }

  return nulCount / sampleSize > 0.02
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractDocxText(filePath: string) {
  const result = await mammoth.extractRawText({ path: filePath })
  const text = normalizeExtractedText(result.value || '')
  if (!text) {
    throw new Error('empty_docx_text')
  }

  return text
}

async function extractLegacyWordText(filePath: string) {
  const extractor = new WordExtractor()
  const document = await extractor.extract(filePath)
  const text = normalizeExtractedText(document.getBody())
  if (!text) {
    throw new Error('empty_doc_text')
  }

  return text
}

export async function extractFileText(input: {
  filePath: string
  filename: string
  mimeType: string
}): Promise<ExtractedFileText> {
  const ext = path.extname(input.filename).toLowerCase()

  try {
    const buffer = await readFile(input.filePath)

    if (looksLikeTextMime(input.mimeType) && !sampleLooksBinary(buffer)) {
      return {
        success: true,
        text: normalizeExtractedText(buffer.toString('utf-8')),
        mimeType: input.mimeType,
        filename: input.filename,
        extractionMethod: 'utf8',
      }
    }

    if (ext === '.docx') {
      try {
        return {
          success: true,
          text: await extractDocxText(input.filePath),
          mimeType: input.mimeType,
          filename: input.filename,
          extractionMethod: 'mammoth',
        }
      } catch (error) {
        return {
          success: false,
          mimeType: input.mimeType,
          filename: input.filename,
          error: 'docx_extraction_failed:' + (error instanceof Error ? error.message : 'unknown'),
        }
      }
    }

    if (ext === '.doc' || input.mimeType.includes('msword')) {
      try {
        return {
          success: true,
          text: await extractLegacyWordText(input.filePath),
          mimeType: input.mimeType,
          filename: input.filename,
          extractionMethod: 'word-extractor',
        }
      } catch (error) {
        return {
          success: false,
          mimeType: input.mimeType,
          filename: input.filename,
          error: 'doc_extraction_failed:' + (error instanceof Error ? error.message : 'unknown'),
        }
      }
    }

    return {
      success: false,
      mimeType: input.mimeType,
      filename: input.filename,
      error: 'unsupported_binary_document',
    }
  } catch (error) {
    return {
      success: false,
      mimeType: input.mimeType,
      filename: input.filename,
      error: 'read_failed:' + (error instanceof Error ? error.message : 'unknown'),
    }
  }
}
