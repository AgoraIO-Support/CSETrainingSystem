const nextJest = require('next/jest')

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.(ts|tsx)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  watchman: false,
  moduleNameMapper: {
    '^@aws-sdk/client-s3$': '<rootDir>/__tests__/__mocks__/aws-sdk-client-s3.ts',
    '^@/lib/aws-s3$': '<rootDir>/__tests__/__mocks__/aws-s3.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
}

module.exports = createJestConfig(customJestConfig)
