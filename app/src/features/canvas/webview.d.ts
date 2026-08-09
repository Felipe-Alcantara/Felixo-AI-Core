// React/TS don't know the Electron <webview> custom element out of the box.
// This only extends the JSX intrinsic elements — a type-only import, erased
// at compile time, so it never pulls `electron` into the renderer bundle.
import type { WebviewTag } from 'electron'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<WebviewTag>, WebviewTag> & {
        src?: string
        partition?: string
        allowpopups?: boolean
        webpreferences?: string
      }
    }
  }
}

export {}
