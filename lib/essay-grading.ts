export type EssayGradingCriterion = {
  id: string;
  title: string;
  description?: string | null;
  maxPoints: number;
  guidance?: string | null;
  required?: boolean;
};

export type EssayAIGradingCriterionResult = {
  criterionId: string;
  criterionTitle?: string | null;
  suggestedPoints: number;
  reasoning: string;
  evidence?: string | null;
  met?: boolean | null;
};

export type EssayAIGradingBreakdown = {
  criteria: EssayAIGradingCriterionResult[];
  overallFeedback?: string | null;
  rubricEvaluation?: string | null;
  confidence?: number | null;
  flags?: string[];
};

export function parseEssayGradingCriteria(value: unknown): EssayGradingCriterion[] {
  if (!Array.isArray(value)) return [];

  const criteria: EssayGradingCriterion[] = [];
  for (const criterion of value) {
    if (!criterion || typeof criterion !== 'object') continue;
    const record = criterion as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : '';
    const maxPoints = Number(record.maxPoints);
    if (!title || !Number.isFinite(maxPoints) || maxPoints <= 0) continue;

    criteria.push({
      id: id || slugifyCriterionTitle(title),
      title,
      description:
        typeof record.description === 'string' && record.description.trim()
          ? record.description.trim()
          : null,
      maxPoints,
      guidance:
        typeof record.guidance === 'string' && record.guidance.trim()
          ? record.guidance.trim()
          : null,
      required: Boolean(record.required),
    });
  }

  return criteria;
}

export function parseEssayAIGradingBreakdown(value: unknown): EssayAIGradingBreakdown | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const criteria: EssayAIGradingCriterionResult[] = [];
  if (Array.isArray(record.criteria)) {
    for (const item of record.criteria) {
      if (!item || typeof item !== 'object') continue;
      const criterion = item as Record<string, unknown>;
      const criterionId =
        typeof criterion.criterionId === 'string' && criterion.criterionId.trim()
          ? criterion.criterionId.trim()
          : '';
      if (!criterionId) continue;
      const suggestedPoints = Number(criterion.suggestedPoints);
      criteria.push({
        criterionId,
        criterionTitle:
          typeof criterion.criterionTitle === 'string' && criterion.criterionTitle.trim()
            ? criterion.criterionTitle.trim()
            : null,
        suggestedPoints: Number.isFinite(suggestedPoints) ? suggestedPoints : 0,
        reasoning:
          typeof criterion.reasoning === 'string' && criterion.reasoning.trim()
            ? criterion.reasoning.trim()
            : '',
        evidence:
          typeof criterion.evidence === 'string' && criterion.evidence.trim()
            ? criterion.evidence.trim()
            : null,
        met:
          typeof criterion.met === 'boolean'
            ? criterion.met
            : null,
      });
    }
  }

  return {
    criteria,
    overallFeedback:
      typeof record.overallFeedback === 'string' && record.overallFeedback.trim()
        ? record.overallFeedback.trim()
        : null,
    rubricEvaluation:
      typeof record.rubricEvaluation === 'string' && record.rubricEvaluation.trim()
        ? record.rubricEvaluation.trim()
        : null,
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    flags: Array.isArray(record.flags)
      ? record.flags.filter((flag): flag is string => typeof flag === 'string' && flag.trim().length > 0)
      : [],
  };
}

export function formatEssayGradingCriteriaForPrompt(criteria: EssayGradingCriterion[]): string {
  if (!criteria.length) return 'No structured grading criteria provided.';

  return criteria
    .map((criterion, index) => {
      const lines = [
        `${index + 1}. ${criterion.title} (${criterion.maxPoints} pts${criterion.required ? ', required' : ''})`,
      ];
      if (criterion.description) lines.push(`Description: ${criterion.description}`);
      if (criterion.guidance) lines.push(`Guidance: ${criterion.guidance}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function slugifyCriterionTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'criterion';
}
