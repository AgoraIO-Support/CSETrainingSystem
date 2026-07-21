import { UserRole } from '@prisma/client'
import prisma from '@/lib/prisma'
import { DomainGovernanceService } from '@/lib/services/domain-governance.service'

const args = new Set(process.argv.slice(2))
const asJson = args.has('--json')
const failOnFindings = args.has('--fail-on-findings')

async function main() {
    const audit = await DomainGovernanceService.audit({
        id: 'system:domain-association-audit',
        role: UserRole.ADMIN,
    })

    const findings = audit.records.filter((record) =>
        record.resolution.status === 'CONFLICT' ||
        record.resolution.status === 'UNSCOPED' ||
        record.resolution.status === 'SUGGESTED'
    )

    if (asJson) {
        console.log(JSON.stringify({ generatedAt: new Date().toISOString(), ...audit, findings }, null, 2))
    } else {
        console.log(`Domain association audit: ${audit.records.length} objects`)
        console.log(`Findings: ${findings.length}`)
        console.log(JSON.stringify(audit.summary))
        for (const finding of findings) {
            console.log(`${finding.objectType} ${finding.id} ${finding.status} ${finding.resolution.status}: ${finding.title}`)
        }
    }

    if (failOnFindings && findings.length > 0) process.exitCode = 2
}

main()
    .catch((error) => {
        console.error('Domain association audit failed:', error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
