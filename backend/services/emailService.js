import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// SMTP configuration from environment variables
const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
};

const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
const fromName = process.env.SMTP_FROM_NAME || 'NutriTherapy Solutions';
const appUrl = process.env.APP_URL || 'http://localhost:5173';

// Create transporter
let transporter = null;

if (smtpConfig.host && smtpConfig.auth.user && smtpConfig.auth.pass) {
  transporter = nodemailer.createTransport(smtpConfig);
  
  // Verify connection configuration
  transporter.verify((error) => {
    if (error) {
      console.error('SMTP configuration error:', error);
    } else {
      console.log('Email service ready');
    }
  });
} else {
  console.warn('SMTP not configured. Email service will not work.');
}

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @returns {Promise<Object>}
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!transporter) {
    throw new Error('Email service not configured. Please set SMTP environment variables.');
  }

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    });

    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

/**
 * Generate email template with branding
 * @param {string} title - Email title
 * @param {string} content - Main content HTML
 * @param {string} buttonText - Button text (optional)
 * @param {string} buttonUrl - Button URL (optional)
 * @returns {string} HTML email template
 */
function generateEmailTemplate(title, content, buttonText = null, buttonUrl = null) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #8C3A36; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">NutriTherapy Solutions</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">${title}</h2>
              <div style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                ${content}
              </div>
              ${buttonText && buttonUrl ? `
              <table role="presentation" style="margin: 30px 0; width: 100%;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${buttonUrl}" style="display: inline-block; padding: 14px 28px; background-color: #8C3A36; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">${buttonText}</a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #f9f9f9; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; color: #6a6a6a; font-size: 14px;">
                This email was sent by NutriTherapy Solutions.<br>
                If you didn't request this, please ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Send signup confirmation email with verification link
 * @param {string} email - User email
 * @param {string} verificationLink - Email verification link
 * @returns {Promise<Object>}
 */
export async function sendSignupConfirmationEmail(email, verificationLink) {
  const title = 'Welcome to NutriTherapy Solutions!';
  const content = `
    <p>Thank you for signing up for NutriTherapy Solutions!</p>
    <p>To complete your registration and start your 14-day free trial, please verify your email address by clicking the button below.</p>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #8C3A36; font-size: 14px;">${verificationLink}</p>
    <p>This link will expire in 24 hours.</p>
  `;
  
  const html = generateEmailTemplate(title, content, 'Verify Email Address', verificationLink);
  
  return sendEmail({
    to: email,
    subject: 'Verify your email address - NutriTherapy Solutions',
    html,
  });
}

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {string} resetLink - Password reset link
 * @returns {Promise<Object>}
 */
export async function sendPasswordResetEmail(email, resetLink) {
  const title = 'Reset Your Password';
  const content = `
    <p>We received a request to reset your password for your NutriTherapy Solutions account.</p>
    <p>Click the button below to reset your password. If you didn't request this, please ignore this email.</p>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #8C3A36; font-size: 14px;">${resetLink}</p>
    <p><strong>This link will expire in 1 hour.</strong></p>
    <p>For security reasons, if you didn't request a password reset, please contact support immediately.</p>
  `;
  
  const html = generateEmailTemplate(title, content, 'Reset Password', resetLink);
  
  return sendEmail({
    to: email,
    subject: 'Reset your password - NutriTherapy Solutions',
    html,
  });
}

/**
 * Send password changed confirmation email
 * @param {string} email - User email
 * @returns {Promise<Object>}
 */
export async function sendPasswordChangedEmail(email) {
  const title = 'Password Changed Successfully';
  const content = `
    <p>Your password has been successfully changed.</p>
    <p>If you didn't make this change, please contact our support team immediately to secure your account.</p>
    <p>For your security, we recommend:</p>
    <ul style="margin: 15px 0; padding-left: 20px;">
      <li>Using a strong, unique password</li>
      <li>Not sharing your password with anyone</li>
      <li>Enabling two-factor authentication if available</li>
    </ul>
  `;
  
  const html = generateEmailTemplate(title, content);
  
  return sendEmail({
    to: email,
    subject: 'Password changed - NutriTherapy Solutions',
    html,
  });
}

/**
 * Send welcome email after email verification
 * @param {string} email - User email
 * @returns {Promise<Object>}
 */
export async function sendWelcomeEmail(email) {
  const title = 'Welcome to NutriTherapy Solutions!';
  const content = `
    <p>Your email has been verified successfully!</p>
    <p>You're all set to start managing your nutrition practice with NutriTherapy Solutions.</p>
    <p>Here's what you can do:</p>
    <ul style="margin: 15px 0; padding-left: 20px;">
      <li>Manage your client profiles and track their progress</li>
      <li>Create personalized meal plans</li>
      <li>Generate AI-powered nutrition insights</li>
      <li>Send automated reminders to your clients</li>
    </ul>
    <p>Get started by logging in to your account.</p>
  `;
  
  const html = generateEmailTemplate(title, content, 'Go to Dashboard', appUrl);
  
  return sendEmail({
    to: email,
    subject: 'Welcome to NutriTherapy Solutions!',
    html,
  });
}

/**
 * Check if email service is configured
 * @returns {boolean}
 */
export function isEmailServiceConfigured() {
  return transporter !== null;
}
