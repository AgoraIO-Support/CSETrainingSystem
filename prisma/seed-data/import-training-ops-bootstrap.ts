import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { importTrainingOpsBootstrap } from '../../lib/training-ops-bootstrap-import'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const inputArg = process.argv.slice(2).find((arg) => arg.startsWith('--input='))
const inputPath = inputArg
    ? inputArg.slice('--input='.length)
    : 'prisma/seed-data/training-ops-bootstrap.v1.json'

async function main() {
    const absoluteInputPath = resolve(process.cwd(), inputPath)
    const raw = await readFile(absoluteInputPath, 'utf8')
    const payload = JSON.parse(raw)

    console.log(`Training ops bootstrap seed file: ${absoluteInputPath}`)
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)

    const summary = await importTrainingOpsBootstrap(payload, { apply })
    console.log(`Sections: ${summary.totals.sections}`)
    console.log(`Items: ${summary.totals.items}`)
    console.log(`Processed: ${summary.totals.processed}`)
    console.log(`Domains: ${summary.domains.totals.processed}/${summary.domains.totals.items}`)
    console.log(`Series: ${summary.series.totals.processed}/${summary.series.totals.items}`)
    console.log(`Badges: ${summary.badges.totals.processed}/${summary.badges.totals.items}`)

    if (!apply) {
        console.log('Dry run complete. Re-run with --apply to persist domains, series, and badges.')
        return
    }

    console.log('Training ops bootstrap import completed successfully.')
}

main().catch((error) => {
    console.error('Failed to import training-ops bootstrap data:', error)
    process.exitCode = 1
})
