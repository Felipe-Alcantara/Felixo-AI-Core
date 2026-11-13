/**
 * Região viva das faixas da cadeia de um bloco, montada com o bloco e sempre
 * presente, invisível. As faixas visíveis não são `role="status"`: elas
 * nasciam já preenchidas, e o leitor de tela não anuncia uma região viva que
 * entra no DOM com o texto pronto. Aqui cada faixa entra como um parágrafo
 * novo (é anunciada), a que já estava não muda (não se repete) e a que sai
 * não é lida.
 */
export function TerminalChainAnnouncer({ banners }: { banners: ReadonlyArray<{ key: string; text: string }> }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {banners.map((banner) => (
        <p key={banner.key}>{banner.text}</p>
      ))}
    </div>
  )
}
