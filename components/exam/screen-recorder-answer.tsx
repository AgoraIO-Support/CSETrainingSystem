'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ApiClient } from '@/lib/api-client'
import { Loader2, Mic, MicOff, Video, Upload, ExternalLink, AlertCircle } from 'lucide-react'

type RecordingStatus = 'IDLE' | 'REQUESTING' | 'RECORDING' | 'UPLOADING' | 'UPLOADED' | 'ERROR'

export type ExerciseRecordingAnswerValue = {
    recordingS3Key: string
    recordingStatus: 'UPLOADED'
    recordingMimeType?: string | null
    recordingSizeBytes?: number | null
}

type Props = {
    examId: string
    attemptId: string
    questionId: string
    disabled?: boolean
    initial?: {
        recordingStatus?: 'PENDING_UPLOAD' | 'UPLOADED' | 'FAILED' | null
        recordingS3Key?: string | null
    }
    onUploaded?: (value: ExerciseRecordingAnswerValue) => void
}

const pickRecorderMimeType = (): string | null => {
    if (typeof window === 'undefined') return null
    if (typeof MediaRecorder === 'undefined') return null
    const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
    ]
    for (const candidate of candidates) {
        if (MediaRecorder.isTypeSupported(candidate)) return candidate
    }
    return null
}

