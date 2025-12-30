import { NextResponse } from 'next/server'

export async function POST() {
    return NextResponse.json(
        {
            success: false,
            error: {
                code: 'AUTH_005',
                message: 'Registration is disabled. Please contact your administrator.',
            },
        },
        { status: 403 }
    )
}

