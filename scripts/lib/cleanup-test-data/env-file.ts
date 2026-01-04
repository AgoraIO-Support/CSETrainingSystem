import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

export function loadEnvFile(inputPath: string): { envFilePath: string; env: Record<string, string> } {
  const envFilePath = path.resolve(process.cwd(), inputPath)
  if (!fs.existsSync(envFilePath)) {
    throw new Error(`Env file not found: ${envFilePath}`)
  }
  const contents = fs.readFileSync(envFilePath, 'utf8')
  const parsed = dotenv.parse(contents)
  return { envFilePath, env: parsed }
}

