declare module 'mammoth' {
  const mammoth: {
    extractRawText(input: { path: string } | { buffer: Buffer }): Promise<{ value: string; messages: Array<{ type: string; message: string }> }>
  }
  export default mammoth
}

declare module 'word-extractor' {
  interface WordDocument {
    getBody(): string
  }

  export default class WordExtractor {
    extract(source: string | Buffer): Promise<WordDocument>
  }
}
