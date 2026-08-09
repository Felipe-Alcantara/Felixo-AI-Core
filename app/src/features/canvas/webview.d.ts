// React/TS não conhecem o custom element <webview> do Electron. Import só de
// tipo, apagado na compilação — nunca puxa `electron` para o bundle do
// renderer.
//
// @types/react já declara `webview` em IntrinsicElements, então esta
// declaração faz *merge* com a dele: dá para acrescentar props, não para
// trocar o tipo das que já existem. É por isso que `allowpopups` (declarado
// lá como boolean) é setado por `ref` em WebpageNode, e não como atributo JSX.
import type { WebviewTag } from 'electron'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.ClassAttributes<WebviewTag> &
        React.WebViewHTMLAttributes<WebviewTag>
    }
  }
}

export {}
