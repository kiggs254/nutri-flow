import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingDown, TrendingUp, Activity, Plus, Calendar, Scale, CheckCircle, Droplet, Dumbbell } from 'lucide-react';
import { Client, ProgressLog } from '../types';
import { supabase } from '../services/supabase';
import { useToast } from '../utils/toast';

interface ProgressTrackerProps {
  selectedClient: Client | null;
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({ selectedClient }) => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Form State
  const [newLogBodyFatFormat, setNewLogBodyFatFormat] = useState<'percentage' | 'kg'>('percentage');
  const [newLogMuscleFormat, setNewLogMuscleFormat] = useState<'kg' | 'percentage'>('kg');
  const [newLog, setNewLog] = useState({
    date: new Date().toISOString().split('T')[0],
    weight: '',
    complianceScore: 80,
    notes: '',
    bodyFatPercentage: '',
    bodyFatMass: '',
    skeletalMuscleMass: '',
    skeletalMusclePercentage: '',
  });

  useEffect(() => {
    if (selectedClient) {
      fetchLogs();
      const lastWeight = selectedClient.weight?.toString() || '';
      const lastFatPercent = selectedClient.bodyFatPercentage?.toString() || '';
      const lastFatMass = selectedClient.bodyFatMass?.toString() || '';
      const lastMuscleMass = selectedClient.skeletalMuscleMass?.toString() || '';
      const lastMusclePercent = selectedClient.skeletalMusclePercentage?.toString() || '';

      setNewLog(prev => ({
        ...prev, 
        weight: lastWeight, 
        bodyFatPercentage: lastFatPercent, 
        bodyFatMass: lastFatMass,
        skeletalMuscleMass: lastMuscleMass,
        skeletalMusclePercentage: lastMusclePercent
      }));

      // Set formats based on available data
      setNewLogBodyFatFormat(lastFatPercent ? 'percentage' : (lastFatMass ? 'kg' : 'percentage'));
      setNewLogMuscleFormat(lastMuscleMass ? 'kg' : (lastMusclePercent ? 'percentage' : 'kg'));

    } else {
      setLogs([]);
    }
  }, [selectedClient]);