export function ScreenRecorderAnswer(props: Props) {
    const [micEnabled, setMicEnabled] = useState(false)
    const [status, setStatus] = useState<RecordingStatus>('IDLE')
    const [error, setError] = useState<string | null>(null)
    const [uploadProgress, setUploadProgress] = useState<number>(0)
    const [uploadedKey, setUploadedKey] = useState<string | null>(props.initial?.recordingS3Key ?? null)
    const [uploadedReady, setUploadedReady] = useState<boolean>(props.initial?.recordingStatus === 'UPLOADED')

    const recorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<BlobPart[]>([])
    const displayStreamRef = useRef<MediaStream | null>(null)
    const micStreamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
    const recordingStartedAtRef = useRef<number | null>(null)

    const recorderMimeType = useMemo(() => pickRecorderMimeType(), [])
    const canRecord = useMemo(() => {
        return typeof window !== 'undefined' &&
            !!navigator.mediaDevices?.getDisplayMedia &&
            typeof MediaRecorder !== 'undefined' &&
            !!recorderMimeType
    }, [recorderMimeType])

    const cleanupStreams = useCallback(() => {
        for (const stream of [displayStreamRef.current, micStreamRef.current]) {
            if (!stream) continue
            for (const track of stream.getTracks()) track.stop()
        }

        try {
            const destination = audioDestinationRef.current
            if (destination) {
                for (const track of destination.stream.getTracks()) track.stop()
            }
        } catch {
            // ignore
        }

        try {
            audioContextRef.current?.close()
        } catch {
            // ignore
        }

        displayStreamRef.current = null
        micStreamRef.current = null
        audioDestinationRef.current = null
        audioContextRef.current = null
    }, [])

    useEffect(() => {
        return () => {
            try {
                recorderRef.current?.stop()
            } catch {
                // ignore
            }
            cleanupStreams()
        }
    }, [cleanupStreams])

    const startRecording = async () => {
        if (props.disabled) return
        setError(null)
        setUploadProgress(0)
        setStatus('REQUESTING')
        setUploadedReady(false)

        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: 30,
                    width: { max: 1920 },
                    height: { max: 1080 },
                },
                // Best-effort: browser-dependent (tab/system audio capture).
                audio: true,
            })
            displayStreamRef.current = displayStream

            let micStream: MediaStream | null = null
            if (micEnabled) {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                })
                micStreamRef.current = micStream
            }

            const systemAudioTracks = displayStream.getAudioTracks()
            const micAudioTracks = micStream ? micStream.getAudioTracks() : []

            // Most browsers don't mix multiple audio tracks in MediaRecorder automatically.
            // Mix system/tab audio + microphone into a single track via Web Audio API.
            const shouldMixAudio = systemAudioTracks.length + micAudioTracks.length > 1
            let combinedStream: MediaStream
            if (shouldMixAudio) {
                const AudioContextCtor: typeof AudioContext | undefined =
                    (window as any).AudioContext || (window as any).webkitAudioContext
                if (!AudioContextCtor) {
                    throw new Error('AudioContext is not supported in this browser')
                }

                const audioContext = new AudioContextCtor()
                const destination = audioContext.createMediaStreamDestination()
                audioContextRef.current = audioContext
                audioDestinationRef.current = destination

                const connectAudioTracks = (tracks: MediaStreamTrack[]) => {
                    if (tracks.length === 0) return
                    const audioOnly = new MediaStream(tracks)
                    const source = audioContext.createMediaStreamSource(audioOnly)
                    source.connect(destination)
                }

                connectAudioTracks(systemAudioTracks)
                connectAudioTracks(micAudioTracks)

                try {
                    await audioContext.resume()
                } catch {
                    // ignore (some browsers auto-resume on user gesture)
                }

                combinedStream = new MediaStream([
                    ...displayStream.getVideoTracks(),
                    ...destination.stream.getAudioTracks(),
                ])
            } else {
                combinedStream = new MediaStream([
                    ...displayStream.getVideoTracks(),
                    ...(systemAudioTracks.length > 0 ? systemAudioTracks : micAudioTracks),
                ])
            }

            const recorder = recorderMimeType
                ? new MediaRecorder(combinedStream, { mimeType: recorderMimeType })
                : new MediaRecorder(combinedStream)

            recorderRef.current = recorder
            chunksRef.current = []
            recordingStartedAtRef.current = Date.now()

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            recorder.onstop = async () => {
                const durationSeconds =
                    recordingStartedAtRef.current != null
                        ? Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000))
                        : undefined

                recordingStartedAtRef.current = null
                const blob = new Blob(chunksRef.current, { type: 'video/webm' })
                chunksRef.current = []
                cleanupStreams()

                if (blob.size === 0) {
                    setStatus('ERROR')
                    setError('Recording is empty. Please try again.')
                    return
                }

                try {
                    setStatus('UPLOADING')
                    const upload = await ApiClient.createExerciseUploadUrl(props.examId, {
                        attemptId: props.attemptId,
                        questionId: props.questionId,
                    })

                    await new Promise<void>((resolve, reject) => {
                        const xhr = new XMLHttpRequest()
                        xhr.open('PUT', upload.data.uploadUrl)
                        xhr.setRequestHeader('Content-Type', 'video/webm')
                        xhr.setRequestHeader('x-amz-server-side-encryption', 'AES256')
                        xhr.upload.onprogress = (event) => {
                            if (!event.lengthComputable) return
                            const pct = Math.round((event.loaded / event.total) * 100)
                            setUploadProgress(Math.max(0, Math.min(100, pct)))
                        }
                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) return resolve()
                            reject(new Error(`Upload failed (${xhr.status})`))
                        }
                        xhr.onerror = () => reject(new Error('Upload failed'))
                        xhr.send(blob)
                    })

                    const confirmed = await ApiClient.confirmExerciseUpload(props.examId, {
                        attemptId: props.attemptId,
                        questionId: props.questionId,
                        durationSeconds,
                    })

                    setUploadedKey(upload.data.key)
                    setUploadedReady(true)
                    setUploadProgress(100)
                    setStatus('UPLOADED')
                    props.onUploaded?.({
                        recordingS3Key: upload.data.key,
                        recordingStatus: 'UPLOADED',
                        recordingMimeType: confirmed.data.recordingMimeType ?? null,
                        recordingSizeBytes: confirmed.data.recordingSizeBytes ?? null,
                    })
                } catch (e) {
                    setStatus('ERROR')
                    setError(e instanceof Error ? e.message : 'Upload failed')
                }
            }

            // If user stops sharing from the browser chrome, stop recording too.
            const [videoTrack] = displayStream.getVideoTracks()
            videoTrack?.addEventListener('ended', () => {
                if (recorderRef.current?.state === 'recording') {
                    try {
                        recorderRef.current.stop()
                    } catch {
                        // ignore
                    }
                }
            })

            recorder.start(1000)
            setStatus('RECORDING')
        } catch (e) {
            cleanupStreams()
            setStatus('ERROR')
            setError(e instanceof Error ? e.message : 'Failed to start recording')
        }
    }

    const stopRecording = () => {
        if (recorderRef.current?.state === 'recording') {
            try {
                recorderRef.current.stop()
            } catch (e) {
                setStatus('ERROR')
                setError(e instanceof Error ? e.message : 'Failed to stop recording')
            }
        }
    }

    const openUploaded = async () => {
        if (!uploadedKey) return
        try {
            setError(null)
            const res = await ApiClient.getExerciseAccessUrl(props.examId, {
                attemptId: props.attemptId,
                questionId: props.questionId,
            })
            window.open(res.data.url, '_blank', 'noopener,noreferrer')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to open recording')
        }
    }

    if (!canRecord) {
        return (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Screen recording is not supported in this browser.
                </div>
                <div className="mt-2">
                    Requirement: record and upload <code>video/webm</code>.
                </div>
            </div>
        )
    }

    const busy = status === 'REQUESTING' || status === 'UPLOADING'

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium">
                        <Video className="h-4 w-4" />
                        Screen Recording (WebM)
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Click “Start” → choose a screen/window/tab → “Stop” uploads automatically.
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={micEnabled}
                            onCheckedChange={(checked) => setMicEnabled(checked)}
                            disabled={busy || status === 'RECORDING' || props.disabled}
                        />
                        <Label className="flex items-center gap-2">
                            {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                            Mic
                        </Label>
                    </div>
                    {status !== 'RECORDING' ? (
                        <Button onClick={startRecording} disabled={busy || props.disabled}>
                            {status === 'REQUESTING' ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Video className="h-4 w-4 mr-2" />
                            )}
                            Start
                        </Button>
                    ) : (
                        <Button variant="destructive" onClick={stopRecording} disabled={props.disabled}>
                            Stop
                        </Button>
                    )}
                </div>
            </div>

            {status === 'UPLOADING' && (
                <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                        <Upload className="h-4 w-4" />
                        Uploading…
                        <span className="ml-auto tabular-nums">{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                </div>
            )}

            {(uploadedReady || status === 'UPLOADED') && (
                <div className="rounded-lg border p-4 flex items-center justify-between gap-3">
                    <div className="text-sm">
                        <div className="font-medium">Uploaded</div>
                        <div className="text-muted-foreground break-all">{uploadedKey}</div>
                    </div>
                    <Button variant="outline" onClick={openUploaded} disabled={!uploadedKey}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View
                    </Button>
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <div className="min-w-0">{error}</div>
                </div>
            )}
        </div>
    )
}
