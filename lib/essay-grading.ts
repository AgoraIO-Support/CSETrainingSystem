export type EssayGradingCriterion = {
  id: string;
  title: string;
  description?: string | null;
  maxPoints: number;
  guidance?: string | null;
  required?: boolean;
};

export type EssayScoringStyle = 'concise' | 'standard' | 'detailed';

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

const ESSAY_SCORING_TEMPLATES: Record<
  EssayScoringStyle,
  Array<{
    id: string;
    title: string;
    weight: number;
    description: string;
    guidance: string;
    required?: boolean;
  }>
> = {
  concise: [
    {
      id: 'technical-accuracy',
      title: 'Technical accuracy',
      weight: 0.5,
      description: 'The answer is factually correct and aligned with the expected concepts.',
      guidance: 'Reward accurate terminology, correct technical claims, and valid RTC reasoning.',
      required: true,
    },
    {
      id: 'reasoning',
      title: 'Reasoning and approach',
      weight: 0.3,
      description: 'The answer uses a sensible reasoning path instead of isolated facts.',
      guidance: 'Reward answers that explain why steps or decisions make sense.',
      required: true,
    },
    {
      id: 'clarity',
      title: 'Clarity and structure',
      weight: 0.2,
      description: 'The answer is understandable and well organized.',
      guidance: 'Reward clear sequencing, readable structure, and concise communication.',
    },
  ],
  standard: [
    {
      id: 'problem-framing',
      title: 'Problem framing',
      weight: 0.2,
      description: 'The answer frames the scenario or question correctly.',
      guidance: 'Reward responses that identify the scope, expected symptoms, or core objective.',
      required: true,
    },
    {
      id: 'technical-accuracy',
      title: 'Technical accuracy',
      weight: 0.3,
      description: 'The response is technically correct.',
      guidance: 'Reward accurate claims, valid diagnostics, and correct use of RTC concepts.',
      required: true,
    },
    {
      id: 'completeness',
      title: 'Completeness',
      weight: 0.3,
      description: 'The answer covers the most important points, not just part of the solution.',
      guidance: 'Reward answers that address multiple key dimensions, checks, or examples.',
      required: true,
    },
    {
      id: 'clarity',
      title: 'Clarity and structure',
      weight: 0.2,
      description: 'The answer is clear, organized, and easy to review.',
      guidance: 'Reward step-by-step structure, readable wording, and concise presentation.',
    },
  ],
  detailed: [
    {
      id: 'problem-framing',
      title: 'Problem framing',
      weight: 0.15,
      description: 'Clearly identifies the scenario, scope, and objective.',
      guidance: 'Reward answers that correctly frame the issue before proposing solutions.',
      required: true,
    },
    {
      id: 'technical-accuracy',
      title: 'Technical accuracy',
      weight: 0.2,
      description: 'Uses technically valid concepts and recommendations.',
      guidance: 'Reward correct RTC terminology, valid checks, and sound conclusions.',
      required: true,
    },
    {
      id: 'diagnostic-sequence',
      title: 'Diagnostic sequence',
      weight: 0.2,
      description: 'Uses a sensible troubleshooting or reasoning order.',
      guidance: 'Reward answers that start with the most practical checks before deeper analysis.',
      required: true,
    },
    {
      id: 'completeness',
      title: 'Completeness',
      weight: 0.2,
      description: 'Covers the major expected dimensions of the answer.',
      guidance: 'Reward answers that address all key sub-points, not only one angle.',
      required: true,
    },
    {
      id: 'practical-application',
      title: 'Practical application',
      weight: 0.15,
      description: 'Shows practical judgment or useful examples.',
      guidance: 'Reward actionable troubleshooting logic, prioritization, or realistic examples.',
    },
    {
      id: 'clarity',
      title: 'Clarity and structure',
      weight: 0.1,
      description: 'The answer is well organized and easy to review.',
      guidance: 'Reward structure, readability, and concise communication.',
    },
  ],
};

const distributeCriterionPoints = (
  templates: Array<{ weight: number }>,
  maxPoints: number
) => {
  const safeMaxPoints = Math.max(1, Math.round(maxPoints));
  const totalWeight = templates.reduce((sum, template) => sum + template.weight, 0) || 1;
  const rawAllocations = templates.map((template) => (safeMaxPoints * template.weight) / totalWeight);
  const floored = rawAllocations.map((value) => Math.floor(value));
  let remaining = safeMaxPoints - floored.reduce((sum, value) => sum + value, 0);

  const remainders = rawAllocations
    .map((value, index) => ({
      index,
      remainder: value - floored[index],
    }))
    .sort((left, right) => right.remainder - left.remainder);

  for (const item of remainders) {
    if (remaining <= 0) break;
    floored[item.index] += 1;
    remaining -= 1;
  }

  return floored.map((value) => Math.max(1, value));
};

export function buildEssayGradingCriteria(input: {
  maxPoints: number;
  style?: EssayScoringStyle;
  question?: string | null;
  rubric?: string | null;
}): EssayGradingCriterion[] {
  const style = input.style ?? 'standard';
  const templates = ESSAY_SCORING_TEMPLATES[style];
  const points = distributeCriterionPoints(templates, input.maxPoints);
  const promptHint = input.question?.trim() || input.rubric?.trim() || null;

  return templates.map((template, index) => ({
    id: template.id,
    title: template.title,
    description: promptHint
      ? `${template.description} Apply this to the essay prompt: "${promptHint}".`
      : template.description,
    maxPoints: points[index],
    guidance: template.guidance,
    required: Boolean(template.required),
  }));
}

export function buildEssayRubricFromCriteria(criteria: EssayGradingCriterion[]): string {
  if (!criteria.length) {
    return 'Evaluate the response for technical accuracy, completeness, reasoning quality, and clarity.';
  }

  return criteria
    .map((criterion) => `${criterion.title} (${criterion.maxPoints} pts)${criterion.guidance ? `: ${criterion.guidance}` : ''}`)
    .join('\n');
}

export function buildEssaySampleAnswerGuidance(input: {
  question: string;
  rubric?: string | null;
  criteria: EssayGradingCriterion[];
}): string {
  const criteriaList = input.criteria.map((criterion) => criterion.title).join(', ');
  const rubricText = input.rubric?.trim();

  return [
    `A strong answer to "${input.question.trim()}" should directly address the prompt with clear reasoning and concrete RTC-relevant details.`,
    criteriaList
      ? `It should demonstrate: ${criteriaList}.`
      : 'It should demonstrate technical accuracy, completeness, and clear structure.',
    rubricText ? `Use this rubric guidance while grading: ${rubricText}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export function sumEssayGradingCriteriaPoints(criteria: EssayGradingCriterion[]): number {
  return criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
}
