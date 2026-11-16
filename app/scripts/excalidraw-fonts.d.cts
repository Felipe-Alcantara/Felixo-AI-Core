// Tipos de `excalidraw-fonts.cjs` para o `vite.config.ts`, o único consumidor
// TypeScript. O módulo continua CommonJS para o teste rodar no `node --test`.

export declare const EXCALIDRAW_ASSETS_DIR: string
export declare const EXCALIDRAW_FONTS_ROOT: string

export declare function listExcalidrawFonts(fontsRoot?: string): Array<{ fileName: string; absolutePath: string }>
export declare function resolveDevFontRequest(
  requestUrl: string | undefined,
  fontsRoot?: string,
  pathImpl?: typeof import('node:path'),
): string | null
export declare function stripExcalidrawCdnFallback(code: string): { code: string; removed: number }
