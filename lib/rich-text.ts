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
])

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

const isSafeHref = (href: string) => /^(https?:|mailto:)/i.test(href)

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
