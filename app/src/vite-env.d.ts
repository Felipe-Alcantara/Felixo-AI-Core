/// <reference types="vite/client" />

interface Window {
  felixo?: {
    platform: string
    versions: {
      chrome?: string
      electron?: string
      node?: string
    }
  }
}
