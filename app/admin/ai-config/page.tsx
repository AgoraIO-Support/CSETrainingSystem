'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Sparkles, Brain, Settings2, ShieldCheck, AlertTriangle, Download } from 'lucide-react'

const MOCK_MODELS = [
    { name: 'gpt-4o-mini', latency: '520ms', cost: '$0.001 / call', usage: 62 },
    { name: 'claude-opus', latency: '610ms', cost: '$0.0013 / call', usage: 25 },
    { name: 'vertex-palm-2', latency: '440ms', cost: '$0.0009 / call', usage: 13 },
]

const MOCK_PROMPTS = [
    {
        id: 'template-1',
        name: 'Lesson summarizer',
        variables: ['lessonTitle', 'keyPoints'],
        updatedAt: '2025-11-05',
        status: 'Active',
    },
    {
        id: 'template-2',
        name: 'Quiz explanation helper',
        variables: ['question', 'userAnswer', 'correctAnswer'],
        updatedAt: '2025-11-18',
        status: 'Active',
    },
    {
        id: 'template-3',
        name: 'Course recommendation adviser',
        variables: ['skillLevel', 'topics'],
        updatedAt: '2025-09-12',
        status: 'Draft',
    },
]

const MOCK_SAFEGUARDS = [
    { name: 'Toxicity filter', status: 'Enabled', description: 'Blocks harassing or hateful responses.' },
    { name: 'Personally identifiable info', status: 'Enabled', description: 'Masks PII before sending to the model.' },
    { name: 'Citation requirement', status: 'Monitor', description: 'Warns when an answer lacks references.' },
]

export default function AdminAIConfigPage() {
    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">AI Configuration</h1>
                        <p className="text-muted-foreground mt-1">Control models, prompts, and guardrails used in the training assistant.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline">Export Settings</Button>
                        <Button>Deploy Changes</Button>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Active models" value="3" helper="Across US & EU regions" icon={Brain} />
                    <StatCard title="Prompt templates" value="12" helper="8 active, 4 draft" icon={Sparkles} />
                    <StatCard title="Safeguards" value="5" helper="3 blocking, 2 monitor" icon={ShieldCheck} />
                    <StatCard title="Avg. satisfaction" value="92%" helper="Last 30 days" icon={Settings2} />
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Realtime Status</CardTitle>
                        <CardDescription>Toggle AI availability for staff and learners.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <StatusToggle
                            title="Staff Workspace"
                            description="Used for exam generation & content QA."
                            enabled
                        />
                        <StatusToggle
                            title="Learner Assistant"
                            description="Enables in-lesson AI chat for students."
                            enabled
                        />
                    </CardContent>
                </Card>

                <Tabs defaultValue="models" className="w-full">
                    <TabsList>
                        <TabsTrigger value="models">Models</TabsTrigger>
                        <TabsTrigger value="prompts">Prompts</TabsTrigger>
                        <TabsTrigger value="guardrails">Guardrails</TabsTrigger>
                    </TabsList>

                    <TabsContent value="models" className="mt-6">
                        <div className="rounded-lg border overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-muted-foreground border-b">
                                        <th className="py-3 px-4 font-medium">Model</th>
                                        <th className="py-3 px-4 font-medium">Latency</th>
                                        <th className="py-3 px-4 font-medium">Cost</th>
                                        <th className="py-3 px-4 font-medium">Traffic Share</th>
                                        <th className="py-3 px-4 font-medium text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {MOCK_MODELS.map(model => (
                                        <tr key={model.name} className="border-b last:border-0">
                                            <td className="py-3 px-4 font-medium">{model.name}</td>
                                            <td className="py-3 px-4">{model.latency}</td>
                                            <td className="py-3 px-4">{model.cost}</td>
                                            <td className="py-3 px-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span>{model.usage}%</span>
                                                        <span>{model.usage >= 50 ? 'Primary' : 'Backup'}</span>
                                                    </div>
                                                    <Progress value={model.usage} />
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <Button variant="ghost" size="sm">Adjust</Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>

                    <TabsContent value="prompts" className="mt-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <Input placeholder="Search templates" className="max-w-sm" />
                            <Button variant="outline">Duplicate</Button>
                            <Button>Create Prompt</Button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            {MOCK_PROMPTS.map(prompt => (
                                <Card key={prompt.id}>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            {prompt.name}
                                            <Badge variant={prompt.status === 'Active' ? 'default' : 'secondary'}>{prompt.status}</Badge>
                                        </CardTitle>
                                        <CardDescription>Variables: {prompt.variables.join(', ')}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <Textarea rows={4} placeholder="Prompt body" defaultValue={`Dear learner, here is a summary for {{${prompt.variables[0]}}}...`} />
                                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                                            <span>Updated {prompt.updatedAt}</span>
                                            <div className="flex items-center gap-2">
                                                <Button variant="ghost" size="sm">
                                                    Preview
                                                </Button>
                                                <Button variant="outline" size="sm">
                                                    Publish
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="guardrails" className="mt-6 space-y-4">
                        {MOCK_SAFEGUARDS.map(rule => (
                            <Card key={rule.name}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        {rule.name}
                                        <Badge variant={rule.status === 'Enabled' ? 'default' : 'secondary'}>{rule.status}</Badge>
                                    </CardTitle>
                                    <CardDescription>{rule.description}</CardDescription>
                                </CardHeader>
                                <CardContent className="flex items-center justify-between">
                                    <div className="text-sm text-muted-foreground">
                                        Enforcement mode: {rule.status === 'Enabled' ? 'Blocking' : 'Monitor'}
                                    </div>
                                    <Button variant="ghost" size="sm">
                                        Configure
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Pending action</AlertTitle>
                            <AlertDescription>
                                EU policy review detected new guidelines. Export the audit report and document adherence.
                            </AlertDescription>
                            <Button variant="outline" size="sm" className="mt-3">
                                <Download className="h-4 w-4 mr-2" /> Export audit log
                            </Button>
                        </Alert>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}

interface StatCardProps {
    title: string
    value: string | number
    helper: string
    icon: React.ComponentType<{ className?: string }>
}

function StatCard({ title, value, helper, icon: Icon }: StatCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground mt-1">{helper}</p>
            </CardContent>
        </Card>
    )
}

interface StatusToggleProps {
    title: string
    description: string
    enabled?: boolean
}

function StatusToggle({ title, description, enabled = false }: StatusToggleProps) {
    return (
        <div className="rounded-lg border p-4 space-y-3">
            <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="flex items-center justify-between text-sm">
                <Badge variant={enabled ? 'default' : 'secondary'}>
                    {enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Button variant="outline" size="sm">
                    {enabled ? 'Disable' : 'Enable'}
                </Button>
            </div>
        </div>
    )
}
