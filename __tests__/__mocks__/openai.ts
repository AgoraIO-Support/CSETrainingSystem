/**
 * OpenAI API Mock
 * Provides deterministic responses for testing without actual API calls
 */

export interface MockOpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
  model: string;
}

export interface MockOpenAIOptions {
  simulateCacheHit?: boolean;
  simulateTimeout?: boolean;
  simulateError?: boolean;
  errorMessage?: string;
  latencyMs?: number;
  cachedTokens?: number;
}

// Track request history for assertions
export const requestHistory: Array<{
  timestamp: number;
  messages: any[];
  promptLength: number;
}> = [];

// Default mock responses for different scenarios
export const MOCK_RESPONSES = {
  // Standard enrichment response for VTT processing
  enrichment: [
    {
      title: 'Introduction to API Design',
      concepts: ['REST', 'HTTP Methods', 'API'],
      isKeyMoment: true,
      anchorType: 'CONCEPT',
      summary: 'Overview of RESTful API design principles',
    },
    {
      title: 'HTTP Methods Explained',
      concepts: ['GET', 'POST', 'PUT', 'DELETE'],
      isKeyMoment: true,
      anchorType: 'CONCEPT',
      summary: 'Explanation of standard HTTP methods',
    },
    {
      title: 'Resource Representation',
      concepts: ['JSON', 'XML', 'Data Formats'],
      isKeyMoment: false,
    },
  ],

  // AI chat response with timestamp references
  chatWithTimestamps: {
    answer:
      'RESTful APIs use standard HTTP methods for operations. GET is used for retrieving resources [Click to jump to video 00:00:20 for details], while POST is used for creating new resources [Click to jump to video 00:00:25 for details]. The key principle is that each HTTP method has a specific purpose in the API design.',
    suggestions: [
      'What is the difference between PUT and PATCH?',
      'How do you handle authentication in REST APIs?',
      'Can you explain status codes?',
    ],
  },

  // Response for out-of-scope questions
  outOfScope: {
    answer:
      "I don't have information about that topic in the current course materials. The lesson covers API design principles, HTTP methods, and RESTful architecture. Is there something specific about these topics I can help you with?",
    suggestions: [
      'What topics are covered in this lesson?',
      'Can you explain REST principles?',
      'What are HTTP methods?',
    ],
  },

  // Cross-section synthesis response
  crossSection: {
    answer:
      'Looking at the full lesson content, API design involves multiple interconnected concepts. First, you need to understand REST principles [Click to jump to video 00:00:10 for details]. Then, the proper use of HTTP methods [Click to jump to video 00:00:20 for details]. Finally, resource representation formats [Click to jump to video 00:01:30 for details] tie everything together.',
    suggestions: [
      'How do these concepts work together in practice?',
      'Can you give a real-world example?',
    ],
  },
};

/**
 * Create a mock fetch function for OpenAI API
 */
export function createOpenAIMock(options: MockOpenAIOptions = {}) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const {
      simulateCacheHit = false,
      simulateTimeout = false,
      simulateError = false,
      errorMessage = 'Internal Server Error',
      latencyMs = simulateCacheHit ? 50 : 200, // Cache hits are faster
      cachedTokens = simulateCacheHit ? 5000 : 0,
    } = options;

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    // Track request for assertions
    if (init?.body) {
      const body = JSON.parse(init.body as string);
      const systemMessage = Array.isArray(body.messages)
        ? body.messages.find((m: any) => m?.role === 'system')
        : null;
      // For caching-related tests, we care about the stability of the static prefix
      // (i.e., the system prompt / XML), not the growth of conversation history.
      const promptLength =
        typeof systemMessage?.content === 'string'
          ? systemMessage.content.length
          : JSON.stringify(body.messages).length;
      requestHistory.push({
        timestamp: Date.now(),
        messages: body.messages,
        promptLength,
      });
    }

    // Simulate timeout
    if (simulateTimeout) {
      throw new Error('Request timeout');
    }

    // Simulate error
    if (simulateError) {
      return new Response(JSON.stringify({ error: { message: errorMessage } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determine response based on request content
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const messages = body.messages || [];
    const lastUserMessage = messages.find((m: any) => m.role === 'user')?.content || '';

    let responseContent: any;

    // Check if this is an enrichment request (for VTT processing)
    if (messages.some((m: any) => m.content?.includes('educational content analyzer'))) {
      responseContent = JSON.stringify(MOCK_RESPONSES.enrichment);
    }
    // Check for out-of-scope questions
    else if (
      lastUserMessage.toLowerCase().includes('weather') ||
      lastUserMessage.toLowerCase().includes('stock market')
    ) {
      responseContent = JSON.stringify(MOCK_RESPONSES.outOfScope);
    }
    // Check for synthesis questions
    else if (
      lastUserMessage.toLowerCase().includes('overview') ||
      lastUserMessage.toLowerCase().includes('summarize')
    ) {
      responseContent = JSON.stringify(MOCK_RESPONSES.crossSection);
    }
    // Default chat response
    else {
      responseContent = JSON.stringify(MOCK_RESPONSES.chatWithTimestamps);
    }

    const mockResponse: MockOpenAIResponse = {
      choices: [{ message: { content: responseContent } }],
      usage: {
        prompt_tokens: 5000 + Math.floor(Math.random() * 1000),
        completion_tokens: 200 + Math.floor(Math.random() * 100),
        total_tokens: 5200 + Math.floor(Math.random() * 1100),
        prompt_tokens_details: {
          cached_tokens: cachedTokens,
        },
      },
      model: body.model || 'gpt-4o-mini',
    };

    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

/**
 * Clear request history between tests
 */
export function clearRequestHistory() {
  requestHistory.length = 0;
}

/**
 * Get the last request made
 */
export function getLastRequest() {
  return requestHistory[requestHistory.length - 1];
}

/**
 * Assert that XML appears first in the prompt
 */
export function assertXMLFirst(request: (typeof requestHistory)[0]): boolean {
  const systemMessage = request.messages.find((m: any) => m.role === 'system');
  if (!systemMessage) return false;

  const content = systemMessage.content;
  // XML should start with <?xml or <knowledge_base
  return content.startsWith('<?xml') || content.startsWith('<knowledge_base');
}

/**
 * Calculate latency between two requests
 */
export function calculateLatencyDelta(
  firstIndex: number,
  secondIndex: number
): number {
  if (firstIndex >= requestHistory.length || secondIndex >= requestHistory.length) {
    throw new Error('Request index out of bounds');
  }
  return requestHistory[secondIndex].timestamp - requestHistory[firstIndex].timestamp;
}
