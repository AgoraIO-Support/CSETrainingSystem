import { redirect } from 'next/navigation'

export default async function LegacySmeEditProgramPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    redirect(`/sme/training-ops/series/${id}#settings`)
}
