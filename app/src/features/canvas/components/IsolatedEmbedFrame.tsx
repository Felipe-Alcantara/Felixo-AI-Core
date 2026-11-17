import { ISOLATED_EMBED_SANDBOX } from '../services/excalidraw-embeds'

/** Frame dos embeds com script de terceiro: outra origem e sandbox sem `allow-same-origin`. */
export function IsolatedEmbedFrame({ src }: { src: string }) {
  return (
    <iframe
      className="excalidraw__embeddable"
      src={src}
      scrolling="no"
      referrerPolicy="no-referrer-when-downgrade"
      title="Excalidraw Embedded Content"
      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
      allowFullScreen
      sandbox={ISOLATED_EMBED_SANDBOX}
    />
  )
}
