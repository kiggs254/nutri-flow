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

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!isEmailServiceConfigured()) {
      return res.status(503).json({ error: 'Email service not configured' });
    }

    // Generate password reset link using Supabase
    let resetLink = null;

    if (supabaseAdmin) {
      try {
        // Generate password reset link
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: email,
        });

        if (!linkError && linkData?.properties?.action_link) {
          resetLink = linkData.properties.action_link;
        } else {
          // Fallback: use Supabase's resetPasswordForEmail which generates the link
          // But we need to intercept it, so we'll use a custom approach
          resetLink = `${appUrl}/auth/reset-password?token=GENERATED_TOKEN`;
        }
      } catch (adminError) {
        console.error('Error generating reset link:', adminError);
      }
    }

    // If we couldn't generate a link with admin, use the regular method
    // Note: This will trigger Supabase's default email, but we'll send our own too
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/reset-password`,
    });

    // Generate our own reset link if we have admin access
    if (!resetLink && supabaseAdmin) {
      // Try to get the user and generate a recovery token
      const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
      const user = userData?.users?.find((u) => u.email === email);
      
      if (user) {
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: email,
        });
        resetLink = linkData?.properties?.action_link || `${appUrl}/auth/reset-password`;
      }
    }

    // Send our custom password reset email
    if (resetLink) {
      try {
        await sendPasswordResetEmail(email, resetLink);
      } catch (emailError) {
        console.error('Error sending reset email:', emailError);
        // Still return success if Supabase's email was sent
      }
    }

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Password reset error:', error);
    // Still return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
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
