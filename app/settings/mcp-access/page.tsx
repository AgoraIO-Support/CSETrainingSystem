'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiClient } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import type { McpAccessTokenSummary } from '@/types'
import { Copy, KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react'

const EXPIRATION_OPTIONS = [
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
    { value: '180', label: '180 days' },
]

export default function McpAccessPage() {
    const [tokens, setTokens] = useState<McpAccessTokenSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [createOpen, setCreateOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [tokenName, setTokenName] = useState('My Codex on MacBook')
    const [expiresInDays, setExpiresInDays] = useState('90')
    const [createdToken, setCreatedToken] = useState<string | null>(null)
    const [createdTokenLabel, setCreatedTokenLabel] = useState<string | null>(null)

    const [revokeTarget, setRevokeTarget] = useState<McpAccessTokenSummary | null>(null)
    const [revoking, setRevoking] = useState(false)

    const activeCount = useMemo(
        () => tokens.filter((token) => token.status === 'ACTIVE').length,
        [tokens]
    )

    const loadTokens = async () => {
        try {
            setLoading(true)
            setError(null)
            const response = await ApiClient.getMcpAccessTokens()
            setTokens(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load MCP access tokens')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadTokens()
    }, [])

    const handleCreate = async () => {
        try {
            setCreating(true)
            setError(null)
            const response = await ApiClient.createMcpAccessToken({
                name: tokenName.trim(),
                expiresInDays: Number(expiresInDays),
            })
            setCreatedToken(response.data.token)
            setCreatedTokenLabel(response.data.record.name)
            setCreateOpen(false)
            await loadTokens()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create MCP access token')
        } finally {
            setCreating(false)
        }
    }

    const handleRevoke = async () => {
        if (!revokeTarget) return

        try {
            setRevoking(true)
            setError(null)
            await ApiClient.revokeMcpAccessToken(revokeTarget.id)
            setRevokeTarget(null)
            await loadTokens()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to revoke MCP access token')
        } finally {
            setRevoking(false)
        }
    }

    const copyCreatedToken = async () => {
        if (!createdToken) return
        await navigator.clipboard.writeText(createdToken)
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">MCP Access</h1>
                        <p className="mt-1 text-muted-foreground">
                            Create personal access tokens for Codex or other approved MCP clients. Tokens are only available to active SME and ADMIN users.
                        </p>
                    </div>
                    <Button onClick={() => setCreateOpen(true)}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        Create MCP Token
                    </Button>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Token Inventory</CardTitle>
                            <CardDescription>
                                Active tokens: {activeCount}. Revoke any token you no longer use.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {error ? (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                    {error}
                                </div>
                            ) : null}

                            {loading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading tokens...
                                </div>
                            ) : null}

                            {!loading && tokens.length === 0 ? (
                                <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                    No MCP access tokens yet. Create one for Codex, Cursor, or another approved client.
                                </div>
                            ) : null}

                            {!loading && tokens.length > 0 ? (
                                <div className="space-y-3">
                                    {tokens.map((token) => (
                                        <div key={token.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-semibold">{token.name}</h3>
                                                        <Badge variant={token.status === 'ACTIVE' ? 'default' : 'secondary'}>
                                                            {token.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                                                        {token.tokenPrefix}
                                                    </div>
                                                    <div className="grid gap-1 text-sm text-muted-foreground">
                                                        <p>Created {formatDate(token.createdAt)}</p>
                                                        <p>Expires {formatDate(token.expiresAt)}</p>
                                                        <p>
                                                            Last used {token.lastUsedAt ? formatDate(token.lastUsedAt) : 'Never'}
                                                            {token.lastUsedIp ? ` from ${token.lastUsedIp}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={token.status !== 'ACTIVE'}
                                                        onClick={() => setRevokeTarget(token)}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Revoke
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>How To Use It</CardTitle>
                                <CardDescription>
                                    Use your personal token in Codex. Never use the server internal token on your laptop.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm">
                                <div className="rounded-xl border bg-slate-50 p-4 dark:bg-slate-950/40">
                                    <p className="mb-2 font-medium">Codex config</p>
                                    <pre className="overflow-x-auto text-xs leading-6 text-muted-foreground">{`[mcp_servers.cse_sme_mcp]
url = "https://cselearning.club/api/mcp"
bearer_token_env_var = "CSE_MCP_USER_TOKEN"
enabled = true
required = true`}</pre>
                                </div>
                                <div className="rounded-xl border bg-slate-50 p-4 dark:bg-slate-950/40">
                                    <p className="mb-2 font-medium">Shell env</p>
                                    <pre className="overflow-x-auto text-xs leading-6 text-muted-foreground">{`export CSE_MCP_USER_TOKEN=your-personal-mcp-token`}</pre>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Security Notes</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-muted-foreground">
                                <div className="flex items-start gap-3 rounded-xl border p-4">
                                    <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                                    <p>Only active SME and ADMIN users can create tokens.</p>
                                </div>
                                <div className="flex items-start gap-3 rounded-xl border p-4">
                                    <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                                    <p>The token will be shown only once when created. Copy it immediately.</p>
                                </div>
                                <div className="flex items-start gap-3 rounded-xl border p-4">
                                    <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                                    <p>Revoke the token immediately if your laptop, shell history, or config is shared.</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create MCP Access Token</DialogTitle>
                        <DialogDescription>
                            Create a personal token for Codex or another approved MCP client.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="mcpTokenName">Token Name</Label>
                            <Input
                                id="mcpTokenName"
                                value={tokenName}
                                onChange={(event) => setTokenName(event.target.value)}
                                placeholder="My Codex on MacBook"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Expiration</Label>
                            <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select expiration" />
                                </SelectTrigger>
                                <SelectContent>
                                    {EXPIRATION_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={creating || tokenName.trim().length < 2}>
                            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Create Token
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(createdToken)} onOpenChange={(open) => !open && setCreatedToken(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Copy Your MCP Token Now</DialogTitle>
                        <DialogDescription>
                            {createdTokenLabel ? `Token "${createdTokenLabel}"` : 'Your new token'} will only be shown once.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="rounded-xl border bg-slate-50 p-4 font-mono text-xs leading-6 dark:bg-slate-950/40">
                            {createdToken}
                        </div>
                        <Button onClick={copyCreatedToken}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Token
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={Boolean(revokeTarget)}
                onOpenChange={(open) => !open && setRevokeTarget(null)}
                title="Revoke MCP Token"
                description={
                    revokeTarget
                        ? `Revoke "${revokeTarget.name}"? This token will stop working immediately.`
                        : undefined
                }
                confirmLabel={revoking ? 'Revoking...' : 'Revoke Token'}
                confirmVariant="destructive"
                confirmDisabled={revoking}
                onConfirm={handleRevoke}
            />
        </DashboardLayout>
    )
}
