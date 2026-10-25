/** Explicit adapter for legacy image-service identities in the pinned demo sources. */
export function demoPreviewUri(resourceUri: string): string | undefined {
    const match = /^https:\/\/iiif\.acdh\.oeaw\.ac\.at\/amp\/(amp_\d{4})\/?$/.exec(resourceUri);
    if (!match) return undefined;
    return `https://iiif.acdh.oeaw.ac.at/iiif/images/amp/${match[1]}.jp2/full/!1000,1000/0/default.jpg`;
}
