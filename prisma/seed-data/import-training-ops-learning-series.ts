import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { importTrainingOpsLearningSeries } from '../../lib/training-ops-series-import'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const inputArg = process.argv.slice(2).find((arg) => arg.startsWith('--input='))
const inputPath = inputArg
    ? inputArg.slice('--input='.length)
    : 'prisma/seed-data/training-ops-learning-series.v1.json'

async function main() {
    const absoluteInputPath = resolve(process.cwd(), inputPath)
    const raw = await readFile(absoluteInputPath, 'utf8')
    const payload = JSON.parse(raw)

    console.log(`Learning series seed file: ${absoluteInputPath}`)
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)

    const summary = await importTrainingOpsLearningSeries(payload, { apply })
    console.log(`Items: ${summary.totals.items}`)
    for (const item of summary.items) {
        console.log(
            [
                item.action.toUpperCase(),
                item.slug,
                `type=${item.type}`,
                `domain=${item.domainSlug ?? 'n/a'}`,
                `owner=${item.ownerEmail ?? 'n/a'}`,
            ].join(' | ')
        )
    }

    if (!apply) {
        console.log('Dry run complete. Re-run with --apply to persist learning series.')
        return
    }

    console.log('Learning series import completed successfully.')
}

main().catch((error) => {
    console.error('Failed to import training-ops learning series:', error)
    process.exitCode = 1
})
