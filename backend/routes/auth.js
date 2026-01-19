import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  sendSignupConfirmationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendWelcomeEmail,
  isEmailServiceConfigured,
} from '../services/emailService.js';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL || 'http://localhost:5173';
const webhookSecret = process.env.WEBHOOK_SECRET;

// Create Supabase admin client with service role key for admin operations
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Create regular Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Signup endpoint - Creates user and sends confirmation email
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!isEmailServiceConfigured()) {
      return res.status(503).json({ error: 'Email service not configured' });
    }

    // Sign up user with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback`,
      },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data.user) {
      return res.status(400).json({ error: 'Failed to create user' });
    }

    // Generate email verification link
    // For self-hosted Supabase, we need to generate the token manually
    let verificationLink = null;
    
    if (data.user.email_confirmed_at) {
      // Email already confirmed (if email confirmation is disabled in Supabase)
      // Send welcome email instead
      try {
        await sendWelcomeEmail(email);
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError);
      }
    } else {
      // Generate email confirmation token
      if (supabaseAdmin) {
        try {
          // Generate a confirmation token
          const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'signup',
            email: email,
          });

          if (!tokenError && tokenData?.properties?.action_link) {
            verificationLink = tokenData.properties.action_link;
          } else {
            // Fallback: construct verification link manually
            // Note: This may not work if Supabase requires specific token format
            verificationLink = `${appUrl}/auth/verify?token=${data.user.id}&type=signup`;
          }
        } catch (adminError) {
          console.error('Error generating confirmation link:', adminError);
          // Fallback link
          verificationLink = `${appUrl}/auth/verify?token=${data.user.id}&type=signup`;
        }
      } else {
        // Fallback if service role key not available
        verificationLink = `${appUrl}/auth/verify?token=${data.user.id}&type=signup`;
      }

      // Send confirmation email
      try {
        await sendSignupConfirmationEmail(email, verificationLink);
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
        // Still return success, but log the error
      }
    }

    res.json({
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
      user: {
        id: data.user.id,
        email: data.user.email,
        emailConfirmed: !!data.user.email_confirmed_at,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Password reset endpoint - Sends password reset email
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;

    console.log('[AUTH] /api/auth/reset-password called');
    if (!email) {
      console.warn('[AUTH] Reset password request missing email');
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log('[AUTH] Reset password requested for:', email);
    console.log('[AUTH] Using APP_URL for redirect:', appUrl);

    if (!isEmailServiceConfigured()) {
      console.error('[AUTH] Email service not configured (SMTP missing)');
      return res.status(503).json({ error: 'Email service not configured on backend' });
    }

    // We intentionally do NOT call supabase.auth.resetPasswordForEmail here,
    // because that relies on Supabase's internal SMTP configuration, which
    // you are not using. Instead, we:
    // 1) Generate a recovery link with the service role key
    // 2) Send the email ourselves via nodemailer.

    if (!supabaseAdmin) {
      console.error('[AUTH] SUPABASE_SERVICE_ROLE_KEY is not configured; cannot generate recovery link');
      return res.status(500).json({
        error: 'Backend is missing SUPABASE_SERVICE_ROLE_KEY. Cannot generate password reset link.',
      });
    }

    // Generate password reset link using Supabase admin API
    let resetLink = null;

    try {
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: `${appUrl}/auth/reset-password`,
        },
      });

      if (linkError) {
        console.error('[AUTH] Error from Supabase when generating reset link:', linkError);
      } else if (linkData?.properties?.action_link) {
        const supabaseLink = linkData.properties.action_link;
        console.log('[AUTH] Generated link from Supabase:', supabaseLink);
        
        // Extract the token from Supabase's link
        // Supabase link format: https://superbase.emmerce.io/auth/v1/verify?token=...&type=recovery&redirect_to=...
        const urlMatch = supabaseLink.match(/[?&]token=([^&]+)/);
        const token = urlMatch ? urlMatch[1] : null;
        
        if (token) {
          // Create our own link that goes directly to our app
          // Our app will handle the token verification
          resetLink = `${appUrl}/auth/reset-password?token=${encodeURIComponent(token)}&type=recovery`;
          console.log('[AUTH] Created app redirect link with token:', resetLink);
        } else {
          console.error('[AUTH] Could not extract token from Supabase link');
          resetLink = supabaseLink; // Fallback to original link
        }
      } else {
        console.error('[AUTH] Supabase generateLink returned no action_link');
      }
    } catch (adminError) {
      console.error('[AUTH] Exception while generating reset link:', adminError);
    }

    // If we still don't have a link, just return generic success
    if (!resetLink) {
      console.error('[AUTH] Failed to generate password reset link; not sending email');
      return res.status(500).json({
        error: 'Failed to generate password reset link. Please contact support or try again later.',
      });
    }

    // Send our custom password reset email
    try {
      await sendPasswordResetEmail(email, resetLink);
      console.log('[AUTH] Password reset email dispatched via emailService');
    } catch (emailError) {
      console.error('[AUTH] Error sending reset email:', emailError);
      return res.status(500).json({
        error: 'Failed to send password reset email. Please try again later.',
      });
    }

    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('[AUTH] Password reset error (unhandled):', error);
    res.status(500).json({
      error: 'Unexpected error while processing password reset. Please try again later.',
    });
  }
});

