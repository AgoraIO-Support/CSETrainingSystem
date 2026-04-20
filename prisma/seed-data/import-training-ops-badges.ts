import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { importTrainingOpsBadgeMilestones } from '../../lib/training-ops-badge-import'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const inputArg = process.argv.slice(2).find((arg) => arg.startsWith('--input='))
const inputPath = inputArg
    ? inputArg.slice('--input='.length)
    : 'prisma/seed-data/training-ops-badge-milestones.v1.json'

async function main() {
    const absoluteInputPath = resolve(process.cwd(), inputPath)
    const raw = await readFile(absoluteInputPath, 'utf8')
    const payload = JSON.parse(raw)

    console.log(`Badge seed file: ${absoluteInputPath}`)
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
    const summary = await importTrainingOpsBadgeMilestones(payload, { apply })
    console.log(`Items: ${summary.totals.items}`)
    for (const item of summary.items) {
        console.log(
            [
                item.action.toUpperCase(),
                item.slug,
                `scope=${item.scope}`,
                `domain=${item.domainSlug ?? 'n/a'}`,
                `stars=${item.thresholdStars}`,
            ].join(' | ')
        )
    }

    if (!apply) {
        console.log('Dry run complete. Re-run with --apply to persist badge milestones.')
        return
    }

    console.log('Badge milestone import completed successfully.')
}

main()
    .catch((error) => {
        console.error('Failed to import training-ops badge milestones:', error)
        process.exitCode = 1
    })
