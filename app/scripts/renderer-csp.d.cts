// Tipos de `renderer-csp.cjs` para o `vite.config.ts`, o único consumidor
// TypeScript. O módulo continua CommonJS para o teste rodar no `node --test`
// junto com os outros scripts, sem passar pelo vitest.

export declare const RENDERER_CSP_DIRECTIVES: ReadonlyArray<readonly [string, readonly string[]]>

export declare function extractInlineScripts(html: string): string[]
export declare function hashInlineScript(scriptText: string): string
export declare function hashInlineScripts(html: string): string[]
export declare function buildRendererCsp(html: string): { policy: string; scriptHashes: string[] }
export declare function injectRendererCsp(html: string): string
export declare function verifyRendererCsp(html: string): string[]
