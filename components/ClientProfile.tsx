
import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Calendar as CalendarIcon, Activity, FileText, CreditCard, 
  Camera, Brain, User, Plus, Trash2, Send, CheckCircle,
  ChevronLeft, ChevronRight, X, Mail, Loader2, Edit2, MapPin, DollarSign,
  Share2, Copy, MessageSquare, Dumbbell, Droplet, RefreshCw, AlertTriangle,
  HeartPulse, Upload, Download, File as FileIcon, ChevronDown, ChevronUp
} from 'lucide-react';
import { Client, SavedMealPlan, Invoice, Appointment, FoodLog, Message, MedicalDocument, Meal, DailyPlan, BillingSettings } from '../types';
import { supabase } from '../services/supabase';
import { analyzeFoodImage, generateClientInsights, analyzeMedicalDocument, ExtractedRecords } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface ClientProfileProps {
  client: Client;
  onBack: () => void;
  onUpdateClient: (updatedClient: Client) => void;
  initialTab?: 'overview' | 'meal_plans' | 'food' | 'billing' | 'schedule' | 'messages' | 'records';
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


// Internal Meal Plan Card Component
const MealPlanCard: React.FC<{plan: SavedMealPlan, onDelete: (id: string) => void}> = ({ plan, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!plan.planData) return null;

  const MealDetail: React.FC<{meal: Meal, type: string}> = ({meal, type}) => {
    if (!meal) return null;
    const icon = type === 'Breakfast' ? '🍳' : type === 'Lunch' ? '🥗' : '🍽️';
    return (
        <div className="flex gap-2 sm:gap-3 items-start w-full min-w-0">
            <span className="text-lg sm:text-xl mt-1 flex-shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-700 text-xs sm:text-sm break-words">{meal.name}</p>
                <p className="text-[10px] sm:text-xs text-slate-500 break-words line-clamp-2">{meal.ingredients?.join(', ')}</p>
                <div className="text-[10px] sm:text-xs text-slate-400 mt-1">{meal.calories}kcal • P:{meal.protein} C:{meal.carbs} F:{meal.fats}</div>
            </div>
        </div>
    );
  };
  
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm w-full">
        <div className="p-3 sm:p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50" onClick={() => setIsExpanded(!isExpanded)}>
            <div className="flex-1 min-w-0">
                <p className="font-bold text-[#8C3A36] text-sm sm:text-base truncate">{plan.label || `Plan from ${new Date(plan.createdAt).toLocaleDateString()}`}</p>
                <p className="text-[10px] sm:text-xs text-slate-500 truncate">Created on {new Date(plan.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={(e) => { e.stopPropagation(); onDelete(plan.id);}} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"><Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4"/></button>
                {isExpanded ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500"/> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500"/>}
            </div>
        </div>
        {isExpanded && (
            <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/50 space-y-3 sm:space-y-4 max-h-96 overflow-y-auto overflow-x-hidden">
                {plan.planData.map((day: DailyPlan) => (
                    <div key={day.day} className="p-3 bg-white rounded-lg border w-full">
                        <div className="flex justify-between items-center mb-2">
                           <h4 className="font-bold text-slate-800 text-sm sm:text-base">{day.day}</h4>
                           <span className="text-[10px] sm:text-xs font-bold text-[#8C3A36] bg-[#F9F5F5] px-2 py-0.5 rounded-full whitespace-nowrap">{day.totalCalories} kcal</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm w-full">
                            <MealDetail meal={day.breakfast} type="Breakfast"/>
                            <MealDetail meal={day.lunch} type="Lunch"/>
                            <MealDetail meal={day.dinner} type="Dinner"/>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
};


const ClientProfile: React.FC<ClientProfileProps> = ({ client, onBack, onUpdateClient, initialTab }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'meal_plans' | 'food' | 'billing' | 'schedule' | 'messages' | 'records'>(initialTab || 'overview');
  const [loading, setLoading] = useState(false);
  
  const [mealPlans, setMealPlans] = useState<SavedMealPlan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [generatingInsight, setGeneratingInsight] = useState(false);

  const [showShareModal, setShowShareModal] = useState(false);
  const portalLink = `${window.location.origin}/#/portal/${client.portalAccessToken}`;
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [foodImage, setFoodImage] = useState<File | null>(null);
  const [foodAnalysis, setFoodAnalysis] = useState<string>("");
  const [analyzingFood, setAnalyzingFood] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showApptModal, setShowApptModal] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [isDragging, setIsDragging] = useState<string | null>(null); 
  const [savingAppt, setSavingAppt] = useState(false);
  
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [{ description: 'Nutrition Consultation', cost: 150 }]
  });
  
  const [showInvoiceActionModal, setShowInvoiceActionModal] = useState(false);
  const [selectedInvoiceAction, setSelectedInvoiceAction] = useState<Invoice | null>(null);
  const [copiedPaymentLink, setCopiedPaymentLink] = useState(false);

  const [apptForm, setApptForm] = useState({
    date: '',
    time: '09:00',
    type: 'Check-in' as Appointment['type'],
    status: 'Confirmed' as Appointment['status'],
    notes: ''
  });

  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Records Tab State
  const [recordsInfo, setRecordsInfo] = useState({
    medicalHistory: client.medicalHistory || '',
    allergies: client.allergies || '',
    medications: client.medications || '',
    dietaryHistory: client.dietaryHistory || '',
    socialBackground: client.socialBackground || '',
  });
  const [medicalDocuments, setMedicalDocuments] = useState<MedicalDocument[]>([]);
  const [isSavingMedicalInfo, setIsSavingMedicalInfo] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [showExtractionModal, setShowExtractionModal] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedRecords>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [billingSettings, setBillingSettings] = useState<Partial<BillingSettings>>({ currency: 'USD' });
  
  // Progress Logging State
  const [showProgressLogModal, setShowProgressLogModal] = useState(false);
  const [progressLogBodyFatFormat, setProgressLogBodyFatFormat] = useState<'percentage' | 'kg'>(() => {
    // Determine format based on existing client data
    return client.bodyFatPercentage ? 'percentage' : (client.bodyFatMass ? 'kg' : 'percentage');
  });
  const [progressLogMuscleFormat, setProgressLogMuscleFormat] = useState<'kg' | 'percentage'>(() => {
    // Determine format based on existing client data
    return client.skeletalMuscleMass ? 'kg' : (client.skeletalMusclePercentage ? 'percentage' : 'kg');
  });
  const [progressLog, setProgressLog] = useState({
    date: new Date().toISOString().split('T')[0],
    weight: client.weight?.toString() || '',
    complianceScore: 80,
    notes: '',
    bodyFatPercentage: client.bodyFatPercentage?.toString() || '',
    bodyFatMass: client.bodyFatMass?.toString() || '',
    skeletalMuscleMass: client.skeletalMuscleMass?.toString() || '',
    skeletalMusclePercentage: client.skeletalMusclePercentage?.toString() || '',
  });
  const [savingProgressLog, setSavingProgressLog] = useState(false);


  useEffect(() => {
    setActiveTab(initialTab || 'overview');
  }, [initialTab, client.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const [plansRes, apptsRes, foodsRes, invRes, msgRes, docsRes, settingsRes] = await Promise.all([
          supabase.from('meal_plans').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
          supabase.from('appointments').select('*').eq('client_id', client.id).order('date', { ascending: true }),
          supabase.from('food_logs').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
          supabase.from('invoices').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
          supabase.from('messages').select('*').eq('client_id', client.id).order('created_at', { ascending: true }),
          supabase.from('medical_documents').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
          supabase.from('billing_settings').select('*').eq('user_id', user.id).single(),
      ]);
      if (plansRes.data) setMealPlans(plansRes.data.map(p => ({
        id: p.id, clientId: p.client_id, createdAt: p.created_at, planData: p.plan_data, label: p.day_label || 'Weekly Plan'
      })));
      if (apptsRes.data) setAppointments(apptsRes.data.map(a => ({
        id: a.id, clientId: a.client_id, date: a.date, type: a.type, status: a.status, notes: a.notes
      })));
      if (foodsRes.data) setFoodLogs(foodsRes.data.map(f => ({
         id: f.id, clientId: f.client_id, aiAnalysis: f.ai_analysis, createdAt: f.created_at, imageUrl: f.image_url, notes: f.notes
      })));
      if (invRes.data) setInvoices(invRes.data.map(i => ({
        id: i.id, clientId: i.client_id, amount: i.amount, currency: i.currency, status: i.status, dueDate: i.due_date, generatedAt: i.created_at, items: i.items || [], paymentMethod: i.payment_method, transactionRef: i.transaction_ref
      })));
      if (msgRes.data) setMessages(msgRes.data.map((msg: any): Message => ({
        id: msg.id, clientId: msg.client_id, sender: msg.sender, content: msg.content, createdAt: msg.created_at, isRead: msg.is_read
      })));
      if (docsRes.data) setMedicalDocuments(docsRes.data.map((doc: any): MedicalDocument => ({
        id: doc.id, clientId: doc.client_id, uploadedAt: doc.created_at, fileName: doc.file_name, filePath: doc.file_path
      })));
      if (settingsRes.data) {
        setBillingSettings(settingsRes.data);
      }


    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel(`messages-${client.id}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${client.id}` },
        (payload) => {
          const rawMsg = payload.new;
          const newMessage: Message = {
            id: rawMsg.id,
            clientId: rawMsg.client_id,
            sender: rawMsg.sender,
            content: rawMsg.content,
            createdAt: rawMsg.created_at,
            isRead: rawMsg.is_read,
          };
          
          setMessages(prevMessages => {
            if (!prevMessages.some(m => m.id === newMessage.id)) {
              return [...prevMessages, newMessage];
            }
            return prevMessages;
          });
        }
      ).subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [client.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  useEffect(() => {
    if (activeTab === 'messages') {
      const markAsRead = async () => {
        await supabase.from('messages')
          .update({ is_read: true })
          .eq('client_id', client.id)
          .eq('sender', 'client');
      };
      markAsRead();
    }
  }, [activeTab, client.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const content = newMessage.trim();
    setNewMessage('');

    const optimisticMessage: Message = {
      id: `temp_${Date.now()}`,
      clientId: client.id,
      sender: 'nutritionist',
      content,
      createdAt: new Date().toISOString(),
      isRead: true
    };
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const { data, error } = await supabase.from('messages').insert({
        client_id: client.id,
        sender: 'nutritionist',
        content: content
      }).select().single();

      if (error) throw error;
      
      const finalMessage: Message = {
        id: data.id,
        clientId: data.client_id,
        sender: data.sender,
        content: data.content,
        createdAt: data.created_at,
        isRead: data.is_read
      };

      setMessages(prev => prev.map(m => m.id === optimisticMessage.id ? finalMessage : m));
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      setNewMessage(content);
    }
  };

  const handleGenerateInvoice = () => {
    setInvoiceForm({
       dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
       items: [{ description: 'Nutrition Consultation', cost: 150 }]
    });
    setShowInvoiceModal(true);
  };
  
  const handleOpenInvoiceActions = (invoice: Invoice) => {
    setSelectedInvoiceAction(invoice);
    setShowInvoiceActionModal(true);
  };
  
  const handleMarkAsPaid = async () => {
    if (!selectedInvoiceAction) return;
    try {
        const { error } = await supabase
            .from('invoices')
            .update({ status: 'Paid', payment_method: 'Manual' })
            .eq('id', selectedInvoiceAction.id);
        if (error) throw error;
        fetchData();
        setShowInvoiceActionModal(false);
    } catch (err: any) {
        alert("Failed to update invoice: " + err.message);
    }
  };

  const handleAddInvoiceItem = () => {
    setInvoiceForm(prev => ({
      ...prev,
      items: [...prev.items, { description: '', cost: 0 }]
    }));
  };

  const handleRemoveInvoiceItem = (index: number) => {
    setInvoiceForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateInvoiceItem = (index: number, field: 'description' | 'cost', value: string) => {
    const newItems = [...invoiceForm.items];
    newItems[index] = { ...newItems[index], [field]: field === 'cost' ? parseFloat(value) || 0 : value };
    setInvoiceForm(prev => ({ ...prev, items: newItems }));
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInvoice(true);
    const totalAmount = invoiceForm.items.reduce((acc, item) => acc + item.cost, 0);

    try {
      const { error } = await supabase.from('invoices').insert({
        client_id: client.id,
        due_date: invoiceForm.dueDate,
        items: invoiceForm.items,
        amount: totalAmount,
        currency: billingSettings.currency || 'USD',
        status: 'Pending',
      });
      if (error) throw error;
      setShowInvoiceModal(false);
      fetchData(); // Refresh invoices
    } catch (err: any) {
      alert("Error creating invoice: " + err.message);
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleSaveAppt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAppt(true);

    const newAppointmentData = {
      client_id: client.id,
      date: `${apptForm.date}T${apptForm.time}:00`,
      type: apptForm.type,
      status: apptForm.status,
      notes: apptForm.notes,
    };

    try {
      let error;
      if (selectedAppt) {
        ({ error } = await supabase.from('appointments').update(newAppointmentData).eq('id', selectedAppt.id));
      } else {
        ({ error } = await supabase.from('appointments').insert(newAppointmentData));
      }
      if (error) throw error;
      setShowApptModal(false);
      setSelectedAppt(null);
      fetchData(); // Refresh appointments
    } catch (err: any) {
      alert("Error saving appointment: " + err.message);
    } finally {
      setSavingAppt(false);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this appointment?')) return;
    try {
      const { error } = await supabase.from('appointments').delete().eq('id', id);
      if (error) throw error;
      setShowApptModal(false);
      setSelectedAppt(null);
      fetchData();
    } catch (e: any) {
      alert("Error deleting appointment: " + e.message);
    }
  };

  const handleOpenApptModal = (dateStr: string, appt: Appointment | null = null) => {
    if (appt) {
      setSelectedAppt(appt);
      const apptDate = new Date(appt.date);
      setApptForm({
        date: apptDate.toISOString().split('T')[0],
        time: apptDate.toTimeString().substring(0, 5),
        type: appt.type,
        status: appt.status,
        notes: appt.notes || '',
      });
    } else {
      setSelectedAppt(null);
      setApptForm({
        date: dateStr,
        time: '09:00',
        type: 'Check-in',
        status: 'Confirmed',
        notes: '',
      });
    }
    setShowApptModal(true);
  };
  
  const handleGenerateInsight = async () => {
    setGeneratingInsight(true);
    setAiInsight("");
    try {
      const { data } = await supabase.from('progress_logs').select('weight').eq('client_id', client.id).order('date', {ascending: true}).limit(5);
      const weightHistory = data ? data.map(d => d.weight) : [client.weight || 0];
      const result = await generateClientInsights(client.name, weightHistory, client.goal);
      setAiInsight(result);
    } catch (e) {
      setAiInsight("Could not generate insights at this time.");
    } finally {
      setGeneratingInsight(false);
    }
  };
  
  const handleAnalyzeFood = async () => {
    if (!foodImage) return;
    setAnalyzingFood(true);
    setFoodAnalysis("");

    try {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = (reader.result as string).split(',')[1];
            const result = await analyzeFoodImage(base64String, foodImage.type, null, client.goal);
            setFoodAnalysis(result);
            // Optionally save this log
            const { error } = await supabase.from('food_logs').insert({
                client_id: client.id,
                ai_analysis: result,
                // you would need to upload the image to storage and save the URL here
            });
            if (error) console.error("Error saving food log", error);
        };
        reader.readAsDataURL(foodImage);

    } catch(e) {
        setFoodAnalysis("Failed to analyze image.");
    } finally {
        setAnalyzingFood(false);
    }
  };

  const handleDeleteMealPlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this meal plan? This action cannot be undone.')) return;
    try {
      const { error } = await supabase.from('meal_plans').delete().eq('id', planId);
      if (error) throw error;
      fetchData(); // Refresh the list of meal plans
    } catch (e: any) {
      alert("Error deleting meal plan: " + e.message);
    }
  };
  
  // -- Records Tab Handlers --
  const handleSaveRecordsInfo = async () => {
    setIsSavingMedicalInfo(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .update({
          medical_history: recordsInfo.medicalHistory,
          allergies: recordsInfo.allergies,
          medications: recordsInfo.medications,
          dietary_history: recordsInfo.dietaryHistory,
          social_background: recordsInfo.socialBackground,
        })
        .eq('id', client.id)
        .select()
        .single();
      if (error) throw error;
      
      const updatedClient: Client = {
        ...client,
        medicalHistory: data.medical_history,
        allergies: data.allergies,
        medications: data.medications,
        dietaryHistory: data.dietary_history,
        socialBackground: data.social_background,
      };
      onUpdateClient(updatedClient);
      alert('Records updated!');
    } catch (e: any) {
      alert('Error saving records: ' + e.message);
    } finally {
      setIsSavingMedicalInfo(false);
    }
  };

  const handleFileUpload = async () => {
    if (!fileToUpload) return;
    setIsUploading(true);
    setIsAnalyzing(true);
    try {
      // First, analyze the document
      const fileType = fileToUpload.type;
      const isImage = fileType.startsWith('image/');
      const isPDF = fileType === 'application/pdf';
      const isText = fileType.startsWith('text/') || fileToUpload.name.endsWith('.txt');
      
      let fileContent = '';
      let mimeType = fileType;
      
      if (isImage) {
        // Convert image to base64
        const reader = new FileReader();
        fileContent = await new Promise<string>((resolve, reject) => {
          reader.onload = (e) => {
            const result = e.target?.result as string;
            resolve(result.split(',')[1]); // Remove data:image/...;base64, prefix
          };
          reader.onerror = reject;
          reader.readAsDataURL(fileToUpload);
        });
      } else if (isPDF) {
        // For PDFs, we'll need to extract text
        // For now, show a message that PDF text extraction requires additional setup
        alert('PDF text extraction is not yet fully supported. Please use images or text files, or manually enter the information.');
        setIsUploading(false);
        setIsAnalyzing(false);
        return;
      } else if (isText) {
        // Read text file content
        fileContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsText(fileToUpload);
        });
        mimeType = 'text/plain';
      } else {
        alert('Unsupported file type. Please use images (JPG, PNG) or text files (TXT).');
        setIsUploading(false);
        setIsAnalyzing(false);
        return;
      }
      
      // Analyze document with AI
      const extracted = await analyzeMedicalDocument(fileContent, mimeType, isImage);
      setExtractedData(extracted);
      setShowExtractionModal(true);
      setIsAnalyzing(false);
      
      // Upload file to storage
      const filePath = `${client.id}/${fileToUpload.name}`;
      const { error: uploadError } = await supabase.storage
        .from('medical_documents')
        .upload(filePath, fileToUpload);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('medical_documents').insert({
        client_id: client.id,
        file_name: fileToUpload.name,
        file_path: filePath,
      });
      if (dbError) throw dbError;

      fetchData(); // Refresh documents
    } catch (e: any) {
      alert('File processing failed: ' + e.message);
      setIsAnalyzing(false);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAcceptExtraction = () => {
    // Merge extracted data with current records
    setRecordsInfo({
      ...recordsInfo,
      medicalHistory: extractedData.medicalHistory || recordsInfo.medicalHistory,
      allergies: extractedData.allergies || recordsInfo.allergies,
      medications: extractedData.medications || recordsInfo.medications,
      dietaryHistory: extractedData.dietaryHistory || recordsInfo.dietaryHistory,
      socialBackground: extractedData.socialBackground || recordsInfo.socialBackground,
    });
    setShowExtractionModal(false);
    setExtractedData({});
    setFileToUpload(null);
  };

  const handleRejectExtraction = () => {
    setShowExtractionModal(false);
    setExtractedData({});
    setFileToUpload(null);
  };

  const handleSaveProgressLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProgressLog(true);
    try {
      const { error } = await supabase.from('progress_logs').insert({
        client_id: client.id,
        date: progressLog.date,
        weight: parseFloat(progressLog.weight),
        compliance_score: progressLog.complianceScore,
        notes: progressLog.notes,
        body_fat_percentage: progressLog.bodyFatPercentage ? parseFloat(progressLog.bodyFatPercentage) : null,
        body_fat_mass: progressLog.bodyFatMass ? parseFloat(progressLog.bodyFatMass) : null,
        skeletal_muscle_mass: progressLog.skeletalMuscleMass ? parseFloat(progressLog.skeletalMuscleMass) : null,
        skeletal_muscle_percentage: progressLog.skeletalMusclePercentage ? parseFloat(progressLog.skeletalMusclePercentage) : null,
      });

      if (error) throw error;

      // Update client with latest values
      const { data: updatedClientData, error: updateError } = await supabase
        .from('clients')
        .update({
          weight: parseFloat(progressLog.weight),
          body_fat_percentage: progressLog.bodyFatPercentage ? parseFloat(progressLog.bodyFatPercentage) : null,
          body_fat_mass: progressLog.bodyFatMass ? parseFloat(progressLog.bodyFatMass) : null,
          skeletal_muscle_mass: progressLog.skeletalMuscleMass ? parseFloat(progressLog.skeletalMuscleMass) : null,
          skeletal_muscle_percentage: progressLog.skeletalMusclePercentage ? parseFloat(progressLog.skeletalMusclePercentage) : null,
        })
        .eq('id', client.id)
        .select()
        .single();

      if (updateError) throw updateError;

      if (updatedClientData) {
        const updatedClient: Client = {
          ...client,
          weight: updatedClientData.weight,
          bodyFatPercentage: updatedClientData.body_fat_percentage,
          bodyFatMass: updatedClientData.body_fat_mass,
          skeletalMuscleMass: updatedClientData.skeletal_muscle_mass,
          skeletalMusclePercentage: updatedClientData.skeletal_muscle_percentage,
        };
        onUpdateClient(updatedClient);
      }

      setShowProgressLogModal(false);
      setProgressLog({
        date: new Date().toISOString().split('T')[0],
        weight: progressLog.weight,
        complianceScore: 80,
        notes: '',
        bodyFatPercentage: progressLog.bodyFatPercentage,
        bodyFatMass: progressLog.bodyFatMass,
        skeletalMuscleMass: progressLog.skeletalMuscleMass,
        skeletalMusclePercentage: progressLog.skeletalMusclePercentage,
      });
      alert('Progress logged successfully!');
    } catch (e: any) {
      alert('Error logging progress: ' + e.message);
    } finally {
      setSavingProgressLog(false);
    }
  };

  const handleDownloadFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage.from('medical_documents').download(filePath);
      if (error) throw error;
      const blob = new Blob([data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert('Download failed: ' + e.message);
    }
  };
  
  const handleDeleteFile = async (doc: MedicalDocument) => {
    if (!confirm(`Are you sure you want to delete ${doc.fileName}?`)) return;
    try {
      const { error: storageError } = await supabase.storage.from('medical_documents').remove([doc.filePath]);
      if (storageError) throw storageError;

      const { error: dbError } = await supabase.from('medical_documents').delete().eq('id', doc.id);
      if (dbError) throw dbError;

      fetchData(); // Refresh documents
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    }
  };
  
  const handleRegenerateLink = async () => {
    if (!confirm('Are you sure you want to regenerate the access link? The old link will stop working immediately.')) return;
    setRegenerating(true);
    try {
      const newAccessToken = crypto.randomUUID();
      const { data, error } = await supabase
        .from('clients')
        .update({ portal_access_token: newAccessToken })
        .eq('id', client.id)
        .select('portal_access_token')
        .single();

      if (error) throw error;

      if (data) {
        onUpdateClient({ ...client, portalAccessToken: data.portal_access_token });
        alert('Client portal link has been regenerated.');
      }
    } catch (err: any) {
      alert('Failed to regenerate link: ' + err.message);
    } finally {
      setRegenerating(false);
    }
  };


  const tabItems = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'meal_plans', label: 'Meal Plans', icon: FileText },
    { id: 'food', label: 'Food Logs', icon: Camera },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'records', label: 'Records', icon: HeartPulse },
    { id: 'schedule', label: 'Schedule', icon: CalendarIcon },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  const StatCard: React.FC<{ label: string; value: string | number; unit?: string; icon: React.ReactNode }> = ({ label, value, unit, icon }) => (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-4 flex items-center gap-3 sm:gap-4 w-full min-w-0">
      <div className="p-1.5 sm:p-2 bg-white rounded-full shadow-sm flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wider truncate">{label}</p>
        <p className="text-lg sm:text-xl font-bold text-slate-800 truncate">
          {value} <span className="text-xs sm:text-sm font-normal text-slate-500">{unit}</span>
        </p>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-4 sm:space-y-6 w-full overflow-x-hidden">
             <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full">
               <StatCard label="Age" value={client.age ?? 'N/A'} unit="yrs" icon={<User className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]" />} />
               <StatCard label="Weight" value={client.weight ?? 'N/A'} unit="kg" icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]" />} />
               <StatCard 
                 label="Body Fat" 
                 value={client.bodyFatPercentage ?? (client.bodyFatMass ?? 'N/A')} 
                 unit={client.bodyFatPercentage ? '%' : (client.bodyFatMass ? 'kg' : '')} 
                 icon={<Droplet className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />} 
               />
               <StatCard 
                 label="Muscle Mass" 
                 value={client.skeletalMuscleMass ?? (client.skeletalMusclePercentage ?? 'N/A')} 
                 unit={client.skeletalMuscleMass ? 'kg' : (client.skeletalMusclePercentage ? '%' : '')} 
                 icon={<Dumbbell className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />} 
               />
             </div>
             
             <div className="bg-white rounded-lg border p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-3 sm:mb-4">
                    <div>
                        <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2"><Brain className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]"/> AI Coach Insights</h3>
                        <p className="text-xs sm:text-sm text-slate-500">A quick summary of recent progress.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => {
                              // Reset formats based on current client data
                              setProgressLogBodyFatFormat(client.bodyFatPercentage ? 'percentage' : (client.bodyFatMass ? 'kg' : 'percentage'));
                              setProgressLogMuscleFormat(client.skeletalMuscleMass ? 'kg' : (client.skeletalMusclePercentage ? 'percentage' : 'kg'));
                              // Reset progress log with current client values
                              setProgressLog({
                                date: new Date().toISOString().split('T')[0],
                                weight: client.weight?.toString() || '',
                                complianceScore: 80,
                                notes: '',
                                bodyFatPercentage: client.bodyFatPercentage?.toString() || '',
                                bodyFatMass: client.bodyFatMass?.toString() || '',
                                skeletalMuscleMass: client.skeletalMuscleMass?.toString() || '',
                                skeletalMusclePercentage: client.skeletalMusclePercentage?.toString() || '',
                              });
                              setShowProgressLogModal(true);
                            }}
                            className="bg-[#8C3A36] text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-[#7a2f2b] flex items-center gap-1.5 sm:gap-2 shadow-sm"
                        >
                            <Plus className="w-3 h-3 sm:w-4 sm:h-4" /> Log Progress
                        </button>
                        <button onClick={handleGenerateInsight} disabled={generatingInsight} className="text-xs sm:text-sm font-medium text-[#8C3A36] hover:text-[#7a2f2b] flex items-center gap-1 disabled:opacity-50">
                            <RefreshCw className={`w-3 h-3 ${generatingInsight ? 'animate-spin': ''}`} /> {generatingInsight ? 'Generating...' : 'Regenerate'}
                        </button>
                    </div>
                </div>
                <div className="bg-slate-50/70 p-3 sm:p-4 rounded-md border min-h-[80px] sm:min-h-[100px] text-xs sm:text-sm text-slate-700 leading-relaxed">
                   {generatingInsight && <p className="animate-pulse">Analyzing data...</p>}
                   {!generatingInsight && (aiInsight ? <p>{aiInsight}</p> : <p className="text-slate-400">Click regenerate to get an AI insight on the client's progress.</p>)}
                </div>
             </div>
          </div>
        );
      case 'meal_plans':
        return (
            <div className="space-y-4 w-full overflow-x-hidden">
                {mealPlans.length > 0 ? (
                    mealPlans.map(plan => <MealPlanCard key={plan.id} plan={plan} onDelete={handleDeleteMealPlan} />)
                ) : (
                    <div className="text-center p-8 sm:p-12 bg-white rounded-lg border border-dashed">
                        <p className="text-sm sm:text-base text-slate-500">No meal plans found for {client.name}.</p>
                        <p className="text-xs sm:text-sm text-slate-400 mt-1">Go to the main 'Meal Planner' to generate a new plan.</p>
                    </div>
                )}
            </div>
        );
      case 'food':
        return (
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 w-full overflow-x-hidden">
            <div className="bg-white rounded-lg border p-4 sm:p-6 space-y-4">
                <h3 className="text-base sm:text-lg font-bold text-slate-800">Analyze Client Food Photo</h3>
                <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-4 sm:p-6 text-center hover:bg-slate-50 transition-colors">
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => e.target.files && setFoodImage(e.target.files[0])} />
                    {foodImage ? (
                        <div className="text-[#8C3A36] flex flex-col items-center gap-2"><CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" /> <span className="text-xs sm:text-sm break-all">{foodImage.name}</span></div>
                    ) : (
                        <div className="text-slate-500 flex flex-col items-center gap-2"><Camera className="w-5 h-5 sm:w-6 sm:h-6" /> <span className="text-xs sm:text-sm sm:text-base">Upload Photo</span></div>
                    )}
                </div>
                <button onClick={handleAnalyzeFood} disabled={!foodImage || analyzingFood} className="w-full py-2 bg-[#8C3A36] text-white font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#7a2f2b] text-sm sm:text-base">
                    {analyzingFood ? <><Loader2 className="w-4 h-4 animate-spin"/> Analyzing...</> : "Analyze Food"}
                </button>
                {foodAnalysis && (
                    <div className="bg-slate-50 p-3 sm:p-4 rounded-md border">
                        <h4 className="font-bold mb-2 text-sm sm:text-base">Analysis:</h4>
                        <p className="text-xs sm:text-sm whitespace-pre-wrap">{foodAnalysis}</p>
                    </div>
                )}
            </div>
            <div className="bg-white rounded-lg border p-4 sm:p-6">
                 <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4">Recent Food Logs</h3>
                 <div className="space-y-2 sm:space-y-3 max-h-[400px] overflow-y-auto pr-1 sm:pr-2">
                    {foodLogs.length > 0 ? foodLogs.map(log => (
                        <div key={log.id} className="p-2.5 sm:p-3 bg-slate-50 rounded-md border flex gap-2 sm:gap-3 items-start">
                            {log.imageUrl && <img src={log.imageUrl} className="w-12 h-12 sm:w-16 sm:h-16 rounded object-cover flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                               <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase">{new Date(log.createdAt).toLocaleString()}</p>
                               <div className="text-xs sm:text-sm mt-1 prose prose-sm max-w-none">
                                 <ReactMarkdown
                                   components={{
                                     p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />,
                                     strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                                     ul: ({node, ...props}) => <ul className="list-disc list-inside mb-1 space-y-0.5" {...props} />,
                                     ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-1 space-y-0.5" {...props} />,
                                     li: ({node, ...props}) => <li className="ml-1" {...props} />,
                                   }}
                                 >
                                   {log.aiAnalysis || log.notes || "No analysis available."}
                                 </ReactMarkdown>
                               </div>
                            </div>
                        </div>
                    )) : <p className="text-center text-slate-400 py-6 sm:py-8 text-sm">No food logs yet.</p>}
                 </div>
            </div>
          </div>
        );
      case 'messages':
        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-16rem)] sm:h-[calc(100vh-20rem)] w-full overflow-x-hidden">
              <div className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto overflow-x-hidden flex flex-col">
                  {messages.map(msg => (
                      <div key={msg.id} className={`flex flex-col max-w-[75%] sm:max-w-sm md:max-w-md ${msg.sender === 'nutritionist' ? 'self-end items-end' : 'self-start items-start'}`}>
                          <div className={`px-3 sm:px-4 py-2 rounded-2xl text-sm sm:text-base break-words ${msg.sender === 'nutritionist' ? 'bg-[#8C3A36] text-white rounded-br-none' : 'bg-slate-100 text-slate-800 rounded-bl-none'}`}>
                              {msg.content}
                          </div>
                          <span className="text-xs text-slate-400 mt-1 px-1">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}</span>
                      </div>
                  ))}
                  <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t bg-slate-50 flex items-center gap-2 sm:gap-3 sticky bottom-0 w-full">
                  <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type your message..." className="flex-1 min-w-0 p-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-[#8C3A36] focus:border-[#8C3A36]" />
                  <button type="submit" className="p-2 bg-[#8C3A36] text-white rounded-lg hover:bg-[#7a2f2b] disabled:opacity-50 flex-shrink-0" disabled={!newMessage.trim()}><Send className="w-4 h-4 sm:w-5 sm:h-5"/></button>
              </form>
          </div>
        );
      case 'records':
        return (
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 w-full overflow-x-hidden">
            <div className="bg-white rounded-lg border p-4 sm:p-6 space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-800">Client Records</h3>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Medical History</label>
                <textarea 
                  value={recordsInfo.medicalHistory} 
                  onChange={e => setRecordsInfo({...recordsInfo, medicalHistory: e.target.value})} 
                  className="w-full mt-1 p-2 text-sm border rounded-md h-20 sm:h-24 resize-none" 
                  placeholder="e.g., Diabetes Type 2, Hypertension, Previous surgeries..."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Allergies</label>
                <textarea 
                  value={recordsInfo.allergies} 
                  onChange={e => setRecordsInfo({...recordsInfo, allergies: e.target.value})} 
                  className="w-full mt-1 p-2 text-sm border rounded-md h-16 sm:h-20 resize-none" 
                  placeholder="e.g., Peanuts, Shellfish, Dairy..."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Medications</label>
                <textarea 
                  value={recordsInfo.medications} 
                  onChange={e => setRecordsInfo({...recordsInfo, medications: e.target.value})} 
                  className="w-full mt-1 p-2 text-sm border rounded-md h-16 sm:h-20 resize-none" 
                  placeholder="e.g., Metformin 500mg, Lisinopril 10mg..."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Dietary History</label>
                <textarea 
                  value={recordsInfo.dietaryHistory} 
                  onChange={e => setRecordsInfo({...recordsInfo, dietaryHistory: e.target.value})} 
                  className="w-full mt-1 p-2 text-sm border rounded-md h-20 sm:h-24 resize-none"
                  placeholder="e.g., Previously tried keto, dislikes cilantro, prefers quick meals..."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Social Background</label>
                <textarea 
                  value={recordsInfo.socialBackground} 
                  onChange={e => setRecordsInfo({...recordsInfo, socialBackground: e.target.value})} 
                  className="w-full mt-1 p-2 text-sm border rounded-md h-20 sm:h-24 resize-none"
                  placeholder="e.g., Works night shifts, lives with family, cultural dietary restrictions, occupation..."
                />
              </div>
              <button onClick={handleSaveRecordsInfo} disabled={isSavingMedicalInfo} className="w-full py-2 bg-[#8C3A36] text-white font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#7a2f2b] text-sm">
                {isSavingMedicalInfo ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Changes'}
              </button>
            </div>
            <div className="bg-white rounded-lg border p-4 sm:p-6 space-y-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-800">Medical Documents</h3>
              <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-3 sm:p-4 text-center">
                 <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => e.target.files && setFileToUpload(e.target.files[0])} />
                 <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                    {fileToUpload ? <><FileIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#8C3A36]" /><span className="text-xs sm:text-sm break-all">{fileToUpload.name}</span></> : <><Upload className="w-5 h-5 sm:w-6 sm:h-6"/><span className="text-xs sm:text-sm">Click to upload file</span></>}
                 </div>
              </div>
              {fileToUpload && (
                <button onClick={handleFileUpload} disabled={isUploading || isAnalyzing} className="w-full py-2 bg-slate-800 text-white font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                    {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin"/> Analyzing...</> : isUploading ? <><Loader2 className="w-4 h-4 animate-spin"/> Uploading...</> : 'Upload & Analyze Document'}
                </button>
              )}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                 {medicalDocuments.map(doc => (
                    <div key={doc.id} className="p-2 bg-slate-50 rounded-md border flex justify-between items-center group">
                       <div className="flex items-center gap-2 flex-1 min-w-0">
                         <FileIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                         <span className="text-xs sm:text-sm font-medium text-slate-700 truncate">{doc.fileName}</span>
                       </div>
                       <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                         <button onClick={() => handleDownloadFile(doc.filePath, doc.fileName)} className="p-1.5 hover:bg-slate-200 rounded"><Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600"/></button>
                         <button onClick={() => handleDeleteFile(doc)} className="p-1.5 hover:bg-red-100 rounded"><Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500"/></button>
                       </div>
                    </div>
                 ))}
              </div>
            </div>
          </div>
        );
      case 'schedule':
        const renderCalendar = () => {
            const today = new Date();
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
            const startDate = new Date(startOfMonth);
            startDate.setDate(startDate.getDate() - startOfMonth.getDay());
            const endDate = new Date(endOfMonth);
            endDate.setDate(endDate.getDate() + (6 - endOfMonth.getDay()));
            const days = [];
            let day = new Date(startDate);
            while (day <= endDate) {
                days.push(new Date(day));
                day.setDate(day.getDate() + 1);
            }

            const getApptColor = (type: Appointment['type']) => {
                switch(type) {
                    case 'Check-in': return 'bg-emerald-500';
                    case 'Consultation': return 'bg-blue-500';
                    case 'Onboarding': return 'bg-purple-500';
                    default: return 'bg-slate-500';
                }
            };

            return (
                <div className="bg-white rounded-lg border p-3 sm:p-4 lg:p-6 w-full">
                    <div className="w-full overflow-x-auto" style={{scrollbarWidth: 'thin', msOverflowStyle: 'auto'}}>
                        <div className="min-w-[600px] sm:min-w-0">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-3 sm:mb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                           <h3 className="text-base sm:text-lg font-bold text-slate-800">{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                           <button onClick={() => setCurrentMonth(new Date())} className="text-[10px] sm:text-xs font-semibold bg-slate-100 px-2 py-1 rounded hover:bg-slate-200">Today</button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-1.5 sm:p-2 rounded-full hover:bg-slate-100"><ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5"/></button>
                            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-1.5 sm:p-2 rounded-full hover:bg-slate-100"><ChevronRight className="w-4 h-4 sm:w-5 sm:h-5"/></button>
                             <button onClick={() => handleOpenApptModal(new Date().toISOString().split('T')[0])} className="bg-[#8C3A36] text-white px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1 hover:bg-[#7a2f2b]"><Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">New Appointment</span><span className="sm:hidden">New</span></button>
                        </div>
                    </div>
                            <div className="grid grid-cols-7 text-center text-[10px] sm:text-xs font-bold text-slate-500 uppercase">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="py-1.5 sm:py-2">{d}</div>)}
                            </div>
                            <div className="grid grid-cols-7 border-t border-l">
                        {days.map(d => {
                            const isToday = d.toDateString() === today.toDateString();
                            const isCurrentMonth = d.getMonth() === currentMonth.getMonth();
                            const dayAppts = appointments.filter(a => new Date(a.date).toDateString() === d.toDateString());
                            return (
                                <div key={d.toString()} className={`h-20 sm:h-24 lg:h-28 border-b border-r p-1 sm:p-2 flex flex-col ${isCurrentMonth ? 'bg-white' : 'bg-slate-50'} relative group`}>
                                    <button onClick={() => handleOpenApptModal(d.toISOString().split('T')[0])} className="absolute top-0.5 sm:top-1 right-0.5 sm:right-1 p-0.5 sm:p-1 opacity-0 group-hover:opacity-100 bg-white rounded-full shadow hover:bg-slate-100"><Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-500"/></button>
                                    <span className={`text-xs sm:text-sm font-semibold ${isToday ? 'bg-[#8C3A36] text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center' : isCurrentMonth ? 'text-slate-800' : 'text-slate-400'}`}>{d.getDate()}</span>
                                    <div className="mt-0.5 sm:mt-1 space-y-0.5 sm:space-y-1 overflow-y-auto text-[9px] sm:text-xs">
                                        {dayAppts.map(appt => (
                                            <button key={appt.id} onClick={() => handleOpenApptModal(d.toISOString().split('T')[0], appt)} className={`w-full text-left p-0.5 sm:p-1 rounded ${getApptColor(appt.type)} bg-opacity-20 text-slate-800 hover:ring-2`}>
                                                <div className="font-semibold truncate">{appt.type}</div>
                                                <div className="text-slate-600 text-[8px] sm:text-[10px]">{new Date(appt.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                            </div>
                        </div>
                    </div>
                </div>
            )
        };
        return renderCalendar();
      case 'billing':
        return (
           <div className="bg-white rounded-lg border p-4 sm:p-6 w-full overflow-x-hidden">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-3 sm:mb-4">
                 <h3 className="text-base sm:text-lg font-bold text-slate-800">Invoices</h3>
                 <button onClick={handleGenerateInvoice} className="w-full sm:w-auto bg-[#8C3A36] text-white px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-1 hover:bg-[#7a2f2b]"><Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> New Invoice</button>
              </div>
              {/* Mobile Card View */}
              <div className="block sm:hidden space-y-3">
                {invoices.length > 0 ? invoices.map(inv => (
                  <div key={inv.id} className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 font-medium">{new Date(inv.generatedAt).toLocaleDateString()}</p>
                        <p className="font-bold text-slate-800 mt-1">{getCurrencySymbol(inv.currency)}{inv.amount.toFixed(2)}</p>
                        <p className="text-xs text-slate-500 mt-1">Due: {new Date(inv.dueDate).toLocaleDateString()}</p>
                      </div>
                      <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${inv.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{inv.status}</span>
                    </div>
                    <button
                      onClick={() => handleOpenInvoiceActions(inv)}
                      className="w-full mt-2 p-2 text-slate-600 hover:text-[#8C3A36] rounded-lg hover:bg-[#F9F5F5] transition-colors text-xs font-medium flex items-center justify-center gap-1"
                    >
                      <Send className="w-3.5 h-3.5" /> View Actions
                    </button>
                  </div>
                )) : <p className="text-center py-8 text-slate-400 text-sm">No invoices yet.</p>}
              </div>
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                 <table className="w-full text-left text-sm">
                    <thead className="border-b text-slate-500">
                       <tr>
                          <th className="py-2">Date</th>
                          <th className="py-2">Amount</th>
                          <th className="py-2">Status</th>
                          <th className="py-2">Due</th>
                          <th className="py-2 text-right">Actions</th>
                       </tr>
                    </thead>
                    <tbody>
                       {invoices.map(inv => (
                         <tr key={inv.id} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="py-3">{new Date(inv.generatedAt).toLocaleDateString()}</td>
                            <td className="py-3 font-medium">{getCurrencySymbol(inv.currency)}{inv.amount.toFixed(2)}</td>
                            <td className="py-3">
                              <span className={`px-2 py-1 text-xs font-bold rounded-full ${inv.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{inv.status}</span>
                            </td>
                            <td className="py-3">{new Date(inv.dueDate).toLocaleDateString()}</td>
                            <td className="py-3 text-right">
                                <button
                                    onClick={() => handleOpenInvoiceActions(inv)}
                                    className="p-2 text-slate-400 hover:text-[#8C3A36] rounded-lg hover:bg-[#F9F5F5] transition-colors"
                                    title="Invoice Actions"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </td>
                         </tr>
                       ))}
                       {invoices.length === 0 && (
                          <tr><td colSpan={5} className="text-center py-8 text-slate-400">No invoices yet.</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        );
      default:
        return null;
    }
  };


  return (
    <div className="animate-in fade-in duration-300 w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Client List</span><span className="sm:hidden">Back</span>
        </button>
        <button onClick={() => setShowShareModal(true)} className="bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:bg-slate-50">
           <Share2 className="w-4 h-4 text-[#8C3A36]"/> Share Client Portal
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 mb-4 sm:mb-6">
        <img src={client.avatarUrl} alt={client.name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover bg-slate-200 border-4 border-white shadow-md flex-shrink-0"/>
        <div className="flex-1 min-w-0 w-full">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 truncate">{client.name}</h1>
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-x-4 gap-y-1 text-slate-500 mt-2">
             <span className="flex items-center gap-1.5 text-xs sm:text-sm truncate"><Mail className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0"/> <span className="truncate">{client.email}</span></span>
             <span className="flex items-center gap-1.5 text-xs sm:text-sm"><MapPin className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0"/> Joined: {new Date(client.joinedAt).toLocaleDateString()}</span>
             <span className="flex items-center gap-1.5 text-xs sm:text-sm"><DollarSign className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0"/> Plan: Pro</span>
          </div>
          <p className="mt-2 text-xs sm:text-sm font-semibold text-[#8C3A36] bg-[#F9F5F5] px-3 py-1 rounded-full inline-block border border-stone-200">
             Goal: {client.goal}
          </p>
        </div>
      </div>
      
      <div className="w-full overflow-x-auto overflow-y-hidden border-b border-slate-200 tab-scroll" style={{scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch'}}>
        <div className="flex min-w-max">
          {tabItems.map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0
                ${activeTab === tab.id 
                  ? 'border-b-2 border-[#8C3A36] text-[#8C3A36]' 
                  : 'text-slate-500 hover:text-slate-800'}`}
            >
              <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" /> <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      
      <div className="mt-4 sm:mt-6 w-full overflow-x-hidden">
        {renderContent()}
      </div>

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
           <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
               <div className="p-4 sm:p-6">
                  <div className="flex justify-between items-center mb-3 sm:mb-4">
                     <h3 className="font-bold text-base sm:text-lg">Share Client Portal</h3>
                     <button onClick={() => setShowShareModal(false)} className="p-1"><X className="w-4 h-4 sm:w-5 sm:h-5"/></button>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 mb-3 sm:mb-4">Share this secure link with your client so they can view their meal plans, log progress, and message you.</p>
                  <div className="relative">
                     <input type="text" readOnly value={portalLink} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 sm:p-3 text-xs sm:text-sm pr-16 sm:pr-20" />
                     <button 
                       onClick={() => {
                         navigator.clipboard.writeText(portalLink);
                         setCopied(true);
                         setTimeout(() => setCopied(false), 2000);
                       }}
                       className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 bg-[#8C3A36] text-white px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold hover:bg-[#7a2f2b]"
                     >
                       {copied ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> : 'Copy'}
                     </button>
                  </div>
                  <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-200">
                    <div className="flex items-start gap-2 sm:gap-3">
                        <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-800 text-sm sm:text-base">Regenerate Access Link</h4>
                            <p className="text-xs sm:text-sm text-slate-600 mt-1">
                                If you believe the client's portal link has been compromised, you can regenerate it. This will permanently disable the old link.
                            </p>
                            <button
                                onClick={handleRegenerateLink}
                                disabled={regenerating}
                                className="mt-2 sm:mt-3 bg-amber-50 text-amber-700 border border-amber-200 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold hover:bg-amber-100 disabled:opacity-50 flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto"
                            >
                                {regenerating ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin"/> : <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4"/>}
                                {regenerating ? 'Regenerating...' : 'Regenerate Link'}
                            </button>
                        </div>
                    </div>
                  </div>
               </div>
           </div>
        </div>
      )}

      {showInvoiceModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
             <form onSubmit={handleSaveInvoice} className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
               <div className="bg-slate-900 p-4 sm:p-5 text-white flex justify-between items-center sticky top-0">
                  <h3 className="font-bold text-base sm:text-lg truncate pr-2">New Invoice for {client.name}</h3>
                  <button type="button" onClick={() => setShowInvoiceModal(false)} className="p-1 flex-shrink-0"><X className="w-4 h-4 sm:w-5 sm:h-5"/></button>
               </div>
               <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
                 <div>
                    <label className="text-xs font-bold uppercase text-slate-600">Due Date</label>
                    <input type="date" value={invoiceForm.dueDate} onChange={e => setInvoiceForm({...invoiceForm, dueDate: e.target.value})} className="w-full p-2 text-sm sm:text-base border rounded-md mt-1"/>
                 </div>
                 <div>
                    <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">Invoice Items</label>
                    <div className="space-y-2">
                       {invoiceForm.items.map((item, index) => (
                          <div key={index} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                             <input type="text" value={item.description} onChange={e => handleUpdateInvoiceItem(index, 'description', e.target.value)} placeholder="Description" className="flex-1 p-2 text-sm sm:text-base border rounded-md"/>
                             <div className="flex items-center gap-2">
                               <input type="number" value={item.cost} onChange={e => handleUpdateInvoiceItem(index, 'cost', e.target.value)} placeholder="Cost" className="w-24 sm:w-28 p-2 text-sm sm:text-base border rounded-md"/>
                               <button type="button" onClick={() => handleRemoveInvoiceItem(index)} className="p-2 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="w-4 h-4 text-red-500"/></button>
                             </div>
                          </div>
                       ))}
                    </div>
                    <button type="button" onClick={handleAddInvoiceItem} className="mt-2 text-xs sm:text-sm text-[#8C3A36] font-medium flex items-center gap-1"><Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> Add Item</button>
                 </div>
                 <div className="text-right font-bold text-base sm:text-lg pt-3 sm:pt-4 border-t">
                    Total: {getCurrencySymbol(billingSettings.currency)}{invoiceForm.items.reduce((acc, item) => acc + item.cost, 0).toFixed(2)}
                 </div>
               </div>
               <div className="p-3 sm:p-4 bg-slate-50 border-t flex justify-end sticky bottom-0">
                  <button type="submit" disabled={savingInvoice} className="bg-[#8C3A36] text-white px-4 sm:px-6 py-2 rounded-lg font-bold disabled:opacity-50 hover:bg-[#7a2f2b] text-sm sm:text-base flex items-center gap-2">
                     {savingInvoice ? <><Loader2 className="w-4 h-4 animate-spin"/> Creating...</> : 'Create & Send'}
                  </button>
               </div>
            </form>
         </div>
      )}

      {showApptModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
             <form onSubmit={handleSaveAppt} className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
               <div className="bg-slate-900 p-4 sm:p-5 text-white flex justify-between items-center sticky top-0">
                  <h3 className="font-bold text-base sm:text-lg">{selectedAppt ? 'Edit' : 'New'} Appointment</h3>
                  <button type="button" onClick={() => setShowApptModal(false)} className="p-1 flex-shrink-0"><X className="w-4 h-4 sm:w-5 sm:h-5"/></button>
               </div>
               <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                     <div>
                        <label className="text-xs font-bold uppercase text-slate-600">Date</label>
                        <input type="date" required value={apptForm.date} onChange={e => setApptForm({...apptForm, date: e.target.value})} className="w-full p-2 text-sm sm:text-base border rounded-md mt-1"/>
                     </div>
                     <div>
                        <label className="text-xs font-bold uppercase text-slate-600">Time</label>
                        <input type="time" required value={apptForm.time} onChange={e => setApptForm({...apptForm, time: e.target.value})} className="w-full p-2 text-sm sm:text-base border rounded-md mt-1"/>
                     </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-600">Type</label>
                    <select value={apptForm.type} onChange={e => setApptForm({...apptForm, type: e.target.value as any})} className="w-full p-2 text-sm sm:text-base border rounded-md mt-1">
                        <option>Check-in</option>
                        <option>Consultation</option>
                        <option>Onboarding</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-600">Notes</label>
                    <textarea value={apptForm.notes} onChange={e => setApptForm({...apptForm, notes: e.target.value})} className="w-full p-2 text-sm sm:text-base border rounded-md mt-1 h-20 sm:h-24 resize-none"></textarea>
                  </div>
               </div>
               <div className="p-3 sm:p-4 bg-slate-50 border-t flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-0 sticky bottom-0">
                  {selectedAppt && <button type="button" onClick={() => handleDeleteAppointment(selectedAppt.id)} className="text-xs sm:text-sm text-red-600 font-bold hover:underline py-2 sm:py-0">Delete</button>}
                  <div className="sm:ml-auto w-full sm:w-auto">
                    <button type="submit" disabled={savingAppt} className="w-full sm:w-auto bg-[#8C3A36] text-white px-4 sm:px-6 py-2 rounded-lg font-bold disabled:opacity-50 hover:bg-[#7a2f2b] text-sm sm:text-base flex items-center justify-center gap-2">
                        {savingAppt ? <><Loader2 className="w-4 h-4 animate-spin"/> Saving...</> : 'Save Appointment'}
                    </button>
                  </div>
               </div>
            </form>
         </div>
      )}

      {showInvoiceActionModal && selectedInvoiceAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                <div className="p-4 sm:p-5 flex justify-between items-center border-b bg-slate-50 sticky top-0">
                    <h3 className="font-bold text-base sm:text-lg text-slate-800">Invoice Actions</h3>
                    <button onClick={() => setShowInvoiceActionModal(false)} className="text-slate-500 hover:text-slate-800 p-1"><X className="w-4 h-4 sm:w-5 sm:h-5"/></button>
                </div>
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
                    <div className="space-y-2">
                        <p className="text-sm sm:text-base"><span className="font-semibold text-slate-600">Client:</span> <span className="break-words">{client.name}</span></p>
                        <p className="text-sm sm:text-base"><span className="font-semibold text-slate-600">Amount:</span> {getCurrencySymbol(selectedInvoiceAction.currency)}{selectedInvoiceAction.amount.toFixed(2)}</p>
                        <p className="text-sm sm:text-base">
                            <span className="font-semibold text-slate-600">Status:</span>
                            <span className={`ml-2 font-medium ${selectedInvoiceAction.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'} px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs`}>
                                {selectedInvoiceAction.status}
                            </span>
                        </p>
                    </div>
                    
                    {selectedInvoiceAction.status !== 'Paid' && (
                        <>
                            <div>
                                <label className="text-xs font-bold uppercase text-slate-600">Client Payment Link</label>
                                <div className="relative mt-1">
                                    <input 
                                        type="text" 
                                        readOnly 
                                        value={`${window.location.origin}/#/portal/${client.portalAccessToken}?tab=billing`} 
                                        className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 sm:p-2.5 text-xs sm:text-sm pr-16 sm:pr-20 text-slate-700" 
                                    />
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/#/portal/${client.portalAccessToken}?tab=billing`);
                                            setCopiedPaymentLink(true);
                                            setTimeout(() => setCopiedPaymentLink(false), 2000);
                                        }}
                                        className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 bg-[#8C3A36] text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold hover:bg-[#7a2f2b] w-14 sm:w-16"
                                    >
                                        {copiedPaymentLink ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mx-auto"/> : 'Copy'}
                                    </button>
                                </div>
                                <p className="text-[10px] sm:text-xs text-slate-500 mt-1">Share this link with your client to pay online.</p>
                            </div>

                            <button 
                                onClick={handleMarkAsPaid}
                                className="w-full py-2 bg-green-100 text-green-700 border border-green-200 font-bold rounded-lg text-xs sm:text-sm hover:bg-green-200 transition-colors"
                            >
                                Mark as Paid Manually
                            </button>
                        </>
                    )}
                </div>
                <div className="p-3 sm:p-4 bg-slate-50 border-t flex justify-end sticky bottom-0">
                    <button onClick={() => setShowInvoiceActionModal(false)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs sm:text-sm hover:bg-slate-300 w-full sm:w-auto">
                        Close
                    </button>
                </div>
            </div>
        </div>
      )}

      {showExtractionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 p-4 sm:p-5 text-white flex justify-between items-center sticky top-0">
              <h3 className="font-bold text-base sm:text-lg">Review Extracted Information</h3>
              <button onClick={handleRejectExtraction} className="p-1 flex-shrink-0"><X className="w-4 h-4 sm:w-5 sm:h-5"/></button>
            </div>
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-xs sm:text-sm text-slate-600 mb-4">The following information was extracted from the document. Review and accept to populate the records fields, or reject to discard.</p>
              
              {extractedData.medicalHistory && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Medical History</label>
                  <textarea 
                    value={extractedData.medicalHistory} 
                    onChange={e => setExtractedData({...extractedData, medicalHistory: e.target.value})}
                    className="w-full p-2 text-sm border rounded-md h-20 sm:h-24 resize-none"
                  />
                </div>
              )}
              
              {extractedData.allergies && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Allergies</label>
                  <textarea 
                    value={extractedData.allergies} 
                    onChange={e => setExtractedData({...extractedData, allergies: e.target.value})}
                    className="w-full p-2 text-sm border rounded-md h-16 sm:h-20 resize-none"
                  />
                </div>
              )}
              
              {extractedData.medications && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Medications</label>
                  <textarea 
                    value={extractedData.medications} 
                    onChange={e => setExtractedData({...extractedData, medications: e.target.value})}
                    className="w-full p-2 text-sm border rounded-md h-16 sm:h-20 resize-none"
                  />
                </div>
              )}
              
              {extractedData.dietaryHistory && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Dietary History</label>
                  <textarea 
                    value={extractedData.dietaryHistory} 
                    onChange={e => setExtractedData({...extractedData, dietaryHistory: e.target.value})}
                    className="w-full p-2 text-sm border rounded-md h-20 sm:h-24 resize-none"
                  />
                </div>
              )}
              
              {extractedData.socialBackground && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Social Background</label>
                  <textarea 
                    value={extractedData.socialBackground} 
                    onChange={e => setExtractedData({...extractedData, socialBackground: e.target.value})}
                    className="w-full p-2 text-sm border rounded-md h-20 sm:h-24 resize-none"
                  />
                </div>
              )}
              
              {!extractedData.medicalHistory && !extractedData.allergies && !extractedData.medications && !extractedData.dietaryHistory && !extractedData.socialBackground && (
                <p className="text-sm text-slate-500 text-center py-4">No relevant information was extracted from this document.</p>
              )}
            </div>
            <div className="p-3 sm:p-4 bg-slate-50 border-t flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0">
              <button 
                onClick={handleRejectExtraction} 
                className="px-4 sm:px-6 py-2 rounded-lg font-bold text-sm sm:text-base border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Discard
              </button>
              <button 
                onClick={handleAcceptExtraction} 
                className="px-4 sm:px-6 py-2 rounded-lg font-bold text-sm sm:text-base bg-[#8C3A36] text-white hover:bg-[#7a2f2b]"
              >
                Accept & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {showProgressLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
          <form onSubmit={handleSaveProgressLog} className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="bg-[#8C3A36] p-4 sm:p-5 text-white flex justify-between items-center sticky top-0">
              <h3 className="font-bold text-base sm:text-lg">Log Progress</h3>
              <button type="button" onClick={() => setShowProgressLogModal(false)} className="p-1 flex-shrink-0"><X className="w-4 h-4 sm:w-5 sm:h-5"/></button>
            </div>
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date</label>
                <input 
                  type="date" 
                  required
                  className="w-full p-2 text-sm border border-slate-300 rounded-lg"
                  value={progressLog.date}
                  onChange={e => setProgressLog({...progressLog, date: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Weight (kg)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  required 
                  className="w-full p-2 text-sm border border-slate-300 rounded-lg" 
                  value={progressLog.weight} 
                  onChange={e => setProgressLog({...progressLog, weight: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Body Fat</label>
                    <div className="flex gap-1 bg-slate-100 rounded p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setProgressLogBodyFatFormat('percentage');
                          setProgressLog({...progressLog, bodyFatMass: ''});
                        }}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${progressLogBodyFatFormat === 'percentage' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProgressLogBodyFatFormat('kg');
                          setProgressLog({...progressLog, bodyFatPercentage: ''});
                        }}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${progressLogBodyFatFormat === 'kg' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                      >
                        kg
                      </button>
                    </div>
                  </div>
                  {progressLogBodyFatFormat === 'percentage' ? (
                    <input 
                      type="number" 
                      step="0.1" 
                      placeholder="%" 
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg" 
                      value={progressLog.bodyFatPercentage} 
                      onChange={e => setProgressLog({...progressLog, bodyFatPercentage: e.target.value, bodyFatMass: ''})} 
                    />
                  ) : (
                    <input 
                      type="number" 
                      step="0.1" 
                      placeholder="kg" 
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg" 
                      value={progressLog.bodyFatMass} 
                      onChange={e => setProgressLog({...progressLog, bodyFatMass: e.target.value, bodyFatPercentage: ''})} 
                    />
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Muscle Mass</label>
                    <div className="flex gap-1 bg-slate-100 rounded p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setProgressLogMuscleFormat('kg');
                          setProgressLog({...progressLog, skeletalMusclePercentage: ''});
                        }}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${progressLogMuscleFormat === 'kg' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                      >
                        kg
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProgressLogMuscleFormat('percentage');
                          setProgressLog({...progressLog, skeletalMuscleMass: ''});
                        }}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${progressLogMuscleFormat === 'percentage' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                      >
                        %
                      </button>
                    </div>
                  </div>
                  {progressLogMuscleFormat === 'kg' ? (
                    <input 
                      type="number" 
                      step="0.1" 
                      placeholder="kg" 
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg" 
                      value={progressLog.skeletalMuscleMass} 
                      onChange={e => setProgressLog({...progressLog, skeletalMuscleMass: e.target.value, skeletalMusclePercentage: ''})} 
                    />
                  ) : (
                    <input 
                      type="number" 
                      step="0.1" 
                      placeholder="%" 
                      className="w-full p-2 text-sm border border-slate-300 rounded-lg" 
                      value={progressLog.skeletalMusclePercentage} 
                      onChange={e => setProgressLog({...progressLog, skeletalMusclePercentage: e.target.value, skeletalMuscleMass: ''})} 
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Compliance Score (0-100%)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    className="flex-1"
                    value={progressLog.complianceScore}
                    onChange={e => setProgressLog({...progressLog, complianceScore: parseInt(e.target.value)})}
                  />
                  <span className="font-bold w-12 text-right text-sm">{progressLog.complianceScore}%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes</label>
                <textarea 
                  className="w-full p-2 text-sm border border-slate-300 rounded-lg h-20 sm:h-24 resize-none"
                  placeholder="Meeting notes, observations..."
                  value={progressLog.notes}
                  onChange={e => setProgressLog({...progressLog, notes: e.target.value})}
                />
              </div>
            </div>
            <div className="p-3 sm:p-4 bg-slate-50 border-t flex justify-end sticky bottom-0">
              <button 
                type="submit" 
                disabled={savingProgressLog} 
                className="bg-[#8C3A36] text-white px-4 sm:px-6 py-2 rounded-lg font-bold disabled:opacity-50 hover:bg-[#7a2f2b] text-sm sm:text-base flex items-center gap-2"
              >
                {savingProgressLog ? <><Loader2 className="w-4 h-4 animate-spin"/> Saving...</> : 'Save Progress Log'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};

export default ClientProfile;
