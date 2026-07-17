export interface LearnerProgressFilterable {
    userId: string
    name: string
    email: string
    courses: Array<{ title: string }>
}

export const filterLearnerProgress = <T extends LearnerProgressFilterable>(
    learners: T[],
    options: { query: string; userId: string }
) => {
    const query = options.query.trim().toLowerCase()

    return learners.filter((learner) => {
        if (options.userId !== 'all' && learner.userId !== options.userId) return false
        if (!query) return true

        return learner.name.toLowerCase().includes(query) ||
            learner.email.toLowerCase().includes(query) ||
            learner.courses.some((course) => course.title.toLowerCase().includes(query))
    })
}

export const paginateLearnerProgress = <T>(items: T[], requestedPage: number, pageSize: number) => {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
    const page = Math.min(Math.max(1, requestedPage), totalPages)
    const startIndex = (page - 1) * pageSize

    return {
        items: items.slice(startIndex, startIndex + pageSize),
        page,
        pageSize,
        totalItems: items.length,
        totalPages,
        startItem: items.length === 0 ? 0 : startIndex + 1,
        endItem: Math.min(startIndex + pageSize, items.length),
    }
}
