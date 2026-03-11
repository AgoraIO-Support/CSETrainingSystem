/**
 * Email Templates
 * React Email templates for exam notifications
 */

import * as React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Link,
} from '@react-email/components';
import { DEFAULT_EXAM_TIMEZONE, formatDateTimeInExamTimeZone } from '@/lib/exam-timezone';

// Common styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  borderRadius: '5px',
};

const section = {
  padding: '0 48px',
};

const heading = {
  fontSize: '24px',
  fontWeight: '600',
  color: '#1a1a1a',
  margin: '20px 0',
};

const text = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#4a4a4a',
};

const buttonPrimary = {
  backgroundColor: '#2563eb',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
  margin: '16px 0',
};

const buttonSuccess = {
  ...buttonPrimary,
  backgroundColor: '#16a34a',
};

const hr = {
  borderColor: '#e5e5e5',
  margin: '26px 0',
};

const footer = {
  color: '#9ca3af',
  fontSize: '12px',
  marginTop: '24px',
};

const infoBox = {
  backgroundColor: '#f3f4f6',
  borderRadius: '5px',
  padding: '16px',
  margin: '16px 0',
};

// ============ EXAM INVITATION EMAIL ============

interface ExamInvitationEmailProps {
  userName: string;
  examTitle: string;
  examDescription?: string;
  deadline?: Date;
  examTimezone?: string;
  timeLimit?: number;
  maxAttempts: number;
  examUrl: string;
  appName: string;
}