/**
 * Reset password with token endpoint - Verifies token and updates password
 */
router.post('/reset-password-with-token', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Recovery token is required' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password is required and must be at least 6 characters' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Service unavailable' });
    }

    console.log('[AUTH] Password reset with token requested');

    // Verify the token ONCE to get user and session
    // Recovery tokens are single-use, so we must capture everything from first verification
    let userId = null;
    let userEmail = null;
    let recoverySession = null;

    try {
      // Method 1: Try to verify the token directly (this creates a session)
      const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
        token: token,
        type: 'recovery',
      });

      if (!verifyError && verifyData?.user) {
        userId = verifyData.user.id;
        userEmail = verifyData.user.email;
        recoverySession = verifyData.session;
        console.log('[AUTH] Token verified, user ID:', userId, 'has session:', !!recoverySession);
      } else {
        // Method 2: Try with token_hash
        const { data: verifyData2, error: verifyError2 } = await supabaseAdmin.auth.verifyOtp({
          token_hash: token,
          type: 'recovery',
        });

        if (!verifyError2 && verifyData2?.user) {
          userId = verifyData2.user.id;
          userEmail = verifyData2.user.email;
          recoverySession = verifyData2.session;
          console.log('[AUTH] Token verified with token_hash, user ID:', userId, 'has session:', !!recoverySession);
        } else {
          const errorMsg = verifyError?.message || verifyError2?.message || 'Token verification failed';
          console.error('[AUTH] Token verification failed:', errorMsg);
          return res.status(400).json({ 
            error: 'Invalid or expired recovery token. Please request a new password reset link.' 
          });
        }
      }
    } catch (verifyError) {
      console.error('[AUTH] Error verifying token:', verifyError);
      return res.status(400).json({ error: 'Invalid or expired recovery token' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'Could not identify user from token' });
    }

    // Update password - use session if available, otherwise use admin API
    try {
      console.log('[AUTH] Attempting to update password for user:', userId);
      
      let updateSuccess = false;

      // Try using the recovery session first (if we got one)
      if (recoverySession && recoverySession.access_token) {
        try {
          console.log('[AUTH] Attempting password update via recovery session...');
          const recoveryClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
              headers: {
                Authorization: `Bearer ${recoverySession.access_token}`
              }
            }
          });

          const { data: updateData, error: updateError } = await recoveryClient.auth.updateUser({
            password: password
          });

          if (!updateError) {
            console.log('[AUTH] Password updated successfully via recovery session');
            updateSuccess = true;
          } else {
            console.warn('[AUTH] Session-based update failed, will try admin API:', updateError.message);
          }
        } catch (sessionError) {
          console.warn('[AUTH] Session-based update exception, will try admin API:', sessionError.message);
        }
      }

      // Fallback to admin API if session method didn't work
      if (!updateSuccess) {
        console.log('[AUTH] Using admin API to update password...');
        const { data: adminUpdateData, error: adminUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          { password: password }
        );

        if (adminUpdateError) {
          console.error('[AUTH] Admin API update failed:', adminUpdateError);
          return res.status(500).json({ 
            error: 'Failed to update password: ' + (adminUpdateError.message || 'Unknown error') 
          });
        }
        
        console.log('[AUTH] Password updated successfully via admin API');
      }

      console.log('[AUTH] Password successfully updated for user:', userEmail || userId);
      
      // Optionally send confirmation email
      if (userEmail && isEmailServiceConfigured()) {
        try {
          await sendPasswordChangedEmail(userEmail);
        } catch (emailError) {
          console.error('[AUTH] Failed to send password changed email:', emailError);
          // Don't fail the request if email fails
        }
      }

      res.json({
        success: true,
        message: 'Password has been reset successfully',
      });
    } catch (updateError) {
      console.error('[AUTH] Exception updating password:', updateError);
      res.status(500).json({ error: 'Failed to update password: ' + (updateError.message || 'Unknown error') });
    }
  } catch (error) {
    console.error('[AUTH] Password reset with token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Verify email endpoint - Handles email verification
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token, type } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Verify the email using Supabase
    // This endpoint would typically be called from the frontend after user clicks the link
    // The actual verification happens via Supabase's built-in flow
    
    res.json({
      success: true,
      message: 'Email verification link received. Please complete verification in the app.',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Change password confirmation - Sends confirmation email after password change
 * This should be called after a successful password update
 */
router.post('/change-password-confirmation', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!isEmailServiceConfigured()) {
      return res.status(503).json({ error: 'Email service not configured' });
    }

    // Send password changed confirmation email
    try {
      await sendPasswordChangedEmail(email);
      res.json({ success: true, message: 'Confirmation email sent' });
    } catch (emailError) {
      console.error('Error sending password changed email:', emailError);
      res.status(500).json({ error: 'Failed to send confirmation email' });
    }
  } catch (error) {
    console.error('Change password confirmation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Webhook endpoint for database triggers
 * Receives events from Supabase database triggers and sends appropriate emails
 */
router.post('/webhook', async (req, res) => {
  try {
    // Verify webhook secret if configured
    if (webhookSecret) {
      const providedSecret = req.headers['x-webhook-secret'] || req.body.secret;
      if (providedSecret !== webhookSecret) {
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    const { event, data } = req.body;

    if (!event || !data) {
      return res.status(400).json({ error: 'Event and data are required' });
    }

    if (!isEmailServiceConfigured()) {
      console.warn('Email service not configured, skipping webhook email');
      return res.status(503).json({ error: 'Email service not configured' });
    }

    // Handle different event types
    switch (event) {
      case 'user.created':
      case 'auth.users.insert': {
        const email = data.email || data.raw_user_meta_data?.email;
        if (!email) {
          return res.status(400).json({ error: 'Email not found in user data' });
        }

        // Generate verification link
        let verificationLink = null;
        if (supabaseAdmin) {
          try {
            const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
              type: 'signup',
              email: email,
            });
            verificationLink = linkData?.properties?.action_link;
          } catch (error) {
            console.error('Error generating verification link:', error);
            verificationLink = `${appUrl}/auth/verify?token=${data.id}&type=signup`;
          }
        } else {
          verificationLink = `${appUrl}/auth/verify?token=${data.id}&type=signup`;
        }

        // Send signup confirmation email
        try {
          await sendSignupConfirmationEmail(email, verificationLink);
          console.log(`Signup confirmation email sent to ${email}`);
        } catch (emailError) {
          console.error('Error sending signup confirmation email:', emailError);
          return res.status(500).json({ error: 'Failed to send email' });
        }
        break;
      }

      case 'user.password_reset_requested':
      case 'auth.users.password_reset': {
        const email = data.email || data.raw_user_meta_data?.email;
        if (!email) {
          return res.status(400).json({ error: 'Email not found in user data' });
        }

        // Generate reset link
        let resetLink = null;
        if (supabaseAdmin) {
          try {
            const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
              type: 'recovery',
              email: email,
            });
            resetLink = linkData?.properties?.action_link;
          } catch (error) {
            console.error('Error generating reset link:', error);
            resetLink = `${appUrl}/auth/reset-password?token=${data.id}`;
          }
        } else {
          resetLink = `${appUrl}/auth/reset-password?token=${data.id}`;
        }

        // Send password reset email
        try {
          await sendPasswordResetEmail(email, resetLink);
          console.log(`Password reset email sent to ${email}`);
        } catch (emailError) {
          console.error('Error sending password reset email:', emailError);
          return res.status(500).json({ error: 'Failed to send email' });
        }
        break;
      }

      case 'user.email_verified':
      case 'auth.users.email_confirmed': {
        const email = data.email || data.raw_user_meta_data?.email;
        if (!email) {
          return res.status(400).json({ error: 'Email not found in user data' });
        }

        // Send welcome email
        try {
          await sendWelcomeEmail(email);
          console.log(`Welcome email sent to ${email}`);
        } catch (emailError) {
          console.error('Error sending welcome email:', emailError);
          return res.status(500).json({ error: 'Failed to send email' });
        }
        break;
      }

      case 'user.password_changed':
      case 'auth.users.password_updated': {
        const email = data.email || data.raw_user_meta_data?.email;
        if (!email) {
          return res.status(400).json({ error: 'Email not found in user data' });
        }

        // Send password changed confirmation
        try {
          await sendPasswordChangedEmail(email);
          console.log(`Password changed email sent to ${email}`);
        } catch (emailError) {
          console.error('Error sending password changed email:', emailError);
          return res.status(500).json({ error: 'Failed to send email' });
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event}`);
        return res.status(400).json({ error: `Unhandled event type: ${event}` });
    }

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
