import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { analyzeFoodImage, generateClientInsights } from '../services/geminiService';
import { Client, DailyPlan, FoodLog, Invoice, ProgressLog, SavedMealPlan, Meal, Appointment, Message, Notification, Reminder } from '../types';
import { BarChart, Bar, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2, Brain, BarChart3, TrendingUp, Utensils, FileText, Camera, CheckCircle, AlertTriangle, BadgePercent, ChevronDown, ChevronUp, Calendar, MessageSquare, Send, CreditCard, X, Dumbbell, Droplet, Bell, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useToast } from '../utils/toast';

declare global {
  interface Window {
    PaystackPop: any;
  }
}

interface ClientPortalProps {
  portalToken: string;
}

const getCurrencySymbol = (currencyCode?: string): string => {
  if (!currencyCode) return '$';
  switch (currencyCode.toUpperCase()) {
    case 'USD': return '$';
    case 'KES': return 'KSh';
    case 'NGN': return '₦';
    case 'GHS': return 'GH₵';
    default: return '$';
  }
};

// FIX: Changed from default export to named export.
export const ClientPortal: React.FC<ClientPortalProps> = ({ portalToken }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [mealPlan, setMealPlan] = useState<SavedMealPlan | null>(null);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  
  const [insight, setInsight] = useState('');
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const [foodImage, setFoodImage] = useState<File | null>(null);
  const [foodNote, setFoodNote] = useState('');
  const [analyzingFood, setAnalyzingFood] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');

  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [dismissingReminder, setDismissingReminder] = useState<string | null>(null);
  
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentStep, setPaymentStep] = useState<'options' | 'mpesa'>('options');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paystackKey, setPaystackKey] = useState<string | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('SW registered: ', registration);
        }).catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
      });
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  // Calculate unread message count (messages from nutritionist that are unread)
  const unreadMessageCount = messages.filter(msg => msg.sender === 'nutritionist' && !msg.isRead).length;

  // Mark messages as read when messages tab is opened
  useEffect(() => {
    if (activeTab === 'messages' && client?.id) {
      const markAsRead = async () => {
        await supabase.from('messages')
          .update({ is_read: true })
          .eq('client_id', client.id)
          .eq('sender', 'nutritionist')
          .eq('is_read', false);
        
        // Update local state
        setMessages(prev => prev.map(msg => 
          msg.sender === 'nutritionist' && !msg.isRead 
            ? { ...msg, isRead: true }
            : msg
        ));
      };
      markAsRead();
    }
  }, [activeTab, client?.id]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams(window.location.hash.split('?')[1]);
      const initialTab = params.get('tab');
      if (initialTab && ['overview', 'meal_plan', 'food_diary', 'appointments', 'messages', 'billing'].includes(initialTab)) {
        setActiveTab(initialTab);
      }

      try {
        const { data: clientData, error: clientError } = await supabase
          .rpc('get_portal_client_data', { p_portal_token: portalToken })
          .then(res => ({ data: res.data?.[0], error: res.error }));

        if (clientError || !clientData) throw new Error("Client portal not found or access denied.");

        // Normalise client data from DB (snake_case) into our Client interface (camelCase)
        const formattedClient: Client = {
          id: clientData.id,
          name: clientData.name,
          email: clientData.email,
          status: clientData.status || 'Active',
          goal: clientData.goal || 'General Health',
          lastCheckIn: clientData.last_check_in
            ? new Date(clientData.last_check_in).toLocaleDateString()
            : 'Never',
          avatarUrl:
            clientData.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              clientData.name || 'Client'
            )}&background=93C47D&color=fff`,
          joinedAt: clientData.created_at,
          portalAccessToken: clientData.portal_access_token,
          age: clientData.age,
          gender: clientData.gender,
          weight: clientData.weight,
          height: clientData.height,
          activityLevel: clientData.activity_level,
          allergies: clientData.allergies,
          preferences: clientData.preferences,
          medicalHistory: clientData.medical_history,
          medications: clientData.medications,
          dietaryHistory: clientData.dietary_history,
          socialBackground: clientData.social_background,
          habits: clientData.habits ? JSON.parse(clientData.habits) : undefined,
          bodyFatPercentage: clientData.body_fat_percentage,
          bodyFatMass: clientData.body_fat_mass,
          skeletalMuscleMass: clientData.skeletal_muscle_mass,
          skeletalMusclePercentage: clientData.skeletal_muscle_percentage,
        };

        setClient(formattedClient);

        const { data: keyData, error: keyError } = await supabase.rpc('get_paystack_key_for_client', { p_portal_token: portalToken });
        if (keyError) {
          console.warn("Could not fetch payment configuration.");
        } else {
          setPaystackKey(keyData);
        }
        
        const [planRes, progressRes, invoiceRes, foodLogRes, apptRes, msgRes, remindersRes] = await Promise.all([
          supabase.rpc('get_portal_meal_plans', { p_portal_token: portalToken }),
          supabase.rpc('get_portal_progress_logs', { p_portal_token: portalToken }),
          supabase.rpc('get_portal_invoices', { p_portal_token: portalToken }),
          supabase.rpc('get_portal_food_logs', { p_portal_token: portalToken }),
          supabase.rpc('get_portal_appointments', { p_portal_token: portalToken }),
          supabase.rpc('get_portal_messages', { p_portal_token: portalToken }),
          supabase.rpc('get_portal_reminders', { p_portal_token: portalToken }),
        ]);
        
        if (planRes.data?.[0]) {
            const plan = planRes.data[0];
            const planData = Array.isArray(plan.plan_data) ? plan.plan_data : [plan.plan_data];
            const formattedPlan: SavedMealPlan = { id: plan.id, clientId: plan.client_id, createdAt: plan.created_at, planData: planData, label: plan.day_label || 'Weekly Plan' };
            setMealPlan(formattedPlan);
            if (formattedPlan.planData && formattedPlan.planData.length > 0) setExpandedDay(formattedPlan.planData[0].day);
        }

        if (progressRes.data) {
          const formattedLogs: ProgressLog[] = (progressRes.data as any[]).map((log: any) => ({
            id: log.id,
            date: log.date,
            weight: log.weight,
            complianceScore: log.compliance_score,
            notes: log.notes,
            bodyFatPercentage: log.body_fat_percentage,
            bodyFatMass: log.body_fat_mass,
            skeletalMuscleMass: log.skeletal_muscle_mass,
            skeletalMusclePercentage: log.skeletal_muscle_percentage,
          }));
          setProgressLogs(formattedLogs);
        }
        if (invoiceRes.data) setInvoices(invoiceRes.data as Invoice[]);
        if (foodLogRes.data) {
          const formattedFoodLogs: FoodLog[] = (foodLogRes.data as any[]).map((log: any) => ({
            id: log.id,
            clientId: log.client_id,
            aiAnalysis: log.ai_analysis || null,
            imageUrl: log.image_url || null,
            notes: log.notes || null,
            createdAt: log.created_at || new Date().toISOString()
          }));
          setFoodLogs(formattedFoodLogs);
        }
        if(apptRes.data) setAppointments(apptRes.data as Appointment[]);
        if(msgRes.data) {
          const formattedMessages: Message[] = (msgRes.data as any[]).map((msg: any) => ({
            id: msg.id,
            clientId: msg.client_id,
            sender: msg.sender,
            content: msg.content,
            createdAt: msg.created_at || new Date().toISOString(),
            isRead: msg.is_read || false
          }));
          // Sort by date ascending (oldest first, newest at bottom)
          formattedMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          setMessages(formattedMessages);
        }
        if(remindersRes.data) {
          const formattedReminders: Reminder[] = (remindersRes.data as any[]).map((rem: any) => ({
            id: rem.id,
            clientId: rem.client_id,
            title: rem.title,
            message: rem.message,
            createdAt: rem.created_at || new Date().toISOString(),
            isDismissed: rem.is_dismissed || false,
            dismissedAt: rem.dismissed_at || undefined
          }));
          setReminders(formattedReminders);
        }

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [portalToken]);

  useEffect(() => {
    const clientId = client?.id;
    if (!clientId) return;

    const messagesChannel = supabase.channel(`client-portal-messages-${clientId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const rawMsg = payload.new;
          const newMessage: Message = { 
            id: rawMsg.id, 
            clientId: rawMsg.client_id, 
            sender: rawMsg.sender, 
            content: rawMsg.content, 
            createdAt: rawMsg.created_at || new Date().toISOString(), 
            isRead: rawMsg.is_read || false 
          };
          
          setMessages(prev => {
            if (!prev.some(m => m.id === newMessage.id)) {
              // Add new message and sort by date
              const updated = [...prev, newMessage];
              updated.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
              return updated;
            }
            return prev;
          });
          
          if (newMessage.sender === 'nutritionist') {
             const newNotification: Notification = { 
                id: newMessage.id, 
                clientId: newMessage.clientId, 
                clientName: 'Your Nutritionist', 
                content: newMessage.content, 
                createdAt: newMessage.createdAt,
                type: 'message' 
            };
             setNotifications(prev => [newNotification, ...prev].slice(0, 10));
             setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const updatedMsg = payload.new;
          setMessages(prev => prev.map(msg => 
            msg.id === updatedMsg.id 
              ? { ...msg, isRead: updatedMsg.is_read || false }
              : msg
          ));
        }
      )
      .subscribe();

    const invoicesChannel = supabase.channel(`client-portal-invoices-${clientId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'invoices', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const newInvoice = payload.new as Invoice;
          const newNotification: Notification = {
            id: newInvoice.id,
            clientId: newInvoice.clientId,
            clientName: 'Your Nutritionist',
            content: `You have a new invoice for ${getCurrencySymbol(newInvoice.currency)}${newInvoice.amount.toFixed(2)}.`,
            createdAt: newInvoice.generatedAt,
            type: 'invoice'
          };
          setNotifications(prev => [newNotification, ...prev].slice(0, 10));
          setUnreadCount(prev => prev + 1);
        }
      ).subscribe();

    const mealPlansChannel = supabase.channel(`client-portal-mealplans-${clientId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'meal_plans', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const newPlan = payload.new as SavedMealPlan;
          const newNotification: Notification = {
            id: newPlan.id,
            clientId: newPlan.clientId,
            clientName: 'Your Nutritionist',
            content: `Your new meal plan is ready to view.`,
            createdAt: newPlan.createdAt,
            type: 'meal_plan'
          };
          setNotifications(prev => [newNotification, ...prev].slice(0, 10));
          setUnreadCount(prev => prev + 1);
        }
      ).subscribe();

    const remindersChannel = supabase.channel(`client-portal-reminders-${clientId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reminders', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const rawReminder = payload.new;
          const newReminder: Reminder = {
            id: rawReminder.id,
            clientId: rawReminder.client_id,
            title: rawReminder.title,
            message: rawReminder.message,
            createdAt: rawReminder.created_at || new Date().toISOString(),
            isDismissed: rawReminder.is_dismissed || false,
            dismissedAt: rawReminder.dismissed_at || undefined
          };
          setReminders(prev => [newReminder, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reminders', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const updatedReminder = payload.new;
          if (updatedReminder.is_dismissed) {
            setReminders(prev => prev.filter(r => r.id !== updatedReminder.id));
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(invoicesChannel);
      supabase.removeChannel(mealPlansChannel);
      supabase.removeChannel(remindersChannel);
    };
  }, [client?.id]);

  const handleNotificationClick = (notification: Notification) => {
    setShowNotifications(false);
    switch (notification.type) {
        case 'message':
            setActiveTab('messages');
            break;
        case 'invoice':
            setActiveTab('billing');
            break;
        case 'meal_plan':
            setActiveTab('meal_plan');
            break;
        default:
            setActiveTab('overview');
    }
  }

  const handleDismissReminder = async (reminderId: string) => {
    setDismissingReminder(reminderId);
    try {
      const { data, error } = await supabase.rpc('dismiss_portal_reminder', {
        p_portal_token: portalToken,
        p_reminder_id: reminderId
      }).then(res => ({ data: res.data?.[0], error: res.error }));
      
      if (error) throw error;
      
      // Remove from local state
      setReminders(prev => prev.filter(r => r.id !== reminderId));
      showToast('Reminder dismissed', 'success');
    } catch (err: any) {
      showToast('Failed to dismiss reminder: ' + err.message, 'error');
    } finally {
      setDismissingReminder(null);
    }
  };

  const handleGenerateInsight = async () => {
    if (!client) return;
    setGeneratingInsight(true);
    setInsight('');
    const weightHistory = progressLogs.length > 0 ? progressLogs.slice(-5).map(l => Number(l.weight)) : [client.weight || 0];
    try {
        const result = await generateClientInsights(client.name, weightHistory, client.goal);
        setInsight(result);
    } catch (e: any) {
        setInsight("Sorry, an error occurred while generating your insight.");
    } finally {
        setGeneratingInsight(false);
    }
  };

  const handleFoodAnalysis = async () => {
    if ((!foodImage && !foodNote.trim()) || !client) return;
    setAnalyzingFood(true);
    setAnalysisResult('');

    try {
      let publicUrl: string | null = null, base64: string | null = null, mimeType: string | null = null;
      if (foodImage) {
        // Read file for AI analysis first
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => { 
            try { 
              base64 = (reader.result as string).split(',')[1]; 
              mimeType = foodImage.type; 
              resolve(); 
            } catch (e) { 
              reject(e); 
            } 
          };
          reader.onerror = reject; 
          reader.readAsDataURL(foodImage);
        });

        // Try to upload to storage, but don't fail if it doesn't work
        const filePath = `${client.id}/${new Date().getTime()}.${foodImage.name.split('.').pop()}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('food_logs').upload(filePath, foodImage, {
          cacheControl: '3600',
          upsert: false
        });
        
        if (uploadError) {
          console.warn('Storage upload failed:', uploadError);
          // Continue without image URL - we can still save the log with AI analysis
        } else {
          const { data: urlData } = supabase.storage.from('food_logs').getPublicUrl(filePath);
          publicUrl = urlData?.publicUrl || null;
        }
      }
      
      const result = await analyzeFoodImage(base64, mimeType, foodNote.trim(), client.goal);
      setAnalysisResult(result);
      
      const { data: newLog, error: insertError } = await supabase.rpc('insert_portal_food_log', {
        p_portal_token: portalToken,
        p_ai_analysis: result,
        p_image_url: publicUrl,
        p_notes: foodNote.trim()
      }).then(res => ({ data: res.data?.[0], error: res.error }));

      if (insertError) throw insertError;

      if (newLog) {
        const formattedLog: FoodLog = {
          id: newLog.id,
          clientId: newLog.client_id,
          aiAnalysis: newLog.ai_analysis || null,
          imageUrl: newLog.image_url || null,
          notes: newLog.notes || null,
          createdAt: newLog.created_at || new Date().toISOString()
        };
        setFoodLogs([formattedLog, ...foodLogs]);
      }
      setFoodImage(null); 
      setFoodNote('');
    } catch (e: any) {
      setAnalysisResult("Error processing food log: " + e.message);
      console.error('Food log error:', e);
    } finally {
      setAnalyzingFood(false);
    }
  };


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !client) return;
    const content = newMessage.trim();
    setNewMessage('');
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage: Message = { 
      id: tempId, 
      clientId: client.id, 
      sender: 'client', 
      content, 
      createdAt: new Date().toISOString(), 
      isRead: false 
    };
    setMessages(prev => {
      const updated = [...prev, optimisticMessage];
      updated.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return updated;
    });
    try {
      const { data, error } = await supabase.rpc('insert_portal_message', {
        p_portal_token: portalToken,
        p_content: content
      }).then(res => ({ data: res.data?.[0], error: res.error }));
      
      if (error) throw error;
      
      if (data) {
        const formattedMessage: Message = {
          id: data.id,
          clientId: data.client_id,
          sender: data.sender,
          content: data.content,
          createdAt: data.created_at || new Date().toISOString(),
          isRead: data.is_read || false
        };
        setMessages(prev => {
          const updated = prev.map(m => m.id === tempId ? formattedMessage : m);
          updated.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          return updated;
        });
      }
    } catch (err) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempId);
        filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return filtered;
      });
      setNewMessage(content);
    }
  };
  
  const handlePaystackPayment = () => {
    if (!client || !selectedInvoice || !paystackKey) {
      showToast("Payments for this practice are not configured correctly. Please contact your nutritionist.", 'error');
      return;
    }
    if (!window.PaystackPop) {
      showToast("Payment gateway could not be loaded. Please check your internet connection and try again.", 'error');
      return;
    }

    const onPaymentSuccess = async (response: any) => {
      try {
        const { error } = await supabase.rpc('update_invoice_after_payment', {
            p_portal_token: portalToken,
            p_invoice_id: selectedInvoice.id,
            p_payment_method: 'Paystack',
            p_transaction_ref: response.reference,
        });

        if (error) throw error;

        setInvoices(
          invoices.map((inv) =>
            inv.id === selectedInvoice.id
              ? { ...inv, status: 'Paid', paymentMethod: 'Paystack', transactionRef: response.reference }
              : inv
          )
        );
        setShowPaymentModal(false);
        showToast('Payment successful!', 'success');
      } catch (e: any) {
        showToast('Payment verification failed. Please contact support with your transaction reference: ' + response.reference, 'error');
      }
    };

    const handler = window.PaystackPop.setup({
      key: paystackKey,
      email: client.email,
      amount: selectedInvoice.amount * 100, 
      currency: selectedInvoice.currency || 'NGN',
      ref: `nutriflow_${selectedInvoice.id.substring(0, 8)}_${Date.now()}`,
      callback: (response: any) => {
        onPaymentSuccess(response);
      },
      onClose: () => {},
    });

    handler.openIframe();
  };

  const handleMpesaPayment = async () => {
    if (!selectedInvoice) return;
    setProcessingPayment(true);
    try {
      // This would typically call a backend function to trigger M-Pesa STK push.
      // For now, we simulate by just updating the status.
      // const { error } = await supabase.rpc('trigger_mpesa_payment', { ... });
      setShowPaymentModal(false);
      showToast('A payment prompt has been sent to your phone. This is a demo.', 'info');
    } catch(e) {
      showToast('Failed to initiate M-Pesa payment.', 'error');
    } finally {
      setProcessingPayment(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-12 h-12 animate-spin text-[#8C3A36]" /></div>;
  if (error || !client) return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center"><AlertTriangle className="w-12 h-12 text-red-500 mb-4" /><h1 className="text-2xl font-bold text-slate-800 mb-2">Access Error</h1><p className="text-slate-600">{error || "Could not load client data."}</p><p className="text-sm text-slate-500 mt-4">Contact your nutritionist.</p></div>;

  const MealCard: React.FC<{ meal: Meal, type: string }> = ({ meal, type }) => {
    if (!meal) return null;
    const icon = type === 'breakfast' ? '🍳' : type === 'lunch' ? '🥗' : '🍽️';
    return (
      <div className="bg-slate-50 p-3 sm:p-4 rounded-lg border border-slate-200/80 flex gap-3 sm:gap-4 items-start">
        <div className="text-xl sm:text-2xl pt-1 flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-slate-800 capitalize text-sm sm:text-base">{meal.name}</h4>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{meal.ingredients?.join(', ')}</p>
          <div className="flex flex-wrap gap-x-2 sm:gap-x-3 gap-y-1 text-[10px] sm:text-xs mt-2 font-medium">
            <span className="text-slate-600">{meal.calories} kcal</span><span className="text-blue-600">{meal.protein} P</span><span className="text-amber-600">{meal.carbs} C</span><span className="text-rose-600">{meal.fats} F</span>
          </div>
        </div>
      </div>
    );
  };
  
  const ShortcutCard: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
    <button
      onClick={onClick}
      className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-[#8C3A36] transform hover:-translate-y-1 transition-all duration-200 flex flex-col items-center justify-center text-center group"
    >
      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#F9F5F5] text-[#8C3A36] rounded-full flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-[#8C3A36] group-hover:text-white transition-colors">
        {icon}
      </div>
      <span className="font-bold text-slate-700 text-xs sm:text-sm">{label}</span>
    </button>
  );

  const getStatusColor = (status: string) => {
    switch(status) { case 'Confirmed': return 'bg-emerald-100 text-emerald-700'; case 'Pending': return 'bg-amber-100 text-amber-700'; case 'Cancelled': return 'bg-red-50 text-red-400 decoration-line-through'; case 'Completed': return 'bg-slate-100 text-slate-500'; default: return 'bg-blue-100 text-blue-700'; }
  };
  const getInvoiceStatusColor = (status: Invoice['status']) => {
     switch(status) { case 'Paid': return 'bg-green-100 text-green-800'; case 'Overdue': return 'bg-red-100 text-red-800'; case 'Processing': return 'bg-blue-100 text-blue-800'; default: return 'bg-amber-100 text-amber-800'; }
  };

  const currentStats = {
    weight: progressLogs.length > 0 ? progressLogs[progressLogs.length - 1].weight : client.weight,
    bodyFatPercent: progressLogs.length > 0 ? progressLogs[progressLogs.length - 1].bodyFatPercentage : client.bodyFatPercentage,
    bodyFatMass: progressLogs.length > 0 ? progressLogs[progressLogs.length - 1].bodyFatMass : client.bodyFatMass,
    muscleMass: progressLogs.length > 0 ? progressLogs[progressLogs.length - 1].skeletalMuscleMass : client.skeletalMuscleMass,
    musclePercent: progressLogs.length > 0 ? progressLogs[progressLogs.length - 1].skeletalMusclePercentage : client.skeletalMusclePercentage,
  };

  const renderContent = () => {
    switch(activeTab) {
      case 'meal_plan':
        if (!mealPlan || !mealPlan.planData) return (<div className="text-center p-12 bg-white rounded-lg"><p className="text-slate-500">No meal plan assigned.</p></div>);
        return (
            <div className="space-y-3 sm:space-y-4">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 px-2 sm:px-0">Your Current Meal Plan</h2>
                {mealPlan.planData.map(day => { 
                    const isExpanded = expandedDay === day.day; 
                    return (
                        <div key={day.day} className="bg-white rounded-xl border border-slate-200 overflow-hidden transition-all duration-300 shadow-sm">
                            <button onClick={() => setExpandedDay(isExpanded ? null : day.day)} className="w-full flex justify-between items-center p-4 sm:p-5 text-left hover:bg-slate-50/50">
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold text-[#8C3A36]">{day.day}</h3>
                                    <p className="text-sm text-slate-500 mt-1">{day.summary}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <span className="font-bold text-slate-700 sm:text-lg">{day.totalCalories}</span>
                                        <span className="text-xs text-slate-400 font-normal ml-1">kcal</span>
                                    </div>
                                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-500 flex-shrink-0" />}
                                </div>
                            </button>
                            {isExpanded && (
                                <div className="px-4 sm:px-5 pb-5 pt-2 space-y-4 animate-in fade-in duration-300 border-t border-slate-100">
                                    <MealCard meal={day.breakfast} type="breakfast" />
                                    <MealCard meal={day.lunch} type="lunch" />
                                    <MealCard meal={day.dinner} type="dinner" />
                                    {day.snacks && day.snacks.length > 0 && (
                                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200/80">
                                            <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-2 text-sm">🍎 Snacks</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {day.snacks.map((snack, idx) => (
                                                    <div key={idx} className="bg-white p-3 rounded-md border border-slate-200">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <p className="text-sm font-semibold text-slate-700">{snack.name}</p>
                                                                <p className="text-xs text-slate-500">{snack.ingredients?.join(', ')}</p>
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-500">{snack.calories} kcal</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
      case 'food_diary':
        return (
            <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 space-y-4">
                    <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800">Log Your Meal</h2>
                    <p className="text-xs sm:text-sm text-slate-600">Upload a photo, write a description, or both. AI will provide instant analysis.</p>
                    <div className="relative border-2 border-dashed border-slate-300 rounded-lg p-4 sm:p-6 text-center cursor-pointer hover:bg-slate-50">
                        <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0" onChange={(e) => e.target.files && setFoodImage(e.target.files[0])} />
                        {foodImage ? <div className="flex flex-col items-center gap-2 text-[#8C3A36]"><CheckCircle className="w-6 h-6 sm:w-8 sm:h-8"/><span className="font-medium text-xs sm:text-sm break-all">{foodImage.name}</span></div> : <div className="flex flex-col items-center gap-2 text-slate-500"><Camera className="w-6 h-6 sm:w-8 sm:h-8"/><span className="font-medium text-xs sm:text-sm sm:text-base">Upload photo (optional)</span></div>}
                    </div>
                    <div>
                        <textarea value={foodNote} onChange={(e) => setFoodNote(e.target.value)} placeholder="Or describe your meal here..." className="w-full p-3 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-[#8C3A36]/20 focus:border-[#8C3A36] outline-none resize-none h-20 sm:h-24 transition-all" />
                    </div>
                    <button onClick={handleFoodAnalysis} disabled={(!foodImage && !foodNote.trim()) || analyzingFood} className="w-full py-2.5 sm:py-3 bg-[#8C3A36] text-white font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base hover:bg-[#7a2f2b]">{analyzingFood ? <><Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> Analyzing...</> : "Analyze & Log Meal"}</button>
                    {analysisResult && (
                      <div className="p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200 animate-in fade-in duration-300">
                        <h4 className="font-bold text-slate-800 mb-2 text-sm sm:text-base">Analysis Result:</h4>
                        <div className="text-xs sm:text-sm text-slate-700 prose prose-sm max-w-none">
                          <ReactMarkdown
                            components={{
                              p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                              strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                              ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
                              ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
                              li: ({node, ...props}) => <li className="ml-2" {...props} />,
                              h1: ({node, ...props}) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0" {...props} />,
                              h2: ({node, ...props}) => <h2 className="text-sm font-bold mb-2 mt-3 first:mt-0" {...props} />,
                              h3: ({node, ...props}) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0" {...props} />,
                            }}
                          >
                            {analysisResult}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                </div>
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200">
                    <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800 mb-3 sm:mb-4">Your Diary</h2>
                    <div className="space-y-2 sm:space-y-3 max-h-[50vh] lg:max-h-[600px] overflow-y-auto pr-1 sm:pr-2">
                        {foodLogs.length > 0 ? foodLogs.map(log => { 
                            const isExpanded = expandedLogId === log.id; 
                            return (
                                <div key={log.id} className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                                    <button onClick={() => setExpandedLogId(isExpanded ? null : log.id)} className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-100 transition-colors">
                                        <div className="flex items-center gap-3 w-full overflow-hidden">
                                            {log.imageUrl ? <img src={log.imageUrl} alt="Food log" className="w-12 h-12 rounded-md object-cover bg-slate-200 flex-shrink-0"/> : <div className="w-12 h-12 rounded-md bg-slate-200 flex items-center justify-center flex-shrink-0"><FileText className="w-6 h-6 text-slate-400" /></div>}
                                            <div className="flex-1 overflow-hidden text-left">
                                                <p className="font-semibold text-slate-700 text-sm truncate">{log.notes ? log.notes : 'Image Log Entry'}</p>
                                                <p className="text-xs font-bold text-slate-400 uppercase">
                                                  {log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Invalid Date'}
                                                </p>
                                            </div>
                                        </div>
                                        {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500 flex-shrink-0 ml-2" /> : <ChevronDown className="w-5 h-5 text-slate-500 flex-shrink-0 ml-2" />}
                                    </button>
                                    {isExpanded && (
                                      <div className="p-4 border-t border-slate-200 animate-in fade-in duration-200">
                                        {log.imageUrl && <img src={log.imageUrl} alt="Food log" className="w-full h-auto max-h-64 object-contain rounded-lg mb-4 bg-slate-100"/>}
                                        {log.notes && (
                                          <div className="mb-4">
                                            <h5 className="text-xs font-bold text-slate-400 uppercase mb-1">Your Note</h5>
                                            <p className="text-sm text-slate-600 bg-white p-3 rounded-md border">{log.notes}</p>
                                          </div>
                                        )}
                                        <h5 className="text-xs font-bold text-slate-400 uppercase mb-1">AI Analysis</h5>
                                        <div className="text-sm text-slate-600 prose prose-sm max-w-none">
                                          <ReactMarkdown
                                            components={{
                                              p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                              strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                                              ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
                                              ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
                                              li: ({node, ...props}) => <li className="ml-2" {...props} />,
                                              h1: ({node, ...props}) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0" {...props} />,
                                              h2: ({node, ...props}) => <h2 className="text-sm font-bold mb-2 mt-3 first:mt-0" {...props} />,
                                              h3: ({node, ...props}) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0" {...props} />,
                                            }}
                                          >
                                            {log.aiAnalysis || 'No analysis available.'}
                                          </ReactMarkdown>
                                        </div>
                                      </div>
                                    )}
                                </div>
                            );
                        }) : <p className="text-slate-500 text-center py-8">No meals logged.</p>}
                    </div>
                </div>
            </div>
        );
      case 'appointments':
        const upcoming = appointments.filter(a => new Date(a.date) >= new Date()), past = appointments.filter(a => new Date(a.date) < new Date());
        return (
            <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">Your Appointments</h2>
                <div className="space-y-4 sm:space-y-6">
                    <div>
                        <h3 className="font-bold text-slate-600 mb-2 sm:mb-3 border-b pb-2 text-sm sm:text-base">Upcoming</h3>
                        {upcoming.length > 0 ? <div className="space-y-2 sm:space-y-3">{upcoming.map(appt => <div key={appt.id} className="p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0"><div className="flex-1"><p className="font-bold text-slate-800 text-sm sm:text-base">{new Date(appt.date).toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p><p className="text-xs sm:text-sm text-slate-500">{appt.type}</p></div><span className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded-full ${getStatusColor(appt.status)}`}>{appt.status}</span></div>)}</div> : <p className="text-slate-500 italic text-sm">No upcoming appointments.</p>}
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-600 mb-2 sm:mb-3 border-b pb-2 text-sm sm:text-base">Past</h3>
                        {past.length > 0 ? <div className="space-y-2 sm:space-y-3">{past.map(appt => <div key={appt.id} className="p-3 sm:p-4 bg-slate-50/70 rounded-lg border border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 opacity-70"><div className="flex-1"><p className="font-bold text-slate-600 text-sm sm:text-base">{new Date(appt.date).toLocaleDateString()}</p><p className="text-xs sm:text-sm text-slate-500">{appt.type}</p></div><span className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded-full ${getStatusColor(appt.status)}`}>{appt.status}</span></div>)}</div> : <p className="text-slate-500 italic text-sm">No past appointments.</p>}
                    </div>
                </div>
            </div>
        );
      case 'messages':
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-14rem)] sm:h-[calc(100vh-17rem)] lg:h-[calc(100vh-16rem)]">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800 p-3 sm:p-4 border-b">Messages</h2>
                <div className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto flex flex-col">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex flex-col max-w-[75%] sm:max-w-xs lg:max-w-md ${msg.sender === 'client' ? 'self-end items-end' : 'self-start items-start'}`}>
                      <div className={`px-3 sm:px-4 py-2 rounded-2xl text-sm sm:text-base ${msg.sender === 'client' ? 'bg-[#8C3A36] text-white rounded-br-none' : 'bg-slate-100 text-slate-800 rounded-bl-none'}`}>
                        {msg.content}
                      </div>
                      <span className="text-[10px] sm:text-xs text-slate-400 mt-1 px-1">
                        {msg.createdAt && !isNaN(new Date(msg.createdAt).getTime()) 
                          ? new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                          : 'Invalid Date'}
                      </span>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t bg-slate-50 flex items-center gap-2 sm:gap-3 sticky bottom-0"><input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type your message..." className="flex-1 w-full p-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-[#8C3A36] focus:border-[#8C3A36]" /><button type="submit" className="p-2 bg-[#8C3A36] text-white rounded-lg hover:bg-[#7a2f2b] disabled:opacity-50 flex-shrink-0" disabled={!newMessage.trim()}><Send className="w-4 h-4 sm:w-5 sm:h-5"/></button></form>
            </div>
        );
      case 'billing':
        return (
            <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800 mb-3 sm:mb-4">Your Invoices</h2>
                <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
                    {/* Mobile Card View */}
                    <div className="block sm:hidden space-y-3">
                        {invoices.length > 0 ? invoices.map(inv => (
                            <div key={inv.id} className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium">{new Date(inv.generatedAt).toLocaleDateString()}</p>
                                        <p className="font-bold text-slate-800 mt-1">{getCurrencySymbol(inv.currency)}{inv.amount.toFixed(2)}</p>
                                    </div>
                                    <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${getInvoiceStatusColor(inv.status)}`}>{inv.status}</span>
                                </div>
                                {(inv.status === 'Pending' || inv.status === 'Overdue') && paystackKey ? (
                                    <button onClick={() => { setSelectedInvoice(inv); setShowPaymentModal(true); setPaymentStep('options');}} className="w-full mt-2 bg-[#8C3A36] text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#7a2f2b]">Pay Now</button>
                                ) : null}
                            </div>
                        )) : <p className="text-slate-500 text-center py-8 text-sm">No invoices found.</p>}
                    </div>
                    {/* Desktop Table View */}
                    <table className="w-full text-left text-sm hidden sm:table">
                        <thead className="border-b text-slate-500"><tr><th className="py-2 px-3">Date</th><th className="py-2 px-3">Amount</th><th className="py-2 px-3">Status</th><th className="py-2 px-3 text-right">Action</th></tr></thead>
                        <tbody>
                          {invoices.length > 0 ? invoices.map(inv => (
                            <React.Fragment key={inv.id}>
                              <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedInvoiceId(expandedInvoiceId === inv.id ? null : inv.id)}>
                                <td className="py-3 px-3">{new Date(inv.generatedAt).toLocaleDateString()}</td>
                                <td className="py-3 px-3 font-medium">{getCurrencySymbol(inv.currency)}{inv.amount.toFixed(2)}</td>
                                <td className="py-3 px-3"><span className={`px-2 py-1 text-xs font-bold rounded-full ${getInvoiceStatusColor(inv.status)}`}>{inv.status}</span></td>
                                <td className="py-3 px-3 text-right">
                                  {(inv.status === 'Pending' || inv.status === 'Overdue') && paystackKey ? (
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv); setShowPaymentModal(true); setPaymentStep('options');}} className="bg-[#8C3A36] text-white px-3 py-1 rounded-md text-xs font-bold hover:bg-[#7a2f2b]">Pay Now</button>
                                  ) : (inv.status === 'Pending' || inv.status === 'Overdue') && !paystackKey ? (
                                    <span className="text-xs text-slate-400">Payments not enabled</span>
                                  ) : inv.status === 'Processing' ? (
                                    <span className="text-xs text-blue-600 font-semibold">Verifying...</span>
                                  ) : (
                                    <div className="flex justify-end items-center">
                                      <span className="text-xs text-slate-400 mr-2">Details</span>
                                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedInvoiceId === inv.id ? 'rotate-180' : ''}`} />
                                    </div>
                                  )}
                                </td>
                              </tr>
                              {expandedInvoiceId === inv.id && (
                                <tr className="bg-slate-50/50">
                                  <td colSpan={4} className="p-4">
                                    <div className="max-w-md mx-auto">
                                      <h4 className="font-bold text-slate-700 mb-2">Invoice Details</h4>
                                      <div className="space-y-1 text-sm text-slate-600 bg-white p-3 rounded-md border">
                                        {inv.items.map((item, index) => (
                                          <div key={index} className="flex justify-between items-center py-1">
                                            <span>{item.description}</span>
                                            <span className="font-medium text-slate-800">{getCurrencySymbol(inv.currency)}{item.cost.toFixed(2)}</span>
                                          </div>
                                        ))}
                                        <div className="flex justify-between font-bold pt-2 border-t mt-2 text-slate-900">
                                          <span>Total</span>
                                          <span>{getCurrencySymbol(inv.currency)}{inv.amount.toFixed(2)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )) : <tr><td colSpan={4} className="text-center py-8 text-slate-500 px-3">No invoices found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        );
      case 'overview':
      default:
        return (
          <div className="space-y-4 sm:space-y-6 lg:space-y-8">
            {/* Reminders Section */}
            {reminders.length > 0 && (
              <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2">
                  <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-[#8FAA41]" />
                  Reminders from Your Nutritionist
                </h2>
                <div className="space-y-3">
                  {reminders.map(reminder => (
                    <div key={reminder.id} className="bg-[#F9F5F5] border border-[#8FAA41]/20 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-1">{reminder.title}</h3>
                        <p className="text-xs sm:text-sm text-slate-600">{reminder.message}</p>
                        <p className="text-[10px] sm:text-xs text-slate-400 mt-1">
                          {new Date(reminder.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDismissReminder(reminder.id)}
                        disabled={dismissingReminder === reminder.id}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#8FAA41] text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-[#7d9537] disabled:opacity-50 flex items-center gap-1.5 sm:gap-2 flex-shrink-0"
                      >
                        {dismissingReminder === reminder.id ? (
                          <><Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> Dismissing...</>
                        ) : (
                          <>✓ Dismiss</>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <ShortcutCard icon={<Utensils className="w-5 h-5 sm:w-6 sm:h-6"/>} label="Meal Plan" onClick={() => setActiveTab('meal_plan')} />
              <ShortcutCard icon={<Camera className="w-5 h-5 sm:w-6 sm:h-6"/>} label="Food Diary" onClick={() => setActiveTab('food_diary')} />
              <ShortcutCard icon={<Calendar className="w-5 h-5 sm:w-6 sm:h-6"/>} label="Appointments" onClick={() => setActiveTab('appointments')} />
              <ShortcutCard icon={<MessageSquare className="w-5 h-5 sm:w-6 sm:h-6"/>} label="Messages" onClick={() => setActiveTab('messages')} />
              <ShortcutCard icon={<CreditCard className="w-5 h-5 sm:w-6 sm:h-6"/>} label="Billing" onClick={() => setActiveTab('billing')} />
            </div>
          
            {/* Metrics Cards - Matching ClientProfile Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]" />
                  <span className="text-xs sm:text-sm font-medium text-slate-500 uppercase">Age</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900">{client.age ?? 'N/A'}</div>
                <div className="text-xs sm:text-sm text-slate-400 mt-1">yrs</div>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]" />
                  <span className="text-xs sm:text-sm font-medium text-slate-500 uppercase">Weight</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900">{currentStats.weight?.toFixed(1) ?? 'N/A'}</div>
                <div className="text-xs sm:text-sm text-slate-400 mt-1">kg</div>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Droplet className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
                  <span className="text-xs sm:text-sm font-medium text-slate-500 uppercase">Body Fat</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900">
                  {currentStats.bodyFatPercent != null ? `${currentStats.bodyFatPercent.toFixed(1)}%` : 
                   currentStats.bodyFatMass != null ? `${currentStats.bodyFatMass.toFixed(1)}` : 'N/A'}
                </div>
                <div className="text-xs sm:text-sm text-slate-400 mt-1">
                  {currentStats.bodyFatPercent != null && currentStats.bodyFatMass != null ? `${currentStats.bodyFatMass.toFixed(1)} kg` :
                   currentStats.bodyFatPercent != null ? '%' :
                   currentStats.bodyFatMass != null ? 'kg' : ''}
                </div>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Dumbbell className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                  <span className="text-xs sm:text-sm font-medium text-slate-500 uppercase">Muscle Mass</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900">
                  {currentStats.muscleMass != null ? `${currentStats.muscleMass.toFixed(1)}` :
                   currentStats.musclePercent != null ? `${currentStats.musclePercent.toFixed(1)}%` : 'N/A'}
                </div>
                <div className="text-xs sm:text-sm text-slate-400 mt-1">
                  {currentStats.muscleMass != null && currentStats.musclePercent != null ? `${currentStats.musclePercent.toFixed(1)}%` :
                   currentStats.muscleMass != null ? 'kg' :
                   currentStats.musclePercent != null ? '%' : ''}
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                <div className="lg:col-span-2 space-y-4 sm:space-y-6 lg:space-y-8">
                    <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200">
                        <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]" /> Progress Snapshot</h2>
                        {progressLogs.length > 1 ? <div className="h-48 sm:h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={progressLogs}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} tick={{fontSize: 10}}/><YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{fontSize: 10}}/><Tooltip /><Line type="monotone" dataKey="weight" stroke="#8FAA41" strokeWidth={2} name="Weight (kg)" /></LineChart></ResponsiveContainer></div> : <p className="text-slate-500 text-center py-6 sm:py-8 text-sm">Not enough data to show a trend.</p>}
                    </div>
                    <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200">
                        <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2"><BadgePercent className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" /> Compliance Overview</h2>
                        {progressLogs.length > 1 ? <div className="h-48 sm:h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={progressLogs}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} tick={{fontSize: 10}} /><YAxis domain={[0, 100]} tick={{fontSize: 10}} /><Tooltip formatter={(value) => `${value}%`} /><Bar dataKey="complianceScore" fill="#8b5cf6" name="Compliance" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div> : <p className="text-slate-500 text-center py-6 sm:py-8 text-sm">Log progress to see compliance.</p>}
                    </div>
                </div>
                <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                    <div className="bg-gradient-to-br from-[#8C3A36] to-[#7a2f2b] text-white p-4 sm:p-6 rounded-xl shadow-lg">
                        <h3 className="font-bold text-base sm:text-lg mb-2 flex items-center gap-2"><Brain className="w-4 h-4 sm:w-5 sm:h-5"/> AI Coach Insights</h3>
                        <div className="min-h-[100px] sm:min-h-[120px] text-xs sm:text-sm opacity-90">{generatingInsight && <div className="flex items-center gap-2"><Loader2 className="animate-spin w-3.5 h-3.5 sm:w-4 sm:h-4" /> Generating...</div>}{insight || "Click for a personalized tip."}</div>
                        <button onClick={handleGenerateInsight} disabled={generatingInsight} className="w-full mt-3 sm:mt-4 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg py-2 text-sm sm:text-base font-semibold disabled:opacity-50">{generatingInsight ? 'Thinking...' : 'Generate Tip'}</button>
                    </div>
                    <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200"><h3 className="font-bold text-slate-800 mb-2 text-sm sm:text-base">Your Goal:</h3><p className="font-semibold text-[#8C3A36] text-base sm:text-lg">{client.goal}</p></div>
                </div>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <img src="https://nutritherapy.co.ke/wp-content/uploads/2024/08/Untitled-design-2024-08-28T154953.396.png" alt="NutriTherapy Solutions Logo" className="h-8 sm:h-10 -ml-3 sm:-ml-4 lg:-ml-8" />
                <div className="relative sm:hidden">
                    <button 
                    onClick={() => {
                        setShowNotifications(!showNotifications);
                        setUnreadCount(0);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                    >
                    <Bell className="w-5 h-5 text-slate-600" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"></span>
                    )}
                    </button>
                    {showNotifications && (
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-2xl border border-slate-200 z-20 animate-in fade-in duration-150">
                        <div className="p-3 font-bold border-b text-sm">Notifications</div>
                        <div className="max-h-80 overflow-y-auto">
                        {notifications.length > 0 ? notifications.map(n => (
                            <div key={n.id} className="p-3 border-b hover:bg-slate-50 cursor-pointer" onClick={() => handleNotificationClick(n)}>
                               <p className="text-xs font-semibold text-slate-800">
                                {n.type === 'message' ? `New message from your nutritionist` : 
                                 n.type === 'invoice' ? 'New Invoice Created' : 
                                 'New Meal Plan Available'}
                               </p>
                               <p className="text-xs text-slate-600 line-clamp-2 mt-1">{n.content}</p>
                               <p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                            </div>
                        )) : <p className="p-4 text-xs text-slate-500">No new notifications.</p>}
                        </div>
                    </div>
                    )}
                </div>
            </div>
            <div className="hidden sm:flex items-center gap-4">
                <div className="text-right">
                <p className="font-bold text-sm sm:text-base">{client.name}</p>
                <p className="text-xs sm:text-sm text-slate-500">Your personal nutrition hub</p>
                </div>
                 <div className="relative">
                    <button 
                    onClick={() => {
                        setShowNotifications(!showNotifications);
                        setUnreadCount(0);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                    >
                    <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 block h-3 w-3 rounded-full bg-red-500 ring-2 ring-white"></span>
                    )}
                    </button>
                    {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-2xl border border-slate-200 z-20 animate-in fade-in duration-150">
                        <div className="p-3 font-bold border-b text-sm">Notifications</div>
                        <div className="max-h-96 overflow-y-auto">
                        {notifications.length > 0 ? notifications.map(n => (
                            <div key={n.id} className="p-3 border-b hover:bg-slate-50 cursor-pointer" onClick={() => handleNotificationClick(n)}>
                               <p className="text-sm font-semibold text-slate-800">
                                {n.type === 'message' ? `New message from your nutritionist` : 
                                 n.type === 'invoice' ? 'New Invoice Created' : 
                                 'New Meal Plan Available'}
                               </p>
                               <p className="text-sm text-slate-600 line-clamp-2">{n.content}</p>
                               <p className="text-xs text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                            </div>
                        )) : <p className="p-4 text-sm text-slate-500">No new notifications.</p>}
                        </div>
                    </div>
                    )}
                </div>
            </div>
          </div>
          <nav className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 flex border-t border-slate-200 overflow-x-auto" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 }, { id: 'meal_plan', label: 'Meal Plan', icon: Utensils }, { id: 'food_diary', label: 'Food Diary', icon: Camera }, { id: 'appointments', label: 'Appointments', icon: Calendar }, { id: 'messages', label: 'Messages', icon: MessageSquare }, { id: 'billing', label: 'Billing', icon: CreditCard }
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative flex-shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 pr-6 sm:pr-8 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-[#8C3A36] text-[#8C3A36]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0"/><span>{tab.label}</span>
                {tab.id === 'messages' && unreadMessageCount > 0 && activeTab !== 'messages' && (
                  <span className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">
                    {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </header>
        <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
          {renderContent()}
        </main>
        <footer className="text-center py-4 text-xs text-slate-400">
          <p>Powered by NutriTherapy Solutions. Your data is secure and private.</p>
        </footer>
      </div>

      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
           <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              <div className="bg-slate-900 p-4 sm:p-5 text-white flex justify-between items-center sticky top-0">
                 <h3 className="font-bold text-base sm:text-lg">Pay Invoice</h3>
                 <button onClick={() => setShowPaymentModal(false)} className="p-1"><X className="w-4 h-4 sm:w-5 sm:h-5"/></button>
              </div>
              <div className="p-4 sm:p-6">
                <div className="bg-slate-50 p-3 sm:p-4 rounded-lg text-center mb-4 sm:mb-6 border border-slate-200">
                  <p className="text-xs sm:text-sm text-slate-500">Amount Due</p>
                  <p className="text-3xl sm:text-4xl font-bold text-[#8C3A36]">{getCurrencySymbol(selectedInvoice.currency)}{selectedInvoice.amount.toFixed(2)}</p>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-1">For: {selectedInvoice.items[0]?.description || 'Invoice'}</p>
                </div>
                {paymentStep === 'options' && (
                  <div className="space-y-2 sm:space-y-3">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-600 text-center uppercase">Select Payment Method</h4>
                    <button onClick={handlePaystackPayment} className="w-full flex items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 border-2 border-slate-200 hover:border-[#8C3A36] rounded-lg transition-colors text-sm sm:text-base"><CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500"/><span className="font-bold text-slate-700">Pay with Card / Bank</span></button>
                    <button onClick={() => setPaymentStep('mpesa')} className="w-full flex items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 border-2 border-slate-200 hover:border-[#8C3A36] rounded-lg transition-colors text-sm sm:text-base"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/M-PESA_LOGO-01.svg/2560px-M-PESA_LOGO-01.svg.png" alt="M-Pesa" className="w-12 sm:w-16"/><span className="font-bold text-slate-700">Pay with M-Pesa</span></button>
                  </div>
                )}
                {paymentStep === 'mpesa' && (
                   <div className="space-y-3 sm:space-y-4 animate-in fade-in duration-300">
                      <button onClick={() => setPaymentStep('options')} className="text-xs text-slate-500 hover:underline">{'< Back'}</button>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-600 text-center uppercase">M-Pesa Payment</h4>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Safaricom Phone Number</label>
                        <input type="tel" value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} placeholder="e.g. 0712345678" className="w-full mt-1 p-2.5 sm:p-3 border border-slate-300 rounded-lg text-sm sm:text-base"/>
                      </div>
                      <button onClick={handleMpesaPayment} disabled={!mpesaPhone || processingPayment} className="w-full py-2.5 sm:py-3 bg-[#8FAA41] text-white font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base">
                        {processingPayment ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : 'Confirm & Pay'}
                      </button>
                      <p className="text-[10px] sm:text-xs text-slate-500 text-center">You will receive a payment prompt on your phone.</p>
                   </div>
                )}
              </div>
           </div>
        </div>
      )}
    </>
  );
};