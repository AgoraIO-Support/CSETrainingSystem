const ALLOWED_TAGS = new Set([
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'a',
    'code',
    'pre',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'div',
    'img',
])

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

const escapeHtmlAttribute = (value: string) => escapeHtml(value)

const isSafeHref = (href: string) => /^(https?:|mailto:|\/)/i.test(href)
const isSafeImageSrc = (src: string) => /^(https?:|\/)/i.test(src)

const unwrapNode = (source: HTMLElement, targetDocument: Document) => {
    const fragment = targetDocument.createDocumentFragment()
    Array.from(source.childNodes).forEach((child) => {
        const sanitizedChild = sanitizeNode(child, targetDocument)
        if (sanitizedChild) {
            fragment.appendChild(sanitizedChild)
        }
    })
    return fragment
}

const sanitizeNode = (node: Node, targetDocument: Document): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
        return targetDocument.createTextNode(node.textContent ?? '')
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null
    }

    const element = node as HTMLElement
    const tagName = element.tagName.toLowerCase()

    if (!ALLOWED_TAGS.has(tagName)) {
        return unwrapNode(element, targetDocument)
    }

    const cleanElement = targetDocument.createElement(tagName)

    if (tagName === 'a') {
        const href = element.getAttribute('href')?.trim() ?? ''
        if (href && isSafeHref(href)) {
            cleanElement.setAttribute('href', href)
            cleanElement.setAttribute('target', '_blank')
            cleanElement.setAttribute('rel', 'noreferrer noopener')
        }
        const assetKey = element.getAttribute('data-asset-key')?.trim()
        if (assetKey) {
            cleanElement.setAttribute('data-asset-key', assetKey)
        }
    }

    if (tagName === 'img') {
        const src = element.getAttribute('src')?.trim() ?? ''
        if (src && isSafeImageSrc(src)) {
            cleanElement.setAttribute('src', src)
        }
        const alt = element.getAttribute('alt')?.trim()
        if (alt) {
            cleanElement.setAttribute('alt', alt)
        }
        const assetKey = element.getAttribute('data-asset-key')?.trim()
        if (assetKey) {
            cleanElement.setAttribute('data-asset-key', assetKey)
        }
    }

    Array.from(element.childNodes).forEach((child) => {
        const sanitizedChild = sanitizeNode(child, targetDocument)
        if (sanitizedChild) {
            cleanElement.appendChild(sanitizedChild)
        }
    })

    return cleanElement
}

export const sanitizeRichTextHtml = (value: string) => {
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return escapeHtml(value).replace(/\n/g, '<br />')
    }

    const parser = new DOMParser()
    const parsed = parser.parseFromString(value, 'text/html')
    const cleanDocument = document.implementation.createHTMLDocument('sanitized-rich-text')
    const container = cleanDocument.createElement('div')

    Array.from(parsed.body.childNodes).forEach((child) => {
        const sanitizedChild = sanitizeNode(child, cleanDocument)
        if (sanitizedChild) {
            container.appendChild(sanitizedChild)
        }
    })

    return container.innerHTML.trim()
}

export const stripRichTextToPlainText = (value: string) =>
    value
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()

const replaceTagAttribute = (tag: string, attribute: 'href' | 'src', nextValue: string) => {
    const escapedValue = escapeHtmlAttribute(nextValue)
    const attributePattern = new RegExp(`${attribute}\\s*=\\s*(['"]).*?\\1`, 'i')
    if (attributePattern.test(tag)) {
        return tag.replace(attributePattern, `${attribute}="${escapedValue}"`)
    }

    const closing = tag.endsWith('/>') ? '/>' : '>'
    return `${tag.slice(0, -closing.length)} ${attribute}="${escapedValue}"${closing}`
}

export const resolveRichTextAssetUrls = async (
    value: string | null | undefined,
    resolveAssetUrl: (key: string) => Promise<string>
) => {
    if (!value) return value

    const assetKeys = Array.from(value.matchAll(/data-asset-key\s*=\s*(['"])(.*?)\1/gi))
        .map((match) => match[2]?.trim())
        .filter((key): key is string => Boolean(key))

    if (assetKeys.length === 0) {
        return value
    }

    const uniqueAssetKeys = Array.from(new Set(assetKeys))
    const resolvedEntries = await Promise.all(
        uniqueAssetKeys.map(async (key) => [key, await resolveAssetUrl(key)] as const)
    )
    const resolvedMap = new Map(resolvedEntries)

    return value.replace(/<(a|img)\b[^>]*data-asset-key\s*=\s*(['"])(.*?)\2[^>]*>/gi, (tag, tagName, _quote, key) => {
        const resolvedUrl = resolvedMap.get(String(key).trim())
        if (!resolvedUrl) return tag
        return String(tagName).toLowerCase() === 'img'
            ? replaceTagAttribute(tag, 'src', resolvedUrl)
            : replaceTagAttribute(tag, 'href', resolvedUrl)
    })
}
