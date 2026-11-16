// Tipos de `build-output.cjs` para o `vite.config.ts`, o único consumidor
// TypeScript. O módulo continua CommonJS para o teste rodar no `node --test`.

export declare function removeTreeSync(target: string): void
export declare function listFiles(dir: string): string[]
export declare function findStaleOutputFiles(options: { outDir: string; emitted: Iterable<string>; publicDir?: string }): string[]
export declare function removeStaleOutput(options: { outDir: string; emitted: Iterable<string>; publicDir?: string }): string[]
