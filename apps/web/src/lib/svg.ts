/**
 * A drawing as an image source. The SVG is only ever shown through <img src="data:...">, never put
 * into the page as markup, so nothing inside a drawing can run (SR-007, AC-056).
 */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
