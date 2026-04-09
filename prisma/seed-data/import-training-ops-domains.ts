import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { importTrainingOpsDomains } from '../../lib/training-ops-domain-import'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const inputArg = process.argv.slice(2).find((arg) => arg.startsWith('--input='))
const inputPath = inputArg
    ? inputArg.slice('--input='.length)
    : 'prisma/seed-data/training-ops-product-domains.v1.json'

async function main() {
    const absoluteInputPath = resolve(process.cwd(), inputPath)
    const raw = await readFile(absoluteInputPath, 'utf8')
    const payload = JSON.parse(raw)

    console.log(`Product domain seed file: ${absoluteInputPath}`)
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)

    const summary = await importTrainingOpsDomains(payload, { apply })
    console.log(`Items: ${summary.totals.items}`)
    for (const item of summary.items) {
        console.log(
            [
                item.action.toUpperCase(),
                item.slug,
                `category=${item.category}`,
                `track=${item.track}`,
                `kpi=${item.kpiMode}`,
                `primary=${item.primarySmeEmail ?? 'n/a'}`,
                `backup=${item.backupSmeEmail ?? 'n/a'}`,
            ].join(' | ')
        )
    }

    if (!apply) {
        console.log('Dry run complete. Re-run with --apply to persist product domains.')
        return
    }

    console.log('Product domain import completed successfully.')
}

main().catch((error) => {
    console.error('Failed to import training-ops product domains:', error)
    process.exitCode = 1
})