  const fetchLogs = async () => {
    if (!selectedClient) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('progress_logs')
        .select('*')
        .eq('client_id', selectedClient.id)
        .order('date', { ascending: true });

      if (data) {
        setLogs(data.map(l => ({
          id: l.id,
          date: l.date,
          weight: Number(l.weight),
          complianceScore: l.compliance_score,
          notes: l.notes,
          bodyFatPercentage: l.body_fat_percentage,
          bodyFatMass: l.body_fat_mass,
          skeletalMuscleMass: l.skeletal_muscle_mass,
          skeletalMusclePercentage: l.skeletal_muscle_percentage
        })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;

    try {
      const { error } = await supabase.from('progress_logs').insert({
        client_id: selectedClient.id,
        date: newLog.date,
        weight: parseFloat(newLog.weight),
        compliance_score: newLog.complianceScore,
        notes: newLog.notes,
        body_fat_percentage: newLog.bodyFatPercentage ? parseFloat(newLog.bodyFatPercentage) : null,
        body_fat_mass: newLog.bodyFatMass ? parseFloat(newLog.bodyFatMass) : null,
        skeletal_muscle_mass: newLog.skeletalMuscleMass ? parseFloat(newLog.skeletalMuscleMass) : null,
        skeletal_muscle_percentage: newLog.skeletalMusclePercentage ? parseFloat(newLog.skeletalMusclePercentage) : null,
      });

      if (error) throw error;

      setShowAddModal(false);
      setNewLog({ date: new Date().toISOString().split('T')[0], weight: '', complianceScore: 80, notes: '', bodyFatPercentage: '', bodyFatMass: '', skeletalMuscleMass: '', skeletalMusclePercentage: '' });
      fetchLogs();
    } catch (e: any) {
      showToast("Error adding log: " + e.message, 'error');
    }
  };

  const getCompositionStats = (
    logs: ProgressLog[], 
    client: Client | null, 
    metricPercentKey: keyof (ProgressLog & Client), 
    metricMassKey: keyof (ProgressLog & Client)
) => {
    const getValues = (key: keyof (ProgressLog & Client)) => {
        const startValue = logs.length > 0 ? logs[0][key] : client?.[key];
        const currentValue = logs.length > 0 ? logs[logs.length-1][key] : client?.[key];
        const change = (currentValue as number) - (startValue as number);
        return { start: startValue as number || 0, current: currentValue as number || 0, change: change || 0 };
    };
    
    const percent = getValues(metricPercentKey);
    const mass = getValues(metricMassKey);

    return { percent, mass };
};


  const weightStats = getCompositionStats(logs, selectedClient, 'weight' as any, 'weight' as any).mass; // Re-use for simple metric
  const fatStats = getCompositionStats(logs, selectedClient, 'bodyFatPercentage', 'bodyFatMass');
  const muscleStats = getCompositionStats(logs, selectedClient, 'skeletalMusclePercentage', 'skeletalMuscleMass');
  const avgCompliance = logs.length > 0 ? Math.round(logs.reduce((acc, l) => acc + l.complianceScore, 0) / logs.length) : 0;
  
  if (!selectedClient) {
    return (
       <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
         <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
           <Activity className="w-10 h-10 text-slate-300" />
         </div>
         <h2 className="text-xl font-bold text-slate-800 mb-2">Select a Client</h2>
         <p className="text-slate-500 max-w-md">Select a client to view their progress history and log new measurements.</p>
       </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
         <h2 className="text-2xl font-bold text-slate-900">Progress: {selectedClient.name}</h2>
         <button 
           onClick={() => {
             // Reset formats based on current client values
             const lastFatPercent = selectedClient.bodyFatPercentage?.toString() || '';
             const lastFatMass = selectedClient.bodyFatMass?.toString() || '';
             const lastMuscleMass = selectedClient.skeletalMuscleMass?.toString() || '';
             const lastMusclePercent = selectedClient.skeletalMusclePercentage?.toString() || '';

             setNewLogBodyFatFormat(lastFatPercent ? 'percentage' : (lastFatMass ? 'kg' : 'percentage'));
             setNewLogMuscleFormat(lastMuscleMass ? 'kg' : (lastMusclePercent ? 'percentage' : 'kg'));

             setNewLog(prev => ({
               ...prev,
               date: new Date().toISOString().split('T')[0],
               weight: selectedClient.weight?.toString() || '',
               bodyFatPercentage: lastFatPercent,
               bodyFatMass: lastFatMass,
               skeletalMuscleMass: lastMuscleMass,
               skeletalMusclePercentage: lastMusclePercent,
             }));

             setShowAddModal(true);
           }}
           className="bg-[#8C3A36] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7a2f2b] flex items-center gap-2 shadow-sm"
         >
           <Plus className="w-4 h-4" /> Log Progress
         </button>
      </div>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-[#F9F5F5] rounded-lg"><Scale className="w-5 h-5 text-[#8C3A36]" /></div>
             <span className="text-slate-500 text-sm font-medium">Weight</span>
           </div>
           <div className="text-3xl font-bold text-slate-900">{weightStats.current.toFixed(1)} kg</div>
           <div className={`text-xs mt-1 font-medium ${weightStats.change <= 0 ? 'text-[#8FAA41]' : 'text-red-600'}`}>
             {weightStats.change > 0 ? '+' : ''}{weightStats.change.toFixed(1)} kg since start
           </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-rose-100 rounded-lg"><Droplet className="w-5 h-5 text-rose-600" /></div>
             <span className="text-slate-500 text-sm font-medium">Body Fat</span>
           </div>
           {fatStats.percent.current > 0 ? (
             <>
               <div className="text-3xl font-bold text-slate-900">{fatStats.percent.current.toFixed(1)}%</div>
               {fatStats.mass.current > 0 && (
                 <div className={`text-xs mt-1 font-medium text-slate-500`}>
                   {fatStats.mass.current.toFixed(1)} kg
                 </div>
               )}
             </>
           ) : fatStats.mass.current > 0 ? (
             <>
               <div className="text-3xl font-bold text-slate-900">{fatStats.mass.current.toFixed(1)} kg</div>
             </>
           ) : (
             <div className="text-3xl font-bold text-slate-400">N/A</div>
           )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-blue-100 rounded-lg"><Dumbbell className="w-5 h-5 text-blue-600" /></div>
             <span className="text-slate-500 text-sm font-medium">Skeletal Muscle</span>
           </div>
           {muscleStats.mass.current > 0 ? (
             <>
               <div className="text-3xl font-bold text-slate-900">{muscleStats.mass.current.toFixed(1)} kg</div>
               {muscleStats.percent.current > 0 && (
                 <div className={`text-xs mt-1 font-medium text-slate-500`}>
                   {muscleStats.percent.current.toFixed(1)}%
                 </div>
               )}
             </>
           ) : muscleStats.percent.current > 0 ? (
             <>
               <div className="text-3xl font-bold text-slate-900">{muscleStats.percent.current.toFixed(1)}%</div>
             </>
           ) : (
             <div className="text-3xl font-bold text-slate-400">N/A</div>
           )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-purple-100 rounded-lg"><Activity className="w-5 h-5 text-purple-600" /></div>
             <span className="text-slate-500 text-sm font-medium">Plan Compliance</span>
           </div>
           <div className="text-3xl font-bold text-slate-900">{avgCompliance}%</div>
           <div className="text-xs text-purple-600 mt-1">
             Average score
           </div>
        </div>
      </div>

      {logs.length < 2 ? (
        <div className="bg-slate-50 rounded-xl p-12 text-center border border-slate-200">
           <p className="text-slate-500">At least two progress logs are needed to display charts. Keep logging to see the trends!</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Weight Trend Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-6">Weight Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={logs}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, {month:'short', day:'numeric'})} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 12, fill: '#64748b'}} 
                  />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} unit=" kg"/>
                  <Tooltip 
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  />
                  <Line type="monotone" dataKey="weight" name="Weight" stroke="#8FAA41" strokeWidth={2} dot={{fill: '#8FAA41', r: 4}} activeDot={{r: 6}} unit=" kg" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Body Composition Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-6">Body Composition Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={logs}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 12, fill: '#64748b'}} 
                  />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#f43f5e'}} unit="%"/>
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#3b82f6'}} unit=" kg"/>
                  <Tooltip 
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0'}} 
                  />
                  <Line yAxisId="left" type="monotone" dataKey="bodyFatPercentage" name="Body Fat" stroke="#f43f5e" strokeWidth={2} dot={{fill: '#f43f5e', r: 4}} activeDot={{r: 6}} unit="%" />
                  <Line yAxisId="right" type="monotone" dataKey="skeletalMuscleMass" name="Muscle Mass" stroke="#3b82f6" strokeWidth={2} dot={{fill: '#3b82f6', r: 4}} activeDot={{r: 6}} unit=" kg" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Progress Log History */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="font-semibold text-slate-800 mb-4">Progress History</h3>
        {logs.length === 0 ? (
          <p className="text-slate-500 text-sm">No progress logs recorded yet. Use \"Log Progress\" to add the first entry.</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {logs
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map(log => (
              <div key={log.id} className="border border-slate-200 rounded-lg p-3 sm:p-4 flex flex-col gap-1 bg-slate-50/70">
                <div className="flex justify-between items-center">
                  <div className="text-xs sm:text-sm font-semibold text-slate-800">
                    {new Date(log.date).toLocaleDateString()}
                  </div>
                  <div className="text-xs sm:text-sm text-slate-500">
                    {log.weight?.toFixed(1)} kg
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] sm:text-xs text-slate-500">
                  {log.bodyFatPercentage != null && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-medium">
                      Body Fat: {log.bodyFatPercentage.toFixed(1)}%
                    </span>
                  )}
                  {log.bodyFatMass != null && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-medium">
                      {log.bodyFatMass.toFixed(1)} kg fat
                    </span>
                  )}
                  {log.skeletalMuscleMass != null && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                      Muscle: {log.skeletalMuscleMass.toFixed(1)} kg
                    </span>
                  )}
                  {log.skeletalMusclePercentage != null && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                      {log.skeletalMusclePercentage.toFixed(1)}% muscle
                    </span>
                  )}
                  {log.complianceScore != null && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                      Compliance: {log.complianceScore}%
                    </span>
                  )}
                </div>
                {log.notes && (
                  <div className="text-xs sm:text-sm text-slate-700 mt-1 whitespace-pre-line">
                    {log.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Log Modal */}
      {showAddModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-[#8C3A36] p-6 text-white flex justify-between items-center">
                 <h3 className="font-bold text-lg">Log Progress</h3>
                 <button onClick={() => setShowAddModal(false)}><Plus className="w-6 h-6 rotate-45" /></button>
              </div>
              <form onSubmit={handleAddLog} className="p-6 space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date</label>
                    <input 
                       type="date" 
                       required
                       className="w-full p-2 border border-slate-300 rounded-lg"
                       value={newLog.date}
                       onChange={e => setNewLog({...newLog, date: e.target.value})}
                    />
                 </div>
                 <div className="grid grid-cols-1 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Weight (kg)</label>
                        <input type="number" step="0.1" required className="w-full p-2 border border-slate-300 rounded-lg" value={newLog.weight} onChange={e => setNewLog({...newLog, weight: e.target.value})}/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-bold text-slate-700 uppercase">Body Fat</label>
                                <div className="flex gap-1 bg-slate-100 rounded p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewLogBodyFatFormat('percentage');
                                            setNewLog({...newLog, bodyFatMass: ''});
                                        }}
                                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${newLogBodyFatFormat === 'percentage' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                                    >
                                        %
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewLogBodyFatFormat('kg');
                                            setNewLog({...newLog, bodyFatPercentage: ''});
                                        }}
                                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${newLogBodyFatFormat === 'kg' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                                    >
                                        kg
                                    </button>
                                </div>
                            </div>
                            {newLogBodyFatFormat === 'percentage' ? (
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="%"
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                    value={newLog.bodyFatPercentage}
                                    onChange={e => setNewLog({...newLog, bodyFatPercentage: e.target.value, bodyFatMass: ''})}
                                />
                            ) : (
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="kg"
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                    value={newLog.bodyFatMass}
                                    onChange={e => setNewLog({...newLog, bodyFatMass: e.target.value, bodyFatPercentage: ''})}
                                />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-bold text-slate-700 uppercase">Skeletal Muscle</label>
                                <div className="flex gap-1 bg-slate-100 rounded p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewLogMuscleFormat('kg');
                                            setNewLog({...newLog, skeletalMusclePercentage: ''});
                                        }}
                                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${newLogMuscleFormat === 'kg' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                                    >
                                        kg
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewLogMuscleFormat('percentage');
                                            setNewLog({...newLog, skeletalMuscleMass: ''});
                                        }}
                                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${newLogMuscleFormat === 'percentage' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                                    >
                                        %
                                    </button>
                                </div>
                            </div>
                            {newLogMuscleFormat === 'kg' ? (
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="kg"
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                    value={newLog.skeletalMuscleMass}
                                    onChange={e => setNewLog({...newLog, skeletalMuscleMass: e.target.value, skeletalMusclePercentage: ''})}
                                />
                            ) : (
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="%"
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                    value={newLog.skeletalMusclePercentage}
                                    onChange={e => setNewLog({...newLog, skeletalMusclePercentage: e.target.value, skeletalMuscleMass: ''})}
                                />
                            )}
                        </div>
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
                          value={newLog.complianceScore}
                          onChange={e => setNewLog({...newLog, complianceScore: parseInt(e.target.value)})}
                       />
                       <span className="font-bold w-12 text-right">{newLog.complianceScore}%</span>
                    </div>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes</label>
                    <textarea 
                       className="w-full p-2 border border-slate-300 rounded-lg h-24 text-sm"
                       placeholder="Feeling energetic, stuck to the plan..."
                       value={newLog.notes}
                       onChange={e => setNewLog({...newLog, notes: e.target.value})}
                    />
                 </div>
                 <button className="w-full bg-[#8C3A36] text-white font-bold py-3 rounded-lg hover:bg-[#7a2f2b] transition-colors">
                    Save Log
                 </button>
              </form>
           </div>
         </div>
      )}
    </div>
  );
};

export default ProgressTracker;