export function ExamInvitationEmail({
  userName,
  examTitle,
  examDescription,
  deadline,
  examTimezone = DEFAULT_EXAM_TIMEZONE,
  timeLimit,
  maxAttempts,
  examUrl,
  appName,
}: ExamInvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You&apos;re invited to take: {examTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Exam Invitation</Text>
            <Text style={text}>Hi {userName},</Text>
            <Text style={text}>
              You have been invited to take the following exam:
            </Text>

            <Section style={infoBox}>
              <Text style={{ ...text, fontWeight: '600', marginBottom: '8px' }}>
                {examTitle}
              </Text>
              {examDescription && (
                <Text style={{ ...text, fontSize: '14px', margin: '0' }}>
                  {examDescription}
                </Text>
              )}
            </Section>

            <Text style={text}>
              <strong>Details:</strong>
            </Text>
            <ul style={{ ...text, paddingLeft: '20px' }}>
              {deadline && (
                <li>
                  Deadline:{' '}
                  {formatDateTimeInExamTimeZone(deadline, examTimezone, { includeTimeZoneName: true })}
                </li>
              )}
              {timeLimit && <li>Time Limit: {timeLimit} minutes</li>}
              <li>Maximum Attempts: {maxAttempts}</li>
            </ul>

            <Button style={buttonPrimary} href={examUrl}>
              Start Exam
            </Button>

            <Hr style={hr} />
            <Text style={footer}>
              This email was sent by {appName}. If you did not expect this
              invitation, please contact your administrator.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ============ EXAM REMINDER EMAIL ============

interface ExamReminderEmailProps {
  userName: string;
  examTitle: string;
  deadline?: Date;
  examTimezone?: string;
  examUrl: string;
  appName: string;
}

export function ExamReminderEmail({
  userName,
  examTitle,
  deadline,
  examTimezone = DEFAULT_EXAM_TIMEZONE,
  examUrl,
  appName,
}: ExamReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reminder: {examTitle} deadline approaching</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Exam Reminder</Text>
            <Text style={text}>Hi {userName},</Text>
            <Text style={text}>
              This is a reminder that you have an upcoming exam deadline:
            </Text>

            <Section style={infoBox}>
              <Text style={{ ...text, fontWeight: '600', marginBottom: '8px' }}>
                {examTitle}
              </Text>
              {deadline && (
                <Text
                  style={{ ...text, fontSize: '14px', margin: '0', color: '#dc2626' }}
                >
                  Deadline:{' '}
                  {formatDateTimeInExamTimeZone(deadline, examTimezone, { includeTimeZoneName: true })}
                </Text>
              )}
            </Section>

            <Text style={text}>
              Please make sure to complete the exam before the deadline.
            </Text>

            <Button style={buttonPrimary} href={examUrl}>
              Take Exam Now
            </Button>

            <Hr style={hr} />
            <Text style={footer}>
              This email was sent by {appName}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ============ EXAM RESULTS EMAIL ============

interface ExamResultsEmailProps {
  userName: string;
  examTitle: string;
  score: number;
  totalScore: number;
  percentageScore: number;
  passed: boolean;
  passingScore: number;
  resultsUrl: string;
  appName: string;
}

export function ExamResultsEmail({
  userName,
  examTitle,
  score,
  totalScore,
  percentageScore,
  passed,
  passingScore,
  resultsUrl,
  appName,
}: ExamResultsEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Your results for: {examTitle} - {passed ? 'Passed' : 'Not Passed'}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Exam Results</Text>
            <Text style={text}>Hi {userName},</Text>
            <Text style={text}>
              Your exam has been graded. Here are your results for{' '}
              <strong>{examTitle}</strong>:
            </Text>

            <Section
              style={{
                ...infoBox,
                backgroundColor: passed ? '#dcfce7' : '#fee2e2',
                textAlign: 'center',
              }}
            >
              <Text
                style={{
                  ...text,
                  fontSize: '32px',
                  fontWeight: '700',
                  color: passed ? '#16a34a' : '#dc2626',
                  margin: '0',
                }}
              >
                {passed ? 'PASSED' : 'NOT PASSED'}
              </Text>
              <Text
                style={{
                  ...text,
                  fontSize: '24px',
                  fontWeight: '600',
                  margin: '8px 0',
                }}
              >
                {score} / {totalScore} ({percentageScore.toFixed(1)}%)
              </Text>
              <Text style={{ ...text, fontSize: '14px', margin: '0' }}>
                Passing score: {passingScore} points
              </Text>
            </Section>

            <Button style={passed ? buttonSuccess : buttonPrimary} href={resultsUrl}>
              View Detailed Results
            </Button>

            <Hr style={hr} />
            <Text style={footer}>
              This email was sent by {appName}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ============ CERTIFICATE DELIVERY EMAIL ============

interface CertificateDeliveryEmailProps {
  userName: string;
  examTitle: string;
  certificateNumber: string;
  issuedAt: Date;
  certificateUrl: string;
  verifyUrl: string;
  appName: string;
}

export function CertificateDeliveryEmail({
  userName,
  examTitle,
  certificateNumber,
  issuedAt,
  certificateUrl,
  verifyUrl,
  appName,
}: CertificateDeliveryEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Congratulations! Your certificate for {examTitle} is ready
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Congratulations!</Text>
            <Text style={text}>Hi {userName},</Text>
            <Text style={text}>
              Congratulations on successfully completing <strong>{examTitle}</strong>!
              Your certificate of completion is now available.
            </Text>

            <Section
              style={{
                ...infoBox,
                backgroundColor: '#ecfdf5',
                textAlign: 'center',
              }}
            >
              <Text
                style={{
                  ...text,
                  fontSize: '14px',
                  color: '#6b7280',
                  margin: '0 0 8px 0',
                }}
              >
                Certificate Number
              </Text>
              <Text
                style={{
                  ...text,
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#059669',
                  margin: '0 0 8px 0',
                  fontFamily: 'monospace',
                }}
              >
                {certificateNumber}
              </Text>
              <Text style={{ ...text, fontSize: '12px', margin: '0' }}>
                Issued on{' '}
                {new Date(issuedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </Section>

            <Button style={buttonSuccess} href={certificateUrl}>
              Download Certificate
            </Button>

            <Text style={{ ...text, fontSize: '14px' }}>
              Your certificate can be verified at:{' '}
              <Link href={verifyUrl}>{verifyUrl}</Link>
            </Text>

            <Hr style={hr} />
            <Text style={footer}>
              This email was sent by {appName}. Share your achievement!
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
