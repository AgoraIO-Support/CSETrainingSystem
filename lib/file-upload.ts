type FileLike = {
    name: string
    type?: string | null
}

const extensionContentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    zip: 'application/zip',
    gz: 'application/gzip',
    tgz: 'application/gzip',
    tar: 'application/x-tar',
    bz2: 'application/x-bzip2',
    '7z': 'application/x-7z-compressed',
    rar: 'application/vnd.rar',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    rtf: 'application/rtf',
    md: 'text/markdown',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    heic: 'image/heic',
    heif: 'image/heif',
}

export const resolveUploadedFileContentType = (file: FileLike) => {
    if (file.type) {
        return file.type
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    return extension ? extensionContentTypes[extension] ?? 'application/octet-stream' : 'application/octet-stream'
}
