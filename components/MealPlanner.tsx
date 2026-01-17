import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ChefHat, RefreshCw, Save, Upload, FileText, Edit2, Check, ShoppingCart, Printer, BarChart3, ChevronDown, ChevronUp, Calendar, AlertCircle, Trash2, Brain, PieChart, Copy, X } from 'lucide-react';
import { generateMealPlan } from '../services/geminiService';
import { DailyPlan, MealGenParams, Client, SavedMealPlan, Meal } from '../types';
import { supabase } from '../services/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Pie, Cell, Legend } from 'recharts';
import { useToast } from '../utils/toast';
import { ConfirmModal } from '../utils/confirmModal';

interface MealPlannerProps {
  selectedClient: Client | null;
}

// -- Helper Components --

const EditableField: React.FC<{
  value: string | number;
  onChange: (val: string) => void;
  className?: string;
  type?: "text" | "number" | "textarea";
  label: string;
  suffix?: string;
}> = ({ value, onChange, className = "", type = "text", label, suffix }) => (
  <div className="w-full">
    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">{label}</label>
    <div className="relative group">
      {type === 'textarea' ? (
        <textarea 
          value={value} 
          onChange={e => onChange(e.target.value)}
          rows={2}
          className={`w-full bg-slate-50 border border-slate-300 hover:border-[#8FAA41] focus:border-[#8C3A36] focus:bg-white p-1 rounded-md transition-all text-sm resize-none ${className}`}
        />
      ) : (
        <input 
          type={type} 
          value={value} 
          onChange={e => onChange(e.target.value)}
          className={`w-full bg-slate-50 border border-slate-300 hover:border-[#8FAA41] focus:border-[#8C3A36] focus:bg-white p-1 rounded-md transition-all text-sm ${className}`}
        />
      )}
      {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
    </div>
  </div>
);

const ValueDisplay: React.FC<{
  label: string;
  value: string | number;
  suffix?: string;
  className?: string;
}> = ({ label, value, suffix, className }) => (
  <div className="w-full">
    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">{label}</label>
    <div className={`text-sm text-slate-800 font-medium pt-1 pb-1 min-h-[34px] ${className}`}>
      {value}
      {suffix && <span className="ml-1 text-xs text-slate-500 font-normal">{suffix}</span>}
    </div>
  </div>
);


const InfoField: React.FC<{ label: string; value?: string; }> = ({ label, value }) => (
  <div>
    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">{label}</label>
    <div className="text-sm text-slate-700 bg-slate-100 p-2 rounded-md border border-slate-200 min-h-[30px]">
      {value || <span className="text-slate-400 italic">None</span>}
    </div>
  </div>
);

// -- Main Component --
export const MealPlanner: React.FC<MealPlannerProps> = ({ selectedClient }) => {
  const { showToast } = useToast();
  const [params, setParams] = useState<MealGenParams | null>(null);
  const [plan, setPlan] = useState<DailyPlan[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedMealPlan[]>([]);
  const [saving, setSaving] = useState(false);
  const [planLabel, setPlanLabel] = useState(`Plan - ${new Date().toLocaleDateString()}`);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [expandedDayIndex, setExpandedDayIndex] = useState<number | null>(0);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [planAnalytics, setPlanAnalytics] = useState<{
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFats: number;
    macroDistribution: { name: string, value: number, fill: string }[];
  } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (selectedClient) {
      setParams({
        age: selectedClient.age || 30,
        gender: selectedClient.gender || 'Female',
        weight: selectedClient.weight || 70,
        height: selectedClient.height || 170,
        goal: selectedClient.goal || 'Weight Loss',
        allergies: selectedClient.allergies || '',
        preferences: selectedClient.preferences || '',
        activityLevel: selectedClient.activityLevel || 'Moderate',
        medicalHistory: selectedClient.medicalHistory || '',
        medications: selectedClient.medications || '',
        dietaryHistory: selectedClient.dietaryHistory || '',
        socialBackground: selectedClient.socialBackground || '',
        customInstructions: '',
        excludeMeal: null,
      });
      fetchSavedPlans(selectedClient.id);
      setPlan(null);
      setError(null);
      setLoading(false);
    } else {
      setParams(null);
      setPlan(null);
      setSavedPlans([]);
    }
  }, [selectedClient]);

  useEffect(() => {
    if (plan) {
      const totalDays = plan.length;
      if (totalDays === 0) { setPlanAnalytics(null); return; }
      
      let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;

      plan.forEach(day => {
        const meals: Meal[] = [day.breakfast, day.lunch, day.dinner, ...(day.snacks || [])].filter(Boolean) as Meal[];
        meals.forEach(meal => {
            totalCalories += meal.calories || 0;
            totalProtein += parseFloat(meal.protein) || 0;
            totalCarbs += parseFloat(meal.carbs) || 0;
            totalFats += parseFloat(meal.fats) || 0;
        });
      });

      const avgCalories = Math.round(totalCalories / totalDays);
      const avgProtein = Math.round(totalProtein / totalDays);
      const avgCarbs = Math.round(totalCarbs / totalDays);
      const avgFats = Math.round(totalFats / totalDays);

      const totalMacros = avgProtein + avgCarbs + avgFats;
      setPlanAnalytics({
        avgCalories, avgProtein, avgCarbs, avgFats,
        macroDistribution: [
          { name: 'Protein', value: totalMacros > 0 ? Math.round((avgProtein / totalMacros) * 100) : 0, fill: '#3b82f6'},
          { name: 'Carbs', value: totalMacros > 0 ? Math.round((avgCarbs / totalMacros) * 100) : 0, fill: '#f59e0b' },
          { name: 'Fats', value: totalMacros > 0 ? Math.round((avgFats / totalMacros) * 100) : 0, fill: '#ef4444' },
        ]
      });
      setExpandedDayIndex(0);
    } else {
      setPlanAnalytics(null);
    }
  }, [plan]);

  const fetchSavedPlans = async (clientId: string) => {
    const { data } = await supabase.from('meal_plans').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    if (data) {
      setSavedPlans(data.map(p => ({
        id: p.id,
        clientId: p.client_id,
        createdAt: p.created_at,
        planData: p.plan_data,
        label: p.day_label || `Plan from ${new Date(p.created_at).toLocaleDateString()}`,
      })));
    }
  };
  
  const handleParamChange = (field: keyof MealGenParams, value: any) => {
    if (params) {
      setParams({ ...params, [field]: value });
    }
  };

  const handleGenerate = async () => {
    if (!params) return;
    setLoading(true);
    setError(null);
    setPlan(null);
    setIsEditing(false);
    setExpandedDayIndex(null);

    let finalParams = { ...params };
    
    const executeGeneration = async (genParams: MealGenParams) => {
        try {
            const result = await generateMealPlan(genParams);
            setPlan(result);
            setPlanLabel(`Plan - ${new Date().toLocaleDateString()}`);
        } catch (e: any) {
            setError(e.message || "Failed to generate plan. Check console for details.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (referenceFile) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            finalParams.referenceData = { inlineData: { data: base64String, mimeType: referenceFile.type } };
            executeGeneration(finalParams);
        };
        reader.onerror = () => { setError("Could not read the reference file."); setLoading(false); };
        reader.readAsDataURL(referenceFile);
    } else {
        executeGeneration(finalParams);
    }
  };

  const handleSavePlan = async () => {
    if (!plan || !selectedClient) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('meal_plans').insert({ client_id: selectedClient.id, plan_data: plan, day_label: planLabel });
      if (error) throw error;
      showToast('Plan saved!', 'success');
      fetchSavedPlans(selectedClient.id);
      setIsEditing(false);
    } catch (e: any) {
      showToast('Error saving plan: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePlan = (dayIndex: number, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snacks', field: keyof Meal | 'name' | 'ingredients' | 'calories', value: any, snackIndex?: number) => {
    if (!plan) return;
    const newPlan = JSON.parse(JSON.stringify(plan));
    let targetMeal;
    
    if (mealType === 'snacks' && snackIndex !== undefined) {
      targetMeal = newPlan[dayIndex][mealType][snackIndex];
    } else if (mealType !== 'snacks') {
      targetMeal = newPlan[dayIndex][mealType];
    }

    if (targetMeal) {
      if (field === 'ingredients' && typeof value === 'string') {
        targetMeal[field] = value.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        targetMeal[field] = value;
      }
    }
    setPlan(newPlan);
  };
  
  const handleDeleteSavedPlan = async (planId: string) => {
    setPlanToDelete(planId);
    setShowDeleteConfirm(true);
  };

  const confirmDeletePlan = async () => {
    if (!planToDelete) return;
    const { error } = await supabase.from('meal_plans').delete().eq('id', planToDelete);
    if (error) {
      showToast("Error deleting plan: " + error.message, 'error');
    } else {
      setSavedPlans(savedPlans.filter(p => p.id !== planToDelete));
      showToast('Plan deleted successfully', 'success');
    }
    setShowDeleteConfirm(false);
    setPlanToDelete(null);
  };

  const generateShoppingList = () => {
    if (!plan) return [];
    const allIngredients: string[] = [];
    plan.forEach(day => {
      [day.breakfast, day.lunch, day.dinner, ...(day.snacks || [])].forEach(meal => {
        if (meal && meal.ingredients) {
          allIngredients.push(...meal.ingredients);
        }
      });
    });
    // Remove duplicates and sort
    return Array.from(new Set(allIngredients)).sort();
  };

  const handlePrintShoppingList = () => {
    if (!plan || !selectedClient) return;
    const ingredients = generateShoppingList();
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <html>
        <head>
          <title>Shopping List - ${selectedClient.name}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; }
            h1 { color: #8C3A36; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; font-size: 24px; }
            .meta { margin-bottom: 30px; color: #64748b; font-size: 0.9em; }
            .list-container { column-count: 2; column-gap: 40px; }
            .item { break-inside: avoid; display: flex; align-items: flex-start; margin-bottom: 12px; font-size: 14px; line-height: 1.4; }
            .checkbox { 
              width: 16px; 
              height: 16px; 
              border: 2px solid #cbd5e1; 
              border-radius: 4px; 
              margin-right: 12px; 
              display: inline-block; 
              flex-shrink: 0;
              margin-top: 2px;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; }
              .checkbox { border-color: #64748b; }
            }
          </style>
        </head>
        <body>
          <h1>Shopping List</h1>
          <div class="meta">
            Prepared for <strong>${selectedClient.name}</strong><br/>
            Date: ${new Date().toLocaleDateString()}
          </div>
          <div class="list-container">
            ${ingredients.map(item => `
              <div class="item">
                <span class="checkbox"></span>
                <span>${item}</span>
              </div>
            `).join('')}
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handlePrint = () => {
    if (!plan || !selectedClient) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <html>
        <head>
          <title>Meal Plan - ${selectedClient.name}</title>
          <style>
            body { font-family: sans-serif; padding: 30px; color: #1e293b; max-width: 1000px; mx-auto; }
            h1 { color: #8C3A36; text-align: center; margin-bottom: 5px; }
            .meta { margin-bottom: 30px; text-align: center; color: #64748b; font-size: 0.9em; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
            .day-card { border: 1px solid #e2e8f0; margin-bottom: 20px; page-break-inside: avoid; border-radius: 8px; overflow: hidden; }
            .day-header { background: #f8fafc; padding: 12px 15px; font-weight: bold; display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; color: #334155; }
            .meal-row { display: flex; }
            .meal-col { flex: 1; padding: 15px; border-left: 1px solid #f1f5f9; }
            .meal-col:first-child { border-left: none; }
            .meal-type { font-size: 0.7em; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: bold; margin-bottom: 4px; }
            .meal-name { font-weight: bold; margin-bottom: 6px; color: #0f172a; font-size: 0.95em; }
            .ingredients { font-size: 0.85em; color: #475569; line-height: 1.4; }
            .macros { font-size: 0.7em; color: #64748b; margin-top: 8px; font-weight: 500; }
            .snacks-row { background: #fcfcfc; padding: 10px 15px; font-size: 0.85em; border-top: 1px solid #f1f5f9; color: #475569; }
            @media print {
              body { -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <h1>7-Day Meal Plan</h1>
          <div class="meta">
            Prepared for <strong>${selectedClient.name}</strong> &bull; 
            Goal: <strong>${selectedClient.goal}</strong> &bull; 
            Generated: ${new Date().toLocaleDateString()}
          </div>
          
          ${plan.map(day => `
            <div class="day-card">
              <div class="day-header">
                <span>${day.day}</span>
                <span>Total: ${day.totalCalories} kcal</span>
              </div>
              <div class="meal-row">
                ${[
                  { type: 'Breakfast', meal: day.breakfast },
                  { type: 'Lunch', meal: day.lunch },
                  { type: 'Dinner', meal: day.dinner }
                ].filter(item => item.meal).map(({ type, meal }) => {
                  return `
                    <div class="meal-col">
                      <div class="meal-type">${type}</div>
                      <div class="meal-name">${meal.name}</div>
                      <div class="ingredients">${meal.ingredients.join(', ')}</div>
                      <div class="macros">${meal.calories}kcal | P:${meal.protein} C:${meal.carbs} F:${meal.fats}</div>
                    </div>
                  `;
                }).join('')}
              </div>
              ${day.snacks && day.snacks.length > 0 ? `
                 <div class="snacks-row">
                    <strong>Snacks:</strong> ${day.snacks.map(s => `${s.name}`).join(', ')}
                 </div>
              ` : ''}
            </div>
          `).join('')}
          <div style="margin-top: 40px; text-align: center; font-size: 0.8em; color: #94a3b8;">
            Generated by NutriTherapy Solutions
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (!selectedClient || !params) {
    return (
       <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
         <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
           <Brain className="w-10 h-10 text-slate-300" />
         </div>
         <h2 className="text-xl font-bold text-slate-800 mb-2">Select a Client</h2>
         <p className="text-slate-500 max-w-md">Select a client to generate, view, and manage their AI-powered meal plans.</p>
       </div>
    );
  }
  
  const MealItem: React.FC<{ meal: Meal, dayIndex: number, mealType: any, snackIndex?: number }> = ({ meal, dayIndex, mealType, snackIndex }) => {
    if (!meal) return null;
    return (
      <div className="mb-3 p-3 bg-white rounded-md border">
        {isEditing ? (
          <>
            <EditableField label="Meal Name" value={meal.name} onChange={v => handleUpdatePlan(dayIndex, mealType, 'name', v, snackIndex)} />
            <EditableField label="Ingredients" type="textarea" value={meal.ingredients?.join(', ') || ''} onChange={v => handleUpdatePlan(dayIndex, mealType, 'ingredients', v, snackIndex)} />
          </>
        ) : (
          <>
            <p className="font-semibold text-slate-700">{meal.name}</p>
            <p className="text-xs text-slate-500">{meal.ingredients?.join(', ')}</p>
          </>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mt-2 pt-2 border-t border-slate-100">
          {isEditing ? (
            <>
              <EditableField label="Cals" value={meal.calories} onChange={v => handleUpdatePlan(dayIndex, mealType, 'calories', parseInt(v) || 0, snackIndex)} type="number" suffix="kcal" />
              <EditableField label="Protein" value={meal.protein} onChange={v => handleUpdatePlan(dayIndex, mealType, 'protein', v, snackIndex)} suffix="g"/>
              <EditableField label="Carbs" value={meal.carbs} onChange={v => handleUpdatePlan(dayIndex, mealType, 'carbs', v, snackIndex)} suffix="g"/>
              <EditableField label="Fats" value={meal.fats} onChange={v => handleUpdatePlan(dayIndex, mealType, 'fats', v, snackIndex)} suffix="g"/>
            </>
          ) : (
            <>
              <ValueDisplay label="Cals" value={meal.calories} suffix="kcal" />
              <ValueDisplay label="Protein" value={meal.protein} suffix="g" />
              <ValueDisplay label="Carbs" value={meal.carbs} suffix="g" />
              <ValueDisplay label="Fats" value={meal.fats} suffix="g" />
            </>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2"><ChefHat className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]"/> AI Meal Plan Generator</h2>
          <div className="space-y-4">

            <EditableField label="Custom Instructions (for this plan only)" value={params.customInstructions || ''} onChange={v => handleParamChange('customInstructions', v)} type="textarea" />
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-wider">
                Exclude a meal (optional)
              </label>
              <select
                value={params.excludeMeal || ''}
                onChange={(e) => handleParamChange('excludeMeal', e.target.value ? e.target.value : null)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-[#8C3A36] focus:border-[#8C3A36]"
              >
                <option value="">Do not exclude</option>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snacks">Snacks</option>
              </select>
              <p className="text-xs text-slate-500 mt-2">
                The selected meal will be omitted for every day in the plan.
              </p>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Reference Image (Optional)</label>
              <div className="relative border border-dashed border-slate-300 rounded-lg p-3 text-center hover:bg-slate-50">
                  <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => e.target.files && setReferenceFile(e.target.files[0])} />
                  <div className={`flex items-center justify-center gap-2 text-sm ${referenceFile ? 'text-[#8C3A36]' : 'text-slate-500'}`}>
                    <Upload className="w-4 h-4" /> <span>{referenceFile ? referenceFile.name : "Upload image..."}</span>
                  </div>
              </div>
            </div>
            <button onClick={handleGenerate} disabled={loading} className="w-full bg-[#8C3A36] text-white font-bold py-3 rounded-lg hover:bg-[#7a2f2b] transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Brain className="w-5 h-5"/> Generate 7-Day Plan</>}
            </button>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2"><Save className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]"/> Saved Plans</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {savedPlans.length > 0 ? savedPlans.map(p => (
              <div key={p.id} className="group flex items-center justify-between p-3 bg-slate-50 rounded-lg border hover:bg-slate-100">
                <div>
                  <button onClick={() => { setPlan(p.planData); setPlanLabel(p.label); setIsEditing(false); }} className="font-semibold text-slate-700 hover:text-[#8C3A36] text-sm text-left">{p.label}</button>
                  <p className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</p>
                </div>
                <button onClick={() => handleDeleteSavedPlan(p.id)} className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-4 h-4"/>
                </button>
              </div>
            )) : <p className="text-sm text-slate-500 text-center py-4">No saved plans for this client.</p>}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 bg-white p-2 sm:p-6 rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
        {loading && <div className="flex flex-col items-center justify-center h-full"><Loader2 className="w-10 h-10 animate-spin text-[#8C3A36]"/><p className="mt-4 text-slate-500">Generating your plan...</p></div>}
        {error && <div className="flex flex-col items-center justify-center h-full p-4 text-center"><AlertCircle className="w-10 h-10 text-red-500 mb-4"/><p className="text-red-700 font-semibold">Error Generating Plan</p><p className="text-sm text-slate-600 mt-2">{error}</p></div>}
        {!loading && !error && !plan && <div className="flex flex-col items-center justify-center h-full text-center p-4"><div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4"><FileText className="w-10 h-10 text-slate-300"/></div><h3 className="text-xl font-bold text-slate-800">Your Plan Will Appear Here</h3><p className="text-slate-500 max-w-sm mt-2">Use the generator on the left to create a new 7-day meal plan for {selectedClient.name}.</p></div>}
        
        {plan && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-4 sm:p-0">
                {isEditing ? <input value={planLabel} onChange={(e) => setPlanLabel(e.target.value)} className="text-base sm:text-lg font-bold text-slate-800 bg-slate-100 rounded-md p-1 -m-1 w-full sm:w-auto" /> : <h3 className="text-base sm:text-lg font-bold text-slate-800 truncate">{planLabel}</h3>}
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setShowShoppingList(true)} className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200"><ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">Shopping List</span><span className="sm:hidden">List</span></button>
                    <button onClick={handlePrint} className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200"><Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">Print Plan</span><span className="sm:hidden">Print</span></button>
                    <button onClick={() => setIsEditing(!isEditing)} className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors ${isEditing ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 hover:bg-slate-200'}`}>
                        {isEditing ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> : <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4"/>} {isEditing ? 'Done' : 'Edit'}
                    </button>
                    <button onClick={handleSavePlan} disabled={saving} className="px-3 sm:px-4 py-1.5 bg-[#8C3A36] text-white rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 hover:bg-[#7a2f2b] disabled:opacity-50">
                        {saving ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin"/> : <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4"/>} {saving ? 'Saving...' : <span className="hidden sm:inline">Save Plan</span>}
                    </button>
                </div>
            </div>
            {planAnalytics && (
                <div className="bg-slate-50 rounded-xl border p-3 sm:p-4 grid md:grid-cols-2 gap-3 sm:gap-4 items-center">
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-white p-3 rounded-lg border text-center"><p className="text-xs font-bold text-slate-400 uppercase">Avg Cals</p><p className="text-xl font-bold text-[#8C3A36]">{planAnalytics.avgCalories}</p></div>
                        <div className="bg-white p-3 rounded-lg border text-center"><p className="text-xs font-bold text-slate-400 uppercase">Protein</p><p className="text-xl font-bold text-blue-600">{planAnalytics.avgProtein}g</p></div>
                        <div className="bg-white p-3 rounded-lg border text-center"><p className="text-xs font-bold text-slate-400 uppercase">Carbs</p><p className="text-xl font-bold text-amber-500">{planAnalytics.avgCarbs}g</p></div>
                        <div className="bg-white p-3 rounded-lg border text-center"><p className="text-xs font-bold text-slate-400 uppercase">Fats</p><p className="text-xl font-bold text-red-500">{planAnalytics.avgFats}g</p></div>
                    </div>
                    <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={planAnalytics.macroDistribution} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                <XAxis type="number" hide domain={[0, 100]}/>
                                <YAxis type="category" dataKey="name" hide />
                                <Tooltip formatter={(value) => `${value}%`} />
                                <Bar dataKey="value" barSize={20} radius={[10, 10, 10, 10]}>
                                    {planAnalytics.macroDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
             <div className="space-y-2 max-h-[calc(100vh-28rem)] overflow-y-auto pr-2">
              {plan.map((day, dayIndex) => (
                <div key={day.day} className="bg-slate-50/70 rounded-lg border overflow-hidden">
                  <button className="w-full flex justify-between items-center p-4 hover:bg-slate-100/50" onClick={() => setExpandedDayIndex(expandedDayIndex === dayIndex ? null : dayIndex)}>
                    <h4 className="font-bold text-slate-800 text-lg">{day.day}</h4>
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-[#8C3A36] bg-white px-2 py-1 rounded-full border">{day.totalCalories} kcal</span>
                        <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform ${expandedDayIndex === dayIndex ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {expandedDayIndex === dayIndex && (
                    <div className="p-4 border-t bg-slate-50/50 animate-in fade-in duration-200">
                        <MealItem meal={day.breakfast} dayIndex={dayIndex} mealType="breakfast" />
                        <MealItem meal={day.lunch} dayIndex={dayIndex} mealType="lunch" />
                        <MealItem meal={day.dinner} dayIndex={dayIndex} mealType="dinner" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showShoppingList && plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="bg-[#8C3A36] p-5 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2"><ShoppingCart className="w-5 h-5"/> Shopping List</h3>
              <button onClick={() => setShowShoppingList(false)} className="hover:bg-white/10 p-1 rounded-full"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-0 overflow-y-auto flex-1 bg-slate-50">
              <ul className="divide-y divide-slate-200">
                {generateShoppingList().map((item, idx) => (
                  <li key={idx} className="p-3 bg-white hover:bg-slate-50 flex items-center gap-3">
                     <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#8C3A36] focus:ring-[#8C3A36]"/>
                     <span className="text-sm text-slate-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 border-t bg-white flex justify-end gap-2">
               <button 
                onClick={handlePrintShoppingList}
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-slate-50"
               >
                 <Printer className="w-4 h-4"/> Print List
               </button>
               <button 
                onClick={() => {
                  const text = generateShoppingList().join('\n');
                  navigator.clipboard.writeText(text);
                  showToast('Copied to clipboard!', 'success', 2000);
                }}
                className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-slate-700"
               >
                 <Copy className="w-4 h-4"/> Copy List
               </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Meal Plan"
        message="Are you sure you want to delete this plan? This action cannot be undone."
        onConfirm={confirmDeletePlan}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setPlanToDelete(null);
        }}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};