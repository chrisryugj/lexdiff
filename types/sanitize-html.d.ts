declare module 'sanitize-html' {
  interface IOptions {
    allowedTags?: string[] | false
    allowedAttributes?: Record<string, string[]> | false
    allowedClasses?: Record<string, string[]>
    allowedStyles?: Record<string, Record<string, RegExp[]>>
    selfClosing?: string[]
    allowedSchemes?: string[]
    allowedSchemesByTag?: Record<string, string[]>
    allowedSchemesAppliedToAttributes?: string[]
    allowProtocolRelative?: boolean
    enforceHtmlBoundary?: boolean
    parseStyleAttributes?: boolean
    transformTags?: Record<string, string | ((tagName: string, attribs: Record<string, string>) => { tagName: string; attribs: Record<string, string> })>
    exclusiveFilter?: (frame: { tag: string; attribs: Record<string, string>; text: string; tagPosition: number }) => boolean
    nonTextTags?: string[]
    textFilter?: (text: string, tagName: string) => string
    allowedIframeHostnames?: string[]
    allowedIframeDomains?: string[]
    allowIframeRelativeUrls?: boolean
    allowVulnerableTags?: boolean
  }

  function sanitize(dirty: string, options?: IOptions): string

  namespace sanitize {
    const defaults: IOptions
    const simpleTransform: (tagName: string, attribs: Record<string, string>) => { tagName: string; attribs: Record<string, string> }
  }

  export = sanitize
}
