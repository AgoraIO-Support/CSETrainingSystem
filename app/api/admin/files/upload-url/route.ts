import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { FileService } from '@/lib/services/file.service'

export const POST = withAdminAuth(async (req: NextRequest) => {
    try {
        const body = await req.json()
        const { filename, contentType, assetType } = body

        if (!filename || !contentType) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'filename and contentType are required',
                    },
                },
                { status: 400 }
            )
        }

        const upload = await FileService.generateAssetUploadUrl({
            filename,
            contentType,
            assetType,
        })

        return NextResponse.json({
            success: true,
            data: upload,
        })
    } catch (error) {
        console.error('Generate upload URL error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to generate upload URL',
                },
            },
            { status: 500 }
        )
    }
})
